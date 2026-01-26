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
});
