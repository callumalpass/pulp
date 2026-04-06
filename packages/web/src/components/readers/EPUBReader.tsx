import { lazy, Suspense, useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Book, Rendition, Contents, NavItem } from 'epubjs';
import type { LiteratureNote, EPUBHighlight, HighlightCategory } from '@pulp/shared';
import { HIGHLIGHT_CATEGORIES } from '@pulp/shared';
import { useReaderStore } from '../../stores/reader';
import { usePreferencesStore } from '../../stores/preferences';
import { useReadingStatsStore } from '../../stores/readingStats';
import { useProgress } from '../../hooks/useProgress';
import { useEpubNavigation } from '../../hooks/useEpubNavigation';
import { useEpubPosition } from '../../hooks/useEpubPosition';
import { useEpubSelection } from '../../hooks/useEpubSelection';
import { useHighlights } from '../../hooks/useNote';
import { useCreateHighlight } from '../../hooks/useHighlights';
import { useToast } from '../../contexts/ToastContext';
import { useMobile } from '../../hooks/useMobile';
import { useIdleDetection } from '../../hooks/useIdleDetection';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { useBeforeUnload, useSaveShortcut } from '../../hooks/useBeforeUnload';
import {
  createEpubLocationsCacheKey,
  DEFAULT_EPUB_TOTAL_PAGES_ESTIMATE,
  EPUB_LOCATION_GENERATION_BREAKPOINT,
  getCfiFromProgress,
  loadCachedEpubLocations,
  saveCachedEpubLocations,
} from '../../lib/epub-location';
import { HighlightPopup } from './shared/HighlightPopup';
import { HighlightEditPopup } from './shared/HighlightEditPopup';
import { KeyboardShortcutsPanel } from './shared/KeyboardShortcutsPanel';
import { BookmarksPanel } from './shared/BookmarksPanel';
import { HighlightsPanel } from './shared/HighlightsPanel';
import { ReadingTimeIndicator } from './shared/ReadingTimeIndicator';
import { SaveIndicator } from './shared/SaveIndicator';
import { api } from '../../lib/api';
import { Link } from 'react-router-dom';

const ReadingStatsPanel = lazy(() =>
  import('./shared/ReadingStatsPanel').then((m) => ({ default: m.ReadingStatsPanel }))
);
const ReadingGoalsPanel = lazy(() =>
  import('./shared/ReadingGoalsPanel').then((m) => ({ default: m.ReadingGoalsPanel }))
);

interface EPUBReaderProps {
  note: LiteratureNote;
  initialCfi?: string;
}

type EPUBTheme = 'light' | 'dark' | 'sepia' | 'eink';

const THEME_STYLES: Record<EPUBTheme, { bg: string; text: string; link: string }> = {
  light: { bg: '#ffffff', text: '#2d3436', link: '#0984e3' },
  dark: { bg: '#1a1a2e', text: '#e4e4e7', link: '#60a5fa' },
  sepia: { bg: '#f4ecd8', text: '#5c4b37', link: '#8b5a2b' },
  eink: { bg: '#ffffff', text: '#000000', link: '#000000' },
};
const TOUCH_LONG_PRESS_MS = 350;
const TOUCH_MOVE_CANCEL_PX = 8;

export function EPUBReader({ note, initialCfi }: EPUBReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const pendingNavigationTargetRef = useRef<string | null>(null);

  const {
    currentPage,
    totalPages,
    isLoading,
    shortcutsOpen,
    bookmarksOpen,
    statsOpen,
    goalsOpen,
    setCurrentPage,
    setTotalPages,
    setIsLoading,
    setShortcutsOpen,
    toggleShortcuts,
    setBookmarksOpen,
    toggleBookmarks,
    highlightsOpen,
    setHighlightsOpen,
    toggleHighlights,
    setStatsOpen,
    toggleStats,
    setGoalsOpen,
    toggleGoals,
    reset,
  } = useReaderStore();

  // Reading statistics tracking
  const {
    startSession,
    updateCurrentPage: updateStatsCurrentPage,
    endSession,
    pauseSession,
    resumeSession,
    setBookStats,
  } = useReadingStatsStore();

  // Populate stats cache from note data
  useEffect(() => {
    if (note.readingStats) {
      setBookStats(note.id, note.readingStats);
    }
  }, [note.id, note.readingStats, setBookStats]);

  const { readerTheme, fontSize, lineHeight, setFontSize, setLineHeight, setReaderTheme } = usePreferencesStore();
  const { updateProgress, saveImmediately, hasPendingChanges, saveStatus } = useProgress(note.id);
  const { data: highlights } = useHighlights(note.id);
  const createHighlight = useCreateHighlight(note.id);
  const { showToast } = useToast();

  // Save progress before the tab is closed or navigated away
  useBeforeUnload({
    onBeforeUnload: saveImmediately,
    hasUnsavedChanges: hasPendingChanges,
  });

  // Ctrl+S / Cmd+S to save immediately
  useSaveShortcut(saveImmediately);

  const [editingHighlight, setEditingHighlight] = useState<{ highlight: EPUBHighlight; position: { x: number; y: number } } | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClickZones, setShowClickZones] = useState(true);
  const [headerVisible, setHeaderVisible] = useState(true);

  const isMobile = useMobile();
  const touchSelectionEnabledRef = useRef(!isMobile);
  const touchLongPressTimerRef = useRef<number | null>(null);
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const registeredContentsRef = useRef<Set<Contents>>(new Set());
  const theme = (readerTheme || 'dark') as EPUBTheme;
  const { currentPosition, handleRelocated } = useEpubPosition({
    note,
    setCurrentPage,
    updateProgress,
  });
  const { selection, setSelection, clearSelection, handleSelected } = useEpubSelection({
    isMobile,
    currentPage,
    touchSelectionEnabledRef,
  });
  const { goToPage, goToChapter } = useEpubNavigation({
    locations,
    totalPages,
    renditionRef,
    pendingNavigationTargetRef,
    setTocOpen,
    showToast,
  });
  const currentChapter = currentPosition.chapter || '';
  const currentCfi = currentPosition.cfi;

  const clearTouchLongPressTimer = useCallback(() => {
    if (touchLongPressTimerRef.current !== null) {
      window.clearTimeout(touchLongPressTimerRef.current);
      touchLongPressTimerRef.current = null;
    }
  }, []);

  const setTouchSelectionEnabled = useCallback((enabled: boolean) => {
    const shouldEnable = !isMobile || enabled;
    touchSelectionEnabledRef.current = shouldEnable;

    for (const contents of registeredContentsRef.current) {
      const body = contents.document?.body;
      if (!body) continue;

      const selectionValue = shouldEnable ? 'text' : 'none';
      body.style.setProperty('user-select', selectionValue);
      body.style.setProperty('-webkit-user-select', selectionValue);
      body.style.setProperty('-webkit-touch-callout', shouldEnable ? 'default' : 'none');
    }
  }, [isMobile]);

  const registerTouchSelectionHandlers = useCallback((contents: Contents) => {
    if (registeredContentsRef.current.has(contents)) {
      setTouchSelectionEnabled(touchSelectionEnabledRef.current);
      return;
    }

    registeredContentsRef.current.add(contents);
    setTouchSelectionEnabled(touchSelectionEnabledRef.current);

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      const touch = event.touches[0];
      touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };

      clearTouchLongPressTimer();
      touchLongPressTimerRef.current = window.setTimeout(() => {
        setTouchSelectionEnabled(true);
      }, TOUCH_LONG_PRESS_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!touchStartPointRef.current || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const movedX = Math.abs(touch.clientX - touchStartPointRef.current.x);
      const movedY = Math.abs(touch.clientY - touchStartPointRef.current.y);
      if (movedX > TOUCH_MOVE_CANCEL_PX || movedY > TOUCH_MOVE_CANCEL_PX) {
        clearTouchLongPressTimer();
      }
    };

    const finishTouch = () => {
      clearTouchLongPressTimer();
      touchStartPointRef.current = null;

      window.setTimeout(() => {
        const sel = contents.window.getSelection();
        if (!sel || sel.isCollapsed) {
          setTouchSelectionEnabled(false);
        }
      }, 80);
    };

    if (isMobile) {
      contents.document.addEventListener('touchstart', onTouchStart, { passive: true });
      contents.document.addEventListener('touchmove', onTouchMove, { passive: true });
      contents.document.addEventListener('touchend', finishTouch, { passive: true });
      contents.document.addEventListener('touchcancel', finishTouch, { passive: true });
    }

    const cleanup = () => {
      if (isMobile) {
        contents.document.removeEventListener('touchstart', onTouchStart);
        contents.document.removeEventListener('touchmove', onTouchMove);
        contents.document.removeEventListener('touchend', finishTouch);
        contents.document.removeEventListener('touchcancel', finishTouch);
      }
      registeredContentsRef.current.delete(contents);
    };

    contents.window.addEventListener('pagehide', cleanup, { once: true });
    contents.window.addEventListener('unload', cleanup, { once: true });
  }, [clearTouchLongPressTimer, isMobile, setTouchSelectionEnabled]);

  // Mobile swipe navigation
  const { handleTouchStart, handleTouchEnd } = useSwipeGesture({
    onSwipeLeft: () => renditionRef.current?.next(),
    onSwipeRight: () => renditionRef.current?.prev(),
    enabled: isMobile,
    threshold: 50,
  });

  // Idle detection for reading stats (the hook sets up activity listeners)
  // isIdlePaused is shown in the ReadingStatsPanel when open
  useIdleDetection();

  useEffect(() => {
    setTouchSelectionEnabled(!isMobile);
  }, [isMobile, setTouchSelectionEnabled]);

  useEffect(() => {
    if (!isMobile || selection) return;

    const resetSelectionModeTimer = window.setTimeout(() => {
      const hasSelection = Array.from(registeredContentsRef.current).some((contents) => {
        const sel = contents.window.getSelection();
        return !!sel && !sel.isCollapsed;
      });
      if (!hasSelection) {
        setTouchSelectionEnabled(false);
      }
    }, 100);

    return () => {
      window.clearTimeout(resetSelectionModeTimer);
    };
  }, [isMobile, selection, setTouchSelectionEnabled]);

  // Load EPUB
  useEffect(() => {
    reset();
    setError(null);

    const timeoutId = requestAnimationFrame(() => {
      loadEPUB();
    });

    return () => {
      cancelAnimationFrame(timeoutId);
      saveImmediately();
      endSession(); // End reading session when leaving
      clearTouchLongPressTimer();
      touchStartPointRef.current = null;
      registeredContentsRef.current.clear();
      pendingNavigationTargetRef.current = null;
      renditionRef.current?.destroy();
      bookRef.current?.destroy();
    };
  }, [note.id, initialCfi, clearTouchLongPressTimer]);

  // Track page changes for reading stats
  useEffect(() => {
    if (!isLoading && totalPages > 0) {
      updateStatsCurrentPage(currentPage);
    }
  }, [currentPage, isLoading, totalPages, updateStatsCurrentPage]);

  // Pause/resume session on visibility change (tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pauseSession();
      } else {
        resumeSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [pauseSession, resumeSession]);

  // Auto-hide click zone hints after initial display
  useEffect(() => {
    if (!isLoading && showClickZones) {
      const timer = setTimeout(() => {
        setShowClickZones(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isLoading, showClickZones]);

  const loadEPUB = async () => {
    if (!containerRef.current) {
      setError('Container not available');
      return;
    }

    try {
      setIsLoading(true);

      const rect = containerRef.current.getBoundingClientRect();
      const width = rect.width || containerRef.current.offsetWidth || 800;
      const height = rect.height || containerRef.current.offsetHeight || 600;

      const response = await fetch(api.files.getUrl(note.id));
      if (!response.ok) {
        throw new Error(`Failed to fetch EPUB: ${response.status}`);
      }
      const epubData = await response.arrayBuffer();

      const book = ePub(epubData);
      bookRef.current = book;

      const rendition = book.renderTo(containerRef.current, {
        width,
        height,
        spread: 'none',
        flow: 'paginated',
      });
      renditionRef.current = rendition;
      rendition.hooks.content.register((contents: Contents) => {
        registerTouchSelectionHandlers(contents);
      });

      // Apply initial styles
      applyTheme(rendition, theme);
      applyStyles(rendition);

      await book.ready;

      // Get TOC
      const navigation = await book.loaded.navigation;
      setToc(navigation.toc);

      // Try to load cached locations first
      const cacheKey = createEpubLocationsCacheKey({
        noteId: note.id,
        sourceRelative: note.sourceRelative,
        fontSize,
        lineHeight,
        width,
        height,
      });
      const cachedLocations = loadCachedEpubLocations(cacheKey);
      let generatedLocations: string[] = [];

      if (cachedLocations.length > 0) {
        try {
          generatedLocations = cachedLocations;
          // epub.js load() expects the serialized string, not parsed array
          book.locations.load(JSON.stringify(cachedLocations));
          setLocations(generatedLocations);
          setTotalPages(generatedLocations.length);
        } catch {
          // Cache invalid, will regenerate
        }
      }

      // Event handlers
      rendition.on('relocated', (location: { start: { cfi: string; location: number; href: string } }) => {
        handleRelocated(location, book, navigation.toc, () => {
          if (pendingNavigationTargetRef.current) {
            pendingNavigationTargetRef.current = null;
          }
        });
      });

      const restoreFromSavedPosition = async () => {
        if (initialCfi) {
          try {
            await rendition.display(initialCfi);
            return;
          } catch (error) {
            console.warn('Failed to open EPUB from requested CFI, falling back to saved position', error);
          }
        }

        if (note.lastOpenedCfi) {
          try {
            await rendition.display(note.lastOpenedCfi);
            return;
          } catch (error) {
            console.warn('Failed to restore EPUB from saved CFI, falling back to progress', error);
          }
        }

        if (note.progress > 0) {
          if (generatedLocations.length === 0) {
            try {
              generatedLocations = await book.locations.generate(EPUB_LOCATION_GENERATION_BREAKPOINT);
              setLocations(generatedLocations);
              setTotalPages(generatedLocations.length);
              saveCachedEpubLocations(cacheKey, generatedLocations);
            } catch (error) {
              console.warn('Failed to generate EPUB locations for restore fallback', error);
            }
          }

          const fallbackCfi = getCfiFromProgress(book.locations, generatedLocations, note.progress);
          if (fallbackCfi) {
            try {
              await rendition.display(fallbackCfi);
              return;
            } catch (error) {
              console.warn('Failed to restore EPUB from progress fallback', error);
            }
          }
        }

        await rendition.display();
      };

      // Display content immediately (don't wait for locations)
      await restoreFromSavedPosition();

      // Hide loading spinner - content is visible now
      setIsLoading(false);

      // Start reading session after EPUB is loaded
      // Use location count if available, otherwise estimate from initial display
      const startPage = note.progress > 0 && generatedLocations.length > 0
        ? Math.floor((note.progress / 100) * generatedLocations.length) + 1
        : 1;
      const totalPagesEstimate = generatedLocations.length || DEFAULT_EPUB_TOTAL_PAGES_ESTIMATE;
      startSession(note.id, startPage, totalPagesEstimate);

      // Generate locations in background if not cached
      if (cachedLocations.length === 0 || generatedLocations.length === 0) {
        // Use requestIdleCallback for non-blocking generation
        const generateLocations = async () => {
          const newLocations = await book.locations.generate(EPUB_LOCATION_GENERATION_BREAKPOINT);
          setLocations(newLocations);
          setTotalPages(newLocations.length);
          saveCachedEpubLocations(cacheKey, newLocations);
        };

        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => generateLocations());
        } else {
          setTimeout(generateLocations, 100);
        }
      }

      rendition.on('selected', handleSelected);

      // Click to navigate (left/right thirds) or toggle UI (center)
      rendition.on('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'A') return; // Don't navigate on links

        // Don't navigate if there's a text selection
        const sel = (e.view as Window)?.getSelection();
        if (sel && !sel.isCollapsed) {
          if (isMobile && !touchSelectionEnabledRef.current) {
            sel.removeAllRanges();
          } else {
            return;
          }
        }

        // Use screen coordinates for reliable cross-iframe calculation
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        // Convert container bounds to screen coordinates
        const containerScreenLeft = containerRect.left + window.screenX + (window.outerWidth - window.innerWidth);
        const containerWidth = containerRect.width;
        const third = containerWidth / 3;

        // e.screenX is the click position in screen coordinates
        const relativeX = e.screenX - containerScreenLeft;

        if (relativeX < third) {
          rendition.prev();
        } else if (relativeX > containerWidth - third) {
          rendition.next();
        } else {
          // Center tap toggles header visibility
          setHeaderVisible(prev => {
            if (!prev) setShowClickZones(true);
            return !prev;
          });
        }
      });

      addHighlightsToRendition(rendition, highlights?.filter(h => h.type === 'epub') as EPUBHighlight[] || []);

    } catch (err) {
      console.error('Failed to load EPUB:', err);
      setError(err instanceof Error ? err.message : 'Failed to load EPUB');
      setIsLoading(false);
    }
  };

  // Resize handler
  useEffect(() => {
    if (!containerRef.current || !renditionRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry && renditionRef.current) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          renditionRef.current.resize(width, height);
          if (pendingNavigationTargetRef.current) {
            renditionRef.current.display(pendingNavigationTargetRef.current);
          }
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [totalPages]);

  // Apply highlights when they change
  useEffect(() => {
    if (renditionRef.current && highlights) {
      addHighlightsToRendition(
        renditionRef.current,
        highlights.filter(h => h.type === 'epub') as EPUBHighlight[]
      );
    }
  }, [highlights]);

  // Update theme
  useEffect(() => {
    if (renditionRef.current) {
      applyTheme(renditionRef.current, theme);
    }
  }, [theme]);

  // Update styles
  useEffect(() => {
    if (renditionRef.current) {
      applyStyles(renditionRef.current);
    }
  }, [fontSize, lineHeight]);

  const applyTheme = (rendition: Rendition, themeName: EPUBTheme) => {
    const colors = THEME_STYLES[themeName];
    rendition.themes.default({
      body: {
        background: `${colors.bg} !important`,
        color: `${colors.text} !important`,
      },
      'a, a:link, a:visited': {
        color: `${colors.link} !important`,
      },
      'p, div, span, h1, h2, h3, h4, h5, h6, li': {
        color: `${colors.text} !important`,
      },
    });
  };

  const applyStyles = (rendition: Rendition) => {
    rendition.themes.fontSize(`${fontSize}px`);
    rendition.themes.override('line-height', String(lineHeight));
    rendition.themes.override('font-family', 'Georgia, "Times New Roman", serif');
    rendition.themes.override('text-align', 'justify');
    rendition.themes.override('hyphens', 'auto');
  };

  const addHighlightsToRendition = (rendition: Rendition, epubHighlights: EPUBHighlight[]) => {
    try {
      (rendition.annotations as unknown as { remove?: (type: string) => void })?.remove?.('highlight');
    } catch {}

    epubHighlights.forEach((highlight) => {
      try {
        // Get category-based color
        const category: HighlightCategory = highlight.category || 'highlight';
        const categoryInfo = HIGHLIGHT_CATEGORIES[category];
        const fillColor = categoryInfo.color;

        (rendition.annotations.highlight as (
          cfiRange: string,
          data?: object,
          cb?: (e: MouseEvent) => void,
          className?: string,
          styles?: object
        ) => void)(
          highlight.cfi,
          { highlightId: highlight.id, category },
          (e: MouseEvent) => {
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!containerRect) return;

            setEditingHighlight({
              highlight,
              position: {
                x: e.clientX - containerRect.left,
                y: e.clientY - containerRect.top + 10,
              },
            });
          },
          `pulp-highlight pulp-highlight-${category}`,
          { fill: fillColor, cursor: 'pointer' }
        );
      } catch {}
    });
  };

  // Quick highlight with category (for keyboard shortcuts)
  const quickHighlight = useCallback(async (category: HighlightCategory = 'highlight') => {
    if (!selection) return;

    try {
      await createHighlight.mutateAsync({
        type: 'epub',
        cfi: selection.cfi,
        text: selection.text,
        category,
      });
      clearSelection();
      showToast('Highlight saved', 'success');
    } catch (error) {
      console.error('Failed to create highlight:', error);
      showToast('Failed to create highlight', 'error');
    }
  }, [selection, createHighlight, clearSelection, showToast]);

  // Navigate to a highlight and flash it
  const navigateToHighlight = useCallback((_page?: number, cfi?: string, _highlightId?: string) => {
    if (cfi && renditionRef.current) {
      renditionRef.current.display(cfi);
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if typing in an input or contenteditable (CodeMirror)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.closest('.cm-editor'))) {
        return;
      }

      // Keyboard shortcuts help: ?
      if (e.key === '?') {
        e.preventDefault();
        toggleShortcuts();
        return;
      }

      // Close shortcuts panel on Escape (if open)
      if (e.key === 'Escape' && shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }

      // Close bookmarks panel on Escape (if open)
      if (e.key === 'Escape' && bookmarksOpen) {
        setBookmarksOpen(false);
        return;
      }

      // Close highlights panel on Escape (if open)
      if (e.key === 'Escape' && highlightsOpen) {
        setHighlightsOpen(false);
        return;
      }

      // Bookmarks: B
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        toggleBookmarks();
        return;
      }

      // Statistics: S
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        toggleStats();
        return;
      }

      // Close stats panel on Escape (if open)
      if (e.key === 'Escape' && statsOpen) {
        setStatsOpen(false);
        return;
      }

      // Goals: R (for "Reading goals")
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggleGoals();
        return;
      }

      // Close goals panel on Escape (if open)
      if (e.key === 'Escape' && goalsOpen) {
        setGoalsOpen(false);
        return;
      }

      // Highlights panel: A
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        toggleHighlights();
        return;
      }

      // Quick highlight shortcuts (when text is selected)
      if (selection) {
        // 1-5 - Quick highlight with specific category
        const categoryKeys: Record<string, HighlightCategory> = {
          '1': 'highlight',
          '2': 'important',
          '3': 'question',
          '4': 'todo',
          '5': 'definition',
        };
        if (categoryKeys[e.key]) {
          e.preventDefault();
          quickHighlight(categoryKeys[e.key]);
          return;
        }
      }

      // Table of contents: T
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setTocOpen(!tocOpen);
        setSettingsOpen(false);
        return;
      }

      // Toggle dark mode: D
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const themes: EPUBTheme[] = ['light', 'dark', 'sepia', 'eink'];
        const currentIndex = themes.indexOf(theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        setReaderTheme(themes[nextIndex]);
        return;
      }

      // Font size: + / -
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setFontSize(Math.min(28, fontSize + 2));
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        setFontSize(Math.max(14, fontSize - 2));
        return;
      }

      // Toggle header/UI visibility: H
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setHeaderVisible(prev => {
          if (!prev) setShowClickZones(true);
          return !prev;
        });
        return;
      }

      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        renditionRef.current?.next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        renditionRef.current?.prev();
      } else if (e.key === 'Escape') {
        setTocOpen(false);
        setSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcutsOpen, bookmarksOpen, highlightsOpen, statsOpen, goalsOpen, tocOpen, theme, fontSize, toggleShortcuts, setShortcutsOpen, toggleBookmarks, setBookmarksOpen, toggleHighlights, setHighlightsOpen, toggleStats, setStatsOpen, toggleGoals, setGoalsOpen, setReaderTheme, setFontSize, selection, quickHighlight]);

  const progress = currentPosition.progressPercent;
  const colors = THEME_STYLES[theme];

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8" role="alert" aria-live="assertive">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-text-primary mb-2" role="heading" aria-level={1}>
            Failed to load EPUB
          </h2>
          <p className="text-text-secondary mb-4">
            {error}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                // Re-initialize EPUB - need to remount the effect
                window.location.reload();
              }}
              className="px-4 py-2 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/90 transition-colors"
            >
              Try Again
            </button>
            <Link
              to="/"
              className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary rounded"
            >
              Go Back to Library
            </Link>
          </div>
          <p className="text-xs text-text-secondary mt-4">
            If this problem persists, the EPUB file may be corrupted or inaccessible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ background: colors.bg }}
      role="application"
      aria-label={`EPUB Reader: ${note.title}`}
    >
      {/* Header */}
      <header
        className={`h-12 flex items-center px-4 gap-3 border-b border-current/10 transition-opacity duration-200 ${
          headerVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ color: colors.text }}
        role="toolbar"
        aria-label="Reader controls"
        aria-hidden={!headerVisible}
      >
        <Link
          to="/"
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-current/10 transition-colors focus:outline-none focus:ring-2 focus:ring-current/50"
          aria-label="Back to library"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>

        {/* TOC button */}
        {toc.length > 0 && (
          <button
            onClick={() => { setTocOpen(!tocOpen); setSettingsOpen(false); }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${tocOpen ? 'bg-current/20' : 'hover:bg-current/10'}`}
            aria-label="Table of Contents"
            aria-expanded={tocOpen}
            aria-controls="epub-toc-panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </button>
        )}

        {/* Chapter title */}
        <div className="flex-1 text-sm truncate opacity-70" aria-live="polite" aria-atomic="true">
          {currentChapter || note.title}
        </div>

        {/* Page indicator */}
        <nav className="flex items-center gap-2 text-sm" aria-label="Page navigation">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-current/10 disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-current/50"
            aria-label="Previous page"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="min-w-[4rem] text-center tabular-nums" aria-live="polite" aria-atomic="true">
            <span className="sr-only">Page </span>{currentPage}<span className="sr-only"> of </span><span aria-hidden="true"> / </span>{totalPages > 0 ? totalPages : '...'}
          </span>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-current/10 disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-current/50"
            aria-label="Next page"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </nav>

        {/* Save indicator */}
        <SaveIndicator status={saveStatus} />

        {/* Reading time indicator */}
        <ReadingTimeIndicator
          noteId={note.id}
          currentPage={currentPage}
          totalPages={totalPages}
          onClick={() => { toggleStats(); setTocOpen(false); setSettingsOpen(false); }}
        />

        {/* Stats button */}
        <button
          onClick={() => { toggleStats(); setTocOpen(false); setSettingsOpen(false); }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${statsOpen ? 'bg-current/20' : 'hover:bg-current/10'}`}
          aria-label="Reading statistics (S)"
          aria-expanded={statsOpen}
          aria-controls="reading-stats-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
        </button>

        {/* Goals button */}
        <button
          onClick={() => { toggleGoals(); setTocOpen(false); setSettingsOpen(false); }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${goalsOpen ? 'bg-current/20' : 'hover:bg-current/10'}`}
          aria-label="Reading goals (R)"
          aria-expanded={goalsOpen}
          aria-controls="reading-goals-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        </button>

        {/* Bookmarks button */}
        <button
          onClick={() => { toggleBookmarks(); setTocOpen(false); setSettingsOpen(false); }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${bookmarksOpen ? 'bg-current/20' : 'hover:bg-current/10'}`}
          aria-label="Bookmarks (B)"
          aria-expanded={bookmarksOpen}
          aria-controls="bookmarks-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
          </svg>
        </button>

        {/* Highlights button */}
        <button
          onClick={() => { toggleHighlights(); setTocOpen(false); setSettingsOpen(false); }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${highlightsOpen ? 'bg-current/20' : 'hover:bg-current/10'}`}
          aria-label="Highlights (A)"
          aria-expanded={highlightsOpen}
          aria-controls="highlights-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </button>

        {/* Settings button */}
        <button
          onClick={() => { setSettingsOpen(!settingsOpen); setTocOpen(false); }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${settingsOpen ? 'bg-current/20' : 'hover:bg-current/10'}`}
          aria-label="Reading settings"
          aria-expanded={settingsOpen}
          aria-controls="epub-settings-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        {/* Help button */}
        <button
          onClick={toggleShortcuts}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${shortcutsOpen ? 'bg-current/20' : 'hover:bg-current/10'}`}
          aria-label="Keyboard shortcuts (?)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </header>

      {/* Progress bar */}
      <div
        className={`h-1 bg-current/10 transition-opacity duration-200 ${
          headerVisible ? 'opacity-100' : 'opacity-0'
        }`}
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Reading progress: ${Math.round(progress)}%`}
        aria-hidden={!headerVisible}
      >
        <div
          className="h-full bg-current/40 transition-[width] duration-300 will-change-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Bookmarks Panel */}
        {bookmarksOpen && (
          <BookmarksPanel
            noteId={note.id}
            currentCfi={currentCfi || undefined}
            onNavigate={(_, cfi) => cfi && renditionRef.current?.display(cfi)}
            onClose={() => setBookmarksOpen(false)}
          />
        )}

        {/* Highlights Panel */}
        {highlightsOpen && (
          <HighlightsPanel
            noteId={note.id}
            highlights={highlights || []}
            onNavigate={navigateToHighlight}
            onClose={() => setHighlightsOpen(false)}
          />
        )}

        {/* Reading Statistics Panel */}
        {statsOpen && (
          <Suspense fallback={<div className="w-80 bg-bg-surface border-l border-text-secondary/10" />}>
            <ReadingStatsPanel
              noteId={note.id}
              currentPage={currentPage}
              totalPages={totalPages}
              dateFinished={note.dateFinished}
              onClose={() => setStatsOpen(false)}
            />
          </Suspense>
        )}

        {/* Reading Goals Panel */}
        {goalsOpen && (
          <Suspense fallback={<div className="w-80 bg-bg-surface border-l border-text-secondary/10" />}>
            <ReadingGoalsPanel onClose={() => setGoalsOpen(false)} />
          </Suspense>
        )}

        {/* TOC Sidebar */}
        {tocOpen && (
          <aside
            id="epub-toc-panel"
            className="w-72 border-r border-current/10 overflow-y-auto flex-shrink-0"
            style={{ color: colors.text }}
            role="navigation"
            aria-label="Table of contents"
          >
            <div className="p-4">
              <h2 className="font-semibold mb-3">Contents</h2>
              <TOCList items={toc} onSelect={goToChapter} currentChapter={currentChapter} />
            </div>
          </aside>
        )}

        {/* EPUB container */}
        <div
          className="flex-1 overflow-hidden relative"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ background: colors.bg }}
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: colors.bg }} role="status" aria-label="Loading EPUB">
              <div className="w-8 h-8 border-2 border-current/30 border-t-current rounded-full animate-spin" aria-hidden="true" />
              <span className="sr-only">Loading EPUB content...</span>
            </div>
          )}

          {/* Click zones indicator (shown briefly on load) */}
          {!isLoading && (
            <div
              className={`absolute inset-0 pointer-events-none flex transition-opacity duration-1000 ${
                showClickZones ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ color: colors.text }}
              aria-hidden="true"
            >
              {/* Left zone - previous page */}
              <div className="w-1/3 h-full flex items-center justify-center bg-current/5">
                <div className="flex flex-col items-center gap-2 opacity-60">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  <span className="text-xs font-medium">Previous</span>
                </div>
              </div>
              {/* Center zone - toggle UI */}
              <div className="w-1/3 h-full flex items-center justify-center border-x border-dashed border-current/20">
                <div className="flex flex-col items-center gap-2 opacity-60">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18" />
                  </svg>
                  <span className="text-xs font-medium">Toggle UI</span>
                </div>
              </div>
              {/* Right zone - next page */}
              <div className="w-1/3 h-full flex items-center justify-center bg-current/5">
                <div className="flex flex-col items-center gap-2 opacity-60">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  <span className="text-xs font-medium">Next</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Settings panel */}
        {settingsOpen && (
          <aside
            id="epub-settings-panel"
            className="w-72 border-l border-current/10 overflow-y-auto flex-shrink-0 p-4"
            style={{ color: colors.text }}
            role="region"
            aria-label="Reading settings"
          >
            <h2 className="font-semibold mb-4">Reading Settings</h2>

            {/* Theme */}
            <fieldset className="mb-6">
              <legend className="text-sm opacity-70 block mb-2">Theme</legend>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Reader theme">
                {(['light', 'dark', 'sepia', 'eink'] as EPUBTheme[]).map((t) => {
                  const label = t === 'eink' ? 'E-ink' : t.charAt(0).toUpperCase() + t.slice(1);
                  return (
                    <button
                      key={t}
                      onClick={() => setReaderTheme(t)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${
                        theme === t ? 'border-current' : 'border-transparent hover:border-current/30'
                      }`}
                      role="radio"
                      aria-checked={theme === t}
                      aria-label={`${label} theme`}
                    >
                      <span
                        className="w-8 h-8 rounded-md border border-current/20 flex items-center justify-center text-xs font-medium"
                        style={{ background: THEME_STYLES[t].bg, color: THEME_STYLES[t].text }}
                        aria-hidden="true"
                      >
                        Aa
                      </span>
                      <span className="text-[10px] opacity-70" aria-hidden="true">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Font size */}
            <div className="mb-6">
              <label htmlFor="epub-font-size" className="text-sm opacity-70 block mb-2">
                Font Size: {fontSize}px
              </label>
              <input
                id="epub-font-size"
                type="range"
                min="14"
                max="28"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-current"
                aria-valuemin={14}
                aria-valuemax={28}
                aria-valuenow={fontSize}
              />
              <div className="flex justify-between text-xs opacity-50 mt-1" aria-hidden="true">
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>

            {/* Line height */}
            <div className="mb-6">
              <label htmlFor="epub-line-height" className="text-sm opacity-70 block mb-2">
                Line Height: {lineHeight.toFixed(1)}
              </label>
              <input
                id="epub-line-height"
                type="range"
                min="1.2"
                max="2.0"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
                className="w-full accent-current"
                aria-valuemin={1.2}
                aria-valuemax={2.0}
                aria-valuenow={lineHeight}
              />
              <div className="flex justify-between text-xs opacity-50 mt-1" aria-hidden="true">
                <span>Tight</span>
                <span>Loose</span>
              </div>
            </div>

            {/* Keyboard shortcuts */}
            <section className="text-xs opacity-50 space-y-1" aria-labelledby="epub-shortcuts-heading">
              <h3 id="epub-shortcuts-heading" className="font-medium mb-2 opacity-100">Keyboard Shortcuts</h3>
              <dl>
                <div><dt className="inline">← / →</dt>: <dd className="inline">Previous / Next page</dd></div>
                <div><dt className="inline">Space</dt>: <dd className="inline">Next page</dd></div>
                <div><dt className="inline">Escape</dt>: <dd className="inline">Close panels</dd></div>
              </dl>
            </section>
          </aside>
        )}
      </div>

      {selection && (
        <HighlightPopup
          selection={selection}
          noteId={note.id}
          type="epub"
          cfi={selection.cfi}
          onClose={() => setSelection(null)}
        />
      )}

      {editingHighlight && (
        <HighlightEditPopup
          highlight={editingHighlight.highlight}
          noteId={note.id}
          position={editingHighlight.position}
          onClose={() => setEditingHighlight(null)}
        />
      )}

      {/* Keyboard Shortcuts Panel */}
      <KeyboardShortcutsPanel
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        readerType="epub"
      />
    </div>
  );
}

// TOC List component
function TOCList({
  items,
  onSelect,
  currentChapter,
  depth = 0,
}: {
  items: NavItem[];
  onSelect: (href: string) => void;
  currentChapter: string;
  depth?: number;
}) {
  return (
    <ul className="space-y-1" role="list">
      {items.map((item, i) => (
        <li key={i}>
          <button
            onClick={() => onSelect(item.href)}
            className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-current/10 transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${
              item.label === currentChapter ? 'bg-current/10 font-medium' : 'opacity-80'
            }`}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            aria-current={item.label === currentChapter ? 'page' : undefined}
          >
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <TOCList
              items={item.subitems}
              onSelect={onSelect}
              currentChapter={currentChapter}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
