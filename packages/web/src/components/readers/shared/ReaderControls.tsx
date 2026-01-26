import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { useReaderStore, type ZoomMode, type PDFViewMode } from '../../../stores/reader';

interface ReaderControlsProps {
  currentPage: number;
  totalPages: number;
  zoom: number;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onZoomModeChange?: (mode: ZoomMode) => void;
  onViewModeChange?: (mode: PDFViewMode) => void;
  onEnterPresentation?: () => void;
  hasToc?: boolean;
}

export function ReaderControls({
  currentPage,
  totalPages,
  zoom,
  onPageChange,
  onZoomChange,
  onZoomModeChange,
  onViewModeChange,
  onEnterPresentation,
  hasToc = false,
}: ReaderControlsProps) {
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [showZoomMenu, setShowZoomMenu] = useState(false);
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
  } = useReaderStore();

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

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
    const page = parseInt(pageInput, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
    } else {
      setPageInput(String(currentPage));
    }
    inputRef.current?.blur();
  };

  const handleZoomModeSelect = (mode: ZoomMode) => {
    onZoomModeChange?.(mode);
    setShowZoomMenu(false);
  };

  const getZoomLabel = () => {
    if (zoomMode === 'fit-width') return 'Fit Width';
    if (zoomMode === 'fit-page') return 'Fit Page';
    return `${Math.round(zoom * 100)}%`;
  };

  return (
    <div className="h-12 bg-bg-surface border-b border-text-secondary/10 flex items-center px-4 gap-4">
      {/* Back button */}
      <Link
        to="/"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-stoody"
        title="Back to library"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            className={`w-8 h-8 p-0 ${tocOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
            title="Table of Contents"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </Button>
          <div className="h-6 w-px bg-text-secondary/20" />
        </>
      )}

      {/* Page navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="w-8 h-8 p-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Button>

        <form onSubmit={handlePageSubmit} className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="w-12 h-7 text-center text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary focus:outline-none focus:border-accent-primary"
          />
          <span className="text-sm text-text-secondary">/ {totalPages}</span>
        </form>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="w-8 h-8 p-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Button>
      </div>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onZoomChange(zoom - 0.25)}
          disabled={zoom <= 0.5}
          className="w-8 h-8 p-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M8 11h6" />
          </svg>
        </Button>

        {/* Zoom mode dropdown */}
        <div className="relative" ref={zoomMenuRef}>
          <button
            onClick={() => setShowZoomMenu(!showZoomMenu)}
            className="h-7 px-2 text-sm text-text-secondary hover:text-text-primary bg-bg-deep border border-text-secondary/20 rounded flex items-center gap-1 min-w-[5rem] justify-center"
          >
            {getZoomLabel()}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {showZoomMenu && (
            <div className="absolute top-full left-0 mt-1 bg-bg-surface border border-text-secondary/20 rounded-lg shadow-lg py-1 z-50 min-w-[8rem]">
              <button
                className={`w-full px-3 py-1.5 text-sm text-left hover:bg-bg-deep ${zoomMode === 'fit-width' ? 'text-accent-primary' : 'text-text-primary'}`}
                onClick={() => handleZoomModeSelect('fit-width')}
              >
                Fit Width
              </button>
              <button
                className={`w-full px-3 py-1.5 text-sm text-left hover:bg-bg-deep ${zoomMode === 'fit-page' ? 'text-accent-primary' : 'text-text-primary'}`}
                onClick={() => handleZoomModeSelect('fit-page')}
              >
                Fit Page
              </button>
              <div className="h-px bg-text-secondary/20 my-1" />
              {[50, 75, 100, 125, 150, 200].map((pct) => (
                <button
                  key={pct}
                  className={`w-full px-3 py-1.5 text-sm text-left hover:bg-bg-deep ${zoomMode === 'custom' && Math.round(zoom * 100) === pct ? 'text-accent-primary' : 'text-text-primary'}`}
                  onClick={() => {
                    onZoomChange(pct / 100);
                    setShowZoomMenu(false);
                  }}
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
          className="w-8 h-8 p-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </Button>
      </div>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* Search controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSearch}
          className={`w-8 h-8 p-0 ${isSearchOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
          title="Search (Ctrl+F)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </Button>

        {isSearchOpen && (
          <div className="flex items-center gap-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search..."
              className="w-40 h-7 px-2 text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary focus:outline-none focus:border-accent-primary"
            />
            {searchResults.length > 0 && (
              <span className="text-xs text-text-secondary whitespace-nowrap">
                {currentMatchIndex + 1}/{searchResults.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={prevMatch}
              disabled={searchResults.length === 0}
              className="w-6 h-6 p-0"
              title="Previous match (Shift+Enter)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextMatch}
              disabled={searchResults.length === 0}
              className="w-6 h-6 p-0"
              title="Next match (Enter)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="w-6 h-6 p-0"
              title="Close search (Escape)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
          </div>
        )}
      </div>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* View mode controls */}
      <div className="flex items-center gap-1">
        {/* Single page view */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewModeChange('single')}
          className={`w-8 h-8 p-0 ${pdfViewMode === 'single' ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
          title="Single page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="3" width="12" height="18" rx="2" />
          </svg>
        </Button>

        {/* Spread view */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewModeChange('spread')}
          className={`w-8 h-8 p-0 ${pdfViewMode === 'spread' ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
          title="Two-page spread"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="8" height="16" rx="1" />
            <rect x="14" y="4" width="8" height="16" rx="1" />
          </svg>
        </Button>

        {/* Presentation mode */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleViewModeChange('presentation')}
          className="w-8 h-8 p-0"
          title="Presentation mode"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
        className={`w-8 h-8 p-0 ${pdfColorMode === 'dark' ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
        title={pdfColorMode === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {pdfColorMode === 'dark' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        )}
      </Button>

      <div className="h-6 w-px bg-text-secondary/20" />

      {/* Markdown notes toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleMarkdownPanel}
        className={`w-8 h-8 p-0 ${markdownPanelOpen ? 'bg-accent-primary/20 text-accent-primary' : ''}`}
        title="Notes (Cmd/Ctrl+E)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </Button>

      {/* Progress indicator */}
      <div className="ml-auto flex items-center gap-2">
        <div className="w-24 h-1 bg-bg-deep rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-primary transition-all duration-300"
            style={{ width: `${(currentPage / totalPages) * 100}%` }}
          />
        </div>
        <span className="text-xs text-text-secondary">
          {Math.round((currentPage / totalPages) * 100)}%
        </span>
      </div>
    </div>
  );
}
