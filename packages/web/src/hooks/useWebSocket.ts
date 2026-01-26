import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { WebSocketEvent, WebSocketClientEvent } from '@pulp/shared';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface WebSocketHookOptions {
  onFileChanged?: (noteId: string) => void;
  onLibraryUpdated?: () => void;
}

export function useWebSocket(options: WebSocketHookOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      setStatus('connected');
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketEvent;
        handleMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      // Reconnect after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, []);

  const handleMessage = useCallback((event: WebSocketEvent) => {
    switch (event.type) {
      case 'file:changed':
        // Invalidate note query to refetch
        queryClient.invalidateQueries({ queryKey: ['note', event.noteId] });
        queryClient.invalidateQueries({ queryKey: ['highlights', event.noteId] });
        options.onFileChanged?.(event.noteId);
        break;

      case 'file:deleted':
        // Remove from cache
        queryClient.removeQueries({ queryKey: ['note', event.noteId] });
        queryClient.invalidateQueries({ queryKey: ['library'] });
        break;

      case 'library:updated':
        // Refetch library
        queryClient.invalidateQueries({ queryKey: ['library'] });
        options.onLibraryUpdated?.();
        break;
    }
  }, [queryClient, options]);

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

  return {
    status,
    subscribeToNote,
    unsubscribeFromNote,
  };
}

// Hook to subscribe to a specific note's updates
export function useNoteSubscription(noteId: string | undefined) {
  const { subscribeToNote, unsubscribeFromNote, status } = useWebSocket();

  useEffect(() => {
    if (!noteId || status !== 'connected') return;

    subscribeToNote(noteId);
    return () => unsubscribeFromNote(noteId);
  }, [noteId, status, subscribeToNote, unsubscribeFromNote]);
}
