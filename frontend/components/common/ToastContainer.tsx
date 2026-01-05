'use client';

import { useState, useCallback, useEffect } from 'react';
import { Toast, ToastType } from './Toast';

interface ToastContainerProps {
  children: React.ReactNode;
}

let toastIdCounter = 0;
const toastListeners: Array<(toast: Toast) => void> = [];

export function showToast(message: string, type: ToastType = 'info', duration?: number) {
  const toast: Toast = {
    id: `toast-${++toastIdCounter}`,
    message,
    type,
    duration,
  };
  toastListeners.forEach(listener => listener(toast));
}

export function ToastContainer({ children }: ToastContainerProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Toast) => {
    setToasts(prev => [...prev, toast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Register listener on mount
  useEffect(() => {
    toastListeners.push(addToast);
    return () => {
      const index = toastListeners.indexOf(addToast);
      if (index > -1) {
        toastListeners.splice(index, 1);
      }
    };
  }, [addToast]);

  return (
    <>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onClose={removeToast} />
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

