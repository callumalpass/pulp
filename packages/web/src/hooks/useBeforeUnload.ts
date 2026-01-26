import { useEffect, useCallback, useRef } from 'react';

interface BeforeUnloadOptions {
  /** Function to call when the page is about to unload */
  onBeforeUnload: () => void;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: () => boolean;
  /** Optional message to show in the browser prompt (most browsers ignore custom messages) */
  message?: string;
}

/**
 * Hook to handle the beforeunload event and save pending changes.
 *
 * This ensures reading progress and session data are saved when:
 * - User closes the tab/window
 * - User navigates away to another site
 * - User refreshes the page
 */
export function useBeforeUnload({
  onBeforeUnload,
  hasUnsavedChanges,
  message = 'You have unsaved changes. Are you sure you want to leave?',
}: BeforeUnloadOptions): void {
  // Use refs to avoid stale closure issues
  const onBeforeUnloadRef = useRef(onBeforeUnload);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);

  // Keep refs updated
  useEffect(() => {
    onBeforeUnloadRef.current = onBeforeUnload;
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [onBeforeUnload, hasUnsavedChanges]);

  const handleBeforeUnload = useCallback((event: BeforeUnloadEvent) => {
    // Always try to save
    onBeforeUnloadRef.current();

    // Only show confirmation dialog if there are unsaved changes
    if (hasUnsavedChangesRef.current()) {
      event.preventDefault();
      // Most modern browsers ignore custom messages and show their own
      event.returnValue = message;
      return message;
    }
  }, [message]);

  // Handle page visibility change (for mobile browsers that don't fire beforeunload)
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'hidden') {
      // Page is being hidden (tab switch, minimize, close on mobile)
      onBeforeUnloadRef.current();
    }
  }, []);

  // Handle page hide (better support on mobile)
  const handlePageHide = useCallback((event: PageTransitionEvent) => {
    // Save on page hide
    onBeforeUnloadRef.current();

    // If the page is being persisted in bfcache (back-forward cache),
    // we need to ensure data is saved
    if (event.persisted) {
      // Page is being cached, still save
      onBeforeUnloadRef.current();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [handleBeforeUnload, handleVisibilityChange, handlePageHide]);
}

/**
 * Hook to trigger save on Ctrl+S / Cmd+S keyboard shortcut.
 */
export function useSaveShortcut(onSave: () => void): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        onSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSave]);
}
