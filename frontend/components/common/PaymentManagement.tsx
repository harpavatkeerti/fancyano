'use client';

import { useEffect, useState } from 'react';
import { paymentTransactionsApi, bookingsApi, type PaymentTransaction, type PaymentSummary } from '@/lib/api';
import { creditNotesApi } from '@/lib/creditNotesApi';
import { Button } from '@/components/common';
import { toast } from '@/lib/toast';

interface PaymentManagementProps {
  bookingId: number;
  totalAmount: number;
  securityDeposit: number;
  onPaymentUpdate: () => void;
  onStatusUpdate?: (status: string) => void; // Optional callback to update booking status
  userRole?: 'admin' | 'salesman'; // Role-based button visibility
  isFullyCancelled?: boolean; // Show only transaction history for fully cancelled bookings
}

interface Product {
  id: number;
  code: string;
  name: string;
  security_deposit: number;
  rent: number;
}

export function PaymentManagement({
  bookingId,
  totalAmount,
  securityDeposit,
  onPaymentUpdate,
  onStatusUpdate,
  userRole = 'admin', // Default to admin if not specified
  isFullyCancelled = false
}: PaymentManagementProps) {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [transactionType, setTransactionType] = useState<'payment' | 'refund' | 'adjustment'>('payment');
  const [formData, setFormData] = useState({
    amount: '',
    method: '',
    notes: '',
  });
  // Product-wise refund state (for enhanced refund modal)
  const [itemRefunds, setItemRefunds] = useState<{[key: number]: { selected: boolean; amount: string; notes: string }}>({});
  const [refundNarration, setRefundNarration] = useState(''); // General narration for the entire refund
  
  // Overpayment warning modal state
  const [showOverpaymentWarning, setShowOverpaymentWarning] = useState(false);
  const [overpaymentData, setOverpaymentData] = useState({
    totalRequired: 0,
    currentPaid: 0,
    paymentAmount: 0,
    newTotal: 0,
    overpayment: 0
  });

  useEffect(() => {
    fetchBookingData();
    fetchTransactions();
    fetchSummary();
    // Auto-check and update status on page load (for orders with completed refunds)
    calculateAndUpdateBookingStatus();
  }, [bookingId]);

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

  async function proceedWithPayment() {
    try {
      const amount = parseFloat(formData.amount);
      
      toast.info(`Recording payment with ₹${overpaymentData.overpayment.toLocaleString('en-IN')} overpayment as confirmed.`);
      
      await paymentTransactionsApi.create({
        booking_id: bookingId,
        amount: amount,
        type: transactionType,
        method: formData.method,
        recorded_by: 'Admin', // TODO: Get from auth context
        notes: formData.notes || undefined,
      });

      toast.success(transactionType === 'payment' ? 'Payment collected successfully!' : transactionType === 'refund' ? 'Refund processed successfully!' : 'Adjustment recorded successfully!');
      setShowRecordModal(false);
      setShowOverpaymentWarning(false);
      setFormData({ amount: '', method: '', notes: '' });
      
      // Refresh transactions and summary
      await fetchTransactions();
      await fetchSummary();
      
      // Update booking status based on new payment/refund
      await calculateAndUpdateBookingStatus();
      
      // Notify parent to refresh booking data
      onPaymentUpdate();
    } catch (error) {
      console.error('Error recording transaction:', error);
      toast.error('Error recording transaction');
    }
  }

  function cancelOverpayment() {
    setShowOverpaymentWarning(false);
    toast.info('Payment cancelled. Please adjust the amount.');
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

      // Validate against overpayment for payment type only - use backend summary
      if (transactionType === 'payment' && summary) {
        const totalRequired = summary.totals?.total_due || 0;
        const currentPaid = summary.totals?.total_paid || 0;
        const newTotal = currentPaid + amount;
        const overpayment = newTotal - totalRequired;
        
        // Warn if overpayment detected
        if (overpayment > 0) {
          setOverpaymentData({
            totalRequired,
            currentPaid,
            paymentAmount: amount,
            newTotal,
            overpayment
          });
          setShowOverpaymentWarning(true);
          return; // Stop here and wait for user confirmation
        }
      }

      await paymentTransactionsApi.create({
        booking_id: bookingId,
        amount: amount,
        type: transactionType,
        method: formData.method,
        recorded_by: 'Admin', // TODO: Get from auth context
        notes: formData.notes || undefined,
      });

      toast.success(transactionType === 'payment' ? 'Payment collected successfully!' : transactionType === 'refund' ? 'Refund processed successfully!' : 'Adjustment recorded successfully!');
      setShowRecordModal(false);
      setFormData({ amount: '', method: '', notes: '' });
      
      // Refresh transactions and summary
      await fetchTransactions();
      await fetchSummary();
      
      // Update booking status based on new payment/refund
      await calculateAndUpdateBookingStatus();
      
      // Notify parent to refresh booking data
      onPaymentUpdate();
    } catch (error) {
      console.error('Error recording transaction:', error);
      toast.error('Error recording transaction');
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
      
      // Use backend summary for overpayment
      const overpaymentAmount = summary?.overpayment || 0;
      
      // Need at least one selected item OR overpayment
      if (selectedItems.length === 0 && overpaymentAmount <= 0) {
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
        });
      }

      // Automatically add overpayment refund if it exists
      if (overpaymentAmount > 0) {
        let overpaymentNotes = `Overpayment Refund - ${formatCurrency(overpaymentAmount)}`;
        
        // Append general narration if provided
        if (refundNarration.trim()) {
          overpaymentNotes += ` | ${refundNarration.trim()}`;
        }
        
        await paymentTransactionsApi.create({
          booking_id: bookingId,
          amount: overpaymentAmount,
          type: 'refund',
          method: formData.method,
          recorded_by: 'Admin',
          notes: overpaymentNotes,
        });
      }

      const totalItems = selectedItems.length + (overpaymentAmount > 0 ? 1 : 0);
      toast.success(`Refund recorded successfully for ${totalItems} item(s)!`);
      setShowRecordModal(false);
      setFormData({ amount: '', method: '', notes: '' });
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
      toast.error('Error recording refund');
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
          const totalRequired = summary.totals?.total_due || 0;
          const totalPaid = summary.totals?.total_paid || 0;
          const balanceDue = summary.totals?.balance || 0;
          const overpayment = summary.overpayment || 0;
          const isFullyPaid = balanceDue <= 0;
          
          // Check for refunds in transactions
          const hasAnyRefund = transactions.some((t: any) => t.type === 'refund');
          
          return (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Payment Summary</h3>
                {userRole === 'admin' ? (
                  // Admin: Always show both buttons
                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        setTransactionType('payment');
                        setFormData({ amount: '', method: '', notes: '' });
                        setShowRecordModal(true);
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6"
                    >
                      💰 Collect Payment
                    </Button>
                    <Button
                      onClick={() => {
                        setTransactionType('refund');
                        setFormData({ amount: '', method: '', notes: '' });
                        setItemRefunds({}); // Reset product selections
                        setShowRecordModal(true);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6"
                    >
                      💸 Refund Payment
                    </Button>
                  </div>
                ) : (
                  // Salesman: Show single button based on payment status (old logic)
                  isFullyPaid ? (
                    <Button
                      onClick={() => {
                        setTransactionType('refund');
                        setFormData({ amount: '', method: '', notes: '' });
                        setItemRefunds({}); // Reset product selections
                        setShowRecordModal(true);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6"
                    >
                      💸 Refund Payment
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        setTransactionType('payment');
                        setFormData({ amount: '', method: '', notes: '' });
                        setShowRecordModal(true);
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6"
                    >
                      💰 Collect Payment
                    </Button>
                  )
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Total Required</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(totalRequired)}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Total Paid</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatCurrency(totalPaid)}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Balance Due</p>
                  <p className={`text-xl font-bold ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(balanceDue)}
                  </p>
                </div>
              </div>

              {/* Payment Breakdown from backend summary */}
              <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-bold text-blue-900 mb-3">💰 Payment Breakdown</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Rent Section */}
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <p className="text-xs text-gray-600 mb-2">🏠 Rental Amount</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Due:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(summary.charges.rent.due)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Paid:</span>
                        <span className="font-bold text-green-600">{formatCurrency(summary.charges.rent.paid)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Security Section */}
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <p className="text-xs text-gray-600 mb-2">🔒 Security Deposit</p>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Due:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(summary.charges.security.due)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700">Paid:</span>
                        <span className="font-bold text-green-600">{formatCurrency(summary.charges.security.paid)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Penalties Section - Show if penalties exist */}
                  {(summary.charges.penalties.due > 0 || summary.charges.fees.due > 0) && (
                    <div className="bg-white rounded-lg p-3 border border-red-200">
                      <p className="text-xs text-gray-600 mb-2">⚠️ Penalties & Fees</p>
                      <div className="space-y-1">
                        {summary.charges.penalties.due > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-700">Penalties:</span>
                            <span className="font-bold text-red-600">{formatCurrency(summary.charges.penalties.due)}</span>
                          </div>
                        )}
                        {summary.charges.fees.due > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-700">Fees:</span>
                            <span className="font-bold text-red-600">{formatCurrency(summary.charges.fees.due)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Transport Section - Show if transport exists */}
                  {summary.charges.transport.due > 0 && (
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <p className="text-xs text-gray-600 mb-2">🚚 Transport</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Due:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(summary.charges.transport.due)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Paid:</span>
                          <span className="font-bold text-green-600">{formatCurrency(summary.charges.transport.paid)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Status - uses backend summary values */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                {overpayment > 0 ? (
                  <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                    <div className="flex items-start">
                      <svg className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <p className="font-bold text-yellow-800 mb-1">⚠️ Overpayment Detected</p>
                        <p className="text-yellow-700 mb-2">
                          Customer has paid <span className="font-bold">{formatCurrency(overpayment)}</span> more than required.
                        </p>
                        <p className="text-sm text-yellow-700">
                          <strong>Total Required:</strong> {formatCurrency(totalRequired)} | 
                          <strong> Amount Paid:</strong> {formatCurrency(totalPaid)} | 
                          <strong> Overpayment:</strong> {formatCurrency(overpayment)}
                        </p>
                        <p className="text-sm text-yellow-700 mt-2">
                          💡 <strong>Action Required:</strong> Record a refund of {formatCurrency(overpayment)} to return the excess amount to the customer.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : balanceDue > 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-red-800 mb-1">Payment Due</p>
                        <p className="text-red-700">
                          Amount due: <span className="font-bold text-lg">{formatCurrency(balanceDue)}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Total Required</p>
                        <p className="text-lg font-bold">{formatCurrency(totalRequired)}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-green-800 mb-1">✅ Fully Paid</p>
                        <p className="text-green-700">
                          All payments received. Total: {formatCurrency(totalRequired)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Amount Paid</p>
                        <p className="text-lg font-bold text-green-600">{formatCurrency(totalPaid)}</p>
                      </div>
                    </div>
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
              // Exclude penalties that are automatic adjustments (from overpayment)
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
                    // Exclude penalties that are automatic adjustments (from overpayment)
                    // Keep penalties where customer actually paid (upgrade, cancellation with actual payment)
                    const isAutoAdjustmentPenalty = (
                      (transactionType === 'exchange_penalty' || 
                       transactionType === 'downgrade_penalty' || 
                       transactionType === 'cancellation_penalty') && 
                      method === 'adjustment'
                    );
                    return t.type !== 'date_change_charge' && !isAutoAdjustmentPenalty;
                  })
                  .map((transaction) => (
              <div
                key={transaction.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${getTransactionColor(transaction.type)}`}>
                        {transaction.type}
                      </span>
                      <span className="text-sm text-gray-600">
                        {formatDate(transaction.created_at)}
                      </span>
                    </div>
                    {/* Transaction Type */}
                    <div className="flex items-center gap-4 mb-2">
                      <span className="text-sm text-gray-600">
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
                        <span className="text-sm text-gray-600">
                          <span className="font-medium">Method:</span> {transaction.method}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg font-bold text-gray-900">
                        {transaction.type === 'refund' ? '-' : '+'}{formatCurrency(transaction.amount)}
                      </span>
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
                    setFormData({ amount: '', method: '', notes: '' });
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

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Method *
              </label>
              <select
                value={formData.method}
                onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Select method</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* General Narration Field */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Narration / Notes (Optional)
              </label>
              <textarea
                value={refundNarration}
                onChange={(e) => setRefundNarration(e.target.value)}
                placeholder="Enter transaction details, UPI ID, reference number, etc."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                💡 Add any additional details about this refund (e.g., UPI ID, reference number, bank details)
              </p>
            </div>

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
                      className={`border-2 rounded-lg p-4 ${
                        productHasRefund
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
                                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${
                                    hasError ? 'border-red-300 bg-red-50' : 'border-gray-300'
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
                                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 ${
                                    requiresNotes && !refundData.notes.trim() ? 'border-red-300 bg-red-50' : 'border-gray-300'
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

            {/* Overpayment Refund Section - uses backend summary */}
            {(summary?.overpayment || 0) > 0 && (
              <div className="mb-6">
                <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6">
                  <div className="flex items-start mb-4">
                    <svg className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-yellow-900 mb-1">Overpayment Detected</h3>
                      <p className="text-yellow-800 text-sm mb-3">
                        Customer has paid <span className="font-bold">{formatCurrency(summary!.overpayment)}</span> extra. 
                        This full overpayment amount will be automatically refunded along with product security deposits.
                      </p>
                      
                      <div className="bg-white rounded-lg p-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Overpayment Refund Amount
                          </label>
                          <div className="w-full px-4 py-3 border-2 border-yellow-400 bg-yellow-50 rounded-lg font-bold text-xl text-yellow-900 text-center">
                            {formatCurrency(summary!.overpayment)}
                          </div>
                          <p className="text-gray-600 text-xs mt-2 text-center">
                            ✓ Full overpayment will be refunded and noted in payment history
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                  setFormData({ amount: '', method: '', notes: '' });
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
          <div className="bg-white rounded-lg max-w-md w-full p-6">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method *
                </label>
                <select
                  value={formData.method}
                  onChange={(e) => setFormData({ ...formData, method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select method</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder={`Enter reason for ${transactionType}...`}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={() => {
                  setShowRecordModal(false);
                  setFormData({ amount: '', method: '', notes: '' });
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                className={`flex-1 text-white ${
                  transactionType === 'payment'
                    ? 'bg-green-600 hover:bg-green-700'
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

      {/* Overpayment Warning Modal */}
      {showOverpaymentWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-lg w-full overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4">
              <div className="flex items-center text-white">
                <svg className="w-8 h-8 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-xl font-bold">⚠️ Overpayment Warning</h3>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-gray-700 mb-6 text-lg">
                This payment will result in an <strong className="text-red-600">overpayment</strong>. Has the customer agreed to pay extra?
              </p>

              {/* Payment Breakdown */}
              <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-lg p-4 mb-6">
                <h4 className="font-bold text-gray-900 mb-3 text-center">Payment Breakdown</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Total Required:</span>
                    <span className="font-bold text-gray-900">{formatCurrency(overpaymentData.totalRequired)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Already Paid:</span>
                    <span className="font-bold text-green-600">{formatCurrency(overpaymentData.currentPaid)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-orange-200 pt-2">
                    <span className="text-gray-700">Remaining Due:</span>
                    <span className="font-bold text-blue-600">{formatCurrency(Math.max(0, overpaymentData.totalRequired - overpaymentData.currentPaid))}</span>
                  </div>
                  <div className="flex justify-between text-sm bg-yellow-100 -mx-2 px-2 py-2 rounded">
                    <span className="text-gray-700 font-semibold">Payment Amount:</span>
                    <span className="font-bold text-yellow-800">{formatCurrency(overpaymentData.paymentAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t-2 border-orange-300 pt-2">
                    <span className="text-gray-700 font-semibold">New Total Paid:</span>
                    <span className="font-bold text-gray-900">{formatCurrency(overpaymentData.newTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Overpayment Amount (Highlighted) */}
              <div className="bg-red-100 border-2 border-red-400 rounded-lg p-4 mb-6 text-center">
                <p className="text-sm text-red-700 mb-1">Overpayment Amount</p>
                <p className="text-3xl font-bold text-red-600">
                  +{formatCurrency(overpaymentData.overpayment)}
                </p>
              </div>

              {/* Warning Message */}
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm text-yellow-800 font-semibold">Important:</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Overpayments should only be recorded if the customer has explicitly agreed to pay extra (e.g., for negotiations, late fees, or additional charges).
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={cancelOverpayment}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold"
                >
                  ❌ Cancel & Edit Amount
                </Button>
                <Button
                  onClick={proceedWithPayment}
                  className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold"
                >
                  ✅ Proceed with Overpayment
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

