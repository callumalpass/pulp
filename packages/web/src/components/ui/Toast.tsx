import { useEffect, useState } from 'react';
import { clsx } from 'clsx';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'error';
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={clsx(
        'fixed bottom-4 right-4 px-4 py-3 rounded-md shadow-lg transition-stoody z-50',
        {
          'bg-bg-surface text-text-primary': type === 'info',
          'bg-accent-secondary/20 text-accent-secondary': type === 'success',
          'bg-red-500/20 text-red-400': type === 'error',
        },
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}
    >
      {message}
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
