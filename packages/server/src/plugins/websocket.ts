import type { FastifyPluginAsync } from 'fastify';
import websocket, { SocketStream } from '@fastify/websocket';
import fp from 'fastify-plugin';
import type { WebSocketEvent, WebSocketClientEvent, OpenNoteCommand } from '@pulp/shared';
import type { FileWatcher, FileEvent } from '../services/file-watcher.js';
import type { LibraryScanner } from '../services/library-scanner.js';
import type { SearchIndex } from '../services/search-index.js';

declare module 'fastify' {
  interface FastifyInstance {
    openNoteOnClients: (command: OpenNoteCommand) => number;
  }
}

interface WebSocketPluginOptions {
  fileWatcher: FileWatcher;
  scanner: LibraryScanner;
  searchIndex: SearchIndex;
}

interface ClientState {
  subscribedNotes: Set<string>;
  connection: SocketStream;
}

const websocketPluginImpl: FastifyPluginAsync<WebSocketPluginOptions> = async (fastify, opts) => {
  const { fileWatcher, scanner, searchIndex } = opts;
  const clients = new Map<SocketStream, ClientState>();

  fastify.decorate('openNoteOnClients', (command: OpenNoteCommand) => broadcast({
    type: 'client:open-note',
    ...command,
  }));

  // Register WebSocket plugin
  await fastify.register(websocket);

  // WebSocket route
  fastify.get('/ws', { websocket: true }, (connection) => {
    const clientState: ClientState = {
      subscribedNotes: new Set(),
      connection,
    };
    clients.set(connection, clientState);

    console.log('WebSocket client connected');

    connection.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketClientEvent;
        handleClientMessage(clientState, message);
      } catch (error) {
        console.error('Invalid WebSocket message:', error);
      }
    });

    connection.on('close', () => {
      clients.delete(connection);
      console.log('WebSocket client disconnected');
    });

    connection.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(connection);
    });
  });

  function handleClientMessage(
    state: ClientState,
    message: WebSocketClientEvent
  ): void {
    switch (message.type) {
      case 'subscribe:note':
        state.subscribedNotes.add(message.noteId);
        break;
      case 'unsubscribe:note':
        state.subscribedNotes.delete(message.noteId);
        break;
    }
  }

  function broadcast(event: WebSocketEvent): number {
    const message = JSON.stringify(event);
    let delivered = 0;

    clients.forEach((state) => {
      const sendMessage = () => {
        if ('socket' in state.connection && state.connection.socket && typeof state.connection.socket.send === 'function') {
          state.connection.socket.send(message);
        } else {
          state.connection.write(message);
        }
      };

      // For file events, only send to subscribed clients
      if (event.type === 'file:changed' || event.type === 'file:deleted') {
        if (state.subscribedNotes.has(event.noteId)) {
          sendMessage();
          delivered++;
        }
      } else {
        // Library and client control events go to everyone
        sendMessage();
        delivered++;
      }
    });

    return delivered;
  }

  // Listen to file watcher events
  fileWatcher.on('file', (event: FileEvent) => {
    const notesBefore = scanner.getAll();
    const noteBefore = notesBefore.find((n) => n.notePath === event.path) || null;

    // Process events for current literature notes, removals, or notes that were
    // previously literature notes (e.g. tag/source removed from frontmatter).
    const shouldProcess = event.isLiteratureNote || event.type === 'removed' || noteBefore !== null;
    if (!shouldProcess) {
      return;
    }

    // Refresh scanner first so we can inspect latest note state.
    scanner.refresh();

    const notesAfter = scanner.getAll();
    const noteAfter = notesAfter.find((n) => n.notePath === event.path) || null;

    const reindexNote = (noteId: string) => {
      searchIndex.invalidateIndex(noteId);
    };

    const indexNote = () => {
      if (!noteAfter) return;
      reindexNote(noteAfter.id);
      searchIndex.indexNote(noteAfter).catch((error) => {
        console.error('Background index update error:', error);
      });
    };

    if (event.type === 'added') {
      if (!noteAfter) {
        return;
      }
      indexNote();
      broadcast({
        type: 'library:updated',
        action: 'added',
        noteId: noteAfter.id,
      });
      return;
    }

    if (event.type === 'removed') {
      if (!noteBefore) {
        return;
      }
      reindexNote(noteBefore.id);
      broadcast({
        type: 'library:updated',
        action: 'removed',
        noteId: noteBefore.id,
      });
      return;
    }

    // Handle changed event transitions:
    // - literature note edited in place
    // - note changed from literature -> non-literature
    // - note changed from non-literature -> literature
    if (noteBefore && !noteAfter) {
      reindexNote(noteBefore.id);
      broadcast({
        type: 'library:updated',
        action: 'removed',
        noteId: noteBefore.id,
      });
      return;
    }

    if (!noteBefore && noteAfter) {
      indexNote();
      broadcast({
        type: 'library:updated',
        action: 'added',
        noteId: noteAfter.id,
      });
      return;
    }

    if (!noteAfter) {
      return;
    }

    if (noteBefore && noteBefore.id !== noteAfter.id) {
      reindexNote(noteBefore.id);
    }

    indexNote();
    broadcast({
      type: 'file:changed',
      noteId: noteAfter.id,
      path: event.path,
    });
  });
};

export const websocketPlugin = fp(websocketPluginImpl, {
  name: 'websocket-plugin',
});
