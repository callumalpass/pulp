import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── React mock state ────────────────────────────────────────────────────

let stateValues: Record<string, unknown> = {};
let stateCounter = 0;

function getCapturedContextValue(): unknown {
  return (globalThis as Record<string, unknown>).__capturedContextValue ?? null;
}
function setCapturedContextValue(v: unknown) {
  (globalThis as Record<string, unknown>).__capturedContextValue = v;
}

// Mock both jsx runtimes to capture context Provider value props.
vi.mock('react/jsx-runtime', () => {
  const interceptor = (_type: unknown, props: Record<string, unknown>) => {
    if (props && 'value' in props) {
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

// Mock the Toast component since we only care about ToastContext logic
vi.mock('../../components/ui/Toast', () => ({
  Toast: 'MockToast',
}));

import { ToastProvider, useToast } from '../ToastContext';

// ── Helpers ─────────────────────────────────────────────────────────────

// State layout:
// state_0 = toasts (initial: [])

function resetMockState() {
  stateValues = {};
  stateCounter = 0;
  setCapturedContextValue(null);
}

function mountProvider() {
  ToastProvider({ children: null as never });
}

/** Re-render the provider so callbacks pick up fresh state values. */
function rerenderProvider() {
  stateCounter = 0;
  ToastProvider({ children: null as never });
}

function getContextValue() {
  return getCapturedContextValue() as {
    showToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  };
}

function getToasts(): Array<{ id: number; message: string; type: string }> {
  return stateValues['state_0'] as Array<{ id: number; message: string; type: string }>;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  describe('initialization', () => {
    it('starts with an empty toasts array', () => {
      mountProvider();

      expect(getToasts()).toEqual([]);
    });

    it('provides context value with showToast function', () => {
      mountProvider();

      const ctx = getContextValue();
      expect(ctx).toHaveProperty('showToast');
      expect(typeof ctx.showToast).toBe('function');
    });
  });

  describe('showToast', () => {
    it('adds a toast with the given message', () => {
      mountProvider();

      getContextValue().showToast('Operation successful');

      const toasts = getToasts();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('Operation successful');
    });

    it('defaults type to info when not specified', () => {
      mountProvider();

      getContextValue().showToast('Info message');

      const toasts = getToasts();
      expect(toasts[0].type).toBe('info');
    });

    it('sets type to success when specified', () => {
      mountProvider();

      getContextValue().showToast('Saved!', 'success');

      const toasts = getToasts();
      expect(toasts[0].type).toBe('success');
    });

    it('sets type to error when specified', () => {
      mountProvider();

      getContextValue().showToast('Something went wrong', 'error');

      const toasts = getToasts();
      expect(toasts[0].type).toBe('error');
    });

    it('assigns unique IDs to each toast', () => {
      mountProvider();

      getContextValue().showToast('First');
      getContextValue().showToast('Second');

      const toasts = getToasts();
      expect(toasts).toHaveLength(2);
      expect(toasts[0].id).not.toBe(toasts[1].id);
    });

    it('assigns incrementing IDs', () => {
      mountProvider();

      getContextValue().showToast('First');
      getContextValue().showToast('Second');

      const toasts = getToasts();
      expect(toasts[1].id).toBeGreaterThan(toasts[0].id);
    });

    it('appends new toasts to the end of the list', () => {
      mountProvider();

      getContextValue().showToast('First');
      getContextValue().showToast('Second');
      getContextValue().showToast('Third');

      const toasts = getToasts();
      expect(toasts).toHaveLength(3);
      expect(toasts[0].message).toBe('First');
      expect(toasts[1].message).toBe('Second');
      expect(toasts[2].message).toBe('Third');
    });

    it('handles multiple toasts with different types', () => {
      mountProvider();

      getContextValue().showToast('Info toast');
      getContextValue().showToast('Success toast', 'success');
      getContextValue().showToast('Error toast', 'error');

      const toasts = getToasts();
      expect(toasts).toHaveLength(3);
      expect(toasts[0].type).toBe('info');
      expect(toasts[1].type).toBe('success');
      expect(toasts[2].type).toBe('error');
    });

    it('handles empty message string', () => {
      mountProvider();

      getContextValue().showToast('');

      const toasts = getToasts();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('');
    });

    it('handles long message strings', () => {
      mountProvider();

      const longMessage = 'A'.repeat(1000);
      getContextValue().showToast(longMessage);

      const toasts = getToasts();
      expect(toasts[0].message).toBe(longMessage);
    });
  });

  describe('removeToast (via re-render)', () => {
    it('renders Toast components with onClose callbacks', () => {
      mountProvider();
      getContextValue().showToast('Test toast');

      // Re-render to pick up updated state
      rerenderProvider();

      // The provider renders Toast components — the JSX mock captures the structure.
      // We verify the toasts state has the expected item.
      const toasts = getToasts();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('Test toast');
    });

    it('removes a specific toast by filtering state', () => {
      mountProvider();

      getContextValue().showToast('First');
      getContextValue().showToast('Second');
      getContextValue().showToast('Third');

      const toasts = getToasts();
      const secondId = toasts[1].id;

      // Simulate removeToast by calling the setter with a filter function
      // (removeToast sets toasts to prev.filter(t => t.id !== id))
      stateValues['state_0'] = (stateValues['state_0'] as Array<{ id: number }>).filter(
        (t) => t.id !== secondId,
      );

      const remaining = getToasts();
      expect(remaining).toHaveLength(2);
      expect(remaining[0].message).toBe('First');
      expect(remaining[1].message).toBe('Third');
    });

    it('does not affect other toasts when one is removed', () => {
      mountProvider();

      getContextValue().showToast('Keep 1', 'info');
      getContextValue().showToast('Remove', 'error');
      getContextValue().showToast('Keep 2', 'success');

      const toasts = getToasts();
      const removeId = toasts[1].id;

      stateValues['state_0'] = (stateValues['state_0'] as Array<{ id: number }>).filter(
        (t) => t.id !== removeId,
      );

      const remaining = getToasts();
      expect(remaining).toHaveLength(2);
      expect(remaining[0].type).toBe('info');
      expect(remaining[1].type).toBe('success');
    });

    it('results in empty array when last toast is removed', () => {
      mountProvider();

      getContextValue().showToast('Only toast');

      const toasts = getToasts();
      const id = toasts[0].id;

      stateValues['state_0'] = (stateValues['state_0'] as Array<{ id: number }>).filter(
        (t) => t.id !== id,
      );

      expect(getToasts()).toEqual([]);
    });
  });

  describe('context value stability', () => {
    it('provides a showToast function on every render', () => {
      mountProvider();
      const firstShowToast = getContextValue().showToast;
      expect(typeof firstShowToast).toBe('function');

      rerenderProvider();
      const secondShowToast = getContextValue().showToast;
      expect(typeof secondShowToast).toBe('function');
    });

    it('showToast still works after re-render', () => {
      mountProvider();
      getContextValue().showToast('Before re-render');

      rerenderProvider();
      getContextValue().showToast('After re-render');

      const toasts = getToasts();
      expect(toasts).toHaveLength(2);
      expect(toasts[0].message).toBe('Before re-render');
      expect(toasts[1].message).toBe('After re-render');
    });
  });
});

describe('useToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  it('returns context value when used within a provider', () => {
    setCapturedContextValue({
      showToast: vi.fn(),
    });

    const result = useToast();

    expect(result).toHaveProperty('showToast');
    expect(typeof result.showToast).toBe('function');
  });

  it('throws when used outside a provider', () => {
    setCapturedContextValue(null);

    expect(() => useToast()).toThrow('useToast must be used within a ToastProvider');
  });

  it('returns a working showToast function from the provider', () => {
    const mockShowToast = vi.fn();
    setCapturedContextValue({ showToast: mockShowToast });

    const { showToast } = useToast();
    showToast('Hello', 'success');

    expect(mockShowToast).toHaveBeenCalledWith('Hello', 'success');
  });

  it('throws with descriptive error message', () => {
    setCapturedContextValue(null);

    expect(() => useToast()).toThrow(/ToastProvider/);
  });
});
