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

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  simulateRawMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  simulateError() {
    this.onerror?.(new Event('error'));
  }
}

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
let stateCounter = 0;

// Context values are captured via globalThis.__capturedContextValue (set by jsx runtime mock).
// This local getter/setter provides convenient access.
function getCapturedContextValue(): unknown {
  return (globalThis as Record<string, unknown>).__capturedContextValue ?? null;
}
function setCapturedContextValue(v: unknown) {
  (globalThis as Record<string, unknown>).__capturedContextValue = v;
}

// Mock both jsx runtimes to capture context Provider value props.
// vi.mock factories are hoisted, so we must inline the interceptor logic.
vi.mock('react/jsx-runtime', () => {
  const interceptor = (_type: unknown, props: Record<string, unknown>) => {
    if (props && 'value' in props) {
      // Access via globalThis to avoid hoisting issues
      (globalThis as Record<string, unknown>).__capturedContextValue = props.value;
    }
    return { type: _type, props };
  };
  return { jsx: interceptor, jsxs: interceptor };
});

vi.mock('react/jsx-dev-runtime', () => {
  const interceptor = (_type: unknown, props: Record<string, unknown>) => {
    if (props && 'value' in props) {
      (globalThis as Record<string, unknown>).__capturedContextValue = props.value;
    }
    return { type: _type, props };
  };
  return { jsxDEV: interceptor };
});

vi.mock('react', () => ({
  createContext: (_defaultValue: unknown) => ({
    Provider: 'ContextProvider',
    Consumer: 'ContextConsumer',
    _currentValue: _defaultValue,
  }),
  useContext: () => {
    return (globalThis as Record<string, unknown>).__capturedContextValue ?? null;
  },
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

import { ConnectionProvider, useConnection, useNoteSubscription } from '../ConnectionContext';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetMockState() {
  MockWebSocket.instances = [];
  refMap = {};
  refCounter = 0;
  stateValues = {};
  stateCounter = 0;
  effectCallbacks = [];
  cleanupFns = [];
  setCapturedContextValue(null);
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

function mountProvider() {
  ConnectionProvider({ children: null as never });
  runEffects();
}

function getContextValue() {
  return getCapturedContextValue() as {
    status: string;
    subscribeToNote: (id: string) => void;
    unsubscribeFromNote: (id: string) => void;
  };
}

function getLatestWS(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ConnectionProvider', () => {
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
    it('starts with disconnected status', () => {
      ConnectionProvider({ children: null as never });

      expect(stateValues['state_0']).toBe('disconnected');
    });

    it('provides context value with expected shape', () => {
      ConnectionProvider({ children: null as never });

      const ctx = getContextValue();
      expect(ctx).toHaveProperty('status');
      expect(ctx).toHaveProperty('subscribeToNote');
      expect(ctx).toHaveProperty('unsubscribeFromNote');
    });
  });

  describe('connection lifecycle', () => {
    it('creates a WebSocket connection on mount', () => {
      mountProvider();

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('uses ws: protocol for http: pages', () => {
      mountProvider();

      expect(getLatestWS().url).toBe('ws://localhost:5175/ws');
    });

    it('uses wss: protocol for https: pages', () => {
      (globalThis.window as { location: { protocol: string; host: string } }).location = {
        protocol: 'https:',
        host: 'example.com',
      };

      mountProvider();

      expect(getLatestWS().url).toBe('wss://example.com/ws');
    });

    it('transitions to connecting when connect is called', () => {
      mountProvider();

      expect(stateValues['state_0']).toBe('connecting');
    });

    it('transitions to connected on open', () => {
      mountProvider();
      getLatestWS().simulateOpen();

      expect(stateValues['state_0']).toBe('connected');
    });

    it('transitions to disconnected on close', () => {
      mountProvider();
      const ws = getLatestWS();
      ws.simulateOpen();
      ws.simulateClose();

      expect(stateValues['state_0']).toBe('disconnected');
    });

    it('does not create a new connection if already open', () => {
      mountProvider();
      getLatestWS().simulateOpen();

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('resets failure count on successful connection', () => {
      mountProvider();
      const ws = getLatestWS();

      // Close to increment failure count
      ws.simulateOpen();
      ws.simulateClose();
      // failureCountRef is now 1

      // Reconnect — delay = 1000 * 1.5^1 = 1500ms
      vi.advanceTimersByTime(1500);
      const ws2 = getLatestWS();
      ws2.simulateOpen();
      // failureCountRef reset to 0 on successful open

      // Close again — delay should be 1000 * 1.5^1 = 1500ms (not higher)
      ws2.simulateClose();

      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1499);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);
    });
  });

  describe('exponential backoff reconnection', () => {
    it('reconnects after first close with delay of 1500ms', () => {
      mountProvider();
      const ws = getLatestWS();
      ws.simulateOpen();
      ws.simulateClose();

      expect(MockWebSocket.instances).toHaveLength(1);

      vi.advanceTimersByTime(1499);
      expect(MockWebSocket.instances).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('increases delay on successive failures', () => {
      mountProvider();

      // First close: failure count becomes 1, delay = 1000 * 1.5^1 = 1500ms
      getLatestWS().simulateClose();
      vi.advanceTimersByTime(1500);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Second close: failure count becomes 2, delay = 1000 * 1.5^2 = 2250ms
      getLatestWS().simulateClose();
      vi.advanceTimersByTime(2249);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);

      // Third close: failure count becomes 3, delay = 1000 * 1.5^3 = 3375ms
      getLatestWS().simulateClose();
      vi.advanceTimersByTime(3374);
      expect(MockWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(4);
    });

    it('caps delay at 30 seconds', () => {
      mountProvider();

      // Simulate many consecutive failures to exceed the 30s cap
      // 1.5^n > 30 when n >= 10 (1.5^10 ~ 57.7)
      for (let i = 0; i < 15; i++) {
        getLatestWS().simulateClose();
        vi.advanceTimersByTime(30000);
      }

      // All should have reconnected — cap means even large failure counts only wait 30s
      expect(MockWebSocket.instances).toHaveLength(16); // 1 initial + 15 reconnects
    });

    it('clears wsRef on close', () => {
      mountProvider();
      const ws = getLatestWS();
      ws.simulateOpen();
      ws.simulateClose();

      // ref 0 = wsRef
      expect(refMap[0].current).toBeNull();
    });

    it('sets status to connecting during reconnect', () => {
      mountProvider();
      getLatestWS().simulateClose();

      vi.advanceTimersByTime(1500);

      expect(stateValues['state_0']).toBe('connecting');
    });
  });

  describe('cleanup on unmount', () => {
    it('closes the WebSocket on unmount', () => {
      mountProvider();
      const ws = getLatestWS();
      ws.simulateOpen();

      runCleanups();

      expect(ws.close).toHaveBeenCalledTimes(1);
    });

    it('clears the reconnect timeout on unmount', () => {
      mountProvider();
      const ws = getLatestWS();
      ws.simulateOpen();
      ws.simulateClose();

      runCleanups();

      vi.advanceTimersByTime(30000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('message handling', () => {
    it('handles file:changed by invalidating note, highlights, and bookmarks queries', () => {
      mountProvider();
      getLatestWS().simulateOpen();

      getLatestWS().simulateMessage({
        type: 'file:changed',
        noteId: 'note-123',
        path: '/path/to/file.md',
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-123'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['highlights', 'note-123'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['bookmarks', 'note-123'] });
      expect(mockInvalidateQueries).toHaveBeenCalledTimes(3);
    });

    it('handles file:deleted by removing note cache and invalidating library', () => {
      mountProvider();
      getLatestWS().simulateOpen();

      getLatestWS().simulateMessage({
        type: 'file:deleted',
        noteId: 'note-456',
        path: '/path/to/deleted.md',
      });

      expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-456'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
    });

    it('handles library:updated by invalidating library query', () => {
      mountProvider();
      getLatestWS().simulateOpen();

      getLatestWS().simulateMessage({
        type: 'library:updated',
        action: 'added',
        noteId: 'note-789',
      });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['library'] });
      expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
    });

    it('does not crash on invalid JSON messages', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mountProvider();
      getLatestWS().simulateOpen();

      expect(() => {
        getLatestWS().simulateRawMessage('not valid json {{{');
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse WebSocket message:',
        expect.any(SyntaxError),
      );

      consoleSpy.mockRestore();
    });

    it('does not invalidate queries for unknown event types', () => {
      mountProvider();
      getLatestWS().simulateOpen();

      getLatestWS().simulateMessage({ type: 'unknown:event', data: 'foo' });

      expect(mockInvalidateQueries).not.toHaveBeenCalled();
      expect(mockRemoveQueries).not.toHaveBeenCalled();
    });

    it('handles multiple different events in sequence', () => {
      mountProvider();
      getLatestWS().simulateOpen();

      getLatestWS().simulateMessage({ type: 'file:changed', noteId: 'note-1', path: '/a.md' });
      getLatestWS().simulateMessage({ type: 'file:deleted', noteId: 'note-2', path: '/b.md' });
      getLatestWS().simulateMessage({ type: 'library:updated', action: 'added', noteId: 'note-3' });

      // file:changed invalidates 3 queries (note, highlights, bookmarks)
      // file:deleted invalidates 1 (library)
      // library:updated invalidates 1 (library)
      expect(mockInvalidateQueries).toHaveBeenCalledTimes(5);
      expect(mockRemoveQueries).toHaveBeenCalledTimes(1);
    });

    it('handles multiple file:changed events for different notes', () => {
      mountProvider();
      getLatestWS().simulateOpen();

      getLatestWS().simulateMessage({ type: 'file:changed', noteId: 'note-1', path: '/a.md' });
      getLatestWS().simulateMessage({ type: 'file:changed', noteId: 'note-2', path: '/b.md' });

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-1'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['note', 'note-2'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['highlights', 'note-1'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['highlights', 'note-2'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['bookmarks', 'note-1'] });
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['bookmarks', 'note-2'] });
    });
  });

  describe('error handling', () => {
    it('logs WebSocket errors to console', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mountProvider();

      getLatestWS().simulateError();

      expect(consoleSpy).toHaveBeenCalledWith(
        'WebSocket error:',
        expect.any(Event),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('send', () => {
    it('sends JSON messages when WebSocket is open', () => {
      mountProvider();
      const ws = getLatestWS();
      ws.simulateOpen();

      getContextValue().subscribeToNote('note-123');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-123' }),
      );
    });

    it('does not send when WebSocket is not open', () => {
      mountProvider();
      const ws = getLatestWS();
      // Don't call simulateOpen — readyState is CONNECTING

      getContextValue().subscribeToNote('note-123');

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('does not send when WebSocket is null (before mount)', () => {
      ConnectionProvider({ children: null as never });
      // Don't run effects, so wsRef is null

      expect(() => {
        getContextValue().subscribeToNote('note-123');
      }).not.toThrow();
    });
  });

  describe('subscribeToNote', () => {
    it('sends a subscribe:note message', () => {
      mountProvider();
      const ws = getLatestWS();
      ws.simulateOpen();

      getContextValue().subscribeToNote('note-abc');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe:note', noteId: 'note-abc' }),
      );
    });
  });

  describe('unsubscribeFromNote', () => {
    it('sends an unsubscribe:note message', () => {
      mountProvider();
      const ws = getLatestWS();
      ws.simulateOpen();

      getContextValue().unsubscribeFromNote('note-abc');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'unsubscribe:note', noteId: 'note-abc' }),
      );
    });
  });

  describe('reconnection after multiple closes', () => {
    it('reconnects successfully after the second close', () => {
      mountProvider();

      const ws1 = getLatestWS();
      ws1.simulateOpen();
      ws1.simulateClose();

      // First reconnect: delay = 1500ms
      vi.advanceTimersByTime(1500);
      expect(MockWebSocket.instances).toHaveLength(2);

      const ws2 = getLatestWS();
      ws2.simulateOpen();
      ws2.simulateClose();

      // Second reconnect: failure count reset on open, so delay = 1500ms again
      vi.advanceTimersByTime(1500);
      expect(MockWebSocket.instances).toHaveLength(3);
    });

    it('uses increasing delays for consecutive failures without successful connection', () => {
      mountProvider();

      // First close without ever opening: failure count 1, delay 1500ms
      getLatestWS().simulateClose();
      vi.advanceTimersByTime(1500);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Second close without opening: failure count 2, delay 2250ms
      getLatestWS().simulateClose();
      vi.advanceTimersByTime(2250);
      expect(MockWebSocket.instances).toHaveLength(3);
    });
  });
});

describe('useConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  it('returns context value when used within a provider', () => {
    // Simulate provider having set context value
    setCapturedContextValue({
      status: 'connected',
      subscribeToNote: vi.fn(),
      unsubscribeFromNote: vi.fn(),
    });

    const result = useConnection();

    expect(result).toHaveProperty('status', 'connected');
    expect(result).toHaveProperty('subscribeToNote');
    expect(result).toHaveProperty('unsubscribeFromNote');
  });

  it('throws when used outside a provider', () => {
    setCapturedContextValue(null);

    expect(() => useConnection()).toThrow(
      'useConnection must be used within a ConnectionProvider',
    );
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
    // Mount provider to establish WS and context
    mountProvider();

    const ws = getLatestWS();
    ws.simulateOpen();

    // Re-render provider with connected status to update context value
    stateCounter = 0;
    refCounter = 0;
    ConnectionProvider({ children: null as never });

    // Now call useNoteSubscription — useConnection will see capturedContextValue
    useNoteSubscription('note-abc');
    runEffects();

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'subscribe:note', noteId: 'note-abc' }),
    );
  });

  it('does not subscribe when noteId is undefined', () => {
    mountProvider();

    const ws = getLatestWS();
    ws.simulateOpen();

    stateCounter = 0;
    refCounter = 0;
    ConnectionProvider({ children: null as never });

    useNoteSubscription(undefined);
    runEffects();

    expect(ws.send).not.toHaveBeenCalled();
  });

  it('does not subscribe when status is not connected', () => {
    mountProvider();
    // Don't simulateOpen — status stays 'connecting'

    stateCounter = 0;
    refCounter = 0;
    ConnectionProvider({ children: null as never });

    useNoteSubscription('note-abc');
    runEffects();

    expect(getLatestWS().send).not.toHaveBeenCalled();
  });

  it('unsubscribes on cleanup', () => {
    mountProvider();

    const ws = getLatestWS();
    ws.simulateOpen();

    stateCounter = 0;
    refCounter = 0;
    ConnectionProvider({ children: null as never });

    useNoteSubscription('note-abc');
    runEffects();

    // Run the subscription cleanup (last registered cleanup)
    const subscriptionCleanup = cleanupFns.pop()!;
    subscriptionCleanup();

    const sendCalls = ws.send.mock.calls.map((c: [string]) => JSON.parse(c[0]));
    const unsubCall = sendCalls.find((c: { type: string }) => c.type === 'unsubscribe:note');
    expect(unsubCall).toEqual({ type: 'unsubscribe:note', noteId: 'note-abc' });
  });
});
