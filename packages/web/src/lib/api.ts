import type {
  LiteratureNoteSummary,
  LiteratureNote,
  Highlight,
  ProgressUpdate,
  CreateHighlightRequest,
  UpdateHighlightRequest,
} from '@pulp/shared';

const API_BASE = '/api';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  library: {
    list(sort?: 'lastRead' | 'title' | 'progress', order?: 'asc' | 'desc') {
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
};
