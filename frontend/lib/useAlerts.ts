'use client';

import { useState, useCallback, useRef } from 'react';

export type AlertType = 'error' | 'warning' | 'info';

export interface Alert {
  id: string;
  message: string;
  type: AlertType;
  timestamp: number;
}

let alertIdCounter = 0;

/**
 * Hook for managing inline alert banners within forms, modals, and page sections.
 *
 * Usage:
 *   const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();
 *
 *   // Instead of toast.error('msg'):
 *   addAlert('msg', 'error');
 *
 *   // Clear on successful submission:
 *   clearAlerts();
 */
export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alertsRef = useRef<Alert[]>([]);

  // Keep ref in sync so addAlert closures always see the latest state
  alertsRef.current = alerts;

  const addAlert = useCallback((message: string, type: AlertType = 'error') => {
    // Deduplicate: don't add if the exact same message + type already exists
    const isDuplicate = alertsRef.current.some(
      (a) => a.message === message && a.type === type
    );
    if (isDuplicate) return;

    const newAlert: Alert = {
      id: `alert-${++alertIdCounter}`,
      message,
      type,
      timestamp: Date.now(),
    };
    setAlerts((prev) => [...prev, newAlert]);
  }, []);

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return { alerts, addAlert, removeAlert, clearAlerts };
}
