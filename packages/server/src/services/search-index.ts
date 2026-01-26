import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import EPub from 'epub2';
import type { Config } from '../config/schema.js';
import type { LiteratureNote } from '@pulp/shared';

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

const INDEX_VERSION = 1;
const CONTEXT_CHARS = 80; // Characters of context around match

// Helper to yield to event loop - prevents blocking server
const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

export class SearchIndex {
  private cacheDir: string;
  private cacheFile: string;
  private index: IndexCache;
  private indexingInProgress: Set<string> = new Set();
  private savePending = false;

  constructor(config: Config) {
    this.cacheDir = join(config.library_path, '.pulp-cache', 'search');
    this.cacheFile = join(this.cacheDir, 'index.json');
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
    setTimeout(async () => {
      this.savePending = false;
      try {
        await writeFile(this.cacheFile, JSON.stringify(this.index, null, 2));
      } catch (error) {
        console.error('Failed to save search index cache:', error);
      }
    }, 1000);
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

      const pages: IndexedPage[] = note.sourceType === 'pdf'
        ? await this.extractPDFText(note.filePath)
        : await this.extractEPUBText(note.filePath);

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
      console.error(`Failed to index ${note.title}:`, error);
    } finally {
      this.indexingInProgress.delete(note.id);
    }
  }

  private async extractPDFText(pdfPath: string): Promise<IndexedPage[]> {
    const pages: IndexedPage[] = [];
    let position = 0;

    try {
      // Use async file read to avoid blocking
      const buffer = await readFile(pdfPath);
      const data = new Uint8Array(buffer);

      const pdf = await pdfjsLib.getDocument({ data }).promise;
      const pageLabels = await pdf.getPageLabels();

      for (let i = 1; i <= pdf.numPages; i++) {
        // Yield to event loop every 5 pages to keep server responsive
        if (i % 5 === 0) {
          await yieldToEventLoop();
        }

        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          const text = textContent.items
            .map(item => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (text.length > 0) {
            pages.push({
              pageNum: i,
              pageLabel: pageLabels?.[i - 1] || undefined,
              text,
              position,
            });
            position += text.length;
          }
        } catch (pageError) {
          console.error(`Error extracting page ${i}:`, pageError);
        }
      }

      await pdf.destroy();
    } catch (error) {
      console.error('PDF text extraction failed:', error);
    }

    return pages;
  }

  private async extractEPUBText(epubPath: string): Promise<IndexedPage[]> {
    return new Promise((resolve) => {
      const pages: IndexedPage[] = [];
      let position = 0;

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

              // Yield every 3 chapters to keep server responsive
              if (++chapterCount % 3 === 0) {
                await yieldToEventLoop();
              }

              try {
                const chapter = await this.getChapterText(epub, item.id);
                if (chapter && chapter.length > 0) {
                  const href = (epub.manifest[item.id] as { href?: string })?.href || '';
                  const baseHref = href.split('#')[0];
                  const chapterTitle = chapterTitles.get(baseHref) || baseHref;

                  pages.push({
                    chapter: chapterTitle,
                    chapterHref: href,
                    text: chapter,
                    position,
                  });
                  position += chapter.length;
                }
              } catch {
                // Skip problematic chapters
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
          const contextStart = Math.max(0, matchIndex - CONTEXT_CHARS);
          const contextEnd = Math.min(page.text.length, matchIndex + query.length + CONTEXT_CHARS);

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
          if (matches.length >= 50) break;
        }

        if (matches.length >= 50) break;
      }

      if (matches.length > 0) {
        results.push({
          noteId,
          title: doc.title,
          sourceType: doc.sourceType,
          matches: matches.slice(0, 10), // Return top 10 matches per document
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
