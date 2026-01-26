import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { useReaderStore, type ZoomMode } from '../../../stores/reader';

interface ReaderControlsProps {
  currentPage: number;
  totalPages: number;
  zoom: number;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onZoomModeChange?: (mode: ZoomMode) => void;
  hasToc?: boolean;
}

export function ReaderControls({
  currentPage,
  totalPages,
  zoom,
  onPageChange,
  onZoomChange,
  onZoomModeChange,
  hasToc = false,
}: ReaderControlsProps) {
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const { zoomMode, tocOpen, toggleToc } = useReaderStore();

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

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
