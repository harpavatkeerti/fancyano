'use client';

import { useState } from 'react';
import { cashAdjustmentsApi } from '@/lib/api';
import { toast } from '@/lib/toast';

interface CashAdjustmentFormModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  userName: string;
}

export default function CashAdjustmentFormModal({ onClose, onSuccess, userName }: CashAdjustmentFormModalProps) {
  const [form, setForm] = useState({ amount: '', reason: '', adjustment_date: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.amount || !form.reason) {
      toast.error('Amount and reason are required');
      return;
    }
    setSubmitting(true);
    try {
      await cashAdjustmentsApi.create({
        amount: parseInt(form.amount),
        reason: form.reason,
        adjustment_date: form.adjustment_date || undefined,
      });
      toast.success('Cash adjustment created');
      onSuccess?.();
      onClose();
    } catch {
      toast.error('Failed to create adjustment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">New Cash Adjustment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="+surplus / -shortage"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Use positive for surplus, negative for shortage</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <input
              type="text"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Reason for adjustment"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date (optional)</label>
            <input
              type="date"
              value={form.adjustment_date}
              onChange={e => setForm(f => ({ ...f, adjustment_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
}
