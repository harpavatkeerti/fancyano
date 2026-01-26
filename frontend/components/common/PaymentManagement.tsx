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

  // Calculate booking status based on payments and refunds
  async function calculateAndUpdateBookingStatus() {
    try {
      // Fetch latest booking, transactions, and payment summary
      const bookingResponse = await bookingsApi.getById(bookingId);
      const currentBooking = bookingResponse.data;
      const transactionsResponse = await paymentTransactionsApi.getByBookingId(bookingId);
      const currentTransactions = transactionsResponse.data || [];
      const summaryResponse = await bookingsApi.getPaymentSummary(bookingId);
      const paymentSummary = summaryResponse.data;

      // ⚠️ CRITICAL: Don't update status if booking is cancelled or partially cancelled
      if (currentBooking.status === 'cancelled' || currentBooking.status === 'partially_cancelled') {
        console.log('⚠️ Booking is cancelled/partially_cancelled - skipping automatic status update');
        return;
      }

      // Use payment summary for accurate totals
      const totalRent = paymentSummary.totals.rent_due + paymentSummary.totals.rent_paid;
      const totalSecurity = paymentSummary.totals.security_due + paymentSummary.totals.security_paid;
      const totalPaid = paymentSummary.totals.total_paid;

      // Check for per-item refunds
      // Filter out cancelled products
      const products = Array.isArray(currentBooking.products) 
        ? currentBooking.products.filter((p: any) => p.status !== 'cancelled')
        : [];
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
      
      // Calculate total refunds (excluding lapsed_refund)
      const totalRefundsProcessed = refundTransactions
        .filter((t: any) => String(t.method || '').toLowerCase().trim() !== 'lapsed_refund')
        .reduce((sum: number, t: any) => {
          const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
          return sum + amount;
        }, 0);
      
      // Check if refund process is complete
      const hasRefundTransaction = refundTransactions.filter((t: any) => 
        String(t.method || '').toLowerCase().trim() !== 'lapsed_refund'
      ).length > 0;
      
      // Calculate total required
      const totalRequired = totalRent + totalSecurity;
      const isFullyPaid = totalPaid >= totalRequired;
      const hasRentalPayment = totalPaid > 0;
      
      // Refund process is complete if:
      // - All products have refunds, OR
      // - Fully paid AND has at least one refund transaction
      const refundProcessComplete = allProductsHaveRefunds || 
                                    (isFullyPaid && hasRefundTransaction);
      
      // Debug logging for PaymentManagement status calculation
      console.log('📊 PaymentManagement Status Calculation:', {
        bookingId: currentBooking.id,
        totalRent,
        totalSecurity,
        totalRequired,
        totalPaid,
        isFullyPaid,
        hasRentalPayment,
        calculation: `${totalPaid} >= ${totalRequired} = ${isFullyPaid}`,
        currentStatus: currentBooking.status
      });

      let newStatus = currentBooking.status;

      // Status calculation logic with per-item refund support
      if (refundProcessComplete) {
        // Refund process is complete (regardless of amount - could be 0% to 100% refund)
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
        totalRefundsProcessed,
        securityDeposit,
        hasRefundTransaction,
        isFullyPaid,
        refundProcessComplete,
        allProductsHaveRefunds,
        reason: refundProcessComplete ? 'refund process completed' : 
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

      // Validate against overpayment for payment type only
      if (transactionType === 'payment') {
        // Calculate current totals
        const totalAmountNum = typeof totalAmount === 'number' ? totalAmount : parseFloat(String(totalAmount)) || 0;
        
        // ALWAYS fetch current products for accurate security deposit calculation
        let securityDepositNum = 0;
        try {
          const bookingResponse = await bookingsApi.getById(bookingId);
          // Filter out cancelled products
          const currentProducts = Array.isArray(bookingResponse.data.products) 
            ? bookingResponse.data.products.filter((p: any) => p.status !== 'cancelled')
            : [];
          
          if (currentProducts.length > 0) {
            securityDepositNum = currentProducts.reduce((sum: number, product: any) => {
              const productSecurity = typeof product.security_deposit === 'number'
                ? product.security_deposit
                : parseFloat(String(product.security_deposit || '0')) || 0;
              return sum + productSecurity;
            }, 0);
          } else {
            // Fallback only if no products at all
            securityDepositNum = typeof securityDeposit === 'number' ? securityDeposit : parseFloat(String(securityDeposit)) || 0;
          }
          
          console.log('🔐 SECURITY DEPOSIT FOR VALIDATION:');
          console.log('  Products count:', currentProducts.length);
          console.log('  Calculated from products:', securityDepositNum);
          console.log('  Props value (reference):', securityDeposit);
        } catch (error) {
          console.error('Error fetching products for validation:', error);
          // Fallback to existing products state
          if (products.length > 0) {
            securityDepositNum = products.reduce((sum: number, product: any) => {
              const productSecurity = typeof product.security_deposit === 'number'
                ? product.security_deposit
                : parseFloat(String(product.security_deposit || '0')) || 0;
              return sum + productSecurity;
            }, 0);
          } else {
            securityDepositNum = typeof securityDeposit === 'number' ? securityDeposit : parseFloat(String(securityDeposit)) || 0;
          }
        }
        
        const totalRequired = totalAmountNum + securityDepositNum;
        
        // Calculate current paid amount
        const currentTransactions = await paymentTransactionsApi.getByBookingId(bookingId);
        const currentPaid = currentTransactions.data.reduce((sum: number, t: any) => {
          // Exclude date_change_charge, exchange_penalty, exchange_lapsed
          if (t.type === 'date_change_charge') return sum;
          if (t.method === 'exchange_penalty' || t.method === 'downgrade_penalty' || t.method === 'exchange_lapsed' || t.method === 'lapsed_refund') return sum;
          
          const tAmount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
          return sum + (t.type === 'refund' ? -tAmount : tAmount);
        }, 0);
        
        const newTotal = currentPaid + amount;
        const overpayment = newTotal - totalRequired;
        
        console.log('💰 OVERPAYMENT CHECK:');
        console.log('  Total Required:', totalRequired);
        console.log('  Current Paid:', currentPaid);
        console.log('  New Payment:', amount);
        console.log('  New Total:', newTotal);
        console.log('  Overpayment:', overpayment);
        
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
      
      // Calculate overpayment
      const totalRequired = totalAmount + securityDeposit;
      const paidAmount = transactions.reduce((sum: number, t: any) => {
        if (t.type === 'date_change_charge') return sum;
        
        const method = String(t.method || '').toLowerCase().trim();
        if (method === 'exchange_penalty' || method === 'downgrade_penalty' || method === 'exchange_lapsed' || method === 'lapsed_refund') {
          return sum;
        }
        
        const notes = (t.notes || '').toLowerCase();
        if (notes.includes('date change charge') || notes.includes('exchange penalty')) {
          return sum;
        }
        
        const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
        return sum + (t.type === 'refund' ? -amount : amount);
      }, 0);
      
      const overpaymentAmount = Math.max(0, paidAmount - totalRequired);
      
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
        {/* Calculate totals */}
        {(() => {
          const totalAmountNum = typeof totalAmount === 'number' ? totalAmount : parseFloat(String(totalAmount)) || 0;
          
          // ALWAYS calculate security deposit from products to ensure accuracy
          // CRITICAL: Security deposit is NEVER affected by discount - it's always the sum of product security deposits
          // This prevents issues where booking.security_deposit might include transportation, discount, or other incorrect values
          let securityDepositNum = 0;
          if (products.length > 0) {
            securityDepositNum = products.reduce((sum: number, product: any) => {
              const productSecurity = typeof product.security_deposit === 'number'
                ? product.security_deposit
                : parseFloat(String(product.security_deposit || '0')) || 0;
              return sum + productSecurity;
            }, 0);
          } else {
            // Fallback to passed securityDeposit only if no products
            securityDepositNum = typeof securityDeposit === 'number' ? securityDeposit : parseFloat(String(securityDeposit)) || 0;
          }
          
          console.log('🔐 SECURITY DEPOSIT CALCULATION (Discount NOT applied):');
          console.log('  Products count:', products.length);
          console.log('  Calculated from products (no discount):', securityDepositNum);
          console.log('  Props value (for reference):', securityDeposit);
          console.log('  Note: Security deposit is NEVER affected by discount');
          
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
            const transactionType = String(t.transaction_type || '').toLowerCase().trim();
            
            // Exclude delayed_charges transactions - they are separate charges that don't affect rent/security
            if (transactionType === 'delayed_charges' || method === 'delayed_charges') {
              console.log('Excluding delayed_charges transaction:', t);
              return sum;
            }
            
            if (method === 'exchange_penalty' || method === 'exchange' || transactionType === 'exchange_penalty' || transactionType === 'exchange') {
              console.log('Excluding exchange_penalty transaction:', t);
              return sum;
            }
            
            // CRITICAL: Exclude downgrade_penalty transactions (rent_diff when downgrading)
            // This is a non-refundable penalty charge, should NOT be counted as security payment
            if (transactionType === 'downgrade_penalty' || method === 'downgrade_penalty') {
              console.log('Excluding downgrade_penalty transaction:', t);
              return sum;
            }
            
            // CRITICAL: Exclude cancellation_penalty transactions
            // These are non-refundable penalty charges
            if (transactionType === 'cancellation_penalty') {
              console.log('Excluding cancellation_penalty transaction:', t);
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
            
            // Also exclude transactions with exchange penalty/charge notes (for backward compatibility)
            if (notes.includes('exchange penalty') || notes.includes('exchange charge')) {
              // Keep exchange_upgrade (rent differences) only if not lapsed
              if (method !== 'exchange_upgrade' && method !== 'exchange_lapsed' && !notes.includes('additional rent') && !notes.includes('rent difference')) {
                console.log('Excluding transaction with exchange penalty note:', t);
                return sum;
              }
            }
            
            // Exclude delayed charges transactions - they are separate charges that don't affect rent/security calculations
            if (t.transaction_type === 'delayed_charges' || 
                method === 'delayed_charges' ||
                notes.includes('Delayed return charges') ||
                notes.includes('delayed return charges')) {
              console.log('Excluding delayed charges transaction:', t);
              return sum;
            }
            
            // Include refunds in calculation (they may exist to correct overpayments)
            // Only exclude exchange_downgrade refunds which shouldn't exist
            if (t.type === 'refund' && method === 'exchange_downgrade') {
              console.log('Excluding exchange_downgrade REFUND:', t);
              return sum;
            }
            
            // Calculate amount first
            const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
            
            // Handle refunds - exclude them from payment total
            // Refunds are tracked separately in totalRefunds
            if (t.type === 'refund') {
              console.log('Excluding REFUND from net payment calculation:', t);
              return sum;
            }
            
            // Specifically log exchange_upgrade payments
            if (method === 'exchange_upgrade' || notes.includes('additional rent') || notes.includes('rent difference')) {
              console.log('✅ INCLUDING RENT DIFFERENCE payment:', {
                id: t.id,
                method: method,
                amount: amount,
                notes: notes.substring(0, 80)
              });
            }
            
            return sum + amount; // Add payments only
          }, 0);
          
          // Calculate total refunds (excluding lapsed_refund)
          const totalRefundsAmount = transactions.reduce((sum: number, t: any) => {
            const method = String(t.method || '').toLowerCase().trim();
            if (t.type === 'refund' && method !== 'lapsed_refund') {
              const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
              return sum + amount;
            }
            return sum;
          }, 0);
          
          // Net amount = payments - refunds
          const netAmount = netAmountFromTransactions - totalRefundsAmount;
          
          // Calculate total penalties (exchange_penalty + downgrade_penalty + cancellation_penalty)
          // These are additional charges that consume the available money
          const totalPenalties = transactions.reduce((sum: number, t: any) => {
            const transactionType = String(t.transaction_type || '').toLowerCase().trim();
            if (transactionType === 'exchange_penalty' || 
                transactionType === 'downgrade_penalty' || 
                transactionType === 'cancellation_penalty') {
              const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
              return sum + amount;
            }
            return sum;
          }, 0);

          // Calculate penalty breakdown
          const exchangePenalties = transactions.reduce((sum: number, t: any) => {
            const transactionType = String(t.transaction_type || '').toLowerCase().trim();
            if (transactionType === 'exchange_penalty') {
              const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
              return sum + amount;
            }
            return sum;
          }, 0);

          const downgradePenalties = transactions.reduce((sum: number, t: any) => {
            const transactionType = String(t.transaction_type || '').toLowerCase().trim();
            if (transactionType === 'downgrade_penalty') {
              const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
              return sum + amount;
            }
            return sum;
          }, 0);

          const cancellationPenalties = transactions.reduce((sum: number, t: any) => {
            const transactionType = String(t.transaction_type || '').toLowerCase().trim();
            if (transactionType === 'cancellation_penalty') {
              const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
              return sum + amount;
            }
            return sum;
          }, 0);
          
          // CRITICAL: Total Required = Rent + Security + Penalties
          // totalAmountNum is calculated from paymentSummary totals (includes applied discount)
          // securityDepositNum is calculated from paymentSummary and NEVER includes discount
          // totalPenalties includes all penalty charges (exchange, downgrade, cancellation)
          const totalRequired = totalAmountNum + securityDepositNum + totalPenalties;
          
          console.log('========================================');
          console.log('💰 PAYMENT BREAKDOWN - PaymentManagement Component');
          console.log('========================================');
          console.log('Total transactions processed:', transactions.length);
          console.log('Net Amount (from transactions):', netAmount);
          console.log('Total Penalties (exchange + downgrade + cancellation):', totalPenalties);
          console.log('Available after penalties:', netAmount - totalPenalties);
          console.log('Total Amount (rent):', totalAmount);
          console.log('Security Deposit:', securityDeposit);
          console.log('Rent Paid:', Math.min(netAmount - totalPenalties, totalAmount));
          console.log('Rent Due:', Math.max(0, totalAmount - (netAmount - totalPenalties)));
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
          
          // Calculate which products have refunds (exclude lapsed_refund)
          const refundTransactions = transactions.filter((t: any) => {
            const method = String(t.method || '').toLowerCase().trim();
            return t.type === 'refund' && method !== 'lapsed_refund';
          });
          
          // Calculate total refunds from transactions (exclude lapsed_refund)
          const totalRefunds = refundTransactions.reduce((sum: number, t: any) => {
            const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
            return sum + amount;
          }, 0);
          
          // Calculate security deposit refunds only (exclude overpayment refunds for remaining calculation)
          const securityDepositRefunds = refundTransactions.reduce((sum: number, t: any) => {
            const notes = String(t.notes || '').toLowerCase();
            // Only count security deposit refunds, not overpayment refunds
            if (notes.includes('overpayment refund')) {
              return sum;
            }
            const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
            return sum + amount;
          }, 0);
          
          const productsWithRefunds = new Set<number>();
          refundTransactions.forEach((transaction: any) => {
            const notes = transaction.notes || '';
            products.forEach((product: any) => {
              if (notes.includes(`(${product.code})`)) {
                productsWithRefunds.add(product.id);
              }
            });
          });
          
          // Calculate remaining security to refund
          // Remaining = Total Security - Security Deposit Refunds Only (not including overpayment refunds)
          const remainingSecurityToRefund = Math.max(0, securityDepositNum - securityDepositRefunds);
          
          // Check if refund process is complete for UI display:
          // 1. If no products exist (already freed) AND has refunds = completed
          // 2. If all products have been refunded = completed
          // 3. If only 1 product exists with refund = completed
          const allProductsRefunded = products.length > 0 && products.every(p => productsWithRefunds.has(p.id));
          const refundComplete = hasAnyRefund && (
            products.length === 0 ||  // Products already freed
            allProductsRefunded ||     // All products refunded
            products.length <= 1       // Single product
          );
          
          console.log('🔍 REMAINING SECURITY TO REFUND CALCULATION:');
          console.log('  Security Deposit (from products):', securityDepositNum);
          console.log('  Total Refunds (all refunds):', totalRefunds);
          console.log('  Security Deposit Refunds Only:', securityDepositRefunds);
          console.log('  Remaining Security to Refund:', remainingSecurityToRefund);
          console.log('  Refund Transactions:', refundTransactions.map((t: any) => ({
            id: t.id,
            amount: t.amount,
            method: t.method,
            notes: t.notes?.substring(0, 100)
          })));
          
          const overpayment = netAmount > totalRequired ? netAmount - totalRequired : 0;
          
          // Calculate amount due correctly:
          // CRITICAL: Balance Due = Total Required - Net Amount Paid
          // This automatically accounts for any unpaid rent, security, or penalties
          // Refunds are already included in netAmount calculation, so no special handling needed
          const amountDue = Math.max(0, totalRequired - netAmount);
          
          // For detailed breakdown (used in Payment Breakdown section)
          const netAmountAfterPenalties = netAmount - totalPenalties;
          const rentDue = Math.max(0, totalAmountNum - netAmountAfterPenalties);
          const securityDue = Math.max(0, securityDepositNum - Math.max(0, netAmountAfterPenalties - totalAmountNum));
          
          // Fully paid only when Total Paid >= Total Required (including penalties)
          const isFullyPaid = (netAmount >= totalRequired);
          
          console.log('💰 AMOUNT DUE CALCULATION:');
          console.log('  Total Required:', totalRequired);
          console.log('  Net Amount Paid:', netAmount);
          console.log('  Total Penalties:', totalPenalties);
          console.log('  Rent Due:', rentDue);
          console.log('  Security Due:', securityDue);
          console.log('  Total Balance Due:', amountDue);
          console.log('  Is Fully Paid:', isFullyPaid);
          
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
                  <p className="text-xs text-gray-600 mb-1">Total Payments</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatCurrency(
                      transactions
                        .filter((t: any) => {
                          // Only include 'payment' type, exclude date change charges
                          if (t.type !== 'payment') return false;
                          // Also exclude transactions with date change notes
                          const notes = (t.notes || '').toLowerCase();
                          if (notes.includes('date change charge') || notes.includes('date change')) return false;
                          
                          // Exclude auto-adjustment penalties (they're not actual payments from customer)
                          const transactionType = String(t.transaction_type || '').toLowerCase().trim();
                          const method = String(t.method || '').toLowerCase().trim();
                          const isAutoAdjustmentPenalty = (
                            (transactionType === 'exchange_penalty' || 
                             transactionType === 'downgrade_penalty' || 
                             transactionType === 'cancellation_penalty') && 
                            method === 'adjustment'
                          );
                          return !isAutoAdjustmentPenalty;
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
                    {formatCurrency(totalRefunds)}
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
                          <span className="font-bold text-green-600">{formatCurrency(Math.min(netAmountAfterPenalties, totalAmountNum))}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                          <span className="text-gray-700 font-semibold">Rent Due:</span>
                          <span className={`font-bold ${netAmountAfterPenalties >= totalAmountNum ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(Math.max(0, totalAmountNum - netAmountAfterPenalties))}
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
                          <span className="text-gray-700">{hasAnyRefund ? 'Refunded:' : 'Paid:'}</span>
                          <span className="font-bold text-green-600">
                            {hasAnyRefund 
                              ? formatCurrency(securityDepositRefunds) // If refunds exist, show security deposit refunds only (not overpayment)
                              : formatCurrency(Math.max(0, Math.min(securityDepositNum, netAmountAfterPenalties - totalAmountNum))) // Security paid = excess after rent and penalties
                            }
                          </span>
                        </div>
                        <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                          <span className="text-gray-700 font-semibold">{hasAnyRefund ? 'Deducted/Due:' : 'Security Due:'}</span>
                          <span className={`font-bold ${(hasAnyRefund ? (securityDepositRefunds >= securityDepositNum) : (netAmountAfterPenalties >= totalAmountNum + securityDepositNum)) ? 'text-green-600' : 'text-red-600'}`}>
                            {hasAnyRefund
                              ? formatCurrency(Math.max(0, securityDepositNum - securityDepositRefunds))
                              : formatCurrency(Math.max(0, securityDepositNum - Math.max(0, netAmountAfterPenalties - totalAmountNum)))
                            }
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Penalties Section - Show if penalties exist */}
                    {totalPenalties > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-red-200">
                        <p className="text-xs text-gray-600 mb-2">⚠️ Penalties Applied</p>
                        <div className="space-y-1">
                          {exchangePenalties > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-700">Exchange Penalty:</span>
                              <span className="font-bold text-red-600">{formatCurrency(exchangePenalties)}</span>
                            </div>
                          )}
                          {downgradePenalties > 0 && (
                            <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                              <span className="text-gray-700">Downgrade Penalty:</span>
                              <span className="font-bold text-red-600">{formatCurrency(downgradePenalties)}</span>
                            </div>
                          )}
                          {cancellationPenalties > 0 && (
                            <div className="flex justify-between text-sm pt-1 border-t border-gray-200">
                              <span className="text-gray-700">Cancellation Penalty:</span>
                              <span className="font-bold text-red-600">{formatCurrency(cancellationPenalties)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm pt-1 border-t border-red-200">
                            <span className="text-gray-700 font-semibold">Total Penalties:</span>
                            <span className="font-bold text-red-600">{formatCurrency(totalPenalties)}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            (Non-refundable charges that reduce available funds)
                          </div>
                        </div>
                      </div>
                    )}

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
                            let baseAmount = 0; // The original amount before deduction (rent for cancellation, security for normal)
                            const isCancellationRefund = refund.transaction_type === 'cancellation_refund' || notes.includes('Cancellation refund');
                            
                            for (const product of products) {
                              if (notes.includes(`(${product.code})`)) {
                                matchedProduct = product;
                                
                                if (isCancellationRefund) {
                                  // For cancellation refunds, base amount is the product RENT (not security)
                                  baseAmount = typeof product.rent === 'number'
                                    ? product.rent
                                    : parseFloat(String(product.rent || '0')) || 0;
                                } else {
                                  // For normal security refunds, base amount is the security deposit
                                  baseAmount = typeof product.security_deposit === 'number'
                                    ? product.security_deposit
                                    : parseFloat(String(product.security_deposit || '0')) || 0;
                                }
                                
                                chargesDeducted = baseAmount - refundAmount;
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
                                            <p className="text-gray-600">{isCancellationRefund ? 'Product Rent' : 'Security Deposit'}</p>
                                            <p className="font-bold text-blue-600">
                                              {formatCurrency(baseAmount)}
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
                                      {formatDate(refund.created_at)} • {refund.method || 'N/A'} • by {getRecordedByName(refund.recorded_by)}
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
                ) : refundComplete ? (
                  // Refund process complete
                  <div className="space-y-3">
                    <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-bold text-green-800 mb-1">✅ Refund Completed</p>
                          <p className="text-green-700">
                            Total Refunded: <span className="font-bold">{formatCurrency(totalRefunds)}</span>
                          </p>
                          <p className="text-sm text-green-700 mt-1">
                            Security Deposit: <span className="font-bold">{formatCurrency(securityDepositNum)}</span>
                          </p>
                          {securityDepositNum - totalRefunds > 0 && (
                            <p className="text-xs text-gray-600 mt-1">
                              Deducted: <span className="font-semibold">{formatCurrency(securityDepositNum - totalRefunds)}</span>
                            </p>
                          )}
                        </div>
                        <div className="text-green-600 text-5xl">
                          ✓
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
                              let baseAmount = 0;
                              const isCancellationRefund = refund.transaction_type === 'cancellation_refund' || notes.includes('Cancellation refund');
                              
                              for (const product of products) {
                                if (notes.includes(`(${product.code})`)) {
                                  matchedProduct = product;
                                  
                                  if (isCancellationRefund) {
                                    baseAmount = typeof product.rent === 'number'
                                      ? product.rent
                                      : parseFloat(String(product.rent || '0')) || 0;
                                  } else {
                                    baseAmount = typeof product.security_deposit === 'number'
                                      ? product.security_deposit
                                      : parseFloat(String(product.security_deposit || '0')) || 0;
                                  }
                                  
                                  chargesDeducted = baseAmount - refundAmount;
                                  break;
                                }
                              }
                              
                              return (
                                <div key={refund.id} className="bg-white border border-green-200 rounded p-3 text-sm">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-semibold text-gray-800">
                                      Refunded: {formatCurrency(refundAmount)}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {new Date(refund.created_at).toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                  {matchedProduct && (
                                    <p className="text-xs text-gray-600 mb-1">
                                      Product: {matchedProduct.name} ({matchedProduct.code}) - {isCancellationRefund ? 'Rent' : 'Security'}: {formatCurrency(baseAmount)}
                                    </p>
                                  )}
                                  {chargesDeducted > 0 && (
                                    <p className="text-xs text-red-600 font-medium">
                                      ⚠️ {formatCurrency(chargesDeducted)} deducted
                                    </p>
                                  )}
                                  {notes && (
                                    <p className="text-xs text-gray-600 mt-1 italic">
                                      📝 {notes}
                                    </p>
                                  )}
                                  <p className="text-xs text-gray-500 mt-1">
                                    Method: {refund.method} • By: {getRecordedByName(refund.recorded_by)}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : hasAnyRefund ? (
                  // Refunds in progress
                  <div className="space-y-3">
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-bold text-yellow-800 mb-1">⏳ Refunds In Progress</p>
                          <p className="text-yellow-700">
                            Security refunded so far: <span className="font-bold">{formatCurrency(securityDepositRefunds)}</span>
                          </p>
                          <p className="text-sm text-yellow-700 mt-1">
                            Remaining security to refund: <span className="font-bold">{formatCurrency(remainingSecurityToRefund)}</span>
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
                              let baseAmount = 0;
                              const isCancellationRefund = refund.transaction_type === 'cancellation_refund' || notes.includes('Cancellation refund');
                              
                              for (const product of products) {
                                if (notes.includes(`(${product.code})`)) {
                                  matchedProduct = product;
                                  
                                  if (isCancellationRefund) {
                                    baseAmount = typeof product.rent === 'number'
                                      ? product.rent
                                      : parseFloat(String(product.rent || '0')) || 0;
                                  } else {
                                    baseAmount = typeof product.security_deposit === 'number'
                                      ? product.security_deposit
                                      : parseFloat(String(product.security_deposit || '0')) || 0;
                                  }
                                  
                                  chargesDeducted = baseAmount - refundAmount;
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
                                              <p className="text-gray-600">{isCancellationRefund ? 'Product Rent' : 'Security Deposit'}</p>
                                              <p className="font-bold text-blue-600">
                                                {formatCurrency(baseAmount)}
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
                                        {formatDate(refund.created_at)} • {refund.method || 'N/A'} • by {getRecordedByName(refund.recorded_by)}
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

            {/* Overpayment Refund Section */}
            {(() => {
              // Calculate overpayment - similar logic to salesman page
              const rentFromProducts = products.reduce((sum: number, product: any) => {
                const rent = typeof product.security_deposit === 'number'
                  ? 0  // Not rent, but we need total amount calculation
                  : 0;
                return sum + rent;
              }, 0);
              
              // Use provided totalAmount and securityDeposit from props
              const totalRequired = totalAmount + securityDeposit;
              
              // Calculate paid amount from transactions
              const paidAmount = transactions.reduce((sum: number, t: any) => {
                // Exclude specific transaction types
                if (t.type === 'date_change_charge') return sum;
                
                const method = String(t.method || '').toLowerCase().trim();
                if (method === 'exchange_penalty' || method === 'downgrade_penalty' || method === 'exchange_lapsed' || method === 'lapsed_refund') {
                  return sum;
                }
                
                const notes = (t.notes || '').toLowerCase();
                if (notes.includes('date change charge') || 
                    notes.includes('exchange penalty')) {
                  return sum;
                }
                
                const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
                return sum + (t.type === 'refund' ? -amount : amount);
              }, 0);
              
              const overpayment = paidAmount - totalRequired;
              
              // Only show overpayment section if there's an overpayment
              if (overpayment <= 0) return null;
              
              return (
                <div className="mb-6">
                  <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6">
                    <div className="flex items-start mb-4">
                      <svg className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-yellow-900 mb-1">Overpayment Detected</h3>
                        <p className="text-yellow-800 text-sm mb-3">
                          Customer has paid <span className="font-bold">{formatCurrency(overpayment)}</span> extra. 
                          This full overpayment amount will be automatically refunded along with product security deposits.
                        </p>
                        
                        <div className="bg-white rounded-lg p-4">
                          {/* Overpayment Refund Amount Display (Read-only) */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Overpayment Refund Amount
                            </label>
                            <div className="w-full px-4 py-3 border-2 border-yellow-400 bg-yellow-50 rounded-lg font-bold text-xl text-yellow-900 text-center">
                              {formatCurrency(overpayment)}
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
              );
            })()}

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

