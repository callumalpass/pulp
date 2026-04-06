import { useCallback, useState, type MutableRefObject } from 'react';
import type { Contents } from 'epubjs';

export interface EpubSelection {
  text: string;
  page: number;
  position: { x: number; y: number };
  cfi: string;
}

interface UseEpubSelectionArgs {
  isTouchDevice: boolean;
  currentPage: number;
  touchSelectionEnabledRef: MutableRefObject<boolean>;
  registeredContentsRef: MutableRefObject<Set<Contents>>;
}

export function useEpubSelection({
  isTouchDevice,
  currentPage,
  touchSelectionEnabledRef,
  registeredContentsRef,
}: UseEpubSelectionArgs) {
  const [selection, setSelection] = useState<EpubSelection | null>(null);
  const [pendingMobileSelection, setPendingMobileSelection] = useState<EpubSelection | null>(null);

  const clearNativeSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    for (const contents of registeredContentsRef.current) {
      contents.window.getSelection()?.removeAllRanges();
    }
  }, [registeredContentsRef]);

  const clearSelection = useCallback((options?: { clearNativeSelection?: boolean; dismissOnly?: boolean }) => {
    if (options?.dismissOnly) {
      if (isTouchDevice) {
        setPendingMobileSelection(selection);
      }
      setSelection(null);
      return;
    }

    if (options?.clearNativeSelection !== false) {
      clearNativeSelection();
    }
    setSelection(null);
    setPendingMobileSelection(null);
  }, [clearNativeSelection, isTouchDevice, selection]);

  const openPendingMobileSelection = useCallback(() => {
    if (!pendingMobileSelection) return;
    setSelection(pendingMobileSelection);
    setPendingMobileSelection(null);
  }, [pendingMobileSelection]);

  const showSelection = useCallback((nextSelection: EpubSelection | null) => {
    setSelection(nextSelection);
    if (isTouchDevice) {
      setPendingMobileSelection(null);
    }
  }, [isTouchDevice]);

  const armSelection = useCallback((nextSelection: EpubSelection | null) => {
    if (isTouchDevice) {
      setSelection(null);
      setPendingMobileSelection(nextSelection);
      return;
    }

    setSelection(nextSelection);
    setPendingMobileSelection(null);
  }, [isTouchDevice]);

  const handleSelected = useCallback((cfiRange: string, contents: Contents) => {
    if (isTouchDevice && !touchSelectionEnabledRef.current) {
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

    const nextSelection = {
      text,
      page: currentPage,
      position: {
        x: iframeRect.left + rect.left + rect.width / 2,
        y: iframeRect.top + rect.bottom + 10,
      },
      cfi: cfiRange,
    };

    if (isTouchDevice) {
      armSelection(nextSelection);
    } else {
      showSelection(nextSelection);
    }
  }, [armSelection, currentPage, isTouchDevice, showSelection, touchSelectionEnabledRef]);

  return {
    selection,
    pendingMobileSelection,
    setSelection,
    showSelection,
    armSelection,
    clearSelection,
    clearNativeSelection,
    openPendingMobileSelection,
    handleSelected,
  };
}
