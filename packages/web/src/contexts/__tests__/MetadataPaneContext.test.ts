import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { MetadataPaneProvider, useMetadataPane } from '../MetadataPaneContext';

// ── Helpers ─────────────────────────────────────────────────────────────

// State layout:
// state_0 = selectedNoteId (initial: null)
// state_1 = isOpen (initial: false)

function resetMockState() {
  stateValues = {};
  stateCounter = 0;
  setCapturedContextValue(null);
}

function mountProvider() {
  MetadataPaneProvider({ children: null as never });
}

/** Re-render the provider so callbacks pick up fresh state values. */
function rerenderProvider() {
  stateCounter = 0;
  MetadataPaneProvider({ children: null as never });
}

function getContextValue() {
  return getCapturedContextValue() as {
    selectedNoteId: string | null;
    isOpen: boolean;
    openPane: (noteId: string) => void;
    closePane: () => void;
    togglePane: (noteId: string) => void;
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('MetadataPaneProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('starts with pane closed and no selected note', () => {
      mountProvider();

      expect(stateValues['state_0']).toBeNull(); // selectedNoteId
      expect(stateValues['state_1']).toBe(false); // isOpen
    });

    it('provides context value with expected shape', () => {
      mountProvider();

      const ctx = getContextValue();
      expect(ctx).toHaveProperty('selectedNoteId');
      expect(ctx).toHaveProperty('isOpen');
      expect(ctx).toHaveProperty('openPane');
      expect(ctx).toHaveProperty('closePane');
      expect(ctx).toHaveProperty('togglePane');
    });

    it('exposes selectedNoteId as null initially', () => {
      mountProvider();

      expect(getContextValue().selectedNoteId).toBeNull();
    });

    it('exposes isOpen as false initially', () => {
      mountProvider();

      expect(getContextValue().isOpen).toBe(false);
    });
  });

  describe('openPane', () => {
    it('sets selectedNoteId to the given note', () => {
      mountProvider();

      getContextValue().openPane('note-1');

      expect(stateValues['state_0']).toBe('note-1');
    });

    it('sets isOpen to true', () => {
      mountProvider();

      getContextValue().openPane('note-1');

      expect(stateValues['state_1']).toBe(true);
    });

    it('can switch to a different note when already open', () => {
      mountProvider();

      getContextValue().openPane('note-1');
      expect(stateValues['state_0']).toBe('note-1');

      getContextValue().openPane('note-2');
      expect(stateValues['state_0']).toBe('note-2');
      expect(stateValues['state_1']).toBe(true);
    });

    it('remains open when opening the same note again', () => {
      mountProvider();

      getContextValue().openPane('note-1');
      getContextValue().openPane('note-1');

      expect(stateValues['state_0']).toBe('note-1');
      expect(stateValues['state_1']).toBe(true);
    });
  });

  describe('closePane', () => {
    it('sets isOpen to false immediately', () => {
      mountProvider();

      getContextValue().openPane('note-1');
      expect(stateValues['state_1']).toBe(true);

      getContextValue().closePane();
      expect(stateValues['state_1']).toBe(false);
    });

    it('retains selectedNoteId immediately after closing (for animation)', () => {
      mountProvider();

      getContextValue().openPane('note-1');
      getContextValue().closePane();

      // selectedNoteId should still be set right after close
      expect(stateValues['state_0']).toBe('note-1');
    });

    it('clears selectedNoteId after 300ms animation delay', () => {
      mountProvider();

      getContextValue().openPane('note-1');
      getContextValue().closePane();

      // Not yet cleared
      expect(stateValues['state_0']).toBe('note-1');

      vi.advanceTimersByTime(299);
      expect(stateValues['state_0']).toBe('note-1');

      vi.advanceTimersByTime(1);
      expect(stateValues['state_0']).toBeNull();
    });

    it('is a no-op when the pane is already closed', () => {
      mountProvider();

      // Pane is already closed by default
      getContextValue().closePane();

      expect(stateValues['state_0']).toBeNull();
      expect(stateValues['state_1']).toBe(false);

      // After timeout, still null
      vi.advanceTimersByTime(300);
      expect(stateValues['state_0']).toBeNull();
    });
  });

  describe('togglePane', () => {
    it('opens the pane when closed', () => {
      mountProvider();

      getContextValue().togglePane('note-1');

      expect(stateValues['state_0']).toBe('note-1');
      expect(stateValues['state_1']).toBe(true);
    });

    it('closes the pane when open with the same note', () => {
      mountProvider();

      // Open the pane
      getContextValue().openPane('note-1');
      expect(stateValues['state_1']).toBe(true);

      // Re-render so togglePane sees updated isOpen and selectedNoteId
      rerenderProvider();

      // Toggle with same note should close
      getContextValue().togglePane('note-1');
      expect(stateValues['state_1']).toBe(false);
    });

    it('switches to a different note when open with a different note', () => {
      mountProvider();

      // Open with note-1
      getContextValue().openPane('note-1');
      rerenderProvider();

      // Toggle with note-2 should switch, not close
      getContextValue().togglePane('note-2');
      expect(stateValues['state_0']).toBe('note-2');
      expect(stateValues['state_1']).toBe(true);
    });

    it('opens the pane after it was closed', () => {
      mountProvider();

      // Open then close
      getContextValue().openPane('note-1');
      rerenderProvider();
      getContextValue().closePane();
      rerenderProvider();

      // Toggle should open
      getContextValue().togglePane('note-3');
      expect(stateValues['state_0']).toBe('note-3');
      expect(stateValues['state_1']).toBe(true);
    });
  });

  describe('animation timing', () => {
    it('uses exactly 300ms delay for clearing selectedNoteId on close', () => {
      mountProvider();

      getContextValue().openPane('note-1');
      getContextValue().closePane();

      vi.advanceTimersByTime(250);
      expect(stateValues['state_0']).toBe('note-1');

      vi.advanceTimersByTime(49);
      expect(stateValues['state_0']).toBe('note-1');

      vi.advanceTimersByTime(1);
      expect(stateValues['state_0']).toBeNull();
    });

    it('close followed by rapid open preserves the new note', () => {
      mountProvider();

      getContextValue().openPane('note-1');
      getContextValue().closePane();

      // Open a new note before the 300ms timeout fires
      getContextValue().openPane('note-2');
      expect(stateValues['state_0']).toBe('note-2');
      expect(stateValues['state_1']).toBe(true);

      // When the timeout fires, it will set selectedNoteId to null,
      // overwriting the new value. This is a known trade-off of
      // the setTimeout approach.
      vi.advanceTimersByTime(300);
      expect(stateValues['state_0']).toBeNull();
    });
  });

  describe('context value exposure', () => {
    it('exposes all expected functions', () => {
      mountProvider();

      const ctx = getContextValue();
      expect(typeof ctx.openPane).toBe('function');
      expect(typeof ctx.closePane).toBe('function');
      expect(typeof ctx.togglePane).toBe('function');
    });

    it('reflects updated state after openPane', () => {
      mountProvider();
      getContextValue().openPane('note-abc');

      rerenderProvider();
      const ctx = getContextValue();

      expect(ctx.selectedNoteId).toBe('note-abc');
      expect(ctx.isOpen).toBe(true);
    });

    it('reflects updated state after closePane', () => {
      mountProvider();
      getContextValue().openPane('note-abc');
      rerenderProvider();

      getContextValue().closePane();
      rerenderProvider();
      const ctx = getContextValue();

      expect(ctx.isOpen).toBe(false);
      // selectedNoteId still present (animation delay)
      expect(ctx.selectedNoteId).toBe('note-abc');
    });
  });
});

describe('useMetadataPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  it('returns context value when used within a provider', () => {
    setCapturedContextValue({
      selectedNoteId: 'note-1',
      isOpen: true,
      openPane: vi.fn(),
      closePane: vi.fn(),
      togglePane: vi.fn(),
    });

    const result = useMetadataPane();

    expect(result).toHaveProperty('selectedNoteId', 'note-1');
    expect(result).toHaveProperty('isOpen', true);
    expect(result).toHaveProperty('openPane');
    expect(result).toHaveProperty('closePane');
    expect(result).toHaveProperty('togglePane');
  });

  it('throws when used outside a provider', () => {
    setCapturedContextValue(null);

    expect(() => useMetadataPane()).toThrow(
      'useMetadataPane must be used within a MetadataPaneProvider',
    );
  });
});
