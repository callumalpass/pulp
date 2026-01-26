import type { FastifyPluginAsync } from 'fastify';
import websocket, { SocketStream } from '@fastify/websocket';
import type { WebSocketEvent, WebSocketClientEvent } from '@pulp/shared';
import type { FileWatcher, FileEvent } from '../services/file-watcher.js';
import type { LibraryScanner } from '../services/library-scanner.js';

interface WebSocketPluginOptions {
  fileWatcher: FileWatcher;
  scanner: LibraryScanner;
}

interface ClientState {
  subscribedNotes: Set<string>;
  connection: SocketStream;
}

export const websocketPlugin: FastifyPluginAsync<WebSocketPluginOptions> = async (fastify, opts) => {
  const { fileWatcher, scanner } = opts;
  const clients = new Map<SocketStream, ClientState>();

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

  function broadcast(event: WebSocketEvent): void {
    const message = JSON.stringify(event);

    clients.forEach((state) => {
      // For file events, only send to subscribed clients
      if (event.type === 'file:changed' || event.type === 'file:deleted') {
        if (state.subscribedNotes.has(event.noteId)) {
          state.connection.write(message);
        }
      } else {
        // Library events go to everyone
        state.connection.write(message);
      }
    });
  }

  // Listen to file watcher events
  fileWatcher.on('file', (event: FileEvent) => {
    if (event.isLiteratureNote || event.type === 'removed') {
      // For removed events, we need to look up the note ID BEFORE refreshing
      // Otherwise, the note will be gone from the scanner
      let removedNoteId: string | null = null;
      if (event.type === 'removed') {
        const notes = scanner.getAll();
        const removedNote = notes.find((n) => n.notePath === event.path);
        if (removedNote) {
          removedNoteId = removedNote.id;
        }
      }

      // Refresh the library scanner
      scanner.refresh();

      if (event.type === 'added') {
        const notes = scanner.getAll();
        const addedNote = notes.find((n) => n.notePath === event.path);
        if (addedNote) {
          broadcast({
            type: 'library:updated',
            action: 'added',
            noteId: addedNote.id,
          });
        }
      } else if (event.type === 'removed' && removedNoteId) {
        broadcast({
          type: 'library:updated',
          action: 'removed',
          noteId: removedNoteId,
        });
      } else if (event.type === 'changed') {
        const notes = scanner.getAll();
        const changedNote = notes.find((n) => n.notePath === event.path);
        if (changedNote) {
          broadcast({
            type: 'file:changed',
            noteId: changedNote.id,
            path: event.path,
          });
        }
      }
    }
  });
};
