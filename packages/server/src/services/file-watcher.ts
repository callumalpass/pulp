import { watch, type FSWatcher } from 'chokidar';
import { EventEmitter } from 'node:events';
import { basename } from 'node:path';
import type { Config } from '../config/schema.js';
import { parseNoteFrontmatter, hasTag } from './frontmatter-parser.js';

export interface FileEvent {
  type: 'changed' | 'added' | 'removed';
  path: string;
  isLiteratureNote: boolean;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly debounceMs = 500;
  // Track known literature note paths so we can detect removals
  private knownLiteratureNotes: Set<string> = new Set();

  constructor(private config: Config) {
    super();
  }

  /**
   * Register a path as a known literature note.
   * Called by the scanner when notes are discovered.
   */
  trackLiteratureNote(path: string): void {
    this.knownLiteratureNotes.add(path);
  }

  /**
   * Unregister a path from known literature notes.
   */
  untrackLiteratureNote(path: string): void {
    this.knownLiteratureNotes.delete(path);
  }

  /**
   * Bulk update known literature notes (called after scanner refresh).
   */
  updateKnownLiteratureNotes(paths: string[]): void {
    this.knownLiteratureNotes = new Set(paths);
  }

  start(): void {
    if (this.watcher) return;

    console.log(`Watching for changes in: ${this.config.library_path}`);

    this.watcher = watch(this.config.library_path, {
      ignored: [
        /(^|[\/\\])\../,  // Ignore dotfiles
        /node_modules/,
        /.git/,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('change', (path) => this.handleFileEvent('changed', path))
      .on('add', (path) => this.handleFileEvent('added', path))
      .on('unlink', (path) => this.handleFileEvent('removed', path))
      .on('error', (error) => console.error('Watcher error:', error));
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear all pending timers
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
  }

  private handleFileEvent(type: 'changed' | 'added' | 'removed', path: string): void {
    // Only watch markdown files
    if (!path.endsWith('.md')) return;

    // Debounce rapid changes
    const existing = this.debounceTimers.get(path);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(path);
      this.processFileEvent(type, path);
    }, this.debounceMs);

    this.debounceTimers.set(path, timer);
  }

  private processFileEvent(type: 'changed' | 'added' | 'removed', path: string): void {
    let isLiteratureNote = false;

    if (type === 'removed') {
      // For removed events, check our tracked set of known literature notes
      // since we can't read the file anymore
      isLiteratureNote = this.knownLiteratureNotes.has(path);
      if (isLiteratureNote) {
        this.knownLiteratureNotes.delete(path);
      }
    } else {
      // For added/changed events, parse the frontmatter
      try {
        const { frontmatter } = parseNoteFrontmatter(path);
        isLiteratureNote = hasTag(frontmatter, this.config.literature_note_tag);

        // Update tracking
        if (isLiteratureNote) {
          this.knownLiteratureNotes.add(path);
        } else {
          this.knownLiteratureNotes.delete(path);
        }
      } catch {
        // File might have been deleted between event and check
        return;
      }
    }

    const event: FileEvent = {
      type,
      path,
      isLiteratureNote,
    };

    console.log(`File ${type}: ${basename(path)}${isLiteratureNote ? ' (literature note)' : ''}`);
    this.emit('file', event);
  }
}
