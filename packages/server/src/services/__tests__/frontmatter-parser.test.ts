import { describe, it, expect } from 'vitest';
import {
  hasTag,
  getSourcePath,
  getProgress,
  getLastRead,
  getLastOpenedCfi,
  getDateCreated,
  getDateFinished,
  getCollections,
  getTitle,
  getPinned,
  getBookmarks,
  bookmarkToWikilink,
  bookmarkToFrontmatter,
  getReadingStats,
  createReadingStatsForFrontmatter,
  getDailyReadingHistory,
  createDailyReadingEntryForFrontmatter,
  updateDailyReadingHistory,
  getBookNotes,
  getReadingSessions,
  createReadingSessionForFrontmatter,
  calculateSessionQuality,
  checkMilestones,
  createMilestoneRecord,
  calculateMomentum,
  getAuthor,
  getRating,
  getTotalPages,
  getPaused,
  getPausedAt,
  getReaderPreferences,
  getCSLMetadata,
  addReadingSession,
  createReaderPreferencesForFrontmatter,
  getCurrentChapter,
} from '../frontmatter-parser.js';

describe('hasTag', () => {
  it('returns false when tags is undefined', () => {
    expect(hasTag({}, 'literature_note')).toBe(false);
  });

  it('returns false when tags is null', () => {
    expect(hasTag({ tags: null }, 'literature_note')).toBe(false);
  });

  it('matches exact tag in array', () => {
    expect(hasTag({ tags: ['literature_note', 'reading'] }, 'literature_note')).toBe(true);
    expect(hasTag({ tags: ['reading', 'notes'] }, 'literature_note')).toBe(false);
  });

  it('matches tag prefix with slash suffix', () => {
    expect(hasTag({ tags: ['literature_note/read'] }, 'literature_note')).toBe(true);
    expect(hasTag({ tags: ['literature_note/unread'] }, 'literature_note')).toBe(true);
    expect(hasTag({ tags: ['other_literature_note'] }, 'literature_note')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(hasTag({ tags: ['Literature_Note'] }, 'literature_note')).toBe(true);
    expect(hasTag({ tags: ['literature_note'] }, 'LITERATURE_NOTE')).toBe(true);
  });

  it('handles # prefix in target tag', () => {
    expect(hasTag({ tags: ['literature_note'] }, '#literature_note')).toBe(true);
  });

  it('handles # prefix in source tags', () => {
    expect(hasTag({ tags: ['#literature_note'] }, 'literature_note')).toBe(true);
  });

  it('handles comma-separated string tags', () => {
    expect(hasTag({ tags: 'literature_note, reading, notes' }, 'reading')).toBe(true);
    expect(hasTag({ tags: 'one,two,three' }, 'two')).toBe(true);
    expect(hasTag({ tags: 'literature_note/read, notes' }, 'literature_note')).toBe(true);
  });
});

describe('getSourcePath', () => {
  it('returns null when source key is missing', () => {
    expect(getSourcePath({}, 'source')).toBeNull();
  });

  it('extracts path from wiki-link format', () => {
    expect(getSourcePath({ source: '[[path/to/file.pdf]]' }, 'source')).toBe('path/to/file.pdf');
  });

  it('extracts path from wiki-link with display name', () => {
    expect(getSourcePath({ source: '[[path/to/file.pdf|My Book]]' }, 'source')).toBe('path/to/file.pdf');
  });

  it('handles plain string paths', () => {
    expect(getSourcePath({ source: 'path/to/file.pdf' }, 'source')).toBe('path/to/file.pdf');
  });

  it('removes quotes from string paths', () => {
    expect(getSourcePath({ source: '"path/to/file.pdf"' }, 'source')).toBe('path/to/file.pdf');
    expect(getSourcePath({ source: "'path/to/file.pdf'" }, 'source')).toBe('path/to/file.pdf');
  });

  it('handles array format (first element)', () => {
    expect(getSourcePath({ attachment: ['[[books/test.pdf|Display]]'] }, 'attachment')).toBe('books/test.pdf');
    expect(getSourcePath({ attachment: ['simple.pdf'] }, 'attachment')).toBe('simple.pdf');
  });
});

describe('getProgress', () => {
  it('returns 0 when progress key is missing', () => {
    expect(getProgress({}, 'progress')).toBe(0);
  });

  it('handles number progress', () => {
    expect(getProgress({ progress: 50 }, 'progress')).toBe(50);
    expect(getProgress({ progress: 0 }, 'progress')).toBe(0);
    expect(getProgress({ progress: 100 }, 'progress')).toBe(100);
  });

  it('clamps progress to 0-100 range', () => {
    expect(getProgress({ progress: -10 }, 'progress')).toBe(0);
    expect(getProgress({ progress: 150 }, 'progress')).toBe(100);
  });

  it('parses string progress', () => {
    expect(getProgress({ progress: '75' }, 'progress')).toBe(75);
    expect(getProgress({ progress: '50.5' }, 'progress')).toBe(50.5);
  });

  it('returns 0 for invalid string progress', () => {
    expect(getProgress({ progress: 'invalid' }, 'progress')).toBe(0);
  });
});

describe('getLastRead', () => {
  it('returns null when key is missing', () => {
    expect(getLastRead({}, 'last_read')).toBeNull();
  });

  it('converts Date object to ISO string', () => {
    const date = new Date('2024-01-15T10:30:00Z');
    expect(getLastRead({ last_read: date }, 'last_read')).toBe('2024-01-15T10:30:00.000Z');
  });

  it('parses valid date strings', () => {
    expect(getLastRead({ last_read: '2024-01-15' }, 'last_read')).toMatch(/^2024-01-15/);
    expect(getLastRead({ last_read: '2024-01-15T10:30:00Z' }, 'last_read')).toBe('2024-01-15T10:30:00.000Z');
  });

  it('returns null for invalid date strings', () => {
    expect(getLastRead({ last_read: 'not-a-date' }, 'last_read')).toBeNull();
  });
});

describe('getLastOpenedCfi', () => {
  it('returns null when key is missing', () => {
    expect(getLastOpenedCfi({}, 'last_opened_cfi')).toBeNull();
  });

  it('returns null when value is empty string', () => {
    expect(getLastOpenedCfi({ last_opened_cfi: '' }, 'last_opened_cfi')).toBeNull();
    expect(getLastOpenedCfi({ last_opened_cfi: '   ' }, 'last_opened_cfi')).toBeNull();
  });

  it('returns trimmed CFI string', () => {
    expect(getLastOpenedCfi({ last_opened_cfi: 'epubcfi(/6/4[chap01ref]!/4/2/4)' }, 'last_opened_cfi'))
      .toBe('epubcfi(/6/4[chap01ref]!/4/2/4)');
    expect(getLastOpenedCfi({ last_opened_cfi: '  epubcfi(/6/4)  ' }, 'last_opened_cfi'))
      .toBe('epubcfi(/6/4)');
  });

  it('returns null for non-string values', () => {
    expect(getLastOpenedCfi({ last_opened_cfi: 123 }, 'last_opened_cfi')).toBeNull();
    expect(getLastOpenedCfi({ last_opened_cfi: null }, 'last_opened_cfi')).toBeNull();
    expect(getLastOpenedCfi({ last_opened_cfi: undefined }, 'last_opened_cfi')).toBeNull();
  });
});

describe('getDateCreated', () => {
  it('returns null when key is missing', () => {
    expect(getDateCreated({}, 'date_created')).toBeNull();
  });

  it('converts Date object to ISO string', () => {
    const date = new Date('2024-01-10T08:00:00Z');
    expect(getDateCreated({ date_created: date }, 'date_created')).toBe('2024-01-10T08:00:00.000Z');
  });

  it('parses valid date strings', () => {
    expect(getDateCreated({ date_created: '2024-01-10' }, 'date_created')).toMatch(/^2024-01-10/);
  });
});

describe('getTitle', () => {
  it('extracts title from frontmatter', () => {
    expect(getTitle({ title: 'My Book' }, 'note.md')).toBe('My Book');
  });

  it('trims whitespace from title', () => {
    expect(getTitle({ title: '  My Book  ' }, 'note.md')).toBe('My Book');
  });

  it('falls back to filename without extension', () => {
    expect(getTitle({}, 'My Note.md')).toBe('My Note');
  });

  it('falls back for empty string title', () => {
    expect(getTitle({ title: '' }, 'Fallback.md')).toBe('Fallback');
    expect(getTitle({ title: '   ' }, 'Fallback.md')).toBe('Fallback');
  });
});

describe('getPinned', () => {
  it('returns false when key is missing', () => {
    expect(getPinned({}, 'pinned')).toBe(false);
  });

  it('handles boolean true', () => {
    expect(getPinned({ pinned: true }, 'pinned')).toBe(true);
  });

  it('handles boolean false', () => {
    expect(getPinned({ pinned: false }, 'pinned')).toBe(false);
  });

  it('handles string "true"', () => {
    expect(getPinned({ pinned: 'true' }, 'pinned')).toBe(true);
  });

  it('handles string "false"', () => {
    expect(getPinned({ pinned: 'false' }, 'pinned')).toBe(false);
  });
});

describe('getBookmarks', () => {
  it('returns empty array when key is missing', () => {
    expect(getBookmarks({}, 'bookmarks')).toEqual([]);
  });

  it('returns empty array when not an array', () => {
    expect(getBookmarks({ bookmarks: 'not an array' }, 'bookmarks')).toEqual([]);
  });

  it('parses PDF bookmarks with page fragment', () => {
    const bookmarks = getBookmarks({
      bookmarks: ['[[book.pdf#page=42|Chapter 5]]'],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].page).toBe(42);
    expect(bookmarks[0].label).toBe('Chapter 5');
    expect(bookmarks[0].id).toBeDefined();
  });

  it('parses PDF bookmarks with timestamp', () => {
    const bookmarks = getBookmarks({
      bookmarks: ['[[book.pdf#page=10|Intro|2024-01-15T10:00:00Z]]'],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].page).toBe(10);
    expect(bookmarks[0].label).toBe('Intro');
    expect(bookmarks[0].createdAt).toBe('2024-01-15T10:00:00Z');
  });

  it('parses EPUB bookmarks with CFI', () => {
    const bookmarks = getBookmarks({
      bookmarks: ['[[book.epub#cfi=epubcfi(/6/4)|Chapter 1]]'],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].cfi).toBe('epubcfi(/6/4)');
    expect(bookmarks[0].label).toBe('Chapter 1');
  });

  it('handles URL-encoded CFI', () => {
    const encodedCfi = encodeURIComponent('epubcfi(/6/4!/4/2)');
    const bookmarks = getBookmarks({
      bookmarks: [`[[book.epub#cfi=${encodedCfi}|Test]]`],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].cfi).toBe('epubcfi(/6/4!/4/2)');
  });

  it('handles malformed URL-encoded CFI gracefully', () => {
    // This CFI has an invalid percent-encoding sequence (%ZZ is not valid)
    const malformedCfi = 'epubcfi(/6/4%ZZ)';
    const bookmarks = getBookmarks({
      bookmarks: [`[[book.epub#cfi=${malformedCfi}|Test]]`],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(1);
    // Should fall back to using the raw value when decoding fails
    expect(bookmarks[0].cfi).toBe(malformedCfi);
  });

  it('ignores invalid bookmark formats', () => {
    const bookmarks = getBookmarks({
      bookmarks: [
        '[[book.pdf#page=5|Valid]]',
        'invalid string',
        123, // non-string
        '[[book.pdf|NoFragment]]', // no fragment
      ],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].label).toBe('Valid');
  });

  it('uses default label when none provided', () => {
    const bookmarks = getBookmarks({
      bookmarks: ['[[book.pdf#page=1]]'],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].label).toBe('Bookmark');
  });
});

describe('bookmarkToWikilink', () => {
  it('creates PDF bookmark wikilink', () => {
    const result = bookmarkToWikilink('books/test.pdf', {
      label: 'Chapter 3',
      page: 42,
      createdAt: '2024-01-15T10:00:00Z',
    });

    expect(result).toBe('[[books/test.pdf#page=42|Chapter 3|2024-01-15T10:00:00Z]]');
  });

  it('creates EPUB bookmark wikilink with encoded CFI', () => {
    const result = bookmarkToWikilink('books/test.epub', {
      label: 'Intro',
      cfi: 'epubcfi(/6/4!/4/2)',
      createdAt: '2024-01-15T10:00:00Z',
    });

    expect(result).toContain('[[books/test.epub#cfi=');
    expect(result).toContain('|Intro|2024-01-15T10:00:00Z]]');
    // CFI should be URL-encoded
    expect(result).toContain(encodeURIComponent('epubcfi(/6/4!/4/2)'));
  });

  it('generates timestamp when not provided', () => {
    const result = bookmarkToWikilink('test.pdf', {
      label: 'Test',
      page: 1,
    });

    // Should have an ISO timestamp at the end
    expect(result).toMatch(/\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]\]$/);
  });
});

describe('getReadingStats', () => {
  it('returns null when key is missing', () => {
    expect(getReadingStats({}, 'reading_stats')).toBeNull();
  });

  it('returns null when value is not an object', () => {
    expect(getReadingStats({ reading_stats: 'invalid' }, 'reading_stats')).toBeNull();
    expect(getReadingStats({ reading_stats: 123 }, 'reading_stats')).toBeNull();
  });

  it('parses complete reading stats', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        first_read: '2024-01-15T10:00:00Z',
        pages_per_hour: 30,
        total_pages: 150,
        longest_session_ms: 1800000,
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.totalReadingTimeMs).toBe(3600000);
    expect(stats!.totalSessions).toBe(5);
    expect(stats!.averageSessionMs).toBe(720000); // 3600000 / 5
    expect(stats!.firstReadDate).toBe('2024-01-15T10:00:00.000Z');
    expect(stats!.pagesPerHour).toBe(30);
    expect(stats!.totalPagesRead).toBe(150);
    expect(stats!.longestSessionMs).toBe(1800000);
  });

  it('handles missing optional fields', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.firstReadDate).toBeNull();
    expect(stats!.pagesPerHour).toBeNull();
    expect(stats!.totalPagesRead).toBe(0);
    expect(stats!.longestSessionMs).toBeNull();
  });

  it('handles Date object for first_read', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        first_read: new Date('2024-01-15T10:00:00Z'),
      },
    }, 'reading_stats');

    expect(stats!.firstReadDate).toBe('2024-01-15T10:00:00.000Z');
  });

  it('calculates zero average when no sessions', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 0,
        total_sessions: 0,
      },
    }, 'reading_stats');

    expect(stats!.averageSessionMs).toBe(0);
  });
});

describe('createReadingStatsForFrontmatter', () => {
  it('creates stats object with required fields', () => {
    const result = createReadingStatsForFrontmatter({
      totalReadingTimeMs: 3600000,
      totalSessions: 5,
      averageSessionMs: 720000,
      firstReadDate: '2024-01-15T10:00:00Z',
      pagesPerHour: null,
      totalPagesRead: 0,
      longestSessionMs: null,
      estimatedCompletionDate: null,
      averageDailyReadingMs: null,
      // Optional fields not set - using type defaults
    });

    expect(result.total_time_ms).toBe(3600000);
    expect(result.total_sessions).toBe(5);
    expect(result.first_read).toBe('2024-01-15T10:00:00Z');
    expect(result.pages_per_hour).toBeUndefined();
    expect(result.total_pages).toBeUndefined();
    expect(result.longest_session_ms).toBeUndefined();
    expect(result.estimated_completion).toBeUndefined();
    expect(result.avg_daily_reading_ms).toBeUndefined();
  });

  it('includes optional fields when present', () => {
    const result = createReadingStatsForFrontmatter({
      totalReadingTimeMs: 3600000,
      totalSessions: 5,
      averageSessionMs: 720000,
      firstReadDate: '2024-01-15T10:00:00Z',
      pagesPerHour: 30,
      totalPagesRead: 150,
      longestSessionMs: 1800000,
      estimatedCompletionDate: '2024-02-15',
      averageDailyReadingMs: 1800000,
      // Optional fields not set - using type defaults
    });

    expect(result.pages_per_hour).toBe(30);
    expect(result.total_pages).toBe(150);
    expect(result.longest_session_ms).toBe(1800000);
    expect(result.estimated_completion).toBe('2024-02-15');
    expect(result.avg_daily_reading_ms).toBe(1800000);
  });
});

describe('getDailyReadingHistory', () => {
  it('returns empty array when key is missing', () => {
    expect(getDailyReadingHistory({}, 'reading_history')).toEqual([]);
  });

  it('returns empty array when not an array', () => {
    expect(getDailyReadingHistory({ reading_history: 'invalid' }, 'reading_history')).toEqual([]);
  });

  it('parses valid history entries', () => {
    const history = getDailyReadingHistory({
      reading_history: [
        { date: '2024-01-15', duration_ms: 1800000, sessions: 2, pages: 15 },
        { date: '2024-01-14', duration_ms: 3600000, sessions: 3, pages: 30 },
      ],
    }, 'reading_history');

    expect(history).toHaveLength(2);
    expect(history[0].date).toBe('2024-01-15');
    expect(history[0].durationMs).toBe(1800000);
    expect(history[0].sessions).toBe(2);
    expect(history[0].pagesRead).toBe(15);
  });

  it('sorts entries by date descending', () => {
    const history = getDailyReadingHistory({
      reading_history: [
        { date: '2024-01-10', duration_ms: 1000, sessions: 1, pages: 5 },
        { date: '2024-01-15', duration_ms: 2000, sessions: 2, pages: 10 },
        { date: '2024-01-12', duration_ms: 1500, sessions: 1, pages: 7 },
      ],
    }, 'reading_history');

    expect(history[0].date).toBe('2024-01-15');
    expect(history[1].date).toBe('2024-01-12');
    expect(history[2].date).toBe('2024-01-10');
  });

  it('handles Date objects', () => {
    const history = getDailyReadingHistory({
      reading_history: [
        { date: new Date('2024-01-15T12:00:00Z'), duration_ms: 1000, sessions: 1, pages: 5 },
      ],
    }, 'reading_history');

    expect(history).toHaveLength(1);
    expect(history[0].date).toBe('2024-01-15');
  });

  it('skips invalid entries', () => {
    const history = getDailyReadingHistory({
      reading_history: [
        { date: '2024-01-15', duration_ms: 1000, sessions: 1, pages: 5 },
        { duration_ms: 1000 }, // missing date
        'invalid',
        null,
        { date: 'not-a-date', duration_ms: 1000, sessions: 1, pages: 5 },
      ],
    }, 'reading_history');

    expect(history).toHaveLength(1);
    expect(history[0].date).toBe('2024-01-15');
  });

  it('rejects impossible calendar dates', () => {
    const history = getDailyReadingHistory({
      reading_history: [
        { date: '2024-13-45', duration_ms: 1000, sessions: 1, pages: 5 }, // invalid month/day
        { date: '2024-02-30', duration_ms: 1000, sessions: 1, pages: 5 }, // Feb 30 doesn't exist
        { date: '2024-00-15', duration_ms: 1000, sessions: 1, pages: 5 }, // month 0 invalid
        { date: '2024-01-15', duration_ms: 2000, sessions: 1, pages: 10 }, // valid
      ],
    }, 'reading_history');

    expect(history).toHaveLength(1);
    expect(history[0].date).toBe('2024-01-15');
  });

  it('rejects Date objects with invalid time', () => {
    const history = getDailyReadingHistory({
      reading_history: [
        { date: new Date('invalid'), duration_ms: 1000, sessions: 1, pages: 5 },
        { date: '2024-01-15', duration_ms: 2000, sessions: 1, pages: 10 },
      ],
    }, 'reading_history');

    expect(history).toHaveLength(1);
    expect(history[0].date).toBe('2024-01-15');
  });

  it('handles missing numeric fields with defaults', () => {
    const history = getDailyReadingHistory({
      reading_history: [
        { date: '2024-01-15' }, // missing all numeric fields
      ],
    }, 'reading_history');

    expect(history).toHaveLength(1);
    expect(history[0].durationMs).toBe(0);
    expect(history[0].sessions).toBe(0);
    expect(history[0].pagesRead).toBe(0);
  });
});

describe('createDailyReadingEntryForFrontmatter', () => {
  it('creates frontmatter entry', () => {
    const result = createDailyReadingEntryForFrontmatter({
      date: '2024-01-15',
      durationMs: 1800000,
      sessions: 2,
      pagesRead: 15,
    });

    expect(result).toEqual({
      date: '2024-01-15',
      duration_ms: 1800000,
      sessions: 2,
      pages: 15,
    });
  });
});

describe('updateDailyReadingHistory', () => {
  it('adds new entry when date does not exist', () => {
    const result = updateDailyReadingHistory([], '2024-01-15', 1800000, 10);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-15');
    expect(result[0].durationMs).toBe(1800000);
    expect(result[0].sessions).toBe(1);
    expect(result[0].pagesRead).toBe(10);
  });

  it('updates existing entry for same date', () => {
    const existing = [
      { date: '2024-01-15', durationMs: 1000000, sessions: 2, pagesRead: 10 },
    ];
    const result = updateDailyReadingHistory(existing, '2024-01-15', 500000, 5);

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-15');
    expect(result[0].durationMs).toBe(1500000);
    expect(result[0].sessions).toBe(3);
    expect(result[0].pagesRead).toBe(15);
  });

  it('maintains descending date order', () => {
    const existing = [
      { date: '2024-01-15', durationMs: 1000, sessions: 1, pagesRead: 5 },
      { date: '2024-01-10', durationMs: 1000, sessions: 1, pagesRead: 5 },
    ];
    const result = updateDailyReadingHistory(existing, '2024-01-12', 1000, 5);

    expect(result[0].date).toBe('2024-01-15');
    expect(result[1].date).toBe('2024-01-12');
    expect(result[2].date).toBe('2024-01-10');
  });

  it('keeps only last 90 days', () => {
    const existing = Array.from({ length: 95 }, (_, i) => ({
      date: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      durationMs: 1000,
      sessions: 1,
      pagesRead: 5,
    }));

    const result = updateDailyReadingHistory(existing, '2024-12-31', 1000, 5);

    expect(result.length).toBe(90);
    expect(result[0].date).toBe('2024-12-31');
  });

  it('does not mutate the input array', () => {
    const existing = [
      { date: '2024-01-15', durationMs: 1000, sessions: 1, pagesRead: 5 },
    ];
    const originalLength = existing.length;

    updateDailyReadingHistory(existing, '2024-01-16', 1000, 5);

    expect(existing.length).toBe(originalLength);
  });
});

describe('getDateFinished', () => {
  it('returns null when key is missing', () => {
    expect(getDateFinished({}, 'date_finished')).toBeNull();
  });

  it('converts Date object to ISO string', () => {
    const date = new Date('2024-01-20T15:30:00Z');
    expect(getDateFinished({ date_finished: date }, 'date_finished')).toBe('2024-01-20T15:30:00.000Z');
  });

  it('parses valid date strings', () => {
    expect(getDateFinished({ date_finished: '2024-01-20' }, 'date_finished')).toMatch(/^2024-01-20/);
    expect(getDateFinished({ date_finished: '2024-01-20T15:30:00Z' }, 'date_finished')).toBe('2024-01-20T15:30:00.000Z');
  });

  it('returns null for invalid date strings', () => {
    expect(getDateFinished({ date_finished: 'not-a-date' }, 'date_finished')).toBeNull();
  });
});

describe('getCollections', () => {
  it('returns empty array when key is missing', () => {
    expect(getCollections({}, 'collections')).toEqual([]);
  });

  it('returns empty array when value is null or undefined', () => {
    expect(getCollections({ collections: null }, 'collections')).toEqual([]);
    expect(getCollections({ collections: undefined }, 'collections')).toEqual([]);
  });

  it('handles array of strings', () => {
    expect(getCollections({ collections: ['Fiction', 'Favorites'] }, 'collections'))
      .toEqual(['Fiction', 'Favorites']);
  });

  it('trims whitespace from collection names', () => {
    expect(getCollections({ collections: ['  Fiction  ', ' Favorites'] }, 'collections'))
      .toEqual(['Fiction', 'Favorites']);
  });

  it('filters out empty strings', () => {
    expect(getCollections({ collections: ['Fiction', '', '  ', 'Favorites'] }, 'collections'))
      .toEqual(['Fiction', 'Favorites']);
  });

  it('handles comma-separated string', () => {
    expect(getCollections({ collections: 'Fiction, Favorites, To Read' }, 'collections'))
      .toEqual(['Fiction', 'Favorites', 'To Read']);
  });

  it('handles comma-separated string with extra whitespace', () => {
    expect(getCollections({ collections: '  Fiction  ,  Favorites  ' }, 'collections'))
      .toEqual(['Fiction', 'Favorites']);
  });

  it('filters out non-string values in arrays', () => {
    expect(getCollections({ collections: ['Fiction', 123, null, 'Favorites'] }, 'collections'))
      .toEqual(['Fiction', 'Favorites']);
  });

  it('returns empty array for non-array, non-string values', () => {
    expect(getCollections({ collections: 123 }, 'collections')).toEqual([]);
    expect(getCollections({ collections: true }, 'collections')).toEqual([]);
    expect(getCollections({ collections: {} }, 'collections')).toEqual([]);
  });
});

describe('getBookNotes', () => {
  it('returns null when key is missing', () => {
    expect(getBookNotes({}, 'book_notes')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getBookNotes({ book_notes: '' }, 'book_notes')).toBeNull();
    expect(getBookNotes({ book_notes: '   ' }, 'book_notes')).toBeNull();
  });

  it('returns trimmed string value', () => {
    expect(getBookNotes({ book_notes: 'My notes about this book' }, 'book_notes'))
      .toBe('My notes about this book');
  });

  it('trims whitespace from notes', () => {
    expect(getBookNotes({ book_notes: '  My notes  ' }, 'book_notes'))
      .toBe('My notes');
  });

  it('returns null for non-string values', () => {
    expect(getBookNotes({ book_notes: 123 }, 'book_notes')).toBeNull();
    expect(getBookNotes({ book_notes: true }, 'book_notes')).toBeNull();
    expect(getBookNotes({ book_notes: ['note1', 'note2'] }, 'book_notes')).toBeNull();
  });
});

describe('getBookmarks (with notes support)', () => {
  it('parses bookmarks with notes in object format', () => {
    const bookmarks = getBookmarks({
      bookmarks: [
        { link: '[[test.pdf#page=5|Chapter 3|2024-01-15]]', notes: 'Important chapter' },
      ],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].label).toBe('Chapter 3');
    expect(bookmarks[0].page).toBe(5);
    expect(bookmarks[0].notes).toBe('Important chapter');
  });

  it('parses mixed format (legacy wikilinks and new objects)', () => {
    const bookmarks = getBookmarks({
      bookmarks: [
        '[[test.pdf#page=1|Start|2024-01-10]]',
        { link: '[[test.pdf#page=10|Middle|2024-01-15]]', notes: 'Some notes' },
        '[[test.pdf#page=20|End|2024-01-20]]',
      ],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(3);
    expect(bookmarks[0].notes).toBeUndefined();
    expect(bookmarks[1].notes).toBe('Some notes');
    expect(bookmarks[2].notes).toBeUndefined();
  });

  it('handles empty notes in object format', () => {
    const bookmarks = getBookmarks({
      bookmarks: [
        { link: '[[test.pdf#page=5|Chapter|2024-01-15]]', notes: '' },
        { link: '[[test.pdf#page=6|Chapter 2|2024-01-15]]', notes: '   ' },
      ],
    }, 'bookmarks');

    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[0].notes).toBeUndefined();
    expect(bookmarks[1].notes).toBeUndefined();
  });
});

describe('bookmarkToFrontmatter', () => {
  it('returns wikilink string when no notes', () => {
    const result = bookmarkToFrontmatter('test.pdf', {
      label: 'Chapter 1',
      page: 10,
      createdAt: '2024-01-15T00:00:00Z',
    });

    expect(typeof result).toBe('string');
    expect(result).toBe('[[test.pdf#page=10|Chapter 1|2024-01-15T00:00:00Z]]');
  });

  it('returns object with link and notes when notes present', () => {
    const result = bookmarkToFrontmatter('test.pdf', {
      label: 'Chapter 1',
      notes: 'Important chapter',
      page: 10,
      createdAt: '2024-01-15T00:00:00Z',
    });

    expect(typeof result).toBe('object');
    expect(result).toEqual({
      link: '[[test.pdf#page=10|Chapter 1|2024-01-15T00:00:00Z]]',
      notes: 'Important chapter',
    });
  });

  it('returns wikilink string when notes is empty', () => {
    const result = bookmarkToFrontmatter('test.pdf', {
      label: 'Chapter 1',
      notes: '   ',
      page: 10,
    });

    expect(typeof result).toBe('string');
  });

  it('handles EPUB CFI bookmarks with notes', () => {
    const result = bookmarkToFrontmatter('test.epub', {
      label: 'Introduction',
      notes: 'Start of the story',
      cfi: 'epubcfi(/6/4!/4)',
      createdAt: '2024-01-15T00:00:00Z',
    });

    expect(typeof result).toBe('object');
    const obj = result as { link: string; notes: string };
    expect(obj.link).toContain('cfi=');
    expect(obj.notes).toBe('Start of the story');
  });
});

describe('getReadingSessions', () => {
  it('returns empty array when key is missing', () => {
    expect(getReadingSessions({}, 'reading_sessions')).toEqual([]);
  });

  it('returns empty array when not an array', () => {
    expect(getReadingSessions({ reading_sessions: 'invalid' }, 'reading_sessions')).toEqual([]);
  });

  it('parses reading sessions with hourOfDay', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          hour_of_day: 10,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].hourOfDay).toBe(10);
  });

  it('calculates hourOfDay from startTime if not stored', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-15T08:30:00Z', // 8 AM UTC
          end: '2024-01-15T09:30:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          // hour_of_day not provided
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    // Should calculate hour from startTime - exact hour depends on timezone
    expect(sessions[0].hourOfDay).toBeDefined();
    expect(sessions[0].hourOfDay).toBeGreaterThanOrEqual(0);
    expect(sessions[0].hourOfDay).toBeLessThan(24);
  });
});

describe('createReadingSessionForFrontmatter', () => {
  it('creates session object with all fields', () => {
    const result = createReadingSessionForFrontmatter({
      startTime: '2024-01-15T10:00:00Z',
      endTime: '2024-01-15T11:00:00Z',
      durationMs: 3600000,
      pagesRead: 30,
      startPage: 0,
      endPage: 30,
      hourOfDay: 10,
    });

    expect(result.start).toBe('2024-01-15T10:00:00Z');
    expect(result.end).toBe('2024-01-15T11:00:00Z');
    expect(result.duration_ms).toBe(3600000);
    expect(result.pages).toBe(30);
    expect(result.start_page).toBe(0);
    expect(result.end_page).toBe(30);
    expect(result.hour_of_day).toBe(10);
  });

  it('omits hourOfDay if undefined', () => {
    const result = createReadingSessionForFrontmatter({
      startTime: '2024-01-15T10:00:00Z',
      endTime: '2024-01-15T11:00:00Z',
      durationMs: 3600000,
      pagesRead: 30,
      startPage: 0,
      endPage: 30,
    });

    expect(result.hour_of_day).toBeUndefined();
  });

  it('includes quality metrics when provided', () => {
    const result = createReadingSessionForFrontmatter({
      startTime: '2024-01-15T10:00:00Z',
      endTime: '2024-01-15T11:00:00Z',
      durationMs: 3600000,
      pagesRead: 30,
      startPage: 0,
      endPage: 30,
      quality: 'focused',
      idlePauseCount: 2,
      idlePauseTotalMs: 120000,
    });

    expect(result.quality).toBe('focused');
    expect(result.idle_pause_count).toBe(2);
    expect(result.idle_pause_total_ms).toBe(120000);
  });
});

describe('calculateSessionQuality', () => {
  it('returns normal for sessions under 5 minutes', () => {
    expect(calculateSessionQuality(4 * 60 * 1000, 0, 0)).toBe('normal');
  });

  it('returns deep for long sessions with no pauses', () => {
    // 45 minute session with no pauses
    expect(calculateSessionQuality(45 * 60 * 1000, 0, 0)).toBe('deep');
  });

  it('returns focused for sessions with minimal interruptions', () => {
    // 30 minute session with 1 pause and <5% idle time
    const durationMs = 30 * 60 * 1000;
    const idlePauseTotalMs = durationMs * 0.03; // 3% idle
    expect(calculateSessionQuality(durationMs, 1, idlePauseTotalMs)).toBe('focused');
  });

  it('returns normal for sessions with moderate interruptions', () => {
    // 20 minute session with 3 pauses and ~10% idle time
    const durationMs = 20 * 60 * 1000;
    const idlePauseTotalMs = durationMs * 0.10; // 10% idle
    expect(calculateSessionQuality(durationMs, 3, idlePauseTotalMs)).toBe('normal');
  });

  it('returns distracted for sessions with many interruptions', () => {
    // 15 minute session with 6 pauses
    expect(calculateSessionQuality(15 * 60 * 1000, 6, 0)).toBe('distracted');
  });

  it('returns distracted for sessions with high idle time percentage', () => {
    // 30 minute session with 20% idle time
    const durationMs = 30 * 60 * 1000;
    const idlePauseTotalMs = durationMs * 0.20; // 20% idle
    expect(calculateSessionQuality(durationMs, 2, idlePauseTotalMs)).toBe('distracted');
  });

  it('handles undefined pause values', () => {
    expect(calculateSessionQuality(30 * 60 * 1000, undefined, undefined)).toBe('deep');
  });
});

describe('checkMilestones', () => {
  it('returns empty array when no milestone is crossed', () => {
    expect(checkMilestones(5, 8, [])).toEqual([]);
    expect(checkMilestones(11, 15, [])).toEqual([]);
  });

  it('detects 10% milestone crossing', () => {
    expect(checkMilestones(5, 12, [])).toEqual([10]);
  });

  it('detects 25% milestone crossing', () => {
    expect(checkMilestones(20, 30, [])).toEqual([25]);
  });

  it('detects 50% milestone crossing', () => {
    expect(checkMilestones(45, 55, [])).toEqual([50]);
  });

  it('detects 75% milestone crossing', () => {
    expect(checkMilestones(70, 80, [])).toEqual([75]);
  });

  it('detects 100% milestone crossing', () => {
    expect(checkMilestones(95, 100, [])).toEqual([100]);
  });

  it('returns all crossed milestones when multiple are crossed', () => {
    // Going from 5% to 30% crosses both 10% and 25%
    expect(checkMilestones(5, 30, [])).toEqual([10, 25]);
  });

  it('does not return already recorded milestones', () => {
    const existingMilestones = [
      { milestone: 10 as const, reachedAt: '2024-01-15', daysFromStart: 0, totalReadingTimeMs: 10000 },
    ];
    // 10% already recorded, should not return it
    expect(checkMilestones(5, 15, existingMilestones)).toEqual([]);
  });

  it('skips recorded milestones but returns unrecorded ones', () => {
    const existingMilestones = [
      { milestone: 10 as const, reachedAt: '2024-01-15', daysFromStart: 0, totalReadingTimeMs: 10000 },
    ];
    // 10% already recorded, but 25% is new
    expect(checkMilestones(20, 30, existingMilestones)).toEqual([25]);
  });

  it('returns all milestones when jumping from near-zero to 100%', () => {
    // Jumping from 5% to 100% should cross all 5 milestones
    expect(checkMilestones(5, 100, [])).toEqual([10, 25, 50, 75, 100]);
  });

  it('returns remaining unrecorded milestones on large jump', () => {
    const existingMilestones = [
      { milestone: 10 as const, reachedAt: '2024-01-15', daysFromStart: 0, totalReadingTimeMs: 10000 },
      { milestone: 25 as const, reachedAt: '2024-01-16', daysFromStart: 1, totalReadingTimeMs: 20000 },
    ];
    // 10% and 25% already recorded; jumping from 30% to 80% crosses 50% and 75%
    expect(checkMilestones(30, 80, existingMilestones)).toEqual([50, 75]);
  });

  it('returns milestones in ascending order', () => {
    const result = checkMilestones(0, 100, []);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1]);
    }
  });
});

describe('createMilestoneRecord', () => {
  it('creates a milestone record with first read date', () => {
    const record = createMilestoneRecord(50, '2024-01-01T00:00:00Z', 3600000);

    expect(record.milestone).toBe(50);
    expect(record.reachedAt).toBeDefined();
    expect(record.totalReadingTimeMs).toBe(3600000);
    expect(record.daysFromStart).toBeGreaterThanOrEqual(0);
  });

  it('sets daysFromStart to null when firstReadDate is null', () => {
    const record = createMilestoneRecord(25, null, 1800000);

    expect(record.milestone).toBe(25);
    expect(record.daysFromStart).toBeNull();
    expect(record.totalReadingTimeMs).toBe(1800000);
  });
});

describe('calculateMomentum', () => {
  it('returns inactive when no reading history', () => {
    const { momentum, score } = calculateMomentum([]);
    expect(momentum).toBe('inactive');
    expect(score).toBe(0);
  });

  it('returns accelerating when recent reading is significantly higher', () => {
    // Create history with more recent reading
    const today = new Date();
    const history = [];

    // Last 7 days: 60 min/day
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        durationMs: 60 * 60 * 1000,
        sessions: 1,
        pagesRead: 30,
      });
    }

    // Previous 7 days: 20 min/day
    for (let i = 7; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        durationMs: 20 * 60 * 1000,
        sessions: 1,
        pagesRead: 10,
      });
    }

    const { momentum, score } = calculateMomentum(history);
    expect(momentum).toBe('accelerating');
    expect(score).toBeGreaterThan(20);
  });

  it('returns slowing when recent reading is significantly lower', () => {
    const today = new Date();
    const history = [];

    // Last 7 days: 10 min/day
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        durationMs: 10 * 60 * 1000,
        sessions: 1,
        pagesRead: 5,
      });
    }

    // Previous 7 days: 60 min/day
    for (let i = 7; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        durationMs: 60 * 60 * 1000,
        sessions: 1,
        pagesRead: 30,
      });
    }

    const { momentum, score } = calculateMomentum(history);
    expect(momentum).toBe('slowing');
    expect(score).toBeLessThan(-20);
  });

  it('returns steady when reading is consistent', () => {
    const today = new Date();
    const history = [];

    // Consistent 30 min/day for 14 days
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        durationMs: 30 * 60 * 1000,
        sessions: 1,
        pagesRead: 15,
      });
    }

    const { momentum, score } = calculateMomentum(history);
    expect(momentum).toBe('steady');
    expect(score).toBeGreaterThanOrEqual(-20);
    expect(score).toBeLessThanOrEqual(20);
  });

  it('returns inactive when no recent reading', () => {
    const today = new Date();
    const history = [];

    // Only old reading (previous 7 days), nothing recent
    for (let i = 7; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        durationMs: 30 * 60 * 1000,
        sessions: 1,
        pagesRead: 15,
      });
    }

    const { momentum } = calculateMomentum(history);
    expect(momentum).toBe('inactive');
  });
});

describe('getReadingStats with milestones and momentum', () => {
  it('parses milestones from frontmatter', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        first_read: '2024-01-15T10:00:00Z',
        milestones: [
          { milestone: 10, reached_at: '2024-01-15T12:00:00Z', days_from_start: 0, total_time_ms: 600000 },
          { milestone: 25, reached_at: '2024-01-16T10:00:00Z', days_from_start: 1, total_time_ms: 1800000 },
        ],
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.milestones).toHaveLength(2);
    expect(stats!.milestones[0].milestone).toBe(10);
    expect(stats!.milestones[1].milestone).toBe(25);
    expect(stats!.milestones[0].daysFromStart).toBe(0);
    expect(stats!.milestones[1].daysFromStart).toBe(1);
  });

  it('parses momentum from frontmatter', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        first_read: '2024-01-15T10:00:00Z',
        momentum: 'accelerating',
        momentum_score: 45,
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.momentum).toBe('accelerating');
    expect(stats!.momentumScore).toBe(45);
  });

  it('returns undefined milestones when not present', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        first_read: '2024-01-15T10:00:00Z',
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.milestones).toBeUndefined();
  });

  it('clamps momentum score to -100 to 100', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        momentum_score: 150, // Over max
      },
    }, 'reading_stats');

    expect(stats!.momentumScore).toBe(100);
  });

  it('ignores invalid momentum values', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        momentum: 'invalid_value',
      },
    }, 'reading_stats');

    expect(stats!.momentum).toBeUndefined();
  });
});

describe('createReadingStatsForFrontmatter with milestones and momentum', () => {
  it('includes milestones in output', () => {
    const stats = {
      totalReadingTimeMs: 3600000,
      totalSessions: 5,
      averageSessionMs: 720000,
      firstReadDate: '2024-01-15T10:00:00Z',
      pagesPerHour: 45,
      totalPagesRead: 150,
      longestSessionMs: 1800000,
      estimatedCompletionDate: '2024-02-15',
      averageDailyReadingMs: 1800000,
      milestones: [
        { milestone: 10 as const, reachedAt: '2024-01-15T12:00:00Z', daysFromStart: 0, totalReadingTimeMs: 600000 },
      ],
      momentum: 'accelerating' as const,
      momentumScore: 35,
    };

    const result = createReadingStatsForFrontmatter(stats);

    expect(result.milestones).toHaveLength(1);
    expect((result.milestones as any[])[0].milestone).toBe(10);
    expect((result.milestones as any[])[0].reached_at).toBe('2024-01-15T12:00:00Z');
    expect(result.momentum).toBe('accelerating');
    expect(result.momentum_score).toBe(35);
  });

  it('omits milestones when empty', () => {
    const stats = {
      totalReadingTimeMs: 3600000,
      totalSessions: 5,
      averageSessionMs: 720000,
      firstReadDate: '2024-01-15T10:00:00Z',
      pagesPerHour: 45,
      totalPagesRead: 150,
      longestSessionMs: 1800000,
      estimatedCompletionDate: '2024-02-15',
      averageDailyReadingMs: 1800000,
      milestones: [],
      momentum: undefined,
      momentumScore: undefined,
    };

    const result = createReadingStatsForFrontmatter(stats);

    expect(result.milestones).toBeUndefined();
    expect(result.momentum).toBeUndefined();
    expect(result.momentum_score).toBeUndefined();
  });
});

describe('getReadingSessions with quality metrics', () => {
  it('parses sessions with quality metrics', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          quality: 'focused',
          idle_pause_count: 2,
          idle_pause_total_ms: 120000,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].quality).toBe('focused');
    expect(sessions[0].idlePauseCount).toBe(2);
    expect(sessions[0].idlePauseTotalMs).toBe(120000);
  });

  it('ignores invalid quality values', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          quality: 'invalid_quality',
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].quality).toBeUndefined();
  });

  it('handles sessions without quality metrics (backward compatibility)', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].quality).toBeUndefined();
    expect(sessions[0].idlePauseCount).toBeUndefined();
    expect(sessions[0].idlePauseTotalMs).toBeUndefined();
  });
});

describe('getAuthor', () => {
  it('returns null when author key is missing', () => {
    expect(getAuthor({}, 'author')).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(getAuthor({ author: '' }, 'author')).toBe(null);
  });

  it('returns null for whitespace-only string', () => {
    expect(getAuthor({ author: '   ' }, 'author')).toBe(null);
  });

  it('extracts string author', () => {
    expect(getAuthor({ author: 'Jane Austen' }, 'author')).toBe('Jane Austen');
  });

  it('trims whitespace from string author', () => {
    expect(getAuthor({ author: '  Jane Austen  ' }, 'author')).toBe('Jane Austen');
  });

  it('handles array of string authors', () => {
    expect(getAuthor({ author: ['Alice', 'Bob'] }, 'author')).toBe('Alice, Bob');
  });

  it('handles single-element array', () => {
    expect(getAuthor({ author: ['Alice'] }, 'author')).toBe('Alice');
  });

  it('returns null for empty array', () => {
    expect(getAuthor({ author: [] }, 'author')).toBe(null);
  });

  it('handles {first, last} object format', () => {
    expect(getAuthor({ author: { first: 'John', last: 'Doe' } }, 'author')).toBe('John Doe');
  });

  it('handles {first} only object', () => {
    expect(getAuthor({ author: { first: 'John' } }, 'author')).toBe('John');
  });

  it('handles {last} only object', () => {
    expect(getAuthor({ author: { last: 'Doe' } }, 'author')).toBe('Doe');
  });

  it('handles {given, family} CSL-JSON format', () => {
    expect(getAuthor({ author: { given: 'Jane', family: 'Austen' } }, 'author')).toBe('Jane Austen');
  });

  it('handles {given} only CSL-JSON format', () => {
    expect(getAuthor({ author: { given: 'Jane' } }, 'author')).toBe('Jane');
  });

  it('handles {name} object format', () => {
    expect(getAuthor({ author: { name: 'World Health Organization' } }, 'author')).toBe('World Health Organization');
  });

  it('handles {literal} CSL-JSON format', () => {
    expect(getAuthor({ author: { literal: 'UNESCO' } }, 'author')).toBe('UNESCO');
  });

  it('handles array of {given, family} objects', () => {
    const result = getAuthor({
      author: [
        { given: 'John', family: 'Smith' },
        { given: 'Jane', family: 'Doe' },
      ],
    }, 'author');
    expect(result).toBe('John Smith, Jane Doe');
  });

  it('handles mixed array of strings and objects', () => {
    const result = getAuthor({
      author: [
        'Plain Author',
        { first: 'John', last: 'Doe' },
      ],
    }, 'author');
    expect(result).toBe('Plain Author, John Doe');
  });

  it('filters null values from array', () => {
    const result = getAuthor({
      author: [null, 'Valid Author', undefined],
    }, 'author');
    expect(result).toBe('Valid Author');
  });

  it('returns null for non-string, non-array, non-object values', () => {
    expect(getAuthor({ author: 42 }, 'author')).toBe(null);
    expect(getAuthor({ author: true }, 'author')).toBe(null);
  });

  it('uses custom key name', () => {
    expect(getAuthor({ writer: 'Custom Author' }, 'writer')).toBe('Custom Author');
  });

  it('handles object with empty strings for first/last', () => {
    expect(getAuthor({ author: { first: '', last: '' } }, 'author')).toBe(null);
  });

  it('handles {name} with empty string', () => {
    expect(getAuthor({ author: { name: '  ' } }, 'author')).toBe(null);
  });
});

describe('getRating', () => {
  it('returns null when rating key is missing', () => {
    expect(getRating({}, 'rating')).toBe(null);
  });

  it('returns null for null value', () => {
    expect(getRating({ rating: null }, 'rating')).toBe(null);
  });

  it('returns numeric rating within range', () => {
    expect(getRating({ rating: 3 }, 'rating')).toBe(3);
    expect(getRating({ rating: 1 }, 'rating')).toBe(1);
    expect(getRating({ rating: 5 }, 'rating')).toBe(5);
  });

  it('clamps rating below minimum to 1', () => {
    expect(getRating({ rating: 0 }, 'rating')).toBe(1);
    expect(getRating({ rating: -5 }, 'rating')).toBe(1);
  });

  it('clamps rating above maximum to 5', () => {
    expect(getRating({ rating: 6 }, 'rating')).toBe(5);
    expect(getRating({ rating: 100 }, 'rating')).toBe(5);
  });

  it('rounds decimal ratings', () => {
    expect(getRating({ rating: 3.7 }, 'rating')).toBe(4);
    expect(getRating({ rating: 2.2 }, 'rating')).toBe(2);
    expect(getRating({ rating: 4.5 }, 'rating')).toBe(5);
  });

  it('parses string ratings', () => {
    expect(getRating({ rating: '4' }, 'rating')).toBe(4);
    expect(getRating({ rating: '3.7' }, 'rating')).toBe(4);
  });

  it('returns null for non-numeric strings', () => {
    expect(getRating({ rating: 'excellent' }, 'rating')).toBe(null);
    expect(getRating({ rating: '' }, 'rating')).toBe(null);
  });

  it('returns null for non-string non-number values', () => {
    expect(getRating({ rating: true }, 'rating')).toBe(null);
    expect(getRating({ rating: [] }, 'rating')).toBe(null);
  });

  it('uses custom key name', () => {
    expect(getRating({ my_rating: 4 }, 'my_rating')).toBe(4);
  });
});

describe('getTotalPages', () => {
  it('returns null when key is missing', () => {
    expect(getTotalPages({}, 'total_pages')).toBe(null);
  });

  it('returns null for null value', () => {
    expect(getTotalPages({ total_pages: null }, 'total_pages')).toBe(null);
  });

  it('returns positive number', () => {
    expect(getTotalPages({ total_pages: 350 }, 'total_pages')).toBe(350);
  });

  it('rounds decimal values', () => {
    expect(getTotalPages({ total_pages: 350.7 }, 'total_pages')).toBe(351);
  });

  it('returns null for zero', () => {
    expect(getTotalPages({ total_pages: 0 }, 'total_pages')).toBe(null);
  });

  it('returns null for negative numbers', () => {
    expect(getTotalPages({ total_pages: -10 }, 'total_pages')).toBe(null);
  });

  it('parses valid string values', () => {
    expect(getTotalPages({ total_pages: '250' }, 'total_pages')).toBe(250);
  });

  it('returns null for non-numeric strings', () => {
    expect(getTotalPages({ total_pages: 'many' }, 'total_pages')).toBe(null);
    expect(getTotalPages({ total_pages: '' }, 'total_pages')).toBe(null);
  });

  it('returns null for string zero', () => {
    expect(getTotalPages({ total_pages: '0' }, 'total_pages')).toBe(null);
  });

  it('returns null for string negative', () => {
    expect(getTotalPages({ total_pages: '-5' }, 'total_pages')).toBe(null);
  });

  it('returns null for non-string non-number values', () => {
    expect(getTotalPages({ total_pages: true }, 'total_pages')).toBe(null);
    expect(getTotalPages({ total_pages: [] }, 'total_pages')).toBe(null);
  });

  it('uses custom key name', () => {
    expect(getTotalPages({ pages: 100 }, 'pages')).toBe(100);
  });
});

describe('getPausedAt', () => {
  it('returns null when key is missing', () => {
    expect(getPausedAt({}, 'paused_at')).toBe(null);
  });

  it('returns null for null value', () => {
    expect(getPausedAt({ paused_at: null }, 'paused_at')).toBe(null);
  });

  it('returns string value directly', () => {
    expect(getPausedAt({ paused_at: '2024-01-15T10:00:00Z' }, 'paused_at')).toBe('2024-01-15T10:00:00Z');
  });

  it('converts Date object to ISO string', () => {
    const date = new Date('2024-06-15T14:30:00Z');
    expect(getPausedAt({ paused_at: date }, 'paused_at')).toBe('2024-06-15T14:30:00.000Z');
  });

  it('returns null for numeric values', () => {
    expect(getPausedAt({ paused_at: 12345 }, 'paused_at')).toBe(null);
  });

  it('returns null for boolean values', () => {
    expect(getPausedAt({ paused_at: true }, 'paused_at')).toBe(null);
  });

  it('uses custom key name', () => {
    expect(getPausedAt({ custom_paused: '2024-01-01' }, 'custom_paused')).toBe('2024-01-01');
  });
});

describe('getPaused', () => {
  it('returns false when key is missing', () => {
    expect(getPaused({}, 'paused')).toBe(false);
  });

  it('handles boolean true', () => {
    expect(getPaused({ paused: true }, 'paused')).toBe(true);
  });

  it('handles boolean false', () => {
    expect(getPaused({ paused: false }, 'paused')).toBe(false);
  });

  it('handles string "true"', () => {
    expect(getPaused({ paused: 'true' }, 'paused')).toBe(true);
  });

  it('handles string "false"', () => {
    expect(getPaused({ paused: 'false' }, 'paused')).toBe(false);
  });

  it('returns false for other values', () => {
    expect(getPaused({ paused: 1 }, 'paused')).toBe(false);
    expect(getPaused({ paused: 'yes' }, 'paused')).toBe(false);
    expect(getPaused({ paused: null }, 'paused')).toBe(false);
  });
});

describe('getReaderPreferences', () => {
  it('returns null when key is missing', () => {
    expect(getReaderPreferences({}, 'reader_preferences')).toBe(null);
  });

  it('returns null for non-object values', () => {
    expect(getReaderPreferences({ reader_preferences: 'string' }, 'reader_preferences')).toBe(null);
    expect(getReaderPreferences({ reader_preferences: 42 }, 'reader_preferences')).toBe(null);
    expect(getReaderPreferences({ reader_preferences: null }, 'reader_preferences')).toBe(null);
  });

  it('returns null when object has no valid preferences', () => {
    expect(getReaderPreferences({ reader_preferences: { invalid_key: 'value' } }, 'reader_preferences')).toBe(null);
  });

  it('parses zoom level within range', () => {
    const result = getReaderPreferences({ reader_preferences: { zoom_level: 1.5 } }, 'reader_preferences');
    expect(result).toEqual({ zoomLevel: 1.5 });
  });

  it('clamps zoom level to minimum (0.25)', () => {
    const result = getReaderPreferences({ reader_preferences: { zoom_level: 0.1 } }, 'reader_preferences');
    expect(result).toEqual({ zoomLevel: 0.25 });
  });

  it('clamps zoom level to maximum (5.0)', () => {
    const result = getReaderPreferences({ reader_preferences: { zoom_level: 10 } }, 'reader_preferences');
    expect(result).toEqual({ zoomLevel: 5 });
  });

  it('parses valid zoom modes', () => {
    expect(getReaderPreferences({ reader_preferences: { zoom_mode: 'fit-width' } }, 'reader_preferences'))
      .toEqual({ zoomMode: 'fit-width' });
    expect(getReaderPreferences({ reader_preferences: { zoom_mode: 'fit-page' } }, 'reader_preferences'))
      .toEqual({ zoomMode: 'fit-page' });
    expect(getReaderPreferences({ reader_preferences: { zoom_mode: 'custom' } }, 'reader_preferences'))
      .toEqual({ zoomMode: 'custom' });
  });

  it('ignores invalid zoom modes', () => {
    expect(getReaderPreferences({ reader_preferences: { zoom_mode: 'invalid' } }, 'reader_preferences')).toBe(null);
  });

  it('parses valid themes', () => {
    expect(getReaderPreferences({ reader_preferences: { theme: 'light' } }, 'reader_preferences'))
      .toEqual({ theme: 'light' });
    expect(getReaderPreferences({ reader_preferences: { theme: 'dark' } }, 'reader_preferences'))
      .toEqual({ theme: 'dark' });
    expect(getReaderPreferences({ reader_preferences: { theme: 'sepia' } }, 'reader_preferences'))
      .toEqual({ theme: 'sepia' });
    expect(getReaderPreferences({ reader_preferences: { theme: 'eink' } }, 'reader_preferences'))
      .toEqual({ theme: 'eink' });
  });

  it('ignores invalid themes', () => {
    expect(getReaderPreferences({ reader_preferences: { theme: 'neon' } }, 'reader_preferences')).toBe(null);
  });

  it('parses font size and clamps to range (8-48)', () => {
    expect(getReaderPreferences({ reader_preferences: { font_size: 18 } }, 'reader_preferences'))
      .toEqual({ fontSize: 18 });
    expect(getReaderPreferences({ reader_preferences: { font_size: 2 } }, 'reader_preferences'))
      .toEqual({ fontSize: 8 });
    expect(getReaderPreferences({ reader_preferences: { font_size: 100 } }, 'reader_preferences'))
      .toEqual({ fontSize: 48 });
  });

  it('rounds font size to integer', () => {
    expect(getReaderPreferences({ reader_preferences: { font_size: 16.7 } }, 'reader_preferences'))
      .toEqual({ fontSize: 17 });
  });

  it('parses line height and clamps to range (1.0-3.0)', () => {
    expect(getReaderPreferences({ reader_preferences: { line_height: 1.6 } }, 'reader_preferences'))
      .toEqual({ lineHeight: 1.6 });
    expect(getReaderPreferences({ reader_preferences: { line_height: 0.5 } }, 'reader_preferences'))
      .toEqual({ lineHeight: 1 });
    expect(getReaderPreferences({ reader_preferences: { line_height: 5 } }, 'reader_preferences'))
      .toEqual({ lineHeight: 3 });
  });

  it('parses daily goal minutes and clamps to range (1-1440)', () => {
    expect(getReaderPreferences({ reader_preferences: { daily_goal_minutes: 60 } }, 'reader_preferences'))
      .toEqual({ dailyGoalMinutes: 60 });
    expect(getReaderPreferences({ reader_preferences: { daily_goal_minutes: 0 } }, 'reader_preferences'))
      .toEqual({ dailyGoalMinutes: 1 });
    expect(getReaderPreferences({ reader_preferences: { daily_goal_minutes: 2000 } }, 'reader_preferences'))
      .toEqual({ dailyGoalMinutes: 1440 });
  });

  it('parses all preferences together', () => {
    const result = getReaderPreferences({
      reader_preferences: {
        zoom_level: 1.25,
        zoom_mode: 'fit-width',
        theme: 'dark',
        font_size: 18,
        line_height: 1.6,
        daily_goal_minutes: 45,
      },
    }, 'reader_preferences');

    expect(result).toEqual({
      zoomLevel: 1.25,
      zoomMode: 'fit-width',
      theme: 'dark',
      fontSize: 18,
      lineHeight: 1.6,
      dailyGoalMinutes: 45,
    });
  });

  it('ignores non-number zoom_level', () => {
    expect(getReaderPreferences({ reader_preferences: { zoom_level: 'big' } }, 'reader_preferences')).toBe(null);
  });

  it('ignores non-number font_size', () => {
    expect(getReaderPreferences({ reader_preferences: { font_size: 'large' } }, 'reader_preferences')).toBe(null);
  });
});

describe('getCSLMetadata', () => {
  it('returns null when no CSL fields are present', () => {
    expect(getCSLMetadata({})).toBe(null);
    expect(getCSLMetadata({ title: 'Just a title' })).toBe(null);
  });

  it('parses string CSL fields', () => {
    const result = getCSLMetadata({
      type: 'book',
      publisher: 'Penguin Books',
      'publisher-place': 'New York',
      ISBN: '978-0-14-028329-7',
      edition: '3rd',
    });

    expect(result).not.toBe(null);
    expect(result!.type).toBe('book');
    expect(result!.publisher).toBe('Penguin Books');
    expect(result!.publisherPlace).toBe('New York');
    expect(result!.isbn).toBe('978-0-14-028329-7');
    expect(result!.edition).toBe('3rd');
  });

  it('parses container-title', () => {
    const result = getCSLMetadata({
      'container-title': 'Nature',
    });

    expect(result).not.toBe(null);
    expect(result!.containerTitle).toBe('Nature');
  });

  it('parses collection-title', () => {
    const result = getCSLMetadata({
      'collection-title': 'Oxford Studies',
    });

    expect(result).not.toBe(null);
    expect(result!.collectionTitle).toBe('Oxford Studies');
  });

  it('parses volume, issue, and page', () => {
    const result = getCSLMetadata({
      volume: '42',
      issue: '3',
      page: '100-120',
    });

    expect(result).not.toBe(null);
    expect(result!.volume).toBe('42');
    expect(result!.issue).toBe('3');
    expect(result!.page).toBe('100-120');
  });

  it('converts numeric values to strings', () => {
    const result = getCSLMetadata({
      volume: 42,
      issue: 3,
    });

    expect(result).not.toBe(null);
    expect(result!.volume).toBe('42');
    expect(result!.issue).toBe('3');
  });

  it('parses URL field', () => {
    const result = getCSLMetadata({
      URL: 'https://example.com/paper',
    });

    expect(result).not.toBe(null);
    expect(result!.url).toBe('https://example.com/paper');
  });

  it('parses DOI from direct field', () => {
    const result = getCSLMetadata({
      DOI: '10.1038/nature12373',
    });

    expect(result).not.toBe(null);
    expect(result!.doi).toBe('10.1038/nature12373');
  });

  it('parses DOI from lowercase doi field', () => {
    const result = getCSLMetadata({
      doi: '10.1038/nature12373',
    });

    expect(result).not.toBe(null);
    expect(result!.doi).toBe('10.1038/nature12373');
  });

  it('extracts DOI from note field', () => {
    const result = getCSLMetadata({
      note: 'Some note text. DOI: 10.1038/nature12373 more text',
    });

    expect(result).not.toBe(null);
    expect(result!.doi).toBe('10.1038/nature12373');
  });

  it('parses CSL issued date-parts format (year-month-day)', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': [[2023, 1, 15]] },
    });

    expect(result).not.toBe(null);
    expect(result!.issued).toBe('2023-01-15');
  });

  it('parses CSL issued date-parts format (year-month only)', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': [[2023, 6]] },
    });

    expect(result).not.toBe(null);
    expect(result!.issued).toBe('2023-06');
  });

  it('parses CSL issued date-parts format (year only)', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': [[2023]] },
    });

    expect(result).not.toBe(null);
    expect(result!.issued).toBe('2023');
  });

  it('falls back to year field when issued is missing', () => {
    const result = getCSLMetadata({
      year: 2020,
    });

    expect(result).not.toBe(null);
    expect(result!.issued).toBe('2020');
  });

  it('falls back to string year field', () => {
    const result = getCSLMetadata({
      year: '2020',
    });

    expect(result).not.toBe(null);
    expect(result!.issued).toBe('2020');
  });

  it('parses translator as string', () => {
    const result = getCSLMetadata({
      translator: 'John Smith',
    });

    expect(result).not.toBe(null);
    expect(result!.translator).toBe('John Smith');
  });

  it('parses translator as array of person objects', () => {
    const result = getCSLMetadata({
      translator: [
        { given: 'John', family: 'Smith' },
        { given: 'Jane', family: 'Doe' },
      ],
    });

    expect(result).not.toBe(null);
    expect(result!.translator).toBe('John Smith, Jane Doe');
  });

  it('uses event-place as fallback for publisher-place', () => {
    const result = getCSLMetadata({
      'event-place': 'London',
    });

    expect(result).not.toBe(null);
    expect(result!.publisherPlace).toBe('London');
  });

  it('prefers publisher-place over event-place', () => {
    const result = getCSLMetadata({
      'publisher-place': 'New York',
      'event-place': 'London',
    });

    expect(result).not.toBe(null);
    expect(result!.publisherPlace).toBe('New York');
  });

  it('handles empty strings as null', () => {
    const result = getCSLMetadata({
      publisher: '',
      ISBN: '   ',
    });

    // Empty/whitespace strings should be treated as null
    // If no CSL values found, returns null
    expect(result).toBe(null);
  });

  it('parses complete CSL metadata', () => {
    const result = getCSLMetadata({
      type: 'article-journal',
      'container-title': 'Nature',
      publisher: 'Nature Publishing Group',
      'publisher-place': 'London',
      issued: { 'date-parts': [[2023, 6, 15]] },
      ISBN: '978-0-14-028329-7',
      DOI: '10.1038/nature12373',
      URL: 'https://nature.com/articles/1',
      edition: '1st',
      volume: '598',
      issue: '7880',
      page: '270-274',
      'collection-title': 'Reviews',
      translator: 'Anna Schmidt',
    });

    expect(result).not.toBe(null);
    expect(result!.type).toBe('article-journal');
    expect(result!.containerTitle).toBe('Nature');
    expect(result!.publisher).toBe('Nature Publishing Group');
    expect(result!.publisherPlace).toBe('London');
    expect(result!.issued).toBe('2023-06-15');
    expect(result!.isbn).toBe('978-0-14-028329-7');
    expect(result!.doi).toBe('10.1038/nature12373');
    expect(result!.url).toBe('https://nature.com/articles/1');
    expect(result!.edition).toBe('1st');
    expect(result!.volume).toBe('598');
    expect(result!.issue).toBe('7880');
    expect(result!.page).toBe('270-274');
    expect(result!.collectionTitle).toBe('Reviews');
    expect(result!.translator).toBe('Anna Schmidt');
  });
});

describe('addReadingSession', () => {
  const session1: Parameters<typeof addReadingSession>[1] = {
    startTime: '2024-01-15T10:00:00Z',
    endTime: '2024-01-15T11:00:00Z',
    durationMs: 3600000,
    pagesRead: 30,
    startPage: 0,
    endPage: 30,
  };

  const session2: Parameters<typeof addReadingSession>[1] = {
    startTime: '2024-01-16T10:00:00Z',
    endTime: '2024-01-16T11:00:00Z',
    durationMs: 3600000,
    pagesRead: 20,
    startPage: 30,
    endPage: 50,
  };

  it('adds a session to an empty array', () => {
    const result = addReadingSession([], session1);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(session1);
  });

  it('adds a new session and sorts by start time descending', () => {
    const result = addReadingSession([session1], session2);
    expect(result).toHaveLength(2);
    expect(result[0].startTime).toBe('2024-01-16T10:00:00Z');
    expect(result[1].startTime).toBe('2024-01-15T10:00:00Z');
  });

  it('does not mutate the original array', () => {
    const original = [session1];
    const result = addReadingSession(original, session2);
    expect(original).toHaveLength(1);
    expect(result).toHaveLength(2);
  });

  it('limits to 100 sessions', () => {
    const sessions = Array.from({ length: 100 }, (_, i) => ({
      startTime: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      endTime: `2024-01-${String(i + 1).padStart(2, '0')}T11:00:00Z`,
      durationMs: 3600000,
      pagesRead: 10,
      startPage: i * 10,
      endPage: (i + 1) * 10,
    }));

    const newSession = {
      startTime: '2024-05-01T10:00:00Z',
      endTime: '2024-05-01T11:00:00Z',
      durationMs: 3600000,
      pagesRead: 10,
      startPage: 1000,
      endPage: 1010,
    };

    const result = addReadingSession(sessions, newSession);
    expect(result).toHaveLength(100);
    // The newest session should be first
    expect(result[0].startTime).toBe('2024-05-01T10:00:00Z');
  });

  it('keeps most recent sessions when over limit', () => {
    const sessions = Array.from({ length: 100 }, (_, i) => ({
      startTime: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      endTime: `2024-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}T11:00:00Z`,
      durationMs: 3600000,
      pagesRead: 10,
      startPage: i * 10,
      endPage: (i + 1) * 10,
    }));

    const newSession = {
      startTime: '2025-01-01T10:00:00Z',
      endTime: '2025-01-01T11:00:00Z',
      durationMs: 3600000,
      pagesRead: 10,
      startPage: 1000,
      endPage: 1010,
    };

    const result = addReadingSession(sessions, newSession);
    expect(result).toHaveLength(100);
    // Oldest session should be dropped
    expect(result[0].startTime).toBe('2025-01-01T10:00:00Z');
  });
});

describe('createReaderPreferencesForFrontmatter', () => {
  it('converts all preference fields to frontmatter format', () => {
    const result = createReaderPreferencesForFrontmatter({
      zoomLevel: 1.5,
      zoomMode: 'fit-width',
      theme: 'dark',
      fontSize: 18,
      lineHeight: 1.6,
      dailyGoalMinutes: 45,
    });

    expect(result.zoom_level).toBe(1.5);
    expect(result.zoom_mode).toBe('fit-width');
    expect(result.theme).toBe('dark');
    expect(result.font_size).toBe(18);
    expect(result.line_height).toBe(1.6);
    expect(result.daily_goal_minutes).toBe(45);
  });

  it('omits undefined fields', () => {
    const result = createReaderPreferencesForFrontmatter({
      zoomLevel: 1.25,
    });

    expect(result.zoom_level).toBe(1.25);
    expect(result).not.toHaveProperty('zoom_mode');
    expect(result).not.toHaveProperty('theme');
    expect(result).not.toHaveProperty('font_size');
    expect(result).not.toHaveProperty('line_height');
    expect(result).not.toHaveProperty('daily_goal_minutes');
  });

  it('returns empty object when all fields are undefined', () => {
    const result = createReaderPreferencesForFrontmatter({});

    expect(Object.keys(result)).toHaveLength(0);
  });

  it('rounds zoom level to 2 decimal places', () => {
    const result = createReaderPreferencesForFrontmatter({
      zoomLevel: 1.33333,
    });

    expect(result.zoom_level).toBe(1.33);
  });

  it('rounds line height to 1 decimal place', () => {
    const result = createReaderPreferencesForFrontmatter({
      lineHeight: 1.666,
    });

    expect(result.line_height).toBe(1.7);
  });

  it('passes through integer font size unchanged', () => {
    const result = createReaderPreferencesForFrontmatter({
      fontSize: 16,
    });

    expect(result.font_size).toBe(16);
  });

  it('handles each zoom mode value', () => {
    for (const mode of ['fit-width', 'fit-page', 'custom'] as const) {
      const result = createReaderPreferencesForFrontmatter({ zoomMode: mode });
      expect(result.zoom_mode).toBe(mode);
    }
  });

  it('handles each theme value', () => {
    for (const theme of ['light', 'dark', 'sepia', 'eink'] as const) {
      const result = createReaderPreferencesForFrontmatter({ theme });
      expect(result.theme).toBe(theme);
    }
  });
});

describe('getCurrentChapter', () => {
  it('returns null when key is missing', () => {
    expect(getCurrentChapter({}, 'current_chapter')).toBeNull();
  });

  it('returns string chapter name', () => {
    expect(getCurrentChapter({ current_chapter: 'Chapter 5: The Journey' }, 'current_chapter'))
      .toBe('Chapter 5: The Journey');
  });

  it('trims whitespace from chapter name', () => {
    expect(getCurrentChapter({ current_chapter: '  Chapter 1  ' }, 'current_chapter'))
      .toBe('Chapter 1');
  });

  it('returns null for empty string', () => {
    expect(getCurrentChapter({ current_chapter: '' }, 'current_chapter')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(getCurrentChapter({ current_chapter: '   ' }, 'current_chapter')).toBeNull();
  });

  it('returns null for non-string values', () => {
    expect(getCurrentChapter({ current_chapter: 42 }, 'current_chapter')).toBeNull();
    expect(getCurrentChapter({ current_chapter: true }, 'current_chapter')).toBeNull();
    expect(getCurrentChapter({ current_chapter: null }, 'current_chapter')).toBeNull();
    expect(getCurrentChapter({ current_chapter: undefined }, 'current_chapter')).toBeNull();
    expect(getCurrentChapter({ current_chapter: ['Chapter 1'] }, 'current_chapter')).toBeNull();
  });

  it('uses custom key name', () => {
    expect(getCurrentChapter({ chapter: 'Prologue' }, 'chapter')).toBe('Prologue');
  });
});

describe('getReadingStats (estimated_completion and avg_daily_reading_ms)', () => {
  it('parses estimated_completion as Date object', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        estimated_completion: new Date('2024-06-15T10:30:00Z'),
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.estimatedCompletionDate).toBe('2024-06-15');
  });

  it('parses estimated_completion as ISO date string', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        estimated_completion: '2024-06-15T10:30:00Z',
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.estimatedCompletionDate).toBe('2024-06-15');
  });

  it('parses estimated_completion as YYYY-MM-DD string', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        estimated_completion: '2024-06-15',
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.estimatedCompletionDate).toBe('2024-06-15');
  });

  it('returns null for invalid estimated_completion string', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        estimated_completion: 'not-a-date',
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.estimatedCompletionDate).toBeNull();
  });

  it('returns null for missing estimated_completion', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.estimatedCompletionDate).toBeNull();
  });

  it('parses avg_daily_reading_ms', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 7200000,
        total_sessions: 10,
        avg_daily_reading_ms: 1800000,
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.averageDailyReadingMs).toBe(1800000);
  });

  it('returns null for missing avg_daily_reading_ms', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.averageDailyReadingMs).toBeNull();
  });

  it('returns null for non-number avg_daily_reading_ms', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        avg_daily_reading_ms: 'not-a-number',
      },
    }, 'reading_stats');

    expect(stats).not.toBeNull();
    expect(stats!.averageDailyReadingMs).toBeNull();
  });

  it('clamps negative momentum_score to -100', () => {
    const stats = getReadingStats({
      reading_stats: {
        total_time_ms: 3600000,
        total_sessions: 5,
        momentum_score: -200,
      },
    }, 'reading_stats');

    expect(stats!.momentumScore).toBe(-100);
  });
});

describe('getReadingSessions (edge cases)', () => {
  it('parses start and end as Date objects', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: new Date('2024-01-15T10:00:00Z'),
          end: new Date('2024-01-15T11:00:00Z'),
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].startTime).toBe('2024-01-15T10:00:00.000Z');
    expect(sessions[0].endTime).toBe('2024-01-15T11:00:00.000Z');
  });

  it('skips sessions with invalid start time', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: 'not-a-date',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
        },
        {
          start: '2024-01-16T10:00:00Z',
          end: '2024-01-16T11:00:00Z',
          duration_ms: 3600000,
          pages: 20,
          start_page: 30,
          end_page: 50,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].startTime).toBe('2024-01-16T10:00:00.000Z');
  });

  it('skips sessions with invalid end time', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-15T10:00:00Z',
          end: 'invalid',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(0);
  });

  it('skips sessions with missing start or end', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        { end: '2024-01-15T11:00:00Z', duration_ms: 3600000 },
        { start: '2024-01-15T10:00:00Z', duration_ms: 3600000 },
        { duration_ms: 3600000 },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(0);
  });

  it('defaults numeric fields to 0 when missing', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          // Missing: duration_ms, pages, start_page, end_page
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBe(0);
    expect(sessions[0].pagesRead).toBe(0);
    expect(sessions[0].startPage).toBe(0);
    expect(sessions[0].endPage).toBe(0);
  });

  it('rejects negative idle_pause_count', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
          idle_pause_count: -1,
          idle_pause_total_ms: -500,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
    expect(sessions[0].idlePauseCount).toBeUndefined();
    expect(sessions[0].idlePauseTotalMs).toBeUndefined();
  });

  it('skips null and non-object entries', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        null,
        'invalid',
        123,
        undefined,
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 30,
          start_page: 0,
          end_page: 30,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(1);
  });

  it('sorts multiple sessions by start time descending', () => {
    const sessions = getReadingSessions({
      reading_sessions: [
        {
          start: '2024-01-10T10:00:00Z',
          end: '2024-01-10T11:00:00Z',
          duration_ms: 3600000,
          pages: 10,
          start_page: 0,
          end_page: 10,
        },
        {
          start: '2024-01-20T10:00:00Z',
          end: '2024-01-20T11:00:00Z',
          duration_ms: 3600000,
          pages: 20,
          start_page: 10,
          end_page: 30,
        },
        {
          start: '2024-01-15T10:00:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 3600000,
          pages: 15,
          start_page: 0,
          end_page: 15,
        },
      ],
    }, 'reading_sessions');

    expect(sessions).toHaveLength(3);
    expect(sessions[0].startTime).toBe('2024-01-20T10:00:00.000Z');
    expect(sessions[1].startTime).toBe('2024-01-15T10:00:00.000Z');
    expect(sessions[2].startTime).toBe('2024-01-10T10:00:00.000Z');
  });
});

describe('createReadingStatsForFrontmatter (estimated_completion and avg_daily_reading_ms)', () => {
  it('includes estimated_completion when present', () => {
    const result = createReadingStatsForFrontmatter({
      totalReadingTimeMs: 3600000,
      totalSessions: 5,
      averageSessionMs: 720000,
      firstReadDate: '2024-01-15T10:00:00Z',
      pagesPerHour: null,
      totalPagesRead: 0,
      longestSessionMs: null,
      estimatedCompletionDate: '2024-06-15',
      averageDailyReadingMs: null,
    });

    expect(result.estimated_completion).toBe('2024-06-15');
  });

  it('omits estimated_completion when null', () => {
    const result = createReadingStatsForFrontmatter({
      totalReadingTimeMs: 3600000,
      totalSessions: 5,
      averageSessionMs: 720000,
      firstReadDate: '2024-01-15T10:00:00Z',
      pagesPerHour: null,
      totalPagesRead: 0,
      longestSessionMs: null,
      estimatedCompletionDate: null,
      averageDailyReadingMs: null,
    });

    expect(result).not.toHaveProperty('estimated_completion');
  });

  it('includes avg_daily_reading_ms when present', () => {
    const result = createReadingStatsForFrontmatter({
      totalReadingTimeMs: 3600000,
      totalSessions: 5,
      averageSessionMs: 720000,
      firstReadDate: '2024-01-15T10:00:00Z',
      pagesPerHour: null,
      totalPagesRead: 0,
      longestSessionMs: null,
      estimatedCompletionDate: null,
      averageDailyReadingMs: 1800000,
    });

    expect(result.avg_daily_reading_ms).toBe(1800000);
  });

  it('omits avg_daily_reading_ms when null', () => {
    const result = createReadingStatsForFrontmatter({
      totalReadingTimeMs: 3600000,
      totalSessions: 5,
      averageSessionMs: 720000,
      firstReadDate: '2024-01-15T10:00:00Z',
      pagesPerHour: null,
      totalPagesRead: 0,
      longestSessionMs: null,
      estimatedCompletionDate: null,
      averageDailyReadingMs: null,
    });

    expect(result).not.toHaveProperty('avg_daily_reading_ms');
  });
});

// =============================================================================
// Edge case and branch coverage tests
// =============================================================================

describe('hasTag (edge cases)', () => {
  it('returns false when tags is a non-array, non-string truthy value', () => {
    expect(hasTag({ tags: 123 }, 'literature_note')).toBe(false);
    expect(hasTag({ tags: true }, 'literature_note')).toBe(false);
    expect(hasTag({ tags: {} }, 'literature_note')).toBe(false);
  });
});

describe('getSourcePath (edge cases)', () => {
  it('returns null when array source has a non-string first element', () => {
    expect(getSourcePath({ attachment: [123] }, 'attachment')).toBeNull();
    expect(getSourcePath({ attachment: [null] }, 'attachment')).toBeNull();
    expect(getSourcePath({ attachment: [true] }, 'attachment')).toBeNull();
  });

  it('returns null for an empty array source', () => {
    expect(getSourcePath({ source: [] }, 'source')).toBeNull();
  });

  it('returns null for non-string, non-array source value', () => {
    expect(getSourcePath({ source: 42 }, 'source')).toBeNull();
    expect(getSourcePath({ source: true }, 'source')).toBeNull();
  });
});

describe('getProgress (edge cases)', () => {
  it('returns 0 for non-number, non-string truthy progress values', () => {
    expect(getProgress({ progress: true }, 'progress')).toBe(0);
    expect(getProgress({ progress: [] }, 'progress')).toBe(0);
    expect(getProgress({ progress: {} }, 'progress')).toBe(0);
  });

  it('returns 0 for NaN string progress', () => {
    expect(getProgress({ progress: 'not-a-number' }, 'progress')).toBe(0);
  });
});

describe('getLastRead (edge cases)', () => {
  it('returns null for non-string, non-Date truthy values', () => {
    expect(getLastRead({ last_read: 42 }, 'last_read')).toBeNull();
    expect(getLastRead({ last_read: true }, 'last_read')).toBeNull();
    expect(getLastRead({ last_read: [] }, 'last_read')).toBeNull();
  });
});

describe('getDateCreated (edge cases)', () => {
  it('returns null for invalid date strings', () => {
    expect(getDateCreated({ date_created: 'not-a-date' }, 'date_created')).toBeNull();
    expect(getDateCreated({ date_created: '' }, 'date_created')).toBeNull();
  });

  it('returns null for non-string, non-Date truthy values', () => {
    expect(getDateCreated({ date_created: 42 }, 'date_created')).toBeNull();
    expect(getDateCreated({ date_created: true }, 'date_created')).toBeNull();
  });
});

describe('getDateFinished (edge cases)', () => {
  it('returns null for non-string, non-Date truthy values', () => {
    expect(getDateFinished({ date_finished: 42 }, 'date_finished')).toBeNull();
    expect(getDateFinished({ date_finished: true }, 'date_finished')).toBeNull();
    expect(getDateFinished({ date_finished: {} }, 'date_finished')).toBeNull();
  });
});

describe('getCollections (edge cases)', () => {
  it('returns empty array for comma-only strings', () => {
    expect(getCollections({ collections: ',' }, 'collections')).toEqual([]);
    expect(getCollections({ collections: ',,,' }, 'collections')).toEqual([]);
    expect(getCollections({ collections: ' , , ' }, 'collections')).toEqual([]);
  });

  it('returns empty array for non-array, non-string truthy values', () => {
    expect(getCollections({ collections: 42 }, 'collections')).toEqual([]);
    expect(getCollections({ collections: true }, 'collections')).toEqual([]);
  });

  it('filters out non-string elements from array', () => {
    expect(getCollections({ collections: [123, null, 'valid'] }, 'collections')).toEqual(['valid']);
  });

  it('filters out empty/whitespace-only strings from array', () => {
    expect(getCollections({ collections: ['', '  ', 'valid'] }, 'collections')).toEqual(['valid']);
  });
});

describe('getTitle (edge cases)', () => {
  it('falls back to filename when title is a non-string value', () => {
    expect(getTitle({ title: 42 }, 'my-book.md')).toBe('my-book');
    expect(getTitle({ title: null }, 'my-book.md')).toBe('my-book');
    expect(getTitle({ title: true }, 'my-book.md')).toBe('my-book');
  });
});

describe('getBookmarks (edge cases)', () => {
  it('skips object bookmarks without a link property', () => {
    const result = getBookmarks(
      { bookmarks: [{ notes: 'some notes but no link' }] },
      'bookmarks',
    );
    expect(result).toEqual([]);
  });

  it('skips bookmarks that are boolean or null', () => {
    const result = getBookmarks(
      { bookmarks: [true, false, null, undefined] },
      'bookmarks',
    );
    expect(result).toEqual([]);
  });

  it('skips bookmarks whose wikilink has no fragment', () => {
    const result = getBookmarks(
      { bookmarks: ['[[source.pdf|Chapter 1]]'] },
      'bookmarks',
    );
    // No # fragment, so fragmentMatch is null → continue
    expect(result).toEqual([]);
  });
});

describe('bookmarkToWikilink (edge cases)', () => {
  it('creates wikilink without fragment when neither page nor cfi is provided', () => {
    const result = bookmarkToWikilink('source.pdf', {
      label: 'My Bookmark',
      createdAt: '2024-01-15T00:00:00.000Z',
    });
    expect(result).toBe('[[source.pdf|My Bookmark|2024-01-15T00:00:00.000Z]]');
  });
});

describe('bookmarkToFrontmatter (edge cases)', () => {
  it('returns string when notes is undefined', () => {
    const result = bookmarkToFrontmatter('source.pdf', {
      label: 'My Bookmark',
      page: 10,
      createdAt: '2024-01-15T00:00:00.000Z',
    });
    expect(typeof result).toBe('string');
  });
});

describe('getReadingStats (edge cases)', () => {
  it('returns null for first_read that is an invalid date string', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        first_read: 'not-a-date',
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.firstReadDate).toBeNull();
  });

  it('falls back to 0 when total_time_ms is not a number', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 'three thousand',
        total_sessions: 1,
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.totalReadingTimeMs).toBe(0);
  });

  it('falls back to 0 when total_sessions is not a number', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 'five',
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.totalSessions).toBe(0);
    expect(result!.averageSessionMs).toBe(0);
  });

  it('returns null for stat fields that are non-number', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        pages_per_hour: 'fast',
        total_pages: 'many',
        longest_session_ms: 'long',
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.pagesPerHour).toBeNull();
    expect(result!.totalPagesRead).toBe(0);
    expect(result!.longestSessionMs).toBeNull();
  });

  it('skips milestone entries that are not objects', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        milestones: ['not-an-object', 42, null],
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.milestones).toBeUndefined();
  });

  it('skips milestones with invalid milestone numbers', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        milestones: [
          { milestone: 30, reached_at: '2024-01-15T00:00:00Z', days_from_start: 5, total_time_ms: 500 },
          { milestone: 99, reached_at: '2024-01-15T00:00:00Z', days_from_start: 5, total_time_ms: 500 },
        ],
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.milestones).toBeUndefined();
  });

  it('uses fallback values for malformed milestone fields', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        milestones: [
          { milestone: 25, reached_at: 12345, days_from_start: 'five', total_time_ms: 'many' },
        ],
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.milestones).toHaveLength(1);
    const milestone = result!.milestones![0];
    // reached_at falls back to current ISO date since 12345 is not a string
    expect(typeof milestone.reachedAt).toBe('string');
    // days_from_start falls back to null since 'five' is not a number
    expect(milestone.daysFromStart).toBeNull();
    // totalReadingTimeMs falls back to 0 since 'many' is not a number
    expect(milestone.totalReadingTimeMs).toBe(0);
  });

  it('ignores invalid momentum values', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        momentum: 'zooming',
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.momentum).toBeUndefined();
  });

  it('clamps momentum_score to valid range', () => {
    const result = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        momentum_score: 999,
      },
    }, 'reading_stats');

    expect(result).not.toBeNull();
    expect(result!.momentumScore).toBe(100);

    const result2 = getReadingStats({
      reading_stats: {
        total_time_ms: 1000,
        total_sessions: 1,
        momentum_score: -999,
      },
    }, 'reading_stats');

    expect(result2).not.toBeNull();
    expect(result2!.momentumScore).toBe(-100);
  });
});

describe('getReaderPreferences (edge cases)', () => {
  it('ignores non-string zoom_mode values', () => {
    const result = getReaderPreferences({
      reader_preferences: { zoom_mode: 42 },
    }, 'reader_preferences');

    // zoom_mode skipped → no valid preferences → null
    expect(result).toBeNull();
  });

  it('ignores non-string theme values', () => {
    const result = getReaderPreferences({
      reader_preferences: { theme: 42 },
    }, 'reader_preferences');

    expect(result).toBeNull();
  });

  it('ignores non-number line_height values', () => {
    const result = getReaderPreferences({
      reader_preferences: { line_height: 'tall' },
    }, 'reader_preferences');

    expect(result).toBeNull();
  });

  it('ignores non-number daily_goal_minutes values', () => {
    const result = getReaderPreferences({
      reader_preferences: { daily_goal_minutes: 'sixty' },
    }, 'reader_preferences');

    expect(result).toBeNull();
  });

  it('ignores invalid zoom_mode string values', () => {
    const result = getReaderPreferences({
      reader_preferences: { zoom_mode: 'zoom-in' },
    }, 'reader_preferences');

    expect(result).toBeNull();
  });

  it('ignores invalid theme string values', () => {
    const result = getReaderPreferences({
      reader_preferences: { theme: 'neon' },
    }, 'reader_preferences');

    expect(result).toBeNull();
  });
});

describe('getCSLMetadata (edge cases)', () => {
  it('returns null for issued with empty date-parts array', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': [] },
    });

    expect(result).toBeNull();
  });

  it('returns null for issued with empty inner date-parts array', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': [[]] },
    });

    expect(result).toBeNull();
  });

  it('returns null for issued with non-array inner date-parts', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': ['not-an-array'] },
    });

    expect(result).toBeNull();
  });

  it('returns null for issued with non-number/non-string year', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': [[null]] },
    });

    expect(result).toBeNull();
  });

  it('handles string values in date-parts', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': [['2023', '6', '15']] },
    });

    expect(result).not.toBeNull();
    expect(result!.issued).toBe('2023-06-15');
  });

  it('returns null for issued as non-date-parts object and no year field', () => {
    const result = getCSLMetadata({
      issued: { invalid: 'data' },
    });

    expect(result).toBeNull();
  });

  it('returns null for date-parts that is not an array', () => {
    const result = getCSLMetadata({
      issued: { 'date-parts': 'invalid' },
    });

    expect(result).toBeNull();
  });

  it('returns null for note field that is not a string', () => {
    // Non-string note → DOI extraction skipped
    const result = getCSLMetadata({
      note: 42,
    });

    expect(result).toBeNull();
  });

  it('returns null for translator as array of unparseable items', () => {
    const result = getCSLMetadata({
      translator: [null, undefined, 42],
    });

    expect(result).toBeNull();
  });

  it('returns null for translator as object with no recognized fields', () => {
    const result = getCSLMetadata({
      translator: { foo: 'bar' },
    });

    expect(result).toBeNull();
  });
});

describe('getAuthor (edge cases)', () => {
  it('returns null for author object with empty literal field', () => {
    expect(getAuthor({ author: { literal: '' } }, 'author')).toBeNull();
    expect(getAuthor({ author: { literal: '   ' } }, 'author')).toBeNull();
  });

  it('returns null for author as array of all unparseable values', () => {
    expect(getAuthor({ author: [null, undefined, 42] }, 'author')).toBeNull();
  });

  it('returns null for author object with unrecognized structure', () => {
    expect(getAuthor({ author: { foo: 'bar', baz: 'qux' } }, 'author')).toBeNull();
  });

  it('returns null for author as empty array', () => {
    expect(getAuthor({ author: [] }, 'author')).toBeNull();
  });

  it('handles author object with only first name', () => {
    expect(getAuthor({ author: { first: 'John' } }, 'author')).toBe('John');
  });

  it('handles author object with only last name', () => {
    expect(getAuthor({ author: { last: 'Doe' } }, 'author')).toBe('Doe');
  });

  it('handles author object with only given name (CSL-JSON)', () => {
    expect(getAuthor({ author: { given: 'Jane' } }, 'author')).toBe('Jane');
  });

  it('handles author object with only family name (CSL-JSON)', () => {
    expect(getAuthor({ author: { family: 'Smith' } }, 'author')).toBe('Smith');
  });
});

describe('calculateMomentum (edge cases)', () => {
  it('returns positive momentum when returning from inactivity', () => {
    // Recent 7 days have reading, previous 7 days have none
    const today = new Date();
    const history = [
      {
        date: today.toISOString().split('T')[0],
        durationMs: 1800000,
        sessions: 1,
        pagesRead: 10,
      },
    ];

    const result = calculateMomentum(history);
    expect(result.score).toBeGreaterThan(0);
    // score = 25 (from inactivity return) + 10 (1 active day diff) = 35
    expect(result.momentum).toBe('accelerating');
  });

  it('clamps extreme scores to -100 to 100 range', () => {
    const today = new Date();
    const history: Array<{ date: string; durationMs: number; sessions: number; pagesRead: number }> = [];

    // 7 active days recently, 0 active days previously → large positive score
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        durationMs: 36000000, // 10 hours each
        sessions: 5,
        pagesRead: 100,
      });
    }

    const result = calculateMomentum(history);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(-100);
  });

  it('classifies as inactive when recent period has no reading', () => {
    const today = new Date();
    // Only reading in previous period (days 7-13 ago)
    const history = [];
    for (let i = 7; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        durationMs: 1800000,
        sessions: 1,
        pagesRead: 10,
      });
    }

    const result = calculateMomentum(history);
    expect(result.momentum).toBe('inactive');
  });
});

describe('getDailyReadingHistory (edge cases)', () => {
  it('handles ISO timestamp strings as date values', () => {
    const result = getDailyReadingHistory({
      history: [
        { date: '2024-01-15T10:30:00Z', duration_ms: 1000, sessions: 1, pages: 5 },
      ],
    }, 'history');

    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-15');
  });

  it('skips entries with invalid calendar dates', () => {
    const result = getDailyReadingHistory({
      history: [
        { date: '2024-13-45', duration_ms: 1000, sessions: 1, pages: 5 },
      ],
    }, 'history');

    expect(result).toEqual([]);
  });

  it('skips entries where date is neither string nor Date', () => {
    const result = getDailyReadingHistory({
      history: [
        { date: 42, duration_ms: 1000, sessions: 1, pages: 5 },
        { date: true, duration_ms: 1000, sessions: 1, pages: 5 },
      ],
    }, 'history');

    expect(result).toEqual([]);
  });

  it('skips entries that are not objects', () => {
    const result = getDailyReadingHistory({
      history: ['not-an-object', 42, null, undefined],
    }, 'history');

    expect(result).toEqual([]);
  });

  it('defaults numeric fields to 0 when not numbers', () => {
    const result = getDailyReadingHistory({
      history: [
        { date: '2024-01-15', duration_ms: 'fast', sessions: 'many', pages: 'lots' },
      ],
    }, 'history');

    expect(result).toHaveLength(1);
    expect(result[0].durationMs).toBe(0);
    expect(result[0].sessions).toBe(0);
    expect(result[0].pagesRead).toBe(0);
  });

  it('skips invalid Date objects', () => {
    const result = getDailyReadingHistory({
      history: [
        { date: new Date('invalid'), duration_ms: 1000, sessions: 1, pages: 5 },
      ],
    }, 'history');

    expect(result).toEqual([]);
  });
});

describe('getReadingSessions (edge cases)', () => {
  it('skips sessions where start is not a valid date', () => {
    const result = getReadingSessions({
      sessions: [
        {
          start: 'not-a-date',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 1800000,
          pages: 10,
          start_page: 1,
          end_page: 10,
        },
      ],
    }, 'sessions');

    expect(result).toEqual([]);
  });

  it('skips sessions where end is not a valid date', () => {
    const result = getReadingSessions({
      sessions: [
        {
          start: '2024-01-15T10:30:00Z',
          end: 'not-a-date',
          duration_ms: 1800000,
          pages: 10,
          start_page: 1,
          end_page: 10,
        },
      ],
    }, 'sessions');

    expect(result).toEqual([]);
  });

  it('handles sessions where start and end are Date objects', () => {
    const result = getReadingSessions({
      sessions: [
        {
          start: new Date('2024-01-15T10:30:00Z'),
          end: new Date('2024-01-15T11:00:00Z'),
          duration_ms: 1800000,
          pages: 10,
          start_page: 1,
          end_page: 10,
        },
      ],
    }, 'sessions');

    expect(result).toHaveLength(1);
    expect(result[0].startTime).toBe('2024-01-15T10:30:00.000Z');
    expect(result[0].endTime).toBe('2024-01-15T11:00:00.000Z');
  });

  it('ignores invalid quality values', () => {
    const result = getReadingSessions({
      sessions: [
        {
          start: '2024-01-15T10:30:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 1800000,
          pages: 10,
          start_page: 1,
          end_page: 10,
          quality: 'excellent',
        },
      ],
    }, 'sessions');

    expect(result).toHaveLength(1);
    expect(result[0].quality).toBeUndefined();
  });

  it('ignores negative idle_pause_count and idle_pause_total_ms', () => {
    const result = getReadingSessions({
      sessions: [
        {
          start: '2024-01-15T10:30:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 1800000,
          pages: 10,
          start_page: 1,
          end_page: 10,
          idle_pause_count: -1,
          idle_pause_total_ms: -500,
        },
      ],
    }, 'sessions');

    expect(result).toHaveLength(1);
    expect(result[0].idlePauseCount).toBeUndefined();
    expect(result[0].idlePauseTotalMs).toBeUndefined();
  });

  it('calculates hourOfDay from startTime when not stored', () => {
    const result = getReadingSessions({
      sessions: [
        {
          start: '2024-01-15T14:30:00Z',
          end: '2024-01-15T15:00:00Z',
          duration_ms: 1800000,
          pages: 10,
          start_page: 1,
          end_page: 10,
        },
      ],
    }, 'sessions');

    expect(result).toHaveLength(1);
    expect(result[0].hourOfDay).toBe(new Date('2024-01-15T14:30:00Z').getHours());
  });

  it('defaults numeric fields to 0 when not numbers', () => {
    const result = getReadingSessions({
      sessions: [
        {
          start: '2024-01-15T10:30:00Z',
          end: '2024-01-15T11:00:00Z',
          duration_ms: 'long',
          pages: 'many',
          start_page: 'first',
          end_page: 'last',
        },
      ],
    }, 'sessions');

    expect(result).toHaveLength(1);
    expect(result[0].durationMs).toBe(0);
    expect(result[0].pagesRead).toBe(0);
    expect(result[0].startPage).toBe(0);
    expect(result[0].endPage).toBe(0);
  });
});

describe('getPausedAt (edge cases)', () => {
  it('returns null for non-string, non-Date values', () => {
    expect(getPausedAt({ paused_at: 42 }, 'paused_at')).toBeNull();
    expect(getPausedAt({ paused_at: true }, 'paused_at')).toBeNull();
    expect(getPausedAt({ paused_at: [] }, 'paused_at')).toBeNull();
  });
});

describe('getRating (edge cases)', () => {
  it('clamps fractional ratings to nearest integer', () => {
    expect(getRating({ rating: 3.7 }, 'rating')).toBe(4);
    expect(getRating({ rating: 2.3 }, 'rating')).toBe(2);
  });

  it('clamps ratings below minimum to 1', () => {
    expect(getRating({ rating: 0 }, 'rating')).toBe(1);
    expect(getRating({ rating: -5 }, 'rating')).toBe(1);
  });

  it('clamps ratings above maximum to 5', () => {
    expect(getRating({ rating: 10 }, 'rating')).toBe(5);
    expect(getRating({ rating: 100 }, 'rating')).toBe(5);
  });

  it('parses string ratings and clamps', () => {
    expect(getRating({ rating: '0' }, 'rating')).toBe(1);
    expect(getRating({ rating: '10' }, 'rating')).toBe(5);
    expect(getRating({ rating: '3.7' }, 'rating')).toBe(4);
  });

  it('returns null for non-numeric string ratings', () => {
    expect(getRating({ rating: 'excellent' }, 'rating')).toBeNull();
  });

  it('returns null for non-number, non-string types', () => {
    expect(getRating({ rating: true }, 'rating')).toBeNull();
    expect(getRating({ rating: [] }, 'rating')).toBeNull();
  });
});

describe('getTotalPages (edge cases)', () => {
  it('returns null for zero or negative page count', () => {
    expect(getTotalPages({ total_pages: 0 }, 'total_pages')).toBeNull();
    expect(getTotalPages({ total_pages: -10 }, 'total_pages')).toBeNull();
  });

  it('rounds fractional page counts', () => {
    expect(getTotalPages({ total_pages: 100.7 }, 'total_pages')).toBe(101);
  });

  it('returns null for non-numeric string', () => {
    expect(getTotalPages({ total_pages: 'many' }, 'total_pages')).toBeNull();
  });

  it('returns null for string zero', () => {
    expect(getTotalPages({ total_pages: '0' }, 'total_pages')).toBeNull();
  });

  it('returns null for non-number, non-string types', () => {
    expect(getTotalPages({ total_pages: true }, 'total_pages')).toBeNull();
    expect(getTotalPages({ total_pages: [] }, 'total_pages')).toBeNull();
  });
});
