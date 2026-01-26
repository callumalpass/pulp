import type {
  LiteratureNoteSummary,
  LiteratureNote,
  Highlight,
  ProgressUpdate,
  CreateHighlightRequest,
  UpdateHighlightRequest,
  DictionaryEntry,
  SearchResponse,
  SearchStatus,
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
    list(sort?: 'lastRead' | 'title' | 'progress' | 'dateCreated', order?: 'asc' | 'desc') {
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

    getContent(id: string) {
      return fetchJSON<{ content: string }>(`/library/${id}/content`);
    },

    updateContent(id: string, content: string) {
      return fetchJSON<{ success: boolean }>(`/library/${id}/content`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
    },
  },

  progress: {
    update(id: string, data: ProgressUpdate) {
      return fetchJSON<{ success: boolean; progress: number; lastRead: string }>(
        `/library/${id}/progress`,
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
};
