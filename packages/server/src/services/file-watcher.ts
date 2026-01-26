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

  constructor(private config: Config) {
    super();
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

    // Check if it's a literature note (for added/changed)
    if (type !== 'removed') {
      try {
        const { frontmatter } = parseNoteFrontmatter(path);
        isLiteratureNote = hasTag(frontmatter, this.config.literature_note_tag);
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
