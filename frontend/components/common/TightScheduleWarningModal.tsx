'use client';

import React from 'react';
import type { UrgentConflict } from '@rental/shared';

interface TightScheduleWarningModalProps {
  conflicts: UrgentConflict[];
  onCancel: () => void;
  onContinue: () => void;
}

/**
 * TightScheduleWarningModal — confirmation modal for tight-schedule conflicts.
 *
 * Reuses the same rich conflict-card layout as UrgentDetailsModal but adds
 * Cancel / Continue buttons so the user can decide whether to proceed.
 */
export function TightScheduleWarningModal({ conflicts, onCancel, onContinue }: TightScheduleWarningModalProps) {
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] animate-fadeIn">
      <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto animate-slideIn">
        {/* Header */}
        <div className="flex items-start gap-4 mb-4 pb-3 border-b-2 border-yellow-300">
          <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">Tight Schedule Warning</h3>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          The following products have tight scheduling conflicts (≤ 2 day gap with neighbouring bookings). Do you still want to proceed?
        </p>

        {/* Conflict cards */}
        <div className="space-y-3">
          {conflicts.map((conflict, index) => (
            <div
              key={`${conflict.product_code}-${conflict.neighbour_booking_id}-${index}`}
              className="border border-red-200 rounded-lg p-4 bg-red-50"
            >
              {/* Product info */}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm font-bold text-gray-800 bg-white px-2 py-0.5 rounded border border-gray-200">
                  {conflict.product_code}
                </span>
                <span className="text-sm font-medium text-gray-700 truncate">
                  {conflict.product_name}
                </span>
                {conflict.size && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    Size {conflict.size}
                  </span>
                )}
              </div>

              {/* This booking dates */}
              <div className="text-sm text-gray-700 mb-1">
                <span className="text-gray-500">Your dates:</span>{' '}
                <span className="font-semibold text-blue-700">
                  {fmtDate(conflict.booked_from)} → {fmtDate(conflict.booked_to)}
                </span>
              </div>

              {/* Neighbour booking dates */}
              <div className="text-sm text-gray-700 mb-2">
                <span className="text-gray-500">
                  {conflict.direction === 'before' ? 'Previous booking' : 'Next booking'}:
                </span>{' '}
                <span className="font-semibold text-red-700">
                  {fmtDate(conflict.neighbour_from)} → {fmtDate(conflict.neighbour_to)}
                </span>
              </div>

              {/* Gap badge + View link */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white text-xs font-bold rounded">
                  ⚠️ {conflict.gap_days} day gap {conflict.direction === 'before' ? 'before pickup' : 'after return'}
                </span>
                <button
                  onClick={() => window.location.href = `/bookings/${conflict.neighbour_booking_id}`}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                >
                  View Order #{conflict.neighbour_booking_id}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-2 border-2 border-red-600 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
