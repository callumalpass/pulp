import { useCallback, useState, type MutableRefObject } from 'react';
import type { Contents } from 'epubjs';

export interface EpubSelection {
  text: string;
  page: number;
  position: { x: number; y: number };
  cfi: string;
}

interface UseEpubSelectionArgs {
  isMobile: boolean;
  currentPage: number;
  touchSelectionEnabledRef: MutableRefObject<boolean>;
}

export function useEpubSelection({
  isMobile,
  currentPage,
  touchSelectionEnabledRef,
}: UseEpubSelectionArgs) {
  const [selection, setSelection] = useState<EpubSelection | null>(null);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  const handleSelected = useCallback((cfiRange: string, contents: Contents) => {
    if (isMobile && !touchSelectionEnabledRef.current) {
      contents.window.getSelection()?.removeAllRanges();
      return;
    }

    const sel = contents.window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const iframe = contents.document.defaultView?.frameElement as HTMLIFrameElement | null;
    const iframeRect = iframe?.getBoundingClientRect();

    if (!iframeRect) return;

    setSelection({
      text,
      page: currentPage,
      position: {
        x: iframeRect.left + rect.left + rect.width / 2,
        y: iframeRect.top + rect.bottom + 10,
      },
      cfi: cfiRange,
    });
  }, [currentPage, isMobile, touchSelectionEnabledRef]);

  return {
    selection,
    setSelection,
    clearSelection,
    handleSelected,
  };
}
