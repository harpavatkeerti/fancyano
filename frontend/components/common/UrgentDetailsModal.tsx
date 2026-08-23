'use client';

import React, { useState } from 'react';
import type { UrgentConflict } from '@rental/shared';

interface UrgentDetailsModalProps {
  bookingId: number;
  conflicts: UrgentConflict[];
  onClose: () => void;
}

/**
 * UrgentDetailsModal — shows schedule conflict details for an urgent booking.
 *
 * Displays per-product dates, neighbour booking dates, gap info,
 * and a link to view the conflicting order.
 * All data comes from the backend; no business logic in frontend.
 */
export function UrgentDetailsModal({ bookingId, conflicts, onClose }: UrgentDetailsModalProps) {
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] animate-fadeIn">
      <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto animate-slideIn">
        {/* Header */}
        <div className="flex justify-between items-center mb-4 pb-3 border-b-2 border-red-200">
          <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
            🚨 Urgent — Booking #{bookingId}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl font-bold transition-colors"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          The following products have tight scheduling conflicts (≤ 2 day gap with neighbouring bookings).
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
                <span className="text-gray-500">This booking:</span>{' '}
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

        {/* Footer */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
