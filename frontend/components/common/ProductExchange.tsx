'use client';

import React, { useState, useEffect } from 'react';
import { productExchangesApi } from '@/lib/productExchangesApi';
import { productsApi, bookingsApi } from '@/lib/api';
import { settingsApi } from '@/lib/settingsApi';
import { toast } from '@/lib/toast';
import DateRangePicker from '@/components/common/DateRangePicker';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface ProductExchangeProps {
  bookingId: number;
  bookingDate: string;
  currentProducts: any[];
  onExchangeComplete?: () => void;
  userRole?: 'admin' | 'salesman';
  userName?: string;
}

export function ProductExchange({
  bookingId,
  bookingDate,
  currentProducts,
  onExchangeComplete,
  userRole = 'admin',
  userName
}: ProductExchangeProps) {
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [selectedOriginalProduct, setSelectedOriginalProduct] = useState<number | null>(null);
  const [selectedExchangedProduct, setSelectedExchangedProduct] = useState<number | null>(null);
  const [additionalProducts, setAdditionalProducts] = useState<number[]>([]); // For multiple product selection
  const [productSearchTerm, setProductSearchTerm] = useState(''); // For searching products
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [exchangeReason, setExchangeReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingExchanges, setFetchingExchanges] = useState(false);
  
  // Refund modal state
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundLapsedAmount, setRefundLapsedAmount] = useState(0);
  const [refundAmount, setRefundAmount] = useState('');
  const [pendingDeleteExchangeId, setPendingDeleteExchangeId] = useState<number | null>(null);
  
  // Date selection for each product
  const [productDates, setProductDates] = useState<Record<number, { booked_from: string; booked_to: string }>>({});
  const [productBookings, setProductBookings] = useState<Record<number, any[]>>({}); // Bookings for each product for availability checking
  const [availabilityErrors, setAvailabilityErrors] = useState<Record<number, string>>({});
  
  // Payment collection state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [exchangePenaltyAmount, setExchangePenaltyAmount] = useState<number>(0);
  const [rentDifferenceAmount, setRentDifferenceAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentNarration, setPaymentNarration] = useState('');
  const [pendingExchange, setPendingExchange] = useState<any>(null);
  const [pendingExchangeData, setPendingExchangeData] = useState<any>(null); // Store exchange data before creating it
  const [paymentType, setPaymentType] = useState<'penalty' | 'rent' | 'both'>('penalty');
  
  // Exchange policy and charge preview
  const [exchangePolicy, setExchangePolicy] = useState<any>(null);
  const [exchangeCharge, setExchangeCharge] = useState<number>(0);
  const [calculatedPenalty, setCalculatedPenalty] = useState<number>(0);
  const [calculatedTotal, setCalculatedTotal] = useState<number>(0);
  const [rentDifference, setRentDifference] = useState<number>(0);
  const [securityDifference, setSecurityDifference] = useState<number>(0);
  const [bookingDates, setBookingDates] = useState<{ booked_from: string; booked_to: string } | null>(null);

  useEffect(() => {
    fetchExchanges();
    fetchExchangePolicy();
    fetchExchangeCharge();
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
  
  // Calculate charges when original or exchanged product is selected, or when additional products change
  useEffect(() => {
    if (selectedOriginalProduct && selectedExchangedProduct && exchangePolicy && bookingDate) {
      calculateExchangeCharges();
    }
  }, [selectedOriginalProduct, selectedExchangedProduct, exchangePolicy, bookingDate, additionalProducts, availableProducts, exchangeCharge]);
  
  async function fetchExchangePolicy() {
    try {
      const response = await settingsApi.getByKey('refund_policy');
      if (response.data?.setting_value) {
        const policy = JSON.parse(response.data.setting_value);
        setExchangePolicy(policy);
        console.log('Exchange Policy loaded:', policy);
      }
    } catch (error) {
      console.error('Error fetching exchange policy:', error);
    }
  }
  
  async function fetchExchangeCharge() {
    try {
      const response = await settingsApi.getByKey('exchange_charges');
      if (response.data?.setting_value) {
        const charge = parseFloat(response.data.setting_value) || 0;
        setExchangeCharge(charge);
        console.log('Exchange Charge loaded:', charge);
      }
    } catch (error) {
      console.error('Error fetching exchange charges:', error);
    }
  }
  
  function calculateExchangeCharges() {
    if (!selectedOriginalProduct || !selectedExchangedProduct || !exchangePolicy || !bookingDate) return;
    
    const originalProduct = currentProducts.find(p => p.id === selectedOriginalProduct);
    const exchangedProduct = availableProducts.find(p => p.id === selectedExchangedProduct);
    if (!originalProduct || !exchangedProduct) return;
    
    // Calculate days from booking date
    const bookingDateObj = new Date(bookingDate);
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - bookingDateObj.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log('Days from booking date:', daysDiff);
    
    // Calculate penalty percentage based on exchange policy
    let penaltyPercentage = 0;
    const days = exchangePolicy.days || [3, 5, 7, -1];
    const penalties = [
      exchangePolicy.before_7_days || 0,
      exchangePolicy.before_3_days || 0,
      exchangePolicy.before_1_day || 0,
      exchangePolicy.on_booking_date || 0
    ];
    
    if (daysDiff <= days[0]) {
      penaltyPercentage = penalties[0];
      console.log(`Within ${days[0]} days: ${penaltyPercentage}% penalty`);
    } else if (daysDiff <= days[1]) {
      penaltyPercentage = penalties[1];
      console.log(`Within ${days[1]} days: ${penaltyPercentage}% penalty`);
    } else if (daysDiff <= days[2]) {
      penaltyPercentage = penalties[2];
      console.log(`Within ${days[2]} days: ${penaltyPercentage}% penalty`);
    } else {
      penaltyPercentage = penalties[3];
      console.log(`After ${days[2]} days: ${penaltyPercentage}% penalty`);
    }
    
    // Calculate new total as sum of all products (after exchange)
    const originalRent = parseFloat(originalProduct.rent_per_day) || 0;
    const newRent = parseFloat(exchangedProduct.rent_per_day) || 0;
    
    // Calculate additional products rent and security
    const additionalRent = additionalProducts.reduce((sum, productId) => {
      const product = availableProducts.find(p => p.id === productId);
      return sum + (product ? parseFloat(product.rent_per_day || '0') || 0 : 0);
    }, 0);
    
    const additionalSecurity = additionalProducts.reduce((sum, productId) => {
      const product = availableProducts.find(p => p.id === productId);
      return sum + (product ? parseFloat(product.security_deposit || '0') || 0 : 0);
    }, 0);
    
    // Sum of all products' rent (remove old, add new + additional)
    const currentTotalRent = currentProducts.reduce((sum, p) => {
      return sum + (parseFloat(p.rent_per_day) || 0);
    }, 0);
    const totalNewRent = newRent + additionalRent;
    const newTotalRent = currentTotalRent - originalRent + totalNewRent;
    
    // Calculate security (including additional products)
    const originalSecurity = parseFloat(originalProduct.security_deposit) || 0;
    const newSecurity = parseFloat(exchangedProduct.security_deposit) || 0;
    const totalNewSecurity = newSecurity + additionalSecurity;
    
    const currentTotalSecurity = currentProducts.reduce((sum, p) => {
      return sum + (parseFloat(p.security_deposit) || 0);
    }, 0);
    const newTotalSecurity = currentTotalSecurity - originalSecurity + totalNewSecurity;
    
    // Calculate penalty charge
    const penaltyCharge = (originalRent * penaltyPercentage) / 100;
    const totalCharge = penaltyCharge + exchangeCharge;
    
    setRentDifference(newTotalRent);
    setSecurityDifference(newTotalSecurity);
    setCalculatedPenalty(penaltyPercentage);
    setCalculatedTotal(totalCharge);
    
    console.log('Exchange calculation:', {
      daysDiff,
      currentTotalRent,
      originalRent,
      newRent,
      additionalRent,
      totalNewRent,
      newTotalRent,
      currentTotalSecurity,
      originalSecurity,
      newSecurity,
      additionalSecurity,
      totalNewSecurity,
      newTotalSecurity,
      penaltyPercentage,
      penaltyCharge,
      fixedExchangeCharge: exchangeCharge,
      totalCharge,
      additionalProductsCount: additionalProducts.length
    });
  }

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

  async function fetchProductBookings(productId: number) {
    try {
      const response = await axios.get(`${API_URL}/bookings/product/${productId}`);
      setProductBookings(prev => ({
        ...prev,
        [productId]: response.data || []
      }));
    } catch (error) {
      console.error(`Error fetching bookings for product ${productId}:`, error);
      setProductBookings(prev => ({
        ...prev,
        [productId]: []
      }));
    }
  }

  async function checkProductAvailability(productId: number, dateFrom: string, dateTo: string): Promise<{ available: boolean; message?: string; isUrgent?: boolean }> {
    if (!dateFrom || !dateTo) {
      return { available: false, message: 'Please select both pickup and drop dates' };
    }

    try {
      const response = await axios.post(`${API_URL}/availability/check`, {
        product_id: productId,
        date_from: dateFrom,
        date_to: dateTo
      });

      if (!response.data.available) {
        return { 
          available: false, 
          message: response.data.message || 'Product is not available for selected dates' 
        };
      }

      // Check for urgent case (tight scheduling - within 2 days of other bookings)
      const bookings = productBookings[productId] || [];
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      
      for (const booking of bookings) {
        if (!booking.booked_from || !booking.booked_to) continue;
        
        const bookingFrom = new Date(booking.booked_from);
        const bookingTo = new Date(booking.booked_to);
        
        // Check if there's a gap of 2 days or less between bookings
        const daysAfter = Math.floor((fromDate.getTime() - bookingTo.getTime()) / (1000 * 60 * 60 * 24));
        const daysBefore = Math.floor((bookingFrom.getTime() - toDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysAfter >= 0 && daysAfter <= 2) {
          return { 
            available: true, 
            isUrgent: true, 
            message: `Tight schedule: Only ${daysAfter} day(s) gap after previous booking` 
          };
        }
        if (daysBefore >= 0 && daysBefore <= 2) {
          return { 
            available: true, 
            isUrgent: true, 
            message: `Tight schedule: Only ${daysBefore} day(s) gap before next booking` 
          };
        }
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
      const currentProductIds = currentProducts
        .filter(p => p.id !== selectedOriginalProduct)
        .map(p => p.id);
      const available = response.data.filter((p: any) => 
        p.availability && !currentProductIds.includes(p.id)
      );
      setAvailableProducts(available);
      
      // Initialize dates for main exchanged product (use empty strings to allow fresh selection)
      if (selectedExchangedProduct) {
        setProductDates(prev => ({
          ...prev,
          [selectedExchangedProduct]: {
            booked_from: bookingDates?.booked_from?.split('T')[0] || '',
            booked_to: bookingDates?.booked_to?.split('T')[0] || ''
          }
        }));
        // Fetch bookings for main product
        await fetchProductBookings(selectedExchangedProduct);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to load available products');
    }
  }

  async function handleExchange() {
    if (!selectedOriginalProduct || !selectedExchangedProduct) {
      toast.error('Please select both original and exchanged products');
      return;
    }

    // VALIDATION: Total new product rent must be greater than or equal to original product rent
    const originalProduct = currentProducts.find(p => p.id === selectedOriginalProduct);
    const exchangedProduct = availableProducts.find(p => p.id === selectedExchangedProduct);
    
    if (!originalProduct || !exchangedProduct) {
      toast.error('Product not found');
      return;
    }

    const originalRent = parseFloat(originalProduct.rent_per_day || '0') || 0;
    const newRent = parseFloat(exchangedProduct.rent_per_day || '0') || 0;
    
    // Calculate total rent of all selected products (main + additional)
    const additionalRent = additionalProducts.reduce((sum, productId) => {
      const product = availableProducts.find(p => p.id === productId);
      return sum + (product ? parseFloat(product.rent_per_day || '0') || 0 : 0);
    }, 0);
    const totalNewRent = newRent + additionalRent;

    if (totalNewRent < originalRent) {
      toast.error(
        `Exchange not allowed: Total new product rent (₹${totalNewRent.toLocaleString('en-IN')}) must be greater than or equal to original product rent (₹${originalRent.toLocaleString('en-IN')}). Please add more products.`
      );
      return;
    }

    try {
      setLoading(true);
      
      let exchangeBy = userName;
      if (!exchangeBy) {
        if (userRole === 'admin') {
          const adminData = localStorage.getItem('admin_user');
          if (adminData) {
            const admin = JSON.parse(adminData);
            exchangeBy = admin.name || 'Admin';
          }
        } else {
          const salesmanData = localStorage.getItem('salesman_user') || localStorage.getItem('user');
          if (salesmanData) {
            const salesman = JSON.parse(salesmanData);
            exchangeBy = salesman.name || 'Salesman';
          }
        }
      }

      // Validate dates for all products
      const mainProductDates = productDates[selectedExchangedProduct];
      if (!mainProductDates?.booked_from || !mainProductDates?.booked_to) {
        toast.error('Please select dates for the main exchanged product');
        return;
      }

      // Check availability for main product
      const mainAvailability = await checkProductAvailability(
        selectedExchangedProduct,
        mainProductDates.booked_from,
        mainProductDates.booked_to
      );
      if (!mainAvailability.available && !mainAvailability.isUrgent) {
        toast.error(mainAvailability.message || 'Main product is not available for selected dates');
        return;
      }

      // Validate dates for additional products
      for (const additionalProductId of additionalProducts) {
        const dates = productDates[additionalProductId];
        if (!dates?.booked_from || !dates?.booked_to) {
          toast.error(`Please select dates for all additional products`);
          return;
        }
        
        const availability = await checkProductAvailability(
          additionalProductId,
          dates.booked_from,
          dates.booked_to
        );
        if (!availability.available && !availability.isUrgent) {
          const product = availableProducts.find(p => p.id === additionalProductId);
          toast.error(`${product?.name || 'Product'} is not available for selected dates: ${availability.message}`);
          return;
        }
      }

      // IMPORTANT: Don't create exchange yet - show payment modal first
      // Store exchange data to create after payment is collected
      const additionalProdCodes = additionalProducts.map(id => {
        const p = availableProducts.find(prod => prod.id === id);
        return p ? `${p.name} (${p.code})` : `Product ${id}`;
      });

      // Append additional product list into reason so we can display later
      const combinedReason = additionalProdCodes.length
        ? `${exchangeReason ? `${exchangeReason} | ` : ''}Added: ${additionalProdCodes.join(', ')}`
        : exchangeReason || undefined;

      const exchangeDataToCreate = {
        booking_id: bookingId,
        original_product_id: selectedOriginalProduct,
        exchanged_product_id: selectedExchangedProduct,
        exchange_date: new Date().toISOString().split('T')[0],
        reason: combinedReason,
        exchanged_by: exchangeBy,
        booked_from: mainProductDates.booked_from,
        booked_to: mainProductDates.booked_to,
        additionalProducts: additionalProducts.map(productId => ({
          product_id: productId,
          booked_from: productDates[productId].booked_from,
          booked_to: productDates[productId].booked_to
        }))
      };
      
      setPendingExchangeData(exchangeDataToCreate);

      // Calculate rent difference including additional products
      const originalRent = parseFloat(originalProduct.rent_per_day || '0') || 0;
      const newRent = parseFloat(exchangedProduct.rent_per_day || '0') || 0;
      
      // Calculate additional products rent
      const additionalRent = additionalProducts.reduce((sum, productId) => {
        const product = availableProducts.find(p => p.id === productId);
        return sum + (product ? parseFloat(product.rent_per_day || '0') || 0 : 0);
      }, 0);
      
      // Total new rent (main product + additional products)
      const totalNewRent = newRent + additionalRent;
      
      // Rent difference is the amount customer needs to pay if new rent > original rent
      const calculatedRentDifference = totalNewRent > originalRent ? totalNewRent - originalRent : 0;
      
      // Check if we need to collect payments
      const needsPenaltyPayment = calculatedTotal > 0;
      const needsRentPayment = calculatedRentDifference > 0;
      
      if (needsPenaltyPayment || needsRentPayment) {
        // Show payment modal first (exchange will be created after payment)
        setExchangePenaltyAmount(calculatedTotal);
        setRentDifferenceAmount(calculatedRentDifference);
        setPaymentType(needsPenaltyPayment && needsRentPayment ? 'both' : (needsPenaltyPayment ? 'penalty' : 'rent'));
        setShowExchangeModal(false);
        setShowPaymentModal(true);
      } else {
        // No payment needed, create exchange directly
        try {
          const exchangeResult = await productExchangesApi.create(exchangeDataToCreate);
          
          // Handle additional products
          if (exchangeDataToCreate.additionalProducts.length > 0) {
            for (const addProd of exchangeDataToCreate.additionalProducts) {
              try {
                await axios.post(`${API_URL}/bookings/${bookingId}/products`, addProd);
              } catch (error) {
                console.error('Error adding additional product:', error);
              }
            }
          }
          
          toast.success(`Product${additionalProducts.length > 0 ? 's' : ''} exchanged successfully`);
          setShowExchangeModal(false);
          setSelectedOriginalProduct(null);
          setSelectedExchangedProduct(null);
          setAdditionalProducts([]);
          setProductSearchTerm('');
          setProductDates({});
          setProductBookings({});
          setAvailabilityErrors({});
          setExchangeReason('');
          setPendingExchangeData(null);
          
          await fetchExchanges();
          if (onExchangeComplete) {
            onExchangeComplete();
          }
        } catch (error: any) {
          console.error('Error creating exchange:', error);
          toast.error('Failed to create exchange');
        }
      }
    } catch (error: any) {
      console.error('Error exchanging product:', error);
      toast.error(error.response?.data?.error || 'Failed to exchange product');
    } finally {
      setLoading(false);
    }
  }

  async function handlePaymentCollection() {
    if (!pendingExchangeData) {
      toast.error('Invalid exchange data');
      return;
    }

    const needsPenalty = exchangePenaltyAmount > 0;
    const needsRent = rentDifferenceAmount > 0;
    
    if (!needsPenalty && !needsRent) {
      toast.error('No payment to collect');
      return;
    }

    // Validate amounts are positive numbers
    if (needsPenalty && (isNaN(exchangePenaltyAmount) || exchangePenaltyAmount <= 0)) {
      toast.error('Invalid exchange penalty amount');
      return;
    }
    
    if (needsRent && (isNaN(rentDifferenceAmount) || rentDifferenceAmount <= 0)) {
      toast.error('Invalid rent difference amount');
      return;
    }

    if (!paymentMethod || paymentMethod.trim() === '') {
      toast.error('Please select a payment method');
      return;
    }

    try {
      setLoading(true);
      
      // STEP 1: Create exchange in database first
      console.log('📝 Creating exchange in database...');
      const exchangeResult = await productExchangesApi.create({
        booking_id: pendingExchangeData.booking_id,
        original_product_id: pendingExchangeData.original_product_id,
        exchanged_product_id: pendingExchangeData.exchanged_product_id,
        exchange_date: pendingExchangeData.exchange_date,
        reason: pendingExchangeData.reason,
        exchanged_by: pendingExchangeData.exchanged_by,
        booked_from: pendingExchangeData.booked_from,
        booked_to: pendingExchangeData.booked_to
      });
      
      const createdExchange = exchangeResult.data;
      console.log('✅ Exchange created:', createdExchange.id);
      
      // STEP 2: Handle additional products
      if (pendingExchangeData.additionalProducts && pendingExchangeData.additionalProducts.length > 0) {
        console.log('📦 Adding additional products...');
        for (const addProd of pendingExchangeData.additionalProducts) {
          try {
            await axios.post(`${API_URL}/bookings/${pendingExchangeData.booking_id}/products`, addProd as any);
          } catch (error) {
            console.error('Error adding additional product:', error);
          }
        }
      }
      
      // STEP 3: Record payment for exchange penalty if needed
      if (needsPenalty) {
        console.log('💰 Recording exchange penalty payment...');
        await productExchangesApi.recordPayment({
          exchange_id: createdExchange.id,
          amount: Math.max(0, parseFloat(exchangePenaltyAmount.toString()) || 0),
          payment_method: paymentMethod.trim(),
          recorded_by: userName || (userRole === 'admin' ? 'Admin' : 'Salesman'),
          narration: paymentNarration.trim()
        });
      }
      
      // STEP 4: Record payment for rent difference if needed
      if (needsRent) {
        try {
          console.log('💰 Recording rent difference payment:', {
            exchange_id: createdExchange.id,
            amount: rentDifferenceAmount,
            payment_method: paymentMethod,
            narration: paymentNarration
          });
          const rentPaymentResponse = await productExchangesApi.recordRentPayment({
            exchange_id: createdExchange.id,
            amount: Math.max(0, parseFloat(rentDifferenceAmount.toString()) || 0),
            payment_method: paymentMethod.trim(),
            recorded_by: userName || (userRole === 'admin' ? 'Admin' : 'Salesman'),
            narration: paymentNarration.trim()
          });
          console.log('✅ Rent difference payment recorded successfully:', rentPaymentResponse.data);
        } catch (error: any) {
          console.error('❌ Error recording rent difference payment:', error);
          console.error('❌ Error response:', error.response?.data);
          toast.error(`Failed to record rent difference payment: ${error.response?.data?.error || error.message}`);
          throw error; // Re-throw to prevent continuing if rent payment failed
        }
      }

      const messages = [];
      if (needsPenalty) messages.push(`Exchange penalty: ₹${exchangePenaltyAmount.toLocaleString('en-IN')}`);
      if (needsRent) messages.push(`Rent difference: ₹${rentDifferenceAmount.toLocaleString('en-IN')}`);
      
      toast.success(`${messages.join(' + ')} collected via ${paymentMethod}`);
      
      setShowPaymentModal(false);
      setPendingExchange(null);
      setPendingExchangeData(null); // Clear pending exchange data
      setExchangePenaltyAmount(0);
      setRentDifferenceAmount(0);
      setPaymentMethod('Cash');
      setPaymentNarration('');
      setSelectedOriginalProduct(null);
      setSelectedExchangedProduct(null);
      setAdditionalProducts([]);
      setProductDates({});
      setProductBookings({});
      setAvailabilityErrors({});
      setExchangeReason('');
      
      await fetchExchanges();
      if (onExchangeComplete) {
        onExchangeComplete();
      }
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast.error(error.response?.data?.error || 'Failed to record payment');
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
      
      // Fetch current transactions to check for lapsed amounts
      const transactionsResponse = await axios.get(`${API_URL}/payment-transactions/booking/${bookingId}`);
      const currentTransactions = transactionsResponse.data;
      
      // Check if there's a lapsed amount (rent difference that was paid)
      const lapsedTransactions = currentTransactions.filter(
        (t: any) => t.method === 'exchange_upgrade' || t.method === 'exchange_downgrade'
      );
      
      const lapsedAmount = lapsedTransactions.reduce((sum: number, t: any) => {
        const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
        return sum + amount;
      }, 0);
      
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
      toast.error(error.response?.data?.error || 'Failed to prepare exchange deletion');
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
          await axios.post(`${API_URL}/payment-transactions`, {
            booking_id: bookingId,
            amount: refundAmountValue,
            type: 'refund',
            method: 'lapsed_refund',
            notes: `ONE-TIME LAPSED AMOUNT REFUND: Refund of ₹${refundAmountValue.toFixed(2)} for cancelled exchange (Exchange ID: ${exchangeId}). This refund does not affect rent/security calculations.`,
            recorded_by: userName || 'admin'
          });
          toast.success(`Exchange deleted and ₹${refundAmountValue.toFixed(2)} refunded successfully`);
        } catch (refundError) {
          console.error('Error recording refund:', refundError);
          toast.warning('Exchange deleted but failed to record refund transaction');
        }
      } else {
        toast.success('Exchange deleted successfully');
      }
      
      await fetchExchanges();
      if (onExchangeComplete) {
        onExchangeComplete();
      }
    } catch (error: any) {
      console.error('Error deleting exchange:', error);
      toast.error(error.response?.data?.error || 'Failed to delete exchange');
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
      toast.error('Please enter a valid refund amount');
      return;
    }
    
    if (refundAmountValue > refundLapsedAmount) {
      toast.error(`Refund amount cannot exceed ₹${refundLapsedAmount.toFixed(2)}`);
      return;
    }
    
    proceedWithDeletion(pendingDeleteExchangeId, refundAmountValue);
  }
  
  function handleRefundModalCancel() {
    if (!pendingDeleteExchangeId) return;
    proceedWithDeletion(pendingDeleteExchangeId, 0);
  }

  const originalProduct = currentProducts.find(p => p.id === selectedOriginalProduct);
  const exchangedProduct = availableProducts.find(p => p.id === selectedExchangedProduct);

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
              setProductDates({});
              setProductBookings({});
              setAvailabilityErrors({});
              setExchangeReason('');
              fetchAvailableProducts();
              setShowExchangeModal(true);
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
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
                    <p>Date: {new Date(exchange.exchange_date).toLocaleDateString()}</p>
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
                <button
                  onClick={() => handleDeleteExchange(exchange.id)}
                  disabled={loading}
                  className="ml-4 text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          )})}
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
                  {currentProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.code}) - ₹{product.rent_per_day}/day
                    </option>
                  ))}
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
                    <select
                      value={selectedExchangedProduct || ''}
                      onChange={async (e) => {
                        const productId = Number(e.target.value);
                        setSelectedExchangedProduct(productId);
                        setAdditionalProducts([]); // Reset additional products when main product changes
                        setProductSearchTerm(''); // Reset search when main product changes
                        
                        // Initialize dates for new product (use empty strings to allow fresh selection)
                        if (productId) {
                          setProductDates(prev => ({
                            ...prev,
                            [productId]: {
                              booked_from: bookingDates?.booked_from?.split('T')[0] || '',
                              booked_to: bookingDates?.booked_to?.split('T')[0] || ''
                            }
                          }));
                          // Fetch bookings for availability checking
                          await fetchProductBookings(productId);
                        }
                      }}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                    >
                      <option value="">Select replacement product</option>
                      {availableProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} ({product.code}) - ₹{product.rent_per_day}/day
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Exchange Reason */}
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

              {/* Validation Warning with Add More Products Option */}
              {selectedOriginalProduct && selectedExchangedProduct && originalProduct && exchangedProduct && (() => {
                const originalRent = parseFloat(originalProduct.rent_per_day || '0') || 0;
                const newRent = parseFloat(exchangedProduct.rent_per_day || '0') || 0;
                
                // Calculate total rent of all selected products (main + additional)
                const additionalRent = additionalProducts.reduce((sum, productId) => {
                  const product = availableProducts.find(p => p.id === productId);
                  return sum + (product ? parseFloat(product.rent_per_day || '0') || 0 : 0);
                }, 0);
                const totalNewRent = newRent + additionalRent;
                const isValid = totalNewRent >= originalRent;
                
                if (!isValid) {
                  return (
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                      <div className="flex items-start mb-3">
                        <svg className="w-5 h-5 text-red-600 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-red-800 mb-1">Exchange Not Allowed</p>
                          <p className="text-sm text-red-700 mb-2">
                            Total new product rent (₹{totalNewRent.toLocaleString('en-IN')}) must be <strong>greater than or equal to</strong> original product rent (₹{originalRent.toLocaleString('en-IN')}).
                          </p>
                          <p className="text-xs text-red-600 mb-3">
                            Current: ₹{newRent.toLocaleString('en-IN')} {additionalProducts.length > 0 && `+ ₹${additionalRent.toLocaleString('en-IN')} (additional)`} = ₹{totalNewRent.toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                      
                      {/* Add More Products Option */}
                      <div className="border-t border-red-200 pt-3 mt-3">
                        <label className="block text-sm font-medium text-red-800 mb-2">
                          Add More Products to Meet Requirement
                        </label>
                        
                        {/* Search Input */}
                        <div className="mb-3">
                          <input
                            type="text"
                            value={productSearchTerm}
                            onChange={(e) => setProductSearchTerm(e.target.value)}
                            placeholder="Search by product name or code..."
                            className="w-full px-4 py-2.5 border-2 border-red-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white text-sm"
                          />
                        </div>

                        {/* Product List with Checkboxes */}
                        <div className="border-2 border-red-300 rounded-lg bg-white max-h-[200px] overflow-y-auto">
                          {(() => {
                            const filteredProducts = availableProducts
                              .filter(p => p.id !== selectedExchangedProduct)
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
                                  No products found matching your search
                                </div>
                              );
                            }

                            return (
                              <div className="divide-y divide-gray-200">
                                {filteredProducts.map((product) => {
                                  const isSelected = additionalProducts.includes(product.id);
                                  return (
                                    <label
                                      key={product.id}
                                      className={`flex items-center p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                                        isSelected ? 'bg-red-50' : ''
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setAdditionalProducts([...additionalProducts, product.id]);
                                          } else {
                                            setAdditionalProducts(additionalProducts.filter(id => id !== product.id));
                                          }
                                        }}
                                        className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 mr-3 flex-shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                              {product.name}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                              Code: {product.code}
                                            </p>
                                          </div>
                                          <div className="ml-3 text-right">
                                            <p className="text-sm font-semibold text-gray-900">
                                              ₹{parseFloat(product.rent_per_day || '0').toLocaleString('en-IN')}
                                            </p>
                                            <p className="text-xs text-gray-500">per day</p>
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

                        {/* Selected Products Summary */}
                        {additionalProducts.length > 0 && (
                          <div className="mt-3 p-3 bg-white rounded-lg border-2 border-red-200">
                            <p className="text-sm font-semibold text-red-800 mb-2">Selected Additional Products ({additionalProducts.length}):</p>
                            <div className="space-y-2 max-h-[120px] overflow-y-auto">
                              {additionalProducts.map((productId) => {
                                const product = availableProducts.find(p => p.id === productId);
                                if (!product) return null;
                                return (
                                  <div key={productId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-900">{product.name}</p>
                                      <p className="text-xs text-gray-500">{product.code}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-gray-900">
                                        ₹{parseFloat(product.rent_per_day || '0').toLocaleString('en-IN')}/day
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAdditionalProducts(additionalProducts.filter(id => id !== productId));
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
                                );
                              })}
                            </div>
                            <div className="mt-3 pt-3 border-t border-red-200 space-y-1">
                              <div className="flex justify-between text-sm font-semibold text-red-800">
                                <span>Total Additional Rent:</span>
                                <span>₹{additionalRent.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="flex justify-between text-base font-bold text-red-900">
                                <span>New Total Rent:</span>
                                <span>₹{totalNewRent.toLocaleString('en-IN')}</span>
                              </div>
                              {totalNewRent >= originalRent && (
                                <div className="mt-2 pt-2 border-t border-green-300">
                                  <p className="text-sm font-semibold text-green-700 flex items-center">
                                    <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    Requirement met! You can now proceed with exchange.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Selected Products Preview */}
              {selectedOriginalProduct && selectedExchangedProduct && originalProduct && exchangedProduct && (() => {
                const originalRent = parseFloat(originalProduct.rent_per_day || '0') || 0;
                const newRent = parseFloat(exchangedProduct.rent_per_day || '0') || 0;
                
                // Calculate total rent including additional products
                const additionalRent = additionalProducts.reduce((sum, productId) => {
                  const product = availableProducts.find(p => p.id === productId);
                  return sum + (product ? parseFloat(product.rent_per_day || '0') || 0 : 0);
                }, 0);
                const totalNewRent = newRent + additionalRent;
                const isValid = totalNewRent >= originalRent;
                
                if (!isValid) return null;
                
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
                        const productRent = parseFloat(product.rent_per_day || '0') || 0;
                        const productSecurity = parseFloat(product.security_deposit || '0') || 0;
                        
                        return (
                          <div key={product.id || index} className="bg-white rounded-lg p-3 border border-blue-200">
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
                                  <p className="text-xs text-gray-500 font-mono mb-1">Code: {product.code}</p>
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
                                  <DateRangePicker
                                    key={`date-picker-${product.id}-${index}`}
                                    label=""
                                    startDate={productDates[product.id]?.booked_from || ''}
                                    endDate={productDates[product.id]?.booked_to || ''}
                                    bookings={productBookings[product.id] || []}
                                    productName={product.name}
                                    onStartDateChange={(date) => {
                                      setProductDates(prev => ({
                                        ...prev,
                                        [product.id]: {
                                          ...prev[product.id],
                                          booked_from: date || ''
                                        }
                                      }));
                                      // Clear error when date changes
                                      setAvailabilityErrors(prev => {
                                        const newErrors = { ...prev };
                                        delete newErrors[product.id];
                                        return newErrors;
                                      });
                                    }}
                                    onEndDateChange={(date) => {
                                      const currentFrom = productDates[product.id]?.booked_from || '';
                                      setProductDates(prev => ({
                                        ...prev,
                                        [product.id]: {
                                          ...prev[product.id],
                                          booked_to: date || ''
                                        }
                                      }));
                                      
                                      // Check availability when both dates are set
                                      if (date && currentFrom) {
                                        checkProductAvailability(
                                          product.id,
                                          currentFrom,
                                          date
                                        ).then(availability => {
                                          if (!availability.available) {
                                            setAvailabilityErrors(prev => ({
                                              ...prev,
                                              [product.id]: availability.message || 'Not available'
                                            }));
                                          } else if (availability.isUrgent) {
                                            setAvailabilityErrors(prev => ({
                                              ...prev,
                                              [product.id]: `⚠️ ${availability.message || 'Tight schedule'}`
                                            }));
                                          } else {
                                            setAvailabilityErrors(prev => {
                                              const newErrors = { ...prev };
                                              delete newErrors[product.id];
                                              return newErrors;
                                            });
                                          }
                                        });
                                      }
                                    }}
                                    minDate={new Date().toISOString().split('T')[0]}
                                  />
                                  {availabilityErrors[product.id] && (
                                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                      <div className="flex items-start">
                                        <svg className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <p className={`text-sm font-medium ${
                                          availabilityErrors[product.id].includes('⚠️') 
                                            ? 'text-orange-700' 
                                            : 'text-red-700'
                                        }`}>
                                          {availabilityErrors[product.id]}
                                        </p>
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
                          <span className="font-semibold">₹{currentProducts.reduce((sum, p) => sum + (parseFloat(p.rent_per_day) || 0), 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>After Exchange:</span>
                          <span className="font-semibold text-green-700">₹{Math.floor(rentDifference).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="border-t border-blue-300 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span>Current Security:</span>
                            <span className="font-semibold">₹{currentProducts.reduce((sum, p) => sum + (parseFloat(p.security_deposit) || 0), 0).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>After Exchange:</span>
                            <span className="font-semibold text-green-700">₹{Math.floor(securityDifference).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                        <div className="border-t border-blue-300 pt-2 mt-2">
                          <div className="flex justify-between">
                            <span>Exchange Penalty ({calculatedPenalty}%):</span>
                            <span className="font-semibold">₹{Math.floor((originalProduct.rent_per_day * calculatedPenalty) / 100).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Fixed Exchange Charge:</span>
                            <span className="font-semibold">₹{exchangeCharge.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between font-bold text-base mt-2">
                            <span>Total Exchange Penalty:</span>
                            <span className="text-red-600">₹{Math.floor(calculatedTotal).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                        
                        {/* Rent Difference */}
                        {(() => {
                          const rentDiff = totalNewRent > originalRent ? totalNewRent - originalRent : 0;
                          if (rentDiff > 0) {
                            return (
                              <div className="border-t border-blue-300 pt-2 mt-2">
                                <div className="flex justify-between">
                                  <span>Additional Rent (Upgrade):</span>
                                  <span className="font-semibold text-blue-700">₹{Math.floor(rentDiff).toLocaleString('en-IN')}</span>
                                </div>
                                <p className="text-xs text-blue-600 mt-1">
                                  (New total rent is higher than original rent)
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        
                        {/* Total Amount to Collect */}
                        {(() => {
                          const rentDiff = totalNewRent > originalRent ? totalNewRent - originalRent : 0;
                          const totalToCollect = calculatedTotal + rentDiff;
                          if (totalToCollect > 0) {
                            return (
                              <div className="border-t-2 border-red-300 pt-3 mt-3 bg-red-50 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="text-base font-bold text-gray-900">Total Amount to Collect:</span>
                                  <span className="text-2xl font-bold text-red-600">₹{Math.floor(totalToCollect).toLocaleString('en-IN')}</span>
                                </div>
                                <div className="text-xs text-gray-600 space-y-1">
                                  {calculatedTotal > 0 && (
                                    <div className="flex justify-between">
                                      <span>Exchange Penalty:</span>
                                      <span>₹{Math.floor(calculatedTotal).toLocaleString('en-IN')}</span>
                                    </div>
                                  )}
                                  {rentDiff > 0 && (
                                    <div className="flex justify-between">
                                      <span>Additional Rent:</span>
                                      <span>₹{Math.floor(rentDiff).toLocaleString('en-IN')}</span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm font-semibold text-red-700 mt-3 text-center">
                                  Please pay Total ₹{Math.floor(totalToCollect).toLocaleString('en-IN')} to confirm your exchange
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                    
                    <p className="text-xs text-blue-700 mt-3">
                      <strong>Note:</strong> Total rental and security will be recalculated as sum of all products. Exchange penalty and additional rent will be collected separately.
                    </p>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-4 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowExchangeModal(false)}
                className="px-6 py-2.5 bg-white border-2 border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleExchange}
                disabled={(() => {
                  if (loading || !selectedOriginalProduct || !selectedExchangedProduct) return true;
                  const originalProduct = currentProducts.find(p => p.id === selectedOriginalProduct);
                  const exchangedProduct = availableProducts.find(p => p.id === selectedExchangedProduct);
                  if (!originalProduct || !exchangedProduct) return true;
                  const originalRent = parseFloat(originalProduct.rent_per_day || '0') || 0;
                  const newRent = parseFloat(exchangedProduct.rent_per_day || '0') || 0;
                  
                  // Calculate total rent including additional products
                  const additionalRent = additionalProducts.reduce((sum, productId) => {
                    const product = availableProducts.find(p => p.id === productId);
                    return sum + (product ? parseFloat(product.rent_per_day || '0') || 0 : 0);
                  }, 0);
                  const totalNewRent = newRent + additionalRent;
                  
                  return totalNewRent < originalRent;
                })()}
                className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'EXCHANGE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Collection Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-xl font-semibold text-gray-800">
                {paymentType === 'both' ? 'Confirm Exchange - Collect Payments' : paymentType === 'penalty' ? 'Confirm Exchange - Collect Penalty' : 'Confirm Exchange - Collect Rent Difference'}
              </h2>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPendingExchange(null);
                  setPendingExchangeData(null);
                  setExchangePenaltyAmount(0);
                  setRentDifferenceAmount(0);
                }}
                className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                <p className="text-sm font-bold text-blue-900">
                  ⚠️ Payment Required to Confirm Exchange
                </p>
              </div>

              {exchangePenaltyAmount > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Exchange Penalty Amount
                  </label>
                  <div className="text-2xl font-bold text-red-600">
                    ₹{Math.floor(exchangePenaltyAmount).toLocaleString('en-IN')}
                  </div>
                </div>
              )}

              {rentDifferenceAmount > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rent Difference Amount
                  </label>
                  <div className="text-2xl font-bold text-blue-600">
                    ₹{Math.floor(rentDifferenceAmount).toLocaleString('en-IN')}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    (Additional rent for upgraded product)
                  </p>
                </div>
              )}

              {paymentType === 'both' && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total Amount:</span>
                    <span className="text-xl font-bold text-gray-900">
                      ₹{Math.floor(exchangePenaltyAmount + rentDifferenceAmount).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                >
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Narration / Notes (Optional)
                </label>
                <textarea
                  value={paymentNarration}
                  onChange={(e) => setPaymentNarration(e.target.value)}
                  placeholder="Enter transaction details, reference number, customer name, etc."
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Add any additional details about this transaction
                </p>
              </div>

              {pendingExchangeData && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-600 mb-1">Exchange Details:</p>
                  <p className="text-sm font-medium text-gray-800">
                    {currentProducts.find(p => p.id === pendingExchangeData.original_product_id)?.name} ({currentProducts.find(p => p.id === pendingExchangeData.original_product_id)?.code}) 
                    → {availableProducts.find(p => p.id === pendingExchangeData.exchanged_product_id)?.name} ({availableProducts.find(p => p.id === pendingExchangeData.exchanged_product_id)?.code})
                  </p>
                  {pendingExchangeData.additionalProducts && pendingExchangeData.additionalProducts.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs font-semibold text-blue-600 mb-1">Additional Products Added:</p>
                      <ul className="text-xs text-gray-700 space-y-1 list-disc list-inside">
                        {pendingExchangeData.additionalProducts.map((addProd: any, idx: number) => {
                          const prod = availableProducts.find(p => p.id === addProd.product_id);
                          return <li key={idx}>{prod ? `${prod.name} (${prod.code})` : `Product ${addProd.product_id}`}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4 p-6 border-t border-gray-200 flex-shrink-0 bg-white">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setPendingExchange(null);
                  setPendingExchangeData(null);
                  setExchangePenaltyAmount(0);
                  setRentDifferenceAmount(0);
                  setPaymentNarration('');
                }}
                className="px-6 py-2.5 bg-white border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handlePaymentCollection}
                disabled={loading || !paymentMethod}
                className="px-6 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Recording...' : `COLLECT ${paymentType === 'both' ? 'PAYMENTS' : 'PAYMENT'}`}
              </button>
            </div>
          </div>
        </div>
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
                    onChange={(e) => setRefundAmount(e.target.value)}
                    min="0"
                    max={refundLapsedAmount}
                    step="0.01"
                    className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-600">
                  <span>Maximum: ₹{refundLapsedAmount.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => setRefundAmount(refundLapsedAmount.toFixed(2))}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Use Max
                  </button>
                </div>
              </div>

              {parseFloat(refundAmount) > 0 && parseFloat(refundAmount) < refundLapsedAmount && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-yellow-800">
                    Final Lapsed Amount: ₹{(refundLapsedAmount - parseFloat(refundAmount)).toFixed(2)}
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
    </div>
  );
}

