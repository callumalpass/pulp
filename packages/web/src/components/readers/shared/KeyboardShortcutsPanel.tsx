import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

interface KeyboardShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  readerType: 'pdf' | 'epub';
}

const PDF_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['←', 'PageUp'], description: 'Previous page' },
      { keys: ['→', 'PageDown'], description: 'Next page' },
      { keys: ['Home'], description: 'First page' },
      { keys: ['End'], description: 'Last page' },
      { keys: ['G'], description: 'Go to page (focus page input)' },
    ],
  },
  {
    title: 'Zoom',
    shortcuts: [
      { keys: ['+', '='], description: 'Zoom in' },
      { keys: ['-'], description: 'Zoom out' },
      { keys: ['0'], description: 'Reset zoom (fit width)' },
    ],
  },
  {
    title: 'Search',
    shortcuts: [
      { keys: ['Ctrl', 'F'], description: 'Open search' },
      { keys: ['Enter'], description: 'Next match' },
      { keys: ['Shift', 'Enter'], description: 'Previous match' },
      { keys: ['Escape'], description: 'Close search' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: ['T'], description: 'Toggle table of contents' },
      { keys: ['Ctrl', 'E'], description: 'Toggle notes panel' },
      { keys: ['B'], description: 'Toggle bookmarks panel' },
      { keys: ['S'], description: 'Toggle reading statistics' },
      { keys: ['R'], description: 'Toggle reading goals' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'View Modes',
    shortcuts: [
      { keys: ['D'], description: 'Toggle dark mode' },
      { keys: ['F'], description: 'Enter fullscreen/presentation' },
    ],
  },
];

const EPUB_SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['←', 'PageUp'], description: 'Previous page/section' },
      { keys: ['→', 'PageDown'], description: 'Next page/section' },
      { keys: ['Home'], description: 'Beginning of book' },
      { keys: ['End'], description: 'End of book' },
    ],
  },
  {
    title: 'Font Size',
    shortcuts: [
      { keys: ['+', '='], description: 'Increase font size' },
      { keys: ['-'], description: 'Decrease font size' },
    ],
  },
  {
    title: 'Search',
    shortcuts: [
      { keys: ['Ctrl', 'F'], description: 'Open search' },
      { keys: ['Escape'], description: 'Close search' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: ['T'], description: 'Toggle table of contents' },
      { keys: ['Ctrl', 'E'], description: 'Toggle notes panel' },
      { keys: ['B'], description: 'Toggle bookmarks panel' },
      { keys: ['S'], description: 'Toggle reading statistics' },
      { keys: ['R'], description: 'Toggle reading goals' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: ['D'], description: 'Toggle dark mode' },
      { keys: ['H'], description: 'Toggle header/UI visibility' },
    ],
  },
];

export function KeyboardShortcutsPanel({ isOpen, onClose, readerType }: KeyboardShortcutsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const shortcuts = readerType === 'pdf' ? PDF_SHORTCUTS : EPUB_SHORTCUTS;

  // Close on Escape
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
      aria-labelledby="shortcuts-title"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-bg-surface border border-text-secondary/20 rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden focus:outline-none keyboard-shortcuts-panel-enter"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-text-secondary/10">
          <h2 id="shortcuts-title" className="text-lg font-semibold text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-deep transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-5rem)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shortcuts.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div key={index} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-text-primary">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center">
                            {keyIndex > 0 && (
                              <span className="text-text-secondary text-xs mx-0.5">+</span>
                            )}
                            <kbd className="px-2 py-1 text-xs font-mono bg-bg-deep border border-text-secondary/20 rounded text-text-primary min-w-[1.5rem] text-center">
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
