'use client';

import { useEffect, useState } from 'react';
import { bookingsApi, productsApi, paymentTransactionsApi } from '@/lib/api';
import { creditNotesApi } from '@/lib/creditNotesApi';
import { BookingCancellation } from '@/components/common/BookingCancellation';
import { Booking, Product } from '@/types';
import { Button, Input, DateRangePicker, PhoneInput, BookingProductTrackingModal, PaymentMethodInput } from '@/components/common';
import dynamic from 'next/dynamic';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Dynamically import QRScanner to avoid SSR issues with html5-qrcode
const QRScanner = dynamic(
  () => import('@/components/common/QRScanner'),
  {
    ssr: false,
    loading: () => <div className="p-4 text-center">Loading scanner...</div>
  }
);
import { isValidPhoneNumber, getCountryByCode } from '@/lib/countryCodes';
import { settingsApi } from '@/lib/settingsApi';
import { productTrackingApi } from '@/lib/productTrackingApi';
import { getImageUrl } from '@/lib/imageHelper';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [productBookings, setProductBookings] = useState<Record<number, any[]>>({});
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState<{ [key: string]: boolean }>({});
  const [parsedMeasurements, setParsedMeasurements] = useState<{ [key: string]: any }>({});
  const [parsedSpecialRequirements, setParsedSpecialRequirements] = useState<{ [key: string]: string }>({});
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    booked_from: '',
    booked_to: '',
    status: 'pending' as const,
  });
  const [addFormData, setAddFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_phone_country: 'IN', // ISO code
    alternate_phone: '',
    alternate_phone_country: 'IN', // ISO code
    customer_address: '',
    booking_date: new Date().toISOString().split('T')[0],
    booked_from: '', // Not used anymore, kept for compatibility
    booked_to: '', // Not used anymore, kept for compatibility
    products: [] as {
      id: number;
      name: string;
      rent: number;
      code: string;
      size?: string;
      booked_from: string;
      booked_to: string;
      discountType?: 'percentage' | 'fixed' | null;
      discountValue?: number;
    }[],
    transport_charge: 0,
    discount_type: null as 'percentage' | 'amount' | null,
    discount_value: 0,
  });
  const [lastProductDates, setLastProductDates] = useState<{ from: string; to: string } | null>(null);
  const [showDateConfirmModal, setShowDateConfirmModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  const [phoneNumberError, setPhoneNumberError] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [productSearchCode, setProductSearchCode] = useState('');
  const [transportationCharge, setTransportationCharge] = useState(0); // Default to 0
  const [transportationSelected, setTransportationSelected] = useState(false); // Whether 'Yes' is selected

  // Credit note modal state
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [bookingToCancelWithPolicy, setBookingToCancelWithPolicy] = useState<Booking | null>(null);
  const [creditNoteData, setCreditNoteData] = useState({
    validity: '',
    amount: '',
  });

  // Date change functionality for modify modal - simplified like salesman portal
  const [selectedProductForDateChange, setSelectedProductForDateChange] = useState<any>(null);
  const [changeDateFrom, setChangeDateFrom] = useState('');
  const [changeDateTo, setChangeDateTo] = useState('');
  const [dateChangeCharge, setDateChangeCharge] = useState(0);
  const [productBookingsForDateChange, setProductBookingsForDateChange] = useState<any[]>([]);

  const [dateChangeChargeSettings, setDateChangeChargeSettings] = useState({
    charge_type: 'manual' as 'fixed' | 'variable' | 'manual',
    fixed_amount: 0,
    variable_per_day: 0,
    min_charge: 0,
    max_charge: 0,
  });

  // Payment collection modal state for new booking
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [pendingBookingData, setPendingBookingData] = useState<any>(null);
  const [customTransportationCharge, setCustomTransportationCharge] = useState('0'); // Default to '0'
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1); // For keyboard navigation
  const [trackingBooking, setTrackingBooking] = useState<Booking | null>(null);
  const [showProductTrackingList, setShowProductTrackingList] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [urgentFilter, setUrgentFilter] = useState<'all' | 'urgent' | 'normal'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // New status filter
  const [allTransactions, setAllTransactions] = useState<any[]>([]); // Store all transactions for delay check

  // Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [bookingPreview, setBookingPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    fetchBookings();
    fetchProducts();
    fetchTransportationCharge();
    fetchDateChangeChargeSettings();
    fetchAllTransactions(); // Fetch transactions for delay detection
  }, []);

  // Fetch booking preview whenever products, discounts, or transport changes
  useEffect(() => {
    async function fetchPreview() {
      if (addFormData.products.length === 0) {
        setBookingPreview(null);
        return;
      }

      setLoadingPreview(true);
      try {
        const response = await bookingsApi.getPreview({
          products: addFormData.products.map(p => ({
            id: p.id,
            discountType: p.discountType || null,
            discountValue: p.discountValue || 0
          })),
          transport_charge: addFormData.transport_charge || 0,
          booking_discount_type: addFormData.discount_type,
          booking_discount_value: addFormData.discount_value || 0
        });
        setBookingPreview(response.data);
      } catch (error) {
        console.error('Error fetching booking preview:', error);
        setBookingPreview(null);
      } finally {
        setLoadingPreview(false);
      }
    }

    fetchPreview();
  }, [addFormData.products, addFormData.transport_charge, addFormData.discount_type, addFormData.discount_value]);

  async function fetchDateChangeChargeSettings() {
    try {
      const settings = [
        'date_change_charge_type',
        'date_change_fixed_amount',
        'date_change_variable_per_day',
        'date_change_min_charge',
        'date_change_max_charge',
      ];

      const values: any = {};
      for (const key of settings) {
        try {
          const response = await settingsApi.getByKey(key);
          values[key] = response.data?.setting_value || null;
        } catch (error) {
          // Setting doesn't exist, use default
        }
      }

      setDateChangeChargeSettings({
        charge_type: (values.date_change_charge_type || 'manual') as 'fixed' | 'variable' | 'manual',
        fixed_amount: parseFloat(values.date_change_fixed_amount || '0') || 0,
        variable_per_day: parseFloat(values.date_change_variable_per_day || '0') || 0,
        min_charge: parseFloat(values.date_change_min_charge || '0') || 0,
        max_charge: parseFloat(values.date_change_max_charge || '0') || 0,
      });
    } catch (error) {
      console.error('Error fetching date change charge settings:', error);
    }
  }

  function calculateDateChangeCharge(oldFrom: string, oldTo: string, newFrom: string, newTo: string): number {
    if (!oldFrom || !oldTo || !newFrom || !newTo) return 0;

    const oldStart = new Date(oldFrom);
    const oldEnd = new Date(oldTo);
    const newStart = new Date(newFrom);
    const newEnd = new Date(newTo);

    // Calculate days changed (absolute difference in date range)
    const oldDays = Math.ceil((oldEnd.getTime() - oldStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const newDays = Math.ceil((newEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const daysChanged = Math.abs(newDays - oldDays);

    if (daysChanged === 0) return 0;

    switch (dateChangeChargeSettings.charge_type) {
      case 'fixed':
        return dateChangeChargeSettings.fixed_amount || 0;
      case 'variable':
        const baseCharge = daysChanged * dateChangeChargeSettings.variable_per_day;
        const minCharge = dateChangeChargeSettings.min_charge || 0;
        const maxCharge = dateChangeChargeSettings.max_charge || Infinity;
        return Math.max(minCharge, Math.min(baseCharge, maxCharge));
      case 'manual':
      default:
        return 0; // Will be entered manually
    }
  }

  async function fetchTransportationCharge() {
    try {
      const response = await settingsApi.getByKey('transportation_charge');
      setTransportationCharge(parseFloat(response.data.setting_value) || 0);
    } catch (error) {
      console.error('Error fetching transportation charge:', error);
      setTransportationCharge(0); // Default to 0
    }
  }

  async function fetchBookings() {
    try {
      const response = await bookingsApi.getAll();
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllTransactions() {
    try {
      const response = await paymentTransactionsApi.getAll();
      setAllTransactions(response.data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setAllTransactions([]);
    }
  }

  // Helper function to check if a product has security deposit refund
  function hasSecurityDepositRefund(bookingId: number, productCode: string): boolean {
    return allTransactions.some((transaction: any) => {
      const isSecurityRefund = transaction.booking_id === bookingId &&
        transaction.type === 'refund' &&
        transaction.transaction_type === 'security_refund';

      // Check if transaction notes contain the product code
      const notes = String(transaction.notes || '').toLowerCase();
      const code = productCode.toLowerCase();

      return isSecurityRefund && notes.includes(code);
    });
  }

  // Helper function to check if a booking is delayed
  function isBookingDelayed(booking: Booking): boolean {
    // Only check for confirmed or in_progress bookings
    if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const products = Array.isArray(booking.products) ? booking.products : [];

    // Check each product
    for (const product of products) {
      if (!product.booked_to) continue;

      const returnDate = new Date(product.booked_to);
      returnDate.setHours(0, 0, 0, 0);

      // If today is past the return date
      if (today > returnDate) {
        // Check if security deposit has been refunded for this product
        const hasRefund = hasSecurityDepositRefund(booking.id, product.code ?? '');

        // If no refund found, product is delayed
        if (!hasRefund) {
          return true; // At least one product is delayed
        }
      }
    }

    return false;
  }

  // Helper function to get delayed products for a booking
  function getDelayedProducts(booking: Booking): any[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const products = Array.isArray(booking.products) ? booking.products : [];
    const delayedProducts: any[] = [];

    for (const product of products) {
      if (!product.booked_to) continue;

      const returnDate = new Date(product.booked_to);
      returnDate.setHours(0, 0, 0, 0);

      if (today > returnDate) {
        const hasRefund = hasSecurityDepositRefund(booking.id, product.code ?? '');

        if (!hasRefund) {
          const daysDelayed = Math.floor((today.getTime() - returnDate.getTime()) / (1000 * 60 * 60 * 24));
          delayedProducts.push({
            ...product,
            daysDelayed
          });
        }
      }
    }

    return delayedProducts;
  }

  async function fetchProducts() {
    try {
      const response = await productsApi.getAll();
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }

  // Fetch bookings for a specific product to check availability
  async function fetchProductBookings(productId: number) {
    try {
      const response = await bookingsApi.getByProductId(productId);
      const bookingsData = response.data || [];
      setProductBookings(prev => ({
        ...prev,
        [productId]: bookingsData
      }));
      return bookingsData;
    } catch (error) {
      console.error('Error fetching product bookings:', error);
      return [];
    }
  }

  async function handleModify(booking: Booking) {
    setSelectedBooking(booking);
    setFormData({
      customer_name: booking.customer_name,
      customer_phone: booking.customer_phone || '',
      customer_address: booking.customer_address || '',
      booked_from: booking.booked_from.split('T')[0],
      booked_to: booking.booked_to.split('T')[0],
      status: booking.status as any,
    });

    // Reset date change states
    setSelectedProductForDateChange(null);
    setChangeDateFrom('');
    setChangeDateTo('');
    setDateChangeCharge(0);

    // Fetch product bookings for calendar availability
    const bookingsMap: Record<number, any[]> = {};
    const products = Array.isArray(booking.products) ? booking.products : [];
    for (const product of products) {
      try {
        const response = await bookingsApi.getByProductId(product.id);
        // Filter out the current booking's dates and format for DateRangePicker
        const bookings = (response.data || []).filter((b: any) => b.id !== booking.id).map((b: any) => ({
          booked_from: b.booked_from,
          booked_to: b.booked_to,
          customer_name: b.customer_name,
          customer_phone: b.customer_phone,
        }));
        bookingsMap[product.id] = bookings;
        console.log(`Fetched ${bookings.length} bookings for product ${product.id}:`, bookings);
      } catch (error) {
        console.error(`Error fetching bookings for product ${product.id}:`, error);
        bookingsMap[product.id] = [];
      }
    }
    setProductBookings(bookingsMap);
    console.log('Product bookings map:', bookingsMap);

    setShowModifyModal(true);
  }

  async function handleUpdate() {
    if (!selectedBooking) return;
    try {
      const oldStatus: string = selectedBooking.status;
      const newStatus: string = formData.status;

      // Check if trying to confirm a booking that has a credit note
      if (oldStatus !== 'confirmed' && newStatus === 'confirmed') {
        try {
          console.log('🔍 Checking credit notes for booking:', selectedBooking.id);
          const creditNotesResponse = await creditNotesApi.getByBookingId(selectedBooking.id);
          const creditNotes = creditNotesResponse.data || [];
          console.log('📋 Found credit notes:', creditNotes);

          if (creditNotes.length > 0) {
            const activeCreditNote = creditNotes.find((note: any) => {
              const validUntil = new Date(note.valid_until);
              const now = new Date();
              const availableAmount = parseFloat(note.amount || 0) - parseFloat(note.used_amount || 0);
              const isActive = validUntil >= now && availableAmount > 0;
              console.log(`  Note ${note.id}: validUntil=${validUntil.toISOString()}, now=${now.toISOString()}, available=${availableAmount}, isActive=${isActive}`);
              return isActive;
            });

            if (activeCreditNote) {
              console.log('❌ Blocking confirmation due to active credit note:', activeCreditNote.id);
              toast.error(`Cannot confirm booking. An active credit note (ID: ${activeCreditNote.id}) exists for this booking. Please delete the credit note first.`);
              return;
            }
          }
          console.log('✅ No active credit notes found, proceeding with confirmation');
        } catch (error) {
          console.error('Error checking credit notes:', error);
          // Continue with update if check fails
        }
      }

      // Update booking basic info (date changes handled in separate modal)
      await bookingsApi.update(selectedBooking.id, formData);

      // Auto-track when status changes to 'confirmed' (picked by customer)
      if (oldStatus !== 'confirmed' && newStatus === 'confirmed') {
        await handleAutoTrackPickup(selectedBooking);
      }

      // Auto-track return when status changes to 'completed'
      if (oldStatus !== 'completed' && newStatus === 'completed') {
        await handleAutoTrackReturn(selectedBooking);
      }

      await fetchBookings();
      setShowModifyModal(false);
      setSelectedBooking(null);

      toast.success('Booking updated successfully!');
    } catch (error) {
      console.error('Error updating booking:', error);
      toast.error('Error updating booking');
    }
  }

  async function handleAutoTrackPickup(booking: Booking) {
    try {
      const products = Array.isArray(booking.products) ? booking.products : [];

      for (const product of products) {
        await productTrackingApi.create({
          product_id: product.id,
          booking_id: booking.id,
          product_code: product.code ?? '',
          tracking_type: 'picked_by_customer',
          notes: `Automatically tracked: Product picked up by ${booking.customer_name}`,
        });
      }

      console.log('✅ Products automatically tracked as picked by customer');
    } catch (error) {
      console.error('Error auto-tracking pickup:', error);
    }
  }

  async function handleAutoTrackReturn(booking: Booking) {
    try {
      // Get all tracking records and filter for this booking's active ones
      const response = await productTrackingApi.getAll();
      const allTracks = response.data?.data || response.data || [];
      const bookingTracks = allTracks.filter((track: any) =>
        track.booking_id === booking.id && track.status === 'out'
      );

      // Mark all as returned
      for (const track of bookingTracks) {
        await productTrackingApi.markReturned(
          track.id,
          `Automatically returned: Booking completed for ${booking.customer_name}`
        );
      }

      console.log('✅ Products automatically marked as returned');
    } catch (error) {
      console.error('Error auto-tracking return:', error);
    }
  }

  async function handleCancelClick(id: number, customerName: string) {
    try {
      // Fetch the booking details
      const response = await bookingsApi.getById(id);
      const booking = response.data;

      // Use new cancellation modal with policy
      setBookingToCancelWithPolicy(booking);
      setShowCancellationModal(true);
    } catch (error) {
      console.error('Error fetching booking:', error);
      toast.error('Failed to load booking details');
    }
  }

  function handleCancellationComplete() {
    setShowCancellationModal(false);
    setBookingToCancelWithPolicy(null);
    fetchBookings(); // Refresh the bookings list
  }

  async function handleConfirmCancel() {
    if (!bookingToCancel) return;

    try {
      // Cancel the booking
      await bookingsApi.update(bookingToCancel.id, {
        ...bookingToCancel,
        status: 'cancelled'
      });

      // Create credit note if validity and amount are provided
      if (creditNoteData.validity && creditNoteData.amount) {
        const amount = parseFloat(creditNoteData.amount);
        if (amount > 0) {
          try {
            const adminName = localStorage.getItem('admin_name') || 'Admin';
            await creditNotesApi.create({
              booking_id: bookingToCancel.id,
              customer_name: bookingToCancel.customer_name,
              customer_phone: bookingToCancel.customer_phone,
              amount: amount,
              valid_until: creditNoteData.validity,
              issued_by: adminName,
              notes: `Credit note issued for cancelled booking #${bookingToCancel.id}`,
            });
            toast.success('Booking cancelled and credit note issued successfully');
          } catch (error: any) {
            console.error('Error creating credit note:', error);
            const errorMessage = error.response?.data?.details || error.response?.data?.message || error.response?.data?.error || 'Failed to create credit note';
            toast.error(errorMessage);
            // Still show success for cancellation even if credit note creation fails
            toast.success('Booking cancelled successfully');
          }
        } else {
          toast.success('Booking cancelled successfully');
        }
      } else {
        toast.success('Booking cancelled successfully');
      }

      // Reset and refresh
      setShowCreditNoteModal(false);
      setBookingToCancel(null);
      setCreditNoteData({ validity: '', amount: '' });
      await fetchBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      toast.error('Failed to cancel booking. Please try again.');
    }
  }

  // Check if phone numbers are the same
  function checkPhoneNumberDuplicate(phone1: string, country1: string, phone2: string, country2: string) {
    if (!phone1 || !phone2) {
      setPhoneNumberError('');
      return false;
    }

    const c1 = getCountryByCode(country1);
    const c2 = getCountryByCode(country2);

    if (!c1 || !c2) {
      setPhoneNumberError('');
      return false;
    }

    const fullPhone1 = `${c1.callingCode}${phone1}`;
    const fullPhone2 = `${c2.callingCode}${phone2}`;

    if (fullPhone1 === fullPhone2) {
      setPhoneNumberError('❌ Mobile Number and Alternate Mobile Number cannot be the same. Please enter a different number.');
      return true;
    } else {
      setPhoneNumberError('');
      return false;
    }
  }

  function handleAddBooking() {
    setAddFormData({
      customer_name: '',
      customer_phone: '',
      customer_phone_country: 'IN', // ISO code
      alternate_phone: '',
      alternate_phone_country: 'IN', // ISO code
      customer_address: '',
      booking_date: new Date().toISOString().split('T')[0],
      booked_from: '',
      booked_to: '',
      products: [],
      transport_charge: 0,
      discount_type: null,
      discount_value: 0,
    });
    setPhoneNumberError('');
    setProductSearchCode('');
    setShowAddModal(true);
  }

  async function handleAddProduct(product: Product) {
    // Fetch availability for this product FIRST
    await fetchProductBookings(product.id);

    // Check if we have previous product dates
    if (lastProductDates && addFormData.products.length > 0) {
      // Ask if they want to use same dates
      setPendingProduct({
        id: product.id,
        name: product.name,
        code: product.code,
        size: product.size,
        rent: product.rent,
      });
      setShowDateConfirmModal(true);
    } else {
      // First product - add with empty dates
      setAddFormData({
        ...addFormData,
        products: [...addFormData.products, {
          id: product.id,
          name: product.name,
          code: product.code,
          size: product.size,
          rent: product.rent,
          booked_from: '',
          booked_to: '',
        }],
      });
      // Scroll to products table
      setTimeout(() => scrollToProducts(), 100);
    }
  }

  // Scroll to products table when product is added
  function scrollToProducts() {
    const productsTable = document.getElementById('booking-invoice-table');
    if (productsTable) {
      productsTable.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function confirmSameDates(useSameDates: boolean) {
    if (!pendingProduct) return;

    const newProduct = {
      ...pendingProduct,
      booked_from: useSameDates ? lastProductDates!.from : '',
      booked_to: useSameDates ? lastProductDates!.to : '',
    };

    // Add the new product and also fill any other empty products in one update
    if (useSameDates && lastProductDates) {
      const updatedProducts = [...addFormData.products, newProduct].map(p => {
        // Fill empty dates with the confirmed dates
        if ((!p.booked_from || p.booked_from === '') && (!p.booked_to || p.booked_to === '')) {
          return { ...p, booked_from: lastProductDates.from, booked_to: lastProductDates.to };
        }
        return p;
      });

      setAddFormData({
        ...addFormData,
        products: updatedProducts,
      });
    } else {
      // Just add the new product without auto-fill
      setAddFormData({
        ...addFormData,
        products: [...addFormData.products, newProduct],
      });
    }

    setShowDateConfirmModal(false);
    setPendingProduct(null);

    // Scroll to products table after modal closes
    setTimeout(() => scrollToProducts(), 100);
  }

  // Auto-fill dates for products without dates (only called when user confirms in modal)
  function autoFillProductDates(fromDate: string, toDate: string) {
    // Only fill products that have empty dates
    const updated = addFormData.products.map(p => {
      if ((!p.booked_from || p.booked_from === '') && (!p.booked_to || p.booked_to === '')) {
        return { ...p, booked_from: fromDate, booked_to: toDate };
      }
      return p;
    });

    setAddFormData({ ...addFormData, products: updated });
  }

  // Handle product search input change with autocomplete
  function handleSearchInputChange(value: string) {
    setProductSearchCode(value);
    setSelectedSuggestionIndex(-1); // Reset selection when typing

    if (value.trim().length > 0) {
      // Filter products by code or name, excluding already added products
      const filtered = products.filter(p =>
        (p.code.toLowerCase().includes(value.toLowerCase()) ||
          p.name.toLowerCase().includes(value.toLowerCase())) &&
        !addFormData.products.some(ap => ap.id === p.id)
      ).slice(0, 10); // Limit to 10 suggestions

      setFilteredProducts(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredProducts([]);
      setShowSuggestions(false);
    }
  }

  // Select product from suggestions
  function handleSelectSuggestion(product: Product) {
    handleAddProduct(product);
    setProductSearchCode('');
    setShowSuggestions(false);
    setFilteredProducts([]);
    setSelectedSuggestionIndex(-1); // Reset selection
    alert(`✅ Product "${product.name}" added successfully!`);
  }

  // Handle keyboard navigation in product suggestions
  function handleKeyboardNavigation(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || filteredProducts.length === 0) {
      if (e.key === 'Enter') {
        handleSearchByCode(productSearchCode);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev < filteredProducts.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < filteredProducts.length) {
          handleSelectSuggestion(filteredProducts[selectedSuggestionIndex]);
        } else {
          handleSearchByCode(productSearchCode);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  }

  // Search product by code (for Enter key or Add button)
  async function handleSearchByCode(code: string) {
    if (!code.trim()) return;

    try {
      const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());
      if (product) {
        // Check if product is already added
        const isAlreadyAdded = addFormData.products.some(ap => ap.id === product.id);
        if (isAlreadyAdded) {
          toast.warning(`Product "${product.name}" is already in the booking`);
          return;
        }

        handleAddProduct(product);
        setProductSearchCode('');
        setShowSuggestions(false);
        setFilteredProducts([]);
        toast.success(`Product "${product.name}" added successfully!`);
      } else {
        toast.error(`Product with code "${code}" not found`);
      }
    } catch (error) {
      console.error('Error searching product:', error);
      toast.error('Error searching for product');
    }
  }

  // Handle QR code scan
  function handleQRScan(code: string) {
    console.log('QR Code scanned:', code);
    handleSearchByCode(code);
    setShowQRScanner(false);
  }

  // Calculate subtotal (uses backend preview if available)
  // Get subtotal from backend preview
  function calculateSubtotal() {
    return bookingPreview?.subtotal || 0;
  }

  // Get total from backend preview
  function calculateTotal() {
    return bookingPreview?.total || 0;
  }

  // Get discount from backend preview
  function calculateDiscount() {
    return bookingPreview?.booking_discount_amount || 0;
  }

  function handleRemoveProduct(productId: number) {
    setAddFormData({
      ...addFormData,
      products: addFormData.products.filter(p => p.id !== productId),
    });
  }


  // Function to check if a booking is urgent (based on tight scheduling with other bookings)
  function isBookingUrgent(booking: Booking): boolean {
    // Don't check urgent status for cancelled bookings
    if (booking.status === 'cancelled') {
      return false;
    }

    const products = Array.isArray(booking.products) ? booking.products : [];

    for (const product of products) {
      const thisPickupDate = new Date(product.booked_from || booking.booked_from);
      const thisDropDate = new Date(product.booked_to || booking.booked_to);
      thisPickupDate.setHours(0, 0, 0, 0);
      thisDropDate.setHours(0, 0, 0, 0);

      // Check all OTHER bookings for the SAME product
      for (const otherBooking of bookings) {
        // Skip same booking and cancelled bookings
        if (otherBooking.id === booking.id || otherBooking.status === 'cancelled') {
          continue;
        }

        const otherProducts = Array.isArray(otherBooking.products) ? otherBooking.products : [];

        for (const otherProduct of otherProducts) {
          // Check if it's the same product (by product ID or code)
          if (otherProduct.id !== product.id && otherProduct.code !== product.code) {
            continue;
          }

          const otherPickupDate = new Date(otherProduct.booked_from || otherBooking.booked_from);
          const otherDropDate = new Date(otherProduct.booked_to || otherBooking.booked_to);
          otherPickupDate.setHours(0, 0, 0, 0);
          otherDropDate.setHours(0, 0, 0, 0);

          // Check if other booking drops within 2 days BEFORE this booking's pickup
          const daysBetweenDropAndPickup = Math.ceil((thisPickupDate.getTime() - otherDropDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysBetweenDropAndPickup > 0 && daysBetweenDropAndPickup <= 2) {
            return true;
          }

          // Check if other booking picks up within 2 days AFTER this booking's drop
          const daysBetweenDropAndNextPickup = Math.ceil((otherPickupDate.getTime() - thisDropDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysBetweenDropAndNextPickup > 0 && daysBetweenDropAndNextPickup <= 2) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // Function to get urgent reason
  function getUrgentReason(booking: Booking): string {
    const products = Array.isArray(booking.products) ? booking.products : [];
    const reasons: string[] = [];

    for (const product of products) {
      const thisPickupDate = new Date(product.booked_from || booking.booked_from);
      const thisDropDate = new Date(product.booked_to || booking.booked_to);
      thisPickupDate.setHours(0, 0, 0, 0);
      thisDropDate.setHours(0, 0, 0, 0);

      // Check all OTHER bookings for the SAME product
      for (const otherBooking of bookings) {
        if (otherBooking.id === booking.id || otherBooking.status === 'cancelled') {
          continue;
        }

        const otherProducts = Array.isArray(otherBooking.products) ? otherBooking.products : [];

        for (const otherProduct of otherProducts) {
          if (otherProduct.id !== product.id && otherProduct.code !== product.code) {
            continue;
          }

          const otherPickupDate = new Date(otherProduct.booked_from || otherBooking.booked_from);
          const otherDropDate = new Date(otherProduct.booked_to || otherBooking.booked_to);
          otherPickupDate.setHours(0, 0, 0, 0);
          otherDropDate.setHours(0, 0, 0, 0);

          const daysBetweenDropAndPickup = Math.ceil((thisPickupDate.getTime() - otherDropDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysBetweenDropAndPickup > 0 && daysBetweenDropAndPickup <= 2) {
            reasons.push(`${product.code}: Only ${daysBetweenDropAndPickup} day gap before pickup`);
          }

          const daysBetweenDropAndNextPickup = Math.ceil((otherPickupDate.getTime() - thisDropDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysBetweenDropAndNextPickup > 0 && daysBetweenDropAndNextPickup <= 2) {
            reasons.push(`${product.code}: Only ${daysBetweenDropAndNextPickup} day gap after return`);
          }
        }
      }
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Tight schedule';
  }

  async function checkTightSchedule() {
    try {
      const warnings: string[] = [];

      for (const product of addFormData.products) {
        const thisPickupDate = new Date(product.booked_from);
        const thisDropDate = new Date(product.booked_to);
        thisPickupDate.setHours(0, 0, 0, 0);
        thisDropDate.setHours(0, 0, 0, 0);

        for (const otherBooking of bookings) {
          if (otherBooking.status === 'cancelled') continue;

          const otherProducts = Array.isArray(otherBooking.products) ? otherBooking.products : [];

          for (const otherProduct of otherProducts) {
            if (otherProduct.id !== product.id && otherProduct.code !== product.code) {
              continue;
            }

            const otherPickupDate = new Date(otherProduct.booked_from || otherBooking.booked_from);
            const otherDropDate = new Date(otherProduct.booked_to || otherBooking.booked_to);
            otherPickupDate.setHours(0, 0, 0, 0);
            otherDropDate.setHours(0, 0, 0, 0);

            const daysBetweenDropAndPickup = Math.ceil((thisPickupDate.getTime() - otherDropDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysBetweenDropAndPickup > 0 && daysBetweenDropAndPickup <= 2) {
              warnings.push(`${product.name} (${product.code}) is booked ${daysBetweenDropAndPickup} day before your selected date.`);
              break;
            }

            const daysBetweenDropAndNextPickup = Math.ceil((otherPickupDate.getTime() - thisDropDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysBetweenDropAndNextPickup > 0 && daysBetweenDropAndNextPickup <= 2) {
              warnings.push(`${product.name} (${product.code}) is booked ${daysBetweenDropAndNextPickup} day after your selected date.`);
              break;
            }
          }
        }
      }

      if (warnings.length > 0) {
        return {
          hasTightSchedule: true,
          message: warnings.join(' ')
        };
      }

      return { hasTightSchedule: false, message: '' };
    } catch (error) {
      console.error('Error checking tight schedule:', error);
      return { hasTightSchedule: false, message: '' };
    }
  }

  async function handleCreateBooking() {
    // Basic required field validation
    if (!addFormData.customer_name || !addFormData.customer_phone || !addFormData.alternate_phone || addFormData.products.length === 0) {
      toast.warning('Please fill in all required fields (name, mobile numbers) and add at least one product');
      return;
    }

    // Validate that all products have dates
    const productsWithoutDates = addFormData.products.filter(p => !p.booked_from || !p.booked_to);
    if (productsWithoutDates.length > 0) {
      toast.warning('Please set pickup and return dates for all products');
      return;
    }

    // Validate mobile numbers using the library function
    if (!isValidPhoneNumber(addFormData.customer_phone, addFormData.customer_phone_country)) {
      toast.warning('Please enter a valid Mobile Number');
      return;
    }

    if (!isValidPhoneNumber(addFormData.alternate_phone, addFormData.alternate_phone_country)) {
      toast.warning('Please enter a valid Alternate Mobile Number');
      return;
    }

    // Get calling codes for submission
    const country1 = getCountryByCode(addFormData.customer_phone_country);
    const country2 = getCountryByCode(addFormData.alternate_phone_country);

    if (!country1 || !country2) {
      toast.error('Invalid country selection');
      return;
    }

    // Check if both numbers are the same
    const fullPhone1 = `${country1.callingCode}${addFormData.customer_phone}`;
    const fullPhone2 = `${country2.callingCode}${addFormData.alternate_phone}`;
    if (fullPhone1 === fullPhone2) {
      toast.warning('Mobile Number and Alternate Mobile Number cannot be the same. Please enter a different number.');
      return;
    }

    // Check if there's a phone number error
    if (phoneNumberError) {
      toast.error(phoneNumberError);
      return;
    }

    // Check for tight schedule (bookings within 2 days)
    const tightScheduleCheck = await checkTightSchedule();
    if (tightScheduleCheck.hasTightSchedule) {
      setWarningMessage(tightScheduleCheck.message);
      setShowWarningModal(true);
      return;
    }

    // All validations passed - show payment collection modal
    const finalTotal = calculateTotal();
    const discountAmount = calculateDiscount();
    setPendingBookingData({
      customer_name: addFormData.customer_name,
      fullPhone1,
      fullPhone2,
      customer_address: addFormData.customer_address,
      booking_date: addFormData.booking_date,
      products: addFormData.products,
      finalTotal,
      transport_charge: addFormData.transport_charge,
      discount_type: addFormData.discount_type,
      discount_value: addFormData.discount_value,
      discount_amount: discountAmount,
    });
    setPaymentAmount(''); // Reset payment amount
    setPaymentMethod('Cash');
    setPaymentNotes(''); // Empty notes field
    setShowPaymentModal(true);
  }

  async function createBookingConfirmed() {
    if (!pendingBookingData) {
      // Fallback to old method if no pending data
      try {
        const country1 = getCountryByCode(addFormData.customer_phone_country);
        const country2 = getCountryByCode(addFormData.alternate_phone_country);
        const fullPhone1 = `${country1?.callingCode}${addFormData.customer_phone}`;
        const fullPhone2 = `${country2?.callingCode}${addFormData.alternate_phone}`;
        const finalTotal = calculateTotal();
        const discountAmount = calculateDiscount();

        await bookingsApi.create({
          customer_name: addFormData.customer_name,
          customer_phone: fullPhone1,
          alternate_phone: fullPhone2,
          customer_address: addFormData.customer_address,
          booking_date: addFormData.booking_date,
          booked_from: addFormData.booked_from || '',
          booked_to: addFormData.booked_to || '',
          products: addFormData.products.map(p => ({
            id: p.id,
            booked_from: p.booked_from,
            booked_to: p.booked_to,
            discountType: p.discountType || null,
            discountValue: p.discountValue || 0
          })),
          transport_charge: addFormData.transport_charge,
          discount_type: addFormData.discount_type,
          discount_value: addFormData.discount_value,
          discount_amount: discountAmount,
          status: 'pending',
        } as any);

        await fetchBookings();
        setShowAddModal(false);
        setProductSearchCode('');
        setTransportationSelected(false);
        setCustomTransportationCharge('');
        setTransportationCharge(0);
        toast.success(`Booking created successfully! Total: ₹${Math.floor(finalTotal)}`);
        return;
      } catch (error) {
        console.error('Error creating booking:', error);
        toast.error('Error creating booking');
        return;
      }
    }

    try {
      const response = await bookingsApi.create({
        customer_name: pendingBookingData.customer_name,
        customer_phone: pendingBookingData.fullPhone1,
        alternate_phone: pendingBookingData.fullPhone2,
        customer_address: pendingBookingData.customer_address,
        booking_date: pendingBookingData.booking_date,
        booked_from: '', // Not used anymore, kept for compatibility
        booked_to: '', // Not used anymore, kept for compatibility
        products: pendingBookingData.products.map((p: any) => ({
          id: p.id,
          booked_from: p.booked_from,
          booked_to: p.booked_to,
          discountType: p.discountType || null,
          discountValue: p.discountValue || 0
        })),
        transport_charge: pendingBookingData.transport_charge || 0,
        discount_type: pendingBookingData.discount_type,
        discount_value: pendingBookingData.discount_value,
        discount_amount: pendingBookingData.discount_amount,
        status: 'pending',
      } as any);

      const newBookingId = response.data.id;
      console.log('🆔 Created booking ID:', newBookingId);

      // If payment amount is provided, record it
      if (paymentAmount && parseFloat(paymentAmount) > 0) {
        try {
          const paymentData = {
            booking_id: newBookingId,
            amount: parseFloat(paymentAmount),
            type: 'payment',
            method: paymentMethod,
            notes: paymentNotes || 'Initial payment recorded', // Default note if empty
            recorded_by: 'admin'
          };
          console.log('📝 Recording payment:', paymentData);

          await axios.post(`${API_URL}/payment-transactions`, paymentData);
          console.log('✅ Payment recorded successfully');

          // Let backend calculate and update booking status based on payment
          const statusResult = await bookingsApi.updateStatus(newBookingId);
          console.log('✅ Booking status updated by backend:', statusResult.data);
        } catch (paymentError: any) {
          console.error('❌ Error recording payment:', paymentError);
          console.error('Error response:', paymentError.response?.data);
          const message = paymentError.response?.data?.details || paymentError.response?.data?.error || 'Failed to record payment';
          toast.error(message);
        }
      }

      await fetchBookings();
      setShowAddModal(false);
      setShowPaymentModal(false);
      setPendingBookingData(null);
      setPaymentAmount('');
      setPaymentMethod('Cash');
      setPaymentNotes('');
      setProductSearchCode('');
      setTransportationSelected(false);
      setCustomTransportationCharge('');
      setTransportationCharge(0);

      if (paymentAmount && parseFloat(paymentAmount) > 0) {
        toast.success(`Booking created successfully! Total: ₹${Math.floor(pendingBookingData.finalTotal)}. Payment of ₹${paymentAmount} recorded.`);
      } else {
        toast.success(`Booking created successfully! Total: ₹${Math.floor(pendingBookingData.finalTotal)}. No payment recorded - dates are free until payment.`);
      }
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error('Error creating booking');
    }
  }

  const filteredBookings = bookings.filter((b) => {
    // Search filter
    const matchesSearch = b.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.customer_phone && b.customer_phone.includes(searchTerm));

    // Status filter
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;

    // Urgent filter
    const isUrgent = isBookingUrgent(b);
    const matchesUrgentFilter = urgentFilter === 'all' ||
      (urgentFilter === 'urgent' && isUrgent) ||
      (urgentFilter === 'normal' && !isUrgent);

    // Date range filter - check if booking overlaps with selected date range
    let matchesDateRange = true;
    if (filterDateFrom && filterDateTo) {
      const products = Array.isArray(b.products) ? b.products : [];

      // Check if any product in this booking overlaps with the filter date range
      const hasOverlap = products.some((product: any) => {
        if (!product.booked_from || !product.booked_to) return false;

        const productFrom = new Date(product.booked_from);
        const productTo = new Date(product.booked_to);
        const filterFrom = new Date(filterDateFrom);
        const filterTo = new Date(filterDateTo);

        // Normalize to start of day
        productFrom.setHours(0, 0, 0, 0);
        productTo.setHours(0, 0, 0, 0);
        filterFrom.setHours(0, 0, 0, 0);
        filterTo.setHours(0, 0, 0, 0);

        // Check if date ranges overlap
        return productFrom <= filterTo && productTo >= filterFrom;
      });

      matchesDateRange = hasOverlap;
    }

    return matchesSearch && matchesStatus && matchesUrgentFilter && matchesDateRange;
  }).sort((a, b) => {
    // Sort delayed bookings to the top (highest priority)
    const aDelayed = isBookingDelayed(a);
    const bDelayed = isBookingDelayed(b);

    if (aDelayed && !bDelayed) return -1; // a comes first
    if (!aDelayed && bDelayed) return 1;  // b comes first

    // If both delayed or both not delayed, sort by booking_date (newest first)
    const dateA = new Date(a.booking_date).getTime();
    const dateB = new Date(b.booking_date).getTime();
    return dateB - dateA;
  });

  if (loading) {
    return <div className="text-center py-12">Loading bookings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Bookings</h1>
        <Button onClick={handleAddBooking}>Add Booking</Button>
      </div>

      {/* Delayed Bookings Alert */}
      {(() => {
        const delayedCount = filteredBookings.filter(b => isBookingDelayed(b)).length;
        if (delayedCount > 0) {
          return (
            <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🚨</span>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-red-800">URGENT: {delayedCount} Delayed Booking{delayedCount > 1 ? 's' : ''}</h3>
                  <p className="text-sm text-red-700">
                    Product(s) not returned on scheduled date. Follow-up required immediately!
                  </p>
                </div>
                <span className="px-4 py-2 bg-red-600 text-white text-xl font-bold rounded-full">
                  {delayedCount}
                </span>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Search and Date Filter */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex items-center space-x-4">
          <Input
            placeholder="Search by customer name or mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <span className="text-sm text-gray-600">Total Orders: {bookings.length}</span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <DateRangePicker
              label="📅 Check Bookings By Date"
              startDate={filterDateFrom}
              endDate={filterDateTo}
              onStartDateChange={(date) => setFilterDateFrom(date)}
              onEndDateChange={(date) => setFilterDateTo(date)}
              minDate="2000-01-01"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Booking Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            >
              <option value="all">All Status</option>
              <option value="pending">⏳ Pending</option>
              <option value="confirmed">✅ Confirmed</option>
              <option value="in_progress">🔄 In Progress</option>
              <option value="completed">✔️ Completed</option>
              <option value="cancelled">❌ Cancelled</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Priority:</label>
            <select
              value={urgentFilter}
              onChange={(e) => setUrgentFilter(e.target.value as 'all' | 'urgent' | 'normal')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            >
              <option value="all">All Bookings</option>
              <option value="urgent">🚨 Urgent Only</option>
              <option value="normal">Normal Only</option>
            </select>
          </div>
          {(filterDateFrom || filterDateTo || statusFilter !== 'all' || urgentFilter !== 'all') && (
            <button
              onClick={() => {
                setFilterDateFrom('');
                setFilterDateTo('');
                setStatusFilter('all');
                setUrgentFilter('all');
              }}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-800 font-medium whitespace-nowrap"
            >
              Clear Filters
            </button>
          )}
        </div>

        {filterDateFrom && filterDateTo && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">🔍 Filtering:</span> Showing bookings overlapping between{' '}
              <strong>{new Date(filterDateFrom).toLocaleDateString('en-GB')}</strong> and{' '}
              <strong>{new Date(filterDateTo).toLocaleDateString('en-GB')}</strong>
            </p>
          </div>
        )}
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                ID
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                Items
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Booking Date
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Booked For
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Status
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBookings.map((booking) => {
              const allProducts = Array.isArray(booking.products) ? booking.products : [];
              const activeProducts = allProducts.filter((p: any) => p.status !== 'cancelled' && p.status !== 'exchanged');
              const productCount = activeProducts.length;
              const isUrgent = isBookingUrgent(booking);
              const urgentReason = isUrgent ? getUrgentReason(booking) : '';
              const isDelayed = isBookingDelayed(booking);
              const delayedProducts = isDelayed ? getDelayedProducts(booking) : [];

              return (
                <tr key={booking.id} className={`hover:bg-gray-50 relative ${isDelayed ? 'bg-red-50 border-l-4 border-red-500' : ''}`}>
                  <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-600">#{booking.id}</span>
                      {isDelayed && (
                        <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
                          DELAYED
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-1 max-w-[200px]">
                      <span className="truncate">{booking.customer_name}</span>
                      {isUrgent && (
                        <button
                          onClick={() => toast.info(urgentReason)}
                          className="flex-shrink-0 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded hover:bg-red-200 transition-colors"
                          title={urgentReason}
                        >
                          ⚠️
                        </button>
                      )}
                      {isDelayed && (
                        <button
                          onClick={() => {
                            const delayInfo = delayedProducts.map(p =>
                              `${p.name} (${p.code}): ${p.daysDelayed} day${p.daysDelayed > 1 ? 's' : ''} overdue`
                            ).join('\n');
                            toast.error(`⚠️ DELAYED PRODUCTS:\n\n${delayInfo}\n\nExpected return: ${new Date(delayedProducts[0].booked_to).toLocaleDateString('en-GB')}\n\n⚠️ FOLLOW UP REQUIRED - Product(s) not returned!`, 10000);
                          }}
                          className="flex-shrink-0 px-1.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700 transition-colors animate-pulse"
                          title="Click for details"
                        >
                          🚨
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                    {productCount} {productCount === 1 ? 'item' : 'items'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(booking.booking_date).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(booking.booked_from).toLocaleDateString('en-GB')} - {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${booking.status === 'confirmed'
                        ? 'bg-green-100 text-green-800'
                        : booking.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : booking.status === 'completed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                    >
                      {booking.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {/* View Order Button */}
                      <button
                        onClick={() => window.location.href = `/admin/bookings/${booking.id}`}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors whitespace-nowrap"
                        title="View Order Details"
                      >
                        📋 View
                      </button>

                      {/* Quick View Icon Button */}
                      <button
                        onClick={() => setViewingBooking(booking)}
                        className="relative text-gray-600 hover:text-blue-600 transition-colors p-1.5 rounded hover:bg-blue-50"
                        title="Quick View"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-4 h-4"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </button>

                      {/* Modify Icon Button */}
                      <button
                        onClick={() => handleModify(booking)}
                        className="text-blue-600 hover:text-blue-900 transition-colors p-1.5 rounded hover:bg-blue-50"
                        title="Modify Booking"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>

                      {/* Cancel Icon Button */}
                      {booking.status !== 'cancelled' && (
                        <button
                          onClick={() => handleCancelClick(booking.id, booking.customer_name)}
                          className="text-red-600 hover:text-red-900 transition-colors p-1.5 rounded hover:bg-red-50"
                          title="Cancel Booking"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}

                      {/* Urgent Badge - At the end */}
                      {isUrgent && (
                        <span
                          className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded uppercase"
                          title={urgentReason}
                        >
                          URGENT
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modify Modal */}
      {showModifyModal && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Modify Booking</h2>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Contact Details</h3>
              <Input
                label="Name*"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                required
              />
              <Input
                label="Mobile Number (with country code)"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                placeholder="e.g., +911234567890"
              />

              <h3 className="text-lg font-semibold mt-6">Add Address</h3>
              <Input
                label="House Number*"
                onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
              />
              <Input
                label="Street Address*"
                value={formData.customer_address}
                onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Town/City*" />
                <Input label="Pincode*" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="State*" />
              </div>

              {/* Products List */}
              {selectedBooking && Array.isArray(selectedBooking.products) && selectedBooking.products.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Products in this Booking</h3>
                  <div className="space-y-3">
                    {selectedBooking.products.map((product: any, index: number) => {
                      const bookedFrom = product.booked_from || selectedBooking.booked_from;
                      const bookedTo = product.booked_to || selectedBooking.booked_to;
                      const uniqueKey = `${product.id}_${bookedFrom}_${bookedTo}_${index}`;

                      return (
                        <div key={uniqueKey} className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Product Image */}
                            <div className="w-16 h-20 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                              {(() => {
                                const hasImage = product.image && product.image !== null && product.image !== '';
                                const imageUrl = hasImage ? getImageUrl(product.image) : null;

                                if (imageUrl) {
                                  return (
                                    <img
                                      src={imageUrl}
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        const parent = target.parentElement;
                                        if (parent) {
                                          parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-2xl">👔</span></div>';
                                        }
                                      }}
                                    />
                                  );
                                } else {
                                  return (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <span className="text-2xl">👔</span>
                                    </div>
                                  );
                                }
                              })()}
                            </div>

                            {/* Product Info */}
                            <div>
                              <h4 className="font-semibold text-gray-900">{product.name}</h4>
                              <p className="text-xs text-gray-600 mt-1">
                                <span className="font-mono bg-gray-200 px-2 py-0.5 rounded">Code: {product.code}</span>
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Current: {product.booked_from ? new Date(product.booked_from).toLocaleDateString('en-GB') : 'N/A'} - {product.booked_to ? new Date(product.booked_to).toLocaleDateString('en-GB') : 'N/A'}
                              </p>
                            </div>
                          </div>

                          {/* Change Dates Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProductForDateChange(product);
                              setChangeDateFrom(product.booked_from?.split('T')[0] || '');
                              setChangeDateTo(product.booked_to?.split('T')[0] || '');
                              setDateChangeCharge(0);
                              setProductBookingsForDateChange(productBookings[product.id] || []);
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
                          >
                            📅 Change Dates
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex space-x-3 mt-6">
                <Button onClick={handleUpdate}>Save</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowModifyModal(false);
                    setSelectedBooking(null);
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Change Modal (like Salesman Portal) */}
      {selectedProductForDateChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">📅 Change Booking Dates</h2>
                <button
                  onClick={() => {
                    setSelectedProductForDateChange(null);
                    setChangeDateFrom('');
                    setChangeDateTo('');
                    setDateChangeCharge(0);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Product Info */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-20 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                    {(() => {
                      const hasImage = selectedProductForDateChange.image && selectedProductForDateChange.image !== null && selectedProductForDateChange.image !== '';
                      const imageUrl = hasImage ? getImageUrl(selectedProductForDateChange.image) : null;

                      if (imageUrl) {
                        return (
                          <img
                            src={imageUrl}
                            alt={selectedProductForDateChange.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-2xl">👔</span></div>';
                              }
                            }}
                          />
                        );
                      } else {
                        return (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-2xl">👔</span>
                          </div>
                        );
                      }
                    })()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedProductForDateChange.name}</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-mono bg-gray-200 px-2 py-0.5 rounded">Code: {selectedProductForDateChange.code}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Date Picker */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Select New Dates</label>
                <DateRangePicker
                  label="Check Availability"
                  startDate={changeDateFrom}
                  endDate={changeDateTo}
                  onStartDateChange={setChangeDateFrom}
                  onEndDateChange={setChangeDateTo}
                  bookings={productBookingsForDateChange}
                  productName={selectedProductForDateChange.name}
                  minDate={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Charge Input (if manual) or Display */}
              {changeDateFrom && changeDateTo && (changeDateFrom !== selectedProductForDateChange.booked_from?.split('T')[0] || changeDateTo !== selectedProductForDateChange.booked_to?.split('T')[0]) && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">Date Change Charge:</span>
                    {dateChangeChargeSettings.charge_type === 'manual' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={dateChangeCharge}
                          onChange={(e) => setDateChangeCharge(parseFloat(e.target.value) || 0)}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="0"
                        />
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-blue-600">
                        ₹{calculateDateChangeCharge(
                          selectedProductForDateChange.booked_from?.split('T')[0] || '',
                          selectedProductForDateChange.booked_to?.split('T')[0] || '',
                          changeDateFrom,
                          changeDateTo
                        ).toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={async () => {
                    if (!changeDateFrom || !changeDateTo) {
                      toast.warning('Please select both pickup and return dates');
                      return;
                    }

                    try {
                      const oldFrom = selectedProductForDateChange.booked_from?.split('T')[0] || '';
                      const oldTo = selectedProductForDateChange.booked_to?.split('T')[0] || '';
                      const datesChanged = changeDateFrom !== oldFrom || changeDateTo !== oldTo;

                      if (!datesChanged) {
                        toast.info('No changes detected in dates');
                        return;
                      }

                      // Calculate or use manual charge
                      const finalCharge = dateChangeChargeSettings.charge_type === 'manual'
                        ? dateChangeCharge
                        : calculateDateChangeCharge(oldFrom, oldTo, changeDateFrom, changeDateTo);

                      // Update the booking with new dates
                      await bookingsApi.update(selectedBooking!.id, {
                        products: [{
                          id: selectedProductForDateChange.id,
                          booked_from: changeDateFrom,
                          booked_to: changeDateTo,
                        }]
                      });

                      // Record the charge if any (as date_change_charge - does not affect payment calculations)
                      if (finalCharge > 0) {
                        await paymentTransactionsApi.create({
                          booking_id: selectedBooking!.id,
                          amount: finalCharge,
                          type: 'date_change_charge',
                          method: 'Manual',
                          recorded_by: 'Admin',
                          notes: `Date change charge for ${selectedProductForDateChange.name} (${selectedProductForDateChange.code}): ${oldFrom} to ${oldTo} → ${changeDateFrom} to ${changeDateTo}`,
                        });
                      }

                      toast.success('Booking dates updated successfully!');

                      // Refresh bookings
                      fetchBookings();

                      // Close modals
                      setSelectedProductForDateChange(null);
                      setChangeDateFrom('');
                      setChangeDateTo('');
                      setDateChangeCharge(0);
                      setShowModifyModal(false);
                    } catch (error) {
                      console.error('Error updating booking dates:', error);
                      toast.error('Failed to update booking dates');
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  💾 Save Changes
                </button>
                <button
                  onClick={() => {
                    setSelectedProductForDateChange(null);
                    setChangeDateFrom('');
                    setChangeDateTo('');
                    setDateChangeCharge(0);
                  }}
                  className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Booking Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl my-8">
            <h2 className="text-2xl font-bold mb-4">Add New Booking</h2>
            <div className="space-y-4">
              {/* Booking Date Display */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Booking Date:</span> {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

              {/* Note: Individual dates are set per product below */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  ℹ️ <strong>Note:</strong> You'll set pickup and return dates for each product individually when adding them to the bill.
                </p>
              </div>

              {/* Customer Details */}
              <h3 className="text-lg font-semibold mt-6">Customer Details</h3>
              <Input
                label="Customer Name*"
                value={addFormData.customer_name}
                onChange={(e) => setAddFormData({ ...addFormData, customer_name: e.target.value })}
                required
              />

              {/* Mobile Numbers with Country Codes */}
              <div className="grid grid-cols-2 gap-4">
                <PhoneInput
                  label="Mobile Number"
                  value={addFormData.customer_phone}
                  countryCode={addFormData.customer_phone_country}
                  onValueChange={(value) => {
                    console.log('Phone value changed:', value);
                    setAddFormData((prev) => {
                      const updated = { ...prev, customer_phone: value };
                      // Check for duplicate after state update
                      setTimeout(() => {
                        checkPhoneNumberDuplicate(value, prev.customer_phone_country, prev.alternate_phone, prev.alternate_phone_country);
                      }, 0);
                      return updated;
                    });
                  }}
                  onCountryCodeChange={(code) => {
                    console.log('Country code changed:', code);
                    setAddFormData((prev) => {
                      const updated = { ...prev, customer_phone_country: code };
                      // Check for duplicate after state update
                      setTimeout(() => {
                        checkPhoneNumberDuplicate(prev.customer_phone, code, prev.alternate_phone, prev.alternate_phone_country);
                      }, 0);
                      return updated;
                    });
                  }}
                  required
                />
                <PhoneInput
                  label="Alternate Mobile Number"
                  value={addFormData.alternate_phone}
                  countryCode={addFormData.alternate_phone_country}
                  onValueChange={(value) => {
                    console.log('Alt phone value changed:', value);
                    setAddFormData((prev) => {
                      const updated = { ...prev, alternate_phone: value };
                      // Check for duplicate after state update
                      setTimeout(() => {
                        checkPhoneNumberDuplicate(prev.customer_phone, prev.customer_phone_country, value, prev.alternate_phone_country);
                      }, 0);
                      return updated;
                    });
                  }}
                  onCountryCodeChange={(code) => {
                    console.log('Alt country code changed:', code);
                    setAddFormData((prev) => {
                      const updated = { ...prev, alternate_phone_country: code };
                      // Check for duplicate after state update
                      setTimeout(() => {
                        checkPhoneNumberDuplicate(prev.customer_phone, prev.customer_phone_country, prev.alternate_phone, code);
                      }, 0);
                      return updated;
                    });
                  }}
                  required
                />
              </div>

              {/* Error Message for Duplicate Phone Numbers */}
              {phoneNumberError && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg animate-fadeIn">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-red-800 font-semibold text-sm">{phoneNumberError}</p>
                  </div>
                </div>
              )}

              <Input
                label="Address"
                value={addFormData.customer_address}
                onChange={(e) => setAddFormData({ ...addFormData, customer_address: e.target.value })}
              />

              {/* Products Selection - Enhanced with Search & QR */}
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-semibold">Add Products*</h3>

                {/* Product Search Bar with Autocomplete */}
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Enter Product Code or Name
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={productSearchCode}
                          onChange={(e) => handleSearchInputChange(e.target.value)}
                          onKeyDown={handleKeyboardNavigation}
                          onFocus={() => {
                            if (productSearchCode.trim() && filteredProducts.length > 0) {
                              setShowSuggestions(true);
                            }
                          }}
                          onBlur={() => {
                            // Delay to allow click on suggestion
                            setTimeout(() => {
                              setShowSuggestions(false);
                              setSelectedSuggestionIndex(-1);
                            }, 200);
                          }}
                          placeholder="Type code or name... (e.g., SH-000001 or Sherwani)"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />

                        {/* Autocomplete Suggestions Dropdown */}
                        {showSuggestions && filteredProducts.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-300 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                            <div className="p-2">
                              <p className="text-xs text-gray-500 px-3 py-1 font-semibold uppercase">
                                {filteredProducts.length} {filteredProducts.length === 1 ? 'match' : 'matches'} found
                              </p>
                              {filteredProducts.map((product, index) => (
                                <button
                                  key={product.id}
                                  onClick={() => handleSelectSuggestion(product)}
                                  className={`w-full text-left px-3 py-3 rounded-lg transition-colors border-b border-gray-100 last:border-0 ${index === selectedSuggestionIndex
                                    ? 'bg-blue-100 border-blue-300 border-2'
                                    : 'hover:bg-blue-50'
                                    }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <p className="font-semibold text-gray-900">{product.name}</p>
                                      <p className="text-sm text-gray-600">
                                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{product.code}</span>
                                        {product.size && <span className="ml-2">• Size: {product.size}</span>}
                                      </p>
                                    </div>
                                    <div className="text-right ml-3">
                                      <p className="font-bold text-green-600">₹{Math.floor(product.rent)}</p>
                                      <p className="text-xs text-gray-500">/day</p>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* No Results Message */}
                        {showSuggestions && productSearchCode.trim() && filteredProducts.length === 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg p-4">
                            <div className="text-center text-gray-500">
                              <p className="text-sm">❌ No products found matching "{productSearchCode}"</p>
                              <p className="text-xs mt-1">Try different code or name</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      💡 Start typing to see suggestions from inventory
                    </p>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={() => setShowQRScanner(true)}
                      className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      <span className="text-xl">📷</span>
                      Scan QR
                    </button>
                  </div>
                </div>

                {/* Bill-Style Product Display */}
                {addFormData.products.length > 0 ? (
                  <div id="booking-invoice-table" className="bg-white border-2 border-gray-300 rounded-lg overflow-hidden">
                    {/* Bill Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-3">
                      <h4 className="text-lg font-bold">📋 Booking Invoice</h4>
                      <p className="text-sm text-blue-100">Selected Products & Services</p>
                    </div>

                    {/* Products Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-100 border-b-2 border-gray-300">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase w-12">#</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Product Details</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase w-24">Size</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase w-64">Rental Dates*</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase w-48">Discount</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase w-32">Price</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase w-20">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {addFormData.products.map((product, index) => {
                            const uniqueKey = `${product.id}_${product.booked_from || ''}_${product.booked_to || ''}_${index}`;

                            return (
                              <tr key={uniqueKey} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-4 text-center">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
                                    {index + 1}
                                  </span>
                                </td>
                                <td className="px-4 py-4">
                                  <div>
                                    <p className="font-semibold text-gray-900">{product.name}</p>
                                    <p className="text-sm text-gray-500 font-mono">{product.code}</p>
                                    <p className="text-xs text-gray-400">₹{Math.floor(product.rent)}/day</p>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                                    {product.size || 'N/A'}
                                  </span>
                                </td>
                                <td className="px-4 py-4">
                                  <DateRangePicker
                                    key={`date-picker-${product.id}-${index}`}
                                    label=""
                                    startDate={addFormData.products[index]?.booked_from || ''}
                                    endDate={addFormData.products[index]?.booked_to || ''}
                                    bookings={productBookings[product.id] || []}
                                    productName={product.name}
                                    onStartDateChange={(date) => {
                                      setAddFormData(prev => {
                                        const updated = [...prev.products];
                                        updated[index] = { ...updated[index], booked_from: date };
                                        return { ...prev, products: updated };
                                      });

                                      // Only update last dates for reference, don't auto-fill
                                      if (date && addFormData.products[index].booked_to) {
                                        setLastProductDates({ from: date, to: addFormData.products[index].booked_to });
                                      }
                                    }}
                                    onEndDateChange={(date) => {
                                      setAddFormData(prev => {
                                        const updated = [...prev.products];
                                        updated[index] = { ...updated[index], booked_to: date };
                                        return { ...prev, products: updated };
                                      });

                                      // Only update last dates for reference, don't auto-fill
                                      if (product.booked_from && date) {
                                        setLastProductDates({ from: product.booked_from, to: date });
                                      }
                                    }}
                                    compact={true}
                                  />
                                </td>
                                {/* Discount Column */}
                                <td className="px-4 py-4">
                                  <div className="flex flex-col gap-2">
                                    <select
                                      value={product.discountType || ''}
                                      onChange={(e) => {
                                        const discountType = e.target.value as 'percentage' | 'fixed' | '';
                                        setAddFormData(prev => {
                                          const updated = [...prev.products];
                                          updated[index] = {
                                            ...updated[index],
                                            discountType: discountType || null,
                                            discountValue: discountType ? (updated[index].discountValue || 0) : 0
                                          };
                                          return { ...prev, products: updated };
                                        });
                                      }}
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      <option value="">No Discount</option>
                                      <option value="percentage">Percentage %</option>
                                      <option value="fixed">Fixed ₹</option>
                                    </select>
                                    {product.discountType && (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="number"
                                          min="0"
                                          max={product.discountType === 'percentage' ? 100 : product.rent}
                                          step={product.discountType === 'percentage' ? 1 : 10}
                                          value={product.discountValue || 0}
                                          onChange={(e) => {
                                            const value = parseFloat(e.target.value) || 0;
                                            setAddFormData(prev => {
                                              const updated = [...prev.products];
                                              updated[index] = {
                                                ...updated[index],
                                                discountValue: value
                                              };
                                              return { ...prev, products: updated };
                                            });
                                          }}
                                          placeholder="0"
                                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                                        />
                                        <span className="text-xs text-gray-600">
                                          {product.discountType === 'percentage' ? '%' : '₹'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  {(() => {
                                    // Use backend preview if available
                                    const previewProduct = bookingPreview?.products?.find((p: any) => p.id === product.id);
                                    if (previewProduct) {
                                      const hasDiscount = previewProduct.discount_amount > 0;
                                      return (
                                        <div>
                                          {hasDiscount ? (
                                            <>
                                              <p className="text-xs text-gray-400 line-through">₹{Math.floor(previewProduct.rent)}</p>
                                              <p className="font-bold text-green-600">₹{Math.floor(previewProduct.effective_rent)}</p>
                                              <p className="text-xs text-green-600">
                                                {previewProduct.discount_type === 'percentage'
                                                  ? `${product.discountValue}% off`
                                                  : `-₹${previewProduct.discount_amount}`}
                                              </p>
                                            </>
                                          ) : (
                                            <p className="font-bold text-gray-900">₹{Math.floor(previewProduct.rent)}</p>
                                          )}
                                        </div>
                                      );
                                    }

                                    // Fallback display (before preview loads)
                                    return <p className="font-bold text-gray-900">₹{Math.floor(product.rent)}</p>;
                                  })()}
                                </td>
                                <td className="px-4 py-4 text-center">
                                  <button
                                    onClick={() => handleRemoveProduct(product.id)}
                                    className="text-red-600 hover:text-red-800 font-medium text-sm transition-colors"
                                    title="Remove Product"
                                  >
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Subtotal */}
                    <div className="bg-blue-50 border-t-2 border-blue-200 px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Subtotal ({addFormData.products.length} {addFormData.products.length === 1 ? 'item' : 'items'})</span>
                      <span className="text-xl font-bold text-blue-600">₹{calculateSubtotal()}</span>
                    </div>

                    {/* Transportation Option */}
                    <div className="bg-gray-50 border-t border-gray-200 px-4 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🚚</span>
                          <div>
                            <p className="font-semibold text-gray-800">Local Transportation Service</p>
                            <p className="text-sm text-gray-600">Local delivery & pickup service</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="transportation"
                              checked={!transportationSelected}
                              onChange={() => {
                                setTransportationSelected(false);
                                setAddFormData({ ...addFormData, transport_charge: 0 });
                                setCustomTransportationCharge('');
                                setTransportationCharge(0);
                              }}
                              className="w-5 h-5 text-gray-600"
                            />
                            <span className="font-medium text-gray-700">No</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="transportation"
                              checked={transportationSelected}
                              onChange={() => {
                                setTransportationSelected(true);
                                setCustomTransportationCharge('');
                              }}
                              className="w-5 h-5 text-blue-600"
                            />
                            <span className="font-medium text-gray-700">Yes</span>
                          </label>
                        </div>
                      </div>

                      {/* Transportation Charge Input - Shows when Yes is selected */}
                      {transportationSelected && (
                        <div className="mt-3 pl-12">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Enter Local Transportation Charge*
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700 font-medium">₹</span>
                            <input
                              type="number"
                              value={customTransportationCharge}
                              onChange={(e) => {
                                const value = e.target.value;
                                // Only allow positive numbers
                                if (value === '' || parseFloat(value) >= 0) {
                                  const numericValue = parseFloat(value) || 0;
                                  setCustomTransportationCharge(value);
                                  setTransportationCharge(numericValue);
                                  setAddFormData(prev => ({ ...prev, transport_charge: numericValue }));
                                }
                              }}
                              placeholder="Enter amount"
                              min="0"
                              step="1"
                              className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Discount Section */}
                    <div className="bg-yellow-50 border-t border-yellow-200 px-4 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">💰</span>
                          <div>
                            <p className="font-semibold text-gray-800">Discount</p>
                            <p className="text-sm text-gray-600">Apply discount on product rent only (transportation not included)</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="discount_type"
                              checked={!addFormData.discount_type}
                              onChange={() => {
                                setAddFormData({ ...addFormData, discount_type: null, discount_value: 0 });
                              }}
                              className="w-5 h-5 text-gray-600"
                            />
                            <span className="font-medium text-gray-700">No Discount</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="discount_type"
                              checked={addFormData.discount_type === 'percentage'}
                              onChange={() => setAddFormData({ ...addFormData, discount_type: 'percentage', discount_value: 0 })}
                              className="w-5 h-5 text-blue-600"
                            />
                            <span className="font-medium text-gray-700">Percentage (%)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="discount_type"
                              checked={addFormData.discount_type === 'amount'}
                              onChange={() => setAddFormData({ ...addFormData, discount_type: 'amount', discount_value: 0 })}
                              className="w-5 h-5 text-green-600"
                            />
                            <span className="font-medium text-gray-700">Fixed Amount (₹)</span>
                          </label>
                        </div>
                      </div>

                      {/* Discount Input - Shows when discount type is selected */}
                      {addFormData.discount_type && (
                        <div className="mt-3 pl-12">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            {addFormData.discount_type === 'percentage' ? 'Enter Discount Percentage*' : 'Enter Discount Amount*'}
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700 font-medium">
                              {addFormData.discount_type === 'amount' ? '₹' : ''}
                            </span>
                            <input
                              type="number"
                              value={addFormData.discount_value || ''}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                // Validate percentage (0-100) or amount
                                if (addFormData.discount_type === 'percentage') {
                                  if (value >= 0 && value <= 100) {
                                    setAddFormData({ ...addFormData, discount_value: value });
                                  }
                                } else {
                                  if (value >= 0) {
                                    setAddFormData({ ...addFormData, discount_value: value });
                                  }
                                }
                              }}
                              placeholder={addFormData.discount_type === 'percentage' ? 'Enter percentage (0-100)' : 'Enter amount'}
                              min="0"
                              max={addFormData.discount_type === 'percentage' ? 100 : undefined}
                              step={addFormData.discount_type === 'percentage' ? '0.1' : '1'}
                              className="w-64 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            />
                            {addFormData.discount_type === 'percentage' && (
                              <span className="text-gray-700 font-medium">%</span>
                            )}
                          </div>
                          {calculateDiscount() > 0 && (
                            <p className="text-sm text-green-600 mt-2 font-medium">
                              💵 Discount Amount: ₹{calculateDiscount()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Final Total */}
                    <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-4 py-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-green-100 uppercase tracking-wide">Total Rental Amount</p>
                          {addFormData.transport_charge > 0 && (
                            <p className="text-xs text-green-200 mt-1">
                              (Includes local transportation charge: ₹{Math.floor(addFormData.transport_charge)})
                            </p>
                          )}
                          {calculateDiscount() > 0 && (
                            <p className="text-xs text-green-200 mt-1">
                              (Discount applied: -₹{calculateDiscount()})
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-4xl font-bold">₹{calculateTotal()}</p>
                          <p className="text-sm text-green-100">per rental period</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <div className="text-6xl mb-4">📦</div>
                    <p className="text-gray-600 font-medium mb-2">No products added yet</p>
                    <p className="text-sm text-gray-500">Enter a product code or scan QR to add products</p>
                  </div>
                )}

              </div>

              <div className="flex space-x-3 mt-6">
                <Button onClick={handleCreateBooking}>Create Booking</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setProductSearchCode('');
                    setTransportationSelected(false);
                    setCustomTransportationCharge('');
                    setTransportationCharge(0);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )
      }

      {/* Date Confirmation Modal */}
      {
        showDateConfirmModal && lastProductDates && pendingProduct && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
              <h3 className="text-xl font-bold mb-4 text-gray-900">Use Same Rental Period?</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700 mb-2">
                  Previous product rental period:
                </p>
                <p className="text-lg font-bold text-blue-700">
                  {new Date(lastProductDates.from).toLocaleDateString('en-GB')} to {new Date(lastProductDates.to).toLocaleDateString('en-GB')}
                </p>
              </div>
              <p className="text-gray-700 mb-6">
                Do you want to use the same rental period for <strong>{pendingProduct.name}</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => confirmSameDates(true)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  ✓ Yes, Use Same Dates
                </button>
                <button
                  onClick={() => confirmSameDates(false)}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition-colors"
                >
                  ✗ No, I'll Set Different Dates
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* QR Scanner Modal */}
      {
        showQRScanner && (
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setShowQRScanner(false)}
          />
        )
      }

      {/* Booking Product Tracking Modal */}
      {
        trackingBooking && showProductTrackingList && (
          <BookingProductTrackingModal
            booking={trackingBooking}
            onClose={() => {
              setTrackingBooking(null);
              setShowProductTrackingList(false);
              fetchBookings(); // Refresh bookings after tracking updates
            }}
          />
        )
      }

      {/* View Booking Modal */}
      {
        viewingBooking && (() => {
          // Parse measurements and special requirements when modal opens
          let parsedMeas: { [key: number]: any } = {};
          let parsedSpecReqs: { [key: number]: string } = {};

          if (viewingBooking.measurements) {
            try {
              const measurementsData = typeof viewingBooking.measurements === 'string'
                ? JSON.parse(viewingBooking.measurements)
                : viewingBooking.measurements;
              parsedMeas = measurementsData || {};
            } catch (error) {
              console.error('Error parsing measurements:', error);
            }
          }

          if (viewingBooking.special_requirements) {
            try {
              const specialReqsData = typeof viewingBooking.special_requirements === 'string'
                ? JSON.parse(viewingBooking.special_requirements)
                : viewingBooking.special_requirements;
              if (typeof specialReqsData === 'object' && specialReqsData !== null) {
                parsedSpecReqs = specialReqsData;
              }
            } catch (error) {
              console.error('Error parsing special requirements:', error);
            }
          }

          return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
              <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slideIn">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-800">
                    📋 Booking Details
                  </h2>
                  <button
                    onClick={() => {
                      setViewingBooking(null);
                      setShowMeasurements({});
                    }}
                    className="text-gray-500 hover:text-gray-700 text-3xl font-bold transition-colors"
                  >
                    ×
                  </button>
                </div>

                {/* Booking Content */}
                <div className="space-y-6">
                  {/* Customer Information */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 border-l-4 border-blue-500">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-blue-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                      Customer Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Name</p>
                        <p className="text-base font-semibold text-gray-900">{viewingBooking.customer_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Phone</p>
                        <p className="text-base font-semibold text-gray-900">{viewingBooking.customer_phone || 'N/A'}</p>
                      </div>
                      {viewingBooking.alternate_phone && (
                        <div className="col-span-2">
                          <p className="text-sm text-gray-600">Alternate Phone</p>
                          <p className="text-base font-semibold text-gray-900">{viewingBooking.alternate_phone}</p>
                        </div>
                      )}
                      <div className="col-span-2">
                        <p className="text-sm text-gray-600">Address</p>
                        <p className="text-base font-semibold text-gray-900">{viewingBooking.customer_address || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Booking Details */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-5 border-l-4 border-green-500">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-green-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      Booking Details
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Booking Date</p>
                        <p className="text-base font-semibold text-gray-900">
                          {new Date(viewingBooking.booking_date).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Status</p>
                        <span
                          className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${viewingBooking.status === 'confirmed'
                            ? 'bg-green-100 text-green-800'
                            : viewingBooking.status === 'cancelled'
                              ? 'bg-red-100 text-red-800'
                              : viewingBooking.status === 'completed'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                        >
                          {viewingBooking.status.charAt(0).toUpperCase() + viewingBooking.status.slice(1)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Pickup Date</p>
                        <p className="text-base font-semibold text-gray-900">
                          📅 {new Date(viewingBooking.booked_from).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Return Date</p>
                        <p className="text-base font-semibold text-gray-900">
                          📅 {new Date(viewingBooking.booked_to).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-gray-600">Rental Duration</p>
                        <p className="text-base font-semibold text-gray-900">
                          {Math.ceil((new Date(viewingBooking.booked_to).getTime() - new Date(viewingBooking.booked_from).getTime()) / (1000 * 60 * 60 * 24)) + 1} days
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Products */}
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-5 border-l-4 border-purple-500">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-purple-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                      </svg>
                      Booked Products ({Array.isArray(viewingBooking.products) ? viewingBooking.products.filter((p: any) => p.status !== 'cancelled' && p.status !== 'exchanged').length : 0})
                    </h3>
                    {Array.isArray(viewingBooking.products) && viewingBooking.products.length > 0 ? (
                      <div className="space-y-3">
                        {viewingBooking.products.map((product: any, index: number) => {
                          const hasImage = product.image && product.image !== null && product.image !== '';
                          const imageUrl = hasImage ? getImageUrl(product.image) : null;
                          const isCancelled = product.status === 'cancelled';
                          const isExchanged = product.status === 'exchanged';

                          const bookedFrom = product.booked_from || viewingBooking.booked_from;
                          const bookedTo = product.booked_to || viewingBooking.booked_to;
                          const uniqueKey = `${product.id}_${bookedFrom}_${bookedTo}_${index}`;

                          return (
                            <div key={uniqueKey} className={`bg-white rounded-lg p-4 shadow-sm border ${isCancelled ? 'opacity-60 border-red-300 bg-red-50' :
                              isExchanged ? 'opacity-60 border-orange-300 bg-orange-50' :
                                'border-purple-200'
                              }`}>
                              <div className="flex justify-between items-start gap-4">
                                {/* Product Image */}
                                {imageUrl && (
                                  <div className="flex-shrink-0">
                                    <img
                                      src={imageUrl}
                                      alt={product.name || 'Product'}
                                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-900 text-lg">{product.name}</p>
                                    {isCancelled && (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-semibold">❌ Cancelled</span>
                                    )}
                                    {isExchanged && (
                                      <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">🔄 Exchanged</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600 mt-1">Code: <span className="font-mono font-semibold">{product.code || 'N/A'}</span></p>
                                  {product.size && (
                                    <p className="text-sm text-gray-600">Size: <span className="font-semibold">{product.size}</span></p>
                                  )}
                                  {product.rent && (
                                    <p className="text-sm text-gray-600">Rate: <span className="font-semibold text-green-600">₹{Math.floor(product.rent)}/day</span></p>
                                  )}
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <p className="text-xs text-gray-500">Pickup Date</p>
                                        <p className="text-sm font-semibold text-blue-600">
                                          📅 {bookedFrom ? new Date(bookedFrom).toLocaleDateString('en-GB') : 'N/A'}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500">Drop Date</p>
                                        <p className="text-sm font-semibold text-red-600">
                                          📅 {bookedTo ? new Date(bookedTo).toLocaleDateString('en-GB') : 'N/A'}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No products in this booking</p>
                    )}
                  </div>

                  {/* Transportation indicator */}
                  {((viewingBooking as any).transport_charge || 0) > 0 && (
                    <div className="bg-teal-50 rounded-lg p-3 border-l-4 border-teal-500 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-teal-600">🚚</span>
                        <p className="text-sm font-medium text-teal-800">Local Transportation Opted</p>
                      </div>
                      <p className="text-lg font-bold text-teal-700">
                        ₹{Math.floor((viewingBooking as any).transport_charge || 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  )}


                  {/* Products with Measurements */}
                  {(() => {
                    const products = Array.isArray(viewingBooking.products) ? viewingBooking.products : [];

                    // Parse measurements and special requirements
                    // Use string keys to support both old format (productId) and new format (uniqueKey)
                    let parsedMeas: { [key: string]: any } = {};
                    let parsedSpecReqs: { [key: string]: string } = {};

                    if (viewingBooking.measurements) {
                      try {
                        const measurementsData = typeof viewingBooking.measurements === 'string'
                          ? JSON.parse(viewingBooking.measurements)
                          : viewingBooking.measurements;
                        if (typeof measurementsData === 'object' && measurementsData !== null) {
                          // Preserve all keys (both numeric productId and uniqueKey format)
                          parsedMeas = { ...measurementsData };
                        }
                      } catch (error) {
                        console.error('Error parsing measurements:', error);
                      }
                    }

                    if (viewingBooking.special_requirements) {
                      try {
                        const specialReqsData = typeof viewingBooking.special_requirements === 'string'
                          ? JSON.parse(viewingBooking.special_requirements)
                          : viewingBooking.special_requirements;
                        if (typeof specialReqsData === 'object' && specialReqsData !== null) {
                          // Preserve all keys (both numeric productId and uniqueKey format)
                          parsedSpecReqs = { ...specialReqsData };
                        }
                      } catch (error) {
                        console.error('Error parsing special requirements:', error);
                      }
                    }

                    // Show products that have either measurements or special requirements
                    const productsWithData = products.filter((product: any) => {
                      const productId = product.id;
                      const bookedFrom = product.booked_from || viewingBooking.booked_from;
                      const bookedTo = product.booked_to || viewingBooking.booked_to;
                      const uniqueKey = `${productId}_${bookedFrom}_${bookedTo}`;

                      // Prioritize unique key, then fall back to productId for backward compatibility
                      const measData = parsedMeas[uniqueKey] || parsedMeas[String(productId)] || parsedMeas[productId];
                      const hasMeasurements = measData && Object.keys(measData).length > 0;

                      // Prioritize unique key, then fall back to productId for backward compatibility
                      const specReqData = parsedSpecReqs[uniqueKey] || parsedSpecReqs[String(productId)] || parsedSpecReqs[productId];
                      const hasSpecialReqs = specReqData && typeof specReqData === 'string' && specReqData.trim().length > 0;
                      return hasMeasurements || hasSpecialReqs;
                    });

                    if (productsWithData.length === 0) {
                      return null;
                    }

                    // Helper functions to determine clothing type
                    function isFemaleClothing(productName: string): boolean {
                      const femaleTypes = ['lehenga', 'gown', 'girlish crop top', 'gowns'];
                      return femaleTypes.some(type => productName.toLowerCase().includes(type.toLowerCase()));
                    }

                    function isMaleClothing(productName: string): boolean {
                      const maleTypes = ['sherwani', 'suit', 'kurta pajama', 'indo western'];
                      return maleTypes.some(type => productName.toLowerCase().includes(type.toLowerCase()));
                    }

                    return productsWithData.map((product: any, index: number) => {
                      const productId = product.id;
                      const productIdStr = String(productId);

                      // Create unique key for this product instance (product.id + dates)
                      const bookedFrom = product.booked_from || viewingBooking.booked_from;
                      const bookedTo = product.booked_to || viewingBooking.booked_to;
                      const uniqueKey = `${productId}_${bookedFrom}_${bookedTo}`;

                      // Prioritize unique key first, then fall back to productId for backward compatibility
                      const productMeasurements = parsedMeas[uniqueKey] || parsedMeas[String(productId)] || {};
                      const hasMeasurements = Object.keys(productMeasurements).length > 0;
                      const isExpanded = showMeasurements[uniqueKey] || showMeasurements[String(productId)] || false;
                      const isFemale = isFemaleClothing(product.name);
                      const isMale = isMaleClothing(product.name);
                      // Prioritize unique key first, then fall back to productId for backward compatibility
                      const productSpecialReqs = parsedSpecReqs[uniqueKey] || parsedSpecReqs[String(productId)] || '';

                      // Get product image URL
                      const hasProductImage = product.image && product.image !== null && product.image !== '';
                      const productImageUrl = hasProductImage ? getImageUrl(product.image) : null;

                      return (
                        <div key={`${uniqueKey}_${index}`} className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg p-5 border-l-4 border-pink-500">
                          <button
                            onClick={() => setShowMeasurements({
                              ...showMeasurements,
                              [uniqueKey]: !isExpanded
                            })}
                            className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
                          >
                            <div className="flex items-center">
                              {/* Product Image */}
                              <div className="w-14 h-14 rounded-lg overflow-hidden border-2 border-pink-200 mr-3 flex-shrink-0 bg-white">
                                {productImageUrl ? (
                                  <img
                                    src={productImageUrl}
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = '/placeholder-product.png';
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-400">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 19.5h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5z" />
                                    </svg>
                                  </div>
                                )}
                              </div>

                              {/* Product Info & Title */}
                              <div className="flex flex-col items-start">
                                {/* Product Code Badge */}
                                <span className="text-xs font-bold text-pink-700 bg-pink-100 px-2 py-0.5 rounded mb-1">
                                  {product.code}
                                </span>
                                <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mr-1 text-pink-600">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25h6M9 12h6m-6 3.75h6" />
                                  </svg>
                                  {hasMeasurements ? 'Measurements' : 'Special Requirements'} - {product.name}
                                </h3>
                                <span className="text-xs text-pink-600">(Click to {isExpanded ? 'hide' : 'view'})</span>
                              </div>
                            </div>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={2}
                              stroke="currentColor"
                              className={`w-6 h-6 text-pink-600 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>

                          {isExpanded && (
                            <div className="mt-4 space-y-4">
                              {hasMeasurements && isFemale ? (
                                <div className="space-y-3">
                                  <h5 className="text-sm font-semibold text-gray-700 border-b pb-2">Female Measurements (in inches)</h5>
                                  <div className="grid grid-cols-2 gap-3">
                                    {productMeasurements.waist && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Waist</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.waist}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.bust && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Bust</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.bust}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.shoulder && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Shoulder</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.shoulder}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.sleevesUp && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Sleeves Up</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.sleevesUp}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.sleevesE && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Sleeves E</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.sleevesE}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.sleevesB && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Sleeves B</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.sleevesB}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.lehengaLength && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Lehenga Length</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.lehengaLength}"</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : hasMeasurements && isMale ? (
                                <div className="space-y-3">
                                  <h5 className="text-sm font-semibold text-gray-700 border-b pb-2">Male Measurements (in inches)</h5>
                                  <div className="space-y-3">
                                    <div>
                                      <h6 className="text-xs font-medium text-gray-600 mb-2">Tight Fit</h6>
                                      <div className="grid grid-cols-2 gap-3">
                                        {productMeasurements.sideTight && (
                                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600 mb-1">Side Tight</p>
                                            <p className="text-base font-semibold text-gray-900">{productMeasurements.sideTight}"</p>
                                          </div>
                                        )}
                                        {productMeasurements.sleevesTight && (
                                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600 mb-1">Sleeves Tight</p>
                                            <p className="text-base font-semibold text-gray-900">{productMeasurements.sleevesTight}"</p>
                                          </div>
                                        )}
                                        {productMeasurements.sleevesLength && (
                                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600 mb-1">Sleeves Length</p>
                                            <p className="text-base font-semibold text-gray-900">{productMeasurements.sleevesLength}"</p>
                                          </div>
                                        )}
                                        {productMeasurements.pantLength && (
                                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600 mb-1">Pant Length</p>
                                            <p className="text-base font-semibold text-gray-900">{productMeasurements.pantLength}"</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <h6 className="text-xs font-medium text-gray-600 mb-2">Loose Fit</h6>
                                      <div className="grid grid-cols-2 gap-3">
                                        {productMeasurements.sideLoose && (
                                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600 mb-1">Side Loose</p>
                                            <p className="text-base font-semibold text-gray-900">{productMeasurements.sideLoose}"</p>
                                          </div>
                                        )}
                                        {productMeasurements.sleevesLoose && (
                                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600 mb-1">Sleeves Loose</p>
                                            <p className="text-base font-semibold text-gray-900">{productMeasurements.sleevesLoose}"</p>
                                          </div>
                                        )}
                                        {productMeasurements.sleevesLengthLoose && (
                                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600 mb-1">Sleeves Length</p>
                                            <p className="text-base font-semibold text-gray-900">{productMeasurements.sleevesLengthLoose}"</p>
                                          </div>
                                        )}
                                        {productMeasurements.pantLengthLoose && (
                                          <div className="bg-white border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600 mb-1">Pant Length</p>
                                            <p className="text-base font-semibold text-gray-900">{productMeasurements.pantLengthLoose}"</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : hasMeasurements ? (
                                <div className="space-y-3">
                                  <h5 className="text-sm font-semibold text-gray-700 border-b pb-2">Measurements (in inches)</h5>
                                  <div className="grid grid-cols-2 gap-3">
                                    {productMeasurements.waist && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Waist</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.waist}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.bust && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Bust</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.bust}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.chest && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Chest</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.chest}"</p>
                                      </div>
                                    )}
                                    {productMeasurements.shoulder && (
                                      <div className="bg-white border border-gray-200 rounded-lg p-3">
                                        <p className="text-xs text-gray-600 mb-1">Shoulder</p>
                                        <p className="text-base font-semibold text-gray-900">{productMeasurements.shoulder}"</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : null}

                              {productSpecialReqs && productSpecialReqs.trim().length > 0 && (
                                <div className={`${hasMeasurements ? 'mt-4 pt-4 border-t border-gray-200' : ''}`}>
                                  <h5 className="text-sm font-semibold text-gray-700 mb-2">Special Requirements</h5>
                                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{productSpecialReqs}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Close Button */}
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => {
                      setViewingBooking(null);
                      setShowMeasurements({});
                    }}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      }

      {/* Warning Modal */}
      {
        showWarningModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Warning</h3>
                  <p className="text-sm text-gray-600">
                    {warningMessage} Do you still want to proceed?
                  </p>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowWarningModal(false)}
                  className="px-6 py-2 border-2 border-red-600 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowWarningModal(false);
                    // Show payment modal after warning is accepted
                    const finalTotal = calculateTotal();
                    setPendingBookingData({
                      customer_name: addFormData.customer_name,
                      fullPhone1: `${getCountryByCode(addFormData.customer_phone_country)?.callingCode}${addFormData.customer_phone}`,
                      fullPhone2: `${getCountryByCode(addFormData.alternate_phone_country)?.callingCode}${addFormData.alternate_phone}`,
                      customer_address: addFormData.customer_address,
                      booking_date: addFormData.booking_date,
                      products: addFormData.products,
                      finalTotal,
                      transport_charge: addFormData.transport_charge,
                      discount_type: addFormData.discount_type,
                      discount_value: addFormData.discount_value,
                      discount_amount: calculateDiscount(),
                    });
                    setPaymentAmount('');
                    setPaymentMethod('Cash');
                    setPaymentNotes(''); // Empty notes field
                    setShowPaymentModal(true);
                  }}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Payment Collection Modal for New Booking */}
      {
        showPaymentModal && pendingBookingData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg">
              <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg">
                <h3 className="text-lg font-bold">💰 Collect Payment (Optional)</h3>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <p className="text-sm font-semibold text-blue-800 mb-2">
                    📋 Booking Summary
                  </p>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p><strong>Customer:</strong> {pendingBookingData.customer_name}</p>
                    <p><strong>Total Amount:</strong> ₹{Math.floor(pendingBookingData.finalTotal).toLocaleString('en-IN')}</p>
                    <p><strong>Products:</strong> {pendingBookingData.products.length} item(s)</p>
                  </div>
                </div>

                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <p className="text-xs font-semibold text-yellow-800 mb-1">
                    ⚠️ Important Note
                  </p>
                  <p className="text-xs text-yellow-700">
                    • If you collect payment now, the product dates will be <strong>blocked immediately</strong>
                    <br />
                    • If you skip payment, the booking will be <strong>auto-cancelled after 5 minutes</strong>
                    <br />
                    • You must record payment within 5 minutes to confirm the booking
                    <br />
                    • You can record payment later from the order details page (within 5 min)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Amount (Optional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      min="0"
                      max={pendingBookingData.finalTotal}
                      step="0.01"
                      className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Max: ₹{Math.floor(pendingBookingData.finalTotal).toLocaleString('en-IN')} • Leave empty to skip payment
                  </p>
                </div>

                {parseFloat(paymentAmount) > 0 && (
                  <>
                    <PaymentMethodInput
                      method={paymentMethod}
                      onMethodChange={setPaymentMethod}
                      notes={paymentNotes}
                      onNotesChange={setPaymentNotes}
                      amount={parseFloat(paymentAmount) || undefined}
                      notesLabel="Notes/Transaction Details"
                      notesPlaceholder="Add transaction ID, notes, or any other details..."
                    />
                  </>
                )}
              </div>

              <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPendingBookingData(null);
                    setPaymentAmount('');
                    setPaymentMethod('Cash');
                    setPaymentNotes('');
                  }}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={createBookingConfirmed}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  {parseFloat(paymentAmount) > 0
                    ? `Collect ₹${paymentAmount} & Create Booking`
                    : 'Create Booking Without Payment'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Credit Note Modal */}
      {
        showCreditNoteModal && bookingToCancel && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex items-start gap-4 mb-6">
                <div className="bg-red-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Cancel Booking</h2>
                  <p className="text-gray-600">
                    Are you sure you want to cancel the booking with name <span className="font-semibold text-red-600">&quot;{bookingToCancel.customer_name}&quot;</span>. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  Provide the Validity and Amount for the Credit Note:
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Validity*
                    </label>
                    <input
                      type="date"
                      value={creditNoteData.validity}
                      onChange={(e) => setCreditNoteData({ ...creditNoteData, validity: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Enter"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount*
                    </label>
                    <input
                      type="number"
                      value={creditNoteData.amount}
                      onChange={(e) => setCreditNoteData({ ...creditNoteData, amount: e.target.value })}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Enter"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  * Leave empty if you don&apos;t want to issue a credit note
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCreditNoteModal(false);
                    setBookingToCancel(null);
                    setCreditNoteData({ validity: '', amount: '' });
                  }}
                  className="flex-1 px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                >
                  Don&apos;t Cancel
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* New Cancellation Modal with Policy */}
      {
        showCancellationModal && bookingToCancelWithPolicy && (
          <BookingCancellation
            bookingId={bookingToCancelWithPolicy.id}
            bookingStatus={bookingToCancelWithPolicy.status}
            onCancellationComplete={handleCancellationComplete}
            userRole="admin"
            userName="Admin"
            canCancel={true}
            autoOpen={true}
          />
        )
      }


    </div >
  );
}

