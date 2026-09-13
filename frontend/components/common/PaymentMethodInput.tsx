'use client';

import { useState } from 'react';

interface PaymentMethodInputProps {
  method: string;
  onMethodChange: (method: string) => void;
  notes?: string;
  onNotesChange?: (notes: string) => void;
  notesPlaceholder?: string;    // default: "Enter transaction details, UPI ID, reference number, etc."
  notesLabel?: string;          // default: "Notes (Optional)"
  colorScheme?: 'blue' | 'green' | 'red' | 'orange';
  className?: string;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

const FOCUS_COLORS: Record<string, string> = {
  blue: 'focus:ring-blue-500',
  green: 'focus:ring-green-500',
  red: 'focus:ring-red-500',
  orange: 'focus:ring-orange-500',
};

export function PaymentMethodInput({
  method,
  onMethodChange,
  notes,
  onNotesChange,
  notesPlaceholder = 'Enter transaction details, UPI ID, reference number, etc.',
  notesLabel = 'Notes (Optional)',
  colorScheme = 'blue',
  className = '',
}: PaymentMethodInputProps) {
  const focusRing = FOCUS_COLORS[colorScheme] || FOCUS_COLORS.blue;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Payment Method Dropdown */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Payment Method <span className="text-red-500">*</span>
        </label>
        <select
          value={method}
          onChange={(e) => onMethodChange(e.target.value)}
          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${focusRing} bg-white`}
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Transaction Notes — only rendered when notes/onNotesChange are provided */}
      {onNotesChange && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {notesLabel}
          </label>
          <textarea
            value={notes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={notesPlaceholder}
            rows={3}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 ${focusRing} resize-none`}
          />
          <p className="text-xs text-gray-500 mt-1">
            💡 Add any additional details about this transaction
          </p>
        </div>
      )}
    </div>
  );
}
