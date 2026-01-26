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
  getDateCreated,
  getTitle,
} from './frontmatter-parser.js';
import { parseHighlightsFromNote } from './highlight-parser.js';

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
    } catch {
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

      const note: LiteratureNote = {
        id,
        title: getTitle(frontmatter, basename(notePath)),
        source: resolvedSource,
        sourceRelative: sourcePath, // Keep the original relative path for wiki-links
        sourceType,
        filePath: resolvedSource,
        notePath,
        progress: getProgress(frontmatter, this.config.progress_key),
        lastRead: getLastRead(frontmatter, this.config.last_read_key),
        dateCreated: getDateCreated(frontmatter, this.config.date_created_key),
        tags: this.extractTags(frontmatter),
        cover: this.getCoverPath(frontmatter, id),
        highlights,
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
    const attachmentFolders = ['attachments', 'assets', 'files', '_attachments'];
    for (const folder of attachmentFolders) {
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
    return createHash('sha256').update(relativePath).digest('hex').slice(0, 12);
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

  getSummaries(sort: 'lastRead' | 'title' | 'progress' | 'dateCreated' = 'lastRead', order: 'asc' | 'desc' = 'desc'): LiteratureNoteSummary[] {
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
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return sorted.map(note => ({
      id: note.id,
      title: note.title,
      sourceType: note.sourceType,
      progress: note.progress,
      lastRead: note.lastRead,
      dateCreated: note.dateCreated,
      cover: note.cover,
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
