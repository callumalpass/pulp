import { useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Book, Rendition, Contents, NavItem } from 'epubjs';
import type { LiteratureNote, EPUBHighlight } from '@pulp/shared';
import { useReaderStore } from '../../stores/reader';
import { usePreferencesStore } from '../../stores/preferences';
import { useReadingStatsStore } from '../../stores/readingStats';
import { useProgress } from '../../hooks/useProgress';
import { useHighlights } from '../../hooks/useNote';
import { useMobile } from '../../hooks/useMobile';
import { useIdleDetection } from '../../hooks/useIdleDetection';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { HighlightPopup } from './shared/HighlightPopup';
import { HighlightEditPopup } from './shared/HighlightEditPopup';
import { KeyboardShortcutsPanel } from './shared/KeyboardShortcutsPanel';
import { BookmarksPanel } from './shared/BookmarksPanel';
import { ReadingStatsPanel } from './shared/ReadingStatsPanel';
import { ReadingGoalsPanel } from './shared/ReadingGoalsPanel';
import { ReadingTimeIndicator } from './shared/ReadingTimeIndicator';
import { MarkdownEditorPanel } from './shared/MarkdownEditorPanel';
import { SaveIndicator } from './shared/SaveIndicator';
import { api } from '../../lib/api';
import { Link } from 'react-router-dom';

interface EPUBReaderProps {
  note: LiteratureNote;
}

interface Selection {
  text: string;
  page: number;
  position: { x: number; y: number };
  cfi: string;
}

type EPUBTheme = 'light' | 'dark' | 'sepia' | 'eink';

const THEME_STYLES: Record<EPUBTheme, { bg: string; text: string; link: string }> = {
  light: { bg: '#ffffff', text: '#2d3436', link: '#0984e3' },
  dark: { bg: '#1a1a2e', text: '#e4e4e7', link: '#60a5fa' },
  sepia: { bg: '#f4ecd8', text: '#5c4b37', link: '#8b5a2b' },
  eink: { bg: '#ffffff', text: '#000000', link: '#000000' },
};

export function EPUBReader({ note }: EPUBReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const {
    currentPage,
    totalPages,
    isLoading,
    shortcutsOpen,
    bookmarksOpen,
    statsOpen,
    goalsOpen,
    markdownPanelOpen,
    setCurrentPage,
    setTotalPages,
    setIsLoading,
    setShortcutsOpen,
    toggleShortcuts,
    setBookmarksOpen,
    toggleBookmarks,
    setStatsOpen,
    toggleStats,
    setGoalsOpen,
    toggleGoals,
    setMarkdownPanelOpen,
    toggleMarkdownPanel,
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
  const { updateProgress, saveImmediately, saveStatus } = useProgress(note.id);
  const { data: highlights } = useHighlights(note.id);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<{ highlight: EPUBHighlight; position: { x: number; y: number } } | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [toc, setToc] = useState<NavItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [currentCfi, setCurrentCfi] = useState<string | null>(null);
  const [showClickZones, setShowClickZones] = useState(true);
  const [headerVisible, setHeaderVisible] = useState(true);

  const isMobile = useMobile();
  const theme = (readerTheme || 'dark') as EPUBTheme;

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
      renditionRef.current?.destroy();
      bookRef.current?.destroy();
    };
  }, [note.id]);

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

      // Apply initial styles
      applyTheme(rendition, theme);
      applyStyles(rendition);

      await book.ready;

      // Get TOC
      const navigation = await book.loaded.navigation;
      setToc(navigation.toc);

      // Try to load cached locations first
      const cacheKey = `epub-locations-${note.id}`;
      const cachedLocations = localStorage.getItem(cacheKey);
      let generatedLocations: string[] = [];

      if (cachedLocations) {
        try {
          generatedLocations = JSON.parse(cachedLocations);
          // epub.js load() expects the serialized string, not parsed array
          book.locations.load(cachedLocations);
          setLocations(generatedLocations);
          setTotalPages(generatedLocations.length);
        } catch {
          // Cache invalid, will regenerate
        }
      }

      // Display content immediately (don't wait for locations)
      // Prefer exact CFI position if available, otherwise calculate from progress
      if (note.lastOpenedCfi) {
        // Resume at exact saved CFI position
        await rendition.display(note.lastOpenedCfi);
      } else if (note.progress > 0 && generatedLocations.length > 0) {
        // Fallback: calculate approximate position from progress percentage
        const locationIndex = Math.floor((note.progress / 100) * generatedLocations.length);
        const cfi = generatedLocations[locationIndex];
        if (cfi) {
          await rendition.display(cfi);
        } else {
          await rendition.display();
        }
      } else {
        await rendition.display();
      }

      // Hide loading spinner - content is visible now
      setIsLoading(false);

      // Start reading session after EPUB is loaded
      // Use location count if available, otherwise estimate from initial display
      const startPage = note.progress > 0 && generatedLocations.length > 0
        ? Math.floor((note.progress / 100) * generatedLocations.length) + 1
        : 1;
      const totalPagesEstimate = generatedLocations.length || 100; // Estimate until locations are ready
      startSession(note.id, startPage, totalPagesEstimate);

      // Generate locations in background if not cached
      if (!cachedLocations || generatedLocations.length === 0) {
        // Use requestIdleCallback for non-blocking generation
        const generateLocations = async () => {
          const newLocations = await book.locations.generate(1024);
          setLocations(newLocations);
          setTotalPages(newLocations.length);
          // Cache for next time
          try {
            localStorage.setItem(cacheKey, JSON.stringify(newLocations));
          } catch {
            // localStorage full, ignore
          }
        };

        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => generateLocations());
        } else {
          setTimeout(generateLocations, 100);
        }
      }

      // Event handlers
      rendition.on('relocated', (location: { start: { cfi: string; location: number; href: string } }) => {
        const locationIndex = location.start.location;
        if (locationIndex >= 0) {
          setCurrentPage(locationIndex + 1);
        }

        // Track current CFI for bookmarks
        setCurrentCfi(location.start.cfi);

        // Update progress when locations are available
        const currentLocations = book.locations.length();
        if (currentLocations > 0 && locationIndex >= 0) {
          const progress = ((locationIndex + 1) / currentLocations) * 100;
          // Send CFI along with progress for precise resume
          updateProgress(progress, location.start.cfi);
        }

        // Find current chapter
        const chapter = findChapter(navigation.toc, location.start.href);
        setCurrentChapter(chapter?.label || '');
      });

      rendition.on('selected', (cfiRange: string, contents: Contents) => {
        const sel = contents.window.getSelection();
        if (!sel || sel.isCollapsed) return;

        const text = sel.toString().trim();
        if (!text) return;

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect(); // Coords relative to iframe viewport

        // Get the iframe element to convert to main document coordinates
        const iframe = contents.document.defaultView?.frameElement as HTMLIFrameElement | null;
        const iframeRect = iframe?.getBoundingClientRect();

        if (!iframeRect) return;

        // Calculate viewport-relative coordinates by adding iframe offset
        setSelection({
          text,
          page: currentPage,
          position: {
            x: iframeRect.left + rect.left + rect.width / 2,
            y: iframeRect.top + rect.bottom + 10,
          },
          cfi: cfiRange,
        });
      });

      // Click to navigate (left/right thirds) or toggle UI (center)
      rendition.on('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'A') return; // Don't navigate on links

        // Don't navigate if there's a text selection
        const sel = (e.view as Window)?.getSelection();
        if (sel && !sel.isCollapsed) return;

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

  const findChapter = (items: NavItem[], href: string): NavItem | null => {
    for (const item of items) {
      if (href.includes(item.href)) return item;
      if (item.subitems) {
        const found = findChapter(item.subitems, href);
        if (found) return found;
      }
    }
    return null;
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
        (rendition.annotations.highlight as (
          cfiRange: string,
          data?: object,
          cb?: (e: MouseEvent) => void,
          className?: string,
          styles?: object
        ) => void)(
          highlight.cfi,
          { highlightId: highlight.id },
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
          'pulp-highlight',
          { fill: 'rgba(255, 235, 59, 0.4)', cursor: 'pointer' }
        );
      } catch {}
    });
  };

  const goToPage = useCallback((page: number) => {
    if (!renditionRef.current || locations.length === 0) return;
    const newPage = Math.max(1, Math.min(totalPages, page));
    const cfi = locations[newPage - 1];
    if (cfi) renditionRef.current.display(cfi);
  }, [locations, totalPages]);

  const goToChapter = (href: string) => {
    renditionRef.current?.display(href);
    setTocOpen(false);
  };

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

      // Close markdown panel on Escape (if open)
      if (e.key === 'Escape' && markdownPanelOpen) {
        setMarkdownPanelOpen(false);
        return;
      }

      // Notes editor: Cmd/Ctrl+E
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        toggleMarkdownPanel();
        return;
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
  }, [shortcutsOpen, bookmarksOpen, statsOpen, goalsOpen, markdownPanelOpen, tocOpen, theme, fontSize, toggleShortcuts, setShortcutsOpen, toggleBookmarks, setBookmarksOpen, toggleStats, setStatsOpen, toggleGoals, setGoalsOpen, toggleMarkdownPanel, setMarkdownPanelOpen, setReaderTheme, setFontSize]);

  const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;
  const colors = THEME_STYLES[theme];

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8" role="alert" aria-live="assertive">
        <div className="text-red-500 text-lg" role="heading" aria-level={1}>Failed to load EPUB</div>
        <div className="text-text-secondary text-sm">{error}</div>
        <Link to="/" className="text-accent-primary hover:underline focus:outline-none focus:ring-2 focus:ring-accent-primary">
          Back to library
        </Link>
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
            <span className="sr-only">Page </span>{currentPage}<span className="sr-only"> of </span><span aria-hidden="true"> / </span>{totalPages}
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

        {/* Notes button */}
        <button
          onClick={() => { toggleMarkdownPanel(); setTocOpen(false); setSettingsOpen(false); }}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${markdownPanelOpen ? 'bg-current/20' : 'hover:bg-current/10'}`}
          aria-label="Notes (Cmd+E)"
          aria-expanded={markdownPanelOpen}
          aria-controls="markdown-notes-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
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
          className="h-full bg-current/40 transition-all duration-300"
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

        {/* Reading Statistics Panel */}
        {statsOpen && (
          <ReadingStatsPanel
            noteId={note.id}
            currentPage={currentPage}
            totalPages={totalPages}
            onClose={() => setStatsOpen(false)}
          />
        )}

        {/* Reading Goals Panel */}
        {goalsOpen && (
          <ReadingGoalsPanel onClose={() => setGoalsOpen(false)} />
        )}

        {/* Markdown Notes Panel */}
        {markdownPanelOpen && (
          <MarkdownEditorPanel
            noteId={note.id}
            onClose={() => setMarkdownPanelOpen(false)}
          />
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
              <div className="flex gap-2" role="radiogroup" aria-label="Reader theme">
                {(['light', 'dark', 'sepia', 'eink'] as EPUBTheme[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setReaderTheme(t)}
                    className={`flex-1 h-10 rounded-lg border-2 transition-colors focus:outline-none focus:ring-2 focus:ring-current/50 ${
                      theme === t ? 'border-current' : 'border-transparent'
                    }`}
                    style={{ background: THEME_STYLES[t].bg }}
                    role="radio"
                    aria-checked={theme === t}
                    aria-label={`${t === 'eink' ? 'E-ink' : t.charAt(0).toUpperCase() + t.slice(1)} theme`}
                  >
                    <span style={{ color: THEME_STYLES[t].text }} className="text-xs" aria-hidden="true">
                      A
                    </span>
                  </button>
                ))}
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
