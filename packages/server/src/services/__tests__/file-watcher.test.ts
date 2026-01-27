import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Config } from '../../config/schema.js';
import type { FileEvent } from '../file-watcher.js';

// Mock chokidar
const mockWatcherInstance = {
  on: vi.fn(),
  close: vi.fn(),
};
// .on() returns itself for chaining
mockWatcherInstance.on.mockReturnValue(mockWatcherInstance);

vi.mock('chokidar', () => ({
  watch: vi.fn(() => mockWatcherInstance),
}));

// Mock frontmatter-parser
vi.mock('../frontmatter-parser.js', () => ({
  parseNoteFrontmatter: vi.fn(),
  hasTag: vi.fn(),
}));

import { watch } from 'chokidar';
import * as frontmatterParser from '../frontmatter-parser.js';
import { FileWatcher } from '../file-watcher.js';

const mockWatch = vi.mocked(watch);
const mockParseNoteFrontmatter = vi.mocked(frontmatterParser.parseNoteFrontmatter);
const mockHasTag = vi.mocked(frontmatterParser.hasTag);

function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    library_path: '/test/vault',
    literature_note_tag: 'literature-note',
    source_key: 'source',
    progress_key: 'reading_progress',
    last_read_key: 'last_read',
    last_opened_cfi_key: 'last_opened_cfi',
    date_created_key: 'dateCreated',
    date_finished_key: 'date_finished',
    collections_key: 'collections',
    bookmarks_key: 'bookmarks',
    pinned_key: 'pinned',
    reading_stats_key: 'reading_stats',
    author_key: 'author',
    rating_key: 'rating',
    total_pages_key: 'total_pages',
    reader_preferences_key: 'reader_preferences',
    current_chapter_key: 'current_chapter',
    book_notes_key: 'book_notes',
    exclude_folders: ['.obsidian', '.trash', 'templates'],
    highlight_template: '',
    highlight_template_epub: '',
    progress_debounce_ms: 5000,
    search_context_chars: 80,
    search_max_matches_per_doc: 50,
    search_results_per_doc: 10,
    reading_history_max_days: 90,
    cover_width: 300,
    cover_height: 450,
    cover_quality: 80,
    default_daily_goal_minutes: 30,
    default_grace_period_days: 1,
    reading_history_key: 'reading_history',
    reading_sessions_key: 'reading_sessions',
    paused_key: 'paused',
    paused_at_key: 'paused_at',
    ...overrides,
  };
}

describe('FileWatcher', () => {
  let watcher: FileWatcher;
  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    config = createMockConfig();
    watcher = new FileWatcher(config);
  });

  afterEach(() => {
    watcher.stop();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('creates an instance as an EventEmitter', () => {
      expect(watcher).toBeInstanceOf(FileWatcher);
      expect(typeof watcher.on).toBe('function');
      expect(typeof watcher.emit).toBe('function');
    });
  });

  describe('trackLiteratureNote', () => {
    it('adds a path to known literature notes', () => {
      watcher.trackLiteratureNote('/test/vault/note.md');

      // Verify by triggering a removal event and checking isLiteratureNote
      watcher.start();
      const changeHandler = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'unlink'
      )![1] as (path: string) => void;

      const events: FileEvent[] = [];
      watcher.on('file', (event: FileEvent) => events.push(event));

      changeHandler('/test/vault/note.md');
      vi.advanceTimersByTime(500);

      expect(events).toHaveLength(1);
      expect(events[0].isLiteratureNote).toBe(true);
    });
  });

  describe('untrackLiteratureNote', () => {
    it('removes a path from known literature notes', () => {
      watcher.trackLiteratureNote('/test/vault/note.md');
      watcher.untrackLiteratureNote('/test/vault/note.md');

      watcher.start();
      const unlinkHandler = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'unlink'
      )![1] as (path: string) => void;

      const events: FileEvent[] = [];
      watcher.on('file', (event: FileEvent) => events.push(event));

      unlinkHandler('/test/vault/note.md');
      vi.advanceTimersByTime(500);

      expect(events).toHaveLength(1);
      expect(events[0].isLiteratureNote).toBe(false);
    });
  });

  describe('updateKnownLiteratureNotes', () => {
    it('replaces all known literature notes with new set', () => {
      watcher.trackLiteratureNote('/test/vault/old.md');
      watcher.updateKnownLiteratureNotes(['/test/vault/new.md']);

      watcher.start();
      const unlinkHandler = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'unlink'
      )![1] as (path: string) => void;

      const events: FileEvent[] = [];
      watcher.on('file', (event: FileEvent) => events.push(event));

      // Old path should no longer be tracked
      unlinkHandler('/test/vault/old.md');
      vi.advanceTimersByTime(500);
      expect(events[0].isLiteratureNote).toBe(false);

      // New path should be tracked
      unlinkHandler('/test/vault/new.md');
      vi.advanceTimersByTime(500);
      expect(events[1].isLiteratureNote).toBe(true);
    });

    it('handles empty array', () => {
      watcher.trackLiteratureNote('/test/vault/note.md');
      watcher.updateKnownLiteratureNotes([]);

      watcher.start();
      const unlinkHandler = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'unlink'
      )![1] as (path: string) => void;

      const events: FileEvent[] = [];
      watcher.on('file', (event: FileEvent) => events.push(event));

      unlinkHandler('/test/vault/note.md');
      vi.advanceTimersByTime(500);
      expect(events[0].isLiteratureNote).toBe(false);
    });
  });

  describe('start', () => {
    it('creates a chokidar watcher for the library path', () => {
      watcher.start();

      expect(mockWatch).toHaveBeenCalledWith(
        '/test/vault',
        expect.objectContaining({
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: expect.objectContaining({
            stabilityThreshold: 300,
            pollInterval: 100,
          }),
        })
      );
    });

    it('registers change, add, unlink, and error handlers', () => {
      watcher.start();

      const registeredEvents = mockWatcherInstance.on.mock.calls.map((call) => call[0]);
      expect(registeredEvents).toContain('change');
      expect(registeredEvents).toContain('add');
      expect(registeredEvents).toContain('unlink');
      expect(registeredEvents).toContain('error');
    });

    it('does not create a second watcher if already started', () => {
      watcher.start();
      watcher.start();

      expect(mockWatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('closes the watcher', () => {
      watcher.start();
      watcher.stop();

      expect(mockWatcherInstance.close).toHaveBeenCalled();
    });

    it('does nothing if watcher was never started', () => {
      watcher.stop();
      expect(mockWatcherInstance.close).not.toHaveBeenCalled();
    });

    it('clears pending debounce timers', () => {
      watcher.start();

      const changeHandler = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'change'
      )![1] as (path: string) => void;

      // Trigger an event but don't let it debounce
      changeHandler('/test/vault/note.md');

      // Stop should clear the pending timer
      watcher.stop();

      const events: FileEvent[] = [];
      watcher.on('file', (event: FileEvent) => events.push(event));

      // Advance past debounce - should not emit since timer was cleared
      vi.advanceTimersByTime(1000);
      expect(events).toHaveLength(0);
    });

    it('allows restarting after stop', () => {
      watcher.start();
      watcher.stop();

      // Reset mock to track new calls
      mockWatch.mockClear();
      mockWatcherInstance.on.mockClear();
      mockWatcherInstance.on.mockReturnValue(mockWatcherInstance);

      watcher.start();
      expect(mockWatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('file event handling', () => {
    let changeHandler: (path: string) => void;
    let addHandler: (path: string) => void;
    let unlinkHandler: (path: string) => void;

    beforeEach(() => {
      watcher.start();
      changeHandler = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'change'
      )![1] as (path: string) => void;
      addHandler = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'add'
      )![1] as (path: string) => void;
      unlinkHandler = mockWatcherInstance.on.mock.calls.find(
        (call) => call[0] === 'unlink'
      )![1] as (path: string) => void;
    });

    describe('filtering', () => {
      it('ignores non-markdown files', () => {
        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        changeHandler('/test/vault/image.png');
        addHandler('/test/vault/data.json');
        unlinkHandler('/test/vault/styles.css');

        vi.advanceTimersByTime(1000);
        expect(events).toHaveLength(0);
      });

      it('processes .md files', () => {
        mockParseNoteFrontmatter.mockReturnValue({ frontmatter: {}, content: '' });
        mockHasTag.mockReturnValue(false);

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(events).toHaveLength(1);
      });
    });

    describe('debouncing', () => {
      it('debounces rapid changes to the same file', () => {
        mockParseNoteFrontmatter.mockReturnValue({ frontmatter: {}, content: '' });
        mockHasTag.mockReturnValue(false);

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        // Rapid changes within debounce window
        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(200);
        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(200);
        changeHandler('/test/vault/note.md');

        // Only advance past the last debounce
        vi.advanceTimersByTime(500);

        expect(events).toHaveLength(1);
      });

      it('does not debounce changes to different files', () => {
        mockParseNoteFrontmatter.mockReturnValue({ frontmatter: {}, content: '' });
        mockHasTag.mockReturnValue(false);

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        changeHandler('/test/vault/note1.md');
        changeHandler('/test/vault/note2.md');

        vi.advanceTimersByTime(500);

        expect(events).toHaveLength(2);
      });

      it('uses 500ms debounce delay', () => {
        mockParseNoteFrontmatter.mockReturnValue({ frontmatter: {}, content: '' });
        mockHasTag.mockReturnValue(false);

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        changeHandler('/test/vault/note.md');

        // Just before debounce fires
        vi.advanceTimersByTime(499);
        expect(events).toHaveLength(0);

        // Exactly at debounce time
        vi.advanceTimersByTime(1);
        expect(events).toHaveLength(1);
      });
    });

    describe('changed events', () => {
      it('emits file event with type changed for literature notes', () => {
        mockParseNoteFrontmatter.mockReturnValue({
          frontmatter: { tags: ['literature-note'] },
          content: '',
        });
        mockHasTag.mockReturnValue(true);

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'changed',
          path: '/test/vault/note.md',
          isLiteratureNote: true,
        });
      });

      it('emits file event with isLiteratureNote false for non-literature notes', () => {
        mockParseNoteFrontmatter.mockReturnValue({
          frontmatter: {},
          content: '',
        });
        mockHasTag.mockReturnValue(false);

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(events[0].isLiteratureNote).toBe(false);
      });

      it('adds changed file to known literature notes if it is one', () => {
        mockParseNoteFrontmatter.mockReturnValue({
          frontmatter: { tags: ['literature-note'] },
          content: '',
        });
        mockHasTag.mockReturnValue(true);

        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        // Verify it was tracked by removing it
        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        unlinkHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(events[0].isLiteratureNote).toBe(true);
      });

      it('removes file from known literature notes if tag was removed', () => {
        // Initially tracked
        watcher.trackLiteratureNote('/test/vault/note.md');

        // File changed and no longer has the tag
        mockParseNoteFrontmatter.mockReturnValue({
          frontmatter: {},
          content: '',
        });
        mockHasTag.mockReturnValue(false);

        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        // Check it was untracked
        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        unlinkHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(events[0].isLiteratureNote).toBe(false);
      });
    });

    describe('added events', () => {
      it('emits file event with type added', () => {
        mockParseNoteFrontmatter.mockReturnValue({
          frontmatter: { tags: ['literature-note'] },
          content: '',
        });
        mockHasTag.mockReturnValue(true);

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        addHandler('/test/vault/new-note.md');
        vi.advanceTimersByTime(500);

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
          type: 'added',
          path: '/test/vault/new-note.md',
          isLiteratureNote: true,
        });
      });
    });

    describe('removed events', () => {
      it('emits file event with type removed', () => {
        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        unlinkHandler('/test/vault/deleted.md');
        vi.advanceTimersByTime(500);

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('removed');
      });

      it('identifies removed literature notes via tracking set', () => {
        watcher.trackLiteratureNote('/test/vault/note.md');

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        unlinkHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(events[0].isLiteratureNote).toBe(true);
      });

      it('does not parse frontmatter for removed files', () => {
        unlinkHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(mockParseNoteFrontmatter).not.toHaveBeenCalled();
      });

      it('removes file from tracking set after removal event', () => {
        watcher.trackLiteratureNote('/test/vault/note.md');

        unlinkHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        // Second removal should not be a literature note
        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        unlinkHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(events[0].isLiteratureNote).toBe(false);
      });

      it('marks unknown removed files as non-literature notes', () => {
        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        unlinkHandler('/test/vault/unknown.md');
        vi.advanceTimersByTime(500);

        expect(events[0].isLiteratureNote).toBe(false);
      });
    });

    describe('error handling', () => {
      it('silently drops event when frontmatter parsing throws', () => {
        mockParseNoteFrontmatter.mockImplementation(() => {
          throw new Error('File not found');
        });

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(events).toHaveLength(0);
      });

      it('does not crash on parse errors for added files', () => {
        mockParseNoteFrontmatter.mockImplementation(() => {
          throw new Error('Permission denied');
        });

        const events: FileEvent[] = [];
        watcher.on('file', (event: FileEvent) => events.push(event));

        addHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        // Event is silently dropped
        expect(events).toHaveLength(0);
      });
    });

    describe('frontmatter parsing', () => {
      it('passes config literature_note_tag to hasTag', () => {
        mockParseNoteFrontmatter.mockReturnValue({
          frontmatter: { tags: ['literature-note'] },
          content: '',
        });
        mockHasTag.mockReturnValue(true);

        changeHandler('/test/vault/note.md');
        vi.advanceTimersByTime(500);

        expect(mockHasTag).toHaveBeenCalledWith(
          { tags: ['literature-note'] },
          'literature-note'
        );
      });

      it('passes full file path to parseNoteFrontmatter', () => {
        mockParseNoteFrontmatter.mockReturnValue({ frontmatter: {}, content: '' });
        mockHasTag.mockReturnValue(false);

        changeHandler('/test/vault/subdir/deep/note.md');
        vi.advanceTimersByTime(500);

        expect(mockParseNoteFrontmatter).toHaveBeenCalledWith('/test/vault/subdir/deep/note.md');
      });
    });
  });
});
