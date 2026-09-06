'use client';

import { useState, useEffect, useCallback } from 'react';
import { cashAdjustmentsApi, expensesApi, settingsApi, Expense, CashAdjustment } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { CashAdjustmentFormModal, ExpenseFormModal } from '@/components/common';
import { toast } from '@/lib/toast';

// ── Helpers ────────────────────────────────────────────────────────────

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric'
});

const defaultCategories = ['Shop Rent', 'Dry Clean', 'Electricity', 'Salary', 'Maintenance', 'Transport', 'Packaging', 'Miscellaneous'];

const statusBadge = (status: string) => {
  const cls = status === 'approved' ? 'bg-green-100 text-green-700'
    : status === 'pending' ? 'bg-yellow-100 text-yellow-700'
    : 'bg-red-100 text-red-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
};

// ── Component ──────────────────────────────────────────────────────────

export default function ExpensesCashPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'adjustments' | 'expenses'>('adjustments');
  const [loading, setLoading] = useState(false);

  // Cash adjustments state
  const [adjustments, setAdjustments] = useState<CashAdjustment[]>([]);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  // Expenses state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Settings
  const [allowRecurring, setAllowRecurring] = useState(false);

  // ── Data loading ───────────────────────────────────────────────────

  const loadAdjustments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cashAdjustmentsApi.list();
      setAdjustments(res.data);
    } catch {
      toast.error('Failed to load cash adjustments');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await expensesApi.list();
      setExpenses(res.data);
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await settingsApi.getByKey('salesman_permissions');
      if (res.data) {
        const perms = JSON.parse(res.data.setting_value);
        setAllowRecurring(perms.recurring_expenses_allowed ?? false);
      }
    } catch {
      // Settings may not exist yet — default to false
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (activeTab === 'adjustments') loadAdjustments();
    else loadExpenses();
  }, [activeTab, loadAdjustments, loadExpenses]);

  // ── Filtered data ──────────────────────────────────────────────────

  const filteredAdjustments = statusFilter === 'all'
    ? adjustments
    : adjustments.filter(a => a.approval_status === statusFilter);

  const filteredExpenses = statusFilter === 'all'
    ? expenses
    : expenses.filter(e => e.approval_status === statusFilter);

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Expenses / Cash</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your cash adjustments and expense submissions
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 max-w-sm">
        <button
          onClick={() => { setActiveTab('adjustments'); setStatusFilter('all'); }}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'adjustments'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Cash Adjustments
          {adjustments.filter(a => a.approval_status === 'pending').length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500 text-white text-xs font-bold">
              {adjustments.filter(a => a.approval_status === 'pending').length}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('expenses'); setStatusFilter('all'); }}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'expenses'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Expenses
          {expenses.filter(e => e.approval_status === 'pending').length > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-500 text-white text-xs font-bold">
              {expenses.filter(e => e.approval_status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* Controls: Add button + Status filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-2 items-center">
          <label className="text-sm text-gray-500">Status:</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <button
          onClick={() => activeTab === 'adjustments' ? setShowAdjustmentModal(true) : setShowExpenseModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
        >
          {activeTab === 'adjustments' ? '+ New Adjustment' : '+ Add Expense'}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      )}

      {/* Cash Adjustments Table */}
      {!loading && activeTab === 'adjustments' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Reason</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredAdjustments.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No cash adjustments found</td></tr>
                ) : filteredAdjustments.map(adj => (
                  <tr key={adj.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(adj.adjustment_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{adj.reason}</td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${adj.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {adj.amount > 0 ? '+' : ''}{fmt(adj.amount)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(adj.approval_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      {!loading && activeTab === 'expenses' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Paid From</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredExpenses.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No expenses found</td></tr>
                ) : filteredExpenses.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(e.expense_date)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{e.category}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{e.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">{fmt(e.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.payment_source === 'Shop Cash' ? 'bg-blue-100 text-blue-700' :
                        e.payment_source === 'Online' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {e.payment_source || 'Shop Cash'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{statusBadge(e.approval_status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdjustmentModal && (
        <CashAdjustmentFormModal
          onClose={() => setShowAdjustmentModal(false)}
          onSuccess={loadAdjustments}
          userName={user?.name || ''}
        />
      )}

      {showExpenseModal && (
        <ExpenseFormModal
          onClose={() => setShowExpenseModal(false)}
          onSuccess={loadExpenses}
          userName={user?.name || ''}
          categories={defaultCategories}
          allowRecurring={allowRecurring}
        />
      )}
    </div>
  );
}
