import type {
  LiteratureNoteSummary,
  LiteratureNote,
  Highlight,
  Bookmark,
  ProgressUpdate,
  PinUpdate,
  RatingUpdate,
  CollectionsUpdate,
  BookNotesUpdate,
  CreateHighlightRequest,
  UpdateHighlightRequest,
  CreateBookmarkRequest,
  UpdateBookmarkRequest,
  DictionaryEntry,
  SearchResponse,
  SearchStatus,
  ReadingStats,
  ReadingStatsUpdate,
  ReadingGoalsResponse,
  ReadingGoalsUpdate,
  ReadingStreak,
  LibraryStatistics,
  ReaderPreferences,
  ReaderPreferencesUpdate,
  HighlightExportFormat,
  HighlightExportResponse,
  ReadingPaceTrends,
} from '@pulp/shared';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  library: {
    list(sort?: 'lastRead' | 'title' | 'progress' | 'dateCreated' | 'author' | 'rating', order?: 'asc' | 'desc') {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (order) params.set('order', order);
      const query = params.toString();
      return fetchJSON<LiteratureNoteSummary[]>(`/library${query ? `?${query}` : ''}`);
    },

    get(id: string) {
      return fetchJSON<LiteratureNote>(`/library/${id}`);
    },

    getHighlights(id: string) {
      return fetchJSON<Highlight[]>(`/library/${id}/highlights`);
    },
  },

  progress: {
    update(id: string, data: ProgressUpdate) {
      return fetchJSON<{ success: boolean; progress: number; lastRead: string; lastOpenedCfi?: string }>(
        `/library/${id}/progress`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },
  },

  pin: {
    update(id: string, data: PinUpdate) {
      return fetchJSON<{ success: boolean; pinned: boolean }>(
        `/library/${id}/pin`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },
  },

  rating: {
    update(id: string, data: RatingUpdate) {
      return fetchJSON<{ success: boolean; rating: number | null }>(
        `/library/${id}/rating`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },
  },

  collections: {
    list() {
      return fetchJSON<{ collections: string[] }>('/collections');
    },

    update(id: string, data: CollectionsUpdate) {
      return fetchJSON<{ success: boolean; collections: string[] }>(
        `/library/${id}/collections`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },
  },

  highlights: {
    create(id: string, data: CreateHighlightRequest) {
      return fetchJSON<{ success: boolean; highlight: Highlight }>(
        `/library/${id}/highlights`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        }
      );
    },

    update(noteId: string, highlightId: string, data: UpdateHighlightRequest) {
      return fetchJSON<{ success: boolean; highlight: Highlight }>(
        `/library/${noteId}/highlights/${highlightId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },

    delete(noteId: string, highlightId: string) {
      return fetchJSON<{ success: boolean }>(
        `/library/${noteId}/highlights/${highlightId}`,
        { method: 'DELETE' }
      );
    },

    export(
      noteId: string,
      format: HighlightExportFormat,
      options?: {
        includeNotes?: boolean;
        includeCategories?: boolean;
        includeTimestamps?: boolean;
        groupByCategory?: boolean;
      }
    ) {
      const params = new URLSearchParams({ format });
      if (options?.includeNotes !== undefined) params.set('includeNotes', String(options.includeNotes));
      if (options?.includeCategories !== undefined) params.set('includeCategories', String(options.includeCategories));
      if (options?.includeTimestamps !== undefined) params.set('includeTimestamps', String(options.includeTimestamps));
      if (options?.groupByCategory !== undefined) params.set('groupByCategory', String(options.groupByCategory));
      return fetchJSON<HighlightExportResponse>(`/library/${noteId}/highlights/export?${params.toString()}`);
    },
  },

  bookmarks: {
    list(noteId: string) {
      return fetchJSON<Bookmark[]>(`/library/${noteId}/bookmarks`);
    },

    create(noteId: string, data: CreateBookmarkRequest) {
      return fetchJSON<Bookmark>(`/library/${noteId}/bookmarks`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update(noteId: string, bookmarkId: string, data: UpdateBookmarkRequest) {
      return fetchJSON<Bookmark>(`/library/${noteId}/bookmarks/${bookmarkId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    delete(noteId: string, bookmarkId: string) {
      return fetchJSON<{ success: boolean }>(
        `/library/${noteId}/bookmarks/${bookmarkId}`,
        { method: 'DELETE' }
      );
    },
  },

  files: {
    getUrl(id: string) {
      return `${API_BASE}/files/${id}`;
    },
  },

  covers: {
    getUrl(id: string) {
      return `${API_BASE}/covers/${id}`;
    },
  },

  dictionary: {
    async lookup(word: string): Promise<DictionaryEntry | null> {
      try {
        const response = await fetch(
          `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data[0] ?? null;
      } catch {
        return null;
      }
    },
  },

  search: {
    query(q: string, options?: { noteId?: string; limit?: number }) {
      const params = new URLSearchParams();
      params.set('q', q);
      if (options?.noteId) params.set('noteId', options.noteId);
      if (options?.limit) params.set('limit', String(options.limit));
      return fetchJSON<SearchResponse>(`/search?${params.toString()}`);
    },

    status() {
      return fetchJSON<SearchStatus>('/search/status');
    },

    reindex() {
      return fetchJSON<{ message: string; totalDocuments: number }>('/search/reindex', {
        method: 'POST',
      });
    },
  },

  readingStats: {
    get(noteId: string) {
      return fetchJSON<{ readingStats: ReadingStats | null }>(`/library/${noteId}/reading-stats`);
    },

    update(noteId: string, data: ReadingStatsUpdate) {
      return fetchJSON<{ success: boolean; readingStats: ReadingStats; lastRead: string; streak?: ReadingStreak }>(
        `/library/${noteId}/reading-stats`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },

    getHistory(noteId: string, days?: number) {
      const params = days ? `?days=${days}` : '';
      return fetchJSON<{
        history: Array<{ date: string; durationMs: number; sessions: number; pagesRead: number }>;
        daysRequested: number;
      }>(`/library/${noteId}/reading-history${params}`);
    },

    getSessions(noteId: string, limit?: number) {
      const params = limit ? `?limit=${limit}` : '';
      return fetchJSON<{
        sessions: Array<{
          startTime: string;
          endTime: string;
          durationMs: number;
          pagesRead: number;
          startPage: number;
          endPage: number;
        }>;
        totalSessions: number;
      }>(`/library/${noteId}/reading-sessions${params}`);
    },

    getPaceTrends(noteId: string, limit?: number) {
      const params = limit ? `?limit=${limit}` : '';
      return fetchJSON<ReadingPaceTrends>(`/library/${noteId}/reading-pace${params}`);
    },
  },

  readingGoals: {
    get() {
      return fetchJSON<ReadingGoalsResponse>('/reading-goals');
    },

    update(data: ReadingGoalsUpdate) {
      return fetchJSON<{ success: boolean; goals: ReadingGoalsResponse['goals']; streak: ReadingStreak }>(
        '/reading-goals',
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },

    recalculate() {
      return fetchJSON<{ success: boolean; streak: ReadingStreak }>(
        '/reading-goals/recalculate',
        { method: 'POST' }
      );
    },

    addFreezeDay(date: string) {
      return fetchJSON<{ success: boolean; goals: ReadingGoalsResponse['goals'] }>(
        '/reading-goals/freeze-day',
        {
          method: 'POST',
          body: JSON.stringify({ date }),
        }
      );
    },

    removeFreezeDay(date: string) {
      return fetchJSON<{ success: boolean; goals: ReadingGoalsResponse['goals'] }>(
        `/reading-goals/freeze-day/${date}`,
        { method: 'DELETE' }
      );
    },
  },

  libraryStats: {
    get() {
      return fetchJSON<LibraryStatistics>('/library-stats');
    },
  },

  readerPreferences: {
    update(noteId: string, data: ReaderPreferencesUpdate) {
      return fetchJSON<{ success: boolean; readerPreferences: ReaderPreferences }>(
        `/library/${noteId}/reader-preferences`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },

    updateChapter(noteId: string, chapter: string | null) {
      return fetchJSON<{ success: boolean; currentChapter: string | null }>(
        `/library/${noteId}/current-chapter`,
        {
          method: 'PATCH',
          body: JSON.stringify({ chapter }),
        }
      );
    },
  },

  bookNotes: {
    get(noteId: string) {
      return fetchJSON<{ notes: string | null }>(`/library/${noteId}/notes`);
    },

    update(noteId: string, data: BookNotesUpdate) {
      return fetchJSON<{ success: boolean; notes: string | null }>(
        `/library/${noteId}/notes`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        }
      );
    },
  },
};
