import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Bookmark, CreateBookmarkRequest, LiteratureNote } from '@pulp/shared';

// ── API mock ────────────────────────────────────────────────────────────

const mockLibraryGet = vi.fn();
const mockLibraryGetHighlights = vi.fn();
const mockBookmarksList = vi.fn();
const mockBookmarksCreate = vi.fn();
const mockBookmarksUpdate = vi.fn();
const mockBookmarksDelete = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    library: {
      get: (...args: unknown[]) => mockLibraryGet(...args),
      getHighlights: (...args: unknown[]) => mockLibraryGetHighlights(...args),
    },
    bookmarks: {
      list: (...args: unknown[]) => mockBookmarksList(...args),
      create: (...args: unknown[]) => mockBookmarksCreate(...args),
      update: (...args: unknown[]) => mockBookmarksUpdate(...args),
      delete: (...args: unknown[]) => mockBookmarksDelete(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

const mockSetQueryData = vi.fn();
const mockQueryClient = { setQueryData: mockSetQueryData };

type QueryConfig = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  enabled?: boolean;
  retry?: (failureCount: number, error: Error) => boolean;
};

type MutationConfig = {
  mutationFn: (...args: unknown[]) => Promise<unknown>;
  onSuccess?: (...args: unknown[]) => void;
};

let lastQueryConfig: QueryConfig;
let lastMutationConfigs: MutationConfig[] = [];

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  useQuery: (config: QueryConfig) => {
    lastQueryConfig = config;
    return {
      data: undefined,
      isLoading: false,
      error: null,
    };
  },
  useMutation: (config: MutationConfig) => {
    lastMutationConfigs.push(config);
    return {
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    };
  },
}));

// ── Import under test (after mocks are set up) ─────────────────────────

import { useNote, useHighlights, useBookmarks } from '../useNote';

// ── Test fixtures ───────────────────────────────────────────────────────

const pdfBookmark: Bookmark = {
  id: 'bm-1',
  label: 'Chapter 1',
  page: 10,
  createdAt: '2025-06-01T10:00:00.000Z',
};

const epubBookmark: Bookmark = {
  id: 'bm-2',
  label: 'Important Section',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  notes: 'This contains key information',
  createdAt: '2025-06-01T11:00:00.000Z',
};

const mockNote: LiteratureNote = {
  id: 'note-1',
  title: 'Test Book',
  author: 'Test Author',
  source: '/path/to/file.pdf',
  sourceRelative: 'file.pdf',
  sourceType: 'pdf',
  filePath: '/path/to/file.pdf',
  notePath: '/path/to/note.md',
  progress: 50,
  lastRead: null,
  lastOpenedCfi: null,
  dateCreated: null,
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
  frontmatter: {},
};

// ── Tests ───────────────────────────────────────────────────────────────

describe('useNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastMutationConfigs = [];
  });

  describe('query configuration', () => {
    it('creates query with correct key for valid id', () => {
      useNote('note-123');

      expect(lastQueryConfig.queryKey).toEqual(['note', 'note-123']);
    });

    it('enables query when id is provided', () => {
      useNote('note-123');

      expect(lastQueryConfig.enabled).toBe(true);
    });

    it('disables query when id is undefined', () => {
      useNote(undefined);

      expect(lastQueryConfig.enabled).toBe(false);
    });

    it('creates query with undefined key segment when id is undefined', () => {
      useNote(undefined);

      expect(lastQueryConfig.queryKey).toEqual(['note', undefined]);
    });
  });

  describe('queryFn', () => {
    it('calls api.library.get with the note id', async () => {
      mockLibraryGet.mockResolvedValueOnce(mockNote);

      useNote('note-abc');
      const result = await lastQueryConfig.queryFn();

      expect(mockLibraryGet).toHaveBeenCalledTimes(1);
      expect(mockLibraryGet).toHaveBeenCalledWith('note-abc');
      expect(result).toEqual(mockNote);
    });

    it('propagates API errors', async () => {
      mockLibraryGet.mockRejectedValueOnce(new Error('Server error'));

      useNote('note-1');

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Server error');
    });
  });

  describe('retry configuration', () => {
    it('returns false for 404 errors to prevent retry', () => {
      useNote('note-1');

      const retry = lastQueryConfig.retry!;
      const error = new Error('HTTP 404: Not Found');

      expect(retry(0, error)).toBe(false);
      expect(retry(1, error)).toBe(false);
    });

    it('returns false for "not found" errors (case insensitive)', () => {
      useNote('note-1');

      const retry = lastQueryConfig.retry!;

      expect(retry(0, new Error('Note not found'))).toBe(false);
      expect(retry(0, new Error('NOT FOUND'))).toBe(false);
      expect(retry(0, new Error('Resource Not Found'))).toBe(false);
    });

    it('allows retry for non-404 errors up to 2 times', () => {
      useNote('note-1');

      const retry = lastQueryConfig.retry!;
      const error = new Error('Network timeout');

      expect(retry(0, error)).toBe(true);
      expect(retry(1, error)).toBe(true);
      expect(retry(2, error)).toBe(false);
    });

    it('returns false after max retries for server errors', () => {
      useNote('note-1');

      const retry = lastQueryConfig.retry!;
      const error = new Error('HTTP 500: Internal Server Error');

      expect(retry(0, error)).toBe(true);
      expect(retry(1, error)).toBe(true);
      expect(retry(2, error)).toBe(false);
      expect(retry(3, error)).toBe(false);
    });
  });
});

describe('useHighlights', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastMutationConfigs = [];
  });

  describe('query configuration', () => {
    it('creates query with correct key for valid id', () => {
      useHighlights('note-456');

      expect(lastQueryConfig.queryKey).toEqual(['highlights', 'note-456']);
    });

    it('enables query when id is provided', () => {
      useHighlights('note-456');

      expect(lastQueryConfig.enabled).toBe(true);
    });

    it('disables query when id is undefined', () => {
      useHighlights(undefined);

      expect(lastQueryConfig.enabled).toBe(false);
    });
  });

  describe('queryFn', () => {
    it('calls api.library.getHighlights with the note id', async () => {
      const mockHighlights = [
        { id: 'hl-1', type: 'pdf', text: 'Test', page: 5 },
      ];
      mockLibraryGetHighlights.mockResolvedValueOnce(mockHighlights);

      useHighlights('note-xyz');
      const result = await lastQueryConfig.queryFn();

      expect(mockLibraryGetHighlights).toHaveBeenCalledTimes(1);
      expect(mockLibraryGetHighlights).toHaveBeenCalledWith('note-xyz');
      expect(result).toEqual(mockHighlights);
    });

    it('propagates API errors', async () => {
      mockLibraryGetHighlights.mockRejectedValueOnce(new Error('Unauthorized'));

      useHighlights('note-1');

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Unauthorized');
    });
  });
});

describe('useBookmarks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastMutationConfigs = [];
  });

  describe('query configuration', () => {
    it('creates query with correct key for valid noteId', () => {
      useBookmarks('note-789');

      expect(lastQueryConfig.queryKey).toEqual(['bookmarks', 'note-789']);
    });

    it('enables query when noteId is provided', () => {
      useBookmarks('note-789');

      expect(lastQueryConfig.enabled).toBe(true);
    });

    it('disables query when noteId is undefined', () => {
      useBookmarks(undefined);

      expect(lastQueryConfig.enabled).toBe(false);
    });
  });

  describe('queryFn', () => {
    it('calls api.bookmarks.list with the note id', async () => {
      const mockBookmarks = [pdfBookmark, epubBookmark];
      mockBookmarksList.mockResolvedValueOnce(mockBookmarks);

      useBookmarks('note-abc');
      const result = await lastQueryConfig.queryFn();

      expect(mockBookmarksList).toHaveBeenCalledTimes(1);
      expect(mockBookmarksList).toHaveBeenCalledWith('note-abc');
      expect(result).toEqual(mockBookmarks);
    });

    it('propagates API errors', async () => {
      mockBookmarksList.mockRejectedValueOnce(new Error('Forbidden'));

      useBookmarks('note-1');

      await expect(lastQueryConfig.queryFn()).rejects.toThrow('Forbidden');
    });
  });

  describe('addMutation', () => {
    it('calls api.bookmarks.create with noteId and data', async () => {
      const createData: CreateBookmarkRequest = {
        label: 'New Bookmark',
        page: 25,
      };

      mockBookmarksCreate.mockResolvedValueOnce(pdfBookmark);

      useBookmarks('note-abc');
      const addMutation = lastMutationConfigs[0];
      const result = await addMutation.mutationFn(createData);

      expect(mockBookmarksCreate).toHaveBeenCalledTimes(1);
      expect(mockBookmarksCreate).toHaveBeenCalledWith('note-abc', createData);
      expect(result).toEqual(pdfBookmark);
    });

    it('handles creating EPUB bookmark with cfi and notes', async () => {
      const createData: CreateBookmarkRequest = {
        label: 'EPUB Bookmark',
        cfi: 'epubcfi(/6/8)',
        notes: 'Remember this section',
      };

      mockBookmarksCreate.mockResolvedValueOnce(epubBookmark);

      useBookmarks('note-epub');
      const addMutation = lastMutationConfigs[0];
      await addMutation.mutationFn(createData);

      expect(mockBookmarksCreate).toHaveBeenCalledWith('note-epub', createData);
    });

    it('propagates API errors', async () => {
      mockBookmarksCreate.mockRejectedValueOnce(new Error('Validation failed'));

      useBookmarks('note-1');
      const addMutation = lastMutationConfigs[0];

      await expect(addMutation.mutationFn({ label: '' })).rejects.toThrow(
        'Validation failed'
      );
    });

    describe('onSuccess cache update', () => {
      it('appends new bookmark to existing cache', () => {
        useBookmarks('note-abc');
        const addMutation = lastMutationConfigs[0];

        addMutation.onSuccess!(pdfBookmark);

        expect(mockSetQueryData).toHaveBeenCalledTimes(1);
        expect(mockSetQueryData).toHaveBeenCalledWith(
          ['bookmarks', 'note-abc'],
          expect.any(Function)
        );

        const updater = mockSetQueryData.mock.calls[0][1];
        const existing: Bookmark[] = [epubBookmark];
        const result = updater(existing);

        expect(result).toEqual([epubBookmark, pdfBookmark]);
      });

      it('creates a new array when cache is undefined', () => {
        useBookmarks('note-abc');
        const addMutation = lastMutationConfigs[0];

        addMutation.onSuccess!(pdfBookmark);

        const updater = mockSetQueryData.mock.calls[0][1];
        const result = updater(undefined);

        expect(result).toEqual([pdfBookmark]);
      });

      it('creates a new array when cache is null', () => {
        useBookmarks('note-abc');
        const addMutation = lastMutationConfigs[0];

        addMutation.onSuccess!(pdfBookmark);

        const updater = mockSetQueryData.mock.calls[0][1];
        const result = updater(null);

        expect(result).toEqual([pdfBookmark]);
      });

      it('preserves existing bookmarks when appending', () => {
        const existing: Bookmark[] = [pdfBookmark, epubBookmark];
        const newBookmark: Bookmark = {
          id: 'bm-3',
          label: 'New one',
          page: 50,
          createdAt: '2025-06-02T10:00:00.000Z',
        };

        useBookmarks('note-abc');
        const addMutation = lastMutationConfigs[0];
        addMutation.onSuccess!(newBookmark);

        const updater = mockSetQueryData.mock.calls[0][1];
        const result = updater(existing);

        expect(result).toHaveLength(3);
        expect(result[0]).toBe(pdfBookmark);
        expect(result[1]).toBe(epubBookmark);
        expect(result[2]).toBe(newBookmark);
      });
    });
  });

  describe('removeMutation', () => {
    it('calls api.bookmarks.delete with noteId and bookmarkId', async () => {
      mockBookmarksDelete.mockResolvedValueOnce({ success: true });

      useBookmarks('note-abc');
      const removeMutation = lastMutationConfigs[1];
      const result = await removeMutation.mutationFn('bm-1');

      expect(mockBookmarksDelete).toHaveBeenCalledTimes(1);
      expect(mockBookmarksDelete).toHaveBeenCalledWith('note-abc', 'bm-1');
      expect(result).toEqual({ success: true });
    });

    it('propagates API errors', async () => {
      mockBookmarksDelete.mockRejectedValueOnce(new Error('Not found'));

      useBookmarks('note-1');
      const removeMutation = lastMutationConfigs[1];

      await expect(removeMutation.mutationFn('bm-nonexistent')).rejects.toThrow(
        'Not found'
      );
    });

    describe('onSuccess cache update', () => {
      it('removes the deleted bookmark from cache', () => {
        useBookmarks('note-abc');
        const removeMutation = lastMutationConfigs[1];

        removeMutation.onSuccess!(undefined, 'bm-1');

        expect(mockSetQueryData).toHaveBeenCalledWith(
          ['bookmarks', 'note-abc'],
          expect.any(Function)
        );

        const updater = mockSetQueryData.mock.calls[0][1];
        const existing: Bookmark[] = [pdfBookmark, epubBookmark];
        const result = updater(existing);

        expect(result).toHaveLength(1);
        expect(result[0]).toBe(epubBookmark);
      });

      it('returns empty array when deleting the last bookmark', () => {
        useBookmarks('note-abc');
        const removeMutation = lastMutationConfigs[1];

        removeMutation.onSuccess!(undefined, 'bm-1');

        const updater = mockSetQueryData.mock.calls[0][1];
        const existing: Bookmark[] = [pdfBookmark];
        const result = updater(existing);

        expect(result).toEqual([]);
      });

      it('returns empty array when cache is null', () => {
        useBookmarks('note-abc');
        const removeMutation = lastMutationConfigs[1];

        removeMutation.onSuccess!(undefined, 'bm-1');

        const updater = mockSetQueryData.mock.calls[0][1];
        const result = updater(null);

        expect(result).toEqual([]);
      });

      it('returns empty array when cache is undefined', () => {
        useBookmarks('note-abc');
        const removeMutation = lastMutationConfigs[1];

        removeMutation.onSuccess!(undefined, 'bm-1');

        const updater = mockSetQueryData.mock.calls[0][1];
        const result = updater(undefined);

        expect(result).toEqual([]);
      });

      it('does not remove bookmarks with different IDs', () => {
        useBookmarks('note-abc');
        const removeMutation = lastMutationConfigs[1];

        removeMutation.onSuccess!(undefined, 'bm-nonexistent');

        const updater = mockSetQueryData.mock.calls[0][1];
        const existing: Bookmark[] = [pdfBookmark, epubBookmark];
        const result = updater(existing);

        expect(result).toHaveLength(2);
        expect(result[0]).toBe(pdfBookmark);
        expect(result[1]).toBe(epubBookmark);
      });
    });
  });

  describe('updateMutation', () => {
    it('calls api.bookmarks.update with noteId, bookmarkId, and data', async () => {
      const updatedBookmark: Bookmark = {
        ...pdfBookmark,
        label: 'Updated Label',
      };
      mockBookmarksUpdate.mockResolvedValueOnce(updatedBookmark);

      useBookmarks('note-abc');
      const updateMutation = lastMutationConfigs[2];
      const result = await updateMutation.mutationFn({
        bookmarkId: 'bm-1',
        label: 'Updated Label',
      });

      expect(mockBookmarksUpdate).toHaveBeenCalledTimes(1);
      expect(mockBookmarksUpdate).toHaveBeenCalledWith('note-abc', 'bm-1', {
        label: 'Updated Label',
      });
      expect(result).toEqual(updatedBookmark);
    });

    it('propagates API errors', async () => {
      mockBookmarksUpdate.mockRejectedValueOnce(new Error('Update failed'));

      useBookmarks('note-1');
      const updateMutation = lastMutationConfigs[2];

      await expect(
        updateMutation.mutationFn({ bookmarkId: 'bm-1', label: 'New Label' })
      ).rejects.toThrow('Update failed');
    });

    describe('onSuccess cache update', () => {
      it('replaces the matching bookmark in cache', () => {
        const updatedBookmark: Bookmark = {
          ...pdfBookmark,
          label: 'Updated!',
        };

        useBookmarks('note-abc');
        const updateMutation = lastMutationConfigs[2];
        updateMutation.onSuccess!(updatedBookmark);

        expect(mockSetQueryData).toHaveBeenCalledWith(
          ['bookmarks', 'note-abc'],
          expect.any(Function)
        );

        const updater = mockSetQueryData.mock.calls[0][1];
        const existing: Bookmark[] = [pdfBookmark, epubBookmark];
        const result = updater(existing);

        expect(result).toHaveLength(2);
        expect(result[0]).toBe(updatedBookmark);
        expect(result[1]).toBe(epubBookmark);
      });

      it('does not modify bookmarks with different IDs', () => {
        const updatedBookmark: Bookmark = {
          ...pdfBookmark,
          label: 'Changed',
        };

        useBookmarks('note-abc');
        const updateMutation = lastMutationConfigs[2];
        updateMutation.onSuccess!(updatedBookmark);

        const updater = mockSetQueryData.mock.calls[0][1];
        const existing: Bookmark[] = [epubBookmark];
        const result = updater(existing);

        expect(result).toHaveLength(1);
        expect(result[0]).toBe(epubBookmark);
      });

      it('returns empty array when cache is null', () => {
        const updatedBookmark: Bookmark = {
          ...pdfBookmark,
          label: 'Updated',
        };

        useBookmarks('note-abc');
        const updateMutation = lastMutationConfigs[2];
        updateMutation.onSuccess!(updatedBookmark);

        const updater = mockSetQueryData.mock.calls[0][1];
        const result = updater(null);

        expect(result).toEqual([]);
      });

      it('returns empty array when cache is undefined', () => {
        const updatedBookmark: Bookmark = {
          ...pdfBookmark,
          label: 'Updated',
        };

        useBookmarks('note-abc');
        const updateMutation = lastMutationConfigs[2];
        updateMutation.onSuccess!(updatedBookmark);

        const updater = mockSetQueryData.mock.calls[0][1];
        const result = updater(undefined);

        expect(result).toEqual([]);
      });

      it('correctly updates when bookmark is in the middle of the list', () => {
        const bm3: Bookmark = {
          id: 'bm-3',
          label: 'Third',
          page: 30,
          createdAt: '2025-06-03T10:00:00.000Z',
        };
        const existing: Bookmark[] = [pdfBookmark, epubBookmark, bm3];

        const updatedEpub: Bookmark = {
          ...epubBookmark,
          label: 'Updated EPUB Bookmark',
        };

        useBookmarks('note-abc');
        const updateMutation = lastMutationConfigs[2];
        updateMutation.onSuccess!(updatedEpub);

        const updater = mockSetQueryData.mock.calls[0][1];
        const result = updater(existing);

        expect(result).toHaveLength(3);
        expect(result[0]).toBe(pdfBookmark);
        expect(result[1]).toBe(updatedEpub);
        expect(result[2]).toBe(bm3);
      });
    });
  });

  describe('return value', () => {
    it('returns bookmarks as empty array when data is undefined', () => {
      const result = useBookmarks('note-1');

      expect(result.bookmarks).toEqual([]);
    });

    it('returns isLoading status', () => {
      const result = useBookmarks('note-1');

      expect(typeof result.isLoading).toBe('boolean');
    });

    it('returns mutation functions', () => {
      const result = useBookmarks('note-1');

      expect(typeof result.addBookmark).toBe('function');
      expect(typeof result.removeBookmark).toBe('function');
      expect(typeof result.updateBookmark).toBe('function');
    });

    it('returns pending states', () => {
      const result = useBookmarks('note-1');

      expect(typeof result.isAdding).toBe('boolean');
      expect(typeof result.isRemoving).toBe('boolean');
    });
  });
});
