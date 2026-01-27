import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  // Track whether the dialog should be rendered (stays true during exit animation)
  const [isRendered, setIsRendered] = useState(false);
  // Track whether we're in the closing phase
  const [isClosing, setIsClosing] = useState(false);

  // Handle open/close transitions
  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      setIsClosing(false);
    } else if (isRendered) {
      // Start exit animation
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsRendered(false);
        setIsClosing(false);
      }, 150); // Match exit animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap onCancel to trigger exit animation
  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Focus trap and escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Delay focus slightly to allow enter animation to start
    const focusTimer = setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [isOpen, handleCancel]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (isRendered) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isRendered]);

  if (!isRendered) return null;

  const variantStyles = {
    danger: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-accent-primary',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
          isClosing ? 'confirm-dialog-backdrop-exit' : 'confirm-dialog-backdrop-enter'
        }`}
        onClick={handleCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className={`relative bg-bg-surface rounded-xl border border-text-secondary/20 w-full max-w-sm p-5 ${
          isClosing ? 'confirm-dialog-panel-exit' : 'confirm-dialog-panel-enter'
        }`}
      >
        <h2
          id="confirm-dialog-title"
          className={`text-lg font-semibold mb-2 ${variantStyles[variant]}`}
        >
          {title}
        </h2>
        <p className="text-sm text-text-secondary mb-5">{message}</p>

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" size="sm" onClick={handleCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmButtonRef}
            variant={variant === 'danger' ? 'primary' : 'primary'}
            size="sm"
            onClick={onConfirm}
            className={variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : ''}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
