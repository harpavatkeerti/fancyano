'use client';

import { useState, useCallback } from 'react';
import { ConfirmDialog, ConfirmDialogOptions } from '@/components/common/ConfirmDialog';

export function useConfirm() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions | null>(null);
  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions({
        ...opts,
        onConfirm: () => {
          opts.onConfirm();
          resolve(true);
          setIsOpen(false);
        },
        onCancel: () => {
          if (opts.onCancel) opts.onCancel();
          resolve(false);
          setIsOpen(false);
        },
      });
      setIsOpen(true);
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
  }, [resolvePromise]);

  const ConfirmDialogComponent = options ? (
    <ConfirmDialog
      isOpen={isOpen}
      {...options}
      onClose={handleClose}
    />
  ) : null;

  return { confirm, ConfirmDialog: ConfirmDialogComponent };
}

