import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Browser API mocks ───────────────────────────────────────────────────

const documentListeners: Record<string, EventListener[]> = {};
let mockActiveElement: unknown = null;

function addDocumentListener(event: string, handler: EventListener) {
  if (!documentListeners[event]) documentListeners[event] = [];
  documentListeners[event].push(handler);
}

function removeDocumentListener(event: string, handler: EventListener) {
  if (!documentListeners[event]) return;
  documentListeners[event] = documentListeners[event].filter((h) => h !== handler);
}

function fireDocumentEvent(event: string, eventObj: Partial<KeyboardEvent> = {}) {
  for (const handler of documentListeners[event] ?? []) {
    handler(eventObj as Event);
  }
}

Object.defineProperty(globalThis, 'document', {
  value: {
    addEventListener: vi.fn(addDocumentListener),
    removeEventListener: vi.fn(removeDocumentListener),
    get activeElement() {
      return mockActiveElement;
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

vi.mock('react', () => ({
  useCallback: (fn: Function, _deps: unknown[]) => fn,
  useRef: (initial: unknown) => {
    const idx = refCounter++;
    if (!refMap[idx]) {
      refMap[idx] = { current: initial };
    }
    return refMap[idx];
  },
  useEffect: (callback: () => void | CleanupFn, _deps: unknown[]) => {
    effectCallbacks.push({ callback, deps: _deps });
  },
}));

import { useFocusTrap } from '../useFocusTrap';

// ── Helpers ─────────────────────────────────────────────────────────────

function resetMockState() {
  refMap = {};
  refCounter = 0;
  effectCallbacks = [];
  cleanupFns = [];
  mockActiveElement = null;
  Object.keys(documentListeners).forEach((k) => delete documentListeners[k]);
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

/** Creates a mock HTMLElement with focusable children. */
function createMockContainer(focusableElements: { focus: ReturnType<typeof vi.fn> }[]) {
  return {
    querySelectorAll: vi.fn(() => focusableElements),
    contains: vi.fn((el: unknown) => focusableElements.includes(el as typeof focusableElements[0])),
  };
}

function createFocusableElement() {
  return { focus: vi.fn() };
}

function makeKeyEvent(overrides: Partial<KeyboardEvent> = {}): Partial<KeyboardEvent> {
  return {
    key: 'Tab',
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    resetMockState();
  });

  afterEach(() => {
    runCleanups();
    vi.useRealTimers();
  });

  describe('returned ref', () => {
    it('returns a ref object', () => {
      const ref = useFocusTrap(false);
      expect(ref).toHaveProperty('current');
    });

    it('initializes the ref to null', () => {
      const ref = useFocusTrap(false);
      expect(ref.current).toBeNull();
    });
  });

  describe('event listener registration', () => {
    it('registers a keydown listener when active', () => {
      useFocusTrap(true);
      runEffects();

      expect(documentListeners['keydown']?.length).toBe(1);
    });

    it('does not register a keydown listener when inactive', () => {
      useFocusTrap(false);
      runEffects();

      expect(documentListeners['keydown']?.length ?? 0).toBe(0);
    });

    it('removes the keydown listener on cleanup', () => {
      useFocusTrap(true);
      runEffects();

      expect(documentListeners['keydown']?.length).toBe(1);

      runCleanups();

      expect(documentListeners['keydown']?.length).toBe(0);
    });
  });

  describe('initial focus', () => {
    it('focuses the first focusable element when activated', () => {
      const el1 = createFocusableElement();
      const el2 = createFocusableElement();
      const container = createMockContainer([el1, el2]);

      useFocusTrap(true);
      // containerRef is refMap[0], previousActiveElement is refMap[1]
      refMap[0].current = container;

      runEffects();
      vi.runAllTimers();

      expect(el1.focus).toHaveBeenCalledTimes(1);
      expect(el2.focus).not.toHaveBeenCalled();
    });

    it('does not focus anything when container has no focusable elements', () => {
      const container = createMockContainer([]);

      useFocusTrap(true);
      refMap[0].current = container;

      runEffects();
      vi.runAllTimers();

      // No errors and no focus calls
      expect(container.querySelectorAll).toHaveBeenCalled();
    });

    it('does not focus anything when container ref is null', () => {
      useFocusTrap(true);
      // refMap[0].current is null by default

      // Should not throw
      runEffects();
      vi.runAllTimers();
    });

    it('uses setTimeout for initial focus to allow DOM to stabilize', () => {
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true);
      refMap[0].current = container;

      runEffects();

      // Before timer runs, focus should not have been called
      expect(el1.focus).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(el1.focus).toHaveBeenCalledTimes(1);
    });
  });

  describe('focus restoration on cleanup', () => {
    it('restores focus to the previously active element on cleanup', () => {
      const previousElement = createFocusableElement();
      mockActiveElement = previousElement;

      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true);
      refMap[0].current = container;

      runEffects();
      vi.runAllTimers();

      runCleanups();

      expect(previousElement.focus).toHaveBeenCalledTimes(1);
    });

    it('does not throw when there is no previous active element', () => {
      mockActiveElement = null;

      useFocusTrap(true);
      runEffects();

      // Should not throw
      runCleanups();
    });

    it('does not throw when previous active element has no focus method', () => {
      mockActiveElement = {}; // no focus method

      useFocusTrap(true);
      runEffects();

      // Should not throw - the hook checks for focus method existence
      runCleanups();
    });

    it('stores the active element at the time of activation', () => {
      const originalElement = createFocusableElement();
      mockActiveElement = originalElement;

      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      // Change active element after activation
      const newElement = createFocusableElement();
      mockActiveElement = newElement;

      runCleanups();

      // Should restore to the original element, not the new one
      expect(originalElement.focus).toHaveBeenCalledTimes(1);
      expect(newElement.focus).not.toHaveBeenCalled();
    });
  });

  describe('Escape key handling', () => {
    it('calls onEscape when Escape is pressed and callback is provided', () => {
      const onEscape = vi.fn();
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true, onEscape);
      refMap[0].current = container;
      runEffects();

      const event = makeKeyEvent({ key: 'Escape' });
      fireDocumentEvent('keydown', event);

      expect(onEscape).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('does not call onEscape when Escape is pressed but no callback is provided', () => {
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      const event = makeKeyEvent({ key: 'Escape' });
      fireDocumentEvent('keydown', event);

      // No callback, so preventDefault should not be called for Escape
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('prevents default on Escape to stop other handlers', () => {
      const onEscape = vi.fn();
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true, onEscape);
      refMap[0].current = container;
      runEffects();

      const event = makeKeyEvent({ key: 'Escape' });
      fireDocumentEvent('keydown', event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('Tab key focus cycling', () => {
    it('wraps focus from last element to first on Tab', () => {
      const el1 = createFocusableElement();
      const el2 = createFocusableElement();
      const el3 = createFocusableElement();
      const container = createMockContainer([el1, el2, el3]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      // Active element is the last one
      mockActiveElement = el3;

      const event = makeKeyEvent({ key: 'Tab', shiftKey: false });
      fireDocumentEvent('keydown', event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(el1.focus).toHaveBeenCalledTimes(1);
    });

    it('wraps focus from first element to last on Shift+Tab', () => {
      const el1 = createFocusableElement();
      const el2 = createFocusableElement();
      const el3 = createFocusableElement();
      const container = createMockContainer([el1, el2, el3]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      // Active element is the first one
      mockActiveElement = el1;

      const event = makeKeyEvent({ key: 'Tab', shiftKey: true });
      fireDocumentEvent('keydown', event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(el3.focus).toHaveBeenCalledTimes(1);
    });

    it('does not prevent default when Tab on a middle element', () => {
      const el1 = createFocusableElement();
      const el2 = createFocusableElement();
      const el3 = createFocusableElement();
      const container = createMockContainer([el1, el2, el3]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      // Active element is a middle one inside the container
      mockActiveElement = el2;

      const event = makeKeyEvent({ key: 'Tab', shiftKey: false });
      fireDocumentEvent('keydown', event);

      // el2 is inside the container, not the last element, so browser handles it
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('moves focus to first element when focus is outside the container', () => {
      const el1 = createFocusableElement();
      const el2 = createFocusableElement();
      const container = createMockContainer([el1, el2]);
      // Set contains to return false for the external element
      container.contains = vi.fn(() => false);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      // Active element is outside the container
      const outsideElement = createFocusableElement();
      mockActiveElement = outsideElement;

      const event = makeKeyEvent({ key: 'Tab' });
      fireDocumentEvent('keydown', event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(el1.focus).toHaveBeenCalledTimes(1);
    });

    it('handles a single focusable element (Tab wraps to itself)', () => {
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      // Active element is both first and last
      mockActiveElement = el1;

      const event = makeKeyEvent({ key: 'Tab', shiftKey: false });
      fireDocumentEvent('keydown', event);

      // Tab on last (only) element -> focus first (only) element
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(el1.focus).toHaveBeenCalledTimes(1);
    });

    it('handles a single focusable element (Shift+Tab wraps to itself)', () => {
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      mockActiveElement = el1;

      const event = makeKeyEvent({ key: 'Tab', shiftKey: true });
      fireDocumentEvent('keydown', event);

      // Shift+Tab on first (only) element -> focus last (only) element
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(el1.focus).toHaveBeenCalledTimes(1);
    });

    it('does nothing when there are no focusable elements', () => {
      const container = createMockContainer([]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      const event = makeKeyEvent({ key: 'Tab' });
      fireDocumentEvent('keydown', event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('inactive state', () => {
    it('ignores keydown events when not active', () => {
      const onEscape = vi.fn();
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      // Call with isActive = false
      useFocusTrap(false, onEscape);
      refMap[0].current = container;
      runEffects();

      // No listener registered, but test the handleKeyDown guard directly
      // Since isActive is false, the effect doesn't register a listener
      expect(documentListeners['keydown']?.length ?? 0).toBe(0);
    });

    it('ignores key events when container ref is null', () => {
      useFocusTrap(true);
      // containerRef stays null (refMap[0].current = null)
      runEffects();

      // Listener is registered, but handleKeyDown exits early
      const event = makeKeyEvent({ key: 'Tab' });
      fireDocumentEvent('keydown', event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('non-Tab/non-Escape keys', () => {
    it('ignores non-Tab and non-Escape keys', () => {
      const onEscape = vi.fn();
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true, onEscape);
      refMap[0].current = container;
      runEffects();

      const event = makeKeyEvent({ key: 'Enter' });
      fireDocumentEvent('keydown', event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(onEscape).not.toHaveBeenCalled();
    });

    it('ignores arrow keys', () => {
      const el1 = createFocusableElement();
      const container = createMockContainer([el1]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      const event = makeKeyEvent({ key: 'ArrowDown' });
      fireDocumentEvent('keydown', event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('FOCUSABLE_ELEMENTS selector', () => {
    it('queries the container with the correct focusable elements selector', () => {
      const container = createMockContainer([]);

      useFocusTrap(true);
      refMap[0].current = container;
      runEffects();

      // Trigger a Tab event so querySelectorAll is called via handleKeyDown
      fireDocumentEvent('keydown', makeKeyEvent({ key: 'Tab' }));

      const expectedSelector = [
        'button:not([disabled])',
        'input:not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        'a[href]',
      ].join(', ');

      expect(container.querySelectorAll).toHaveBeenCalledWith(expectedSelector);
    });
  });
});
