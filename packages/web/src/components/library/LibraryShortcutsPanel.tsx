import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface LibraryShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const LIBRARY_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Search & Filter',
    shortcuts: [
      { keys: ['/'], description: 'Focus search' },
      { keys: ['Escape'], description: 'Clear search / close panel' },
    ],
  },
  {
    title: 'Book Actions',
    shortcuts: [
      { keys: ['i'], description: 'Show metadata (when card focused)' },
      { keys: ['Enter'], description: 'Open book (when card focused)' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['c'], description: 'Continue reading current book' },
    ],
  },
  {
    title: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
];

export function LibraryShortcutsPanel({ isOpen, onClose }: LibraryShortcutsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape or ?
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-shortcuts-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-bg-surface border border-text-secondary/20 rounded-xl max-w-md w-full mx-4 overflow-hidden focus:outline-none keyboard-shortcuts-panel-enter"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-text-secondary/10">
          <h2 id="library-shortcuts-title" className="text-lg font-semibold text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-5">
            {LIBRARY_SHORTCUTS.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-medium text-text-secondary uppercase tracking-wider mb-2.5">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-text-primary">{shortcut.description}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center">
                            {keyIndex > 0 && (
                              <span className="text-text-secondary text-xs mx-0.5">+</span>
                            )}
                            <kbd className="px-2 py-1 text-xs font-mono bg-bg-deep border border-text-secondary/20 rounded text-text-primary min-w-[1.75rem] text-center">
                              {key}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-text-secondary/10 bg-bg-deep/50">
          <p className="text-xs text-text-secondary text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-surface border border-text-secondary/20 rounded">?</kbd> or <kbd className="px-1.5 py-0.5 text-xs font-mono bg-bg-surface border border-text-secondary/20 rounded">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
