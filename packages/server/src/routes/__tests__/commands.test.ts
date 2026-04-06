import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { commandRoutes } from '../commands.js';
import type { LibraryScanner } from '../../services/library-scanner.js';
import type { LiteratureNote } from '@pulp/shared';

function createTestNote(overrides: Partial<LiteratureNote> = {}): LiteratureNote {
  return {
    id: 'test-note',
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
    frontmatter: {},
    ...overrides,
  };
}

function createMockScanner(notes: Map<string, LiteratureNote>): LibraryScanner {
  return {
    getById: vi.fn((id: string) => notes.get(id)),
  } as unknown as LibraryScanner;
}

describe('commandRoutes', () => {
  let app: FastifyInstance;
  let notes: Map<string, LiteratureNote>;
  let mockScanner: LibraryScanner;
  let openNoteOnClients: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    notes = new Map();
    mockScanner = createMockScanner(notes);
    openNoteOnClients = vi.fn(() => 2);
    app = Fastify();
    app.decorate('openNoteOnClients', openNoteOnClients as never);
    await app.register(commandRoutes, { scanner: mockScanner });
  });

  afterEach(async () => {
    await app.close();
  });

  it('broadcasts an open-note command for an existing note', async () => {
    notes.set('note-1', createTestNote({ id: 'note-1' }));

    const response = await app.inject({
      method: 'POST',
      url: '/api/commands/open-note',
      payload: {
        noteId: 'note-1',
        page: 5,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(openNoteOnClients).toHaveBeenCalledWith({
      noteId: 'note-1',
      page: 5,
      cfi: undefined,
    });
    expect(response.json()).toEqual({
      ok: true,
      noteId: 'note-1',
      deliveredToClients: 2,
    });
  });

  it('returns 404 when the note does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/commands/open-note',
      payload: {
        noteId: 'missing-note',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(openNoteOnClients).not.toHaveBeenCalled();
  });

  it('validates the request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/commands/open-note',
      payload: {
        noteId: 'note-1',
        page: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(openNoteOnClients).not.toHaveBeenCalled();
  });
});
