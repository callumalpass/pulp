import { describe, it, expect } from 'vitest';
import {
  filterNotes,
  hasActiveFilters,
  countActiveFilters,
  findContinueReadingBook,
  excludeContinueReadingBook,
} from '../library-filters';
import type { LiteratureNoteSummary } from '@pulp/shared';

// ── Fixtures ────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<LiteratureNoteSummary> = {}): LiteratureNoteSummary {
  return {
    id: 'note-1',
    title: 'Test Book',
    author: 'Author',
    citekey: null,
    sourceType: 'pdf',
    progress: 0,
    lastRead: null,
    dateCreated: '2025-01-01T00:00:00Z',
    dateFinished: null,
    yearCompleted: null,
    cover: null,
    pinned: false,
    paused: false,
    pausedAt: null,
    rating: null,
    readingStats: null,
    totalPages: 100,
    highlightCount: 0,
    collections: [],
    currentChapter: null,
    csl: null,
    ...overrides,
  };
}

const sampleNotes: LiteratureNoteSummary[] = [
  makeNote({ id: '1', title: 'Deep Learning', sourceType: 'pdf', progress: 0, collections: ['AI'] }),
  makeNote({ id: '2', title: 'Clean Code', sourceType: 'epub', progress: 50, lastRead: '2025-06-10T12:00:00Z', collections: ['Programming'] }),
  makeNote({ id: '3', title: 'Design Patterns', sourceType: 'pdf', progress: 100, collections: ['Programming'], citekey: 'gamma1994' }),
  makeNote({ id: '4', title: 'EPUB Guide', sourceType: 'epub', progress: 0, collections: [] }),
  makeNote({ id: '5', title: 'Advanced React', sourceType: 'epub', progress: 75, lastRead: '2025-06-15T10:00:00Z', collections: ['Programming', 'AI'] }),
];

const defaultFilterOptions = {
  searchQuery: '',
  searchMode: 'title' as const,
  typeFilter: 'all' as const,
  progressFilter: 'all' as const,
  collectionFilter: null,
};

// ── filterNotes ─────────────────────────────────────────────────────────

describe('filterNotes', () => {
  // ── Happy path ──────────────────────────────────────────────────────

  describe('no filters applied', () => {
    it('returns all notes when no filters are set', () => {
      const result = filterNotes(sampleNotes, defaultFilterOptions);
      expect(result).toHaveLength(5);
    });

    it('preserves original note order', () => {
      const result = filterNotes(sampleNotes, defaultFilterOptions);
      expect(result.map(n => n.id)).toEqual(['1', '2', '3', '4', '5']);
    });
  });

  // ── Title search ────────────────────────────────────────────────────

  describe('title search', () => {
    it('matches notes by title (case-insensitive)', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchQuery: 'deep',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('matches partial title strings', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchQuery: 'code',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('matches by citekey', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchQuery: 'gamma1994',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('matches by citekey case-insensitively', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchQuery: 'GAMMA1994',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('matches either title or citekey', () => {
      const notes = [
        makeNote({ id: '1', title: 'No Match Here', citekey: 'findme' }),
        makeNote({ id: '2', title: 'Find Me In Title', citekey: null }),
      ];
      const result = filterNotes(notes, {
        ...defaultFilterOptions,
        searchQuery: 'find',
      });
      expect(result).toHaveLength(2);
    });

    it('trims whitespace from search query', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchQuery: '  deep  ',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('returns empty array when no notes match', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchQuery: 'nonexistent',
      });
      expect(result).toHaveLength(0);
    });

    it('does not apply title search in content mode', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchMode: 'content',
        searchQuery: 'nonexistent',
      });
      expect(result).toHaveLength(5);
    });

    it('does not filter when query is only whitespace', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchQuery: '   ',
      });
      expect(result).toHaveLength(5);
    });
  });

  // ── Type filter ─────────────────────────────────────────────────────

  describe('type filter', () => {
    it('filters by pdf type', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        typeFilter: 'pdf',
      });
      expect(result).toHaveLength(2);
      expect(result.every(n => n.sourceType === 'pdf')).toBe(true);
    });

    it('filters by epub type', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        typeFilter: 'epub',
      });
      expect(result).toHaveLength(3);
      expect(result.every(n => n.sourceType === 'epub')).toBe(true);
    });

    it('returns all notes with "all" type filter', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        typeFilter: 'all',
      });
      expect(result).toHaveLength(5);
    });
  });

  // ── Progress filter ─────────────────────────────────────────────────

  describe('progress filter', () => {
    it('filters unread books (progress === 0)', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        progressFilter: 'unread',
      });
      expect(result).toHaveLength(2);
      expect(result.every(n => n.progress === 0)).toBe(true);
    });

    it('filters reading books (0 < progress < 100)', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        progressFilter: 'reading',
      });
      expect(result).toHaveLength(2);
      expect(result.every(n => n.progress > 0 && n.progress < 100)).toBe(true);
    });

    it('filters completed books (progress === 100)', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        progressFilter: 'completed',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('returns all with "all" progress filter', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        progressFilter: 'all',
      });
      expect(result).toHaveLength(5);
    });
  });

  // ── Progress filter edge cases ──────────────────────────────────────

  describe('progress filter boundary values', () => {
    it('treats progress=0 as unread, not reading', () => {
      const notes = [makeNote({ id: '1', progress: 0 })];
      expect(filterNotes(notes, { ...defaultFilterOptions, progressFilter: 'unread' })).toHaveLength(1);
      expect(filterNotes(notes, { ...defaultFilterOptions, progressFilter: 'reading' })).toHaveLength(0);
    });

    it('treats progress=100 as completed, not reading', () => {
      const notes = [makeNote({ id: '1', progress: 100 })];
      expect(filterNotes(notes, { ...defaultFilterOptions, progressFilter: 'completed' })).toHaveLength(1);
      expect(filterNotes(notes, { ...defaultFilterOptions, progressFilter: 'reading' })).toHaveLength(0);
    });

    it('treats progress=1 as reading', () => {
      const notes = [makeNote({ id: '1', progress: 1 })];
      expect(filterNotes(notes, { ...defaultFilterOptions, progressFilter: 'reading' })).toHaveLength(1);
      expect(filterNotes(notes, { ...defaultFilterOptions, progressFilter: 'unread' })).toHaveLength(0);
    });

    it('treats progress=99 as reading', () => {
      const notes = [makeNote({ id: '1', progress: 99 })];
      expect(filterNotes(notes, { ...defaultFilterOptions, progressFilter: 'reading' })).toHaveLength(1);
      expect(filterNotes(notes, { ...defaultFilterOptions, progressFilter: 'completed' })).toHaveLength(0);
    });
  });

  // ── Collection filter ───────────────────────────────────────────────

  describe('collection filter', () => {
    it('filters by collection name', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        collectionFilter: 'AI',
      });
      expect(result).toHaveLength(2);
      expect(result.map(n => n.id)).toEqual(['1', '5']);
    });

    it('filters by another collection', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        collectionFilter: 'Programming',
      });
      expect(result).toHaveLength(3);
      expect(result.map(n => n.id)).toEqual(['2', '3', '5']);
    });

    it('returns empty when no notes belong to collection', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        collectionFilter: 'NonExistent',
      });
      expect(result).toHaveLength(0);
    });

    it('returns all when collection filter is null', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        collectionFilter: null,
      });
      expect(result).toHaveLength(5);
    });
  });

  // ── Combined filters ────────────────────────────────────────────────

  describe('combined filters', () => {
    it('combines type and progress filters', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        typeFilter: 'epub',
        progressFilter: 'reading',
      });
      expect(result).toHaveLength(2);
      expect(result.map(n => n.id)).toEqual(['2', '5']);
    });

    it('combines search and type filters', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        searchQuery: 'react',
        typeFilter: 'epub',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('5');
    });

    it('combines all filters together', () => {
      const result = filterNotes(sampleNotes, {
        searchQuery: 'advanced',
        searchMode: 'title',
        typeFilter: 'epub',
        progressFilter: 'reading',
        collectionFilter: 'Programming',
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('5');
    });

    it('returns empty when combined filters are contradictory', () => {
      const result = filterNotes(sampleNotes, {
        ...defaultFilterOptions,
        typeFilter: 'pdf',
        progressFilter: 'reading',
        collectionFilter: 'AI',
      });
      // id=1 is pdf + AI but progress 0, so excluded by reading filter
      expect(result).toHaveLength(0);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty notes array', () => {
      const result = filterNotes([], defaultFilterOptions);
      expect(result).toHaveLength(0);
    });

    it('handles notes with null citekey during search', () => {
      const notes = [makeNote({ id: '1', title: 'Test', citekey: null })];
      const result = filterNotes(notes, {
        ...defaultFilterOptions,
        searchQuery: 'xyz',
      });
      expect(result).toHaveLength(0);
    });

    it('handles notes with empty collections array', () => {
      const notes = [makeNote({ id: '1', collections: [] })];
      const result = filterNotes(notes, {
        ...defaultFilterOptions,
        collectionFilter: 'Any',
      });
      expect(result).toHaveLength(0);
    });

    it('does not mutate the input array', () => {
      const notes = [...sampleNotes];
      const original = [...notes];
      filterNotes(notes, { ...defaultFilterOptions, typeFilter: 'pdf' });
      expect(notes).toEqual(original);
    });
  });
});

// ── hasActiveFilters ────────────────────────────────────────────────────

describe('hasActiveFilters', () => {
  it('returns false when all defaults', () => {
    expect(hasActiveFilters('', 'all', 'all', null)).toBe(false);
  });

  it('returns true when search query is set', () => {
    expect(hasActiveFilters('test', 'all', 'all', null)).toBe(true);
  });

  it('returns true when type filter is not "all"', () => {
    expect(hasActiveFilters('', 'pdf', 'all', null)).toBe(true);
    expect(hasActiveFilters('', 'epub', 'all', null)).toBe(true);
  });

  it('returns true when progress filter is not "all"', () => {
    expect(hasActiveFilters('', 'all', 'unread', null)).toBe(true);
    expect(hasActiveFilters('', 'all', 'reading', null)).toBe(true);
    expect(hasActiveFilters('', 'all', 'completed', null)).toBe(true);
  });

  it('returns true when collection filter is set', () => {
    expect(hasActiveFilters('', 'all', 'all', 'Science')).toBe(true);
  });

  it('returns true when multiple filters are active', () => {
    expect(hasActiveFilters('query', 'pdf', 'reading', 'Science')).toBe(true);
  });

  it('treats empty string search as no filter', () => {
    expect(hasActiveFilters('', 'all', 'all', null)).toBe(false);
  });
});

// ── countActiveFilters ──────────────────────────────────────────────────

describe('countActiveFilters', () => {
  it('returns 0 when no filters are active', () => {
    expect(countActiveFilters('all', 'all', null)).toBe(0);
  });

  it('counts type filter', () => {
    expect(countActiveFilters('pdf', 'all', null)).toBe(1);
  });

  it('counts progress filter', () => {
    expect(countActiveFilters('all', 'reading', null)).toBe(1);
  });

  it('counts collection filter', () => {
    expect(countActiveFilters('all', 'all', 'Science')).toBe(1);
  });

  it('counts all three filters', () => {
    expect(countActiveFilters('epub', 'completed', 'History')).toBe(3);
  });

  it('counts two filters', () => {
    expect(countActiveFilters('pdf', 'unread', null)).toBe(2);
  });

  it('does not count search query (separate from filter badges)', () => {
    // countActiveFilters does not take searchQuery as a parameter
    expect(countActiveFilters('all', 'all', null)).toBe(0);
  });
});

// ── findContinueReadingBook ─────────────────────────────────────────────

describe('findContinueReadingBook', () => {
  // ── Happy path ──────────────────────────────────────────────────────

  it('returns the most recently read in-progress book', () => {
    const notes = [
      makeNote({ id: '1', progress: 30, lastRead: '2025-06-10T12:00:00Z' }),
      makeNote({ id: '2', progress: 60, lastRead: '2025-06-15T12:00:00Z' }),
      makeNote({ id: '3', progress: 45, lastRead: '2025-06-12T12:00:00Z' }),
    ];
    const result = findContinueReadingBook(notes);
    expect(result?.id).toBe('2');
  });

  it('picks the book with the latest lastRead date', () => {
    const notes = [
      makeNote({ id: 'old', progress: 50, lastRead: '2025-01-01T00:00:00Z' }),
      makeNote({ id: 'new', progress: 50, lastRead: '2025-12-31T23:59:59Z' }),
    ];
    const result = findContinueReadingBook(notes);
    expect(result?.id).toBe('new');
  });

  // ── Exclusion criteria ──────────────────────────────────────────────

  it('excludes books with progress=0 (unread)', () => {
    const notes = [
      makeNote({ id: '1', progress: 0, lastRead: '2025-06-15T12:00:00Z' }),
    ];
    expect(findContinueReadingBook(notes)).toBeNull();
  });

  it('excludes books with progress=100 (completed)', () => {
    const notes = [
      makeNote({ id: '1', progress: 100, lastRead: '2025-06-15T12:00:00Z' }),
    ];
    expect(findContinueReadingBook(notes)).toBeNull();
  });

  it('excludes books without a lastRead date', () => {
    const notes = [
      makeNote({ id: '1', progress: 50, lastRead: null }),
    ];
    expect(findContinueReadingBook(notes)).toBeNull();
  });

  // ── Boundary values ─────────────────────────────────────────────────

  it('includes books with progress=1 (just started)', () => {
    const notes = [
      makeNote({ id: '1', progress: 1, lastRead: '2025-06-15T12:00:00Z' }),
    ];
    const result = findContinueReadingBook(notes);
    expect(result?.id).toBe('1');
  });

  it('includes books with progress=99 (almost done)', () => {
    const notes = [
      makeNote({ id: '1', progress: 99, lastRead: '2025-06-15T12:00:00Z' }),
    ];
    const result = findContinueReadingBook(notes);
    expect(result?.id).toBe('1');
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it('returns null for empty notes array', () => {
    expect(findContinueReadingBook([])).toBeNull();
  });

  it('returns null when all books are unread', () => {
    const notes = [
      makeNote({ id: '1', progress: 0 }),
      makeNote({ id: '2', progress: 0 }),
    ];
    expect(findContinueReadingBook(notes)).toBeNull();
  });

  it('returns null when all books are completed', () => {
    const notes = [
      makeNote({ id: '1', progress: 100, lastRead: '2025-06-15T12:00:00Z' }),
      makeNote({ id: '2', progress: 100, lastRead: '2025-06-14T12:00:00Z' }),
    ];
    expect(findContinueReadingBook(notes)).toBeNull();
  });

  it('handles a single valid in-progress book', () => {
    const notes = [
      makeNote({ id: 'only', progress: 42, lastRead: '2025-06-15T12:00:00Z' }),
    ];
    const result = findContinueReadingBook(notes);
    expect(result?.id).toBe('only');
  });

  it('handles books with identical lastRead dates (returns first by sort stability)', () => {
    const notes = [
      makeNote({ id: 'a', progress: 50, lastRead: '2025-06-15T12:00:00Z' }),
      makeNote({ id: 'b', progress: 50, lastRead: '2025-06-15T12:00:00Z' }),
    ];
    const result = findContinueReadingBook(notes);
    // Both have same date; sort is stable, first element stays first
    expect(result).not.toBeNull();
    expect(['a', 'b']).toContain(result?.id);
  });

  it('does not mutate the input array', () => {
    const notes = [
      makeNote({ id: '1', progress: 30, lastRead: '2025-06-10T12:00:00Z' }),
      makeNote({ id: '2', progress: 60, lastRead: '2025-06-15T12:00:00Z' }),
    ];
    const original = [...notes];
    findContinueReadingBook(notes);
    expect(notes).toEqual(original);
  });

  it('filters out books that have progress > 0 but no lastRead', () => {
    const notes = [
      makeNote({ id: '1', progress: 50, lastRead: null }),
      makeNote({ id: '2', progress: 25, lastRead: '2025-06-15T12:00:00Z' }),
    ];
    const result = findContinueReadingBook(notes);
    expect(result?.id).toBe('2');
  });
});

// ── excludeContinueReadingBook ──────────────────────────────────────────

describe('excludeContinueReadingBook', () => {
  it('removes the continue reading book from the list', () => {
    const continueBook = makeNote({ id: '2' });
    const notes = [
      makeNote({ id: '1' }),
      makeNote({ id: '2' }),
      makeNote({ id: '3' }),
    ];
    const result = excludeContinueReadingBook(notes, continueBook);
    expect(result).toHaveLength(2);
    expect(result.map(n => n.id)).toEqual(['1', '3']);
  });

  it('returns all notes when continueReadingBook is null', () => {
    const notes = [makeNote({ id: '1' }), makeNote({ id: '2' })];
    const result = excludeContinueReadingBook(notes, null);
    expect(result).toHaveLength(2);
  });

  it('returns all notes when book is not in the list', () => {
    const continueBook = makeNote({ id: 'missing' });
    const notes = [makeNote({ id: '1' }), makeNote({ id: '2' })];
    const result = excludeContinueReadingBook(notes, continueBook);
    expect(result).toHaveLength(2);
  });

  it('handles empty notes array', () => {
    const continueBook = makeNote({ id: '1' });
    const result = excludeContinueReadingBook([], continueBook);
    expect(result).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const continueBook = makeNote({ id: '2' });
    const notes = [makeNote({ id: '1' }), makeNote({ id: '2' }), makeNote({ id: '3' })];
    const original = [...notes];
    excludeContinueReadingBook(notes, continueBook);
    expect(notes).toEqual(original);
  });
});
