import { createContext, useContext, useEffect, useRef, useCallback, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { WebSocketEvent, WebSocketClientEvent } from '@pulp/shared';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface ConnectionContextValue {
  status: ConnectionStatus;
  subscribeToNote: (noteId: string) => void;
  unsubscribeFromNote: (noteId: string) => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

interface ConnectionProviderProps {
  children: ReactNode;
}

export function ConnectionProvider({ children }: ConnectionProviderProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const failureCountRef = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleMessage = useCallback((event: WebSocketEvent) => {
    switch (event.type) {
      case 'file:changed':
        // Invalidate note query to refetch
        queryClient.invalidateQueries({ queryKey: ['note', event.noteId] });
        queryClient.invalidateQueries({ queryKey: ['highlights', event.noteId] });
        queryClient.invalidateQueries({ queryKey: ['bookmarks', event.noteId] });
        break;

      case 'file:deleted':
        // Remove from cache
        queryClient.removeQueries({ queryKey: ['note', event.noteId] });
        queryClient.invalidateQueries({ queryKey: ['library'] });
        break;

      case 'library:updated':
        // Refetch library
        queryClient.invalidateQueries({ queryKey: ['library'] });
        break;

      case 'client:open-note': {
        const params = new URLSearchParams();
        if (typeof event.page === 'number') {
          params.set('page', String(event.page));
        }
        if (event.cfi) {
          params.set('cfi', event.cfi);
        }

        const search = params.toString();
        navigate(`/read/${event.noteId}${search ? `?${search}` : ''}`);
        break;
      }
    }
  }, [navigate, queryClient]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setStatus('connected');
      failureCountRef.current = 0; // Reset failure count on successful connection
    };

    ws.onmessage = async (event) => {
      try {
        const rawData = typeof event.data === 'string'
          ? event.data
          : event.data instanceof Blob
            ? await event.data.text()
            : String(event.data);
        const message = JSON.parse(rawData) as WebSocketEvent;
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      // Exponential backoff for reconnection
      failureCountRef.current++;
      const delay = Math.min(30000, 1000 * Math.pow(1.5, failureCountRef.current));

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, [handleMessage]);

  const send = useCallback((message: WebSocketClientEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribeToNote = useCallback((noteId: string) => {
    send({ type: 'subscribe:note', noteId });
  }, [send]);

  const unsubscribeFromNote = useCallback((noteId: string) => {
    send({ type: 'unsubscribe:note', noteId });
  }, [send]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <ConnectionContext.Provider value={{ status, subscribeToNote, unsubscribeFromNote }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used within a ConnectionProvider');
  }
  return context;
}

// Hook to subscribe to a specific note's updates
export function useNoteSubscription(noteId: string | undefined) {
  const { subscribeToNote, unsubscribeFromNote, status } = useConnection();

  useEffect(() => {
    if (!noteId || status !== 'connected') return;

    subscribeToNote(noteId);
    return () => unsubscribeFromNote(noteId);
  }, [noteId, status, subscribeToNote, unsubscribeFromNote]);
}
