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
}

interface Product {
  id: number;
  code: string;
  name: string;
  security_deposit: number;
}

export function PaymentManagement({
  bookingId,
  totalAmount,
  securityDeposit,
  onPaymentUpdate,
  onStatusUpdate,
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

  useEffect(() => {
    fetchBookingData();
    fetchTransactions();
    fetchSummary();
  }, [bookingId]);

  async function fetchBookingData() {
    try {
      const response = await bookingsApi.getById(bookingId);
      const booking = response.data;
      const productsList = Array.isArray(booking.products) ? booking.products : [];
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

  // Calculate booking status based on payments and refunds (same logic as salesman portal)
  async function calculateAndUpdateBookingStatus() {
    try {
      // Fetch latest booking and transactions
      const bookingResponse = await bookingsApi.getById(bookingId);
      const currentBooking = bookingResponse.data;
      const transactionsResponse = await paymentTransactionsApi.getByBookingId(bookingId);
      const currentTransactions = transactionsResponse.data || [];

      const totalAmount = typeof currentBooking.total_amount === 'number'
        ? currentBooking.total_amount
        : parseFloat(currentBooking.total_amount || '0') || 0;
      const securityDeposit = typeof currentBooking.security_deposit === 'number'
        ? currentBooking.security_deposit
        : parseFloat(currentBooking.security_deposit || '0') || 0;
      const paidAmount = typeof currentBooking.paid_amount === 'number'
        ? currentBooking.paid_amount
        : parseFloat(currentBooking.paid_amount || '0') || 0;

      // Check for per-item refunds
      const products = Array.isArray(currentBooking.products) ? currentBooking.products : [];
      const refundTransactions = currentTransactions.filter((t: any) => t.type === 'refund');
      
      // Count how many products have refunds by checking transaction notes
      const productsWithRefunds = new Set<number>();
      refundTransactions.forEach((transaction: any) => {
        const notes = transaction.notes || '';
        products.forEach((product: any) => {
          // Check if transaction notes contain product code
          if (notes.includes(`(${product.code})`)) {
            productsWithRefunds.add(product.id);
          }
        });
      });
      
      const allProductsHaveRefunds = products.length > 0 && products.every((p: any) => productsWithRefunds.has(p.id));
      const hasAnyRefund = productsWithRefunds.size > 0;
      
      // Calculate total required
      const totalRequired = totalAmount + securityDeposit;
      const isFullyPaid = paidAmount >= totalRequired;
      const hasRentalPayment = paidAmount > 0;
      
      // Debug logging for PaymentManagement status calculation
      console.log('📊 PaymentManagement Status Calculation:', {
        bookingId: currentBooking.id,
        totalAmount,
        securityDeposit,
        totalRequired,
        paidAmount,
        isFullyPaid,
        hasRentalPayment,
        calculation: `${paidAmount} >= ${totalRequired} = ${isFullyPaid}`,
        currentStatus: currentBooking.status
      });

      let newStatus = currentBooking.status;

      // Status calculation logic with per-item refund support
      if (allProductsHaveRefunds) {
        // All products have refunds - completed
        newStatus = 'completed';
      } else if (hasAnyRefund) {
        // Some products have refunds - in progress (refund phase)
        newStatus = 'in_progress';
      } else if (isFullyPaid) {
        // Check if multiple products with different dates
        if (products.length > 1) {
          // Check if products have different dates
          const dates = products.map((p: any) => ({
            from: p.booked_from || currentBooking.booked_from,
            to: p.booked_to || currentBooking.booked_to
          }));
          
          const uniqueDates = new Set(dates.map((d: any) => `${d.from}-${d.to}`));
          if (uniqueDates.size > 1) {
            // Multiple products with different dates - Partially Completed
            newStatus = 'in_progress'; // Will display as "Partially Completed" or "Under Process"
          } else {
            // All paid, same dates - Under Process
            newStatus = 'in_progress';
          }
        } else {
          // All paid, single product - Under Process
          newStatus = 'in_progress';
        }
      } else if (hasRentalPayment) {
        // At least some rental payment recorded - Confirmed
        newStatus = 'confirmed';
      } else {
        // No payment recorded - Pending
        newStatus = 'pending';
      }

      // Debug: Log what status will be set
      console.log('📊 PaymentManagement Status Decision:', {
        bookingId: currentBooking.id,
        currentStatus: currentBooking.status,
        newStatus,
        willUpdate: currentBooking.status !== newStatus,
        reason: allProductsHaveRefunds ? 'all refunds' : 
                hasAnyRefund ? 'partial refunds' :
                isFullyPaid ? 'fully paid' :
                hasRentalPayment ? 'rental payment' : 'no payment'
      });
      
      // Only update if status changed
      if (currentBooking.status !== newStatus) {
        // Check if trying to confirm a booking that has a credit note
        if (currentBooking.status !== 'confirmed' && newStatus === 'confirmed') {
          try {
            const creditNotesResponse = await creditNotesApi.getByBookingId(bookingId);
            const creditNotes = creditNotesResponse.data || [];
            
            if (creditNotes.length > 0) {
              const activeCreditNote = creditNotes.find((note: any) => {
                const validUntil = new Date(note.valid_until);
                const now = new Date();
                const availableAmount = parseFloat(note.amount || 0) - parseFloat(note.used_amount || 0);
                return validUntil >= now && availableAmount > 0;
              });
              
              if (activeCreditNote) {
                toast.error(`Cannot confirm booking. An active credit note (ID: ${activeCreditNote.id}) exists for this booking. Please delete the credit note first.`);
                return;
              }
            }
          } catch (error) {
            console.error('Error checking credit notes:', error);
            // Continue with update if check fails
          }
        }
        
        await bookingsApi.update(bookingId, {
          customer_name: currentBooking.customer_name,
          customer_phone: currentBooking.customer_phone || '',
          customer_address: currentBooking.customer_address || '',
          booked_from: currentBooking.booked_from?.split('T')[0] || currentBooking.booked_from || '',
          booked_to: currentBooking.booked_to?.split('T')[0] || currentBooking.booked_to || '',
          status: newStatus,
        });
        
        console.log(`✅ Booking status updated from ${currentBooking.status} to ${newStatus}`);
        
        // Notify parent component of status update
        if (onStatusUpdate) {
          onStatusUpdate(newStatus);
        }
      }
    } catch (statusError) {
      console.error('Error updating booking status:', statusError);
      // Don't fail the transaction if status update fails
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

      await paymentTransactionsApi.create({
        booking_id: bookingId,
        amount: amount,
        type: transactionType,
        method: formData.method,
        recorded_by: 'Admin', // TODO: Get from auth context
        notes: formData.notes || undefined,
      });

      toast.success(`${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)} recorded successfully!`);
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

  if (loading) {
    return <div className="text-center py-4">Loading payment history...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Payment Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {/* Calculate totals */}
        {(() => {
          const totalAmountNum = typeof totalAmount === 'number' ? totalAmount : parseFloat(String(totalAmount)) || 0;
          let securityDepositNum = typeof securityDeposit === 'number' ? securityDeposit : parseFloat(String(securityDeposit)) || 0;
          
          // If security deposit is 0, calculate from products
          if (securityDepositNum === 0 && products.length > 0) {
            securityDepositNum = products.reduce((sum: number, product: any) => {
              const productSecurity = typeof product.security_deposit === 'number'
                ? product.security_deposit
                : parseFloat(String(product.security_deposit || '0')) || 0;
              return sum + productSecurity;
            }, 0);
          }
          
          const totalRequired = totalAmountNum + securityDepositNum;
          
          // Calculate netAmount excluding date_change_charge, exchange_penalty, and exchange_lapsed transactions
          // Date change charges, exchange penalties, and lapsed amounts are separate and don't affect payment calculations
          // Also exclude any transactions with date change notes (handles old transactions recorded as 'payment')
          const lapsedAmounts: any[] = [];
          const lapsedRefunds: any[] = [];
          const netAmountFromTransactions = transactions.reduce((sum: number, t: any) => {
            // Exclude date_change_charge type
            if (t.type === 'date_change_charge') {
              console.log('Excluding date_change_charge transaction:', t);
              return sum;
            }
            
            // CRITICAL: Exclude exchange_penalty transactions (collected separately at exchange time)
            // These should NEVER affect rent or security calculations
            const method = String(t.method || '').toLowerCase().trim();
            if (method === 'exchange_penalty' || method === 'exchange') {
              console.log('Excluding exchange_penalty transaction:', t);
              return sum;
            }
            
            // CRITICAL: Exclude exchange_lapsed transactions (non-refundable amounts from cancelled exchanges)
            // These are kept for record but don't affect payment calculations
            if (method === 'exchange_lapsed') {
              console.log('⚠️ LAPSED (non-refundable) transaction:', t);
              lapsedAmounts.push(t);
              return sum;
            }
            
            // CRITICAL: Track lapsed_refund (one-time refunds of lapsed amounts)
            // These are special refunds that don't affect rent/security calculations but reduce lapsed amount display
            if (method === 'lapsed_refund') {
              console.log('⚠️ LAPSED REFUND (does not affect calculations):', t);
              lapsedRefunds.push(t);
              return sum;
            }
            
            // Also exclude transactions with date change notes (handles old transactions)
            const notes = (t.notes || '').toLowerCase();
            if (notes.includes('date change charge') || 
                notes.includes('date change') || 
                notes.includes('modify booking') ||
                notes.includes('booking date change')) {
              console.log('Excluding transaction with date change note:', t);
              return sum;
            }
            
            // Exclude transactions with exchange penalty/charge notes (unless it's rent difference)
            if (notes.includes('exchange penalty') || notes.includes('exchange charge')) {
              // Keep exchange_upgrade (rent differences) only if not lapsed
              if (method !== 'exchange_upgrade' && method !== 'exchange_lapsed' && !notes.includes('additional rent') && !notes.includes('rent difference')) {
                console.log('Excluding transaction with exchange penalty note:', t);
                return sum;
              }
            }
            
            // Include refunds in calculation (they may exist to correct overpayments)
            // Only exclude exchange_downgrade refunds which shouldn't exist
            if (t.type === 'refund' && method === 'exchange_downgrade') {
              console.log('Excluding exchange_downgrade REFUND:', t);
              return sum;
            }
            
            if (t.type === 'refund') {
              console.log('Including REFUND transaction:', t);
            }
            
            // Calculate amount
            const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
            
            // Specifically log exchange_upgrade payments
            if (method === 'exchange_upgrade' || notes.includes('additional rent') || notes.includes('rent difference')) {
              console.log('✅ INCLUDING RENT DIFFERENCE payment:', {
                id: t.id,
                method: method,
                amount: amount,
                notes: notes.substring(0, 80)
              });
            }
            
            return sum + amount; // Only payments remain after filtering refunds
          }, 0);
          
          // Use the recalculated value to ensure date_change_charge is excluded
          const netAmount = netAmountFromTransactions;
          
          console.log('========================================');
          console.log('💰 PAYMENT BREAKDOWN - PaymentManagement Component');
          console.log('========================================');
          console.log('Total transactions processed:', transactions.length);
          console.log('Net Amount (from transactions):', netAmount);
          console.log('Total Amount (rent):', totalAmount);
          console.log('Security Deposit:', securityDeposit);
          console.log('Rent Paid:', Math.min(netAmount, totalAmount));
          console.log('Rent Due:', Math.max(0, totalAmount - netAmount));
          console.log('========================================');
          
          // Debug log to help identify issues
          if (netAmount > totalRequired) {
            console.log('Overpayment calculation:', {
              netAmount,
              totalRequired,
              overpayment: netAmount - totalRequired,
              transactions: transactions.map((t: any) => ({
                id: t.id,
                type: t.type,
                amount: t.amount,
                notes: t.notes,
                excluded: t.type === 'date_change_charge' || (t.notes || '').toLowerCase().includes('date change')
              }))
            });
          }
          
          // Check if any refunds have been processed (exclude lapsed_refund)
          const hasAnyRefund = transactions.some((t: any) => {
            const method = String(t.method || '').toLowerCase().trim();
            return t.type === 'refund' && method !== 'lapsed_refund';
          });
          const totalRefunds = parseFloat(String(summary?.total_refunds || '0')) || 0;
          
          // Calculate which products have refunds (exclude lapsed_refund)
          const refundTransactions = transactions.filter((t: any) => {
            const method = String(t.method || '').toLowerCase().trim();
            return t.type === 'refund' && method !== 'lapsed_refund';
          });
          const productsWithRefunds = new Set<number>();
          refundTransactions.forEach((transaction: any) => {
            const notes = transaction.notes || '';
            products.forEach((product: any) => {
              if (notes.includes(`(${product.code})`)) {
                productsWithRefunds.add(product.id);
              }
            });
          });
          
          // Calculate remaining security to refund (only for products without refunds)
          const remainingSecurityToRefund = products
            .filter((p: any) => !productsWithRefunds.has(p.id))
            .reduce((sum: number, p: any) => {
              const productSecurity = typeof p.security_deposit === 'number'
                ? p.security_deposit
                : parseFloat(String(p.security_deposit || '0')) || 0;
              return sum + productSecurity;
            }, 0);
          
          const overpayment = netAmount > totalRequired ? netAmount - totalRequired : 0;
          // Once refunds exist, payment phase is complete - we're now in refund/return phase
          const amountDue = hasAnyRefund ? 0 : (netAmount < totalRequired ? totalRequired - netAmount : 0);
          const isFullyPaid = hasAnyRefund ? true : (netAmount >= totalRequired);
          
          return (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Payment Summary</h3>
                {isFullyPaid ? (
                  <Button
                    onClick={() => {
                      setTransactionType('refund');
                      setShowRecordModal(true);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Record Refund
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setTransactionType('payment');
                      setShowRecordModal(true);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Record Payment
                  </Button>
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
                  <p className="text-xs text-gray-600 mb-1">Total Payments</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatCurrency(
                      transactions
                        .filter((t: any) => {
                          // Only include 'payment' type, exclude date change charges
                          if (t.type !== 'payment') return false;
                          // Also exclude transactions with date change notes
                          const notes = (t.notes || '').toLowerCase();
                          return !notes.includes('date change charge') && !notes.includes('date change');
                        })
                        .reduce((sum: number, t: any) => {
                          const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
                          return sum + amount;
                        }, 0)
                    )}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Total Refunds</p>
                  <p className="text-xl font-bold text-red-600">
                    {formatCurrency(summary?.total_refunds)}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-xs text-gray-600 mb-1">Net Amount Paid</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(netAmount)}
                  </p>
                </div>
              </div>

              {/* Lapsed Amount Warning (Non-refundable) */}
              {lapsedAmounts.length > 0 && (
                <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-sm font-medium text-yellow-800">
                        ⚠️ Lapsed Amount (Non-refundable)
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p className="mb-2">
                          The following amount(s) were paid for exchanges that were later cancelled. 
                          As per policy, exchange-related payments are <strong>non-refundable</strong> and cannot be adjusted against other dues.
                        </p>
                        {lapsedAmounts.map((t: any) => {
                          const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
                          return (
                            <div key={t.id} className="bg-yellow-100 p-2 rounded mb-2">
                              <p className="font-semibold">₹{amount.toFixed(2)}</p>
                              <p className="text-xs mt-1">{t.notes}</p>
                            </div>
                          );
                        })}
                        
                        {/* Calculate net lapsed amount after refunds */}
                        {(() => {
                          const totalLapsed = lapsedAmounts.reduce((sum: number, t: any) => {
                            const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
                            return sum + amount;
                          }, 0);
                          
                          const totalRefunded = lapsedRefunds.reduce((sum: number, t: any) => {
                            const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
                            return sum + amount;
                          }, 0);
                          
                          const netLapsed = totalLapsed - totalRefunded;
                          
                          return (
                            <>
                              {lapsedRefunds.length > 0 && (
                                <div className="bg-green-100 border border-green-300 p-2 rounded mb-2">
                                  <p className="text-xs font-semibold text-green-800">
                                    ✅ Refunded: {formatCurrency(totalRefunded)}
                                  </p>
                                  {lapsedRefunds.map((t: any) => {
                                    const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
                                    return (
                                      <p key={t.id} className="text-xs text-green-700 mt-1">
                                        • ₹{amount.toFixed(2)} - {t.notes?.substring(0, 80)}
                                      </p>
                                    );
                                  })}
                                </div>
                              )}
                              
                              <div className="bg-yellow-200 p-2 rounded mt-2">
                                <p className="text-xs font-bold text-yellow-900">
                                  {lapsedRefunds.length > 0 ? 'Net ' : 'Total '}Lapsed Amount: {formatCurrency(netLapsed)}
                                </p>
                                {lapsedRefunds.length > 0 && (
                                  <p className="text-xs text-yellow-800 mt-1">
                                    (Original: {formatCurrency(totalLapsed)} - Refunded: {formatCurrency(totalRefunded)})
                                  </p>
                                )}
                              </div>
                            </>
                          );
                        })()}
                        
                        <p className="text-xs mt-2 bg-yellow-200 p-2 rounded">
                          💡 <strong>Note:</strong> Lapsed amounts are non-refundable as per exchange policy. Any refunds already processed are shown above.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Payment Breakdown - Always show */}
              <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-4">
                <h4 className="text-sm font-bold text-blue-900 mb-3">💰 Payment Breakdown</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Rent Section */}
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <p className="text-xs text-gray-600 mb-2">🏠 Rental Amount</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Total Rent:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(totalAmountNum)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Paid:</span>
                          <span className="font-bold text-green-600">{formatCurrency(Math.min(netAmount, totalAmountNum))}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                          <span className="text-gray-700 font-semibold">Rent Due:</span>
                          <span className={`font-bold ${netAmount >= totalAmountNum ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(Math.max(0, totalAmountNum - netAmount))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Security Section */}
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <p className="text-xs text-gray-600 mb-2">🔒 Security Deposit</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Total Security:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(securityDepositNum)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Paid:</span>
                          <span className="font-bold text-green-600">
                            {formatCurrency(Math.max(0, Math.min(securityDepositNum, netAmount - totalAmountNum)))}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                          <span className="text-gray-700 font-semibold">Security Due:</span>
                          <span className={`font-bold ${netAmount >= totalRequired ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(Math.max(0, securityDepositNum - Math.max(0, netAmount - totalAmountNum)))}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Total Summary */}
                    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-3 border border-purple-200">
                      <p className="text-xs text-gray-600 mb-2">📊 Total Summary</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Grand Total:</span>
                          <span className="font-bold text-gray-900">{formatCurrency(totalRequired)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">Total Paid:</span>
                          <span className="font-bold text-green-600">{formatCurrency(netAmount)}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-1 border-t border-purple-200">
                          <span className="text-gray-700 font-semibold">Balance Due:</span>
                          <span className={`font-bold text-lg ${amountDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(amountDue)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              {/* Payment Status */}
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                {products.length > 0 && productsWithRefunds.size === products.length ? (
                  // All refunds complete (all products have refunds)
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-bold text-green-800 mb-1">✅ Order Completed</p>
                        <p className="text-green-700">
                          All refunds have been processed. Security refunded: {formatCurrency(totalRefunds)}
                        </p>
                        {totalRefunds < securityDepositNum && (
                          <p className="text-sm text-orange-700 mt-1">
                            Total charges deducted: {formatCurrency(securityDepositNum - totalRefunds)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Security Deposit</p>
                        <p className="text-lg font-bold text-blue-600">{formatCurrency(securityDepositNum)}</p>
                      </div>
                    </div>
                    
                    {/* Show refund details and deduction reasons */}
                    {transactions.filter((t: any) => {
                      const method = String(t.method || '').toLowerCase().trim();
                      return t.type === 'refund' && method !== 'lapsed_refund';
                    }).length > 0 && (
                      <div className="mt-4 pt-3 border-t border-green-200">
                        <p className="text-sm font-semibold text-green-900 mb-2">📋 Refund Details:</p>
                        <div className="space-y-2">
                          {transactions.filter((t: any) => {
                            const method = String(t.method || '').toLowerCase().trim();
                            return t.type === 'refund' && method !== 'lapsed_refund';
                          }).map((refund: any) => {
                            const refundAmount = typeof refund.amount === 'number' 
                              ? refund.amount 
                              : parseFloat(String(refund.amount || '0')) || 0;
                            
                            // Find the product this refund is for
                            const notes = refund.notes || '';
                            let matchedProduct = null;
                            let chargesDeducted = 0;
                            
                            for (const product of products) {
                              if (notes.includes(`(${product.code})`)) {
                                matchedProduct = product;
                                const productSecurity = typeof product.security_deposit === 'number'
                                  ? product.security_deposit
                                  : parseFloat(String(product.security_deposit || '0')) || 0;
                                chargesDeducted = productSecurity - refundAmount;
                                break;
                              }
                            }
                            
                            return (
                              <div key={refund.id} className="bg-white rounded-lg p-3 border border-green-200">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex-1">
                                    {matchedProduct ? (
                                      <div className="mb-2">
                                        <p className="text-sm font-semibold text-gray-900 mb-1">
                                          {matchedProduct.name} ({matchedProduct.code})
                                        </p>
                                        <div className="grid grid-cols-3 gap-2 text-xs">
                                          <div className="bg-blue-50 p-2 rounded">
                                            <p className="text-gray-600">Security Deposit</p>
                                            <p className="font-bold text-blue-600">
                                              {formatCurrency(matchedProduct.security_deposit)}
                                            </p>
                                          </div>
                                          <div className="bg-green-50 p-2 rounded">
                                            <p className="text-gray-600">Refunded</p>
                                            <p className="font-bold text-green-600">
                                              {formatCurrency(refundAmount)}
                                            </p>
                                          </div>
                                          {chargesDeducted > 0 && (
                                            <div className="bg-red-50 p-2 rounded">
                                              <p className="text-gray-600">Charges Deducted</p>
                                              <p className="font-bold text-red-600">
                                                -{formatCurrency(chargesDeducted)}
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-sm font-medium text-gray-900 mb-1">
                                        Refunded: <span className="text-green-600">{formatCurrency(refundAmount)}</span>
                                      </p>
                                    )}
                                    <p className="text-xs text-gray-500">
                                      {formatDate(refund.created_at)} • {refund.method || 'N/A'} • by {refund.recorded_by}
                                    </p>
                                  </div>
                                </div>
                                {refund.notes && (
                                  <div className="bg-green-50 border-l-3 border-l-green-500 pl-3 py-2 mt-2">
                                    <p className="text-xs font-semibold text-green-800 mb-1">
                                      {chargesDeducted > 0 ? '💬 Reason for deduction:' : '💬 Notes:'}
                                    </p>
                                    <p className="text-sm text-green-900">{refund.notes}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : hasAnyRefund ? (
                  // Refunds in progress
                  <div className="space-y-3">
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-bold text-yellow-800 mb-1">⏳ Refunds In Progress</p>
                          <p className="text-yellow-700">
                            Refunded so far: <span className="font-bold">{formatCurrency(totalRefunds)}</span>
                          </p>
                          <p className="text-sm text-yellow-700 mt-1">
                            Remaining to refund: <span className="font-bold">{formatCurrency(remainingSecurityToRefund)}</span>
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            ({products.length - productsWithRefunds.size} item{products.length - productsWithRefunds.size !== 1 ? 's' : ''} pending)
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Total Security</p>
                          <p className="text-lg font-bold">{formatCurrency(securityDepositNum)}</p>
                        </div>
                      </div>
                      
                      {/* Show refund details and deduction reasons */}
                      {transactions.filter((t: any) => {
                        const method = String(t.method || '').toLowerCase().trim();
                        return t.type === 'refund' && method !== 'lapsed_refund';
                      }).length > 0 && (
                        <div className="mt-4 pt-3 border-t border-yellow-200">
                          <p className="text-sm font-semibold text-yellow-900 mb-2">📋 Refund Details:</p>
                          <div className="space-y-2">
                            {transactions.filter((t: any) => {
                              const method = String(t.method || '').toLowerCase().trim();
                              return t.type === 'refund' && method !== 'lapsed_refund';
                            }).map((refund: any) => {
                              const refundAmount = typeof refund.amount === 'number' 
                                ? refund.amount 
                                : parseFloat(String(refund.amount || '0')) || 0;
                              
                              // Find the product this refund is for
                              const notes = refund.notes || '';
                              let matchedProduct = null;
                              let chargesDeducted = 0;
                              
                              for (const product of products) {
                                if (notes.includes(`(${product.code})`)) {
                                  matchedProduct = product;
                                  const productSecurity = typeof product.security_deposit === 'number'
                                    ? product.security_deposit
                                    : parseFloat(String(product.security_deposit || '0')) || 0;
                                  chargesDeducted = productSecurity - refundAmount;
                                  break;
                                }
                              }
                              
                              return (
                                <div key={refund.id} className="bg-white rounded-lg p-3 border border-yellow-200">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      {matchedProduct ? (
                                        <div className="mb-2">
                                          <p className="text-sm font-semibold text-gray-900 mb-1">
                                            {matchedProduct.name} ({matchedProduct.code})
                                          </p>
                                          <div className="grid grid-cols-3 gap-2 text-xs">
                                            <div className="bg-blue-50 p-2 rounded">
                                              <p className="text-gray-600">Security Deposit</p>
                                              <p className="font-bold text-blue-600">
                                                {formatCurrency(matchedProduct.security_deposit)}
                                              </p>
                                            </div>
                                            <div className="bg-green-50 p-2 rounded">
                                              <p className="text-gray-600">Refunded</p>
                                              <p className="font-bold text-green-600">
                                                {formatCurrency(refundAmount)}
                                              </p>
                                            </div>
                                            {chargesDeducted > 0 && (
                                              <div className="bg-red-50 p-2 rounded">
                                                <p className="text-gray-600">Charges Deducted</p>
                                                <p className="font-bold text-red-600">
                                                  -{formatCurrency(chargesDeducted)}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-sm font-medium text-gray-900 mb-1">
                                          Refunded: <span className="text-green-600">{formatCurrency(refundAmount)}</span>
                                        </p>
                                      )}
                                      <p className="text-xs text-gray-500">
                                        {formatDate(refund.created_at)} • {refund.method || 'N/A'} • by {refund.recorded_by}
                                      </p>
                                    </div>
                                  </div>
                                  {refund.notes && (
                                    <div className="bg-yellow-50 border-l-3 border-l-yellow-500 pl-3 py-2 mt-2">
                                      <p className="text-xs font-semibold text-yellow-800 mb-1">
                                        {chargesDeducted > 0 ? '💬 Reason for deduction:' : '💬 Notes:'}
                                      </p>
                                      <p className="text-sm text-yellow-900">{refund.notes}</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : overpayment > 0 ? (
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
                          <strong> Amount Paid:</strong> {formatCurrency(netAmount)} | 
                          <strong> Overpayment:</strong> {formatCurrency(overpayment)}
                        </p>
                        <p className="text-sm text-yellow-700 mt-2">
                          💡 <strong>Action Required:</strong> Record a refund of {formatCurrency(overpayment)} to return the excess amount to the customer.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : amountDue > 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-red-800 mb-1">Payment Due</p>
                        <p className="text-red-700">
                          Amount due: <span className="font-bold text-lg">{formatCurrency(amountDue)}</span>
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
                        <p className="text-lg font-bold text-green-600">{formatCurrency(netAmount)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Adjustments (if any) */}
              {summary?.total_adjustments && parseFloat(summary.total_adjustments) > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg mb-4">
                  <p className="text-xs text-gray-600 mb-1">Adjustments</p>
                  <p className="text-xl font-bold text-blue-600">
                    {formatCurrency(summary.total_adjustments)}
                  </p>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Transaction History */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction History</h3>
        
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No transactions yet</p>
        ) : (
          <div className="space-y-4">
            {/* Regular Transactions (payments, refunds, adjustments) */}
            {transactions.filter((t: any) => t.type !== 'date_change_charge').length > 0 && (
          <div className="space-y-3">
                {transactions
                  .filter((t: any) => t.type !== 'date_change_charge')
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
                    <div className="flex items-center gap-4 mb-2">
                      <span className="text-lg font-bold text-gray-900">
                        {transaction.type === 'refund' ? '-' : '+'}{formatCurrency(transaction.amount)}
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
                      Recorded by: {transaction.recorded_by}
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
                              Recorded by: {transaction.recorded_by}
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
      {showRecordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Record {transactionType.charAt(0).toUpperCase() + transactionType.slice(1)}
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
      )}
    </div>
  );
}

