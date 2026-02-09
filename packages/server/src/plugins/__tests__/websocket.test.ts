import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { EventEmitter } from 'node:events';
import type { FileEvent } from '../../services/file-watcher.js';
import type { LiteratureNote } from '@pulp/shared';

// Mock @fastify/websocket so the plugin can register without a real WS server
vi.mock('@fastify/websocket', () => ({
  default: vi.fn(async (fastify: FastifyInstance) => {
    // Decorate fastify so the plugin thinks websocket is registered
    fastify.decorateRequest('socket', null);
  }),
}));

import { websocketPlugin } from '../websocket.js';

// --- Helpers ---

function createTestNote(overrides: Partial<LiteratureNote> = {}): LiteratureNote {
  return {
    id: 'test-note-id',
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
    frontmatter: { tags: ['literature-note'], source: 'test.pdf' },
    ...overrides,
  };
}

/**
 * Creates a mock SocketStream (Duplex-like) that records writes and
 * allows us to simulate incoming data and lifecycle events.
 */
function createMockConnection() {
  const handlers = new Map<string, ((...args: unknown[]) => void)[]>();
  const written: string[] = [];

  return {
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
      return this;
    },
    write(data: string) {
      written.push(data);
    },
    // Test helpers
    emit(event: string, ...args: unknown[]) {
      (handlers.get(event) || []).forEach((h) => h(...args));
    },
    getWritten(): string[] {
      return written;
    },
    getWrittenParsed<T = unknown>(): T[] {
      return written.map((w) => JSON.parse(w) as T);
    },
  };
}

type MockConnection = ReturnType<typeof createMockConnection>;

/**
 * Registers the websocketPlugin with mock dependencies, captures the
 * /ws route handler, and returns helpers for driving tests.
 */
async function setupPlugin() {
  const fileWatcher = new EventEmitter();
  const notes: LiteratureNote[] = [];
  const scanner = {
    getAll: vi.fn(() => notes),
    refresh: vi.fn(),
  };

  const fastify: FastifyInstance = Fastify();
  // Capture the route handler that the plugin registers on /ws
  let wsRouteHandler: ((connection: MockConnection) => void) | null = null;

  const originalGet = fastify.get.bind(fastify);
  // @ts-expect-error -- we intercept the get() call to capture the ws handler
  fastify.get = (path: string, opts: unknown, handler: unknown) => {
    if (path === '/ws') {
      wsRouteHandler = handler as (connection: MockConnection) => void;
      // Still register the route so Fastify is happy
      return originalGet(path, (_req, reply) => {
        reply.send('ws stub');
      });
    }
    return originalGet(path, opts as never, handler as never);
  };

  await fastify.register(websocketPlugin, {
    fileWatcher: fileWatcher as never,
    scanner: scanner as never,
  });

  await fastify.ready();

  function connect(): MockConnection {
    const conn = createMockConnection();
    wsRouteHandler!(conn);
    return conn;
  }

  function emitFileEvent(event: FileEvent) {
    fileWatcher.emit('file', event);
  }

  return {
    fastify,
    fileWatcher,
    scanner,
    notes,
    connect,
    emitFileEvent,
    close: () => fastify.close(),
  };
}

// --- Tests ---

describe('websocketPlugin', () => {
  let ctx: Awaited<ReturnType<typeof setupPlugin>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    ctx = await setupPlugin();
  });

  afterEach(async () => {
    await ctx.close();
  });

  // ----- Client connection lifecycle -----

  describe('client connection lifecycle', () => {
    it('accepts a new WebSocket connection', () => {
      const conn = ctx.connect();
      expect(conn).toBeDefined();
    });

    it('allows multiple simultaneous connections', () => {
      const conn1 = ctx.connect();
      const conn2 = ctx.connect();
      expect(conn1).toBeDefined();
      expect(conn2).toBeDefined();
    });

    it('removes client on close event', () => {
      const conn = ctx.connect();
      conn.emit('close');
      // After close, library events should not reach this connection
      ctx.notes.push(
        createTestNote({ id: 'note-1', notePath: '/test/library/a.md' })
      );
      ctx.emitFileEvent({
        type: 'added',
        path: '/test/library/a.md',
        isLiteratureNote: true,
      });
      expect(conn.getWritten()).toHaveLength(0);
    });

    it('removes client on error event', () => {
      const conn = ctx.connect();
      conn.emit('error', new Error('test error'));
      // Should be cleaned up — no messages delivered
      ctx.notes.push(
        createTestNote({ id: 'note-1', notePath: '/test/library/a.md' })
      );
      ctx.emitFileEvent({
        type: 'added',
        path: '/test/library/a.md',
        isLiteratureNote: true,
      });
      expect(conn.getWritten()).toHaveLength(0);
    });
  });

  // ----- handleClientMessage: subscribe / unsubscribe -----

  describe('handleClientMessage', () => {
    it('subscribes to a note', () => {
      const conn = ctx.connect();
      conn.emit(
        'data',
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
      );
      // The subscription should be tracked — verify by triggering a file:changed event
      const note = createTestNote({
        id: 'note-1',
        notePath: '/test/library/a.md',
      });
      ctx.notes.push(note);
      ctx.emitFileEvent({
        type: 'changed',
        path: '/test/library/a.md',
        isLiteratureNote: true,
      });
      const messages = conn.getWrittenParsed();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        type: 'file:changed',
        noteId: 'note-1',
        path: '/test/library/a.md',
      });
    });

    it('unsubscribes from a note', () => {
      const conn = ctx.connect();
      // Subscribe first
      conn.emit(
        'data',
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
      );
      // Then unsubscribe
      conn.emit(
        'data',
        JSON.stringify({ type: 'unsubscribe:note', noteId: 'note-1' })
      );
      // file:changed should NOT reach the client anymore
      const note = createTestNote({
        id: 'note-1',
        notePath: '/test/library/a.md',
      });
      ctx.notes.push(note);
      ctx.emitFileEvent({
        type: 'changed',
        path: '/test/library/a.md',
        isLiteratureNote: true,
      });
      expect(conn.getWritten()).toHaveLength(0);
    });

    it('handles subscribing to multiple notes', () => {
      const conn = ctx.connect();
      conn.emit(
        'data',
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
      );
      conn.emit(
        'data',
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-2' })
      );

      const note1 = createTestNote({
        id: 'note-1',
        notePath: '/test/library/a.md',
      });
      const note2 = createTestNote({
        id: 'note-2',
        notePath: '/test/library/b.md',
      });
      ctx.notes.push(note1, note2);

      ctx.emitFileEvent({
        type: 'changed',
        path: '/test/library/a.md',
        isLiteratureNote: true,
      });
      ctx.emitFileEvent({
        type: 'changed',
        path: '/test/library/b.md',
        isLiteratureNote: true,
      });

      expect(conn.getWrittenParsed()).toHaveLength(2);
    });

    it('ignores duplicate subscriptions gracefully', () => {
      const conn = ctx.connect();
      conn.emit(
        'data',
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
      );
      conn.emit(
        'data',
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
      );
      // Only one subscription, should still get one message
      const note = createTestNote({
        id: 'note-1',
        notePath: '/test/library/a.md',
      });
      ctx.notes.push(note);
      ctx.emitFileEvent({
        type: 'changed',
        path: '/test/library/a.md',
        isLiteratureNote: true,
      });
      expect(conn.getWrittenParsed()).toHaveLength(1);
    });

    it('handles unsubscribing from a note not subscribed to', () => {
      const conn = ctx.connect();
      // Should not throw
      conn.emit(
        'data',
        JSON.stringify({ type: 'unsubscribe:note', noteId: 'nonexistent' })
      );
      expect(conn.getWritten()).toHaveLength(0);
    });

    it('handles invalid JSON data gracefully', () => {
      const conn = ctx.connect();
      // Should not throw — the plugin catches parse errors
      conn.emit('data', 'not valid json{{{');
      expect(conn.getWritten()).toHaveLength(0);
    });
  });

  // ----- broadcast: selective delivery -----

  describe('broadcast', () => {
    it('sends library:updated events to all connected clients', () => {
      const conn1 = ctx.connect();
      const conn2 = ctx.connect();

      const note = createTestNote({
        id: 'note-added',
        notePath: '/test/library/new.md',
      });
      ctx.notes.push(note);

      ctx.emitFileEvent({
        type: 'added',
        path: '/test/library/new.md',
        isLiteratureNote: true,
      });

      // Both clients should receive the library:updated message
      expect(conn1.getWrittenParsed()).toHaveLength(1);
      expect(conn2.getWrittenParsed()).toHaveLength(1);
      expect(conn1.getWrittenParsed()[0]).toEqual({
        type: 'library:updated',
        action: 'added',
        noteId: 'note-added',
      });
    });

    it('sends file:changed only to subscribed clients', () => {
      const subscribedConn = ctx.connect();
      const unsubscribedConn = ctx.connect();

      subscribedConn.emit(
        'data',
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
      );

      const note = createTestNote({
        id: 'note-1',
        notePath: '/test/library/a.md',
      });
      ctx.notes.push(note);

      ctx.emitFileEvent({
        type: 'changed',
        path: '/test/library/a.md',
        isLiteratureNote: true,
      });

      expect(subscribedConn.getWrittenParsed()).toHaveLength(1);
      expect(unsubscribedConn.getWritten()).toHaveLength(0);
    });

    it('does not send file:changed to client subscribed to a different note', () => {
      const conn = ctx.connect();
      conn.emit(
        'data',
        JSON.stringify({ type: 'subscribe:note', noteId: 'other-note' })
      );

      const note = createTestNote({
        id: 'note-1',
        notePath: '/test/library/a.md',
      });
      ctx.notes.push(note);

      ctx.emitFileEvent({
        type: 'changed',
        path: '/test/library/a.md',
        isLiteratureNote: true,
      });

      expect(conn.getWritten()).toHaveLength(0);
    });

    it('sends library:updated to clients regardless of subscriptions', () => {
      const conn = ctx.connect();
      // No subscriptions at all

      const note = createTestNote({
        id: 'note-new',
        notePath: '/test/library/new.md',
      });
      ctx.notes.push(note);

      ctx.emitFileEvent({
        type: 'added',
        path: '/test/library/new.md',
        isLiteratureNote: true,
      });

      const messages = conn.getWrittenParsed();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        type: 'library:updated',
        action: 'added',
      });
    });
  });

  // ----- File watcher event handling -----

  describe('file watcher event handling', () => {
    describe('added events', () => {
      it('refreshes scanner and broadcasts library:updated on added literature note', () => {
        const conn = ctx.connect();
        const note = createTestNote({
          id: 'new-note',
          notePath: '/test/library/new.md',
        });
        ctx.notes.push(note);

        ctx.emitFileEvent({
          type: 'added',
          path: '/test/library/new.md',
          isLiteratureNote: true,
        });

        expect(ctx.scanner.refresh).toHaveBeenCalledOnce();
        const messages = conn.getWrittenParsed();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
          type: 'library:updated',
          action: 'added',
          noteId: 'new-note',
        });
      });

      it('does not broadcast when the added note cannot be found after refresh', () => {
        const conn = ctx.connect();
        // Notes array is empty — scanner.getAll() returns nothing

        ctx.emitFileEvent({
          type: 'added',
          path: '/test/library/unknown.md',
          isLiteratureNote: true,
        });

        expect(ctx.scanner.refresh).toHaveBeenCalledOnce();
        expect(conn.getWritten()).toHaveLength(0);
      });
    });

    describe('removed events', () => {
      it('looks up note ID before refresh and broadcasts library:updated', () => {
        const conn = ctx.connect();
        const note = createTestNote({
          id: 'removed-note',
          notePath: '/test/library/gone.md',
        });
        ctx.notes.push(note);

        // Track refresh calls to verify ordering
        let notesAtRefreshTime: LiteratureNote[] = [];
        ctx.scanner.refresh.mockImplementation(() => {
          notesAtRefreshTime = [...ctx.notes];
          // Simulate the note being removed from scanner results
          ctx.notes.length = 0;
        });

        ctx.emitFileEvent({
          type: 'removed',
          path: '/test/library/gone.md',
          isLiteratureNote: true,
        });

        expect(ctx.scanner.refresh).toHaveBeenCalledOnce();
        // The note ID should have been captured before refresh
        expect(notesAtRefreshTime).toHaveLength(1);

        const messages = conn.getWrittenParsed();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
          type: 'library:updated',
          action: 'removed',
          noteId: 'removed-note',
        });
      });

      it('does not broadcast when the removed note was not found before refresh', () => {
        const conn = ctx.connect();
        // Notes array is empty — note was already gone

        ctx.emitFileEvent({
          type: 'removed',
          path: '/test/library/unknown.md',
          isLiteratureNote: true,
        });

        expect(ctx.scanner.refresh).toHaveBeenCalledOnce();
        expect(conn.getWritten()).toHaveLength(0);
      });
    });

    describe('changed events', () => {
      it('refreshes scanner and broadcasts file:changed to subscribed clients', () => {
        const conn = ctx.connect();
        conn.emit(
          'data',
          JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
        );

        const note = createTestNote({
          id: 'note-1',
          notePath: '/test/library/a.md',
        });
        ctx.notes.push(note);

        ctx.emitFileEvent({
          type: 'changed',
          path: '/test/library/a.md',
          isLiteratureNote: true,
        });

        expect(ctx.scanner.refresh).toHaveBeenCalledOnce();
        const messages = conn.getWrittenParsed();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
          type: 'file:changed',
          noteId: 'note-1',
          path: '/test/library/a.md',
        });
      });

      it('does not broadcast file:changed when the note cannot be found after refresh', () => {
        const conn = ctx.connect();
        conn.emit(
          'data',
          JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
        );

        // Notes array is empty
        ctx.emitFileEvent({
          type: 'changed',
          path: '/test/library/missing.md',
          isLiteratureNote: true,
        });

        expect(ctx.scanner.refresh).toHaveBeenCalledOnce();
        expect(conn.getWritten()).toHaveLength(0);
      });
    });

    describe('non-literature note events', () => {
      it('ignores file events for non-literature notes that are not removals', () => {
        const conn = ctx.connect();
        conn.emit(
          'data',
          JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
        );

        ctx.emitFileEvent({
          type: 'changed',
          path: '/test/library/random.md',
          isLiteratureNote: false,
        });

        expect(ctx.scanner.refresh).not.toHaveBeenCalled();
        expect(conn.getWritten()).toHaveLength(0);
      });

      it('processes removed events even for non-literature notes', () => {
        // The condition is: event.isLiteratureNote || event.type === 'removed'
        const conn = ctx.connect();
        const note = createTestNote({
          id: 'was-lit-note',
          notePath: '/test/library/was-lit.md',
        });
        ctx.notes.push(note);

        ctx.scanner.refresh.mockImplementation(() => {
          ctx.notes.length = 0;
        });

        ctx.emitFileEvent({
          type: 'removed',
          path: '/test/library/was-lit.md',
          isLiteratureNote: false,
        });

        expect(ctx.scanner.refresh).toHaveBeenCalledOnce();
        const messages = conn.getWrittenParsed();
        expect(messages).toHaveLength(1);
        expect(messages[0]).toEqual({
          type: 'library:updated',
          action: 'removed',
          noteId: 'was-lit-note',
        });
      });

      it('ignores added events for non-literature notes', () => {
        const conn = ctx.connect();

        ctx.emitFileEvent({
          type: 'added',
          path: '/test/library/random.md',
          isLiteratureNote: false,
        });

        expect(ctx.scanner.refresh).not.toHaveBeenCalled();
        expect(conn.getWritten()).toHaveLength(0);
      });
    });

    describe('multiple clients and events', () => {
      it('broadcasts library:updated to all clients on add, file:changed only to subscribers', () => {
        const sub1 = ctx.connect();
        const sub2 = ctx.connect();
        const nosub = ctx.connect();

        sub1.emit(
          'data',
          JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
        );
        sub2.emit(
          'data',
          JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
        );

        const note = createTestNote({
          id: 'note-1',
          notePath: '/test/library/a.md',
        });
        ctx.notes.push(note);

        // First, trigger an added event (library:updated → all clients)
        ctx.emitFileEvent({
          type: 'added',
          path: '/test/library/a.md',
          isLiteratureNote: true,
        });

        // All 3 clients get library:updated
        expect(sub1.getWrittenParsed()).toHaveLength(1);
        expect(sub2.getWrittenParsed()).toHaveLength(1);
        expect(nosub.getWrittenParsed()).toHaveLength(1);

        // Now trigger a changed event (file:changed → only subscribers)
        ctx.emitFileEvent({
          type: 'changed',
          path: '/test/library/a.md',
          isLiteratureNote: true,
        });

        // sub1 and sub2 get both messages, nosub only gets the first
        expect(sub1.getWrittenParsed()).toHaveLength(2);
        expect(sub2.getWrittenParsed()).toHaveLength(2);
        expect(nosub.getWrittenParsed()).toHaveLength(1);
      });

      it('correctly routes events after one client disconnects', () => {
        const conn1 = ctx.connect();
        const conn2 = ctx.connect();

        conn1.emit(
          'data',
          JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
        );
        conn2.emit(
          'data',
          JSON.stringify({ type: 'subscribe:note', noteId: 'note-1' })
        );

        // Disconnect conn1
        conn1.emit('close');

        const note = createTestNote({
          id: 'note-1',
          notePath: '/test/library/a.md',
        });
        ctx.notes.push(note);

        ctx.emitFileEvent({
          type: 'changed',
          path: '/test/library/a.md',
          isLiteratureNote: true,
        });

        // conn1 should not receive anything, conn2 should
        expect(conn1.getWritten()).toHaveLength(0);
        expect(conn2.getWrittenParsed()).toHaveLength(1);
      });
    });
  });
});
