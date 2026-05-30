'use client';

import { useEffect, useState } from 'react';
import { paymentTransactionsApi, bookingsApi, type PaymentTransaction, type PaymentSummary } from '@/lib/api';
import { creditNotesApi } from '@/lib/creditNotesApi';
import { Button } from '@/components/common';
import { PaymentMethodInput } from './PaymentMethodInput';
import { toast } from '@/lib/toast';
import { SecurityAllocationSection } from './SecurityAllocationSection';
import { useSecurityAllocation } from '@/hooks/useSecurityAllocation';

interface PaymentManagementProps {
  bookingId: number;
  totalAmount: number;
  securityDeposit: number;
  onPaymentUpdate: () => void;
  onStatusUpdate?: (status: string) => void; // Optional callback to update booking status
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
  // Product-wise refund state (for enhanced refund modal)
  const [itemRefunds, setItemRefunds] = useState<{ [key: number]: { selected: boolean; amount: string; notes: string } }>({});
  const [refundNarration, setRefundNarration] = useState(''); // General narration for the entire refund

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
      // Filter out cancelled products
      const productsList = Array.isArray(booking.products)
        ? booking.products.filter((p: any) => p.status !== 'cancelled')
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
      console.log('✅ Booking status updated by backend');
    } catch (error) {
      console.error('Error updating booking status:', error);
    }
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
      if (transactionType === 'payment' && summary) {
        const totalRequired = summary.totals?.total_due || 0;
        const currentPaid = summary.totals?.total_paid || 0;
        const remainingBalance = Math.max(0, totalRequired - currentPaid);

        if (amount > remainingBalance) {
          toast.error(`Payment exceeds outstanding balance. Maximum allowed: ₹${Math.floor(remainingBalance).toLocaleString('en-IN')}`);
          return;
        }
      }

      const payload: any = {
        booking_id: bookingId,
        amount: amount,
        type: transactionType,
        method: formData.method,
        recorded_by: 'Admin', // TODO: Get from auth context
        notes: formData.notes || undefined,
      };

      if (transactionType === 'payment' && securityPortion > 0 && selectedSecProductIds.length > 0) {
        payload.security_product_ids = selectedSecProductIds;
      }

      await paymentTransactionsApi.create(payload);

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

  // Helper function to check if a product already has a refund
  function hasProductRefund(productId: number): boolean {
    return transactions.some((t: any) => {
      if (t.type !== 'refund') return false;
      const method = String(t.method || '').toLowerCase().trim();
      if (method === 'lapsed_refund') return false; // Exclude lapsed refunds
      const notes = t.notes || '';
      const product = products.find(p => p.id === productId);
      if (!product) return false;
      return notes.includes(`(${product.code})`);
    });
  }

  // Handle product-wise refund submission
  async function handleProductRefundSubmit() {
    try {
      // Validate selections
      const selectedItems = Object.entries(itemRefunds).filter(([_, data]) => data.selected);

      if (selectedItems.length === 0) {
        toast.warning('Please select at least one product to refund');
        return;
      }

      if (!formData.method) {
        toast.warning('Please select a payment method');
        return;
      }

      // Validate each selected item
      for (const [productIdStr, refundData] of selectedItems) {
        const productId = parseInt(productIdStr);
        const product = products.find(p => p.id === productId);
        if (!product) continue;

        const refundAmount = parseFloat(refundData.amount);
        const productSecurity = typeof product.security_deposit === 'number'
          ? product.security_deposit
          : parseFloat(String(product.security_deposit || '0')) || 0;

        if (isNaN(refundAmount) || refundAmount < 0) {
          toast.warning(`Please enter a valid refund amount for ${product.name}`);
          return;
        }

        if (refundAmount > productSecurity) {
          toast.warning(`Refund amount for ${product.name} cannot exceed security deposit of ${formatCurrency(productSecurity)}`);
          return;
        }

        // Require notes if refund is less than security
        if (refundAmount < productSecurity && !refundData.notes.trim()) {
          toast.warning(`Please provide narration for ${product.name} - refund is less than security deposit`);
          return;
        }
      }

      // Process refunds for each selected product
      for (const [productIdStr, refundData] of selectedItems) {
        const productId = parseInt(productIdStr);
        const product = products.find(p => p.id === productId);
        if (!product) continue;

        const refundAmount = parseFloat(refundData.amount);
        const productSecurity = typeof product.security_deposit === 'number'
          ? product.security_deposit
          : parseFloat(String(product.security_deposit || '0')) || 0;
        const deduction = productSecurity - refundAmount;

        // Build detailed notes
        let notes = `Refund for ${product.name} (${product.code})`;
        if (deduction > 0) {
          notes += ` - ${formatCurrency(deduction)} deducted`;
        }
        if (refundData.notes.trim()) {
          notes += `: ${refundData.notes.trim()}`;
        }

        // Append general narration if provided
        if (refundNarration.trim()) {
          notes += ` | ${refundNarration.trim()}`;
        }

        await paymentTransactionsApi.create({
          booking_id: bookingId,
          amount: refundAmount,
          type: 'refund',
          method: formData.method,
          recorded_by: 'Admin',
          notes: notes,
          // When there's a deduction, track it as a damage fee charge
          ...(deduction > 0 ? {
            booking_product_id: productId,
            deduction_amount: deduction,
            deduction_type: 'damage_fee',
          } : {}),
        });
      }

      toast.success(`Refund recorded successfully for ${selectedItems.length} item(s)!`);
      setShowRecordModal(false);
      setFormData({ amount: '', method: 'Cash', notes: '' });
      setItemRefunds({});
      setRefundNarration('');

      // Refresh transactions and summary
      await fetchTransactions();
      await fetchSummary();

      // Update booking status
      await calculateAndUpdateBookingStatus();

      // Notify parent
      onPaymentUpdate();
    } catch (error) {
      console.error('Error recording refund:', error);
      const message = (error as any).response?.data?.details || (error as any).response?.data?.error || 'Error recording refund';
      toast.error(message);
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
            // Use the backend's pre-computed balance (total_due - total_paid).
            // Do NOT add totalRefunded back here: total_paid is derived from product_charges.paid_amount
            // (never reduced by refunds), and total_due already excludes cancelled products' charges.
            // The old formula (totalRequired - totalPaid + totalRefunded) created a phantom liability
            // equal to the refund amount after every cancellation refund.
            const balanceDue = summary.totals?.balance ?? 0;
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
                          setItemRefunds({}); // Reset product selections
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
                      rent:                 'Rent',
                      transport:            'Transport',
                      exchange_penalty:     'Exchange Penalty',
                      downgrade_penalty:    'Downgrade Penalty',
                      cancellation_penalty: 'Cancellation Penalty',
                      damage_fee:           'Damage Fee',
                      late_fee:             'Late Fee',
                      security:             'Security Deposit',
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

      {/* Record Transaction Modal */}
      {showRecordModal && transactionType === 'refund' ? (
        // Enhanced Refund Modal (Product-wise)
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-8 sticky top-0 bg-white pb-4 border-b">
              <div className="flex items-center">
                <button
                  onClick={() => {
                    setShowRecordModal(false);
                    setItemRefunds({});
                    setFormData({ amount: '', method: 'Cash', notes: '' });
                    setRefundNarration('');
                  }}
                  className="mr-4 text-gray-600 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-3xl font-bold text-gray-900">Record Refund</h2>
              </div>
            </div>

            <PaymentMethodInput
              method={formData.method}
              onMethodChange={(m) => setFormData({ ...formData, method: m })}
              notes={refundNarration}
              onNotesChange={setRefundNarration}
              notesLabel="Narration / Notes (Optional)"
              notesPlaceholder="Enter transaction details, UPI ID, reference number, etc."
              colorScheme="red"
              showQR={false}
            />

            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Items for Refund</h3>
              {products.length === 0 ? (
                // Fallback: Simple refund form when no products exist (already refunded/deleted)
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800 mb-3">
                    ℹ️ No products found. This may occur if products were already freed. You can still record a manual refund below.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Refund Amount (₹) *
                      </label>
                      <input
                        type="number"
                        placeholder="Enter refund amount"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        step="0.01"
                        min="0"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Notes (Optional)
                      </label>
                      <textarea
                        placeholder="Add notes about this refund..."
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {products.map((product: any) => {
                    const productSecurityDeposit = typeof product.security_deposit === 'number'
                      ? product.security_deposit
                      : parseFloat(product.security_deposit || '0') || 0;

                    const productHasRefund = hasProductRefund(product.id);
                    const refundData = itemRefunds[product.id] || { selected: false, amount: '', notes: '' };
                    const refundAmountNum = parseFloat(refundData.amount) || 0;
                    const requiresNotes = refundData.selected && refundAmountNum > 0 && refundAmountNum < productSecurityDeposit;
                    const hasError = refundData.selected && refundAmountNum > productSecurityDeposit;

                    return (
                      <div
                        key={product.id}
                        className={`border-2 rounded-lg p-4 ${productHasRefund
                          ? 'border-gray-300 bg-gray-100 opacity-60'
                          : refundData.selected
                            ? 'border-red-500 bg-red-50'
                            : 'border-gray-200 bg-white'
                          }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Checkbox */}
                          <div className="flex items-center pt-1">
                            <input
                              type="checkbox"
                              checked={refundData.selected}
                              disabled={productHasRefund}
                              onChange={(e) => {
                                if (!productHasRefund) {
                                  setItemRefunds({
                                    ...itemRefunds,
                                    [product.id]: {
                                      selected: e.target.checked,
                                      amount: e.target.checked ? String(productSecurityDeposit) : '',
                                      notes: e.target.checked ? refundData.notes : '',
                                    },
                                  });
                                }
                              }}
                              className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>

                          {/* Product Info */}
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h4 className={`font-semibold ${productHasRefund ? 'text-gray-500' : 'text-gray-900'}`}>
                                  {product.name}
                                  {productHasRefund && <span className="ml-2 text-xs text-green-600 font-normal">(Refund Completed)</span>}
                                </h4>
                                <p className={`text-sm ${productHasRefund ? 'text-gray-400' : 'text-gray-600'}`}>Code: {product.code}</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm ${productHasRefund ? 'text-gray-400' : 'text-gray-600'}`}>Security Deposit</p>
                                <p className={`font-bold ${productHasRefund ? 'text-gray-500' : 'text-gray-900'}`}>
                                  ₹{Math.floor(productSecurityDeposit).toLocaleString('en-IN')}
                                </p>
                              </div>
                            </div>

                            {productHasRefund && (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                  <p className="text-sm text-green-800 font-medium">
                                    ✓ Refund already completed for this item
                                  </p>
                                </div>
                              </div>
                            )}

                            {!productHasRefund && refundData.selected && (
                              <div className="mt-4 space-y-4 pt-4 border-t border-gray-200">
                                {/* Refund Amount Input */}
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Refund Amount (₹) *
                                  </label>
                                  <input
                                    type="number"
                                    placeholder="Enter refund amount"
                                    value={refundData.amount}
                                    onChange={(e) => {
                                      setItemRefunds({
                                        ...itemRefunds,
                                        [product.id]: {
                                          ...refundData,
                                          amount: e.target.value,
                                        },
                                      });
                                    }}
                                    max={productSecurityDeposit}
                                    step="0.01"
                                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${hasError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                                      }`}
                                  />
                                  {hasError && (
                                    <p className="text-red-600 text-sm mt-1">
                                      Amount cannot exceed security deposit of ₹{Math.floor(productSecurityDeposit).toLocaleString('en-IN')}
                                    </p>
                                  )}
                                  {refundData.selected && refundAmountNum > 0 && refundAmountNum <= productSecurityDeposit && (
                                    <div className="flex justify-between text-xs mt-1">
                                      <p className="text-gray-500">
                                        Maximum: ₹{Math.floor(productSecurityDeposit).toLocaleString('en-IN')}
                                      </p>
                                      {refundAmountNum < productSecurityDeposit && (
                                        <p className="text-orange-600 font-semibold">
                                          Deduction: ₹{Math.floor(productSecurityDeposit - refundAmountNum).toLocaleString('en-IN')}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Notes Input */}
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Narration / Notes {requiresNotes && <span className="text-red-600">*</span>}
                                  </label>
                                  {requiresNotes && (
                                    <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2">
                                      ⚠️ Refund amount is less than security deposit. Please provide narration explaining the reason.
                                    </p>
                                  )}
                                  <textarea
                                    value={refundData.notes}
                                    onChange={(e) => {
                                      setItemRefunds({
                                        ...itemRefunds,
                                        [product.id]: {
                                          ...refundData,
                                          notes: e.target.value,
                                        },
                                      });
                                    }}
                                    rows={3}
                                    placeholder={requiresNotes ? "Required: Explain deduction reason (e.g., 'Stain on sleeve', 'Missing button')..." : "Optional: Add notes about this refund..."}
                                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${requiresNotes && !refundData.notes.trim() ? 'border-red-300 bg-red-50' : 'border-gray-300'
                                      }`}
                                  />
                                  {requiresNotes && !refundData.notes.trim() && (
                                    <p className="text-red-600 text-sm mt-1">
                                      Narration is required when refund is less than security deposit
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>



            {/* Summary of selected refunds */}
            {products.length > 0 && Object.values(itemRefunds).some(r => r.selected) && (
              <div className="mt-6 bg-blue-50 border border-blue-300 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Refund Summary</h4>
                <div className="space-y-1 text-sm">
                  {Object.entries(itemRefunds)
                    .filter(([_, data]) => data.selected)
                    .map(([productIdStr, data]) => {
                      const product = products.find(p => p.id === parseInt(productIdStr));
                      if (!product) return null;
                      const amount = parseFloat(data.amount) || 0;
                      const security = typeof product.security_deposit === 'number'
                        ? product.security_deposit
                        : parseFloat(product.security_deposit || '0') || 0;
                      const deduction = security - amount;
                      return (
                        <div key={productIdStr} className="flex justify-between text-blue-800">
                          <span>{product.name} ({product.code})</span>
                          <span className="font-semibold">
                            ₹{Math.floor(amount).toLocaleString('en-IN')}
                            {deduction > 0 && <span className="text-orange-600 ml-2">(-₹{Math.floor(deduction).toLocaleString('en-IN')})</span>}
                          </span>
                        </div>
                      );
                    })}
                  <div className="border-t border-blue-300 pt-2 mt-2 flex justify-between font-bold text-blue-900">
                    <span>Total Refund:</span>
                    <span>
                      ₹{Math.floor(
                        Object.entries(itemRefunds)
                          .filter(([_, data]) => data.selected)
                          .reduce((sum, [_, data]) => sum + (parseFloat(data.amount) || 0), 0)
                      ).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
              <Button
                onClick={() => {
                  setShowRecordModal(false);
                  setItemRefunds({});
                  setFormData({ amount: '', method: 'Cash', notes: '' });
                  setRefundNarration('');
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={products.length === 0 ? handleSubmit : handleProductRefundSubmit}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                Confirm Refund
              </Button>
            </div>
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
                disabled={transactionType === 'payment' && !canConfirmSecurity}
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

