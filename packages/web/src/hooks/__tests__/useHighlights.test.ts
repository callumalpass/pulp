import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Highlight, CreateHighlightRequest, UpdateHighlightRequest } from '@pulp/shared';

// ── API mock ────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    highlights: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

const mockSetQueryData = vi.fn();
const mockQueryClient = { setQueryData: mockSetQueryData };

type MutationConfig = {
  mutationFn: (...args: unknown[]) => Promise<unknown>;
  onSuccess: (...args: unknown[]) => void;
};

let lastMutationConfig: MutationConfig;

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  useMutation: (config: MutationConfig) => {
    lastMutationConfig = config;
    return {
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    };
  },
}));

// ── React mock ──────────────────────────────────────────────────────────
// No React hooks are used directly in useHighlights (only re-exported from
// @tanstack/react-query), so we only need a minimal mock.

// ── Import under test (after mocks are set up) ─────────────────────────

import { useCreateHighlight, useUpdateHighlight, useDeleteHighlight } from '../useHighlights';

// ── Test fixtures ───────────────────────────────────────────────────────

const pdfHighlight: Highlight = {
  id: 'hl-1',
  type: 'pdf',
  page: 5,
  selection: { beginIndex: 0, beginOffset: 10, endIndex: 0, endOffset: 50 },
  text: 'Important passage about testing',
  note: 'Worth remembering',
  category: 'important',
  createdAt: '2025-06-01T10:00:00.000Z',
};

const epubHighlight: Highlight = {
  id: 'hl-2',
  type: 'epub',
  cfi: 'epubcfi(/6/4!/4/2/1:0)',
  text: 'A highlighted sentence in an EPUB',
  category: 'highlight',
  createdAt: '2025-06-01T11:00:00.000Z',
};

// ── Tests ───────────────────────────────────────────────────────────────

describe('useCreateHighlight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mutationFn', () => {
    it('calls api.highlights.create with correct noteId and data', async () => {
      const createData: CreateHighlightRequest = {
        type: 'pdf',
        page: 5,
        selection: { beginIndex: 0, beginOffset: 10, endIndex: 0, endOffset: 50 },
        text: 'Highlighted text',
        note: 'My note',
        category: 'important',
      };

      mockCreate.mockResolvedValueOnce({ success: true, highlight: pdfHighlight });

      useCreateHighlight('note-abc');

      const result = await lastMutationConfig.mutationFn(createData);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith('note-abc', createData);
      expect(result).toEqual({ success: true, highlight: pdfHighlight });
    });

    it('throws when noteId is undefined', () => {
      useCreateHighlight(undefined);

      expect(() => lastMutationConfig.mutationFn({
        type: 'epub',
        cfi: 'epubcfi(/6/4)',
        text: 'Some text',
      })).toThrow('No note ID');
    });

    it('does not call the API when noteId is undefined', () => {
      useCreateHighlight(undefined);

      try {
        lastMutationConfig.mutationFn({ type: 'pdf', text: 'text' });
      } catch {
        // expected
      }

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('handles EPUB highlight creation', async () => {
      const createData: CreateHighlightRequest = {
        type: 'epub',
        cfi: 'epubcfi(/6/4!/4/2/1:0)',
        text: 'EPUB text',
      };

      mockCreate.mockResolvedValueOnce({ success: true, highlight: epubHighlight });

      useCreateHighlight('note-epub');
      await lastMutationConfig.mutationFn(createData);

      expect(mockCreate).toHaveBeenCalledWith('note-epub', createData);
    });

    it('handles creation without optional fields', async () => {
      const minimalData: CreateHighlightRequest = {
        type: 'pdf',
        text: 'Just the text',
      };

      mockCreate.mockResolvedValueOnce({
        success: true,
        highlight: { ...pdfHighlight, note: undefined, category: undefined },
      });

      useCreateHighlight('note-1');
      await lastMutationConfig.mutationFn(minimalData);

      expect(mockCreate).toHaveBeenCalledWith('note-1', minimalData);
    });

    it('propagates API errors', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Network error'));

      useCreateHighlight('note-1');

      await expect(
        lastMutationConfig.mutationFn({ type: 'pdf', text: 'text' })
      ).rejects.toThrow('Network error');
    });
  });

  describe('onSuccess cache update', () => {
    it('appends new highlight to existing cache', () => {
      useCreateHighlight('note-abc');

      lastMutationConfig.onSuccess({ highlight: pdfHighlight });

      expect(mockSetQueryData).toHaveBeenCalledTimes(1);
      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['highlights', 'note-abc'],
        expect.any(Function),
      );

      // Verify the updater function appends
      const updater = mockSetQueryData.mock.calls[0][1];
      const existing: Highlight[] = [epubHighlight];
      const result = updater(existing);

      expect(result).toEqual([epubHighlight, pdfHighlight]);
    });

    it('creates a new array when cache is empty (undefined)', () => {
      useCreateHighlight('note-abc');

      lastMutationConfig.onSuccess({ highlight: pdfHighlight });

      const updater = mockSetQueryData.mock.calls[0][1];
      const result = updater(undefined);

      expect(result).toEqual([pdfHighlight]);
    });

    it('creates a new array when cache is null', () => {
      useCreateHighlight('note-abc');

      lastMutationConfig.onSuccess({ highlight: pdfHighlight });

      const updater = mockSetQueryData.mock.calls[0][1];
      const result = updater(null);

      expect(result).toEqual([pdfHighlight]);
    });

    it('preserves existing highlights when appending', () => {
      const existing: Highlight[] = [pdfHighlight, epubHighlight];
      const newHighlight: Highlight = {
        ...pdfHighlight,
        id: 'hl-new',
        text: 'Brand new highlight',
      };

      useCreateHighlight('note-abc');
      lastMutationConfig.onSuccess({ highlight: newHighlight });

      const updater = mockSetQueryData.mock.calls[0][1];
      const result = updater(existing);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(pdfHighlight);
      expect(result[1]).toBe(epubHighlight);
      expect(result[2]).toBe(newHighlight);
    });

    it('uses the correct query key with noteId', () => {
      useCreateHighlight('my-special-note');
      lastMutationConfig.onSuccess({ highlight: pdfHighlight });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['highlights', 'my-special-note'],
        expect.any(Function),
      );
    });
  });
});

describe('useUpdateHighlight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mutationFn', () => {
    it('calls api.highlights.update with noteId, highlightId, and data', async () => {
      const updateData: UpdateHighlightRequest = {
        note: 'Updated note text',
        category: 'question',
      };

      const updatedHighlight: Highlight = {
        ...pdfHighlight,
        note: 'Updated note text',
        category: 'question',
        updatedAt: '2025-06-02T10:00:00.000Z',
      };

      mockUpdate.mockResolvedValueOnce({ success: true, highlight: updatedHighlight });

      useUpdateHighlight('note-abc');

      const result = await lastMutationConfig.mutationFn({
        highlightId: 'hl-1',
        data: updateData,
      });

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith('note-abc', 'hl-1', updateData);
      expect(result).toEqual({ success: true, highlight: updatedHighlight });
    });

    it('throws when noteId is undefined', () => {
      useUpdateHighlight(undefined);

      expect(() =>
        lastMutationConfig.mutationFn({
          highlightId: 'hl-1',
          data: { note: 'Updated' },
        })
      ).toThrow('No note ID');
    });

    it('does not call the API when noteId is undefined', () => {
      useUpdateHighlight(undefined);

      try {
        lastMutationConfig.mutationFn({
          highlightId: 'hl-1',
          data: { note: 'Updated' },
        });
      } catch {
        // expected
      }

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('handles updating only the note field', async () => {
      const updateData: UpdateHighlightRequest = { note: 'Just a note update' };

      mockUpdate.mockResolvedValueOnce({
        success: true,
        highlight: { ...pdfHighlight, note: 'Just a note update' },
      });

      useUpdateHighlight('note-1');
      await lastMutationConfig.mutationFn({ highlightId: 'hl-1', data: updateData });

      expect(mockUpdate).toHaveBeenCalledWith('note-1', 'hl-1', updateData);
    });

    it('handles updating only the category field', async () => {
      const updateData: UpdateHighlightRequest = { category: 'definition' };

      mockUpdate.mockResolvedValueOnce({
        success: true,
        highlight: { ...pdfHighlight, category: 'definition' },
      });

      useUpdateHighlight('note-1');
      await lastMutationConfig.mutationFn({ highlightId: 'hl-1', data: updateData });

      expect(mockUpdate).toHaveBeenCalledWith('note-1', 'hl-1', updateData);
    });

    it('propagates API errors', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('HTTP 404: Not Found'));

      useUpdateHighlight('note-1');

      await expect(
        lastMutationConfig.mutationFn({ highlightId: 'hl-1', data: { note: 'test' } })
      ).rejects.toThrow('HTTP 404: Not Found');
    });
  });

  describe('onSuccess cache update', () => {
    it('replaces the matching highlight in cache', () => {
      const updatedHighlight: Highlight = {
        ...pdfHighlight,
        note: 'Updated!',
        updatedAt: '2025-06-02T10:00:00.000Z',
      };

      useUpdateHighlight('note-abc');
      lastMutationConfig.onSuccess({ highlight: updatedHighlight });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['highlights', 'note-abc'],
        expect.any(Function),
      );

      const updater = mockSetQueryData.mock.calls[0][1];
      const existing: Highlight[] = [pdfHighlight, epubHighlight];
      const result = updater(existing);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(updatedHighlight);
      expect(result[1]).toBe(epubHighlight);
    });

    it('does not modify highlights with different IDs', () => {
      const updatedHighlight: Highlight = {
        ...pdfHighlight,
        note: 'Changed',
      };

      useUpdateHighlight('note-abc');
      lastMutationConfig.onSuccess({ highlight: updatedHighlight });

      const updater = mockSetQueryData.mock.calls[0][1];
      const existing: Highlight[] = [epubHighlight];
      const result = updater(existing);

      // epubHighlight has a different ID, so it's untouched
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(epubHighlight);
    });

    it('returns array with just the updated highlight when cache is null', () => {
      const updatedHighlight: Highlight = { ...pdfHighlight, note: 'Updated' };

      useUpdateHighlight('note-abc');
      lastMutationConfig.onSuccess({ highlight: updatedHighlight });

      const updater = mockSetQueryData.mock.calls[0][1];
      const result = updater(null);

      expect(result).toEqual([updatedHighlight]);
    });

    it('returns array with just the updated highlight when cache is undefined', () => {
      const updatedHighlight: Highlight = { ...pdfHighlight, note: 'Updated' };

      useUpdateHighlight('note-abc');
      lastMutationConfig.onSuccess({ highlight: updatedHighlight });

      const updater = mockSetQueryData.mock.calls[0][1];
      const result = updater(undefined);

      expect(result).toEqual([updatedHighlight]);
    });

    it('correctly updates when highlight is in the middle of the list', () => {
      const hl3: Highlight = { ...pdfHighlight, id: 'hl-3', text: 'Third' };
      const existing: Highlight[] = [pdfHighlight, epubHighlight, hl3];

      const updatedEpub: Highlight = {
        ...epubHighlight,
        note: 'Added a note to epub',
      };

      useUpdateHighlight('note-abc');
      lastMutationConfig.onSuccess({ highlight: updatedEpub });

      const updater = mockSetQueryData.mock.calls[0][1];
      const result = updater(existing);

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(pdfHighlight);
      expect(result[1]).toBe(updatedEpub);
      expect(result[2]).toBe(hl3);
    });

    it('uses the correct query key with noteId', () => {
      useUpdateHighlight('different-note-id');
      lastMutationConfig.onSuccess({ highlight: pdfHighlight });

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['highlights', 'different-note-id'],
        expect.any(Function),
      );
    });
  });
});

describe('useDeleteHighlight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mutationFn', () => {
    it('calls api.highlights.delete with noteId and highlightId', async () => {
      mockDelete.mockResolvedValueOnce({ success: true });

      useDeleteHighlight('note-abc');

      const result = await lastMutationConfig.mutationFn('hl-1');

      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockDelete).toHaveBeenCalledWith('note-abc', 'hl-1');
      expect(result).toEqual({ success: true });
    });

    it('throws when noteId is undefined', () => {
      useDeleteHighlight(undefined);

      expect(() => lastMutationConfig.mutationFn('hl-1')).toThrow('No note ID');
    });

    it('does not call the API when noteId is undefined', () => {
      useDeleteHighlight(undefined);

      try {
        lastMutationConfig.mutationFn('hl-1');
      } catch {
        // expected
      }

      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('propagates API errors', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Server error'));

      useDeleteHighlight('note-1');

      await expect(lastMutationConfig.mutationFn('hl-1')).rejects.toThrow('Server error');
    });
  });

  describe('onSuccess cache update', () => {
    it('removes the deleted highlight from cache', () => {
      useDeleteHighlight('note-abc');

      // onSuccess receives (result, highlightId)
      lastMutationConfig.onSuccess({ success: true }, 'hl-1');

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['highlights', 'note-abc'],
        expect.any(Function),
      );

      const updater = mockSetQueryData.mock.calls[0][1];
      const existing: Highlight[] = [pdfHighlight, epubHighlight];
      const result = updater(existing);

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(epubHighlight);
    });

    it('returns empty array when deleting the last highlight', () => {
      useDeleteHighlight('note-abc');
      lastMutationConfig.onSuccess({ success: true }, 'hl-1');

      const updater = mockSetQueryData.mock.calls[0][1];
      const existing: Highlight[] = [pdfHighlight];
      const result = updater(existing);

      expect(result).toEqual([]);
    });

    it('returns empty array when cache is null', () => {
      useDeleteHighlight('note-abc');
      lastMutationConfig.onSuccess({ success: true }, 'hl-1');

      const updater = mockSetQueryData.mock.calls[0][1];
      const result = updater(null);

      expect(result).toEqual([]);
    });

    it('returns empty array when cache is undefined', () => {
      useDeleteHighlight('note-abc');
      lastMutationConfig.onSuccess({ success: true }, 'hl-1');

      const updater = mockSetQueryData.mock.calls[0][1];
      const result = updater(undefined);

      expect(result).toEqual([]);
    });

    it('does not remove highlights with different IDs', () => {
      useDeleteHighlight('note-abc');
      lastMutationConfig.onSuccess({ success: true }, 'hl-nonexistent');

      const updater = mockSetQueryData.mock.calls[0][1];
      const existing: Highlight[] = [pdfHighlight, epubHighlight];
      const result = updater(existing);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(pdfHighlight);
      expect(result[1]).toBe(epubHighlight);
    });

    it('removes only the matching highlight from a list of many', () => {
      const hl3: Highlight = { ...pdfHighlight, id: 'hl-3', text: 'Third' };
      const hl4: Highlight = { ...epubHighlight, id: 'hl-4', text: 'Fourth' };

      useDeleteHighlight('note-abc');
      lastMutationConfig.onSuccess({ success: true }, 'hl-2');

      const updater = mockSetQueryData.mock.calls[0][1];
      const existing: Highlight[] = [pdfHighlight, epubHighlight, hl3, hl4];
      const result = updater(existing);

      expect(result).toHaveLength(3);
      expect(result.map((h: Highlight) => h.id)).toEqual(['hl-1', 'hl-3', 'hl-4']);
    });

    it('uses the correct query key with noteId', () => {
      useDeleteHighlight('my-note-id');
      lastMutationConfig.onSuccess({ success: true }, 'hl-1');

      expect(mockSetQueryData).toHaveBeenCalledWith(
        ['highlights', 'my-note-id'],
        expect.any(Function),
      );
    });
  });
});
