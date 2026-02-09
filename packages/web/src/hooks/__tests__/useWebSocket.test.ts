import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── WebSocket mock ──────────────────────────────────────────────────────

type WSReadyState = 0 | 1 | 2 | 3;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  url: string;
  readyState: WSReadyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  /** Simulate the server accepting the connection. */
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** Simulate receiving a message from the server. */
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  /** Simulate receiving a raw string message (for testing invalid JSON). */
  simulateRawMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  /** Simulate the connection closing. */
  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  /** Simulate a connection error. */
  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

// Install the mock globally before any imports
Object.defineProperty(globalThis, 'WebSocket', {
  value: MockWebSocket,
  writable: true,
});

Object.defineProperty(globalThis, 'window', {
  value: {
    location: {
      protocol: 'http:',
      host: 'localhost:5175',
    },
  },
  writable: true,
});

// ── React mocks ─────────────────────────────────────────────────────────

type CleanupFn = () => void;
let effectCallbacks: Array<{ callback: () => void | CleanupFn; deps: unknown[] }> = [];
let cleanupFns: CleanupFn[] = [];
let refMap: Record<number, { current: unknown }> = {};
let refCounter = 0;
let stateValues: Record<string, unknown> = {};
let stateSetters: Record<string, (v: unknown) => void> = {};
let stateCounter = 0;

vi.mock('react', () => ({
  useCallback: (fn: Function, _deps: unknown[]) => fn,
  useRef: (initial: unknown) => {
    const idx = refCounter++;
    if (!refMap[idx]) {
      refMap[idx] = { current: initial };
    }
    return refMap[idx];
  },
  useEffect: (callback: () => void | CleanupFn, deps: unknown[]) => {
    effectCallbacks.push({ callback, deps });
  },
  useState: (initial: unknown) => {
    const idx = stateCounter++;
    const name = `state_${idx}`;
    if (!(name in stateValues)) {
      stateValues[name] = initial;
    }
    const setter = (v: unknown) => {
      stateValues[name] = typeof v === 'function' ? (v as Function)(stateValues[name]) : v;
    };
    stateSetters[name] = setter;
    return [stateValues[name], setter];
  },
}));

// ── React Query mock ────────────────────────────────────────────────────

const mockInvalidateQueries = vi.fn();
const mockRemoveQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    removeQueries: mockRemoveQueries,
  }),
}));

import { useWebSocket, useNoteSubscription } from '../useWebSocket';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetMockState() {
  MockWebSocket.instances = [];
  refMap = {};
  refCounter = 0;
  stateValues = {};
  stateSetters = {};
  stateCounter = 0;
  effectCallbacks = [];
  cleanupFns = [];
  (globalThis.window as { location: { protocol: string; host: string } }).location = {
    protocol: 'http:',
    host: 'localhost:5175',
  };
}

function runEffects() {
  for (const { callback } of effectCallbacks) {
    const cleanup = callback();
    if (typeof cleanup === 'function') {
      cleanupFns.push(cleanup);
    }
  }
  effectCallbacks = [];
}

function runCleanups() {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
}

/** Call the hook and run its mount effects, returning the hook result. */
function mountWebSocket(options?: { onFileChanged?: (noteId: string) => void; onLibraryUpdated?: () => void }) {
  const result = useWebSocket(options);
  runEffects();
  return result;
}

function getLatestWS(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    runCleanups();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('returns the expected API shape', () => {
      const result = useWebSocket();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('subscribeToNote');
      expect(result).toHaveProperty('unsubscribeFromNote');
    });

    it('starts with disconnected status', () => {
      const result = useWebSocket();

      expect(result.status).toBe('disconnected');
    });
  });

  describe('connection lifecycle', () => {
    it('creates a WebSocket connection on mount', () => {
      mountWebSocket();

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('uses ws: protocol for http: pages', () => {
      mountWebSocket();

      const ws = getLatestWS();
      expect(ws.url).toBe('ws://localhost:5175/ws');
    });

    it('uses wss: protocol for https: pages', () => {
      (globalThis.window as { location: { protocol: string; host: string } }).location = {
        protocol: 'https:',
        host: 'example.com',
      };

      mountWebSocket();

      const ws = getLatestWS();
      expect(ws.url).toBe('wss://example.com/ws');
    });

    it('transitions to connecting status when connect is called', () => {
      // The status setter is called with 'connecting' during connect().
      // Since our mock useState captures the setter calls, we check stateValues.
      mountWebSocket();

      expect(stateValues['state_0']).toBe('connecting');
    });

    it('transitions to connected status on open', () => {
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateOpen();

      expect(stateValues['state_0']).toBe('connected');
    });

    it('transitions to disconnected status on close', () => {
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateOpen();
      expect(stateValues['state_0']).toBe('connected');

      ws.simulateClose();
      expect(stateValues['state_0']).toBe('disconnected');
    });

    it('does not create a new connection if already open', () => {
      mountWebSocket();
      const ws = getLatestWS();
      ws.simulateOpen();

      // Manually calling connect again should be a no-op since readyState is OPEN
      // We access the internal connect through re-running the effect
      // But the guard `if (wsRef.current?.readyState === WebSocket.OPEN) return;` prevents it.
      // Let's verify by checking that only one WebSocket was created.
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('reconnection', () => {
    it('reconnects after 3000ms when connection closes', () => {
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateOpen();
      ws.simulateClose();

      expect(MockWebSocket.instances).toHaveLength(1);

      vi.advanceTimersByTime(3000);

      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('does not reconnect before the 3000ms delay', () => {
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateOpen();
      ws.simulateClose();

      vi.advanceTimersByTime(2999);

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('clears wsRef on close so reconnect can proceed', () => {
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateOpen();
      ws.simulateClose();

      // The wsRef should be null after close
      // ref 0 = wsRef, ref 1 = reconnectTimeoutRef
      expect(refMap[0].current).toBeNull();
    });

    it('sets status to connecting during reconnect', () => {
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateOpen();
      ws.simulateClose();

      vi.advanceTimersByTime(3000);

      // A new WS was created, status should be 'connecting'
      expect(stateValues['state_0']).toBe('connecting');
    });
  });

  describe('cleanup on unmount', () => {
    it('closes the WebSocket on unmount', () => {
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateOpen();

      runCleanups();

      expect(ws.close).toHaveBeenCalledTimes(1);
    });

    it('clears the reconnect timeout on unmount', () => {
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateOpen();
      ws.simulateClose();

      // Reconnect is scheduled but we unmount before it fires
      runCleanups();

      // Advancing time should NOT create a new connection
      vi.advanceTimersByTime(5000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('message handling', () => {
    it('handles file:changed events by invalidating note and highlights queries', () => {
      const onFileChanged = vi.fn();
      mountWebSocket({ onFileChanged });
      const ws = getLatestWS();
      ws.simulateOpen();

      ws.simulateMessage({
        type: 'file:changed',
        noteId: 'note-123',
        path: '/path/to/file.md',
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-123'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['highlights', 'note-123'] });
      expect(onFileChanged).toHaveBeenCalledWith('note-123');
    });

    it('handles file:deleted events by removing note cache and invalidating library', () => {
      mountWebSocket();
      const ws = getLatestWS();
      ws.simulateOpen();

      ws.simulateMessage({
        type: 'file:deleted',
        noteId: 'note-456',
        path: '/path/to/deleted.md',
      });

      expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-456'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('handles library:updated events by invalidating library query', () => {
      const onLibraryUpdated = vi.fn();
      mountWebSocket({ onLibraryUpdated });
      const ws = getLatestWS();
      ws.simulateOpen();

      ws.simulateMessage({
        type: 'library:updated',
        action: 'added',
        noteId: 'note-789',
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
      expect(onLibraryUpdated).toHaveBeenCalledTimes(1);
    });

    it('does not crash on invalid JSON messages', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mountWebSocket();
      const ws = getLatestWS();
      ws.simulateOpen();

      expect(() => {
        ws.simulateRawMessage('not valid json {{{');
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse WebSocket message:',
        expect.any(SyntaxError),
      );

      consoleSpy.mockRestore();
    });

    it('does not call callbacks for unknown event types', () => {
      const onFileChanged = vi.fn();
      const onLibraryUpdated = vi.fn();
      mountWebSocket({ onFileChanged, onLibraryUpdated });
      const ws = getLatestWS();
      ws.simulateOpen();

      ws.simulateMessage({ type: 'unknown:event', data: 'foo' });

      expect(onFileChanged).not.toHaveBeenCalled();
      expect(onLibraryUpdated).not.toHaveBeenCalled();
      expect(mockInvalidateQueries).not.toHaveBeenCalled();
      expect(mockRemoveQueries).not.toHaveBeenCalled();
    });

    it('handles file:changed without onFileChanged callback', () => {
      mountWebSocket();
      const ws = getLatestWS();
      ws.simulateOpen();

      // Should not throw even without the callback
      expect(() => {
        ws.simulateMessage({
          type: 'file:changed',
          noteId: 'note-123',
          path: '/path/to/file.md',
        });
      }).not.toThrow();

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-123'] });
    });

    it('handles library:updated without onLibraryUpdated callback', () => {
      mountWebSocket();
      const ws = getLatestWS();
      ws.simulateOpen();

      expect(() => {
        ws.simulateMessage({
          type: 'library:updated',
          action: 'removed',
          noteId: 'note-123',
        });
      }).not.toThrow();

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });
  });

  describe('error handling', () => {
    it('logs WebSocket errors to console', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mountWebSocket();
      const ws = getLatestWS();

      ws.simulateError();

      expect(consoleSpy).toHaveBeenCalledWith(
        'WebSocket error:',
        expect.any(Event),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('send', () => {
    it('sends JSON messages when WebSocket is open', () => {
      const result = mountWebSocket();
      const ws = getLatestWS();
      ws.simulateOpen();

      result.subscribeToNote('note-123');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-123' }),
      );
    });

    it('does not send when WebSocket is not open', () => {
      const result = mountWebSocket();
      const ws = getLatestWS();
      // Don't call simulateOpen — readyState is CONNECTING

      result.subscribeToNote('note-123');

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('does not send when WebSocket is null', () => {
      const result = useWebSocket();
      // Don't run effects, so wsRef is null

      // Should not throw
      expect(() => {
        result.subscribeToNote('note-123');
      }).not.toThrow();
    });
  });

  describe('subscribeToNote', () => {
    it('sends a subscribe:note message', () => {
      const result = mountWebSocket();
      const ws = getLatestWS();
      ws.simulateOpen();

      result.subscribeToNote('note-abc');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-abc' }),
      );
    });
  });

  describe('unsubscribeFromNote', () => {
    it('sends an unsubscribe:note message', () => {
      const result = mountWebSocket();
      const ws = getLatestWS();
      ws.simulateOpen();

      result.unsubscribeFromNote('note-abc');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe:note', noteId: 'note-abc' }),
      );
    });
  });

  describe('multiple messages in sequence', () => {
    it('handles multiple different event types in sequence', () => {
      const onFileChanged = vi.fn();
      const onLibraryUpdated = vi.fn();
      mountWebSocket({ onFileChanged, onLibraryUpdated });
      const ws = getLatestWS();
      ws.simulateOpen();

      ws.simulateMessage({ type: 'file:changed', noteId: 'note-1', path: '/a.md' });
      ws.simulateMessage({ type: 'file:deleted', noteId: 'note-2', path: '/b.md' });
      ws.simulateMessage({ type: 'library:updated', action: 'added', noteId: 'note-3' });

      expect(onFileChanged).toHaveBeenCalledTimes(1);
      expect(onFileChanged).toHaveBeenCalledWith('note-1');
      expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-2'] });
      expect(onLibraryUpdated).toHaveBeenCalledTimes(1);
    });

    it('handles multiple file:changed events for different notes', () => {
      const onFileChanged = vi.fn();
      mountWebSocket({ onFileChanged });
      const ws = getLatestWS();
      ws.simulateOpen();

      ws.simulateMessage({ type: 'file:changed', noteId: 'note-1', path: '/a.md' });
      ws.simulateMessage({ type: 'file:changed', noteId: 'note-2', path: '/b.md' });

      expect(onFileChanged).toHaveBeenCalledTimes(2);
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-1'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-2'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['highlights', 'note-1'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['highlights', 'note-2'] });
    });
  });

  describe('reconnection after multiple closes', () => {
    it('reconnects successfully after the second close', () => {
      mountWebSocket();

      // First connection
      const ws1 = getLatestWS();
      ws1.simulateOpen();
      ws1.simulateClose();

      // Wait for reconnect
      vi.advanceTimersByTime(3000);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Second connection
      const ws2 = getLatestWS();
      ws2.simulateOpen();
      ws2.simulateClose();

      // Wait for second reconnect
      vi.advanceTimersByTime(3000);
      expect(MockWebSocket.instances).toHaveLength(3);
    });
  });
});

describe('useNoteSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    runCleanups();
    vi.useRealTimers();
  });

  it('subscribes to a note when connected', () => {
    // useNoteSubscription internally calls useWebSocket, which registers effects.
    // We need to simulate the full lifecycle.
    useNoteSubscription('note-abc');

    // Run the useWebSocket mount effect (creates the WS)
    runEffects();

    const ws = getLatestWS();
    ws.simulateOpen();

    // Now we need to simulate the useNoteSubscription effect.
    // The subscription effect depends on status being 'connected',
    // which our useState mock now reflects.
    // Since useNoteSubscription uses a separate useEffect, we need to
    // reset and re-run the hook to pick up the new status.
    // In our mock setup, useEffect just collects callbacks.
    // The subscription effect was already collected during the initial call,
    // but it checks status !== 'connected' at call time.

    // Re-collect effects to simulate the re-render with connected status
    stateCounter = 0;
    refCounter = 0;
    useNoteSubscription('note-abc');
    runEffects();

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'subscribe:note', noteId: 'note-abc' }),
    );
  });

  it('does not subscribe when noteId is undefined', () => {
    useNoteSubscription(undefined);
    runEffects();

    const ws = getLatestWS();
    ws.simulateOpen();

    // Re-run with connected status
    stateCounter = 0;
    refCounter = 0;
    useNoteSubscription(undefined);
    runEffects();

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('does not subscribe when status is not connected', () => {
    useNoteSubscription('note-abc');
    runEffects();

    // Don't call simulateOpen — status stays 'connecting'
    const ws = getLatestWS();

    // Re-run to pick up effect
    stateCounter = 0;
    refCounter = 0;
    useNoteSubscription('note-abc');
    runEffects();

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('unsubscribes on cleanup when WS is still open', () => {
    useNoteSubscription('note-abc');
    runEffects();

    const ws = getLatestWS();
    ws.simulateOpen();

    // Re-run with connected status to register the subscription effect
    stateCounter = 0;
    refCounter = 0;
    useNoteSubscription('note-abc');
    runEffects();

    // Run cleanups in reverse order so subscription cleanup runs before WS close.
    // The subscription useEffect cleanup calls unsubscribeFromNote, which sends
    // only if the WS is still open.
    const subscriptionCleanup = cleanupFns.pop()!;
    subscriptionCleanup();

    const sendCalls = ws.send.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])));
    const unsubCall = sendCalls.find((c: { type: string }) => c.type === 'unsubscribe:note');
    expect(unsubCall).toEqual({ type: 'unsubscribe:note', noteId: 'note-abc' });
  });
});
