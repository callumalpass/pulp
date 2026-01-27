import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { useReaderStore, type ZoomMode, type PDFViewMode } from '../../../stores/reader';
import { useMobile } from '../../../hooks/useMobile';
import { MobileReaderMenu } from './MobileReaderMenu';
import { ReadingTimeIndicator } from './ReadingTimeIndicator';
import { SaveIndicator } from './SaveIndicator';
import type { SaveStatus } from '../../../hooks/useProgress';

interface ReaderControlsProps {
  noteId: string;
  currentPage: number;
  totalPages: number;
  zoom: number;
  pageLabels?: string[] | null;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onZoomModeChange?: (mode: ZoomMode) => void;
  onViewModeChange?: (mode: PDFViewMode) => void;
  onEnterPresentation?: () => void;
  hasToc?: boolean;
  saveStatus?: SaveStatus;
}

export function ReaderControls({
  noteId,
  currentPage,
  totalPages,
  zoom,
  pageLabels,
  onPageChange,
  onZoomChange,
  onZoomModeChange,
  onViewModeChange,
  onEnterPresentation,
  hasToc = false,
  saveStatus = 'idle',
}: ReaderControlsProps) {
  const isMobile = useMobile();
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const {
    zoomMode,
    tocOpen,
    toggleToc,
    markdownPanelOpen,
    toggleMarkdownPanel,
    isSearchOpen,
    searchQuery,
    searchResults,
    currentMatchIndex,
    setSearchQuery,
    nextMatch,
    prevMatch,
    toggleSearch,
    clearSearch,
    pdfViewMode,
    pdfColorMode,
    setPdfViewMode,
    togglePdfColorMode,
    bookmarksOpen,
    toggleBookmarks,
    highlightsOpen,
    toggleHighlights,
    shortcutsOpen,
    toggleShortcuts,
    statsOpen,
    toggleStats,
    goalsOpen,
    toggleGoals,
  } = useReaderStore();

  useEffect(() => {
    setPageInput(pageLabels?.[currentPage - 1] ?? String(currentPage));
  }, [currentPage, pageLabels]);

  // Focus search input when opening
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Close zoom menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (zoomMenuRef.current && !zoomMenuRef.current.contains(e.target as Node)) {
        setShowZoomMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut for markdown editor (Cmd/Ctrl+E)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        toggleMarkdownPanel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleMarkdownPanel]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    } else if (e.key === 'Escape') {
      clearSearch();
    }
  };

  const handleViewModeChange = (mode: PDFViewMode) => {
    if (mode === 'presentation') {
      onEnterPresentation?.();
    } else {
      setPdfViewMode(mode);
      onViewModeChange?.(mode);
    }
  };

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = pageInput.trim();

    // First, try parsing as a physical page number
    const page = parseInt(trimmedInput, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
      inputRef.current?.blur();
      return;
    }

    // Next, try matching against page labels
    if (pageLabels) {
      const labelIndex = pageLabels.findIndex(
        label => label.toLowerCase() === trimmedInput.toLowerCase()
      );
      if (labelIndex !== -1) {
        onPageChange(labelIndex + 1);
        inputRef.current?.blur();
        return;
      }
    }

    // Invalid input, reset to current page
    setPageInput(currentPageLabel);
    inputRef.current?.blur();
  };

  // Get the display label for the current page
  const currentPageLabel = pageLabels?.[currentPage - 1] ?? String(currentPage);

  const handleZoomModeSelect = (mode: ZoomMode) => {
    onZoomModeChange?.(mode);
    setShowZoomMenu(false);
  };

  const getZoomLabel = () => {
    if (zoomMode === 'fit-width') return 'Fit Width';
    if (zoomMode === 'fit-page') return 'Fit Page';
    return `${Math.round(zoom * 100)}%`;
  };

  // Mobile toolbar
  if (isMobile) {
    return (
      <>
        <header className="h-14 bg-bg-surface border-b border-text-secondary/10 flex items-center px-2 gap-2" role="toolbar" aria-label="Reader controls">
          {/* Back button - 44x44px touch target */}
          <Link
            to="/"
            className="touch-target rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-smooth"
            aria-label="Back to library"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>

          {/* Page indicator - tappable */}
          <button
            onClick={() => inputRef.current?.focus()}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-bg-deep"
          >
            <span className="text-sm font-medium text-text-primary">
              {pageLabels?.[currentPage - 1] ?? currentPage}
            </span>
            <span className="text-sm text-text-secondary">/ {totalPages}</span>
          </button>
          {/* Hidden input for page entry */}
          <input
            ref={inputRef}
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={handlePageSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handlePageSubmit(e)}
            className="sr-only"
          />

          {/* Search button - quick access */}
          <button
            onClick={toggleSearch}
            className={`touch-target rounded-lg flex items-center justify-center transition-colors ${
              isSearchOpen ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>

          {/* TOC toggle - 44x44px */}
          {hasToc && (
            <button
              onClick={toggleToc}
              className={`touch-target rounded-lg flex items-center justify-center transition-colors ${
                tocOpen ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-deep'
              }`}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </button>
          )}

          {/* More button - opens bottom sheet */}
          <button
            onClick={() => setShowMobileMenu(true)}
            className="touch-target rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </header>

        {/* Mobile menu bottom sheet */}
        {showMobileMenu && (
          <MobileReaderMenu
            onZoomModeChange={onZoomModeChange}
            onViewModeChange={onViewModeChange}
            onEnterPresentation={onEnterPresentation}
            onClose={() => setShowMobileMenu(false)}
          />
        )}

        {/* Mobile search bar - slides in when search is open */}
        {isSearchOpen && (
          <div className="h-14 bg-bg-surface border-b border-text-secondary/10 flex items-center px-2 gap-2 animate-slide-up">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search in document..."
              className="flex-1 h-10 px-3 text-sm bg-bg-deep border border-text-secondary/20 rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              autoFocus
            />
            {searchResults.length > 0 && (
              <span className="text-xs text-text-secondary whitespace-nowrap px-2">
                {currentMatchIndex + 1}/{searchResults.length}
              </span>
            )}
            <button
              onClick={prevMatch}
              disabled={searchResults.length === 0}
              className="touch-target rounded-lg flex items-center justify-center text-text-secondary disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </button>
            <button
              onClick={nextMatch}
              disabled={searchResults.length === 0}
              className="touch-target rounded-lg flex items-center justify-center text-text-secondary disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <button
              onClick={clearSearch}
              className="touch-target rounded-lg flex items-center justify-center text-text-secondary"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </>
    );
  }

  // Desktop toolbar
  return (
    <header
      className="h-12 bg-bg-surface border-b border-text-secondary/10 flex items-center px-4 gap-4"
      role="toolbar"
      aria-label="PDF reader controls"
    >
      {/* Back button */}
      <Link
        to="/"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-smooth focus:outline-none focus:ring-2 focus:ring-accent-primary"
        aria-label="Back to library"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </Link>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* TOC toggle button */}
      {hasToc && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleToc}
            className={`w-8 h-8 !p-0 ${tocOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
            aria-label="Table of Contents"
            aria-expanded={tocOpen}
            aria-controls="pdf-toc-panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </Button>
          <div className="h-6 w-px bg-text-secondary/20" aria-hidden="true" />
        </>
      )}

      {/* Page navigation */}
      <nav className="flex items-center gap-2" aria-label="Page navigation">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-8 h-8 !p-0"
          aria-label="Previous page"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Button>

        <form onSubmit={handlePageSubmit} className="flex items-center gap-1">
          <label htmlFor="page-input" className="sr-only">Go to page</label>
          <input
            id="page-input"
            ref={inputRef}
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-12 h-7 text-center text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary focus:outline-none focus:border-accent-primary"
            aria-label={`Current page ${currentPageLabel} of ${totalPages}`}
          />
          {pageLabels ? (
            <span className="text-sm text-text-secondary" aria-hidden="true">
              ({currentPage} / {totalPages})
            </span>
          ) : (
            <span className="text-sm text-text-secondary" aria-hidden="true">/ {totalPages}</span>
          )}
        </form>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="w-8 h-8 !p-0"
          aria-label="Next page"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Button>
      </nav>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* Zoom controls */}
      <div className="flex items-center gap-2" role="group" aria-label="Zoom controls">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onZoomChange(zoom - 0.25)}
          disabled={zoom <= 0.5}
          className="w-8 h-8 !p-0"
          aria-label="Zoom out"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M8 11h6" />
          </svg>
        </Button>

        {/* Zoom mode dropdown */}
        <div className="relative" ref={zoomMenuRef}>
          <button
            onClick={() => setShowZoomMenu(!showZoomMenu)}
            className="h-7 px-2 text-sm text-text-secondary hover:text-text-primary bg-bg-deep border border-text-secondary/20 rounded flex items-center gap-1 min-w-[5rem] justify-center focus:outline-none focus:ring-2 focus:ring-accent-primary"
            aria-haspopup="listbox"
            aria-expanded={showZoomMenu}
            aria-label={`Zoom: ${getZoomLabel()}`}
          >
            {getZoomLabel()}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {showZoomMenu && (
            <div className="absolute top-full left-0 mt-1 bg-bg-surface border border-text-secondary/20 rounded-lg shadow-lg py-1 z-50 min-w-[8rem]" role="listbox" aria-label="Zoom options">
              <button
                className={`w-full px-3 py-1.5 text-sm text-left hover:bg-bg-deep focus:outline-none focus:bg-bg-deep ${zoomMode === 'fit-width' ? 'text-accent-primary' : 'text-text-primary'}`}
                onClick={() => handleZoomModeSelect('fit-width')}
                role="option"
                aria-selected={zoomMode === 'fit-width'}
              >
                Fit Width
              </button>
              <button
                className={`w-full px-3 py-1.5 text-sm text-left hover:bg-bg-deep focus:outline-none focus:bg-bg-deep ${zoomMode === 'fit-page' ? 'text-accent-primary' : 'text-text-primary'}`}
                onClick={() => handleZoomModeSelect('fit-page')}
                role="option"
                aria-selected={zoomMode === 'fit-page'}
              >
                Fit Page
              </button>
              <div className="h-px bg-text-secondary/20 my-1" aria-hidden="true" />
              {[50, 75, 100, 125, 150, 200].map((pct) => (
                <button
                  key={pct}
                  className={`w-full px-3 py-1.5 text-sm text-left hover:bg-bg-deep focus:outline-none focus:bg-bg-deep ${zoomMode === 'custom' && Math.round(zoom * 100) === pct ? 'text-accent-primary' : 'text-text-primary'}`}
                  onClick={() => {
                    onZoomChange(pct / 100);
                    setShowZoomMenu(false);
                  }}
                  role="option"
                  aria-selected={zoomMode === 'custom' && Math.round(zoom * 100) === pct}
                >
                  {pct}%
                </button>
              ))}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onZoomChange(zoom + 0.25)}
          disabled={zoom >= 3}
          className="w-8 h-8 !p-0"
          aria-label="Zoom in"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </Button>
      </div>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* Search controls */}
      <div className="flex items-center gap-2" role="search">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSearch}
          className={`w-8 h-8 !p-0 ${isSearchOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
          aria-label="Search (Ctrl+F)"
          aria-expanded={isSearchOpen}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </Button>

        {isSearchOpen && (
          <div className="flex items-center gap-2">
            <label htmlFor="pdf-search" className="sr-only">Search in document</label>
            <input
              id="pdf-search"
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search..."
              className="w-40 h-7 px-2 text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary focus:outline-none focus:border-accent-primary"
              aria-describedby={searchResults.length > 0 ? 'search-results-count' : undefined}
            />
            {searchResults.length > 0 && (
              <span id="search-results-count" className="text-xs text-text-secondary whitespace-nowrap" aria-live="polite">
                {currentMatchIndex + 1}/{searchResults.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={prevMatch}
              disabled={searchResults.length === 0}
              className="w-7 h-7 !p-0 !min-h-[28px]"
              aria-label="Previous match (Shift+Enter)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextMatch}
              disabled={searchResults.length === 0}
              className="w-7 h-7 !p-0 !min-h-[28px]"
              aria-label="Next match (Enter)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="w-7 h-7 !p-0 !min-h-[28px]"
              aria-label="Close search (Escape)"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
          </div>
        )}
      </div>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* View mode controls */}
      <div className="flex items-center gap-1" role="group" aria-label="View mode">
        {/* Single page view */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewModeChange('single')}
          className={`w-8 h-8 !p-0 ${pdfViewMode === 'single' ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
          aria-label="Single page view"
          aria-pressed={pdfViewMode === 'single'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="6" y="3" width="12" height="18" rx="2" />
          </svg>
        </Button>

        {/* Spread view */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewModeChange('spread')}
          className={`w-8 h-8 !p-0 ${pdfViewMode === 'spread' ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
          aria-label="Two-page spread view"
          aria-pressed={pdfViewMode === 'spread'}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="2" y="4" width="8" height="16" rx="1" />
            <rect x="14" y="4" width="8" height="16" rx="1" />
          </svg>
        </Button>

        {/* Presentation mode */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewModeChange('presentation')}
          className="w-8 h-8 !p-0"
          aria-label="Presentation mode"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
          </svg>
        </Button>
      </div>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* Dark mode toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={togglePdfColorMode}
        className={`w-8 h-8 !p-0 ${pdfColorMode === 'dark' ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
        aria-label={pdfColorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-pressed={pdfColorMode === 'dark'}
      >
        {pdfColorMode === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </Button>

      <div className="h-6 w-px bg-text-secondary/20" aria-hidden="true" />

      {/* Markdown notes toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleMarkdownPanel}
        className={`w-8 h-8 !p-0 ${markdownPanelOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
        aria-label="Toggle notes panel (Cmd/Ctrl+E)"
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
      </Button>

      {/* Bookmarks toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleBookmarks}
        className={`w-8 h-8 !p-0 ${bookmarksOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
        aria-label="Toggle bookmarks (B)"
        aria-expanded={bookmarksOpen}
        aria-controls="bookmarks-panel"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
        </svg>
      </Button>

      {/* Highlights toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleHighlights}
        className={`w-8 h-8 !p-0 ${highlightsOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
        aria-label="Toggle highlights (A)"
        aria-expanded={highlightsOpen}
        aria-controls="highlights-panel"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </Button>

      <div className="h-6 w-px bg-text-secondary/20" aria-hidden="true" />

      {/* Keyboard shortcuts help */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleShortcuts}
        className={`w-8 h-8 !p-0 ${shortcutsOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
        aria-label="Keyboard shortcuts (?)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </Button>

      {/* Reading time and stats */}
      <div className="ml-auto flex items-center gap-3">
        <ReadingTimeIndicator
          noteId={noteId}
          currentPage={currentPage}
          totalPages={totalPages}
          onClick={toggleStats}
          className="text-text-secondary"
        />

        {/* Stats button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleStats}
          className={`w-8 h-8 !p-0 ${statsOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
          aria-label="Reading statistics (S)"
          aria-expanded={statsOpen}
          aria-controls="reading-stats-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
        </Button>

        {/* Goals button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleGoals}
          className={`w-8 h-8 !p-0 ${goalsOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
          aria-label="Reading goals (R)"
          aria-expanded={goalsOpen}
          aria-controls="reading-goals-panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        </Button>

        <div className="h-6 w-px bg-text-secondary/20" aria-hidden="true" />

        {/* Save indicator */}
        <SaveIndicator status={saveStatus} />

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          <div
            className="w-24 h-1 bg-bg-deep rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round((currentPage / totalPages) * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Reading progress: ${Math.round((currentPage / totalPages) * 100)}%`}
          >
            <div
              className="h-full bg-accent-primary transition-all duration-300"
              style={{ width: `${(currentPage / totalPages) * 100}%` }}
            />
          </div>
          <span className="text-xs text-text-secondary" aria-hidden="true">
            {Math.round((currentPage / totalPages) * 100)}%
          </span>
        </div>
      </div>
    </header>
  );
}
