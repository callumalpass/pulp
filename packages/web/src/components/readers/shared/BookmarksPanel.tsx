import { useState, useRef, useEffect } from 'react';
import { useBookmarks } from '../../../hooks/useNote';
import { useToast } from '../../../contexts/ToastContext';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import type { Bookmark } from '@pulp/shared';

interface BookmarksPanelProps {
  noteId: string;
  currentPage?: number;
  currentCfi?: string;
  pageLabels?: string[] | null;
  onNavigate: (page?: number, cfi?: string) => void;
  onClose: () => void;
}

export function BookmarksPanel({
  noteId,
  currentPage,
  currentCfi,
  pageLabels,
  onNavigate,
  onClose,
}: BookmarksPanelProps) {
  const { bookmarks, isLoading, addBookmark, removeBookmark, isAdding: isSaving, isRemoving } = useBookmarks(noteId);
  const [newLabel, setNewLabel] = useState('');
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [bookmarkToDelete, setBookmarkToDelete] = useState<Bookmark | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  // Sort bookmarks: PDFs by page number, EPUBs by creation date
  const sortedBookmarks = [...bookmarks].sort((a: Bookmark, b: Bookmark) => {
    if (a.page !== undefined && b.page !== undefined) {
      return a.page - b.page;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // Focus input when adding
  useEffect(() => {
    if (isAddingMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAddingMode]);

  const handleAddBookmark = async () => {
    const label = newLabel.trim() || (currentPage ? `Page ${pageLabels?.[currentPage - 1] ?? currentPage}` : 'Bookmark');
    try {
      await addBookmark({
        label,
        page: currentPage,
        cfi: currentCfi,
      });
      showToast('Bookmark added', 'success');
      setNewLabel('');
      setIsAddingMode(false);
    } catch (error) {
      console.error('Failed to add bookmark:', error);
      showToast('Failed to add bookmark. Please try again.', 'error');
    }
  };

  const handleDeleteBookmark = async () => {
    if (!bookmarkToDelete || isRemoving) return;
    try {
      await removeBookmark(bookmarkToDelete.id);
      showToast('Bookmark deleted', 'success');
      setBookmarkToDelete(null);
    } catch (error) {
      console.error('Failed to delete bookmark:', error);
      showToast('Failed to delete bookmark. Please try again.', 'error');
      setBookmarkToDelete(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSaving) {
      handleAddBookmark();
    } else if (e.key === 'Escape') {
      setIsAddingMode(false);
      setNewLabel('');
    }
  };

  const formatBookmarkLocation = (bookmark: Bookmark) => {
    if (bookmark.page !== undefined) {
      const label = pageLabels?.[bookmark.page - 1];
      return label ? `Page ${label}` : `Page ${bookmark.page}`;
    }
    return 'Location saved';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  return (
    <div
      ref={panelRef}
      id="bookmarks-panel"
      className="w-72 bg-bg-surface border-r border-text-secondary/10 flex flex-col h-full"
      role="complementary"
      aria-label="Bookmarks panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-text-secondary/10">
        <h2 className="text-sm font-semibold text-text-primary">Bookmarks</h2>
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] w-11 h-11 md:w-8 md:h-8 md:min-w-[32px] md:min-h-[32px] flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
          aria-label="Close bookmarks panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Add bookmark section */}
      <div className="px-4 py-3 border-b border-text-secondary/10">
        {isAddingMode ? (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={currentPage ? `Page ${pageLabels?.[currentPage - 1] ?? currentPage}` : 'Bookmark name'}
              aria-label="Bookmark name"
              className="flex-1 min-h-[44px] md:min-h-[32px] px-2 text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary focus:outline-none focus:border-accent-primary"
              disabled={isSaving}
            />
            <button
              onClick={handleAddBookmark}
              disabled={isSaving}
              className="px-3 min-h-[44px] md:min-h-[32px] text-sm bg-accent-primary text-white rounded hover:bg-accent-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? '...' : 'Add'}
            </button>
            <button
              onClick={() => {
                setIsAddingMode(false);
                setNewLabel('');
              }}
              className="min-w-[44px] min-h-[44px] w-11 h-11 md:w-8 md:h-8 md:min-w-[32px] md:min-h-[32px] flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep rounded transition-colors"
              aria-label="Cancel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingMode(true)}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] md:min-h-[36px] text-sm text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add bookmark here
          </button>
        )}
      </div>

      {/* Bookmarks list */}
      <div className="flex-1 overflow-y-auto" tabIndex={0} role="region" aria-label="Bookmarks list">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedBookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-text-secondary/50 mb-3">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
            <p className="text-sm text-text-secondary mb-1">No bookmarks yet</p>
            <p className="text-xs text-text-secondary/70">
              Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-deep border border-text-secondary/20 rounded">B</kbd> to add a bookmark
            </p>
          </div>
        ) : (
          <ul className="py-2" role="list">
            {sortedBookmarks.map((bookmark: Bookmark) => (
              <li key={bookmark.id}>
                <div className="group flex items-start gap-2 px-4 py-2 hover:bg-bg-deep transition-colors">
                  <button
                    onClick={() => onNavigate(bookmark.page, bookmark.cfi)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-primary flex-shrink-0">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                      </svg>
                      <span className="text-sm text-text-primary truncate">{bookmark.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-[22px]">
                      <span className="text-xs text-text-secondary">{formatBookmarkLocation(bookmark)}</span>
                      <span className="text-xs text-text-secondary/50">{formatDate(bookmark.createdAt)}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setBookmarkToDelete(bookmark)}
                    className="min-w-[44px] min-h-[44px] w-11 h-11 md:opacity-0 md:group-hover:opacity-100 md:w-7 md:h-7 md:min-w-[28px] md:min-h-[28px] flex items-center justify-center text-text-secondary hover:text-red-500 transition-[color,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary rounded"
                    aria-label={`Remove bookmark: ${bookmark.label}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer with count */}
      {sortedBookmarks.length > 0 && (
        <div className="px-4 py-2 border-t border-text-secondary/10 bg-bg-deep/50">
          <span className="text-xs text-text-secondary">
            {sortedBookmarks.length} bookmark{sortedBookmarks.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <ConfirmDialog
        isOpen={bookmarkToDelete !== null}
        title="Delete Bookmark"
        message={`Are you sure you want to delete "${bookmarkToDelete?.label}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteBookmark}
        onCancel={() => setBookmarkToDelete(null)}
      />
    </div>
  );
}
