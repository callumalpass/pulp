import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import EPub from 'epub2';
import type { Config } from '../config/schema.js';
import type { LiteratureNote } from '@pulp/shared';
import { buildPdfDocumentOptions, toUint8ArrayView } from './pdfjs-options.js';

export interface SearchResult {
  noteId: string;
  title: string;
  sourceType: 'pdf' | 'epub';
  matches: SearchMatch[];
  totalMatches: number;
}

export interface SearchMatch {
  text: string;           // The matched text with context
  page?: number;          // Page number for PDFs
  pageLabel?: string;     // Page label for PDFs (e.g., "iv", "12")
  chapter?: string;       // Chapter title for EPUBs
  chapterHref?: string;   // Chapter href for navigation
  position: number;       // Character position in document (for sorting)
}

interface IndexedDocument {
  noteId: string;
  title: string;
  sourceType: 'pdf' | 'epub';
  pages: IndexedPage[];
  indexedAt: number;
}

interface IndexedPage {
  pageNum?: number;
  pageLabel?: string;
  chapter?: string;
  chapterHref?: string;
  text: string;
  position: number;
}

interface IndexCache {
  version: number;
  documents: Record<string, IndexedDocument>;
}

/** Schema version for the search index cache - increment when format changes */
const INDEX_VERSION = 1;

/** Characters of context to show around search matches */
const SEARCH_CONTEXT_CHARS = 80;

/** Maximum matches to collect per document before stopping */
const MAX_MATCHES_PER_DOCUMENT = 50;

/** Maximum matches to return per document in search results */
const SEARCH_RESULTS_PER_DOCUMENT = 10;

/** Debounce delay for cache saves (milliseconds) */
const CACHE_SAVE_DEBOUNCE_MS = 1000;

/** Yield to event loop every N pages during PDF indexing */
const PDF_YIELD_INTERVAL = 5;

/** Yield to event loop every N chapters during EPUB indexing */
const EPUB_YIELD_INTERVAL = 3;

/** Timeout for indexing a single document (milliseconds) */
const INDEX_TIMEOUT_MS = 60000;

/** Maximum PDF size to index (bytes) - avoids OOM on very large files */
const MAX_INDEXABLE_PDF_BYTES = 200 * 1024 * 1024;

/** Maximum normalized text characters stored per page/chapter segment */
const MAX_TEXT_CHARS_PER_SEGMENT = 2000;

/** Maximum normalized text characters stored per document */
const MAX_TEXT_CHARS_PER_DOCUMENT = 120000;

/** Stop background indexing before the process gets near V8 heap ceiling */
const INDEXING_HEAP_WATERMARK_BYTES = 1500 * 1024 * 1024;

/** Skip loading oversized cache files to avoid startup OOM */
const MAX_INDEX_CACHE_FILE_BYTES = 150 * 1024 * 1024;

// Helper to yield to event loop - prevents blocking server
const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

// Helper to wrap a promise with a timeout
function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export class SearchIndex {
  private cacheDir: string;
  private cacheFile: string;
  private cacheTempFile: string;
  private index: IndexCache;
  private indexingInProgress: Set<string> = new Set();
  private savePending = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveInFlight: Promise<void> | null = null;
  private readonly searchContextChars: number;
  private readonly maxMatchesPerDoc: number;
  private readonly resultsPerDoc: number;

  constructor(config: Config) {
    this.cacheDir = join(config.library_path, '.pulp-cache', 'search');
    this.cacheFile = join(this.cacheDir, 'index.json');
    this.cacheTempFile = join(this.cacheDir, 'index.json.tmp');
    // Use config values with fallbacks to default constants
    this.searchContextChars = config.search_context_chars ?? SEARCH_CONTEXT_CHARS;
    this.maxMatchesPerDoc = config.search_max_matches_per_doc ?? MAX_MATCHES_PER_DOCUMENT;
    this.resultsPerDoc = config.search_results_per_doc ?? SEARCH_RESULTS_PER_DOCUMENT;
    this.ensureCacheDir();
    this.index = this.loadCache();
  }

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadCache(): IndexCache {
    try {
      if (existsSync(this.cacheFile)) {
        const cacheFileSize = statSync(this.cacheFile).size;
        if (cacheFileSize > MAX_INDEX_CACHE_FILE_BYTES) {
          console.warn(
            `Search index cache too large to load safely (${cacheFileSize} bytes); starting with empty index`
          );
          return { version: INDEX_VERSION, documents: {} };
        }

        const data = JSON.parse(readFileSync(this.cacheFile, 'utf-8'));
        if (data.version === INDEX_VERSION) {
          return data;
        }
      }
    } catch (error) {
      console.error('Failed to load search index cache:', error);
    }
    return { version: INDEX_VERSION, documents: {} };
  }

  // Non-blocking save with debouncing
  private saveCache(): void {
    if (this.savePending) return;
    this.savePending = true;

    // Debounce saves to avoid excessive disk I/O
    this.saveTimer = setTimeout(() => {
      this.savePending = false;
      this.saveTimer = null;
      this.saveInFlight = this.writeCacheToDisk();
      this.saveInFlight.finally(() => {
        this.saveInFlight = null;
      });
    }, CACHE_SAVE_DEBOUNCE_MS);
  }

  private async writeCacheToDisk(): Promise<void> {
    try {
      const serialized = JSON.stringify(this.index, null, 2);
      // Atomic save: write to temp file then rename
      await writeFile(this.cacheTempFile, serialized);
      await rename(this.cacheTempFile, this.cacheFile);
    } catch (error) {
      console.error('Failed to save search index cache:', error);
    }
  }

  async flushCache(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      this.savePending = false;
    }

    if (this.saveInFlight) {
      await this.saveInFlight;
      return;
    }

    await this.writeCacheToDisk();
  }

  async indexNote(note: LiteratureNote): Promise<void> {
    // Skip if already indexing
    if (this.indexingInProgress.has(note.id)) {
      return;
    }

    // Check if already indexed
    const existing = this.index.documents[note.id];
    if (existing && existing.indexedAt > 0) {
      return;
    }

    this.indexingInProgress.add(note.id);

    try {
      console.log(`Indexing: ${note.title}`);

      const extractionPromise = note.sourceType === 'pdf'
        ? this.extractPDFText(note.filePath)
        : this.extractEPUBText(note.filePath);

      // Wrap extraction with timeout to prevent hanging on problematic files
      const pages: IndexedPage[] = await withTimeout(
        extractionPromise,
        INDEX_TIMEOUT_MS,
        `Indexing ${note.title}`
      );

      this.index.documents[note.id] = {
        noteId: note.id,
        title: note.title,
        sourceType: note.sourceType,
        pages,
        indexedAt: Date.now(),
      };

      this.saveCache();
      console.log(`Indexed: ${note.title} (${pages.length} pages/chapters)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to index ${note.title}: ${errorMessage}`);
    } finally {
      this.indexingInProgress.delete(note.id);
    }
  }

  private async extractPDFText(pdfPath: string): Promise<IndexedPage[]> {
    const pages: IndexedPage[] = [];
    let position = 0;
    let totalChars = 0;
    let pdf: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> | null = null;

    try {
      const fileStats = await stat(pdfPath);
      if (fileStats.size > MAX_INDEXABLE_PDF_BYTES) {
        console.warn(
          `Skipping PDF text indexing for oversized file (${fileStats.size} bytes): ${pdfPath}`
        );
        return pages;
      }

      // Use async file read to avoid blocking
      const buffer = await readFile(pdfPath);
      const data = toUint8ArrayView(buffer);

      pdf = await pdfjsLib.getDocument(buildPdfDocumentOptions(data)).promise;
      const pageLabels = await pdf.getPageLabels();

      for (let i = 1; i <= pdf.numPages; i++) {
        if (totalChars >= MAX_TEXT_CHARS_PER_DOCUMENT) {
          break;
        }

        // Yield to event loop periodically to keep server responsive
        if (i % PDF_YIELD_INTERVAL === 0) {
          await yieldToEventLoop();
        }

        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          // Build text incrementally and cap early to keep memory bounded.
          const rawParts: string[] = [];
          let rawLength = 0;
          const rawLimit = MAX_TEXT_CHARS_PER_SEGMENT * 2;
          for (const item of textContent.items) {
            const value = 'str' in item ? item.str : '';
            if (!value) continue;
            rawParts.push(value);
            rawLength += value.length + 1;
            if (rawLength >= rawLimit) break;
          }

          const normalized = rawParts.join(' ').replace(/\s+/g, ' ').trim();
          const remainingChars = MAX_TEXT_CHARS_PER_DOCUMENT - totalChars;
          const segmentLimit = Math.min(MAX_TEXT_CHARS_PER_SEGMENT, remainingChars);
          const text = normalized.slice(0, segmentLimit);

          if (text.length > 0 && remainingChars > 0) {
            pages.push({
              pageNum: i,
              pageLabel: pageLabels?.[i - 1] || undefined,
              text,
              position,
            });
            position += text.length;
            totalChars += text.length;
          }

          if (typeof page.cleanup === 'function') {
            page.cleanup();
          }
        } catch (pageError) {
          console.error(`Error extracting page ${i}:`, pageError);
        }
      }
    } catch (error) {
      console.error('PDF text extraction failed:', error);
    } finally {
      if (pdf) {
        try {
          await pdf.destroy();
        } catch (destroyError) {
          console.warn('Failed to cleanup PDF document after text extraction:', destroyError);
        }
      }
    }

    return pages;
  }

  private async extractEPUBText(epubPath: string): Promise<IndexedPage[]> {
    return new Promise((resolve) => {
      const pages: IndexedPage[] = [];
      let position = 0;
      let totalChars = 0;

      try {
        const epub = new EPub(epubPath);

        epub.on('end', async () => {
          try {
            // Get the reading order (spine)
            const spine = epub.flow || [];

            // Build chapter title map from TOC
            const chapterTitles = new Map<string, string>();
            const processNavItem = (item: { href?: string; title?: string; subitems?: unknown[] }) => {
              if (item.href && item.title) {
                // Remove fragment from href
                const baseHref = item.href.split('#')[0];
                chapterTitles.set(baseHref, item.title);
              }
              if (item.subitems) {
                (item.subitems as typeof item[]).forEach(processNavItem);
              }
            };
            (epub.toc || []).forEach(processNavItem);

            // Extract text from each chapter with yielding
            let chapterCount = 0;
            for (const item of spine) {
              if (!item.id) continue;
              if (totalChars >= MAX_TEXT_CHARS_PER_DOCUMENT) {
                break;
              }

              // Yield periodically to keep server responsive
              if (++chapterCount % EPUB_YIELD_INTERVAL === 0) {
                await yieldToEventLoop();
              }

              try {
                const chapter = await this.getChapterText(epub, item.id);
                if (chapter && chapter.length > 0) {
                  const remainingChars = MAX_TEXT_CHARS_PER_DOCUMENT - totalChars;
                  const segmentLimit = Math.min(MAX_TEXT_CHARS_PER_SEGMENT, remainingChars);
                  const text = chapter.slice(0, segmentLimit);
                  if (!text) {
                    continue;
                  }

                  const href = (epub.manifest[item.id] as { href?: string })?.href || '';
                  const baseHref = href.split('#')[0];
                  const chapterTitle = chapterTitles.get(baseHref) || baseHref;

                  pages.push({
                    chapter: chapterTitle,
                    chapterHref: href,
                    text,
                    position,
                  });
                  position += text.length;
                  totalChars += text.length;
                }
              } catch (chapterError) {
                // Log the error but continue with other chapters
                console.warn(`Failed to extract chapter ${item.id} from EPUB:`, chapterError);
              }
            }

            resolve(pages);
          } catch (error) {
            console.error('EPUB processing error:', error);
            resolve(pages);
          }
        });

        epub.on('error', (error) => {
          console.error('EPUB parse error:', error);
          resolve(pages);
        });

        epub.parse();
      } catch (error) {
        console.error('EPUB initialization error:', error);
        resolve(pages);
      }
    });
  }

  private getChapterText(epub: EPub, chapterId: string): Promise<string> {
    return new Promise((resolve) => {
      epub.getChapter(chapterId, (error, text) => {
        if (error || !text) {
          resolve('');
          return;
        }

        // Strip HTML tags and normalize whitespace
        const plainText = text
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#\d+;/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        resolve(plainText);
      });
    });
  }

  search(query: string, noteIds?: string[]): SearchResult[] {
    if (!query.trim()) return [];

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    // Search through indexed documents
    for (const [noteId, doc] of Object.entries(this.index.documents)) {
      // Filter by noteIds if provided
      if (noteIds && !noteIds.includes(noteId)) continue;

      const matches: SearchMatch[] = [];

      for (const page of doc.pages) {
        const lowerText = page.text.toLowerCase();
        let searchStart = 0;

        // Find all occurrences of the query
        while (true) {
          const matchIndex = lowerText.indexOf(lowerQuery, searchStart);
          if (matchIndex === -1) break;

          // Extract context around the match
          const contextStart = Math.max(0, matchIndex - this.searchContextChars);
          const contextEnd = Math.min(page.text.length, matchIndex + query.length + this.searchContextChars);

          let contextText = page.text.slice(contextStart, contextEnd);

          // Add ellipsis if truncated
          if (contextStart > 0) contextText = '...' + contextText;
          if (contextEnd < page.text.length) contextText = contextText + '...';

          matches.push({
            text: contextText,
            page: page.pageNum,
            pageLabel: page.pageLabel,
            chapter: page.chapter,
            chapterHref: page.chapterHref,
            position: page.position + matchIndex,
          });

          searchStart = matchIndex + 1;

          // Limit matches per document to avoid overwhelming results
          if (matches.length >= this.maxMatchesPerDoc) break;
        }

        if (matches.length >= this.maxMatchesPerDoc) break;
      }

      if (matches.length > 0) {
        results.push({
          noteId,
          title: doc.title,
          sourceType: doc.sourceType,
          matches: matches.slice(0, this.resultsPerDoc),
          totalMatches: matches.length,
        });
      }
    }

    // Sort by total matches (most matches first)
    results.sort((a, b) => b.totalMatches - a.totalMatches);

    return results;
  }

  isIndexed(noteId: string): boolean {
    return !!this.index.documents[noteId];
  }

  getIndexedCount(): number {
    return Object.keys(this.index.documents).length;
  }

  async indexAllNotes(notes: LiteratureNote[]): Promise<void> {
    console.log(`Starting to index ${notes.length} documents...`);

    // Index one at a time with yielding between each to keep server responsive
    for (let i = 0; i < notes.length; i++) {
      const heapUsed = process.memoryUsage().heapUsed;
      if (heapUsed >= INDEXING_HEAP_WATERMARK_BYTES) {
        console.warn(
          `Pausing background indexing at ${Math.round(heapUsed / (1024 * 1024))}MB heap usage`
        );
        break;
      }

      await this.indexNote(notes[i]);
      // Yield after each document to ensure server stays responsive
      await yieldToEventLoop();
    }

    console.log(`Indexing complete. ${this.getIndexedCount()} documents indexed.`);
  }

  invalidateIndex(noteId: string): void {
    if (this.index.documents[noteId]) {
      delete this.index.documents[noteId];
      this.saveCache();
    }
  }

  clearIndex(): void {
    this.index = { version: INDEX_VERSION, documents: {} };
    this.saveCache();
  }
}
