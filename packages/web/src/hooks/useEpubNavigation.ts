import { useCallback, type MutableRefObject, type RefObject } from 'react';
import type { Rendition } from 'epubjs';

interface UseEpubNavigationArgs {
  locations: string[];
  totalPages: number;
  renditionRef: RefObject<Rendition | null>;
  pendingNavigationTargetRef: MutableRefObject<string | null>;
  setTocOpen: (open: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const CHAPTER_NAVIGATION_PENDING_TIMEOUT_MS = 2000;

export function useEpubNavigation({
  locations,
  totalPages,
  renditionRef,
  pendingNavigationTargetRef,
  setTocOpen,
  showToast,
}: UseEpubNavigationArgs) {
  const goToPage = useCallback((page: number) => {
    if (!renditionRef.current || locations.length === 0) return;
    const newPage = Math.max(1, Math.min(totalPages, page));
    const cfi = locations[newPage - 1];
    if (cfi) {
      renditionRef.current.display(cfi);
    }
  }, [locations, renditionRef, totalPages]);

  const goToChapter = useCallback(async (href: string) => {
    const targetHref = href?.trim();
    if (!renditionRef.current || !targetHref) return;

    pendingNavigationTargetRef.current = targetHref;

    try {
      await renditionRef.current.display(targetHref);
      setTocOpen(false);
      window.setTimeout(() => {
        if (pendingNavigationTargetRef.current === targetHref) {
          pendingNavigationTargetRef.current = null;
        }
      }, CHAPTER_NAVIGATION_PENDING_TIMEOUT_MS);
    } catch (error) {
      pendingNavigationTargetRef.current = null;
      console.error('Failed to navigate to chapter:', error);
      showToast('Failed to navigate to chapter', 'error');
    }
  }, [pendingNavigationTargetRef, renditionRef, setTocOpen, showToast]);

  return {
    goToPage,
    goToChapter,
  };
}
