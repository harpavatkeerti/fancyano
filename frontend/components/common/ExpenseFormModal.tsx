'use client';

import { useState } from 'react';
import { expensesApi } from '@/lib/api';
import { toast } from '@/lib/toast';

interface ExpenseFormModalProps {
  onClose: () => void;
  onSuccess?: () => void;
  userName: string;
  categories: string[];
  allowRecurring: boolean;
  /** If true, opens with recurring pre-selected */
  defaultRecurring?: boolean;
}

export default function ExpenseFormModal({
  onClose,
  onSuccess,
  userName,
  categories,
  allowRecurring,
  defaultRecurring = false,
}: ExpenseFormModalProps) {
  const [mode, setMode] = useState<'one-time' | 'recurring'>(defaultRecurring && allowRecurring ? 'recurring' : 'one-time');
  const [form, setForm] = useState({
    category: '',
    amount: '',
    description: '',
    date: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.category || !form.amount) {
      toast.error('Category and amount are required');
      return;
    }
    if (mode === 'recurring' && !form.date) {
      toast.error('Please select a start date for recurring expense');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'one-time') {
        await expensesApi.create({
          category: form.category,
          amount: parseInt(form.amount),
          description: form.description || undefined,
          expense_date: form.date || undefined,
        });
        toast.success('Expense created');
      } else {
        await expensesApi.createRecurring({
          category: form.category,
          amount: parseInt(form.amount),
          description: form.description || undefined,
          next_due_date: form.date,
        });
        toast.success('Recurring expense created');
      }
      onSuccess?.();
      onClose();
    } catch {
      toast.error(mode === 'one-time' ? 'Failed to create expense' : 'Failed to create recurring expense');
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
          <h2 className="text-lg font-semibold text-gray-800">
            {mode === 'one-time' ? 'Add Expense' : 'Add Recurring Expense'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            <button
              onClick={() => setMode('one-time')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'one-time'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              One-time
            </button>
            <button
              onClick={() => allowRecurring && setMode('recurring')}
              disabled={!allowRecurring}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'recurring'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : allowRecurring
                    ? 'text-gray-500 hover:text-gray-700'
                    : 'text-gray-300 cursor-not-allowed'
              }`}
              title={!allowRecurring ? 'Recurring expenses are not enabled. Contact admin.' : ''}
            >
              Recurring {!allowRecurring && '🔒'}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
            >
              <option value="">Select Category</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {mode === 'recurring' ? 'Monthly Amount (₹)' : 'Amount (₹)'}
            </label>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Amount"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {mode === 'recurring' ? 'Start Date' : 'Date (optional)'}
            </label>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {mode === 'recurring' && (
              <p className="text-xs text-gray-400 mt-1">First expense will be created on this date</p>
            )}
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
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${
              mode === 'recurring' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {submitting ? 'Saving...' : mode === 'recurring' ? 'Save Recurring' : 'Save Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
