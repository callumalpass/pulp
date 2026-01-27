import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../api';

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function failedJsonResponse(body: unknown, status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

function failedNonJsonResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
  } as Response);
}

describe('api', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchJSON (via api methods)', () => {
    it('sets Content-Type header when body is present', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, progress: 0.5, lastRead: '2025-01-01' }));

      await api.progress.update('note-1', { progress: 0.5 });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('does not set Content-Type header when no body is present', async () => {
      mockFetch.mockReturnValue(jsonResponse([]));

      await api.library.list();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBeUndefined();
    });

    it('throws error with message from JSON error response', async () => {
      mockFetch.mockReturnValue(failedJsonResponse({ error: 'Note not found' }, 404));

      await expect(api.library.get('bad-id')).rejects.toThrow('Note not found');
    });

    it('throws generic HTTP error when response has no error message', async () => {
      mockFetch.mockReturnValue(failedJsonResponse({}, 500));

      await expect(api.library.get('bad-id')).rejects.toThrow('HTTP 500');
    });

    it('throws fallback error when error response is not valid JSON', async () => {
      mockFetch.mockReturnValue(failedNonJsonResponse(502));

      await expect(api.library.get('bad-id')).rejects.toThrow('Request failed');
    });

    it('prepends /api to all URLs', async () => {
      mockFetch.mockReturnValue(jsonResponse([]));

      await api.library.list();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library');
    });
  });

  describe('library', () => {
    it('lists notes without parameters', async () => {
      mockFetch.mockReturnValue(jsonResponse([]));

      await api.library.list();

      expect(mockFetch).toHaveBeenCalledWith('/api/library', expect.objectContaining({ headers: {} }));
    });

    it('lists notes with sort parameter', async () => {
      mockFetch.mockReturnValue(jsonResponse([]));

      await api.library.list('title');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library?sort=title');
    });

    it('lists notes with sort and order parameters', async () => {
      mockFetch.mockReturnValue(jsonResponse([]));

      await api.library.list('progress', 'asc');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library?sort=progress&order=asc');
    });

    it('gets a single note by ID', async () => {
      const note = { id: 'note-1', title: 'Test' };
      mockFetch.mockReturnValue(jsonResponse(note));

      const result = await api.library.get('note-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/library/note-1', expect.any(Object));
      expect(result).toEqual(note);
    });

    it('gets highlights for a note', async () => {
      mockFetch.mockReturnValue(jsonResponse([]));

      await api.library.getHighlights('note-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/highlights');
    });

    it('gets note content', async () => {
      mockFetch.mockReturnValue(jsonResponse({ content: '# Test' }));

      const result = await api.library.getContent('note-1');

      expect(result).toEqual({ content: '# Test' });
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/content');
    });

    it('updates note content with PUT method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true }));

      await api.library.updateContent('note-1', '# Updated');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/content');
      expect(options.method).toBe('PUT');
      expect(JSON.parse(options.body)).toEqual({ content: '# Updated' });
    });
  });

  describe('progress', () => {
    it('updates progress with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, progress: 0.75, lastRead: '2025-01-01' }));

      await api.progress.update('note-1', { progress: 0.75 });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/progress');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ progress: 0.75 });
    });

    it('includes lastOpenedCfi for EPUB progress', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, progress: 0.5, lastRead: '2025-01-01', lastOpenedCfi: 'epubcfi(/6/4)' }));

      await api.progress.update('note-1', { progress: 0.5, lastOpenedCfi: 'epubcfi(/6/4)' });

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ progress: 0.5, lastOpenedCfi: 'epubcfi(/6/4)' });
    });
  });

  describe('pin', () => {
    it('updates pin status with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, pinned: true }));

      await api.pin.update('note-1', { pinned: true });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/pin');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ pinned: true });
    });
  });

  describe('rating', () => {
    it('updates rating with a numeric value', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, rating: 4 }));

      await api.rating.update('note-1', { rating: 4 });

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ rating: 4 });
    });

    it('clears rating with null value', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, rating: null }));

      await api.rating.update('note-1', { rating: null });

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ rating: null });
    });
  });

  describe('collections', () => {
    it('lists all collections', async () => {
      mockFetch.mockReturnValue(jsonResponse({ collections: ['fiction', 'science'] }));

      const result = await api.collections.list();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/collections');
      expect(result.collections).toEqual(['fiction', 'science']);
    });

    it('updates collections for a note', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, collections: ['fiction'] }));

      await api.collections.update('note-1', { collections: ['fiction'] });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/collections');
      expect(options.method).toBe('PATCH');
    });
  });

  describe('highlights', () => {
    it('creates a highlight with POST method', async () => {
      const highlight = {
        id: 'h-1',
        type: 'pdf' as const,
        page: 5,
        text: 'test highlight',
        createdAt: '2025-01-01',
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
      };
      mockFetch.mockReturnValue(jsonResponse({ success: true, highlight }));

      await api.highlights.create('note-1', {
        type: 'pdf',
        page: 5,
        text: 'test highlight',
        selection: { beginIndex: 0, beginOffset: 0, endIndex: 0, endOffset: 10 },
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/highlights');
      expect(options.method).toBe('POST');
    });

    it('updates a highlight with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, highlight: {} }));

      await api.highlights.update('note-1', 'h-1', { note: 'updated note', category: 'important' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/highlights/h-1');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ note: 'updated note', category: 'important' });
    });

    it('deletes a highlight with DELETE method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true }));

      await api.highlights.delete('note-1', 'h-1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/highlights/h-1');
      expect(options.method).toBe('DELETE');
    });

    it('exports highlights with format and default options', async () => {
      mockFetch.mockReturnValue(jsonResponse({ content: '# Highlights', filename: 'highlights.md', mimeType: 'text/markdown' }));

      await api.highlights.export('note-1', 'markdown');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/highlights/export?format=markdown');
    });

    it('exports highlights with all options', async () => {
      mockFetch.mockReturnValue(jsonResponse({ content: '', filename: '', mimeType: '' }));

      await api.highlights.export('note-1', 'json', {
        includeNotes: true,
        includeCategories: false,
        includeTimestamps: true,
        groupByCategory: true,
      });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url, 'http://localhost');
      expect(parsed.searchParams.get('format')).toBe('json');
      expect(parsed.searchParams.get('includeNotes')).toBe('true');
      expect(parsed.searchParams.get('includeCategories')).toBe('false');
      expect(parsed.searchParams.get('includeTimestamps')).toBe('true');
      expect(parsed.searchParams.get('groupByCategory')).toBe('true');
    });

    it('omits undefined export options from query string', async () => {
      mockFetch.mockReturnValue(jsonResponse({ content: '', filename: '', mimeType: '' }));

      await api.highlights.export('note-1', 'csv', { includeNotes: true });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url, 'http://localhost');
      expect(parsed.searchParams.get('includeNotes')).toBe('true');
      expect(parsed.searchParams.has('includeCategories')).toBe(false);
      expect(parsed.searchParams.has('includeTimestamps')).toBe(false);
      expect(parsed.searchParams.has('groupByCategory')).toBe(false);
    });
  });

  describe('bookmarks', () => {
    it('lists bookmarks for a note', async () => {
      mockFetch.mockReturnValue(jsonResponse([]));

      await api.bookmarks.list('note-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/bookmarks');
    });

    it('creates a bookmark with POST method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ id: 'bm-1', label: 'Chapter 1', page: 10, createdAt: '2025-01-01' }));

      await api.bookmarks.create('note-1', { label: 'Chapter 1', page: 10 });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/bookmarks');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ label: 'Chapter 1', page: 10 });
    });

    it('updates a bookmark with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ id: 'bm-1', label: 'Updated', createdAt: '2025-01-01' }));

      await api.bookmarks.update('note-1', 'bm-1', { label: 'Updated' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/bookmarks/bm-1');
      expect(options.method).toBe('PATCH');
    });

    it('deletes a bookmark with DELETE method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true }));

      await api.bookmarks.delete('note-1', 'bm-1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/bookmarks/bm-1');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('files', () => {
    it('returns the file URL for a given ID', () => {
      expect(api.files.getUrl('note-1')).toBe('/api/files/note-1');
    });
  });

  describe('covers', () => {
    it('returns the cover URL for a given ID', () => {
      expect(api.covers.getUrl('note-1')).toBe('/api/covers/note-1');
    });
  });

  describe('dictionary', () => {
    it('looks up a word and returns the first entry', async () => {
      const entry = { word: 'test', phonetics: [], meanings: [] };
      mockFetch.mockReturnValue(jsonResponse([entry]));

      const result = await api.dictionary.lookup('test');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.dictionaryapi.dev/api/v2/entries/en/test');
      expect(result).toEqual(entry);
    });

    it('lowercases the lookup word', async () => {
      mockFetch.mockReturnValue(jsonResponse([{ word: 'hello', phonetics: [], meanings: [] }]));

      await api.dictionary.lookup('HELLO');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.dictionaryapi.dev/api/v2/entries/en/hello');
    });

    it('URL-encodes the lookup word', async () => {
      mockFetch.mockReturnValue(jsonResponse([{ word: 'ice cream', phonetics: [], meanings: [] }]));

      await api.dictionary.lookup('Ice Cream');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.dictionaryapi.dev/api/v2/entries/en/ice%20cream');
    });

    it('returns null when the API returns a non-OK response', async () => {
      mockFetch.mockReturnValue(Promise.resolve({ ok: false, status: 404 }));

      const result = await api.dictionary.lookup('xyznotaword');

      expect(result).toBeNull();
    });

    it('returns null when fetch throws a network error', async () => {
      mockFetch.mockReturnValue(Promise.reject(new Error('Network error')));

      const result = await api.dictionary.lookup('test');

      expect(result).toBeNull();
    });

    it('returns null when the API returns an empty array', async () => {
      mockFetch.mockReturnValue(jsonResponse([]));

      const result = await api.dictionary.lookup('test');

      expect(result).toBeNull();
    });
  });

  describe('search', () => {
    it('queries search with required parameter', async () => {
      mockFetch.mockReturnValue(jsonResponse({ query: 'test', results: [], totalResults: 0 }));

      await api.search.query('test');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/search?q=test');
    });

    it('queries search with noteId filter', async () => {
      mockFetch.mockReturnValue(jsonResponse({ query: 'test', results: [], totalResults: 0 }));

      await api.search.query('test', { noteId: 'note-1' });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url, 'http://localhost');
      expect(parsed.searchParams.get('q')).toBe('test');
      expect(parsed.searchParams.get('noteId')).toBe('note-1');
    });

    it('queries search with limit', async () => {
      mockFetch.mockReturnValue(jsonResponse({ query: 'test', results: [], totalResults: 0 }));

      await api.search.query('test', { limit: 5 });

      const [url] = mockFetch.mock.calls[0];
      const parsed = new URL(url, 'http://localhost');
      expect(parsed.searchParams.get('limit')).toBe('5');
    });

    it('gets search status', async () => {
      mockFetch.mockReturnValue(jsonResponse({ totalDocuments: 10, indexedDocuments: 10, isComplete: true, percentComplete: 100 }));

      const result = await api.search.status();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/search/status');
      expect(result.isComplete).toBe(true);
    });

    it('triggers reindex with POST method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ message: 'Reindexing', totalDocuments: 10 }));

      await api.search.reindex();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/search/reindex');
      expect(options.method).toBe('POST');
    });
  });

  describe('readingStats', () => {
    it('gets reading stats for a note', async () => {
      mockFetch.mockReturnValue(jsonResponse({ readingStats: null }));

      await api.readingStats.get('note-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reading-stats');
    });

    it('updates reading stats with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, readingStats: {}, lastRead: '2025-01-01' }));

      await api.readingStats.update('note-1', { sessionDurationMs: 60000, pagesRead: 5 });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reading-stats');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ sessionDurationMs: 60000, pagesRead: 5 });
    });

    it('gets reading history with default days', async () => {
      mockFetch.mockReturnValue(jsonResponse({ history: [], daysRequested: 30 }));

      await api.readingStats.getHistory('note-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reading-history');
    });

    it('gets reading history with custom days', async () => {
      mockFetch.mockReturnValue(jsonResponse({ history: [], daysRequested: 7 }));

      await api.readingStats.getHistory('note-1', 7);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reading-history?days=7');
    });

    it('gets reading sessions with default limit', async () => {
      mockFetch.mockReturnValue(jsonResponse({ sessions: [], totalSessions: 0 }));

      await api.readingStats.getSessions('note-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reading-sessions');
    });

    it('gets reading sessions with custom limit', async () => {
      mockFetch.mockReturnValue(jsonResponse({ sessions: [], totalSessions: 0 }));

      await api.readingStats.getSessions('note-1', 10);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reading-sessions?limit=10');
    });

    it('gets pace trends with default limit', async () => {
      mockFetch.mockReturnValue(jsonResponse({ paceData: [], trend: null, currentPace: null, overallAverage: null, totalSessions: 0, timeOfDayPatterns: [], preferredReadingTime: null, momentum: null, momentumScore: null, averageSessionQuality: null, focusScore: null }));

      await api.readingStats.getPaceTrends('note-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reading-pace');
    });

    it('gets pace trends with custom limit', async () => {
      mockFetch.mockReturnValue(jsonResponse({ paceData: [], trend: null, currentPace: null, overallAverage: null, totalSessions: 0, timeOfDayPatterns: [], preferredReadingTime: null, momentum: null, momentumScore: null, averageSessionQuality: null, focusScore: null }));

      await api.readingStats.getPaceTrends('note-1', 20);

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reading-pace?limit=20');
    });
  });

  describe('readingGoals', () => {
    it('gets reading goals', async () => {
      mockFetch.mockReturnValue(jsonResponse({ goals: {}, streak: {}, todayProgress: {}, weekHistory: [], weekSummary: {}, streakAtRisk: null, upcomingFreezeDays: [] }));

      await api.readingGoals.get();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/reading-goals');
    });

    it('updates reading goals with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, goals: {}, streak: {} }));

      await api.readingGoals.update({ dailyGoalMinutes: 30 });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/reading-goals');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ dailyGoalMinutes: 30 });
    });

    it('triggers recalculate with POST method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, streak: {} }));

      await api.readingGoals.recalculate();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/reading-goals/recalculate');
      expect(options.method).toBe('POST');
    });

    it('adds a freeze day with POST method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, goals: {} }));

      await api.readingGoals.addFreezeDay('2025-06-15');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/reading-goals/freeze-day');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ date: '2025-06-15' });
    });

    it('removes a freeze day with DELETE method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, goals: {} }));

      await api.readingGoals.removeFreezeDay('2025-06-15');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/reading-goals/freeze-day/2025-06-15');
      expect(options.method).toBe('DELETE');
    });
  });

  describe('libraryStats', () => {
    it('gets library statistics', async () => {
      mockFetch.mockReturnValue(jsonResponse({ totalBooks: 5 }));

      const result = await api.libraryStats.get();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library-stats');
      expect(result.totalBooks).toBe(5);
    });
  });

  describe('readerPreferences', () => {
    it('updates reader preferences with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, readerPreferences: {} }));

      await api.readerPreferences.update('note-1', { zoomLevel: 1.5, zoomMode: 'custom' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/reader-preferences');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ zoomLevel: 1.5, zoomMode: 'custom' });
    });

    it('updates current chapter with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, currentChapter: 'Chapter 3' }));

      await api.readerPreferences.updateChapter('note-1', 'Chapter 3');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/current-chapter');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ chapter: 'Chapter 3' });
    });

    it('clears current chapter with null', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, currentChapter: null }));

      await api.readerPreferences.updateChapter('note-1', null);

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ chapter: null });
    });
  });

  describe('bookNotes', () => {
    it('gets book notes', async () => {
      mockFetch.mockReturnValue(jsonResponse({ notes: 'Some notes' }));

      const result = await api.bookNotes.get('note-1');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/notes');
      expect(result.notes).toBe('Some notes');
    });

    it('updates book notes with PATCH method', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, notes: 'Updated notes' }));

      await api.bookNotes.update('note-1', { notes: 'Updated notes' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/library/note-1/notes');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ notes: 'Updated notes' });
    });

    it('clears book notes with null', async () => {
      mockFetch.mockReturnValue(jsonResponse({ success: true, notes: null }));

      await api.bookNotes.update('note-1', { notes: null });

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ notes: null });
    });
  });
});
