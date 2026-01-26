import type { Config } from '../config/schema.js';
import type { LiteratureNote, Bookmark } from '@pulp/shared';

/**
 * Creates a complete test configuration with all required fields.
 * Use this helper in tests to ensure configs always have all properties.
 */
export function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    library_path: '/test/library',
    literature_note_tag: 'literature-note',
    source_key: 'source',
    progress_key: 'reading_progress',
    last_read_key: 'last_read',
    last_opened_cfi_key: 'last_opened_cfi',
    date_created_key: 'dateCreated',
    author_key: 'author',
    rating_key: 'rating',
    total_pages_key: 'total_pages',
    bookmarks_key: 'bookmarks',
    pinned_key: 'pinned',
    paused_key: 'paused',
    paused_at_key: 'paused_at',
    reading_stats_key: 'reading_stats',
    reading_history_key: 'reading_history',
    reading_sessions_key: 'reading_sessions',
    date_finished_key: 'date_finished',
    collections_key: 'collections',
    reader_preferences_key: 'reader_preferences',
    current_chapter_key: 'current_chapter',
    book_notes_key: 'book_notes',
    highlight_template: '> {{text}}\n- [[{{source}}#page={{page}}&selection={{selection}}|p. {{pageLabel}}]]',
    highlight_template_epub: '> {{text}}\n- [[{{source}}#cfi={{cfi}}|loc]]',
    progress_debounce_ms: 5000,
    exclude_folders: ['.obsidian', '.trash'],
    search_context_chars: 80,
    search_max_matches_per_doc: 50,
    search_results_per_doc: 10,
    reading_history_max_days: 90,
    cover_width: 300,
    cover_height: 450,
    cover_quality: 80,
    default_daily_goal_minutes: 30,
    default_grace_period_days: 1,
    ...overrides,
  };
}

/**
 * Creates a test literature note with all required fields.
 */
export function createTestNote(overrides?: Partial<LiteratureNote>): LiteratureNote {
  return {
    id: 'test-note-id',
    title: 'Test Book',
    author: 'Test Author',
    source: '/test/library/test.pdf',
    sourceRelative: 'test.pdf',
    sourceType: 'pdf',
    filePath: '/test/library/test.pdf',
    notePath: '/test/library/test.md',
    progress: 0,
    lastRead: null,
    lastOpenedCfi: null,
    dateCreated: '2024-01-01T00:00:00Z',
    dateFinished: null,
    collections: [],
    tags: ['literature-note'],
    cover: null,
    highlights: [],
    bookmarks: [],
    pinned: false,
    paused: false,
    pausedAt: null,
    rating: null,
    readingStats: null,
    totalPages: 100,
    readerPreferences: null,
    currentChapter: null,
    bookNotes: null,
    frontmatter: {
      tags: ['literature-note'],
      source: 'test.pdf',
    },
    ...overrides,
  };
}

/**
 * Creates a test bookmark with all required fields.
 */
export function createTestBookmark(overrides?: Partial<Bookmark>): Bookmark {
  return {
    id: 'bm-test',
    label: 'Test Bookmark',
    page: 1,
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}
