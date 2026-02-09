import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Browser API mocks ───────────────────────────────────────────────────

const windowListeners: Record<string, EventListener[]> = {};
const documentListeners: Record<string, EventListener[]> = {};

function addWindowListener(event: string, handler: EventListener) {
  if (!windowListeners[event]) windowListeners[event] = [];
  windowListeners[event].push(handler);
}

function removeWindowListener(event: string, handler: EventListener) {
  if (!windowListeners[event]) return;
  windowListeners[event] = windowListeners[event].filter((h) => h !== handler);
}

function addDocumentListener(event: string, handler: EventListener, _options?: AddEventListenerOptions) {
  if (!documentListeners[event]) documentListeners[event] = [];
  documentListeners[event].push(handler);
}

function removeDocumentListener(event: string, handler: EventListener) {
  if (!documentListeners[event]) return;
  documentListeners[event] = documentListeners[event].filter((h) => h !== handler);
}

function fireWindowEvent(event: string, eventObj: Partial<Event> = {}) {
  for (const handler of windowListeners[event] ?? []) {
    handler(eventObj as Event);
  }
}

function fireDocumentEvent(event: string, eventObj: Partial<Event> = {}) {
  for (const handler of documentListeners[event] ?? []) {
    handler(eventObj as Event);
  }
}

// Stub DOM element classes needed by instanceof checks in the source
class StubHTMLInputElement {}
class StubHTMLTextAreaElement {}

Object.defineProperty(globalThis, 'HTMLInputElement', {
  value: StubHTMLInputElement,
  writable: true,
});
Object.defineProperty(globalThis, 'HTMLTextAreaElement', {
  value: StubHTMLTextAreaElement,
  writable: true,
});

// Set up global mocks
Object.defineProperty(globalThis, 'window', {
  value: {
    addEventListener: vi.fn(addWindowListener),
    removeEventListener: vi.fn(removeWindowListener),
  },
  writable: true,
});

Object.defineProperty(globalThis, 'document', {
  value: {
    addEventListener: vi.fn(addDocumentListener),
    removeEventListener: vi.fn(removeDocumentListener),
    visibilityState: 'visible',
  },
  writable: true,
});

// ── React mocks ─────────────────────────────────────────────────────────

type CleanupFn = () => void;
let effectCallbacks: Array<{ callback: () => void | CleanupFn; deps: unknown[] }> = [];
let cleanupFns: CleanupFn[] = [];
let refMap: Record<number, { current: unknown }> = {};
let refCounter = 0;

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
}));

import { useBeforeUnload, useSaveShortcut } from '../useBeforeUnload';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetMockState() {
  refMap = {};
  refCounter = 0;
  effectCallbacks = [];
  cleanupFns = [];
  Object.keys(windowListeners).forEach((k) => delete windowListeners[k]);
  Object.keys(documentListeners).forEach((k) => delete documentListeners[k]);
  (globalThis.document as { visibilityState: string }).visibilityState = 'visible';
}

/**
 * Runs all pending useEffect callbacks and collects cleanup functions.
 */
function runEffects() {
  for (const { callback } of effectCallbacks) {
    const cleanup = callback();
    if (typeof cleanup === 'function') {
      cleanupFns.push(cleanup);
    }
  }
  effectCallbacks = [];
}

/**
 * Runs all collected cleanup functions (simulates unmount).
 */
function runCleanups() {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useBeforeUnload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  afterEach(() => {
    runCleanups();
  });

  describe('event listener registration', () => {
    it('registers beforeunload, visibilitychange, and pagehide listeners on mount', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      expect(windowListeners['beforeunload']?.length).toBe(1);
      expect(documentListeners['visibilitychange']?.length).toBe(1);
      expect(windowListeners['pagehide']?.length).toBe(1);
    });

    it('removes all listeners on cleanup', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      expect(windowListeners['beforeunload']?.length).toBe(1);
      expect(documentListeners['visibilitychange']?.length).toBe(1);
      expect(windowListeners['pagehide']?.length).toBe(1);

      runCleanups();

      expect(windowListeners['beforeunload']?.length).toBe(0);
      expect(documentListeners['visibilitychange']?.length).toBe(0);
      expect(windowListeners['pagehide']?.length).toBe(0);
    });
  });

  describe('beforeunload event', () => {
    it('calls onBeforeUnload when beforeunload fires', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      fireWindowEvent('beforeunload', { preventDefault: vi.fn() });

      expect(onBeforeUnload).toHaveBeenCalledTimes(1);
    });

    it('calls preventDefault when there are unsaved changes', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => true);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      const preventDefault = vi.fn();
      const event: Partial<BeforeUnloadEvent> = {
        preventDefault,
        returnValue: '',
      };

      fireWindowEvent('beforeunload', event);

      expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('sets returnValue on the event when there are unsaved changes', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => true);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      const event: Record<string, unknown> = {
        preventDefault: vi.fn(),
        returnValue: '',
      };

      fireWindowEvent('beforeunload', event);

      expect(event.returnValue).toBe(
        'You have unsaved changes. Are you sure you want to leave?'
      );
    });

    it('uses custom message when provided', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => true);

      useBeforeUnload({
        onBeforeUnload,
        hasUnsavedChanges,
        message: 'Custom message',
      });
      runEffects();

      const event: Record<string, unknown> = {
        preventDefault: vi.fn(),
        returnValue: '',
      };

      fireWindowEvent('beforeunload', event);

      expect(event.returnValue).toBe('Custom message');
    });

    it('does not call preventDefault when there are no unsaved changes', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      const preventDefault = vi.fn();
      fireWindowEvent('beforeunload', { preventDefault });

      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('always calls onBeforeUnload regardless of unsaved changes state', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      fireWindowEvent('beforeunload', { preventDefault: vi.fn() });

      expect(onBeforeUnload).toHaveBeenCalledTimes(1);
      expect(hasUnsavedChanges).toHaveBeenCalledTimes(1);
    });
  });

  describe('visibilitychange event', () => {
    it('calls onBeforeUnload when page becomes hidden', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      (globalThis.document as { visibilityState: string }).visibilityState = 'hidden';
      fireDocumentEvent('visibilitychange');

      expect(onBeforeUnload).toHaveBeenCalledTimes(1);
    });

    it('does not call onBeforeUnload when page becomes visible', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      (globalThis.document as { visibilityState: string }).visibilityState = 'visible';
      fireDocumentEvent('visibilitychange');

      expect(onBeforeUnload).not.toHaveBeenCalled();
    });
  });

  describe('pagehide event', () => {
    it('calls onBeforeUnload on pagehide', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      fireWindowEvent('pagehide', { persisted: false } as Partial<PageTransitionEvent>);

      expect(onBeforeUnload).toHaveBeenCalledTimes(1);
    });

    it('calls onBeforeUnload twice when page is being persisted in bfcache', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      fireWindowEvent('pagehide', { persisted: true } as Partial<PageTransitionEvent>);

      // Called once for the general pagehide, and once more for bfcache persist
      expect(onBeforeUnload).toHaveBeenCalledTimes(2);
    });

    it('calls onBeforeUnload only once when page is not persisted', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      fireWindowEvent('pagehide', { persisted: false } as Partial<PageTransitionEvent>);

      expect(onBeforeUnload).toHaveBeenCalledTimes(1);
    });
  });

  describe('ref updates (stale closure prevention)', () => {
    it('uses the latest onBeforeUnload callback via ref', () => {
      const onBeforeUnload1 = vi.fn();
      const onBeforeUnload2 = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      // First render
      useBeforeUnload({ onBeforeUnload: onBeforeUnload1, hasUnsavedChanges });
      runEffects();

      // Simulate re-render with new callback by updating the ref
      // The useEffect that updates refs runs on each render
      // Since we mock useRef by index, ref 0 = onBeforeUnloadRef, ref 1 = hasUnsavedChangesRef
      refMap[0].current = onBeforeUnload2;

      fireWindowEvent('beforeunload', { preventDefault: vi.fn() });

      expect(onBeforeUnload1).not.toHaveBeenCalled();
      expect(onBeforeUnload2).toHaveBeenCalledTimes(1);
    });

    it('uses the latest hasUnsavedChanges callback via ref', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges1 = vi.fn(() => false);
      const hasUnsavedChanges2 = vi.fn(() => true);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges: hasUnsavedChanges1 });
      runEffects();

      // Update the ref to simulate re-render
      refMap[1].current = hasUnsavedChanges2;

      const preventDefault = vi.fn();
      fireWindowEvent('beforeunload', { preventDefault, returnValue: false });

      expect(hasUnsavedChanges1).not.toHaveBeenCalled();
      expect(hasUnsavedChanges2).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple events in sequence', () => {
    it('handles all three event types independently', () => {
      const onBeforeUnload = vi.fn();
      const hasUnsavedChanges = vi.fn(() => false);

      useBeforeUnload({ onBeforeUnload, hasUnsavedChanges });
      runEffects();

      // Fire each event type
      fireWindowEvent('beforeunload', { preventDefault: vi.fn() });
      expect(onBeforeUnload).toHaveBeenCalledTimes(1);

      (globalThis.document as { visibilityState: string }).visibilityState = 'hidden';
      fireDocumentEvent('visibilitychange');
      expect(onBeforeUnload).toHaveBeenCalledTimes(2);

      fireWindowEvent('pagehide', { persisted: false } as Partial<PageTransitionEvent>);
      expect(onBeforeUnload).toHaveBeenCalledTimes(3);
    });
  });
});

describe('useSaveShortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockState();
  });

  afterEach(() => {
    runCleanups();
  });

  describe('event listener registration', () => {
    it('registers a keydown listener on mount', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      expect(windowListeners['keydown']?.length).toBe(1);
    });

    it('removes the keydown listener on cleanup', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      expect(windowListeners['keydown']?.length).toBe(1);

      runCleanups();

      expect(windowListeners['keydown']?.length).toBe(0);
    });
  });

  describe('Ctrl+S / Cmd+S handling', () => {
    it('calls onSave on Ctrl+S', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      const preventDefault = vi.fn();
      fireWindowEvent('keydown', {
        ctrlKey: true,
        metaKey: false,
        key: 's',
        target: {},
        preventDefault,
      } as unknown as Event);

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('calls onSave on Cmd+S (metaKey)', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      const preventDefault = vi.fn();
      fireWindowEvent('keydown', {
        ctrlKey: false,
        metaKey: true,
        key: 's',
        target: {},
        preventDefault,
      } as unknown as Event);

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('prevents default browser save dialog', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      const preventDefault = vi.fn();
      fireWindowEvent('keydown', {
        ctrlKey: true,
        metaKey: false,
        key: 's',
        target: {},
        preventDefault,
      } as unknown as Event);

      expect(preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('ignored key combinations', () => {
    it('does not trigger on plain S key without modifier', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      fireWindowEvent('keydown', {
        ctrlKey: false,
        metaKey: false,
        key: 's',
        target: {},
        preventDefault: vi.fn(),
      } as unknown as Event);

      expect(onSave).not.toHaveBeenCalled();
    });

    it('does not trigger on Ctrl+other key', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      fireWindowEvent('keydown', {
        ctrlKey: true,
        metaKey: false,
        key: 'a',
        target: {},
        preventDefault: vi.fn(),
      } as unknown as Event);

      expect(onSave).not.toHaveBeenCalled();
    });

    it('does not trigger on Ctrl+S uppercase', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      fireWindowEvent('keydown', {
        ctrlKey: true,
        metaKey: false,
        key: 'S',
        target: {},
        preventDefault: vi.fn(),
      } as unknown as Event);

      // The hook checks for lowercase 's' specifically
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('input field exclusion', () => {
    it('does not trigger when focused on an input element', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      // Create an instance of our stub so instanceof check passes
      const inputTarget = new StubHTMLInputElement();

      fireWindowEvent('keydown', {
        ctrlKey: true,
        metaKey: false,
        key: 's',
        target: inputTarget,
        preventDefault: vi.fn(),
      } as unknown as Event);

      expect(onSave).not.toHaveBeenCalled();
    });

    it('does not trigger when focused on a textarea element', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      // Create an instance of our stub so instanceof check passes
      const textareaTarget = new StubHTMLTextAreaElement();

      fireWindowEvent('keydown', {
        ctrlKey: true,
        metaKey: false,
        key: 's',
        target: textareaTarget,
        preventDefault: vi.fn(),
      } as unknown as Event);

      expect(onSave).not.toHaveBeenCalled();
    });

    it('triggers when focused on a non-input element', () => {
      const onSave = vi.fn();

      useSaveShortcut(onSave);
      runEffects();

      fireWindowEvent('keydown', {
        ctrlKey: true,
        metaKey: false,
        key: 's',
        target: {}, // A generic non-input target
        preventDefault: vi.fn(),
      } as unknown as Event);

      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });
});
