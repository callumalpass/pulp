import { useState, useEffect, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useReaderStore } from '../../../stores/reader';
import { useMobile } from '../../../hooks/useMobile';

interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineItem[];
}

interface PDFTableOfContentsProps {
  pdfDoc: PDFDocumentProxy | null;
  pageLabels?: string[] | null;
  onClose: () => void;
}

interface TOCItemProps {
  item: OutlineItem;
  level: number;
  currentPage: number;
  pageLabel?: string;
  onNavigate: (dest: string | unknown[] | null) => void;
}

interface TOCItemWithLabelsProps extends TOCItemProps {
  pageLabels?: string[] | null;
  outlinePageNumbers: Map<string, number>;
  prefix: string;
  isMobile?: boolean;
}

function TOCItemWithLabels({ item, level, currentPage, pageLabel, pageLabels, outlinePageNumbers, prefix, onNavigate, isMobile }: TOCItemWithLabelsProps) {
  const [expanded, setExpanded] = useState(level === 0);
  const hasChildren = item.items && item.items.length > 0;

  return (
    <div className="toc-item">
      <div
        className={`toc-item-row flex items-center gap-1 rounded cursor-pointer hover:bg-bg-deep transition-smooth ${
          level === 0 ? 'font-medium' : ''
        } ${isMobile ? 'min-h-[44px] py-2 px-3' : 'py-1.5 px-2'}`}
        style={{ paddingLeft: `${level * 16 + (isMobile ? 12 : 8)}px` }}
        onClick={() => onNavigate(item.dest)}
      >
        {hasChildren && (
          <button
            className={`flex items-center justify-center text-text-secondary hover:text-text-primary ${isMobile ? 'w-8 h-8' : 'w-4 h-4'}`}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <svg
              width={isMobile ? 16 : 12}
              height={isMobile ? 16 : 12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
        {!hasChildren && <span className={isMobile ? 'w-8' : 'w-4'} />}
        <span className={`text-text-primary truncate flex-1 ${isMobile ? 'text-base' : 'text-sm'}`}>{item.title}</span>
        {pageLabel && (
          <span className={`text-text-secondary ml-2 shrink-0 ${isMobile ? 'text-sm' : 'text-xs'}`}>{pageLabel}</span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="toc-children">
          {item.items.map((child, index) => {
            const childKey = `${prefix}-${index}`;
            const childPageNum = outlinePageNumbers.get(childKey);
            const childPageLabel = childPageNum && pageLabels ? pageLabels[childPageNum - 1] : undefined;
            return (
              <TOCItemWithLabels
                key={index}
                item={child}
                level={level + 1}
                currentPage={currentPage}
                pageLabel={childPageLabel}
                pageLabels={pageLabels}
                outlinePageNumbers={outlinePageNumbers}
                prefix={childKey}
                onNavigate={onNavigate}
                isMobile={isMobile}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PDFTableOfContents({ pdfDoc, pageLabels, onClose }: PDFTableOfContentsProps) {
  const isMobile = useMobile();
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [outlinePageNumbers, setOutlinePageNumbers] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const { currentPage, setScrollToPage } = useReaderStore();

  useEffect(() => {
    if (!pdfDoc) return;

    const loadOutline = async () => {
      try {
        setLoading(true);
        const pdfOutline = await pdfDoc.getOutline();
        setOutline(pdfOutline as OutlineItem[] | null);

        // Resolve page numbers for all outline items
        if (pdfOutline) {
          const pageNumbers = new Map<string, number>();
          const resolvePageNumbers = async (items: OutlineItem[], prefix: string = '') => {
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const key = `${prefix}${i}`;
              if (item.dest) {
                try {
                  let pageIndex: number;
                  if (typeof item.dest === 'string') {
                    const destination = await pdfDoc.getDestination(item.dest);
                    if (destination) {
                      const ref = destination[0] as Parameters<typeof pdfDoc.getPageIndex>[0];
                      pageIndex = await pdfDoc.getPageIndex(ref);
                      pageNumbers.set(key, pageIndex + 1);
                    }
                  } else if (Array.isArray(item.dest)) {
                    const ref = item.dest[0] as Parameters<typeof pdfDoc.getPageIndex>[0];
                    pageIndex = await pdfDoc.getPageIndex(ref);
                    pageNumbers.set(key, pageIndex + 1);
                  }
                } catch {
                  // Skip items with invalid destinations
                }
              }
              if (item.items && item.items.length > 0) {
                await resolvePageNumbers(item.items, `${key}-`);
              }
            }
          };
          await resolvePageNumbers(pdfOutline as OutlineItem[]);
          setOutlinePageNumbers(pageNumbers);
        }
      } catch (error) {
        console.error('Failed to load PDF outline:', error);
        setOutline(null);
      } finally {
        setLoading(false);
      }
    };

    loadOutline();
  }, [pdfDoc]);

  const handleNavigate = useCallback(async (dest: string | unknown[] | null) => {
    if (!pdfDoc || !dest) return;

    try {
      let pageIndex: number;

      if (typeof dest === 'string') {
        // Named destination
        const destination = await pdfDoc.getDestination(dest);
        if (!destination) return;
        const ref = destination[0] as Parameters<typeof pdfDoc.getPageIndex>[0];
        pageIndex = await pdfDoc.getPageIndex(ref);
      } else if (Array.isArray(dest)) {
        // Explicit destination
        const ref = dest[0] as Parameters<typeof pdfDoc.getPageIndex>[0];
        pageIndex = await pdfDoc.getPageIndex(ref);
      } else {
        return;
      }

      // Page numbers are 1-indexed in the UI
      setScrollToPage(pageIndex + 1);

      // Close TOC on mobile after navigation
      if (isMobile) {
        onClose();
      }
    } catch (error) {
      console.error('Failed to navigate to destination:', error);
    }
  }, [pdfDoc, setScrollToPage, isMobile, onClose]);

  const tocContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : outline && outline.length > 0 ? (
        <div className="toc-tree">
          {outline.map((item, index) => {
            const pageNum = outlinePageNumbers.get(String(index));
            const pageLabel = pageNum && pageLabels ? pageLabels[pageNum - 1] : undefined;
            return (
              <TOCItemWithLabels
                key={index}
                item={item}
                level={0}
                currentPage={currentPage}
                pageLabel={pageLabel}
                pageLabels={pageLabels}
                outlinePageNumbers={outlinePageNumbers}
                prefix={String(index)}
                onNavigate={handleNavigate}
                isMobile={isMobile}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-text-secondary text-sm">
          No table of contents available
        </div>
      )}
    </>
  );

  // Mobile: Full-screen modal
  if (isMobile) {
    return (
      <div className="mobile-fullscreen-modal animate-slide-in-left">
        <div className="h-14 flex items-center justify-between px-4 border-b border-text-secondary/10 shrink-0">
          <h3 className="text-base font-semibold text-text-primary">Table of Contents</h3>
          <button
            onClick={onClose}
            className="touch-target rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-smooth"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {tocContent}
        </div>
      </div>
    );
  }

  // Desktop: Sidebar
  return (
    <div className="pdf-toc-sidebar">
      <div className="toc-header flex items-center justify-between p-3 border-b border-text-secondary/10">
        <h3 className="text-sm font-semibold text-text-primary">Table of Contents</h3>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-smooth"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="toc-content overflow-y-auto flex-1 p-2">
        {tocContent}
      </div>
    </div>
  );
}
