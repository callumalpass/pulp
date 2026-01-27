import { useEffect, useState } from 'react';
import { clsx } from 'clsx';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'error';
  duration?: number;
  onClose: () => void;
}

function ToastIcon({ type }: { type: 'info' | 'success' | 'error' }) {
  const iconClass = 'w-5 h-5 flex-shrink-0';

  if (type === 'success') {
    return (
      <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    );
  }

  if (type === 'error') {
    return (
      <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
      </svg>
    );
  }

  return (
    <svg className={iconClass} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  );
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    const timer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={clsx(
        'relative flex items-center gap-3 pl-4 pr-4 py-3 rounded-xl border backdrop-blur-sm',
        'transition-all duration-300 ease-out overflow-hidden',
        {
          'bg-bg-surface/95 text-text-primary border-text-secondary/20': type === 'info',
          'bg-emerald-500/15 text-emerald-400 border-emerald-500/30': type === 'success',
          'bg-red-500/15 text-red-400 border-red-500/30': type === 'error',
        },
        isVisible && !isLeaving
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-4'
      )}
      role="alert"
    >
      <ToastIcon type={type} />
      <span className="text-sm font-medium">{message}</span>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-current/10 overflow-hidden">
        <div
          className={clsx(
            'h-full bg-current/40 origin-left',
            isVisible && !isLeaving && 'animate-toast-progress'
          )}
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
}

// Toast manager hook
interface ToastItem {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error';
}

let toastId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const remove = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const ToastContainer = () => (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => remove(toast.id)}
        />
      ))}
    </>
  );

  return { show, ToastContainer };
}
