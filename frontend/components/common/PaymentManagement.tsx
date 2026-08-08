'use client';

import { paymentTransactionsApi, bookingsApi, lifecycleApi, type PaymentTransaction, type PaymentSummary } from '@/lib/api';
import { useEffect, useState } from 'react';

import { Button } from '@/components/common';
import { PaymentMethodInput } from './PaymentMethodInput';
import { toast } from '@/lib/toast';
import { SecurityAllocationSection } from './SecurityAllocationSection';
import { useSecurityAllocation } from '@/hooks/useSecurityAllocation';
import { RefundSettlementSection } from './RefundSettlementSection';

interface PaymentManagementProps {
  bookingId: number;
  totalAmount: number;
  securityDeposit: number;
  onPaymentUpdate: () => void;
  onStatusUpdate?: (status: string) => void; // Optional callback to update booking status
  onFirstPayment?: () => void; // Optional callback fired after the first successful payment (and auto-confirm)
  userRole?: 'admin' | 'salesman'; // Role-based button visibility
  isFullyCancelled?: boolean; // Show only transaction history for fully cancelled bookings
  refreshTrigger?: number; // Increment to trigger re-fetch from parent
}

interface Product {
  id: number;
  code: string;
  name: string;
  security_deposit: number;
  rent: number;
  booked_from?: string;
  status?: string;
}

export function PaymentManagement({
  bookingId,
  totalAmount,
  securityDeposit,
  onPaymentUpdate,
  onStatusUpdate,
  onFirstPayment,
  userRole = 'admin', // Default to admin if not specified
  isFullyCancelled = false,
  refreshTrigger = 0
}: PaymentManagementProps) {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [bookingStatus, setBookingStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [transactionType, setTransactionType] = useState<'payment' | 'refund' | 'adjustment'>('payment');
  const [formData, setFormData] = useState({
    amount: '',
    method: 'Cash',
    notes: '',
  });
  // Refund modal: which product the user chose to refund (one at a time via RefundSettlementSection)
  const [refundProductId, setRefundProductId] = useState<number | null>(null);
  const [refundMethod, setRefundMethod] = useState('Cash');

  // Boundary warning + security allocation state
  const {
    securityPortion, rentPortion,
    boundaryAcknowledged, setBoundaryAcknowledged,
    eligibleSecProducts,
    selectedSecProductIds, setSelectedSecProductIds,
    projectedSecAllocation,
    secAllocationError,
    updateSplit,
    resetAll: resetSecurityState,
    canConfirmSecurity,
  } = useSecurityAllocation();

  useEffect(() => {
    fetchBookingData();
    fetchTransactions();
    fetchSummary();
    // Auto-check and update status on page load (for orders with completed refunds)
    calculateAndUpdateBookingStatus();
  }, [bookingId, refreshTrigger]);

  // Recompute security/rent portions live as the admin types the amount
  useEffect(() => {
    if (transactionType !== 'payment' || !summary) {
      resetSecurityState();
      return;
    }
    const amount = parseFloat(formData.amount) || 0;
    if (amount <= 0) {
      resetSecurityState();
      return;
    }
    const nonSecOutstanding = Math.max(0,
      (summary.charges.rent.due - summary.charges.rent.paid) +
      (summary.charges.transport.due - summary.charges.transport.paid) +
      (summary.charges.penalties.due - summary.charges.penalties.paid) +
      (summary.charges.fees.due - summary.charges.fees.paid)
    );
    const secAmt = Math.max(0, amount - nonSecOutstanding);
    updateSplit(secAmt, amount - secAmt, summary.products ?? []);
  }, [formData.amount, summary, transactionType]);

  // Helper function to extract username from recorded_by field
  function getRecordedByName(recordedBy: any): string {
    if (!recordedBy) return 'N/A';

    // If it's a string
    if (typeof recordedBy === 'string') {
      try {
        // Try to parse it as JSON
        const parsed = JSON.parse(recordedBy);
        return parsed.userName || parsed.name || recordedBy;
      } catch {
        // If parsing fails, return as is
        return recordedBy;
      }
    }

    // If it's already an object
    if (typeof recordedBy === 'object') {
      return recordedBy.userName || recordedBy.name || 'N/A';
    }

    return String(recordedBy);
  }

  async function fetchBookingData() {
    try {
      const response = await bookingsApi.getById(bookingId);
      const booking = response.data;
      setBookingStatus(booking.status || '');
      // Filter out cancelled, exchanged and confirmed products — none of these should appear in refund or payment flows
      const productsList = Array.isArray(booking.products)
        ? booking.products.filter((p: any) => !['cancelled', 'exchanged', 'confirmed'].includes(p.status))
        : [];
      setProducts(productsList);
    } catch (error) {
      console.error('Error fetching booking data:', error);
      setProducts([]);
    }
  }

  async function fetchTransactions() {
    try {
      const response = await paymentTransactionsApi.getByBookingId(bookingId);
      setTransactions(response.data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSummary() {
    try {
      const response = await paymentTransactionsApi.getSummary(bookingId);
      setSummary(response.data);
    } catch (error) {
      console.error('Error fetching summary:', error);
    }
  }

  // Update booking status - backend calculates the correct status
  async function calculateAndUpdateBookingStatus() {
    try {
      // Simply call backend to recalculate and update status
      await bookingsApi.updateStatus(bookingId);
    } catch (error) {
      console.error('Error updating booking status:', error);
    }
  }

  // Outstanding balance from backend — charge-based (product_charges.due - paid),
  // matching the backend's own overpayment check. No frontend computation.
  function getOutstandingBalance(): number {
    if (!summary) return 0;
    return Math.max(0, (summary.totals as any)?.outstanding_balance ?? 0);
  }

  async function handleSubmit() {
    try {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        toast.warning('Please enter a valid amount');
        return;
      }

      if (!formData.method) {
        toast.warning('Please select a payment method');
        return;
      }

      // Hard cap: reject payment exceeding outstanding balance
      // Uses charge-based outstanding (matches category breakdown display and backend check)
      if (transactionType === 'payment' && summary) {
        const remainingBalance = getOutstandingBalance();

        if (amount > remainingBalance) {
          toast.error(`Payment exceeds outstanding balance. Maximum allowed: ₹${Math.floor(remainingBalance).toLocaleString('en-IN')}`);
          return;
        }
      }

      const payload: any = {
        booking_id: bookingId,
        amount: amount,
        type: transactionType,
        // For payments through this component, the business context is always 'booking'.
        // Exchange-related sub-types (exchange_upgrade, etc.) are recorded by separate flows.
        transaction_type: transactionType === 'payment' ? 'booking' : undefined,
        method: formData.method,
        recorded_by: userRole === 'admin' ? 'Admin' : 'Salesman',
        notes: formData.notes || undefined,
      };

      if (transactionType === 'payment' && securityPortion > 0 && selectedSecProductIds.length > 0) {
        payload.security_product_ids = selectedSecProductIds;
      }

      await paymentTransactionsApi.create(payload);

      // Auto-confirm booking on first payment if still pending
      if (transactionType === 'payment' && bookingStatus === 'pending') {
        await bookingsApi.confirm(bookingId, { confirmed_by: userRole === 'admin' ? 'Admin' : 'Salesman' });
        if (onFirstPayment) onFirstPayment();
      }

      toast.success(transactionType === 'payment' ? 'Payment collected successfully!' : transactionType === 'refund' ? 'Refund processed successfully!' : 'Adjustment recorded successfully!');
      setShowRecordModal(false);
      setFormData({ amount: '', method: 'Cash', notes: '' });
      resetSecurityState();

      // Refresh transactions and summary
      await fetchTransactions();
      await fetchSummary();

      // Update booking status based on new payment/refund
      await calculateAndUpdateBookingStatus();

      // Notify parent to refresh booking data
      onPaymentUpdate();
    } catch (error) {
      console.error('Error recording transaction:', error);
      const message = (error as any).response?.data?.details || (error as any).response?.data?.error || 'Error recording transaction';
      toast.error(message);
    }
  }

  function formatCurrency(amount: number | string | null | undefined): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
    return `₹${Math.floor(num).toLocaleString('en-IN')}`;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function getTransactionColor(type: string): string {
    switch (type) {
      case 'payment':
        return 'text-green-600 bg-green-50';
      case 'refund':
        return 'text-red-600 bg-red-50';
      case 'adjustment':
        return 'text-blue-600 bg-blue-50';
      case 'date_change_charge':
        return 'text-purple-600 bg-purple-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  }

  // Helper function to check if a product already has its security returned.
  // Status is 'completed' after return; further security return is blocked by the backend.
  function hasProductRefund(product: any): boolean {
    return product?.status === 'completed';
  }

  // Handle security return for a single product via the new backend endpoint.
  // 1. If the product is still in_progress, transition it to completed first.
  // 2. Then call processSecurityRefund with the user's explicit settlement amounts.
  async function handleSecurityReturn(settlement: import('./RefundSettlementSection').SecuritySettlement) {
    if (refundProductId === null) return;
    const product = products.find((p: any) => p.id === refundProductId);
    if (!product) return;

    try {
      // Step 1: transition in_progress → completed if needed
      if (product.status === 'in_progress') {
        await lifecycleApi.returnProducts(bookingId, {
          returns: [{ booking_product_id: refundProductId }],
          returned_by: userRole === 'admin' ? 'Admin' : 'Salesman',
        });
      }

      // Step 2: process the security return atomically
      await lifecycleApi.processSecurityRefund(bookingId, refundProductId, {
        ...settlement,
        recorded_by: userRole === 'admin' ? 'Admin' : 'Salesman',
      });

      toast.success('Security return processed successfully!');
      setShowRecordModal(false);
      setRefundProductId(null);

      await fetchTransactions();
      await fetchSummary();
      await fetchBookingData();
      await calculateAndUpdateBookingStatus();
      onPaymentUpdate();
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.response?.data?.details || error?.message || 'Error processing refund';
      throw new Error(message); // Let RefundSettlementSection display it
    }
  }

  if (loading) {
    return <div className="text-center py-4">Loading payment history...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Payment Summary - Hide for fully cancelled bookings */}
      {!isFullyCancelled && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          {/* Use backend payment summary - all calculations done by backend */}
          {(() => {
            // If summary not loaded yet, show loading or use props as fallback
            if (!summary) {
              return <div className="text-center py-4 text-gray-500">Loading payment summary...</div>;
            }

            // All values come from backend payment-summary API
            // Discount is already embedded in charge due_amounts, so total_due reflects it
            const totalRequired = summary.totals?.total_due || 0;
            const totalPaid = summary.totals?.total_paid || 0;
            const totalRefunded = summary.totals?.total_refunded || 0;
            const discountAmount = summary.final_discount || 0;
            // Use the backend's charge-based outstanding_balance (sum of due - paid per charge).
            // This matches the category breakdown rows above and the backend's overpayment check.
            const balanceDue = (summary.totals as any)?.outstanding_balance ?? 0;
            const isFullyPaid = balanceDue <= 0;
            // Check for refunds in transactions
            const hasAnyRefund = totalRefunded > 0;

            return (
              <>
                {/* Action buttons header */}
                <div className="flex flex-col gap-3 mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Payment Management</h3>
                  {!isFullyCancelled && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setTransactionType('payment');
                          setFormData({ amount: '', method: 'Cash', notes: '' });
                          setShowRecordModal(true);
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6"
                      >
                        💰 Collect Payment
                      </Button>
                      <Button
                        onClick={() => {
                          setTransactionType('refund');
                          setFormData({ amount: '', method: 'Cash', notes: '' });
                          setRefundProductId(null); // Reset product selection
                          setShowRecordModal(true);
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6"
                      >
                        💸 Refund Payment
                      </Button>
                    </div>
                  )}
                </div>

                {/* Financial Summary — tabular breakdown */}
                <div className="mb-4">
                  {/* Column headers */}
                  <div className="grid grid-cols-4 text-xs font-semibold text-gray-400 uppercase tracking-wide pb-2 border-b border-gray-200">
                    <span>Charge</span>
                    <span className="text-right">Due</span>
                    <span className="text-right">Paid</span>
                    <span className="text-right">Pending</span>
                  </div>

                  {/* Individual charge-type rows from charge_breakdown */}
                  {(() => {
                    const cb = (summary as any).charge_breakdown || {};
                    const labelMap: Record<string, string> = {
                      rent: 'Rent',
                      transport: 'Transport',
                      exchange_penalty: 'Exchange Penalty',
                      downgrade_penalty: 'Downgrade Penalty',
                      cancellation_penalty: 'Cancellation Penalty',
                      damage_fee: 'Damage Fee',
                      late_fee: 'Late Fee',
                      security: 'Security Deposit',
                    };
                    const orderedKeys = [
                      'rent', 'transport',
                      'exchange_penalty', 'downgrade_penalty', 'cancellation_penalty',
                      'damage_fee', 'late_fee',
                      'security',
                    ];
                    return orderedKeys
                      .filter(key => {
                        const entry = cb[key];
                        // charge_breakdown values are now {due, paid} objects
                        const due = (typeof entry === 'object' && entry !== null) ? (entry.due || 0) : (entry || 0);
                        return due > 0;
                      })
                      .map(key => {
                        const entry = cb[key];
                        const due = (typeof entry === 'object' && entry !== null) ? (entry.due || 0) : (entry || 0);
                        const paid = (typeof entry === 'object' && entry !== null) ? Math.min(entry.paid || 0, due) : 0;
                        const pending = Math.max(0, due - paid);
                        return (
                          <div key={key} className="grid grid-cols-4 py-2 border-b border-gray-100 text-sm">
                            <span className="text-gray-700">{labelMap[key] ?? key}</span>
                            <span className="text-right text-gray-900">{formatCurrency(due)}</span>
                            <span className={`text-right font-medium ${paid > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                              {paid > 0 ? formatCurrency(paid) : '—'}
                            </span>
                            <span className={`text-right font-medium ${pending > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {pending > 0 ? formatCurrency(pending) : '✅'}
                            </span>
                          </div>
                        );
                      });
                  })()}

                  {/* Totals row */}
                  <div className="grid grid-cols-4 pt-3 mt-1 border-t-2 border-gray-300 text-base font-bold">
                    <span className="text-gray-900">Total</span>
                    <span className="text-right text-gray-900">{formatCurrency(totalRequired)}</span>
                    <span className="text-right text-green-600">{formatCurrency(totalPaid)}</span>
                    <span className={`text-right ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {balanceDue <= 0 ? '✅ Paid' : formatCurrency(balanceDue)}
                    </span>
                  </div>

                  {/* Discount note */}
                  {discountAmount > 0 && (
                    <div className="mt-2 flex justify-between text-xs text-green-700 px-0.5">
                      <span>💚 Discount applied (embedded in amounts above)</span>
                      <span className="font-medium">₹{discountAmount.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  {/* Refunded — shown separately, does not affect balance */}
                  {totalRefunded > 0 && (
                    <div className="mt-3 flex justify-between items-center px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
                      <span className="text-sm text-orange-700 font-medium">↩ Refunded to Customer</span>
                      <span className="text-sm font-bold text-orange-600">{formatCurrency(totalRefunded)}</span>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Transaction History */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h3>

        {transactions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No transactions yet</p>
        ) : (
          <div className="space-y-4">
            {/* Regular Transactions (payments, refunds, adjustments) - exclude auto-adjustment penalties only */}
            {transactions.filter((t: any) => {
              const transactionType = String(t.transaction_type || '').toLowerCase().trim();
              const method = String(t.method || '').toLowerCase().trim();
              // Exclude penalties recorded as automatic adjustments (e.g. exchange/cancellation penalty adjustments)
              // Keep penalties where customer actually paid (upgrade, cancellation with actual payment)
              const isAutoAdjustmentPenalty = (
                (transactionType === 'exchange_penalty' ||
                  transactionType === 'downgrade_penalty' ||
                  transactionType === 'cancellation_penalty') &&
                method === 'adjustment'
              );
              return t.type !== 'date_change_charge' && !isAutoAdjustmentPenalty;
            }).length > 0 && (
                <div className="space-y-3">
                  {transactions
                    .filter((t: any) => {
                      const transactionType = String(t.transaction_type || '').toLowerCase().trim();
                      const method = String(t.method || '').toLowerCase().trim();
                      // Exclude penalties recorded as automatic adjustments (e.g. exchange/cancellation adjustments)
                      // Keep penalties where customer actually paid (upgrade, cancellation with actual payment)
                      const isAutoAdjustmentPenalty = (
                        (transactionType === 'exchange_penalty' ||
                          transactionType === 'downgrade_penalty' ||
                          transactionType === 'cancellation_penalty') &&
                        method === 'adjustment'
                      );
                      return t.type !== 'date_change_charge' && !isAutoAdjustmentPenalty;
                    })
                    .map((transaction) => {
                      const isAdjustment = transaction.type === 'adjustment';
                      return (
                        <div
                          key={transaction.id}
                          className={`rounded-lg p-4 transition-colors ${isAdjustment
                            ? 'border border-dashed border-gray-300 bg-gray-50 opacity-75'
                            : 'border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${getTransactionColor(transaction.type)}`}>
                                  {transaction.type}
                                </span>
                                {isAdjustment && (
                                  <span className="text-xs text-gray-400 italic">ℹ info only – not a customer payment</span>
                                )}
                                <span className={`${isAdjustment ? 'text-xs text-gray-400' : 'text-sm text-gray-600'}`}>
                                  {formatDate(transaction.created_at)}
                                </span>
                              </div>
                              {/* Transaction Type */}
                              <div className="flex items-center gap-4 mb-1">
                                <span className={`${isAdjustment ? 'text-xs text-gray-400' : 'text-sm text-gray-600'}`}>
                                  <span className="font-medium">Type:</span> {
                                    transaction.transaction_type === 'exchange_upgrade' ? 'Exchange Upgrade' :
                                      transaction.transaction_type === 'exchange_penalty' ? 'Exchange Penalty' :
                                        transaction.transaction_type === 'downgrade_penalty' ? 'Downgrade Penalty' :
                                          transaction.transaction_type === 'exchange_downgrade' ? 'Exchange Downgrade' :
                                            transaction.transaction_type === 'exchange_lapsed' ? 'Exchange Lapsed' :
                                              transaction.transaction_type === 'delayed_charges' ? 'Delayed Return Charges' :
                                                transaction.transaction_type === 'cancellation_penalty' ? 'Cancellation Penalty' :
                                                  'Booking'
                                  }
                                </span>
                                {transaction.method && (
                                  <span className={`${isAdjustment ? 'text-xs text-gray-400' : 'text-sm text-gray-600'}`}>
                                    <span className="font-medium">Method:</span> {transaction.method}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`font-bold ${isAdjustment ? 'text-sm text-gray-400' : 'text-lg text-gray-900'}`}>
                                  {transaction.type === 'refund' ? '-' : '+'}{formatCurrency(transaction.amount)}
                                </span>
                              </div>
                              {transaction.notes && (
                                <p className={`mb-1 ${isAdjustment ? 'text-xs text-gray-400' : 'text-sm text-gray-700'}`}>{transaction.notes}</p>
                              )}
                              <p className="text-xs text-gray-400">
                                Recorded by: {getRecordedByName(transaction.recorded_by)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

            {/* Date Change Charges - Displayed Separately */}
            {transactions.filter((t: any) => t.type === 'date_change_charge').length > 0 && (
              <div className="mt-6 pt-6 border-t-2 border-purple-200">
                <h4 className="text-md font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span className="text-purple-600">📅</span>
                  Date Change Charges
                  <span className="text-xs font-normal text-gray-500">
                    (These charges do not affect payment calculations)
                  </span>
                </h4>
                <div className="space-y-3">
                  {transactions
                    .filter((t: any) => t.type === 'date_change_charge')
                    .map((transaction) => (
                      <div
                        key={transaction.id}
                        className="border border-purple-200 rounded-lg p-4 hover:bg-purple-50 transition-colors bg-purple-50/30"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${getTransactionColor(transaction.type)}`}>
                                Date Change Charge
                              </span>
                              <span className="text-sm text-gray-600">
                                {formatDate(transaction.created_at)}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 mb-2">
                              <span className="text-lg font-bold text-purple-700">
                                +{formatCurrency(transaction.amount)}
                              </span>
                              {transaction.method && (
                                <span className="text-sm text-gray-600">
                                  via {transaction.method}
                                </span>
                              )}
                            </div>
                            {transaction.notes && (
                              <p className="text-sm text-gray-700 mb-2">{transaction.notes}</p>
                            )}
                            <p className="text-xs text-gray-500">
                              Recorded by: {getRecordedByName(transaction.recorded_by)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Refund Modal — product selection + RefundSettlementSection */}
      {showRecordModal && transactionType === 'refund' ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8">

            {/* Header */}
            <div className="flex items-center justify-between mb-6 sticky top-0 bg-white pb-4 border-b">
              <div className="flex items-center gap-3">
                {refundProductId !== null && (
                  <button
                    onClick={() => setRefundProductId(null)}
                    className="text-gray-500 hover:text-gray-900"
                    aria-label="Back to product list"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                <h2 className="text-2xl font-bold text-gray-900">
                  {refundProductId !== null
                    ? `Refund — ${products.find((p: any) => p.id === refundProductId)?.name ?? ''}`
                    : 'Record Refund'}
                </h2>
              </div>
              <button
                onClick={() => { setShowRecordModal(false); setRefundProductId(null); }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Product list — shown when no product is selected yet */}
            {refundProductId === null ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4">Select the product to refund security for:</p>
                {products.length === 0 ? (
                  <p className="text-sm text-gray-500">No eligible products found.</p>
                ) : (
                  products.map((product: any) => {
                    const alreadyRefunded = hasProductRefund(product);
                    return (
                      <div
                        key={product.id}
                        className={`flex items-center justify-between border rounded-lg p-4 ${
                          alreadyRefunded ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div>
                          <p className={`font-semibold ${alreadyRefunded ? 'text-gray-500' : 'text-gray-900'}`}>
                            {product.name}
                            {alreadyRefunded && <span className="ml-2 text-xs text-green-600 font-normal">(Refund Completed)</span>}
                          </p>
                          <p className="text-xs text-gray-500">{product.code}</p>
                        </div>
                        <Button
                          onClick={() => setRefundProductId(product.id)}
                          disabled={alreadyRefunded}
                          className="bg-red-600 hover:bg-red-700 text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Refund
                        </Button>
                      </div>
                    );
                  })
                )}
                <div className="pt-4 border-t border-gray-200">
                  <Button
                    onClick={() => { setShowRecordModal(false); setRefundProductId(null); }}
                    className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              /* Settlement section for the selected product */
              <RefundSettlementSection
                bookingId={bookingId}
                bookingProductId={refundProductId}
                paymentMethod={refundMethod}
                onPaymentMethodChange={setRefundMethod}
                onConfirm={handleSecurityReturn}
                onCancel={() => setRefundProductId(null)}
              />
            )}
          </div>
        </div>

      ) : showRecordModal ? (
        // Simple Modal for Payment/Adjustment
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              {transactionType === 'payment' ? '💰 Collect Payment' : transactionType === 'refund' ? '💸 Refund Payment' : 'Record Adjustment'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (₹) *
                </label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter amount"
                />
              </div>

              <PaymentMethodInput
                method={formData.method}
                onMethodChange={(m) => setFormData({ ...formData, method: m })}
                notes={formData.notes}
                onNotesChange={(n) => setFormData({ ...formData, notes: n })}
                amount={parseFloat(formData.amount) || undefined}
                notesLabel="Notes"
                notesPlaceholder={`Enter reason for ${transactionType}...`}
                colorScheme={transactionType === 'payment' ? 'green' : transactionType === 'refund' ? 'red' : 'blue'}
                showQR={transactionType === 'payment'}
              />
            </div>

            {/* Payment breakdown — outstanding rent/security shown live; overpayment blocked */}
            {transactionType === 'payment' && summary && (() => {
              const rentOut = Math.max(0,
                (summary.charges.rent.due - summary.charges.rent.paid) +
                (summary.charges.transport.due - summary.charges.transport.paid) +
                (summary.charges.penalties.due - summary.charges.penalties.paid) +
                (summary.charges.fees.due - summary.charges.fees.paid)
              );
              const secOut = Math.max(0, summary.charges.security.due - summary.charges.security.paid);
              const totalBalance = Math.max(0, summary.totals.balance);
              const entered = Number(formData.amount) || 0;
              const hasTransport = (summary.charges.transport.due - summary.charges.transport.paid) > 0;
              const overpayment = entered > 0 && totalBalance > 0 ? Math.max(0, entered - totalBalance) : 0;
              return (
                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-gray-900 mb-3">Payment Breakdown</h4>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200">
                    <span className="text-gray-700 font-medium text-sm">
                      {hasTransport ? 'Rent + Transport Due:' : 'Rent Due:'}
                    </span>
                    <span className={`font-bold ${rentOut <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {rentOut <= 0 ? '✓ Fully Paid' : `₹${Math.floor(rentOut).toLocaleString('en-IN')}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-700 font-medium text-sm">Security Deposit Due:</span>
                    <span className={`font-bold ${secOut <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {secOut <= 0 ? '✓ Fully Paid' : `₹${Math.floor(secOut).toLocaleString('en-IN')}`}
                    </span>
                  </div>
                  {overpayment > 0 && (
                    <div className="mt-3 bg-red-50 border-2 border-red-400 rounded-lg p-3 flex items-start gap-2">
                      <span className="text-lg flex-shrink-0">❌</span>
                      <div>
                        <p className="font-bold text-red-800 text-sm">Cannot Accept Extra Payment</p>
                        <p className="text-red-700 text-sm mt-0.5">
                          Amount exceeds outstanding balance by ₹{Math.floor(overpayment).toLocaleString('en-IN')}. Please reduce the payment amount.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Boundary warning — only when payment crosses rent/security line */}
            {transactionType === 'payment' && securityPortion > 0 && rentPortion > 0 && (
              <div className="mt-4 bg-amber-50 border border-amber-300 rounded-lg p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-xl flex-shrink-0">⚠️</span>
                  <div>
                    <p className="font-semibold text-amber-900 mb-1">Payment spans two categories</p>
                    <p className="text-sm text-amber-800">This payment will be credited as:</p>
                  </div>
                </div>
                <div className="ml-8 space-y-1 mb-4">
                  <div className="flex justify-between text-sm font-medium text-amber-900">
                    <span>Rent / other charges</span>
                    <span>₹{rentPortion.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium text-amber-900">
                    <span>Security deposit</span>
                    <span>₹{securityPortion.toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={boundaryAcknowledged}
                    onChange={e => setBoundaryAcknowledged(e.target.checked)}
                    className="mt-1 w-4 h-4 text-amber-600 rounded"
                  />
                  <span className="text-sm text-amber-900">
                    I confirm this split is correct before proceeding
                  </span>
                </label>
              </div>
            )}

            {/* Security allocation — shown when any amount goes to security and boundary is ack'd */}
            {transactionType === 'payment' && securityPortion > 0 && (rentPortion === 0 || boundaryAcknowledged) && (
              <SecurityAllocationSection
                securityAmount={securityPortion}
                eligibleProducts={eligibleSecProducts}
                selectedIds={selectedSecProductIds}
                onSelectionChange={setSelectedSecProductIds}
                projectedAllocation={projectedSecAllocation}
                error={secAllocationError}
              />
            )}

            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => {
                  setShowRecordModal(false);
                  setFormData({ amount: '', method: 'Cash', notes: '' });
                  resetSecurityState();
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={transactionType === 'payment' && (
                  !canConfirmSecurity ||
                  (!!summary && (Number(formData.amount) || 0) > 0 && (Number(formData.amount) || 0) > getOutstandingBalance())
                )}
                className={`flex-1 text-white ${transactionType === 'payment'
                  ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed'
                  : transactionType === 'refund'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                  }`}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

