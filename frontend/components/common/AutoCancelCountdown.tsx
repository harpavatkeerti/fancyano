'use client';

import { useState, useEffect } from 'react';
import { getAutoCancelTimeRemaining } from '@/lib/bookingHelpers';

interface AutoCancelCountdownProps {
  createdAt: string;
  paidAmount: number;
  onExpired?: () => void;
}

export function AutoCancelCountdown({ createdAt, paidAmount, onExpired }: AutoCancelCountdownProps) {
  const [timeRemaining, setTimeRemaining] = useState(getAutoCancelTimeRemaining(createdAt));

  useEffect(() => {
    // Don't show countdown if payment exists
    if (paidAmount > 0) return;

    const timer = setInterval(() => {
      const remaining = getAutoCancelTimeRemaining(createdAt);
      setTimeRemaining(remaining);

      if (remaining.isExpired) {
        clearInterval(timer);
        if (onExpired) {
          onExpired();
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [createdAt, paidAmount, onExpired]);

  // Don't show if payment exists
  if (paidAmount > 0) return null;

  // Show expired message
  if (timeRemaining.isExpired) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-bold text-red-800">
              ⏱️ AUTO-CANCELLED
            </p>
            <p className="text-xs text-red-700 mt-1">
              This booking was automatically cancelled due to no payment within 5 minutes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate warning level
  const isUrgent = timeRemaining.totalSeconds <= 60; // Last minute
  const isWarning = timeRemaining.totalSeconds <= 120; // Last 2 minutes

  const bgColor = isUrgent ? 'bg-red-50' : isWarning ? 'bg-orange-50' : 'bg-yellow-50';
  const borderColor = isUrgent ? 'border-red-500' : isWarning ? 'border-orange-500' : 'border-yellow-400';
  const textColor = isUrgent ? 'text-red-800' : isWarning ? 'text-orange-800' : 'text-yellow-800';
  const subtextColor = isUrgent ? 'text-red-700' : isWarning ? 'text-orange-700' : 'text-yellow-700';

  return (
    <div className={`${bgColor} border-l-4 ${borderColor} p-3 rounded animate-pulse`}>
      <div className="flex items-center gap-2">
        <svg className={`h-5 w-5 ${textColor}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
        <div className="flex-1">
          <p className={`text-sm font-bold ${textColor}`}>
            ⚠️ PAYMENT REQUIRED - Auto-cancel in:
          </p>
          <p className={`text-2xl font-mono font-bold ${textColor} mt-1`}>
            {String(timeRemaining.minutes).padStart(2, '0')}:{String(timeRemaining.seconds).padStart(2, '0')}
          </p>
          <p className={`text-xs ${subtextColor} mt-1`}>
            Record payment now to prevent auto-cancellation!
          </p>
        </div>
      </div>
    </div>
  );
}

