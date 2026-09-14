'use client';

import { productExchangesApi, productsApi, bookingsApi, qrCodesApi, availabilityApi, paymentTransactionsApi } from '@/lib/api';
import { UpiQrConfirmModal } from './UpiQrConfirmModal';
import { TransportDetailsModal } from './TransportDetailsModal';
import type { TransportFormData } from './TransportDetailsModal';
import { integerKeyDown, isIntegerInput } from '@/lib/integerInput';
import React, { useState, useEffect } from 'react';

import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from './AlertBanner';
import DateRangePicker from '@/components/common/DateRangePicker';
import { PaymentMethodInput } from './PaymentMethodInput';
import { sortSizes } from '@/lib/productConstants';
import { UrgentDetailsModal } from './UrgentDetailsModal';
import type { UrgentConflict } from '@rental/shared';

interface ProductExchangeProps {
  bookingId: number;
  bookingDate: string;
  currentProducts: any[];
  onExchangeComplete?: () => void;
  userRole: 'admin' | 'salesman' | 'customer';
  userName: string;
  bookingStatus?: string;
  securityPaidByProduct?: Record<number, number>; // bookingProductId → security paid amount
  bookingTransportCharge?: number; // booking-level transport_charge
}

export function ProductExchange({
  bookingId,
  bookingDate,
  currentProducts,
  onExchangeComplete,
  userRole,
  userName,
  bookingStatus,
  securityPaidByProduct = {},
  bookingTransportCharge = 0
}: ProductExchangeProps) {
  const [exchanges, setExchanges] = useState<any[]>([]);
  // Utility: composite key for product+size
  const makeKey = (pid: number, size?: string | null) => size ? `${pid}:${size}` : `${pid}`;

  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [selectedOriginalProduct, setSelectedOriginalProduct] = useState<number | null>(null);
  const [selectedExchangedProduct, setSelectedExchangedProduct] = useState<number | null>(null);
  const [selectedExchangeSize, setSelectedExchangeSize] = useState<string | null>(null);
  const [additionalProducts, setAdditionalProducts] = useState<number[]>([]); // For multiple product selection
  const [additionalProductSizes, setAdditionalProductSizes] = useState<Record<number, string | null>>({}); // Size per additional product
  const [productSearchTerm, setProductSearchTerm] = useState(''); // For searching additional products
  const [mainProductSearchTerm, setMainProductSearchTerm] = useState(''); // For searching main exchange product
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [exchangeReason, setExchangeReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingExchanges, setFetchingExchanges] = useState(false);
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();

  // Refund modal state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundLapsedAmount, setRefundLapsedAmount] = useState(0);
  const [refundAmount, setRefundAmount] = useState('');
  const [pendingDeleteExchangeId, setPendingDeleteExchangeId] = useState<number | null>(null);

  // Date selection for each product
  const [productDates, setProductDates] = useState<Record<string, { booked_from: string; booked_to: string }>>({});
  const [productBookings, setProductBookings] = useState<Record<string, any[]>>({}); // Bookings for each product for availability checking
  const [availabilityErrors, setAvailabilityErrors] = useState<Record<string, string>>({});
  const [urgentConflictsMap, setUrgentConflictsMap] = useState<Record<string, UrgentConflict[]>>({});
  const [showUrgentDetailProductId, setShowUrgentDetailProductId] = useState<string | null>(null);

  // Payment collection state

  const [totalPaymentDue, setTotalPaymentDue] = useState<number>(0);
  const [exchangePenaltyAmount, setExchangePenaltyAmount] = useState<number>(0);
  const [rentDifferenceAmount, setRentDifferenceAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentNarration, setPaymentNarration] = useState('');
  const [pendingExchange, setPendingExchange] = useState<any>(null);
  const [pendingExchangeData, setPendingExchangeData] = useState<any>(null); // Store exchange data before creating it
  const [paymentType, setPaymentType] = useState<'penalty' | 'rent' | 'both'>('penalty');

  // UPI QR confirmation modal state
  const [showUpiQrModal, setShowUpiQrModal] = useState(false);
  const [activeQrCodeId, setActiveQrCodeId] = useState<number | null>(null);

  // Transport details state for exchanged products
  const [exchangeTransportDetails, setExchangeTransportDetails] = useState<Record<string, Partial<TransportFormData>>>({});
  const [showTransportModal, setShowTransportModal] = useState(false);

  // Transport is enabled if the booking has a transport charge or any current product has transport_details
  const transportEnabled = (bookingTransportCharge || 0) > 0 || currentProducts.some(p => p.transport_details);

  // Pre-fill transport details from old product when selected
  useEffect(() => {
    if (!selectedOriginalProduct || !transportEnabled) {
      setExchangeTransportDetails({});
      return;
    }
    const oldProduct = currentProducts.find(p => p.id === selectedOriginalProduct);
    if (oldProduct?.transport_details) {
      // Pre-fill with old product's transport details (will be applied to new products)
      setExchangeTransportDetails({ prefill: oldProduct.transport_details });
    } else {
      setExchangeTransportDetails({});
    }
  }, [selectedOriginalProduct, transportEnabled]);

  // Exchange preview from backend API
  const [exchangePreview, setExchangePreview] = useState<any>(null);
  const [rentDifference, setRentDifference] = useState<number>(0);
  const [securityDifference, setSecurityDifference] = useState<number>(0);
  const [bookingDates, setBookingDates] = useState<{ booked_from: string; booked_to: string } | null>(null);

  useEffect(() => {
    fetchExchanges();
    fetchBookingDates();
  }, [bookingId]);

  async function fetchBookingDates() {
    try {
      const response = await bookingsApi.getById(bookingId);
      if (response.data) {
        setBookingDates({
          booked_from: response.data.booked_from?.split('T')[0] || '',
          booked_to: response.data.booked_to?.split('T')[0] || ''
        });
      }
    } catch (error) {
      console.error('Error fetching booking dates:', error);
    }
  }


  const exchangedProduct = availableProducts.find(p => p.id === selectedExchangedProduct);

  // True when the exchanged product has sizes but the user hasn't picked one yet
  const sizeSelectionPending = !!(exchangedProduct?.available_sizes?.length > 0 && !selectedExchangeSize);

  // Fetch exchange preview from backend when products are selected
  useEffect(() => {
    async function fetchExchangePreview() {
      if (!selectedOriginalProduct || !selectedExchangedProduct) {
        setExchangePreview(null);
        setTotalPaymentDue(0);
        setPendingExchangeData(null);
        return;
      }

      const originalProduct = currentProducts.find(p => p.id === selectedOriginalProduct);
      if (!originalProduct) return;

      // If product requires a size but none selected yet, don't fetch preview
      if (sizeSelectionPending) {
        setExchangePreview(null);
        setTotalPaymentDue(0);
        setPendingExchangeData(null);
        return;
      }

      try {
        // Call backend API to get complete exchange preview with all calculations
        const response = await productExchangesApi.getPreview(
          originalProduct.id,
          selectedExchangedProduct,
          additionalProducts,
          selectedExchangeSize,
          additionalProductSizes
        );

        const preview = response.data;
        setExchangePreview(preview);

        // Update payment due and differences from backend calculations
        setTotalPaymentDue(preview.calculations.total_payment_due);
        setExchangePenaltyAmount(preview.calculations.exchange_penalty);
        setRentDifferenceAmount(preview.calculations.downgrade_penalty); // Using existing downgrade_penalty
        setRentDifference(preview.calculations.downgrade_penalty);
        setSecurityDifference(preview.calculations.security_difference);

        // Prepare exchange data with backend preview calculations
        if (preview.calculations.total_payment_due > 0) {
          const exchangeDataToCreate = {
            booking_id: bookingId,
            original_product_id: selectedOriginalProduct,
            exchanged_product_id: selectedExchangedProduct,
            exchange_reason: exchangeReason,
            size: selectedExchangeSize,
            additionalProducts: additionalProducts.map(productId => ({
              product_id: productId,
              size: additionalProductSizes[productId] || null,
              booked_from: productDates[makeKey(productId, additionalProductSizes[productId])]?.booked_from || bookingDates?.booked_from?.split('T')[0] || '',
              booked_to: productDates[makeKey(productId, additionalProductSizes[productId])]?.booked_to || bookingDates?.booked_to?.split('T')[0] || ''
            })),
            exchanged_product_dates: {
              booked_from: productDates[makeKey(selectedExchangedProduct, selectedExchangeSize)]?.booked_from || bookingDates?.booked_from?.split('T')[0] || '',
              booked_to: productDates[makeKey(selectedExchangedProduct, selectedExchangeSize)]?.booked_to || bookingDates?.booked_to?.split('T')[0] || ''
            }
          };
          setPendingExchangeData(exchangeDataToCreate);
        } else {
          setPendingExchangeData(null);
        }
      } catch (error) {
        console.error('Error fetching exchange preview:', error);
        setExchangePreview(null);
        setTotalPaymentDue(0);
      }
    }

    fetchExchangePreview();
  }, [selectedOriginalProduct, selectedExchangedProduct, additionalProducts, exchangeReason, productDates, bookingDates, selectedExchangeSize, additionalProductSizes, sizeSelectionPending]);

  async function fetchExchanges() {
    try {
      setFetchingExchanges(true);
      const response = await productExchangesApi.getByBookingId(bookingId);
      setExchanges(response.data);
    } catch (error) {
      console.error('Error fetching exchanges:', error);
    } finally {
      setFetchingExchanges(false);
    }
  }

  async function fetchProductBookings(productId: number, size?: string | null) {
    const bookingKey = makeKey(productId, size);
    try {
      const response = await bookingsApi.getByProductId(productId, size ?? undefined);
      setProductBookings(prev => ({
        ...prev,
        [bookingKey]: response.data || []
      }));
    } catch (error) {
      console.error(`Error fetching bookings for product ${productId}:`, error);
      setProductBookings(prev => ({
        ...prev,
        [bookingKey]: []
      }));
    }
  }

  async function checkProductAvailability(productId: number, dateFrom: string, dateTo: string, size?: string | null): Promise<{ available: boolean; message?: string; isUrgent?: boolean; conflicts?: UrgentConflict[] }> {
    if (!dateFrom || !dateTo) {
      return { available: false, message: 'Please select both pickup and drop dates' };
    }

    try {
      const response = await availabilityApi.check({
        product_id: productId,
        date_from: dateFrom,
        date_to: dateTo,
        ...(size ? { size } : {})
      });

      if (!response.data.available) {
        return {
          available: false,
          message: response.data.message || 'Product is not available for selected dates'
        };
      }

      // Check for tight schedule via backend API
      try {
        const tightResponse = await availabilityApi.checkTightSchedule([{
          product_id: productId,
          size: size ?? undefined,
          booked_from: dateFrom,
          booked_to: dateTo,
        }]);

        if (tightResponse.data.has_tight_schedule && tightResponse.data.conflicts.length > 0) {
          const conflicts = tightResponse.data.conflicts;
          const conflictSummary = conflicts.map(c =>
            `${c.product_code}: ${c.gap_days} day gap ${c.direction === 'before' ? 'before pickup' : 'after return'} (Order #${c.neighbour_booking_id})`
          ).join('; ');
          return {
            available: true,
            isUrgent: true,
            message: conflictSummary,
            conflicts,
          };
        }
      } catch (tightError) {
        console.error('Error checking tight schedule:', tightError);
      }

      return { available: true };
    } catch (error: any) {
      console.error('Error checking availability:', error);
      return {
        available: false,
        message: error.response?.data?.error || 'Failed to check availability'
      };
    }
  }

  async function fetchAvailableProducts() {
    try {
      const response = await productsApi.getAll();
      const currentProductPairs = new Set(
        currentProducts
          .filter(p => p.id !== selectedOriginalProduct)
          .map(p => makeKey(p.product_id, p.size))
      );
      const available = response.data.filter((p: any) => {
        // Allow same product if it has sizes not already in the booking
        if (currentProductPairs.size === 0) return true;
        const hasSizes = p.available_sizes && p.available_sizes.length > 0;
        if (!hasSizes) {
          // Sizeless product: check if product_id is already in booking
          return !currentProductPairs.has(`${p.id}:`);
        }
        // Sized product: allow if at least one size is not in the booking
        return p.available_sizes.some((sz: string) => !currentProductPairs.has(`${p.id}:${sz}`));
      });
      setAvailableProducts(available);

      // Initialize dates for main exchanged product (use empty strings to allow fresh selection)
      if (selectedExchangedProduct) {
        setProductDates(prev => ({
          ...prev,
          [selectedExchangedProduct]: {
            booked_from: '',
            booked_to: ''
          }
        }));
        // Only fetch if sizeless or a size is already selected (calendar is gated behind size)
        const selected = available.find(p => p.id === selectedExchangedProduct);
        const hasSizes = selected?.available_sizes?.length > 0;
        if (!hasSizes || selectedExchangeSize) {
          await fetchProductBookings(selectedExchangedProduct, selectedExchangeSize);
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      addAlert('Failed to load available products');
    }
  }

  async function handleExchange() {
    if (!selectedOriginalProduct || !selectedExchangedProduct) {
      addAlert('Please select both original and exchanged products');
      return;
    }

    // Validate product selection
    const originalProduct = currentProducts.find(p => p.id === selectedOriginalProduct);
    const exchangedProduct = availableProducts.find(p => p.id === selectedExchangedProduct);

    if (!originalProduct || !exchangedProduct) {
      addAlert('Product not found');
      return;
    }

    try {
      setLoading(true);

      clearAlerts();

      const exchangeBy = userName;

      // Validate dates for all products
      const mainProductDates = productDates[makeKey(selectedExchangedProduct, selectedExchangeSize)];
      if (!mainProductDates?.booked_from || !mainProductDates?.booked_to) {
        addAlert('Please select dates for the main exchanged product');
        return;
      }

      // Check availability for main product (with size)
      const mainAvailability = await checkProductAvailability(
        selectedExchangedProduct,
        mainProductDates.booked_from,
        mainProductDates.booked_to,
        selectedExchangeSize
      );
      if (!mainAvailability.available && !mainAvailability.isUrgent) {
        addAlert(mainAvailability.message || 'Main product is not available for selected dates');
        return;
      }

      // Validate dates for additional products
      for (const additionalProductId of additionalProducts) {
        const dates = productDates[makeKey(additionalProductId, additionalProductSizes[additionalProductId])];
        if (!dates?.booked_from || !dates?.booked_to) {
          addAlert(`Please select dates for all additional products`);
          return;
        }

        const availability = await checkProductAvailability(
          additionalProductId,
          dates.booked_from,
          dates.booked_to,
          additionalProductSizes[additionalProductId]
        );
        if (!availability.available && !availability.isUrgent) {
          const product = availableProducts.find(p => p.id === additionalProductId);
          addAlert(`${product?.name || 'Product'} is not available for selected dates: ${availability.message}`);
          return;
        }
      }

      // If payment is required (already calculated by useEffect), don't proceed - let user click payment button
      if (totalPaymentDue > 0 && pendingExchangeData) {
        toast.info('Please complete payment to proceed with exchange');
        return;
      }

      // No payment needed, create exchange directly
      const additionalProdCodes = additionalProducts.map(id => {
        const p = availableProducts.find(prod => prod.id === id);
        return p ? `${p.name} (${p.code})` : `Product ${id}`;
      });

      const combinedReason = additionalProdCodes.length
        ? `${exchangeReason ? `${exchangeReason} | ` : ''}Added: ${additionalProdCodes.join(', ')}`
        : exchangeReason || undefined;

      const newProductIds = [
        {
          product_id: selectedExchangedProduct,
          size: selectedExchangeSize,
          booked_from: mainProductDates.booked_from,
          booked_to: mainProductDates.booked_to,
        },
        ...additionalProducts.map(productId => ({
          product_id: productId,
          size: additionalProductSizes[productId] || null,
          booked_from: productDates[makeKey(productId, additionalProductSizes[productId])].booked_from,
          booked_to: productDates[makeKey(productId, additionalProductSizes[productId])].booked_to,
        }))
      ];

        const exchangeResult = await productExchangesApi.exchange({
        old_booking_product_id: selectedOriginalProduct,
        new_product_ids: newProductIds,
        exchange_penalty: exchangePreview?.calculations?.exchange_penalty || 0,
        downgrade_penalty: exchangePreview?.calculations?.downgrade_penalty || 0,
        exchange_reason: combinedReason,
        exchanged_by: exchangeBy,
        transport_details: buildTransportPayload(newProductIds),
      });

      toast.success(`Product${additionalProducts.length > 0 ? 's' : ''} exchanged successfully`);
      setShowExchangeModal(false);
      setSelectedOriginalProduct(null);
      setSelectedExchangedProduct(null);
      setSelectedExchangeSize(null);
      setAdditionalProducts([]);
      setAdditionalProductSizes({});
      setProductSearchTerm('');
      setProductDates({});
      setProductBookings({});
      setAvailabilityErrors({});
      setExchangeReason('');
      setPendingExchangeData(null);

      await fetchExchanges();
      await fetchBookingDates(); // Refresh booking dates after exchange
      if (onExchangeComplete) {
        onExchangeComplete();
      }
    } catch (error: any) {
      console.error('Error exchanging product:', error);
      addAlert(error.response?.data?.details || error.response?.data?.error || 'Failed to exchange product');
    } finally {
      setLoading(false);
    }
  }

  async function handlePaymentCollection() {
    if (!pendingExchangeData) {
      addAlert('Invalid exchange data');
      return;
    }

    if (totalPaymentDue <= 0) {
      addAlert('No payment to collect');
      return;
    }

    if (!paymentMethod || paymentMethod.trim() === '') {
      addAlert('Please select a payment method');
      return;
    }

    try {
      setLoading(true);

      // Prepare exchange by name
      const exchangeBy = userName;

      // Get main product dates
      const mainProductDates = pendingExchangeData.exchanged_product_dates ||
        productDates[pendingExchangeData.exchanged_product_id];

      if (!mainProductDates?.booked_from || !mainProductDates?.booked_to) {
        addAlert('Please select dates for the exchanged product');
        return;
      }

      // Prepare additional product codes for reason
      const additionalProdCodes = (pendingExchangeData.additionalProducts || []).map((addProd: any) => {
        const p = availableProducts.find(prod => prod.id === addProd.product_id);
        return p ? `${p.name} (${p.code})` : `Product ${addProd.product_id}`;
      });

      const combinedReason = additionalProdCodes.length
        ? `${pendingExchangeData.exchange_reason ? `${pendingExchangeData.exchange_reason} | ` : ''}Added: ${additionalProdCodes.join(', ')}`
        : pendingExchangeData.exchange_reason || undefined;

      // STEP 1: Create exchange in database first
      const newProductIds = [
        {
          product_id: pendingExchangeData.exchanged_product_id,
          size: pendingExchangeData.size || null,
          booked_from: mainProductDates.booked_from,
          booked_to: mainProductDates.booked_to,
          rent: exchangePreview?.calculations?.new_rent || 0,
          security_deposit: exchangePreview?.calculations?.new_security || 0,
        },
        ...(pendingExchangeData.additionalProducts || []).map((ap: any) => ({
          product_id: ap.product_id,
          size: ap.size || null,
          booked_from: ap.booked_from,
          booked_to: ap.booked_to,
          rent: ap.rent || exchangePreview?.calculations?.additional_rent || 0,
          security_deposit: ap.security_deposit || exchangePreview?.calculations?.additional_security || 0,
        })),
      ];

      // Build detailed narration showing the breakdown
      const breakdownParts = [];
      if (exchangePenaltyAmount > 0) {
        breakdownParts.push(`Exchange Penalty: ₹${exchangePenaltyAmount.toLocaleString('en-IN')}`);
      }
      if (rentDifferenceAmount > 0) {
        breakdownParts.push(`Rent Difference: ₹${rentDifferenceAmount.toLocaleString('en-IN')}`);
      }
      const detailedNarration = `Total Payment: ₹${totalPaymentDue.toLocaleString('en-IN')} (${breakdownParts.join(' + ')})${paymentNarration ? ` | ${paymentNarration.trim()}` : ''}`;

      // ATOMIC: Exchange + Payment in one API call (backend handles both in same transaction)
      const exchangeResult = await productExchangesApi.exchange({
        old_booking_product_id: pendingExchangeData.original_product_id,
        new_product_ids: newProductIds,
        exchange_penalty: exchangePreview?.calculations?.exchange_penalty || 0,
        downgrade_penalty: exchangePreview?.calculations?.downgrade_penalty || 0,
        exchange_reason: combinedReason,
        exchanged_by: exchangeBy,
        // Payment params — processed atomically with the exchange
        payment_amount: Math.max(0, parseFloat(totalPaymentDue.toString()) || 0),
        payment_method: paymentMethod.trim(),
        payment_recorded_by: userName,
        payment_notes: detailedNarration,
        payment_qr_code_id: activeQrCodeId || undefined,
        transport_details: buildTransportPayload(newProductIds),
      });

      toast.success(`Total ₹${totalPaymentDue.toLocaleString('en-IN')} collected via ${paymentMethod}`);

      setShowExchangeModal(false);
      setPendingExchange(null);
      setPendingExchangeData(null); // Clear pending exchange data
      setTotalPaymentDue(0);
      setExchangePenaltyAmount(0);
      setRentDifferenceAmount(0);
      setPaymentMethod('Cash');
      setPaymentNarration('');
      setShowUpiQrModal(false);
      setActiveQrCodeId(null);
      setSelectedOriginalProduct(null);
      setSelectedExchangedProduct(null);
      setAdditionalProducts([]);
      setProductDates({});
      setProductBookings({});
      setAvailabilityErrors({});
      setExchangeReason('');

      await fetchExchanges();
      await fetchBookingDates(); // Refresh booking dates after exchange
      if (onExchangeComplete) {
        onExchangeComplete();
      }
    } catch (error: any) {
      console.error('Error recording payment:', error);
      addAlert(error.response?.data?.details || error.response?.data?.error || 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteExchange(exchangeId: number) {
    // Find the exchange to get lapsed amount
    const exchange = exchanges.find(e => e.id === exchangeId);
    if (!exchange) return;

    if (!confirm('Are you sure you want to delete this exchange? This will revert the product change.')) {
      return;
    }

    try {
      setLoading(true);

      // Use the exchange record's total_charge as the lapsed amount
      const lapsedAmount = parseFloat(String(exchange.total_charge || '0')) || 0;

      // If there's a lapsed amount, show refund modal
      if (lapsedAmount > 0) {
        setRefundLapsedAmount(lapsedAmount);
        setRefundAmount(lapsedAmount.toFixed(2));
        setPendingDeleteExchangeId(exchangeId);
        setShowRefundModal(true);
        setLoading(false);
      } else {
        // No lapsed amount, proceed with deletion
        await proceedWithDeletion(exchangeId, 0);
      }
    } catch (error: any) {
      console.error('Error preparing exchange deletion:', error);
      addAlert(error.response?.data?.details || error.response?.data?.error || 'Failed to prepare exchange deletion');
      setLoading(false);
    }
  }

  async function proceedWithDeletion(exchangeId: number, refundAmountValue: number) {
    try {
      setLoading(true);

      // Delete the exchange (backend will mark transactions as lapsed)
      await productExchangesApi.delete(exchangeId);

      // If admin chose to refund, create a special refund transaction
      if (refundAmountValue > 0) {
        try {
          await paymentTransactionsApi.create({
            booking_id: bookingId,
            amount: refundAmountValue,
            type: 'refund',
            method: 'lapsed_refund',
            notes: `ONE-TIME LAPSED AMOUNT REFUND: Refund of ₹${refundAmountValue.toFixed(2)} for cancelled exchange (Exchange ID: ${exchangeId}). This refund does not affect rent/security calculations.`,
            recorded_by: userName
          });
          toast.success(`Exchange deleted and ₹${refundAmountValue.toFixed(2)} refunded successfully`);
        } catch (refundError) {
          console.error('Error recording refund:', refundError);
          addAlert('Exchange deleted but failed to record refund transaction', 'warning');
        }
      } else {
        toast.success('Exchange deleted successfully');
      }

      await fetchExchanges();
      await fetchBookingDates(); // Refresh booking dates after deleting exchange
      if (onExchangeComplete) {
        onExchangeComplete();
      }
    } catch (error: any) {
      console.error('Error deleting exchange:', error);
      addAlert(error.response?.data?.details || error.response?.data?.error || 'Failed to delete exchange');
    } finally {
      setLoading(false);
      setShowRefundModal(false);
      setPendingDeleteExchangeId(null);
      setRefundAmount('');
      setRefundLapsedAmount(0);
    }
  }

  function handleRefundModalConfirm() {
    if (!pendingDeleteExchangeId) return;

    const refundAmountValue = parseFloat(refundAmount);
    if (isNaN(refundAmountValue) || refundAmountValue < 0) {
      addAlert('Please enter a valid refund amount');
      return;
    }

    if (refundAmountValue > refundLapsedAmount) {
      addAlert(`Refund amount cannot exceed ₹${refundLapsedAmount.toFixed(2)}`);
      return;
    }

    proceedWithDeletion(pendingDeleteExchangeId, refundAmountValue);
  }

  function handleRefundModalCancel() {
    if (!pendingDeleteExchangeId) return;
    proceedWithDeletion(pendingDeleteExchangeId, 0);
  }

  const originalProduct = currentProducts.find(p => p.id === selectedOriginalProduct);

  // Helper: build transport details payload for exchange API
  // Keyed by composite 'productId:size' to support same product in different sizes
  function buildTransportPayload(newProductIds: Array<{ product_id: number; size?: string | null }>) {
    if (!transportEnabled || Object.keys(exchangeTransportDetails).length === 0) return undefined;
    return Object.fromEntries(
      newProductIds.map(p => {
        const compositeKey = makeKey(p.product_id, p.size);
        const details = exchangeTransportDetails[compositeKey] || exchangeTransportDetails['prefill'];
        return details ? [compositeKey, details] : null;
      }).filter(Boolean) as [string, any][]
    );
  }

  const canExchange = bookingStatus !== 'pending' && bookingStatus !== 'completed' && bookingStatus !== 'cancelled' && bookingStatus !== 'discarded';

  // All newly-added products (main + additional) must have both dates set before proceeding
  const allProductDatesSet = (() => {
    if (!selectedExchangedProduct) return false;
    const mainDates = productDates[makeKey(selectedExchangedProduct, selectedExchangeSize)];
    if (!mainDates?.booked_from || !mainDates?.booked_to) return false;
    for (const pid of additionalProducts) {
      const d = productDates[makeKey(pid, additionalProductSizes[pid])];
      if (!d?.booked_from || !d?.booked_to) return false;
    }
    return true;
  })();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Product Exchanges</h3>
        {currentProducts.length > 0 && (
          <button
            onClick={() => {
              setSelectedOriginalProduct(null);
              setSelectedExchangedProduct(null);
              setAdditionalProducts([]);
              setProductSearchTerm('');
              setMainProductSearchTerm('');
              setProductDates({});
              setProductBookings({});
              setAvailabilityErrors({});
              setExchangeReason('');
              fetchAvailableProducts();
              setShowExchangeModal(true);
            }}
            disabled={!canExchange}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${canExchange
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
          >
            Exchange Product
          </button>
        )}
      </div>

      {fetchingExchanges ? (
        <p className="text-gray-600">Loading exchanges...</p>
      ) : exchanges.length === 0 ? (
        <p className="text-gray-500 text-sm">No product exchanges yet</p>
      ) : (
        <div className="space-y-3">
          {exchanges.map((exchange) => {
            const addedList =
              exchange.reason && exchange.reason.includes('Added:')
                ? exchange.reason
                  .split('Added:')[1]
                  .split(',')
                  .map((item: string) => item.trim())
                  .filter(Boolean)
                : [];
            return (
              <div
                key={exchange.id}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded">
                          {exchange.original_product_name} ({exchange.original_product_code})
                        </span>
                        <span className="text-gray-500 font-bold">→</span>
                        {/* Show primary exchanged product */}
                        <span className="text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                          {exchange.exchanged_product_name} ({exchange.exchanged_product_code})
                        </span>
                        {/* Show additional products inline with primary - all part of the same exchange */}
                        {addedList.length > 0 && addedList.map((item: string, idx: number) => (
                          <React.Fragment key={idx}>
                            <span className="text-gray-500 font-bold">+</span>
                            <span className="text-sm font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">
                              {item}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 space-y-1">
                      <p>Date: {new Date(exchange.exchange_date).toLocaleDateString("en-GB")}</p>
                      <p>Days from booking: {exchange.days_from_booking}</p>
                      <p>Penalty: {exchange.penalty_percentage}%</p>
                      <p className="font-semibold text-gray-800">
                        Total Charge: ₹{exchange.total_charge.toLocaleString('en-IN')}
                      </p>
                      {exchange.reason && !exchange.reason.includes('Added:') && (
                        <p>Reason: {exchange.reason}</p>
                      )}
                      {exchange.reason && exchange.reason.includes('Added:') && exchange.reason.split('|')[0].trim() && (
                        <p>Reason: {exchange.reason.split('|')[0].trim()}</p>
                      )}
                      {exchange.exchanged_by && <p>Exchanged by: {exchange.exchanged_by}</p>}
                    </div>
                    <div className="mt-3">
                      <details className="text-xs text-gray-700">
                        <summary className="cursor-pointer text-blue-600 font-semibold">View exchanged product details</summary>
                        <div className="mt-2 space-y-2">
                          <div className="bg-white border border-blue-200 rounded p-3">
                            <p className="font-semibold text-blue-800 text-sm mb-2">🔄 Products in this Exchange</p>
                            {/* Original product that was replaced */}
                            <div className="mb-3 pb-2 border-b border-gray-200">
                              <p className="text-xs text-gray-500 mb-1">Replaced:</p>
                              <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">
                                {exchange.original_product_name} ({exchange.original_product_code})
                              </span>
                            </div>
                            {/* All new products added in exchange */}
                            <div>
                              <p className="text-xs text-gray-500 mb-1">New products added:</p>
                              <div className="flex flex-wrap gap-2">
                                {/* Primary exchanged product */}
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                                  {exchange.exchanged_product_name} ({exchange.exchanged_product_code})
                                </span>
                                {/* Additional products from reason field */}
                                {exchange.reason && exchange.reason.includes('Added:') &&
                                  exchange.reason.split('Added:')[1].split(',').map((item: string, idx: number) => (
                                    <span key={idx} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                                      {item.trim()}
                                    </span>
                                  ))
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                  {/* <button
                  onClick={() => handleDeleteExchange(exchange.id)}
                  disabled={loading}
                  className="ml-4 text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                >
                  Delete
                </button> */}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Exchange Modal */}
      {showExchangeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">Exchange Product</h2>
              <button
                onClick={() => setShowExchangeModal(false)}
                className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Inline alert banner for exchange errors */}
              <AlertBanner alerts={alerts} onDismiss={removeAlert} />
              {/* Original Product */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Original Product
                </label>
                <select
                  value={selectedOriginalProduct || ''}
                  onChange={async (e) => {
                    const productId = e.target.value ? Number(e.target.value) : null;
                    setSelectedOriginalProduct(productId);
                    setSelectedExchangedProduct(null);
                    setAdditionalProducts([]); // Reset additional products when original changes
                    setProductSearchTerm(''); // Reset search when original changes
                    setMainProductSearchTerm('');
                    setProductDates({}); // Reset dates
                    setProductBookings({}); // Reset bookings
                    setAvailabilityErrors({}); // Reset errors
                    if (productId) {
                      await fetchAvailableProducts();
                    }
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                >
                  <option value="">Select product to exchange</option>
                  {currentProducts.map((product) => {
                    const secPaid = securityPaidByProduct[product.id] ?? 0;
                    const isDisabled = secPaid > 0;
                    return (
                      <option key={product.id} value={product.id} disabled={isDisabled}>
                        {product.name} ({product.code}{product.size ? ` · Size: ${product.size}` : ''}) — ₹{product.effective_rent || product.rent}/day
                        {isDisabled ? ` (Security paid ₹${secPaid.toLocaleString('en-IN')} — not exchangeable)` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Exchanged Product */}
              {selectedOriginalProduct && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exchange With
                  </label>
                  {availableProducts.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">No available products for exchange</p>
                  ) : (
                    <div>
                      {/* Search Input */}
                      <div className="mb-2">
                        <input
                          type="text"
                          value={mainProductSearchTerm}
                          onChange={(e) => setMainProductSearchTerm(e.target.value)}
                          placeholder="Search by product name or code..."
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white text-sm"
                        />
                      </div>

                      {/* Product List — single select */}
                      <div className="border border-gray-300 rounded-lg bg-white max-h-[200px] overflow-y-auto">
                        {(() => {
                          const activeProductPairs = new Set(
                            currentProducts
                              .filter(p => !['cancelled', 'exchanged', 'completed', 'discarded'].includes(p.status))
                              .map(p => makeKey(p.product_id, p.size))
                          );
                          const filteredProducts = availableProducts.filter(p => {
                            if (!mainProductSearchTerm) return true;
                            const search = mainProductSearchTerm.toLowerCase();
                            return (
                              p.name?.toLowerCase().includes(search) ||
                              p.code?.toLowerCase().includes(search)
                            );
                          });

                          if (filteredProducts.length === 0) {
                            return (
                              <div className="p-4 text-center text-sm text-gray-500">
                                {mainProductSearchTerm ? 'No products found matching your search' : 'No products available'}
                              </div>
                            );
                          }

                          return (
                            <div className="divide-y divide-gray-200">
                              {filteredProducts.map((product) => {
                                const hasSizes = product.available_sizes && product.available_sizes.length > 0;
                                const isDisabled = hasSizes
                                  ? product.available_sizes.every((sz: string) => activeProductPairs.has(`${product.id}:${sz}`))
                                  : activeProductPairs.has(`${product.id}:`);
                                const isSelected = selectedExchangedProduct === product.id;
                                return (
                                  <label
                                    key={product.id}
                                    className={`flex items-center p-3 transition-colors ${isDisabled
                                      ? 'opacity-50 cursor-not-allowed bg-gray-50'
                                      : `hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-red-50' : ''}`
                                      }`}
                                  >
                                    <input
                                      type="radio"
                                      name="exchangedProduct"
                                      checked={isSelected}
                                      disabled={isDisabled}
                                      onChange={async () => {
                                        if (isDisabled) return;
                                        setSelectedExchangedProduct(product.id);
                                        setSelectedExchangeSize(null);
                                        setAdditionalProducts([]);
                                        setProductSearchTerm('');

                                        // Initialize dates
                                        setProductDates(prev => ({
                                          ...prev,
                                          [product.id]: { booked_from: '', booked_to: '' }
                                        }));
                                        // For sizeless products, fetch bookings now.
                                        // For sized products, the size selector onClick fetches with the correct size.
                                        if (!hasSizes) {
                                          await fetchProductBookings(product.id);
                                        }
                                      }}
                                      className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500 mr-3 flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-gray-900 truncate">
                                            {product.name}
                                          </p>
                                          <p className="text-xs text-gray-500 mt-0.5">
                                            Code: {product.code}
                                            {isDisabled && (
                                              <span className="ml-2 text-amber-600 font-medium">(already in this booking)</span>
                                            )}
                                          </p>
                                        </div>
                                        <div className="ml-3 text-right">
                                          <p className="text-sm font-semibold text-gray-900">
                                            ₹{parseFloat(String(product.rent || '0')).toLocaleString('en-IN')}
                                          </p>
                                          <p className="text-xs text-gray-500">per day</p>
                                          {parseFloat(String(product.security_deposit || '0')) > 0 && (
                                            <p className="text-xs text-gray-400 mt-0.5">
                                              Security: ₹{parseFloat(String(product.security_deposit || '0')).toLocaleString('en-IN')}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Size Selector — shown when exchanged product has available_sizes */}
              {selectedExchangedProduct && (() => {
                const exchangedProduct = availableProducts.find(p => p.id === selectedExchangedProduct);
                if (!exchangedProduct?.available_sizes?.length) return null;
                // Filter out sizes already actively in this booking for this product
                const activeProductPairs = new Set(
                  currentProducts
                    .filter(p => !['cancelled', 'exchanged', 'completed', 'discarded'].includes(p.status))
                    .map(p => makeKey(p.product_id, p.size))
                );
                return (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Size *
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {sortSizes(exchangedProduct.available_sizes).map((sz: string) => {
                        const isSelected = selectedExchangeSize === sz;
                        const isInBooking = activeProductPairs.has(`${selectedExchangedProduct}:${sz}`);
                        const rentsBySize = exchangedProduct.rents_by_size || {};
                        const sizeRent = rentsBySize[sz] ?? exchangedProduct.rent;
                        const isOverridden = sizeRent !== exchangedProduct.rent;
                        return (
                          <button
                            key={sz}
                            type="button"
                            disabled={isInBooking}
                            onClick={async () => {
                              setSelectedExchangeSize(sz);
                              // Re-fetch bookings filtered by the chosen size so the calendar is accurate
                              if (selectedExchangedProduct) {
                                await fetchProductBookings(selectedExchangedProduct, sz);
                              }
                            }}
                            className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all duration-200 ${isInBooking
                              ? 'opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400'
                              : isSelected
                                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-red-400 hover:text-red-600'
                              }`}
                          >
                            {sz}
                            {isOverridden && <span className="text-xs ml-1 opacity-70">₹{sizeRent}</span>}
                            {isInBooking && ' ✓'}
                          </button>
                        );
                      })}
                    </div>
                    {!selectedExchangeSize && (
                      <p className="text-xs text-orange-600 mt-1">⚠️ Please select a size</p>
                    )}
                  </div>
                );
              })()}

              {/* Size selection gate — everything below requires a size when product has sizes */}
              {sizeSelectionPending && selectedExchangedProduct && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 text-center">
                  <p className="text-sm font-semibold text-amber-800">
                    ⚠️ Please select a size above to see exchange calculations
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    The rent and payment calculations depend on the selected size.
                  </p>
                </div>
              )}

              {/* Exchange Reason — only shown after size is selected (if required) */}
              {!sizeSelectionPending && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason (Optional)
                  </label>
                  <textarea
                    value={exchangeReason}
                    onChange={(e) => setExchangeReason(e.target.value)}
                    placeholder="Enter reason for exchange..."
                    rows={3}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>
              )}

              {/* Transport Details Section — shown when transport is enabled for this booking */}
              {!sizeSelectionPending && transportEnabled && selectedExchangedProduct && (() => {
                // Build the list of new products for the transport modal
                // Use composite id (productId:size) to distinguish same product in different sizes
                const mainProd = availableProducts.find(p => p.id === selectedExchangedProduct);

                const newTransportProducts = [
                  { id: makeKey(selectedExchangedProduct, selectedExchangeSize), name: mainProd?.name || 'Product', code: mainProd?.code, size: selectedExchangeSize || undefined },
                  ...additionalProducts.map(pid => {
                    const p = availableProducts.find(prod => prod.id === pid);
                    const sz = additionalProductSizes[pid] || undefined;
                    return { id: makeKey(pid, sz), name: p?.name || 'Product', code: p?.code, size: sz };
                  })
                ];

                // Build initialValues: use per-product values if set, or fall back to prefill
                const modalInitialValues: Record<string, Partial<TransportFormData>> = {};
                for (const p of newTransportProducts) {
                  modalInitialValues[p.id] = exchangeTransportDetails[p.id] || exchangeTransportDetails['prefill'] || {};
                }

                const hasAnyDetails = Object.values(exchangeTransportDetails).some(d => d && (d.transporter_name || d.destination));

                return (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-teal-800">📍 Transport Details</h3>
                      <button
                        type="button"
                        onClick={() => setShowTransportModal(true)}
                        className="text-sm bg-teal-600 text-white px-4 py-1.5 rounded-lg hover:bg-teal-700 transition-colors font-medium"
                      >
                        {hasAnyDetails ? '✏️ Edit Transport Details' : '📍 Set Transport Details'}
                      </button>
                    </div>
                    {hasAnyDetails && (
                      <div className="space-y-1">
                        {newTransportProducts.map(p => {
                          const d = exchangeTransportDetails[p.id] || exchangeTransportDetails['prefill'];
                          if (!d || (!d.transporter_name && !d.destination)) return null;
                          return (
                            <div key={p.id} className="flex items-center gap-2 text-xs text-teal-700 py-1 border-t border-teal-100 first:border-t-0">
                              <span className="font-medium text-gray-800">{p.name}</span>
                              {d.transporter_name && <span>• {d.transporter_name}</span>}
                              {d.destination && <span>→ {d.destination}</span>}
                              {d.transporter_id && <span className="text-teal-600">✅</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!hasAnyDetails && (
                      <p className="text-xs text-teal-600">
                        {exchangeTransportDetails['prefill'] ? 'Transport details will be copied from the old product.' : 'No transport details set yet. Click above to add.'}
                      </p>
                    )}

                    {/* Transport Details Modal */}
                    {showTransportModal && (
                      <TransportDetailsModal
                        products={newTransportProducts as any}
                        initialValues={modalInitialValues}
                        onSave={async (data) => {
                          setExchangeTransportDetails(data as Record<string, Partial<TransportFormData>>);
                          setShowTransportModal(false);
                        }}
                        onClose={() => setShowTransportModal(false)}
                        title="📍 Transport Details for Exchanged Products"
                      />
                    )}
                  </div>
                );
              })()}

              {/* Add More Products Section - Only visible when size is selected */}
              {!sizeSelectionPending && selectedOriginalProduct && selectedExchangedProduct && (
                <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
                  <label className="block text-sm font-medium text-blue-800 mb-2">
                    Add More Products (Optional)
                  </label>
                  <p className="text-xs text-blue-600 mb-3">
                    You can add more products to this exchange along with the main product selected above.
                  </p>

                  {/* Search Input */}
                  <div className="mb-3">
                    <input
                      type="text"
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      placeholder="Search by product name or code..."
                      className="w-full px-4 py-2.5 border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    />
                  </div>

                  {/* Product List with Checkboxes */}
                  <div className="border-2 border-blue-300 rounded-lg bg-white max-h-[200px] overflow-y-auto">
                    {(() => {
                      const activeProductKeys = new Set(
                        currentProducts
                          .filter(p => !['cancelled', 'exchanged', 'completed', 'discarded'].includes(p.status))
                          .map(p => makeKey(p.product_id, p.size))
                      );
                      // Also mark the main exchange product's selected size as taken
                      if (selectedExchangedProduct && selectedExchangeSize) {
                        activeProductKeys.add(makeKey(selectedExchangedProduct, selectedExchangeSize));
                      }
                      const filteredProducts = availableProducts
                        .filter(p => {
                          // Only exclude the main exchange product if it has no sizes (adding it again would be redundant)
                          if (p.id === selectedExchangedProduct && !(p.available_sizes?.length > 0)) return false;
                          return true;
                        })
                        .filter(p => {
                          if (!productSearchTerm) return true;
                          const search = productSearchTerm.toLowerCase();
                          return (
                            p.name?.toLowerCase().includes(search) ||
                            p.code?.toLowerCase().includes(search)
                          );
                        });

                      if (filteredProducts.length === 0) {
                        return (
                          <div className="p-4 text-center text-sm text-gray-500">
                            {productSearchTerm ? 'No products found matching your search' : 'No additional products available'}
                          </div>
                        );
                      }

                      return (
                        <div className="divide-y divide-gray-200">
                          {filteredProducts.map((product) => {
                            const isSelected = additionalProducts.includes(product.id);
                            // Only disable if all sizes of this product are already active in the booking
                            // (products with sizes can be added again in a different size)
                            const hasSizes = product.available_sizes?.length > 0;
                            const isActiveInBooking = hasSizes
                              ? product.available_sizes.every((sz: string) => activeProductKeys.has(makeKey(product.id, sz)))
                              : activeProductKeys.has(makeKey(product.id));
                            return (
                              <label
                                key={product.id}
                                className={`flex items-center p-3 transition-colors ${isActiveInBooking
                                  ? 'opacity-50 cursor-not-allowed bg-gray-50'
                                  : `hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`
                                  }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isActiveInBooking}
                                  onChange={async (e) => {
                                    if (isActiveInBooking) return;
                                    if (e.target.checked) {
                                      setAdditionalProducts([...additionalProducts, product.id]);
                                      // Initialize dates for the new product
                                      setProductDates(prev => ({
                                        ...prev,
                                        [product.id]: {
                                          booked_from: '',
                                          booked_to: ''
                                        }
                                      }));
                                      // For sizeless products, fetch bookings now.
                                      // For sized products, the size selector onClick fetches with the correct size.
                                      const hasSizes = product.available_sizes?.length > 0;
                                      if (!hasSizes) {
                                        await fetchProductBookings(product.id);
                                      }
                                    } else {
                                      setAdditionalProducts(additionalProducts.filter(id => id !== product.id));
                                      // Clear dates for removed product
                                      setProductDates(prev => {
                                        const newDates = { ...prev };
                                        delete newDates[product.id];
                                        return newDates;
                                      });
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mr-3 flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {product.name}
                                      </p>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        Code: {product.code}
                                        {isActiveInBooking && (
                                          <span className="ml-2 text-amber-600 font-medium">(already in this booking)</span>
                                        )}
                                      </p>
                                    </div>
                                    <div className="ml-3 text-right">
                                      <p className="text-sm font-semibold text-gray-900">
                                        ₹{parseFloat(String(product.rent || '0')).toLocaleString('en-IN')}
                                      </p>
                                      <p className="text-xs text-gray-500">per day</p>
                                      {parseFloat(String(product.security_deposit || '0')) > 0 && (
                                        <p className="text-xs text-gray-400 mt-0.5">
                                          Security: ₹{parseFloat(String(product.security_deposit || '0')).toLocaleString('en-IN')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Selected Additional Products Summary */}
                  {additionalProducts.length > 0 && (
                    <div className="mt-3 p-3 bg-white rounded-lg border-2 border-blue-200">
                      <p className="text-sm font-semibold text-blue-800 mb-2">Selected Additional Products ({additionalProducts.length}):</p>
                      <div className="space-y-2 max-h-[120px] overflow-y-auto">
                        {additionalProducts.map((productId) => {
                          const product = availableProducts.find(p => p.id === productId);
                          if (!product) return null;
                          const hasSizes = product.available_sizes && product.available_sizes.length > 0;
                          const selectedSz = additionalProductSizes[productId] || null;
                          return (
                            <div key={productId} className="p-2 bg-gray-50 rounded">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">
                                    {product.name}
                                    {selectedSz && <span className="ml-1 text-xs text-gray-500">· {selectedSz}</span>}
                                  </p>
                                  <p className="text-xs text-gray-500">{product.code}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-right">
                                    <span className="text-sm font-semibold text-gray-900">
                                      ₹{(() => {
                                        const rentsBySize = product.rents_by_size || {};
                                        const displayRent = (selectedSz && rentsBySize[selectedSz]) ? rentsBySize[selectedSz] : product.rent;
                                        return parseFloat(String(displayRent || '0')).toLocaleString('en-IN');
                                      })()}/day
                                    </span>
                                    {parseFloat(String(product.security_deposit || '0')) > 0 && (
                                      <p className="text-xs text-gray-400">
                                        Security: ₹{parseFloat(String(product.security_deposit || '0')).toLocaleString('en-IN')}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAdditionalProducts(additionalProducts.filter(id => id !== productId));
                                      // Clear dates and size for removed product
                                      setProductDates(prev => {
                                        const newDates = { ...prev };
                                        delete newDates[productId];
                                        return newDates;
                                      });
                                      setAdditionalProductSizes(prev => {
                                        const newSizes = { ...prev };
                                        delete newSizes[productId];
                                        return newSizes;
                                      });
                                    }}
                                    className="text-red-600 hover:text-red-800 p-1"
                                    title="Remove"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                              {/* Size selector for this additional product */}
                              {hasSizes && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                {sortSizes(product.available_sizes).map((sz: string) => {
                                    const isSelected = selectedSz === sz;
                                    const rentsBySize = product.rents_by_size || {};
                                    const sizeRent = rentsBySize[sz] ?? product.rent;
                                    const isOverridden = sizeRent !== product.rent;
                                    // Disable sizes already taken by active booking products or the main exchange product
                                    const isSizeTaken = 
                                      currentProducts.some(p => !['cancelled', 'exchanged', 'completed', 'discarded'].includes(p.status) && p.product_id === productId && p.size === sz) ||
                                      (selectedExchangedProduct === productId && selectedExchangeSize === sz);
                                    return (
                                      <button
                                        key={sz}
                                        type="button"
                                        disabled={isSizeTaken}
                                        onClick={async () => {
                                          if (isSizeTaken) return;
                                          setAdditionalProductSizes(prev => ({ ...prev, [productId]: sz }));
                                          // Re-fetch bookings filtered by the chosen size
                                          await fetchProductBookings(productId, sz);
                                        }}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${isSizeTaken
                                          ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed line-through'
                                          : isSelected
                                            ? 'bg-red-600 text-white border-red-600'
                                            : 'bg-white text-gray-600 border-gray-300 hover:border-red-400'
                                          }`}
                                        title={isSizeTaken ? 'This size is already in the booking or selected as main exchange' : undefined}
                                      >
                                        {sz}
                                        {isOverridden && <span className="ml-0.5 opacity-70">₹{sizeRent}</span>}
                                      </button>
                                    );
                                  })}
                                  {!selectedSz && (
                                    <span className="text-xs text-orange-500 ml-1 self-center">← select size</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 pt-3 border-t border-blue-200 space-y-1">
                        <div className="flex justify-between text-sm font-semibold text-blue-800">
                          <span>Total Additional Rent:</span>
                          <span>₹{(exchangePreview?.calculations.additional_rent || 0).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Lower Value Exchange Info - Removed, now unified logic */}

              {/* Selected Products Preview — hidden until size is selected */}
              {!sizeSelectionPending && selectedOriginalProduct && selectedExchangedProduct && originalProduct && exchangedProduct && (() => {
                // Get dates for display
                const bookedFrom = bookingDates?.booked_from || '';
                const bookedTo = bookingDates?.booked_to || '';

                // Collect all products to display (main exchanged + additional)
                const allSelectedProducts = [
                  { ...exchangedProduct, isMain: true }
                ];
                additionalProducts.forEach(productId => {
                  const product = availableProducts.find(p => p.id === productId);
                  if (product) {
                    allSelectedProducts.push({ ...product, isMain: false });
                  }
                });

                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                    <h4 className="text-sm font-semibold text-blue-900 mb-3">Selected Products for Exchange</h4>

                    {/* Products List */}
                    <div className="space-y-3">
                      {allSelectedProducts.map((product, index) => {
                        const selectedSize = product.isMain ? selectedExchangeSize : additionalProductSizes[product.id];
                        const dateKey = makeKey(product.id, selectedSize);
                        const productRent = (selectedSize && product.rents_by_size?.[selectedSize])
                          ? parseFloat(String(product.rents_by_size[selectedSize])) || 0
                          : parseFloat(String(product.rent || '0')) || 0;
                        const productSecurity = parseFloat(product.security_deposit || '0') || 0;

                        return (
                          <div key={dateKey} className="bg-white rounded-lg p-3 border border-blue-200">
                            <div className="flex items-start gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h5 className="font-semibold text-gray-900">{product.name}</h5>
                                  {product.isMain && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Main Exchange</span>
                                  )}
                                  {!product.isMain && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Additional</span>
                                  )}
                                </div>
                                {product.code && (
                                  <p className="text-xs text-gray-500 font-mono mb-1">
                                    Code: {product.code}
                                    {(() => {
                                      const size = product.isMain ? selectedExchangeSize : additionalProductSizes[product.id];
                                      return size ? <span className="ml-2 text-gray-700 font-semibold">| Size: {size}</span> : null;
                                    })()}
                                  </p>
                                )}
                                <div className="space-y-1 mt-2">
                                  <p className="text-sm text-gray-700">
                                    <span className="font-medium">Rent:</span> ₹{productRent.toLocaleString('en-IN')} / Day
                                  </p>
                                  <p className="text-sm text-gray-700">
                                    <span className="font-medium">Security:</span> ₹{productSecurity.toLocaleString('en-IN')}
                                  </p>
                                </div>

                                {/* Date Selection for Each Product */}
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                                    Select Dates for {product.name}
                                  </h3>
                                  <div>
                                    <DateRangePicker
                                      key={`date-picker-${dateKey}-${index}`}
                                      label=""
                                      startDate={productDates[dateKey]?.booked_from || ''}
                                      endDate={productDates[dateKey]?.booked_to || ''}
                                      bookings={productBookings[dateKey] || []}
                                      productName={product.name}
                                      onStartDateChange={(date) => {
                                        setProductDates(prev => ({
                                          ...prev,
                                          [dateKey]: {
                                            ...prev[dateKey],
                                            booked_from: date || ''
                                          }
                                        }));
                                        // Clear error when date changes
                                        setAvailabilityErrors(prev => {
                                          const newErrors = { ...prev };
                                          delete newErrors[dateKey];
                                          return newErrors;
                                        });
                                      }}
                                      onEndDateChange={(date) => {
                                        const currentFrom = productDates[dateKey]?.booked_from || '';
                                        setProductDates(prev => ({
                                          ...prev,
                                          [dateKey]: {
                                            ...prev[dateKey],
                                            booked_to: date || ''
                                          }
                                        }));

                                        // Check availability when both dates are set (with size)
                                        if (date && currentFrom) {
                                          const productSize = product.isMain ? selectedExchangeSize : additionalProductSizes[product.id];
                                          checkProductAvailability(
                                            product.id,
                                            currentFrom,
                                            date,
                                            productSize
                                          ).then(availability => {
                                            if (!availability.available) {
                                              setAvailabilityErrors(prev => ({
                                                ...prev,
                                                [dateKey]: availability.message || 'Not available'
                                              }));
                                              setUrgentConflictsMap(prev => {
                                                const m = { ...prev };
                                                delete m[dateKey];
                                                return m;
                                              });
                                            } else if (availability.isUrgent) {
                                              setAvailabilityErrors(prev => ({
                                                ...prev,
                                                [dateKey]: `⚠️ ${availability.message || 'Tight schedule'}`
                                              }));
                                              if (availability.conflicts && availability.conflicts.length > 0) {
                                                setUrgentConflictsMap(prev => ({
                                                  ...prev,
                                                  [dateKey]: availability.conflicts!
                                                }));
                                              }
                                            } else {
                                              setAvailabilityErrors(prev => {
                                                const newErrors = { ...prev };
                                                delete newErrors[dateKey];
                                                return newErrors;
                                              });
                                              setUrgentConflictsMap(prev => {
                                                const m = { ...prev };
                                                delete m[dateKey];
                                                return m;
                                              });
                                            }
                                          });
                                        }
                                      }}
                                      minDate={new Date().toISOString().split('T')[0]}
                                    />
                                  </div>
                                  {availabilityErrors[dateKey] && (
                                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                      <div className="flex items-start">
                                        <svg className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <div className="flex-1">
                                          <p className={`text-sm font-medium ${availabilityErrors[dateKey].includes('⚠️')
                                            ? 'text-orange-700'
                                            : 'text-red-700'
                                            }`}>
                                            {availabilityErrors[dateKey]}
                                          </p>
                                          {urgentConflictsMap[dateKey] && urgentConflictsMap[dateKey].length > 0 && (
                                            <button
                                              type="button"
                                              onClick={() => setShowUrgentDetailProductId(dateKey)}
                                              className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                                            >
                                              View Details
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Exchange Impact Summary */}
                    <div className="border-t border-blue-300 pt-3 mt-3">
                      <h5 className="text-sm font-semibold text-blue-900 mb-2">Exchange Impact Summary</h5>
                      <div className="space-y-2 text-sm text-blue-800">
                        <div className="flex justify-between">
                          <span>Current Total Rent:</span>
                          <span className="font-semibold">₹{(exchangePreview?.calculations?.current_total_rent ?? currentProducts.reduce((sum, p) => sum + (parseFloat(String(p.effective_rent || p.rent)) || 0), 0)).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>After Exchange:</span>
                          <span className="font-semibold text-green-700">₹{(exchangePreview?.calculations?.after_exchange_rent ?? 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="border-t border-blue-300 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span>Current Security:</span>
                            <span className="font-semibold">₹{(exchangePreview?.calculations?.current_total_security ?? currentProducts.reduce((sum, p) => sum + (parseFloat(p.security_deposit) || 0), 0)).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>After Exchange:</span>
                            <span className="font-semibold text-green-700">₹{(exchangePreview?.calculations?.after_exchange_security ?? 0).toLocaleString('en-IN')}</span>
                          </div>
                        </div>

                        {/* Payment Breakdown - Using Backend Preview */}
                        <div className="border-t border-blue-300 pt-2 mt-2">
                          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-3">
                            <p className="text-xs font-semibold text-yellow-800 mb-1">Payment Calculation:</p>
                            <p className="text-xs text-yellow-700">
                              Total = New Rent + Exchange Penalty + Downgrade Penalty - Original Rent Paid
                            </p>
                          </div>

                          {exchangePreview && (
                            <>
                              {/* Original Rent */}
                              <div className="flex justify-between">
                                <span>Original Product Rent:</span>
                                <span className="font-semibold">₹{exchangePreview.calculations.effective_rent.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Original Rent Paid:</span>
                                <span className="font-semibold text-blue-700">₹{(exchangePreview.calculations.old_rent_paid ?? exchangePreview.calculations.effective_rent).toLocaleString('en-IN')}</span>
                              </div>

                              {/* New Rent */}
                              <div className="flex justify-between">
                                <span>New Product(s) Rent:</span>
                                <span className="font-semibold text-green-700">₹{exchangePreview.calculations.total_new_rent.toLocaleString('en-IN')}</span>
                              </div>

                              {/* Exchange Penalty */}
                              <div className="flex justify-between">
                                <span>Exchange Penalty ({exchangePreview.calculations.penalty_percentage}%):</span>
                                <span className="font-semibold text-orange-700">₹{Math.floor(exchangePreview.calculations.exchange_penalty).toLocaleString('en-IN')}</span>
                              </div>

                              {/* Rent Difference */}
                              <div className="flex justify-between">
                                <span>Downgrade Penalty:</span>
                                <span className="font-semibold text-purple-700">₹{Math.floor(exchangePreview.calculations.downgrade_penalty).toLocaleString('en-IN')}</span>
                              </div>
                              {exchangePreview.calculations.downgrade_penalty > 0 && (
                                <p className="text-xs text-purple-600 mt-1 ml-4">
                                  (Balancing amount when downgrading: ₹{exchangePreview.calculations.effective_rent.toLocaleString('en-IN')} - ₹{exchangePreview.calculations.total_new_rent.toLocaleString('en-IN')} - ₹{Math.floor(exchangePreview.calculations.exchange_penalty).toLocaleString('en-IN')} = ₹{Math.floor(exchangePreview.calculations.downgrade_penalty).toLocaleString('en-IN')})
                                </p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Total Payment Due */}
                        {exchangePreview && (
                          <div className="border-t-2 border-blue-400 pt-3 mt-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-base font-bold text-gray-900">Total Payment Due:</span>
                              <span className="text-2xl font-bold text-indigo-600">₹{Math.floor(exchangePreview.calculations.total_payment_due).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="text-xs text-gray-600 bg-white rounded p-2">
                              <p className="font-mono">
                                New Rent ₹{exchangePreview.calculations.total_new_rent.toLocaleString('en-IN')} + Penalty ₹{Math.floor(exchangePreview.calculations.exchange_penalty).toLocaleString('en-IN')} + Downgrade ₹{Math.floor(exchangePreview.calculations.downgrade_penalty).toLocaleString('en-IN')} - Rent Paid ₹{(exchangePreview.calculations.old_rent_paid ?? exchangePreview.calculations.effective_rent).toLocaleString('en-IN')} = ₹{Math.floor(exchangePreview.calculations.total_payment_due).toLocaleString('en-IN')}
                              </p>
                            </div>
                            {exchangePreview.calculations.total_payment_due > 0 && (
                              <p className="text-sm font-semibold text-indigo-700 mt-3 text-center">
                                Customer needs to pay ₹{Math.floor(exchangePreview.calculations.total_payment_due).toLocaleString('en-IN')}
                              </p>
                            )}
                            {exchangePreview.calculations.total_payment_due === 0 && (
                              <p className="text-sm font-semibold text-green-700 mt-3 text-center">
                                No additional payment required
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-blue-700 mt-3">
                      <strong>Note:</strong> Total rental and security will be recalculated as sum of all products.
                    </p>
                  </div>
                );
              })()}

              {/* Payment Collection Section - Inline */}
              {totalPaymentDue > 0 && pendingExchangeData && (
                <div className="bg-gradient-to-r from-green-50 to-blue-50 border-2 border-green-400 rounded-lg p-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4">💳 Payment Collection</h4>

                  {/* Total Payment Due */}
                  <div className="bg-white border-2 border-indigo-400 rounded-lg p-4 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-bold text-gray-900">Total Payment Due:</span>
                      <span className="text-3xl font-bold text-indigo-600">
                        ₹{Math.floor(totalPaymentDue).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <PaymentMethodInput
                    method={paymentMethod}
                    onMethodChange={setPaymentMethod}
                    notes={paymentNarration}
                    onNotesChange={setPaymentNarration}
                    notesLabel="Narration / Notes (Optional)"
                    notesPlaceholder="Enter transaction details, reference number, etc."
                    colorScheme="green"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 p-6 border-t border-gray-200">
              {!allProductDatesSet && selectedExchangedProduct && (
                <p className="text-xs text-red-600 text-right">
                  ⚠️ Please select start and end dates for all replacement products.
                </p>
              )}
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => {
                    setShowExchangeModal(false);
                    setTotalPaymentDue(0);
                    setPendingExchangeData(null);
                    setPaymentMethod('Cash');
                    setPaymentNarration('');
                  }}
                  className="px-6 py-2.5 bg-white border-2 border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors"
                >
                  CANCEL
                </button>
                <button
                  onClick={() => {
                    if (totalPaymentDue > 0 && paymentMethod === 'UPI') {
                      setShowUpiQrModal(true);
                    } else if (totalPaymentDue > 0) {
                      handlePaymentCollection();
                    } else {
                      handleExchange();
                    }
                  }}
                  disabled={loading || !selectedOriginalProduct || !selectedExchangedProduct || !allProductDatesSet || sizeSelectionPending}
                  title={!allProductDatesSet && selectedExchangedProduct ? 'Please select dates for all replacement products' : undefined}
                  className="px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Processing...' : (totalPaymentDue > 0 ? 'COLLECT PAYMENT & EXCHANGE' : 'EXCHANGE')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UPI QR Confirmation Modal for Exchange Payment */}
      {showUpiQrModal && (
        <UpiQrConfirmModal
          amount={totalPaymentDue}
          paymentCategory="rent"
          onConfirm={(qrCodeId) => {
            setActiveQrCodeId(qrCodeId);
            setShowUpiQrModal(false);
            handlePaymentCollection();
          }}
          onCancel={() => { setShowUpiQrModal(false); setActiveQrCodeId(null); }}
        />
      )}

      {/* Refund Modal for Lapsed Amount */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg">
            <div className="bg-yellow-500 text-white px-6 py-4 rounded-t-lg">
              <div className="flex items-center gap-3">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <h3 className="text-lg font-bold">⚠️ Lapsed Amount Detected</h3>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <p className="text-sm font-semibold text-red-800 mb-2">
                  Amount Paid for Exchange: ₹{refundLapsedAmount.toFixed(2)}
                </p>
                <p className="text-sm text-red-700">
                  This amount was paid for the exchange that you're about to delete.
                  <br />
                  <strong>As per policy, this is NON-REFUNDABLE.</strong>
                </p>
              </div>

              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-sm font-semibold text-blue-800 mb-2">
                  ✨ ONE-TIME Refund Opportunity
                </p>
                <p className="text-sm text-blue-700">
                  However, you have a <strong>ONE-TIME option</strong> to refund this amount now (partially or fully).
                </p>
              </div>

              <div className="bg-orange-50 border-l-4 border-orange-500 p-4 rounded">
                <p className="text-xs font-semibold text-orange-800 mb-2">
                  ⚠️ IMPORTANT WARNING
                </p>
                <ul className="text-xs text-orange-700 space-y-1 list-disc list-inside">
                  <li>This refund will be recorded in transaction history</li>
                  <li>It will <strong>NOT affect</strong> rent/security calculations</li>
                  <li>This is your <strong>ONLY CHANCE</strong> to refund this amount</li>
                  <li>Once deleted, you cannot refund the remaining lapsed amount</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Refund Amount (Optional)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (isIntegerInput(val)) {
                        setRefundAmount(val);
                      }
                    }}
                    onKeyDown={integerKeyDown(() => refundAmount, setRefundAmount)}
                    min="0"
                    max={refundLapsedAmount}
                    step="1"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-600">
                  <span>Maximum: ₹{Math.floor(refundLapsedAmount).toLocaleString('en-IN')}</span>
                  <button
                    type="button"
                    onClick={() => setRefundAmount(String(Math.floor(refundLapsedAmount)))}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Use Max
                  </button>
                </div>
              </div>

              {parseInt(refundAmount) > 0 && parseInt(refundAmount) < refundLapsedAmount && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-yellow-800">
                    Final Lapsed Amount: ₹{Math.floor(refundLapsedAmount - parseInt(refundAmount)).toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-yellow-700 mt-1">
                    This remaining amount will be shown as non-refundable in history
                  </p>
                </div>
              )}

              {parseFloat(refundAmount) >= refundLapsedAmount && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-green-800">
                    ✅ Full Refund - No lapsed amount will remain
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={handleRefundModalCancel}
                disabled={loading}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium disabled:opacity-50 transition-colors"
              >
                Skip Refund
              </button>
              <button
                onClick={handleRefundModalConfirm}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors"
              >
                {loading ? 'Processing...' : (parseFloat(refundAmount) > 0 ? 'Confirm Refund & Delete' : 'Delete Without Refund')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Urgent Conflict Details Modal */}
      {showUrgentDetailProductId !== null && urgentConflictsMap[showUrgentDetailProductId] && (
        <UrgentDetailsModal
          bookingId={bookingId}
          conflicts={urgentConflictsMap[showUrgentDetailProductId]}
          onClose={() => setShowUrgentDetailProductId(null)}
        />
      )}
    </div>
  );
}

