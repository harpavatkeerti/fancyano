import { ConfirmDialogOptions } from '@/components/common/ConfirmDialog';

let confirmDialogElement: HTMLElement | null = null;
let resolvePromise: ((value: boolean) => void) | null = null;

export function setupConfirmDialog(element: HTMLElement) {
  confirmDialogElement = element;
}

export function confirm(options: string | ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    resolvePromise = resolve;
    
    // If string is provided, convert to options
    const dialogOptions: ConfirmDialogOptions = typeof options === 'string' 
      ? { message: options, onConfirm: () => resolve(true), onCancel: () => resolve(false) }
      : {
          ...options,
          onConfirm: () => {
            options.onConfirm();
            resolve(true);
          },
          onCancel: () => {
            if (options.onCancel) options.onCancel();
            resolve(false);
          },
        };

    // Dispatch custom event to show dialog
    window.dispatchEvent(new CustomEvent('showConfirmDialog', { detail: dialogOptions }));
  });
}

// Helper function for simple confirmations
export function confirmAction(message: string, title?: string): Promise<boolean> {
  return confirm({
    title: title || 'Confirm Action',
    message,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
    onCancel: () => {},
  });
}

