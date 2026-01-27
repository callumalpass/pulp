import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useDeleteHighlight } from '../../../hooks/useHighlights';
import { useToast } from '../../../contexts/ToastContext';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import type { Highlight, PDFHighlight, EPUBHighlight, HighlightCategory } from '@pulp/shared';
import { HIGHLIGHT_CATEGORIES } from '@pulp/shared';

interface HighlightsPanelProps {
  noteId: string;
  highlights: Highlight[];
  currentPage?: number;  // Used for context in PDF mode
  pageLabels?: string[] | null;
  onNavigate: (page?: number, cfi?: string, highlightId?: string) => void;
  onClose: () => void;
}

const CATEGORY_FILTERS: { id: HighlightCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'important', label: 'Important' },
  { id: 'question', label: 'Question' },
  { id: 'todo', label: 'To-do' },
  { id: 'definition', label: 'Definition' },
];

export function HighlightsPanel({
  noteId,
  highlights,
  currentPage: _currentPage,  // Currently unused, but useful for potential future enhancements
  pageLabels,
  onNavigate,
  onClose,
}: HighlightsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<HighlightCategory | 'all'>('all');
  const [highlightToDelete, setHighlightToDelete] = useState<Highlight | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const deleteHighlight = useDeleteHighlight(noteId);

  // Sort highlights: PDFs by page number, EPUBs by creation date
  const sortedHighlights = useMemo(() => {
    return [...highlights].sort((a, b) => {
      if (a.type === 'pdf' && b.type === 'pdf') {
        return (a as PDFHighlight).page - (b as PDFHighlight).page;
      }
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [highlights]);

  // Filter highlights by search and category
  const filteredHighlights = useMemo(() => {
    return sortedHighlights.filter((highlight) => {
      // Category filter
      if (categoryFilter !== 'all' && (highlight.category || 'highlight') !== categoryFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesText = highlight.text.toLowerCase().includes(query);
        const matchesNote = highlight.note?.toLowerCase().includes(query);
        if (!matchesText && !matchesNote) {
          return false;
        }
      }
      return true;
    });
  }, [sortedHighlights, searchQuery, categoryFilter]);

  // Group highlights by page (for PDFs) or sequential order (for EPUBs)
  const groupedHighlights = useMemo(() => {
    const groups: { label: string; highlights: Highlight[] }[] = [];
    let currentGroup: { label: string; highlights: Highlight[] } | null = null;

    filteredHighlights.forEach((highlight) => {
      let groupLabel: string;
      if (highlight.type === 'pdf') {
        const pdfHighlight = highlight as PDFHighlight;
        const pageLabel = pdfHighlight.pageLabel || pageLabels?.[pdfHighlight.page - 1];
        groupLabel = pageLabel ? `Page ${pageLabel}` : `Page ${pdfHighlight.page}`;
      } else {
        // For EPUBs, group by creation date for better organization
        const date = new Date(highlight.createdAt);
        groupLabel = date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
        });
      }

      if (!currentGroup || currentGroup.label !== groupLabel) {
        currentGroup = { label: groupLabel, highlights: [] };
        groups.push(currentGroup);
      }
      currentGroup.highlights.push(highlight);
    });

    return groups;
  }, [filteredHighlights, pageLabels]);

  const handleDeleteHighlight = async () => {
    if (!highlightToDelete || deleteHighlight.isPending) return;
    try {
      await deleteHighlight.mutateAsync(highlightToDelete.id);
      showToast('Highlight deleted', 'success');
      setHighlightToDelete(null);
    } catch (error) {
      console.error('Failed to delete highlight:', error);
      showToast('Failed to delete highlight. Please try again.', 'error');
      setHighlightToDelete(null);
    }
  };

  const handleNavigate = (highlight: Highlight) => {
    if (highlight.type === 'pdf') {
      onNavigate((highlight as PDFHighlight).page, undefined, highlight.id);
    } else {
      onNavigate(undefined, (highlight as EPUBHighlight).cfi, highlight.id);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  const getCategoryColor = (category: HighlightCategory = 'highlight') => {
    return HIGHLIGHT_CATEGORIES[category]?.color || HIGHLIGHT_CATEGORIES.highlight.color;
  };

  const getCategoryLabel = (category: HighlightCategory = 'highlight') => {
    return HIGHLIGHT_CATEGORIES[category]?.label || 'Highlight';
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  };

  return (
    <div
      ref={panelRef}
      id="highlights-panel"
      className="w-72 bg-bg-surface border-r border-text-secondary/10 flex flex-col h-full"
      role="complementary"
      aria-label="Highlights panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-text-secondary/10">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text-primary">Highlights</h2>
          <span className="text-xs text-text-secondary bg-bg-deep px-1.5 py-0.5 rounded">
            {highlights.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
          aria-label="Close highlights panel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-text-secondary/10">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search highlights..."
            className="w-full h-8 pl-8 pr-3 text-sm bg-bg-deep border border-text-secondary/20 rounded text-text-primary focus:outline-none focus:border-accent-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Category filter pills with sliding indicator */}
      <CategoryFilterPills
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
      />

      {/* Highlights list */}
      <div className="flex-1 overflow-y-auto">
        {filteredHighlights.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-text-secondary/50 mb-3"
            >
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {highlights.length === 0 ? (
              <>
                <p className="text-sm text-text-secondary mb-1">No highlights yet</p>
                <p className="text-xs text-text-secondary/70">
                  Select text and press{' '}
                  <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-deep border border-text-secondary/20 rounded">
                    H
                  </kbd>{' '}
                  to highlight
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-text-secondary mb-1">No matching highlights</p>
                <p className="text-xs text-text-secondary/70">Try adjusting your search or filter</p>
              </>
            )}
          </div>
        ) : (
          <div className="py-2">
            {groupedHighlights.map((group, groupIndex) => (
              <div key={groupIndex}>
                {/* Sticky group header */}
                <div className="sticky top-0 px-4 py-1.5 text-xs font-medium text-text-secondary bg-bg-surface/95 backdrop-blur-sm border-b border-text-secondary/5">
                  {group.label}
                </div>
                {/* Highlights in group */}
                <ul role="list">
                  {group.highlights.map((highlight) => (
                    <li key={highlight.id}>
                      <div className="group flex items-start gap-2 px-4 py-2.5 hover:bg-bg-deep transition-colors">
                        <button
                          onClick={() => handleNavigate(highlight)}
                          className="flex-1 text-left min-w-0"
                        >
                          {/* Category indicator + text */}
                          <div className="flex items-start gap-2">
                            <div
                              className="w-3 h-3 rounded-sm flex-shrink-0 mt-0.5"
                              style={{ backgroundColor: getCategoryColor(highlight.category) }}
                              title={getCategoryLabel(highlight.category)}
                            />
                            <span className="text-sm text-text-primary leading-snug">
                              {truncateText(highlight.text)}
                            </span>
                          </div>
                          {/* Note preview */}
                          {highlight.note && (
                            <div className="flex items-center gap-1.5 mt-1 ml-5">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className="text-accent-primary flex-shrink-0"
                              >
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <path d="M14 2v6h6M16 13H8M16 17H8" />
                              </svg>
                              <span className="text-xs text-text-secondary truncate">
                                {truncateText(highlight.note, 50)}
                              </span>
                            </div>
                          )}
                          {/* Metadata row */}
                          <div className="flex items-center gap-2 mt-1 ml-5">
                            <span className="text-xs text-text-secondary/70">
                              {formatDate(highlight.createdAt)}
                            </span>
                          </div>
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={() => setHighlightToDelete(highlight)}
                          className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-text-secondary hover:text-red-500 transition-all"
                          aria-label={`Delete highlight: ${truncateText(highlight.text, 30)}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with count and export */}
      {filteredHighlights.length > 0 && (
        <div className="px-4 py-2 border-t border-text-secondary/10 bg-bg-deep/50 flex items-center justify-between">
          <span className="text-xs text-text-secondary">
            {filteredHighlights.length} highlight{filteredHighlights.length !== 1 ? 's' : ''}
            {filteredHighlights.length !== highlights.length && ` (of ${highlights.length})`}
          </span>
        </div>
      )}

      <ConfirmDialog
        isOpen={highlightToDelete !== null}
        title="Delete Highlight"
        message={`Are you sure you want to delete this highlight? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteHighlight}
        onCancel={() => setHighlightToDelete(null)}
      />
    </div>
  );
}

// Sliding indicator component for category filters
interface CategoryFilterPillsProps {
  categoryFilter: HighlightCategory | 'all';
  onCategoryChange: (category: HighlightCategory | 'all') => void;
}

function CategoryFilterPills({ categoryFilter, onCategoryChange }: CategoryFilterPillsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const setButtonRef = useCallback((id: string) => (el: HTMLButtonElement | null) => {
    if (el) {
      buttonRefs.current.set(id, el);
    } else {
      buttonRefs.current.delete(id);
    }
  }, []);

  // Update indicator position when category changes
  useEffect(() => {
    const activeButton = buttonRefs.current.get(categoryFilter);
    const container = containerRef.current;
    if (activeButton && container) {
      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      setIndicatorStyle({
        left: buttonRect.left - containerRect.left + container.scrollLeft,
        width: buttonRect.width,
      });
    }
  }, [categoryFilter]);

  // Also update on mount and resize
  useEffect(() => {
    const updateIndicator = () => {
      const activeButton = buttonRefs.current.get(categoryFilter);
      const container = containerRef.current;
      if (activeButton && container) {
        const containerRect = container.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        setIndicatorStyle({
          left: buttonRect.left - containerRect.left + container.scrollLeft,
          width: buttonRect.width,
        });
      }
    };

    // Initial position after render
    requestAnimationFrame(updateIndicator);

    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [categoryFilter]);

  return (
    <div className="px-4 py-2 border-b border-text-secondary/10 overflow-x-auto scrollbar-thin">
      <div ref={containerRef} className="flex gap-1.5 pb-0.5 relative">
        {/* Sliding indicator */}
        <div
          className="absolute top-0 h-full rounded-full bg-accent-primary/20 transition-all duration-200 ease-out pointer-events-none"
          style={{
            left: indicatorStyle.left,
            width: indicatorStyle.width,
            opacity: indicatorStyle.width > 0 ? 1 : 0,
          }}
        />
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat.id}
            ref={setButtonRef(cat.id)}
            onClick={() => onCategoryChange(cat.id)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors relative z-10 ${
              categoryFilter === cat.id
                ? 'text-accent-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
