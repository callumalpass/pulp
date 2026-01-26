import { readdirSync, statSync } from 'node:fs';
import { join, basename, extname, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { LiteratureNote, LiteratureNoteSummary } from '@pulp/shared';
import type { Config } from '../config/schema.js';
import {
  parseNoteFrontmatter,
  hasTag,
  getSourcePath,
  getProgress,
  getLastRead,
  getLastOpenedCfi,
  getDateCreated,
  getDateFinished,
  getCollections,
  getTitle,
  getBookmarks,
  getPinned,
  getPaused,
  getPausedAt,
  getReadingStats,
  getAuthor,
  getRating,
  getTotalPages,
  getReaderPreferences,
  getCurrentChapter,
  getBookNotes,
} from './frontmatter-parser.js';
import { parseHighlightsFromNote } from './highlight-parser.js';

/** Length of generated note IDs (characters from SHA256 hash) */
const NOTE_ID_LENGTH = 12;

/** Common attachment folder names to search for source files */
const ATTACHMENT_FOLDERS = ['attachments', 'assets', 'files', '_attachments'];

export class LibraryScanner {
  private notes: Map<string, LiteratureNote> = new Map();

  constructor(private config: Config) {}

  scan(): void {
    this.notes.clear();
    this.scanDirectory(this.config.library_path);
    console.log(`Found ${this.notes.size} literature notes`);
  }

  private scanDirectory(dirPath: string): void {
    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
      // Log permission errors or other issues (but not for expected missing directories)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('ENOENT')) {
        console.warn(`Unable to scan directory ${dirPath}: ${errorMessage}`);
      }
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      // Skip hidden files/directories
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        // Skip excluded folders
        if (this.isExcluded(fullPath)) continue;
        this.scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        this.processNote(fullPath);
      }
    }
  }

  private isExcluded(dirPath: string): boolean {
    const relativePath = dirPath.replace(this.config.library_path, '').replace(/^\//, '');
    return this.config.exclude_folders.some(excluded =>
      relativePath === excluded || relativePath.startsWith(excluded + '/')
    );
  }

  private processNote(notePath: string): void {
    try {
      const { frontmatter } = parseNoteFrontmatter(notePath);

      // Check if it has the literature note tag
      if (!hasTag(frontmatter, this.config.literature_note_tag)) {
        return;
      }

      // Get source path
      const sourcePath = getSourcePath(frontmatter, this.config.source_key);
      if (!sourcePath) {
        console.warn(`Note missing source: ${notePath}`);
        return;
      }

      // Determine source type
      const ext = extname(sourcePath).toLowerCase();
      const sourceType = ext === '.epub' ? 'epub' : ext === '.pdf' ? 'pdf' : null;
      if (!sourceType) {
        console.warn(`Unsupported source type ${ext}: ${notePath}`);
        return;
      }

      // Resolve source path relative to note directory
      const resolvedSource = this.resolveSourcePath(sourcePath, notePath);
      if (!resolvedSource) {
        console.warn(`Source file not found: ${sourcePath} (from ${notePath})`);
        return;
      }

      // Generate stable ID from note path
      const id = this.generateId(notePath);

      // Parse existing highlights from the note
      const highlights = parseHighlightsFromNote(notePath, sourcePath);

      // Parse bookmarks from frontmatter
      const bookmarks = getBookmarks(frontmatter, this.config.bookmarks_key);

      const note: LiteratureNote = {
        id,
        title: getTitle(frontmatter, basename(notePath)),
        author: getAuthor(frontmatter, this.config.author_key),
        source: resolvedSource,
        sourceRelative: sourcePath, // Keep the original relative path for wiki-links
        sourceType,
        filePath: resolvedSource,
        notePath,
        progress: getProgress(frontmatter, this.config.progress_key),
        lastRead: getLastRead(frontmatter, this.config.last_read_key),
        lastOpenedCfi: sourceType === 'epub' ? getLastOpenedCfi(frontmatter, this.config.last_opened_cfi_key) : null,
        dateCreated: getDateCreated(frontmatter, this.config.date_created_key),
        dateFinished: getDateFinished(frontmatter, this.config.date_finished_key),
        collections: getCollections(frontmatter, this.config.collections_key),
        tags: this.extractTags(frontmatter),
        cover: this.getCoverPath(frontmatter, id),
        highlights,
        bookmarks,
        pinned: getPinned(frontmatter, this.config.pinned_key),
        paused: getPaused(frontmatter, this.config.paused_key),
        pausedAt: getPausedAt(frontmatter, this.config.paused_at_key),
        rating: getRating(frontmatter, this.config.rating_key),
        readingStats: getReadingStats(frontmatter, this.config.reading_stats_key),
        totalPages: getTotalPages(frontmatter, this.config.total_pages_key),
        readerPreferences: getReaderPreferences(frontmatter, this.config.reader_preferences_key),
        currentChapter: getCurrentChapter(frontmatter, this.config.current_chapter_key),
        bookNotes: getBookNotes(frontmatter, this.config.book_notes_key),
        frontmatter,
      };

      this.notes.set(id, note);
    } catch (error) {
      console.error(`Error processing note ${notePath}:`, error);
    }
  }

  private resolveSourcePath(sourcePath: string, notePath: string): string | null {
    // Try relative to note first
    const noteDir = dirname(notePath);
    const relativePath = resolve(noteDir, sourcePath);
    if (this.fileExists(relativePath)) {
      return relativePath;
    }

    // Try relative to vault root
    const vaultPath = resolve(this.config.library_path, sourcePath);
    if (this.fileExists(vaultPath)) {
      return vaultPath;
    }

    // Try with common attachment folders
    for (const folder of ATTACHMENT_FOLDERS) {
      const attachmentPath = resolve(this.config.library_path, folder, sourcePath);
      if (this.fileExists(attachmentPath)) {
        return attachmentPath;
      }
    }

    return null;
  }

  private fileExists(path: string): boolean {
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  }

  private generateId(notePath: string): string {
    // Create a stable, short ID from the note path relative to vault
    const relativePath = notePath.replace(this.config.library_path, '');
    return createHash('sha256').update(relativePath).digest('hex').slice(0, NOTE_ID_LENGTH);
  }

  private extractTags(frontmatter: Record<string, unknown>): string[] {
    const tags = frontmatter.tags;

    if (!tags) return [];

    if (Array.isArray(tags)) {
      return tags.map(t => String(t).replace(/^#/, ''));
    }

    if (typeof tags === 'string') {
      return tags.split(',').map(t => t.trim().replace(/^#/, ''));
    }

    return [];
  }

  private getCoverPath(frontmatter: Record<string, unknown>, id: string): string | null {
    // Check frontmatter for explicit cover
    if (typeof frontmatter.cover === 'string') {
      return frontmatter.cover;
    }

    // Will check cache directory for extracted covers
    return `/api/covers/${id}`;
  }

  getAll(): LiteratureNote[] {
    return Array.from(this.notes.values());
  }

  getSummaries(sort: 'lastRead' | 'title' | 'progress' | 'dateCreated' | 'author' | 'rating' = 'lastRead', order: 'asc' | 'desc' = 'desc'): LiteratureNoteSummary[] {
    const notes = this.getAll();

    const sorted = notes.sort((a, b) => {
      let comparison = 0;

      switch (sort) {
        case 'lastRead':
          const aLastRead = a.lastRead ? new Date(a.lastRead).getTime() : 0;
          const bLastRead = b.lastRead ? new Date(b.lastRead).getTime() : 0;
          comparison = aLastRead - bLastRead;
          break;
        case 'dateCreated':
          const aCreated = a.dateCreated ? new Date(a.dateCreated).getTime() : 0;
          const bCreated = b.dateCreated ? new Date(b.dateCreated).getTime() : 0;
          comparison = aCreated - bCreated;
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'progress':
          comparison = a.progress - b.progress;
          break;
        case 'author':
          // Sort by author, with null/empty authors at the end
          const aAuthor = a.author || '';
          const bAuthor = b.author || '';
          if (!aAuthor && bAuthor) comparison = 1;
          else if (aAuthor && !bAuthor) comparison = -1;
          else comparison = aAuthor.localeCompare(bAuthor);
          break;
        case 'rating':
          // Sort by rating, with unrated items always at the end (regardless of order)
          const aRating = a.rating ?? 0;
          const bRating = b.rating ?? 0;
          if (aRating === 0 && bRating > 0) return 1;  // null always at end
          if (aRating > 0 && bRating === 0) return -1; // null always at end
          comparison = aRating - bRating;
          break;
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return sorted.map(note => ({
      id: note.id,
      title: note.title,
      author: note.author,
      citekey: typeof note.frontmatter.id === 'string' ? note.frontmatter.id : null,
      sourceType: note.sourceType,
      progress: note.progress,
      lastRead: note.lastRead,
      dateCreated: note.dateCreated,
      dateFinished: note.dateFinished,
      yearCompleted: note.dateFinished ? new Date(note.dateFinished).getFullYear() : null,
      cover: note.cover,
      pinned: note.pinned,
      paused: note.paused,
      pausedAt: note.pausedAt,
      rating: note.rating,
      readingStats: note.readingStats,
      totalPages: note.totalPages,
      highlightCount: note.highlights.length,
      collections: note.collections,
      currentChapter: note.currentChapter,
    }));
  }

  getById(id: string): LiteratureNote | undefined {
    return this.notes.get(id);
  }

  refresh(): void {
    this.scan();
  }

  updateNote(id: string, updates: Partial<LiteratureNote>): void {
    const note = this.notes.get(id);
    if (note) {
      Object.assign(note, updates);
    }
  }
}
