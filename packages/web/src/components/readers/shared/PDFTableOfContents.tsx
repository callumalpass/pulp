import { useState, useEffect, useCallback } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useReaderStore } from '../../../stores/reader';

interface OutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineItem[];
}

interface PDFTableOfContentsProps {
  pdfDoc: PDFDocumentProxy | null;
  onClose: () => void;
}

interface TOCItemProps {
  item: OutlineItem;
  level: number;
  currentPage: number;
  onNavigate: (dest: string | unknown[] | null) => void;
}

function TOCItem({ item, level, currentPage, onNavigate }: TOCItemProps) {
  const [expanded, setExpanded] = useState(level === 0);
  const hasChildren = item.items && item.items.length > 0;

  return (
    <div className="toc-item">
      <div
        className={`toc-item-row flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer hover:bg-bg-deep transition-stoody ${
          level === 0 ? 'font-medium' : ''
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onNavigate(item.dest)}
      >
        {hasChildren && (
          <button
            className="w-4 h-4 flex items-center justify-center text-text-secondary hover:text-text-primary"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <svg
              width="12"
              height="12"
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
        {!hasChildren && <span className="w-4" />}
        <span className="text-sm text-text-primary truncate flex-1">{item.title}</span>
      </div>
      {hasChildren && expanded && (
        <div className="toc-children">
          {item.items.map((child, index) => (
            <TOCItem
              key={index}
              item={child}
              level={level + 1}
              currentPage={currentPage}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PDFTableOfContents({ pdfDoc, onClose }: PDFTableOfContentsProps) {
  const [outline, setOutline] = useState<OutlineItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentPage, setScrollToPage } = useReaderStore();

  useEffect(() => {
    if (!pdfDoc) return;

    const loadOutline = async () => {
      try {
        setLoading(true);
        const pdfOutline = await pdfDoc.getOutline();
        setOutline(pdfOutline as OutlineItem[] | null);
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
    } catch (error) {
      console.error('Failed to navigate to destination:', error);
    }
  }, [pdfDoc, setScrollToPage]);

  return (
    <div className="pdf-toc-sidebar">
      <div className="toc-header flex items-center justify-between p-3 border-b border-text-secondary/10">
        <h3 className="text-sm font-semibold text-text-primary">Table of Contents</h3>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-stoody"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="toc-content overflow-y-auto flex-1 p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : outline && outline.length > 0 ? (
          <div className="toc-tree">
            {outline.map((item, index) => (
              <TOCItem
                key={index}
                item={item}
                level={0}
                currentPage={currentPage}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-text-secondary text-sm">
            No table of contents available
          </div>
        )}
      </div>
    </div>
  );
}
