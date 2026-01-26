import { useEffect, useRef, useState, useCallback } from 'react';
import ePub, { Book, Rendition, Contents } from 'epubjs';
import type { LiteratureNote, EPUBHighlight } from '@pulp/shared';
import { useReaderStore } from '../../stores/reader';
import { usePreferencesStore } from '../../stores/preferences';
import { useProgress } from '../../hooks/useProgress';
import { useHighlights } from '../../hooks/useNote';
import { useMobile } from '../../hooks/useMobile';
import { useSwipeGesture } from '../../hooks/useSwipeGesture';
import { ReaderControls } from './shared/ReaderControls';
import { HighlightPopup } from './shared/HighlightPopup';
import { HighlightEditPopup } from './shared/HighlightEditPopup';
import { api } from '../../lib/api';

interface EPUBReaderProps {
  note: LiteratureNote;
}

interface Selection {
  text: string;
  page: number;
  position: { x: number; y: number };
  cfi: string;
}

export function EPUBReader({ note }: EPUBReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);

  const { currentPage, totalPages, isLoading, setCurrentPage, setTotalPages, setIsLoading, reset } = useReaderStore();
  const { readerTheme, fontSize, lineHeight } = usePreferencesStore();
  const { updateProgress, saveImmediately } = useProgress(note.id);
  const { data: highlights } = useHighlights(note.id);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [editingHighlight, setEditingHighlight] = useState<{ highlight: EPUBHighlight; position: { x: number; y: number } } | null>(null);
  const [locations, setLocations] = useState<string[]>([]);

  // Mobile support
  const isMobile = useMobile();
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => renditionRef.current?.next(),
    onSwipeRight: () => renditionRef.current?.prev(),
    enabled: isMobile,
    threshold: 50,
  });

  // Load EPUB
  useEffect(() => {
    reset();
    loadEPUB();

    return () => {
      saveImmediately();
      renditionRef.current?.destroy();
      bookRef.current?.destroy();
    };
  }, [note.id]);

  const loadEPUB = async () => {
    if (!containerRef.current) return;

    try {
      setIsLoading(true);

      const book = ePub(api.files.getUrl(note.id));
      bookRef.current = book;

      const rendition = book.renderTo(containerRef.current, {
        width: '100%',
        height: '100%',
        spread: 'none',
      });
      renditionRef.current = rendition;

      // Apply theme
      applyTheme(rendition, readerTheme);
      applyStyles(rendition, fontSize, lineHeight);

      // Load locations for progress tracking
      await book.ready;
      const generatedLocations = await book.locations.generate(1024);
      setLocations(generatedLocations);
      setTotalPages(generatedLocations.length);

      // Restore progress
      if (note.progress > 0 && generatedLocations.length > 0) {
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

      // Set up event handlers
      rendition.on('relocated', (location: { start: { cfi: string; location: number } }) => {
        const locationIndex = location.start.location;
        setCurrentPage(locationIndex + 1);

        // Update progress
        if (generatedLocations.length > 0) {
          const progress = ((locationIndex + 1) / generatedLocations.length) * 100;
          updateProgress(progress);
        }
      });

      // Handle text selection
      rendition.on('selected', (cfiRange: string, contents: Contents) => {
        const selection = contents.window.getSelection();
        if (!selection || selection.isCollapsed) return;

        const text = selection.toString().trim();
        if (!text) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const containerRect = containerRef.current?.getBoundingClientRect();

        if (!containerRect) return;

        setSelection({
          text,
          page: currentPage,
          position: {
            x: rect.left + rect.width / 2 - containerRect.left,
            y: rect.bottom - containerRect.top + 10,
          },
          cfi: cfiRange,
        });
      });

      // Add existing highlights
      addHighlightsToRendition(rendition, highlights?.filter(h => h.type === 'epub') as EPUBHighlight[] || []);

      setIsLoading(false);
    } catch (error) {
      console.error('Failed to load EPUB:', error);
      setIsLoading(false);
    }
  };

  // Apply highlights when they change
  useEffect(() => {
    if (renditionRef.current && highlights) {
      addHighlightsToRendition(
        renditionRef.current,
        highlights.filter(h => h.type === 'epub') as EPUBHighlight[]
      );
    }
  }, [highlights]);

  // Update theme when preferences change
  useEffect(() => {
    if (renditionRef.current) {
      applyTheme(renditionRef.current, readerTheme);
    }
  }, [readerTheme]);

  // Update styles when preferences change
  useEffect(() => {
    if (renditionRef.current) {
      applyStyles(renditionRef.current, fontSize, lineHeight);
    }
  }, [fontSize, lineHeight]);

  const applyTheme = (rendition: Rendition, theme: string) => {
    const themes: Record<string, object> = {
      light: {
        body: { background: '#ffffff', color: '#2d3436' },
      },
      dark: {
        body: { background: '#2d3436', color: '#dfe6e9' },
      },
      sepia: {
        body: { background: '#f4ecd8', color: '#5c4b37' },
      },
    };

    rendition.themes.default(themes[theme] || themes.dark);
  };

  const applyStyles = (rendition: Rendition, fontSize: number, lineHeight: number) => {
    rendition.themes.fontSize(`${fontSize}px`);
    rendition.themes.override('line-height', `${lineHeight}`);
  };

  const addHighlightsToRendition = (rendition: Rendition, epubHighlights: EPUBHighlight[]) => {
    // Clear existing annotations - epub.js API varies by version
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rendition.annotations as unknown as { remove?: (type: string) => void })?.remove?.('highlight');

    epubHighlights.forEach((highlight) => {
      try {
        // epub.js annotations.highlight(cfiRange, data, cb, className, styles)
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
      } catch {
        // CFI might not be valid for current content
      }
    });
  };

  const goToPage = useCallback((page: number) => {
    if (!renditionRef.current || locations.length === 0) return;

    const newPage = Math.max(1, Math.min(totalPages, page));
    const cfi = locations[newPage - 1];

    if (cfi) {
      renditionRef.current.display(cfi);
    }
  }, [locations, totalPages]);

  const handlePrev = () => {
    renditionRef.current?.prev();
  };

  const handleNext = () => {
    renditionRef.current?.next();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ReaderControls
        currentPage={currentPage}
        totalPages={totalPages}
        zoom={1}
        onPageChange={goToPage}
        onZoomChange={() => {}}
      />

      <div className="flex-1 overflow-hidden relative">
        <div
          ref={containerRef}
          className={`absolute inset-0 ${isMobile ? 'hide-scrollbar-mobile' : ''}`}
          style={{
            background: readerTheme === 'sepia' ? '#f4ecd8' : readerTheme === 'light' ? '#ffffff' : '#2d3436',
          }}
          onTouchStart={swipeHandlers.handleTouchStart}
          onTouchEnd={swipeHandlers.handleTouchEnd}
        />

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80">
            <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
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
    </div>
  );
}
