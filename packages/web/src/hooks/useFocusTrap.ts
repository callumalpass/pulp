import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_ELEMENTS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'a[href]',
].join(', ');

/**
 * Hook that traps focus within a container element.
 * Useful for modal dialogs and popups to maintain accessibility.
 *
 * @param isActive - Whether the focus trap is active
 * @param onEscape - Optional callback when Escape is pressed
 * @returns A ref to attach to the container element
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  isActive: boolean,
  onEscape?: () => void
) {
  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle Tab key for focus trapping
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isActive || !containerRef.current) return;

      if (e.key === 'Escape' && onEscape) {
        e.preventDefault();
        onEscape();
        return;
      }

      if (e.key !== 'Tab') return;

      const focusableElements = containerRef.current.querySelectorAll(FOCUSABLE_ELEMENTS);
      const focusableArray = Array.from(focusableElements) as HTMLElement[];

      if (focusableArray.length === 0) return;

      const firstElement = focusableArray[0];
      const lastElement = focusableArray[focusableArray.length - 1];

      // Shift+Tab on first element -> focus last element
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
        return;
      }

      // Tab on last element -> focus first element
      if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
        return;
      }

      // If focus is not within container, move it to first element
      if (!containerRef.current.contains(document.activeElement)) {
        e.preventDefault();
        firstElement.focus();
      }
    },
    [isActive, onEscape]
  );

  // Store previous active element and set up focus trap
  useEffect(() => {
    if (!isActive) return;

    // Store the previously focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Focus the first focusable element in the container
    const container = containerRef.current;
    if (container) {
      const focusableElements = container.querySelectorAll(FOCUSABLE_ELEMENTS);
      const firstElement = focusableElements[0] as HTMLElement | undefined;
      if (firstElement) {
        // Use setTimeout to allow the DOM to stabilize
        setTimeout(() => firstElement.focus(), 0);
      }
    }

    // Add keydown listener
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Restore focus to the previously focused element
      if (previousActiveElement.current && previousActiveElement.current.focus) {
        previousActiveElement.current.focus();
      }
    };
  }, [isActive, handleKeyDown]);

  return containerRef;
}
