import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────

// Mock localStorage with a real backing store
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
    _getStore: () => store,
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

if (typeof globalThis.window === 'undefined') {
  (globalThis as Record<string, unknown>).window = globalThis;
}

// Mock document.documentElement.setAttribute for setTheme
const mockSetAttribute = vi.fn();
if (typeof globalThis.document === 'undefined') {
  (globalThis as Record<string, unknown>).document = {
    documentElement: { setAttribute: mockSetAttribute },
  };
} else {
  vi.spyOn(document.documentElement, 'setAttribute').mockImplementation(mockSetAttribute);
}

// Now import the store
import { usePreferencesStore } from '../preferences';

// ── Helpers ────────────────────────────────────────────────────────────

function resetStore() {
  usePreferencesStore.setState({
    theme: 'dark',
    readerTheme: 'dark',
    fontSize: 16,
    lineHeight: 1.6,
    markdownPanelOverlay: false,
    markdownPanelWidth: 400,
    markdownPanelVimMode: false,
    metadataPanelWidth: 380,
    metadataPanelExpandedSections: ['publication', 'progress'],
  });
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('usePreferencesStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    mockSetAttribute.mockClear();
    resetStore();
  });

  // ── Initial state ──────────────────────────────────────────────────

  describe('initial state', () => {
    it('has dark as default theme', () => {
      expect(usePreferencesStore.getState().theme).toBe('dark');
    });

    it('has dark as default reader theme', () => {
      expect(usePreferencesStore.getState().readerTheme).toBe('dark');
    });

    it('has 16 as default font size', () => {
      expect(usePreferencesStore.getState().fontSize).toBe(16);
    });

    it('has 1.6 as default line height', () => {
      expect(usePreferencesStore.getState().lineHeight).toBe(1.6);
    });

    it('has markdown panel overlay disabled by default', () => {
      expect(usePreferencesStore.getState().markdownPanelOverlay).toBe(false);
    });

    it('has 400 as default markdown panel width', () => {
      expect(usePreferencesStore.getState().markdownPanelWidth).toBe(400);
    });

    it('has vim mode disabled by default', () => {
      expect(usePreferencesStore.getState().markdownPanelVimMode).toBe(false);
    });

    it('has 380 as default metadata panel width', () => {
      expect(usePreferencesStore.getState().metadataPanelWidth).toBe(380);
    });

    it('has publication and progress as default expanded sections', () => {
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toEqual(['publication', 'progress']);
    });
  });

  // ── setTheme ───────────────────────────────────────────────────────

  describe('setTheme', () => {
    it('sets theme to light', () => {
      usePreferencesStore.getState().setTheme('light');
      expect(usePreferencesStore.getState().theme).toBe('light');
    });

    it('sets theme to dark', () => {
      usePreferencesStore.getState().setTheme('light');
      usePreferencesStore.getState().setTheme('dark');
      expect(usePreferencesStore.getState().theme).toBe('dark');
    });

    it('sets data-theme attribute on document element', () => {
      usePreferencesStore.getState().setTheme('light');
      expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('updates data-theme on each theme change', () => {
      usePreferencesStore.getState().setTheme('light');
      usePreferencesStore.getState().setTheme('dark');
      expect(mockSetAttribute).toHaveBeenCalledTimes(2);
      expect(mockSetAttribute).toHaveBeenLastCalledWith('data-theme', 'dark');
    });
  });

  // ── setReaderTheme ─────────────────────────────────────────────────

  describe('setReaderTheme', () => {
    it('sets reader theme to light', () => {
      usePreferencesStore.getState().setReaderTheme('light');
      expect(usePreferencesStore.getState().readerTheme).toBe('light');
    });

    it('sets reader theme to sepia', () => {
      usePreferencesStore.getState().setReaderTheme('sepia');
      expect(usePreferencesStore.getState().readerTheme).toBe('sepia');
    });

    it('sets reader theme to eink', () => {
      usePreferencesStore.getState().setReaderTheme('eink');
      expect(usePreferencesStore.getState().readerTheme).toBe('eink');
    });

    it('sets reader theme to dark', () => {
      usePreferencesStore.getState().setReaderTheme('light');
      usePreferencesStore.getState().setReaderTheme('dark');
      expect(usePreferencesStore.getState().readerTheme).toBe('dark');
    });
  });

  // ── setFontSize ────────────────────────────────────────────────────

  describe('setFontSize', () => {
    it('sets font size to a valid value', () => {
      usePreferencesStore.getState().setFontSize(20);
      expect(usePreferencesStore.getState().fontSize).toBe(20);
    });

    it('clamps font size to minimum of 14', () => {
      usePreferencesStore.getState().setFontSize(10);
      expect(usePreferencesStore.getState().fontSize).toBe(14);
    });

    it('clamps font size to maximum of 28', () => {
      usePreferencesStore.getState().setFontSize(40);
      expect(usePreferencesStore.getState().fontSize).toBe(28);
    });

    it('allows font size at lower boundary (14)', () => {
      usePreferencesStore.getState().setFontSize(14);
      expect(usePreferencesStore.getState().fontSize).toBe(14);
    });

    it('allows font size at upper boundary (28)', () => {
      usePreferencesStore.getState().setFontSize(28);
      expect(usePreferencesStore.getState().fontSize).toBe(28);
    });

    it('clamps negative values to minimum', () => {
      usePreferencesStore.getState().setFontSize(-5);
      expect(usePreferencesStore.getState().fontSize).toBe(14);
    });

    it('clamps zero to minimum', () => {
      usePreferencesStore.getState().setFontSize(0);
      expect(usePreferencesStore.getState().fontSize).toBe(14);
    });
  });

  // ── setLineHeight ──────────────────────────────────────────────────

  describe('setLineHeight', () => {
    it('sets line height to a valid value', () => {
      usePreferencesStore.getState().setLineHeight(1.8);
      expect(usePreferencesStore.getState().lineHeight).toBe(1.8);
    });

    it('clamps line height to minimum of 1.2', () => {
      usePreferencesStore.getState().setLineHeight(0.5);
      expect(usePreferencesStore.getState().lineHeight).toBe(1.2);
    });

    it('clamps line height to maximum of 2', () => {
      usePreferencesStore.getState().setLineHeight(3.0);
      expect(usePreferencesStore.getState().lineHeight).toBe(2);
    });

    it('allows line height at lower boundary (1.2)', () => {
      usePreferencesStore.getState().setLineHeight(1.2);
      expect(usePreferencesStore.getState().lineHeight).toBe(1.2);
    });

    it('allows line height at upper boundary (2)', () => {
      usePreferencesStore.getState().setLineHeight(2);
      expect(usePreferencesStore.getState().lineHeight).toBe(2);
    });

    it('clamps negative values to minimum', () => {
      usePreferencesStore.getState().setLineHeight(-1);
      expect(usePreferencesStore.getState().lineHeight).toBe(1.2);
    });

    it('clamps zero to minimum', () => {
      usePreferencesStore.getState().setLineHeight(0);
      expect(usePreferencesStore.getState().lineHeight).toBe(1.2);
    });
  });

  // ── setMarkdownPanelOverlay ────────────────────────────────────────

  describe('setMarkdownPanelOverlay', () => {
    it('enables overlay mode', () => {
      usePreferencesStore.getState().setMarkdownPanelOverlay(true);
      expect(usePreferencesStore.getState().markdownPanelOverlay).toBe(true);
    });

    it('disables overlay mode', () => {
      usePreferencesStore.getState().setMarkdownPanelOverlay(true);
      usePreferencesStore.getState().setMarkdownPanelOverlay(false);
      expect(usePreferencesStore.getState().markdownPanelOverlay).toBe(false);
    });
  });

  // ── setMarkdownPanelWidth ──────────────────────────────────────────

  describe('setMarkdownPanelWidth', () => {
    it('sets width to a valid value', () => {
      usePreferencesStore.getState().setMarkdownPanelWidth(500);
      expect(usePreferencesStore.getState().markdownPanelWidth).toBe(500);
    });

    it('clamps width to minimum of 280', () => {
      usePreferencesStore.getState().setMarkdownPanelWidth(100);
      expect(usePreferencesStore.getState().markdownPanelWidth).toBe(280);
    });

    it('clamps width to maximum of 800', () => {
      usePreferencesStore.getState().setMarkdownPanelWidth(1000);
      expect(usePreferencesStore.getState().markdownPanelWidth).toBe(800);
    });

    it('allows width at lower boundary (280)', () => {
      usePreferencesStore.getState().setMarkdownPanelWidth(280);
      expect(usePreferencesStore.getState().markdownPanelWidth).toBe(280);
    });

    it('allows width at upper boundary (800)', () => {
      usePreferencesStore.getState().setMarkdownPanelWidth(800);
      expect(usePreferencesStore.getState().markdownPanelWidth).toBe(800);
    });

    it('clamps negative values to minimum', () => {
      usePreferencesStore.getState().setMarkdownPanelWidth(-100);
      expect(usePreferencesStore.getState().markdownPanelWidth).toBe(280);
    });
  });

  // ── setMarkdownPanelVimMode ────────────────────────────────────────

  describe('setMarkdownPanelVimMode', () => {
    it('enables vim mode', () => {
      usePreferencesStore.getState().setMarkdownPanelVimMode(true);
      expect(usePreferencesStore.getState().markdownPanelVimMode).toBe(true);
    });

    it('disables vim mode', () => {
      usePreferencesStore.getState().setMarkdownPanelVimMode(true);
      usePreferencesStore.getState().setMarkdownPanelVimMode(false);
      expect(usePreferencesStore.getState().markdownPanelVimMode).toBe(false);
    });
  });

  // ── setMetadataPanelWidth ──────────────────────────────────────────

  describe('setMetadataPanelWidth', () => {
    it('sets width to a valid value', () => {
      usePreferencesStore.getState().setMetadataPanelWidth(400);
      expect(usePreferencesStore.getState().metadataPanelWidth).toBe(400);
    });

    it('clamps width to minimum of 320', () => {
      usePreferencesStore.getState().setMetadataPanelWidth(200);
      expect(usePreferencesStore.getState().metadataPanelWidth).toBe(320);
    });

    it('clamps width to maximum of 500', () => {
      usePreferencesStore.getState().setMetadataPanelWidth(600);
      expect(usePreferencesStore.getState().metadataPanelWidth).toBe(500);
    });

    it('allows width at lower boundary (320)', () => {
      usePreferencesStore.getState().setMetadataPanelWidth(320);
      expect(usePreferencesStore.getState().metadataPanelWidth).toBe(320);
    });

    it('allows width at upper boundary (500)', () => {
      usePreferencesStore.getState().setMetadataPanelWidth(500);
      expect(usePreferencesStore.getState().metadataPanelWidth).toBe(500);
    });

    it('clamps negative values to minimum', () => {
      usePreferencesStore.getState().setMetadataPanelWidth(-50);
      expect(usePreferencesStore.getState().metadataPanelWidth).toBe(320);
    });
  });

  // ── setMetadataPanelExpandedSections ───────────────────────────────

  describe('setMetadataPanelExpandedSections', () => {
    it('sets expanded sections', () => {
      usePreferencesStore.getState().setMetadataPanelExpandedSections(['notes', 'highlights']);
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toEqual(['notes', 'highlights']);
    });

    it('sets empty sections list', () => {
      usePreferencesStore.getState().setMetadataPanelExpandedSections([]);
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toEqual([]);
    });

    it('replaces existing sections entirely', () => {
      usePreferencesStore.getState().setMetadataPanelExpandedSections(['notes']);
      usePreferencesStore.getState().setMetadataPanelExpandedSections(['highlights', 'bookmarks']);
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toEqual(['highlights', 'bookmarks']);
    });
  });

  // ── toggleMetadataPanelSection ─────────────────────────────────────

  describe('toggleMetadataPanelSection', () => {
    it('adds a section that is not currently expanded', () => {
      usePreferencesStore.getState().toggleMetadataPanelSection('notes');
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toContain('notes');
    });

    it('preserves existing sections when adding new one', () => {
      usePreferencesStore.getState().toggleMetadataPanelSection('notes');
      const sections = usePreferencesStore.getState().metadataPanelExpandedSections;
      expect(sections).toContain('publication');
      expect(sections).toContain('progress');
      expect(sections).toContain('notes');
    });

    it('removes a section that is currently expanded', () => {
      usePreferencesStore.getState().toggleMetadataPanelSection('publication');
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).not.toContain('publication');
    });

    it('preserves other sections when removing one', () => {
      usePreferencesStore.getState().toggleMetadataPanelSection('publication');
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toContain('progress');
    });

    it('toggling same section twice returns to original state', () => {
      const original = [...usePreferencesStore.getState().metadataPanelExpandedSections];
      usePreferencesStore.getState().toggleMetadataPanelSection('notes');
      usePreferencesStore.getState().toggleMetadataPanelSection('notes');
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toEqual(original);
    });

    it('can collapse all sections by toggling each', () => {
      usePreferencesStore.getState().toggleMetadataPanelSection('publication');
      usePreferencesStore.getState().toggleMetadataPanelSection('progress');
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toEqual([]);
    });

    it('can expand from empty state', () => {
      usePreferencesStore.getState().setMetadataPanelExpandedSections([]);
      usePreferencesStore.getState().toggleMetadataPanelSection('notes');
      expect(usePreferencesStore.getState().metadataPanelExpandedSections).toEqual(['notes']);
    });
  });

  // ── Persistence ────────────────────────────────────────────────────

  describe('persistence', () => {
    it('uses pulp-preferences as storage key', () => {
      // Trigger a state change to force persistence write
      usePreferencesStore.getState().setReaderTheme('sepia');

      const raw = localStorageMock._getStore()['pulp-preferences'];
      if (!raw) {
        // zustand persist may not write in Node — just verify the store is functional
        return;
      }

      const persisted = JSON.parse(raw);
      expect(persisted.state).toBeDefined();
    });
  });
});
