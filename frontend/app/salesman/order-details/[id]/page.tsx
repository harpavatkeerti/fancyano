'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingsApi, paymentTransactionsApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import { DateRangePicker } from '@/components/common';
import { settingsApi } from '@/lib/settingsApi';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEstimate, setShowEstimate] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showTaxInvoice, setShowTaxInvoice] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfType, setPdfType] = useState<'estimate' | 'invoice' | 'tax-invoice' | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPublicUrl, setPdfPublicUrl] = useState<string | null>(null);
  const [showWhatsAppShareModal, setShowWhatsAppShareModal] = useState(false);
  const [showChangeDateModal, setShowChangeDateModal] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Change date form
  const [changeDateFrom, setChangeDateFrom] = useState('');
  const [changeDateTo, setChangeDateTo] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [productBookingsForChange, setProductBookingsForChange] = useState<any[]>([]);
  const [dateChangeCharge, setDateChangeCharge] = useState(0);
  
  // Date change charge settings
  const [dateChangeChargeSettings, setDateChangeChargeSettings] = useState({
    charge_type: 'manual' as 'fixed' | 'variable' | 'manual',
    fixed_amount: 0,
    variable_per_day: 0,
    min_charge: 0,
    max_charge: 0,
  });

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showPaymentBreakdown, setShowPaymentBreakdown] = useState(false);
  const [paymentBreakdown, setPaymentBreakdown] = useState({
    rentDue: '',
    securityDepositDue: '',
    refundToCustomer: 0,
  });

  // Refund form - per-item structure
  const [showRecordRefund, setShowRecordRefund] = useState(false);
  const [refundMethod, setRefundMethod] = useState('Cash');
  // Per-item refund state: { productId: { selected: boolean, amount: string, notes: string } }
  const [itemRefunds, setItemRefunds] = useState<{[key: number]: {selected: boolean, amount: string, notes: string}}>({});

  // Transaction history
  const [transactions, setTransactions] = useState<any[]>([]);

  // Measurement confirmation modal
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [measurements, setMeasurements] = useState<{[key: number]: any}>({});
  const [measurementErrors, setMeasurementErrors] = useState<{[key: string]: string}>({});
  const [specialRequirements, setSpecialRequirements] = useState<{[key: number]: string}>({});
  
  // View/Edit measurements modal
  const [showViewMeasurements, setShowViewMeasurements] = useState(false);
  const [selectedProductForMeasurements, setSelectedProductForMeasurements] = useState<any>(null);
  const [isEditingMeasurements, setIsEditingMeasurements] = useState(false);
  const [editingMeasurements, setEditingMeasurements] = useState<{[key: string]: string}>({});
  const [editingSpecialRequirements, setEditingSpecialRequirements] = useState<string>('');

  // Auto-recalculate when payment amount changes and breakdown is visible
  useEffect(() => {
    if (showPaymentBreakdown && paymentAmount) {
      calculatePaymentBreakdown();
    }
  }, [paymentAmount, showPaymentBreakdown]);

  useEffect(() => {
    if (params.id) {
      fetchBooking();
      fetchDateChangeChargeSettings();
    }
  }, [params.id]);
  
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

  async function fetchBooking() {
    try {
      const [bookingResponse, transactionsResponse] = await Promise.all([
        bookingsApi.getById(Number(params.id)),
        paymentTransactionsApi.getByBookingId(Number(params.id)),
      ]);
      console.log('Fetched booking data:', bookingResponse.data);
      console.log('Paid amount:', bookingResponse.data.paid_amount);
      console.log('Total amount:', bookingResponse.data.total_amount);
      
      // Debug: Log product images
      if (bookingResponse.data.products) {
        bookingResponse.data.products.forEach((product: any, index: number) => {
          console.log(`Product ${index + 1} (${product.name}):`, {
            id: product.id,
            code: product.code,
            image: product.image,
            imageType: typeof product.image,
            imageUrl: getImageUrl(product.image)
          });
        });
      }
      
      setBooking(bookingResponse.data);
      setTransactions(transactionsResponse.data || []);
      
      console.log('Transactions updated:', transactionsResponse.data?.length, 'transactions');
      console.log('Refund transactions:', transactionsResponse.data?.filter((t: any) => t.type === 'refund').length);
      
      // Note: updateBookingStatus() should only be called explicitly after payment/refund actions
      // Not automatically here to avoid infinite loops
      
      // Load measurements from booking if they exist
      if (bookingResponse.data.measurements) {
        try {
          const measurementsData = typeof bookingResponse.data.measurements === 'string' 
            ? JSON.parse(bookingResponse.data.measurements)
            : bookingResponse.data.measurements;
          setMeasurements(measurementsData || {});
        } catch (error) {
          console.error('Error parsing measurements:', error);
        }
      }

      // Load special requirements from booking if they exist
      if (bookingResponse.data.special_requirements) {
        try {
          const specialReqsData = typeof bookingResponse.data.special_requirements === 'string'
            ? JSON.parse(bookingResponse.data.special_requirements)
            : bookingResponse.data.special_requirements;
          if (typeof specialReqsData === 'object' && specialReqsData !== null) {
            // Convert all keys to numbers to match product IDs
            const normalizedSpecReqs: {[key: number]: string} = {};
            Object.keys(specialReqsData).forEach((key: string) => {
              const productId = parseInt(key, 10);
              const value = specialReqsData[key as keyof typeof specialReqsData];
              if (!isNaN(productId) && value && typeof value === 'string') {
                normalizedSpecReqs[productId] = value;
              }
            });
            setSpecialRequirements(normalizedSpecReqs);
          }
        } catch (error) {
          // If it's not JSON, it might be plain text (old format)
          console.log('Special requirements is plain text, not JSON');
        }
      }
    } catch (error) {
      console.error('Error fetching booking:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateDocument(type: 'estimate' | 'invoice' | 'tax-invoice') {
    try {
      // Use POST endpoint to generate PDF and get blob directly for preview
      const response = await axios.post(
        `${API_URL}/invoices/${type}/${booking?.id}`,
        {},
        { responseType: 'blob' }
      );

      // Store PDF blob and show preview instead of auto-downloading
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      setPdfBlob(blob);
      setPdfType(type);
      setPdfUrl(url);

      // Generate public URL for WhatsApp sharing
      // Use GET endpoint to get the public URL
      try {
        const generateResponse = await axios.get(
          `${API_URL}/invoices/${type}/${booking?.id}`
        );
        const publicUrl = generateResponse.data.url;
        const fullUrl = generateResponse.data.fullUrl || `${API_URL.replace('/api', '')}${publicUrl}`;
        
        // Replace localhost with actual server IP if needed
        let shareableUrl = fullUrl;
        if (shareableUrl.includes('localhost') || shareableUrl.includes('127.0.0.1')) {
          // Try to get server IP from environment or use current hostname
          const serverIP = process.env.NEXT_PUBLIC_SERVER_IP || window.location.hostname;
          if (serverIP !== 'localhost' && serverIP !== '127.0.0.1') {
            shareableUrl = shareableUrl.replace(/localhost|127\.0\.0\.1/, serverIP);
          }
        }
        setPdfPublicUrl(shareableUrl);
      } catch (urlError) {
        // If GET fails, construct URL manually
        console.warn('Could not get public URL, constructing manually:', urlError);
        const baseUrl = API_URL.replace('/api', '');
        let shareableUrl = `${baseUrl}/uploads/${type}_${booking?.id}.pdf`;
        if (shareableUrl.includes('localhost') || shareableUrl.includes('127.0.0.1')) {
          const serverIP = process.env.NEXT_PUBLIC_SERVER_IP || window.location.hostname;
          if (serverIP !== 'localhost' && serverIP !== '127.0.0.1') {
            shareableUrl = shareableUrl.replace(/localhost|127\.0\.0\.1/, serverIP);
          }
        }
        setPdfPublicUrl(shareableUrl);
      }

      // Show preview modal based on type
      if (type === 'estimate') {
        setShowEstimate(true);
      } else if (type === 'invoice') {
        setShowInvoice(true);
      } else if (type === 'tax-invoice') {
        setShowTaxInvoice(true);
      }
    } catch (error: any) {
      console.error(`Error generating ${type}:`, error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      toast.error(`Error generating ${type}: ${errorMessage}`);
    }
  }

  function handleDownloadPdf() {
    if (!pdfBlob || !pdfType || !booking) return;
    
    const url = window.URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${pdfType}_${booking.id}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success('PDF downloaded successfully');
  }

  function formatPhoneNumber(phone: string): string | null {
    if (!phone) return null;
    
    // Remove all non-digits
    let phoneNumber = phone.replace(/\D/g, '');
    
    // Remove leading zeros
    phoneNumber = phoneNumber.replace(/^0+/, '');
    
    if (phoneNumber.length === 0) {
      return null;
    }
    
    // If it's exactly 10 digits and doesn't start with a country code, assume it's Indian
    if (phoneNumber.length === 10 && !phoneNumber.startsWith('91')) {
      phoneNumber = '91' + phoneNumber;
    }
    
    // Validate: WhatsApp requires phone numbers in E.164 format (7-15 digits, no leading zeros)
    if (phoneNumber.length < 7 || phoneNumber.length > 15 || phoneNumber[0] === '0') {
      return null;
    }
    
    return phoneNumber;
  }

  function handleShareWhatsApp(phoneType: 'customer' | 'alternate' | 'both' = 'customer') {
    if (!booking) {
      toast.warning('Booking information not available');
      return;
    }

    if (!pdfType || !booking.id) {
      toast.warning('Please generate the document first');
      return;
    }

    // Use the public URL that was generated when creating the PDF
    // This URL points directly to the PDF file, not through localhost
    let pdfDownloadLink = '';
    
    if (pdfPublicUrl) {
      // Use the stored public URL
      pdfDownloadLink = pdfPublicUrl;
    } else {
      // Fallback: construct URL from API_URL
      const baseUrl = API_URL.replace('/api', '');
      // Try to get server IP if using localhost
      if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
        if (typeof window !== 'undefined') {
          const hostname = window.location.hostname;
          const protocol = window.location.protocol;
          if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            pdfDownloadLink = `${protocol}//${hostname}:3001/uploads/${pdfType}_${booking.id}_*.pdf`;
          } else {
            toast.warning('Please configure your server IP for mobile access');
            pdfDownloadLink = `${baseUrl}/uploads/${pdfType}_${booking.id}.pdf`;
          }
        } else {
          pdfDownloadLink = `${baseUrl}/uploads/${pdfType}_${booking.id}.pdf`;
        }
      } else {
        pdfDownloadLink = `${baseUrl}/uploads/${pdfType}_${booking.id}.pdf`;
      }
    }
    
    const documentName = pdfType === 'estimate' ? 'Estimate' : pdfType === 'invoice' ? 'Invoice' : 'Tax Invoice';
    const message = `Hi ${booking.customer_name}, your ${documentName} for booking #${booking.id} is ready. Download PDF: ${pdfDownloadLink}`;

    const phoneNumbers: string[] = [];

    if (phoneType === 'customer' || phoneType === 'both') {
      const customerPhone = formatPhoneNumber(booking.customer_phone || '');
      if (customerPhone) {
        phoneNumbers.push(customerPhone);
      } else {
        toast.warning('Customer phone number is invalid');
        if (phoneType === 'customer') return;
      }
    }

    if (phoneType === 'alternate' || phoneType === 'both') {
      const alternatePhone = formatPhoneNumber(booking.alternate_phone || '');
      if (alternatePhone) {
        phoneNumbers.push(alternatePhone);
      } else {
        toast.warning('Alternate phone number is invalid');
        if (phoneType === 'alternate') return;
      }
    }

    if (phoneNumbers.length === 0) {
      toast.error('No valid phone numbers available');
      return;
    }

    // Open WhatsApp for each phone number
    phoneNumbers.forEach((phoneNumber, index) => {
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
      // Add small delay between opening multiple tabs
      setTimeout(() => {
        window.open(whatsappUrl, '_blank');
      }, index * 500);
    });

    setShowWhatsAppShareModal(false);
    toast.success(`Opening WhatsApp for ${phoneNumbers.length} number(s)...`);
  }

  async function handleShareEmail() {
    if (!booking?.customer_name) {
      toast.warning('Customer information not available');
      return;
    }

    if (!pdfPublicUrl) {
      toast.warning('PDF not generated yet. Please generate the document first.');
      return;
    }

    const documentName = pdfType === 'estimate' ? 'Estimate' : pdfType === 'invoice' ? 'Invoice' : 'Tax Invoice';
    
    // Prompt for customer email if not available
    let customerEmail = booking.customer_email || null;
    
    if (!customerEmail) {
      const emailInput = prompt(`Enter customer email address for ${booking.customer_name}:`);
      if (!emailInput || !emailInput.trim()) {
        toast.warning('Email address is required to send email');
        return;
      }
      customerEmail = emailInput.trim();
    }

    // Try to send email via backend API (with attachment support)
    try {
      const response = await axios.post(`${API_URL}/invoices/send-email`, {
        bookingId: booking.id,
        documentType: pdfType,
        customerName: booking.customer_name,
        customerEmail: customerEmail,
        pdfUrl: pdfPublicUrl
      });

      if (response.data.success) {
        toast.success('Email sent successfully with PDF attachment!');
        return;
      } else {
        throw new Error(response.data.error || 'Failed to send email');
      }
    } catch (error: any) {
      // Fallback to mailto if backend email fails or not configured
      const useMailto = error.response?.data?.useMailto || !error.response;
      
      if (useMailto) {
        // Construct email body with PDF download link
        const emailBody = `Hi ${booking.customer_name},\n\nPlease find your ${documentName} for booking #${booking.id} below.\n\nDownload PDF: ${pdfPublicUrl}\n\nNote: The PDF is available for download at the link above. Please download and attach it to this email if needed.\n\nThank you!`;
        
        const subject = encodeURIComponent(`${documentName} for Booking #${booking.id}`);
        const body = encodeURIComponent(emailBody);
        
        // Note: mailto protocol doesn't support file attachments
        // We include the download link in the body and pre-fill the recipient email
        const mailtoLink = `mailto:${customerEmail}?subject=${subject}&body=${body}`;
        
        window.location.href = mailtoLink;
        toast.info('Opening email client. The PDF download link is included in the email body. You can download and attach the PDF manually, or configure the email service to send automatically.');
      } else {
        toast.error(`Failed to send email: ${error.response?.data?.error || error.message}`);
      }
    }
  }

  function handleClosePreview() {
    // Clean up blob URL
    if (pdfUrl) {
      window.URL.revokeObjectURL(pdfUrl);
    }
    setShowEstimate(false);
    setShowInvoice(false);
    setShowTaxInvoice(false);
    setPdfBlob(null);
    setPdfType(null);
    setPdfUrl(null);
    setPdfPublicUrl(null);
  }

  function handleEditDate(product: any) {
    setSelectedProduct(product);
    setChangeDateFrom(product.booked_from?.split('T')[0] || '');
    setChangeDateTo(product.booked_to?.split('T')[0] || '');
    setDateChangeCharge(0);
    setShowChangeDateModal(true);
    
    // Fetch bookings for this product to show availability
    fetchProductBookingsForChange(product.id);
  }

  async function fetchProductBookingsForChange(productId: number) {
    try {
      const response = await bookingsApi.getByProductId(productId);
      // Filter out the current booking's dates
      const bookings = (response.data || []).filter((b: any) => b.id !== booking?.id);
      setProductBookingsForChange(bookings);
    } catch (error) {
      console.error('Error fetching product bookings:', error);
      setProductBookingsForChange([]);
    }
  }

  async function handleSaveDateChange() {
    if (!changeReason.trim()) {
      toast.warning('Please provide a reason for date change');
      return;
    }

    if (!changeDateFrom || !changeDateTo) {
      toast.warning('Please select both start and end dates');
      return;
    }

    try {
      // Store old dates before updating
      const oldFrom = selectedProduct.booked_from?.split('T')[0] || '';
      const oldTo = selectedProduct.booked_to?.split('T')[0] || '';
      const datesChanged = changeDateFrom !== oldFrom || changeDateTo !== oldTo;

      if (!datesChanged) {
        toast.info('No changes detected in dates');
        return;
      }

      // Calculate or use manual charge
      const finalCharge = dateChangeChargeSettings.charge_type === 'manual' 
        ? dateChangeCharge
        : calculateDateChangeCharge(oldFrom, oldTo, changeDateFrom, changeDateTo);
      
      console.log('Updating product dates:', {
        productId: selectedProduct.id,
        oldDates: { from: oldFrom, to: oldTo },
        newDates: { from: changeDateFrom, to: changeDateTo },
        charge: finalCharge
      });

      // Update booking with new product dates
      // The backend will automatically:
      // 1. Update booking_products table (releasing old dates, blocking new dates)
      // 2. Recalculate booking-level dates
      await bookingsApi.update(booking!.id, {
        products: [{
          id: selectedProduct.id,
          booked_from: changeDateFrom,
          booked_to: changeDateTo,
        }],
      });

      // Record the charge if any (as date_change_charge - does not affect payment calculations)
      if (finalCharge > 0) {
        await paymentTransactionsApi.create({
          booking_id: booking!.id,
          amount: finalCharge,
          type: 'date_change_charge',
          method: 'Manual',
          recorded_by: 'Salesman',
          notes: `Date change charge for ${selectedProduct.name} (${selectedProduct.code}): ${oldFrom} to ${oldTo} → ${changeDateFrom} to ${changeDateTo}. Reason: ${changeReason}`,
        });
      }

      // Store product ID before clearing state
      const updatedProductId = selectedProduct.id;

      toast.success('Booking date updated successfully! The calendar has been updated.');
      setShowChangeDateModal(false);
      setChangeReason('');
      setChangeDateFrom('');
      setChangeDateTo('');
      setDateChangeCharge(0);
      setSelectedProduct(null);
      
      // Refresh booking data to show updated dates and transactions
      await fetchBooking();
      
      // Refresh product bookings to update calendar availability
      // This will show the new dates as blocked and old dates as available
      await fetchProductBookingsForChange(updatedProductId);
    } catch (error) {
      console.error('Error updating booking date:', error);
      toast.error('Error updating booking date. Please try again.');
    }
  }

  function calculatePaymentBreakdown() {
    const amount = parseFloat(paymentAmount);
    
    // Calculate payment allocation
    const totalAmount = typeof booking?.total_amount === 'number' 
      ? booking.total_amount 
      : parseFloat(booking?.total_amount || '0') || 0;
    
    const securityDeposit = typeof booking?.security_deposit === 'number'
      ? booking.security_deposit
      : parseFloat(booking?.security_deposit || '0') || 0;
    
    const paidAmount = typeof booking?.paid_amount === 'number'
      ? booking.paid_amount
      : parseFloat(booking?.paid_amount || '0') || 0;

    // Calculate remaining rental amount due
    const rentalDue = totalAmount - paidAmount;
    
    // Calculate existing excess payment (if rental is already overpaid)
    const existingExcessPayment = Math.max(0, paidAmount - totalAmount);
    
    // Calculate remaining security deposit after accounting for existing excess payments
    const remainingSecurityDeposit = Math.max(0, securityDeposit - existingExcessPayment);

    // Allocate payment: first to rental, then to security deposit
    let remainingPayment = amount;
    let rentPayment = 0;
    let securityPayment = 0;
    let refund = 0;

    if (rentalDue > 0) {
      // Pay rental first
      rentPayment = Math.min(remainingPayment, rentalDue);
      remainingPayment -= rentPayment;
    }

    if (remainingPayment > 0) {
      // Pay security deposit with remaining amount (only from remaining security deposit)
      securityPayment = Math.min(remainingPayment, remainingSecurityDeposit);
      remainingPayment -= securityPayment;
    }

    if (remainingPayment > 0) {
      // Excess payment - refund to customer
      refund = remainingPayment;
    }

    // Calculate new due amounts
    const newRentalDue = rentalDue - rentPayment;
    // Total security due = remaining security deposit - new security payment
    const newSecurityDue = remainingSecurityDeposit - securityPayment;

    // Set breakdown for display
    setPaymentBreakdown({
      rentDue: newRentalDue <= 0 ? 'Fully Paid' : `₹${Math.floor(newRentalDue).toLocaleString('en-IN')}`,
      securityDepositDue: newSecurityDue <= 0 ? 'Fully Paid' : `₹${Math.floor(newSecurityDue).toLocaleString('en-IN')}`,
      refundToCustomer: refund,
    });
  }

  async function handleRecordPayment() {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.warning('Please enter a valid amount');
      return;
    }

    calculatePaymentBreakdown();
    setShowPaymentBreakdown(true);
  }

  async function confirmPaymentRecord() {
    const amount = parseFloat(paymentAmount);

    try {
      // Create payment transaction record
      await paymentTransactionsApi.create({
        booking_id: booking!.id,
        amount: amount,
        type: 'payment',
        method: 'Cash/UPI', // You can make this selectable later
        recorded_by: 'Salesman', // You can add salesman name later
        notes: 'Payment recorded from customer',
      });

      toast.success('Payment recorded successfully!');
      setShowRecordPayment(false);
      setShowPaymentBreakdown(false);
      setPaymentAmount('');
      
      // Update booking status based on payment (this will fetch fresh data)
      await updateBookingStatus();
      
      // Show measurement confirmation modal
      setShowMeasurementModal(true);
    } catch (error) {
      console.error('Error recording payment:', error);
      toast.error('Error recording payment');
    }
  }

  // Calculate booking status based on payments and refunds
  function calculateBookingStatus(): string {
    if (!booking) return 'pending';

    const totalAmount = typeof booking.total_amount === 'number'
      ? booking.total_amount
      : parseFloat(booking.total_amount || '0') || 0;
    const securityDeposit = typeof booking.security_deposit === 'number'
      ? booking.security_deposit
      : parseFloat(booking.security_deposit || '0') || 0;
    const paidAmount = typeof booking.paid_amount === 'number'
      ? booking.paid_amount
      : parseFloat(booking.paid_amount || '0') || 0;

    // Check if all products have refunds
    const products = Array.isArray(booking.products) ? booking.products : [];
    const refundTransactions = transactions.filter((t: any) => t.type === 'refund');
    
    // Create set of products with refunds
      const productsWithRefunds = new Set<number>();
      refundTransactions.forEach((transaction: any) => {
        const notes = transaction.notes || '';
        products.forEach((product: any) => {
          // First try exact pattern match: (CODE)
          if (notes.includes(`(${product.code})`)) {
            productsWithRefunds.add(product.id);
            return;
          }
          
          // If that doesn't match, try matching product name followed by code pattern
          const namePattern = new RegExp(`\\b${product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(${product.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i');
          if (namePattern.test(notes)) {
            productsWithRefunds.add(product.id);
            return;
          }
          
          // Last resort: check if product code appears as a whole word (not substring)
          const codePattern = new RegExp(`\\b${product.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (codePattern.test(notes) && notes.includes(product.name)) {
            productsWithRefunds.add(product.id);
          }
        });
      });
    
    // If all products have refunds, status is completed
    if (products.length > 0 && products.every((p: any) => productsWithRefunds.has(p.id))) {
      return 'completed';
    }

    // Check if Rent + Deposit is fully received
    const totalRequired = totalAmount + securityDeposit;
    const isFullyPaid = paidAmount >= totalRequired;

    if (isFullyPaid) {
      // Check if multiple products with different dates
      const products = Array.isArray(booking.products) ? booking.products : [];
      if (products.length > 1) {
        // Check if products have different dates
        const dates = products.map((p: any) => ({
          from: p.booked_from || booking.booked_from,
          to: p.booked_to || booking.booked_to
        }));
        
        const uniqueDates = new Set(dates.map((d: any) => `${d.from}-${d.to}`));
        if (uniqueDates.size > 1) {
          // Multiple products with different dates - Partially Completed
          return 'in_progress'; // Will display as "Partially Completed" or "Under Process"
        }
      }
      // All paid, single date or same dates - Under Process
      return 'in_progress';
    }

    // Check if any rental payment has been recorded
    const rentalDue = totalAmount - paidAmount;
    const hasRentalPayment = paidAmount > 0;

    if (hasRentalPayment) {
      // At least some rental payment recorded - Confirmed
      return 'confirmed';
    }

    // No payment recorded - Pending
    return 'pending';
  }

  // Update booking status in database
  async function updateBookingStatus() {
    if (!booking) return;

    try {
      // Fetch fresh booking and transaction data to ensure we have latest paid_amount
      const [bookingResponse, transactionsResponse] = await Promise.all([
        bookingsApi.getById(booking.id),
        paymentTransactionsApi.getByBookingId(booking.id),
      ]);
      
      const currentBooking = bookingResponse.data;
      const currentTransactions = transactionsResponse.data || [];
      
      // Recalculate status with latest data
      const totalAmount = typeof currentBooking.total_amount === 'number'
        ? currentBooking.total_amount
        : parseFloat(currentBooking.total_amount || '0') || 0;
      const securityDeposit = typeof currentBooking.security_deposit === 'number'
        ? currentBooking.security_deposit
        : parseFloat(currentBooking.security_deposit || '0') || 0;
      const paidAmount = typeof currentBooking.paid_amount === 'number'
        ? currentBooking.paid_amount
        : parseFloat(currentBooking.paid_amount || '0') || 0;

      // Check if all products have refunds
      const currentProducts = Array.isArray(currentBooking.products) ? currentBooking.products : [];
      const refundTransactions = currentTransactions.filter((t: any) => t.type === 'refund');
      
      const productsWithRefunds = new Set<number>();
      refundTransactions.forEach((transaction: any) => {
        const notes = transaction.notes || '';
        currentProducts.forEach((product: any) => {
          // First try exact pattern match: (CODE)
          if (notes.includes(`(${product.code})`)) {
            productsWithRefunds.add(product.id);
            return;
          }
          
          // If that doesn't match, try matching product name followed by code pattern
          const namePattern = new RegExp(`\\b${product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(${product.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i');
          if (namePattern.test(notes)) {
            productsWithRefunds.add(product.id);
            return;
          }
          
          // Last resort: check if product code appears as a whole word (not substring)
          const codePattern = new RegExp(`\\b${product.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (codePattern.test(notes) && notes.includes(product.name)) {
            productsWithRefunds.add(product.id);
          }
        });
      });
      
      const allProductsHaveRefunds = currentProducts.length > 0 && currentProducts.every((p: any) => productsWithRefunds.has(p.id));
      const hasAnyRefund = productsWithRefunds.size > 0;
      
      console.log('=== updateBookingStatus: Status Calculation ===');
      console.log('Current products:', currentProducts.length);
      console.log('Products with refunds:', productsWithRefunds.size);
      console.log('Product IDs:', currentProducts.map((p: any) => p.id));
      console.log('Products with refund IDs:', Array.from(productsWithRefunds));
      console.log('All products have refunds?', allProductsHaveRefunds);
      console.log('Has any refund?', hasAnyRefund);
      console.log('Current status:', currentBooking.status);
      
      const totalRequired = totalAmount + securityDeposit;
      const isFullyPaid = paidAmount >= totalRequired;
      const hasRentalPayment = paidAmount > 0;

      let newStatus = currentBooking.status;

      // Once refunds start, the order is in "refund phase" - status should only be determined by refund completion
      if (allProductsHaveRefunds) {
        console.log('Setting status to completed because all products have refunds');
        newStatus = 'completed';
      } else if (hasAnyRefund) {
        console.log('Setting status to in_progress because refunds are in progress');
        newStatus = 'in_progress'; // Refund phase - waiting for remaining refunds
      } else if (isFullyPaid) {
        const products = Array.isArray(currentBooking.products) ? currentBooking.products : [];
        if (products.length > 1) {
          const dates = products.map((p: any) => ({
            from: p.booked_from || currentBooking.booked_from,
            to: p.booked_to || currentBooking.booked_to
          }));
          const uniqueDates = new Set(dates.map((d: any) => `${d.from}-${d.to}`));
          if (uniqueDates.size > 1) {
            newStatus = 'in_progress'; // Partially Completed
          } else {
            newStatus = 'in_progress'; // Under Process
          }
        } else {
          newStatus = 'in_progress'; // Under Process
        }
      } else if (hasRentalPayment) {
        newStatus = 'confirmed';
      } else {
        newStatus = 'pending';
      }
      
      // Only update if status changed
      if (currentBooking.status !== newStatus) {
        await bookingsApi.update(currentBooking.id, {
          status: newStatus
        } as any);
        console.log(`Booking status updated from ${currentBooking.status} to ${newStatus}`);
        // Update local state with fresh booking data
        setBooking(currentBooking);
        setTransactions(currentTransactions);
      }
    } catch (error) {
      console.error('Error updating booking status:', error);
    }
  }

  // Measurement helper functions
  function handleMeasurementChange(productId: number, field: string, value: string) {
    // Remove any non-digit characters
    const numericValue = value.replace(/\D/g, '');
    
    // Check if more than 2 digits
    if (numericValue.length > 2) {
      const errorKey = `${productId}-${field}`;
      setMeasurementErrors({
        ...measurementErrors,
        [errorKey]: 'Please enter correct measurement (maximum 2 digits)',
      });
      return;
    }
    
    // Clear error if valid
    const errorKey = `${productId}-${field}`;
    setMeasurementErrors({
      ...measurementErrors,
      [errorKey]: '',
    });
    
    setMeasurements({
      ...measurements,
      [productId]: {
        ...measurements[productId],
        [field]: numericValue,
      },
    });
  }

  // Determine if product is female clothing (Lehenga, Gown, Girlish Crop Top)
  function isFemaleClothing(productName: string): boolean {
    const femaleTypes = ['Lehenga', 'Gown', 'Gowns', 'Girlish Crop Top'];
    return femaleTypes.some(type => productName.toLowerCase().includes(type.toLowerCase()));
  }

  // Determine if product is male clothing (Sherwani, Suit, Kurta Pajama, Indo Western)
  function isMaleClothing(productName: string): boolean {
    const maleTypes = ['Sherwani', 'Suit', 'Kurta Pajama', 'Indo Western'];
    return maleTypes.some(type => productName.toLowerCase().includes(type.toLowerCase()));
  }

  async function handleRecordRefund() {
    if (!booking) return;

    const products = Array.isArray(booking.products) ? booking.products : [];
    
    // Get selected items
    const selectedItems = products.filter((p: any) => itemRefunds[p.id]?.selected);
    
    if (selectedItems.length === 0) {
      toast.warning('Please select at least one item to refund');
      return;
    }

    // Validate each selected item
    for (const product of selectedItems) {
      const refundData = itemRefunds[product.id];
      if (!refundData) continue;

      const amount = parseFloat(refundData.amount);
    
    if (isNaN(amount) || amount <= 0) {
        toast.warning(`Please enter a valid refund amount for ${product.name}`);
      return;
    }

      // Get product security deposit
      const productSecurityDeposit = typeof product.security_deposit === 'number'
        ? product.security_deposit
        : parseFloat(product.security_deposit || '0') || 0;

      // Validate: refund cannot exceed product security deposit
      if (amount > productSecurityDeposit) {
        toast.error(`Refund amount for ${product.name} cannot exceed its security deposit of ₹${Math.floor(productSecurityDeposit).toLocaleString('en-IN')}`);
      return;
    }

      // If refund is less than product security deposit, notes are required
      if (amount < productSecurityDeposit && !refundData.notes.trim()) {
        toast.warning(`Please provide narration/notes for ${product.name} explaining why the refund is less than its security deposit`);
      return;
      }
    }

    try {
      // Create refund transactions for each selected item
      const refundPromises = selectedItems.map(async (product: any) => {
        const refundData = itemRefunds[product.id];
        const amount = parseFloat(refundData.amount);
        
        // IMPORTANT: Always include product name and code in notes for tracking
        // Format: "Refund for Product Name (CODE): user notes" or "Refund for Product Name (CODE)"
        const baseNotes = `Refund for ${product.name} (${product.code})`;
        const fullNotes = refundData.notes.trim() 
          ? `${baseNotes}: ${refundData.notes.trim()}` 
          : `${baseNotes} - ₹${Math.floor(amount).toLocaleString('en-IN')}`;
        
        return paymentTransactionsApi.create({
          booking_id: booking.id,
        amount: amount,
        type: 'refund',
        method: refundMethod,
          recorded_by: 'Salesman',
          notes: fullNotes,
        });
      });

      await Promise.all(refundPromises);

      // Close modal and reset form
      setShowRecordRefund(false);
      setItemRefunds({});
      setRefundMethod('Cash');
      
      // Refresh booking and transactions to get latest data
      // This will update the state and trigger re-render with new transactions
      await fetchBooking();
      
      // After state updates, calculate and update booking status
      // Use a small delay to ensure state has updated
      setTimeout(async () => {
      await updateBookingStatus();
      }, 100);
      
      toast.success('Refund(s) recorded successfully!');
    } catch (error) {
      console.error('Error recording refund:', error);
      toast.error('Error recording refund');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Booking not found</div>
      </div>
    );
  }

  const products = Array.isArray(booking.products) ? booking.products : [];
  
  // Helper function to determine which products have refunds
  function getProductsWithRefunds(): Set<number> {
    const productsWithRefunds = new Set<number>();
    const refundTransactions = transactions.filter((t: any) => t.type === 'refund');
    
    console.log('=== getProductsWithRefunds called ===');
    console.log('Total transactions:', transactions.length);
    console.log('Refund transactions:', refundTransactions.length);
    console.log('Products to check:', products.length);
    
    // Debug: log refund transactions
    if (refundTransactions.length > 0) {
      console.log('Refund transaction details:', refundTransactions.map((t: any) => ({ 
        id: t.id, 
        notes: t.notes,
        amount: t.amount 
      })));
    }
    
    refundTransactions.forEach((transaction: any) => {
      // Parse notes to extract product code
      // Format: "Refund of ₹X for Product Name (CODE)" or similar
      const notes = transaction.notes || '';
      console.log('Checking transaction notes:', notes);
      
      // Try to match product code in notes - use precise matching
      products.forEach((product: any) => {
        console.log(`  Testing product: ${product.id} (${product.name}, code: ${product.code})`);
        
        // First try exact pattern match: (CODE) - this is the most reliable
        if (notes.includes(`(${product.code})`)) {
          productsWithRefunds.add(product.id);
          console.log(`  ✓ Matched product ${product.id} (${product.name}) via exact code pattern (${product.code})`);
          return;
        }
        
        // If that doesn't match, try matching product name followed by code pattern
        // This handles cases where format might be slightly different
        const namePattern = new RegExp(`\\b${product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(${product.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'i');
        if (namePattern.test(notes)) {
          productsWithRefunds.add(product.id);
          console.log(`  ✓ Matched product ${product.id} (${product.name}) via name+code pattern`);
          return;
        }
        
        // Last resort: check if product code appears as a whole word (not substring) AND product name is present
        const codePattern = new RegExp(`\\b${product.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (codePattern.test(notes) && notes.includes(product.name)) {
          productsWithRefunds.add(product.id);
          console.log(`  ✓ Matched product ${product.id} (${product.name}) via code word boundary + name`);
        }
      });
    });
    
    console.log('Products with refunds (IDs):', Array.from(productsWithRefunds));
    console.log('=== End getProductsWithRefunds ===');
    return productsWithRefunds;
  }
  
  // Get set of product IDs that have refunds
  const productsWithRefunds = getProductsWithRefunds();
  
  // Check if all products have refunds (order is completed)
  const isOrderCompleted = products.length > 0 && products.every((p: any) => productsWithRefunds.has(p.id));
  const hasAnyRefund = productsWithRefunds.size > 0;
  const isPartiallyCompleted = hasAnyRefund && !isOrderCompleted;
  
  console.log('=== Order Completion Check ===');
  console.log('Total products:', products.length);
  console.log('Products with refunds:', productsWithRefunds.size);
  console.log('Product IDs:', products.map((p: any) => p.id));
  console.log('Products with refund IDs:', Array.from(productsWithRefunds));
  console.log('Is order completed?', isOrderCompleted);
  console.log('Is partially completed?', isPartiallyCompleted);
  console.log('=== End Order Completion Check ===');
  
  // Helper to check if a specific product has refund
  function hasProductRefund(productId: number): boolean {
    return productsWithRefunds.has(productId);
  }
  
  // Helper function to check if product's drop date has passed
  function isProductDropDatePassed(product: any): boolean {
    const dropDate = product.booked_to || booking.booked_to;
    if (!dropDate) return false;
    
    const drop = new Date(dropDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    drop.setHours(0, 0, 0, 0);
    
    return drop < today;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Back Button and Title */}
      <div className="flex items-center mb-8">
        <button
          onClick={() => router.back()}
          className="mr-4 text-gray-600 hover:text-gray-900"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
      </div>

      {/* Order Status Banner */}
      {isOrderCompleted && (
        <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-green-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-bold text-green-800">Order Completed</h3>
              <p className="text-sm text-green-700">All refunds have been processed. This order is now completed.</p>
            </div>
          </div>
        </div>
      )}
      
      {isPartiallyCompleted && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-yellow-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-bold text-yellow-800">Partially Completed</h3>
              <p className="text-sm text-yellow-700">Some items have been refunded. Complete remaining refunds to finalize this order.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-8">
        {/* Left Side - Product Cards */}
        <div className="col-span-2 space-y-4">
          {products.map((product: any, index: number) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-lg p-6 flex gap-6"
            >
              <div className="w-32 h-40 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                {(() => {
                  // Check if product has image field
                  const hasImage = product.image && product.image !== null && product.image !== '';
                  const imageUrl = hasImage ? getImageUrl(product.image) : null;
                  
                  if (imageUrl) {
                    return (
                      <img
                        src={imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error(`Failed to load image for ${product.name}:`, {
                            rawImage: product.image,
                            imageUrl: imageUrl
                          });
                          // Hide image and show placeholder
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-4xl">👔</span></div>';
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl">👔</span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-1">
                  {product.name}
                </h3>
                {product.code && (
                  <div className="flex items-center gap-2 mb-1">
                    {(() => {
                      const hasImage = product.image && product.image !== null && product.image !== '';
                      const imageUrl = hasImage ? getImageUrl(product.image) : null;
                      return imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.name}
                          className="w-5 h-5 object-cover rounded border border-gray-200"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : null;
                    })()}
                    <p className="text-xs text-gray-500 font-mono">Code: {product.code}</p>
                  </div>
                )}
                <p className="text-gray-600 mb-4">
                  ₹{Math.floor(product.rent_per_day || 0)} / Day
                </p>
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Dates:</p>
                    <p className="text-red-600 font-semibold">
                      {new Date(
                        product.booked_from || booking.booked_from
                      ).toLocaleDateString('en-GB')}{' '}
                      To{' '}
                      {new Date(
                        product.booked_to || booking.booked_to
                      ).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  {/* Hide edit button if product refund is completed */}
                  {!hasProductRefund(product.id) && (
                    <button
                      onClick={() => handleEditDate(product)}
                      className="ml-2 text-red-600 hover:text-red-700"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Measurements Button */}
                <div className="mt-4">
                  {hasProductRefund(product.id) || isProductDropDatePassed(product) ? (
                    <div className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-300 text-gray-600 cursor-not-allowed">
                      {hasProductRefund(product.id)
                        ? '📏 Measurements (Locked - Refund Completed)'
                        : '📏 Measurements (Locked)'}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setSelectedProductForMeasurements(product);
                        // Always load from the main measurements state (which includes unsaved edits)
                        const productMeasurements = measurements[product.id] || {};
                        const hasMeasurements = Object.keys(productMeasurements).length > 0;
                        
                        // If measurements exist, load them for editing
                        if (hasMeasurements) {
                          setEditingMeasurements(productMeasurements);
                          setEditingSpecialRequirements(specialRequirements[product.id] || '');
                          setIsEditingMeasurements(false); // Start in view mode
                        } else {
                          // No measurements - start in edit mode, but preserve any existing unsaved data
                          setEditingMeasurements(productMeasurements);
                          setEditingSpecialRequirements(specialRequirements[product.id] || '');
                          setIsEditingMeasurements(true);
                        }
                        setShowViewMeasurements(true);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        measurements[product.id] && Object.keys(measurements[product.id]).length > 0
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {measurements[product.id] && Object.keys(measurements[product.id]).length > 0
                        ? '📏 Measurements'
                        : '➕ Add Measurements'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Side - Actions and Details */}
        <div className="space-y-6">
          {/* Document Generation Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => handleGenerateDocument('estimate')}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              ESTIMATE
            </button>
            <button
              onClick={() => handleGenerateDocument('invoice')}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              INVOICE
            </button>
            <button
              onClick={() => handleGenerateDocument('tax-invoice')}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              TAX INVOICE
            </button>
          </div>

          {/* Customer Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Customer Details
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Name:</span>
                <span className="font-medium text-gray-900">
                  {booking.customer_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Phone Number:</span>
                <div className="text-right">
                  <p className="font-medium text-gray-900">
                    {booking.customer_phone}
                  </p>
                  {booking.alternate_phone && (
                    <p className="font-medium text-gray-900">
                      {booking.alternate_phone}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Address */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Delivery Address
            </h3>
            <div className="space-y-2">
              <p className="text-sm text-gray-900">
                {booking.customer_address || 'No address provided'}
              </p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Order Summary
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">
                  ₹{Math.floor(
                    typeof booking.total_amount === 'number' 
                      ? booking.total_amount 
                      : parseFloat(booking.total_amount) || 0
                  ).toLocaleString('en-IN')}
                </span>
              </div>
              {(() => {
                const isTransportationOpted = booking.transportation_opted === true || 
                                              booking.transportation_opted === 'true' || 
                                              booking.transportation_opted === 1;
                const transportationCharge = parseFloat(booking.other_charges || '0') || 0;
                
                if (isTransportationOpted) {
                  return (
                    <div className="flex justify-between items-center bg-teal-50 px-2 py-1 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-teal-700">Local Transportation</span>
                        <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-semibold">Opted</span>
                      </div>
                      <span className="text-sm text-teal-700 font-semibold">
                        ₹{Math.floor(transportationCharge).toLocaleString('en-IN')}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
              <div className="flex justify-between">
                <span className="text-gray-600">Security Deposit</span>
                <span className="font-medium">
                  ₹{Math.floor(
                    typeof booking.security_deposit === 'number'
                      ? booking.security_deposit
                      : parseFloat(booking.security_deposit) || 0
                  ).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-3">
                <span>Total</span>
                <span>
                  ₹
                  {(() => {
                    const totalAmount = typeof booking.total_amount === 'number'
                      ? booking.total_amount
                      : parseFloat(booking.total_amount) || 0;
                    const securityDeposit = typeof booking.security_deposit === 'number'
                      ? booking.security_deposit
                      : parseFloat(booking.security_deposit) || 0;
                    // Transportation is already included in totalAmount, don't add it again
                    const total = totalAmount + securityDeposit;
                    return isNaN(total) ? '0' : Math.floor(total).toLocaleString('en-IN');
                  })()}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Status */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Payment Status
            </h3>
            
            {/* Detailed Payment Breakdown - Show before refunds start */}
            {!hasAnyRefund && (() => {
              const totalAmountNum = typeof booking.total_amount === 'number'
                ? booking.total_amount
                : parseFloat(booking.total_amount) || 0;
              const securityDepositNum = typeof booking.security_deposit === 'number'
                ? booking.security_deposit
                : parseFloat(booking.security_deposit) || 0;
              const paidAmountNum = typeof booking.paid_amount === 'number'
                ? booking.paid_amount
                : parseFloat(booking.paid_amount) || 0;
              const totalRequired = totalAmountNum + securityDepositNum;
              const amountDue = totalRequired - paidAmountNum;
              
              return (
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-4">
                  <h4 className="text-sm font-bold text-blue-900 mb-3">💰 Payment Breakdown</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Rent Section */}
                    <div className="bg-white rounded-lg p-3 border border-blue-200 overflow-hidden">
                      <p className="text-xs text-gray-600 mb-2 leading-tight break-words">🏠 Rental Amount</p>
                      <div className="space-y-2">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 mb-0.5">Total Rent</span>
                          <span className="font-bold text-gray-900 text-sm break-words">₹{Math.floor(totalAmountNum).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex flex-col pt-1 border-t border-gray-200">
                          <span className="text-xs text-gray-500 mb-0.5">Rent Paid</span>
                          <span className="font-bold text-green-600 text-sm break-words">₹{Math.floor(Math.min(paidAmountNum, totalAmountNum)).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex flex-col pt-1 border-t border-gray-200">
                          <span className="text-xs text-gray-500 mb-0.5 font-semibold">Rent Due</span>
                          <span className={`font-bold text-sm break-words ${paidAmountNum >= totalAmountNum ? 'text-green-600' : 'text-red-600'}`}>
                            {paidAmountNum >= totalAmountNum ? 'Fully Paid' : `₹${Math.floor(Math.max(0, totalAmountNum - paidAmountNum)).toLocaleString('en-IN')}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Security Section */}
                    <div className="bg-white rounded-lg p-3 border border-blue-200 overflow-hidden">
                      <p className="text-xs text-gray-600 mb-2 leading-tight break-words">🔒 Security Deposit</p>
                      <div className="space-y-2">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 mb-0.5">Total Security</span>
                          <span className="font-bold text-gray-900 text-sm break-words">₹{Math.floor(securityDepositNum).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex flex-col pt-1 border-t border-gray-200">
                          <span className="text-xs text-gray-500 mb-0.5">Security Paid</span>
                          <span className="font-bold text-green-600 text-sm break-words">
                            ₹{Math.floor(Math.max(0, Math.min(securityDepositNum, paidAmountNum - totalAmountNum))).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="flex flex-col pt-1 border-t border-gray-200">
                          <span className="text-xs text-gray-500 mb-0.5 font-semibold">Security Due</span>
                          <span className={`font-bold text-sm break-words ${paidAmountNum >= totalRequired ? 'text-green-600' : 'text-red-600'}`}>
                            {paidAmountNum >= totalRequired ? 'Fully Paid' : `₹${Math.floor(Math.max(0, securityDepositNum - Math.max(0, paidAmountNum - totalAmountNum))).toLocaleString('en-IN')}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Total Summary */}
                    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-3 border border-purple-200 overflow-hidden">
                      <p className="text-xs text-gray-600 mb-2 leading-tight break-words">📊 Total Summary</p>
                      <div className="space-y-2">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 mb-0.5">Grand Total</span>
                          <span className="font-bold text-gray-900 text-sm break-words">₹{Math.floor(totalRequired).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex flex-col pt-1 border-t border-purple-200">
                          <span className="text-xs text-gray-500 mb-0.5">Amount Paid</span>
                          <span className="font-bold text-green-600 text-sm break-words">₹{Math.floor(paidAmountNum).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex flex-col pt-1 border-t border-purple-200">
                          <span className="text-xs text-gray-500 mb-0.5 font-semibold">Balance Due</span>
                          <span className={`font-bold text-sm break-words ${amountDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {amountDue > 0 ? `₹${Math.floor(amountDue).toLocaleString('en-IN')}` : 'Fully Paid'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Simple view - just show key info */}
            <div className="space-y-3">
              {/* Amount Paid */}
              <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <span className="text-gray-600">Amount Paid:</span>
                <span className="font-bold text-green-600 text-lg">
                  ₹{Math.floor(
                    typeof booking.paid_amount === 'number'
                      ? booking.paid_amount
                      : parseFloat(booking.paid_amount) || 0
                  ).toLocaleString('en-IN')}
                </span>
              </div>

              {/* Rental Due */}
              <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                <span className="text-gray-600">Due Rent:</span>
                {(() => {
                  const totalAmount = typeof booking.total_amount === 'number'
                    ? booking.total_amount
                    : parseFloat(booking.total_amount) || 0;
                  const paidAmount = typeof booking.paid_amount === 'number'
                    ? booking.paid_amount
                    : parseFloat(booking.paid_amount) || 0;
                  const rentalDue = totalAmount - paidAmount;
                  
                  if (rentalDue <= 0) {
                    return <span className="font-bold text-green-600 text-lg">Fully Paid</span>;
                  } else {
                    return <span className="font-bold text-red-600 text-lg">₹{Math.floor(rentalDue).toLocaleString('en-IN')}</span>;
                  }
                })()}
              </div>

              {/* Security Deposit Due - Only show if rental is fully paid */}
              {(() => {
                const hasRefund = transactions.some((t: any) => t.type === 'refund');
                const totalAmount = typeof booking.total_amount === 'number'
                  ? booking.total_amount
                  : parseFloat(booking.total_amount) || 0;
                const paidAmount = typeof booking.paid_amount === 'number'
                  ? booking.paid_amount
                  : parseFloat(booking.paid_amount) || 0;
                const rentalDue = totalAmount - paidAmount;
                
                if (rentalDue <= 0) {
                  // Calculate remaining security for products without refunds (same logic as "Remaining to Refund")
                  const remainingSecurity = products
                    .filter((p: any) => !productsWithRefunds.has(p.id))
                    .reduce((sum: number, p: any) => {
                      const productSecurity = typeof p.security_deposit === 'number'
                        ? p.security_deposit
                        : parseFloat(String(p.security_deposit || '0')) || 0;
                      return sum + productSecurity;
                    }, 0);
                  
                  return (
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <span className="text-gray-600">Security Deposit Due:</span>
                      {isOrderCompleted ? (
                        <span className="font-bold text-blue-600 text-lg">All Refunded</span>
                      ) : isPartiallyCompleted ? (
                        <span className="font-bold text-yellow-600 text-lg">₹{Math.floor(remainingSecurity).toLocaleString('en-IN')}</span>
                      ) : remainingSecurity <= 0 ? (
                        <span className="font-bold text-green-600 text-lg">Fully Paid</span>
                      ) : (
                        <span className="font-bold text-red-600 text-lg">₹{Math.floor(remainingSecurity).toLocaleString('en-IN')}</span>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Balance/Overpayment warning */}
              {(() => {
                const totalAmount = typeof booking.total_amount === 'number'
                  ? booking.total_amount
                  : parseFloat(booking.total_amount) || 0;
                const securityDeposit = typeof booking.security_deposit === 'number'
                  ? booking.security_deposit
                  : parseFloat(booking.security_deposit) || 0;
                
                // Recalculate paid amount from transactions, excluding date change charges
                const paidAmountFromTransactions = transactions.reduce((sum: number, t: any) => {
                  // Exclude date_change_charge type
                  if (t.type === 'date_change_charge') return sum;
                  
                  // Also exclude transactions with date change notes (handles old transactions)
                  const notes = (t.notes || '').toLowerCase();
                  if (notes.includes('date change charge') || 
                      notes.includes('date change') || 
                      notes.includes('modify booking') ||
                      notes.includes('booking date change')) {
                    return sum;
                  }
                  
                  const amount = typeof t.amount === 'number' ? t.amount : parseFloat(String(t.amount || '0')) || 0;
                  return sum + (t.type === 'refund' ? -amount : amount);
                }, 0);
                
                const paidAmount = paidAmountFromTransactions;
                const totalRequired = totalAmount + securityDeposit;
                const overpayment = paidAmount - totalRequired;
                
                if (overpayment > 0) {
                  return (
                    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mt-2">
                      <div className="flex items-start">
                        <svg className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <p className="font-bold text-yellow-800 text-sm">Overpayment</p>
                          <p className="text-yellow-700 text-sm">
                            Refund <span className="font-bold">₹{Math.floor(overpayment).toLocaleString('en-IN')}</span> to customer
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Check if refund exists */}
          {(() => {
            const hasRefund = transactions.some((t: any) => t.type === 'refund');
            const totalAmount = typeof booking.total_amount === 'number'
              ? booking.total_amount
              : parseFloat(booking.total_amount || '0') || 0;
            const paidAmount = typeof booking.paid_amount === 'number'
              ? booking.paid_amount
              : parseFloat(booking.paid_amount || '0') || 0;
            const securityDeposit = typeof booking.security_deposit === 'number'
              ? booking.security_deposit
              : parseFloat(booking.security_deposit || '0') || 0;
            
            const rentalDue = totalAmount - paidAmount;
            const totalDue = rentalDue + securityDeposit;
            // Once refunds exist, payment phase is complete - we're now in refund/return phase
            const isFullyPaid = hasAnyRefund ? true : (totalDue <= 0);
            
            // Show status based on refund completion
            if (isOrderCompleted) {
              return (
                <div className="space-y-4">
                  {/* Order Completed Status */}
                  <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 text-center">
                    <div className="flex items-center justify-center mb-2">
                      <svg className="w-8 h-8 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-2xl font-bold text-green-600">Order Completed</h3>
                    </div>
                    <p className="text-green-700">
                      All refunds have been processed. This order is now completed.
                    </p>
                  </div>

                  {/* Detailed Refund Breakdown with Charges */}
                  {(() => {
                    const refundTransactions = transactions.filter((t: any) => t.type === 'refund');
                    if (refundTransactions.length === 0) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Refund Details</h3>
                      <div className="space-y-3">
                        {transactions.filter((t: any) => t.type === 'refund').map((refund: any) => {
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
                            <div key={refund.id} className="bg-green-50 border border-green-200 rounded-lg p-4">
                              {matchedProduct ? (
                                <div>
                                  <p className="text-sm font-semibold text-gray-900 mb-2">
                                    {matchedProduct.name} ({matchedProduct.code})
                                  </p>
                                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                                    <div className="bg-blue-50 p-2 rounded">
                                      <p className="text-gray-600">Security Deposit</p>
                                      <p className="font-bold text-blue-600">
                                        ₹{Math.floor(matchedProduct.security_deposit).toLocaleString('en-IN')}
                                      </p>
                                    </div>
                                    <div className="bg-green-50 p-2 rounded">
                                      <p className="text-gray-600">Refunded</p>
                                      <p className="font-bold text-green-600">
                                        ₹{Math.floor(refundAmount).toLocaleString('en-IN')}
                                      </p>
                                    </div>
                                    {chargesDeducted > 0 && (
                                      <div className="bg-red-50 p-2 rounded">
                                        <p className="text-gray-600">Charges Deducted</p>
                                        <p className="font-bold text-red-600">
                                          -₹{Math.floor(chargesDeducted).toLocaleString('en-IN')}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mb-1">
                                    {new Date(refund.created_at).toLocaleDateString('en-IN', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })} • {refund.method || refund.payment_method || 'N/A'} • by {refund.recorded_by}
                                  </p>
                                  {refund.notes && (
                                    <div className="bg-white border-l-3 border-l-green-500 pl-3 py-2 mt-2">
                                      <p className="text-xs font-semibold text-green-800 mb-1">
                                        {chargesDeducted > 0 ? '💬 Reason for deduction:' : '💬 Notes:'}
                                      </p>
                                      <p className="text-sm text-gray-700">{refund.notes}</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    Refunded: ₹{Math.floor(refundAmount).toLocaleString('en-IN')}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(refund.created_at).toLocaleDateString('en-IN')} • {refund.method || refund.payment_method || 'N/A'}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })()}

                  {/* Transaction History */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
                    {transactions.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No transactions recorded</p>
                    ) : (
                      <div className="space-y-4">
                        {/* Regular Transactions (payments, refunds, adjustments) */}
                        {transactions.filter((t: any) => t.type !== 'date_change_charge').length > 0 && (
                          <div className="space-y-3">
                            {transactions
                              .filter((t: any) => t.type !== 'date_change_charge')
                              .map((transaction: any) => (
                                <div
                                  key={transaction.id}
                                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                                          transaction.type === 'payment'
                                            ? 'text-green-600 bg-green-50'
                                            : transaction.type === 'refund'
                                            ? 'text-red-600 bg-red-50'
                                            : 'text-blue-600 bg-blue-50'
                                        }`}>
                                          {transaction.type}
                                        </span>
                                        <span className="text-sm text-gray-600">
                                          {new Date(transaction.created_at).toLocaleDateString('en-IN', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      </div>
                                      <p className="text-sm text-gray-600 mb-1">
                                        <span className="font-medium">Method:</span> {transaction.method || transaction.payment_method || 'N/A'}
                                      </p>
                                      {transaction.notes && (
                                        <p className="text-sm text-gray-600">
                                          <span className="font-medium">Notes:</span> {transaction.notes}
                                        </p>
                                      )}
                                      <p className="text-xs text-gray-500 mt-2">
                                        Recorded by: {transaction.recorded_by || 'N/A'}
                                      </p>
                                    </div>
                                    <div className="text-right ml-4">
                                      <p className={`text-lg font-bold ${
                                        transaction.type === 'refund' ? 'text-red-600' : 'text-green-600'
                                      }`}>
                                        {transaction.type === 'refund' ? '-' : '+'}₹{Math.floor(parseFloat(transaction.amount || '0')).toLocaleString('en-IN')}
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
                                .map((transaction: any) => (
                                  <div
                                    key={transaction.id}
                                    className="border border-purple-200 rounded-lg p-4 hover:bg-purple-50 transition-colors bg-purple-50/30"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="px-2 py-1 rounded text-xs font-semibold uppercase text-purple-600 bg-purple-50">
                                            Date Change Charge
                                          </span>
                                          <span className="text-sm text-gray-600">
                                            {new Date(transaction.created_at).toLocaleDateString('en-IN', {
                                              year: 'numeric',
                                              month: 'short',
                                              day: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                        <p className="text-sm text-gray-600 mb-1">
                                          <span className="font-medium">Method:</span> {transaction.method || transaction.payment_method || 'N/A'}
                                        </p>
                                        {transaction.notes && (
                                          <p className="text-sm text-gray-700 mb-2">
                                            <span className="font-medium">Notes:</span> {transaction.notes}
                                          </p>
                                        )}
                                        <p className="text-xs text-gray-500">
                                          Recorded by: {transaction.recorded_by || 'N/A'}
                                        </p>
                                      </div>
                                      <div className="text-right ml-4">
                                        <p className="text-lg font-bold text-purple-700">
                                          +₹{Math.floor(parseFloat(transaction.amount || '0')).toLocaleString('en-IN')}
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
                </div>
              );
            }
            
            // Partially completed - some refunds done but not all
            if (isPartiallyCompleted) {
              return (
                <div className="space-y-4">
                  {/* Partially Completed Status */}
                  <div className="bg-yellow-50 border-2 border-yellow-500 rounded-lg p-6 text-center">
                    <div className="flex items-center justify-center mb-2">
                      <svg className="w-8 h-8 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <h3 className="text-2xl font-bold text-yellow-600">Partially Completed</h3>
                    </div>
                    <p className="text-yellow-700">
                      Some items have been refunded. Complete remaining refunds to finalize this order.
                    </p>
                  </div>

                  {/* Security Deposit Summary */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Deposit Status</h3>
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <span className="text-gray-600">Total Security Deposit:</span>
                      <span className="font-bold text-gray-900 text-lg">₹{Math.floor(securityDeposit).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between items-center pt-3">
                      <span className="text-gray-600">Remaining to Refund:</span>
                      <span className="font-bold text-yellow-600 text-lg">
                        ₹{(() => {
                          // Calculate remaining security for products without refunds
                          const remainingSecurity = products
                            .filter((p: any) => !productsWithRefunds.has(p.id))
                            .reduce((sum: number, p: any) => {
                              const productSecurity = typeof p.security_deposit === 'number'
                                ? p.security_deposit
                                : parseFloat(String(p.security_deposit || '0')) || 0;
                              return sum + productSecurity;
                            }, 0);
                          return Math.floor(remainingSecurity).toLocaleString('en-IN');
                        })()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-xs text-gray-500">Items pending refund:</span>
                      <span className="text-xs text-gray-600">
                        {products.length - productsWithRefunds.size} of {products.length}
                      </span>
                    </div>
                  </div>

                  {/* Detailed Refund Breakdown with Charges */}
                  {transactions.filter((t: any) => t.type === 'refund').length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Refund Details</h3>
                      <div className="space-y-3">
                        {transactions.filter((t: any) => t.type === 'refund').map((refund: any) => {
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
                            <div key={refund.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                              {matchedProduct ? (
                                <div>
                                  <p className="text-sm font-semibold text-gray-900 mb-2">
                                    {matchedProduct.name} ({matchedProduct.code})
                                  </p>
                                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                                    <div className="bg-blue-50 p-2 rounded">
                                      <p className="text-gray-600">Security Deposit</p>
                                      <p className="font-bold text-blue-600">
                                        ₹{Math.floor(matchedProduct.security_deposit).toLocaleString('en-IN')}
                                      </p>
                                    </div>
                                    <div className="bg-green-50 p-2 rounded">
                                      <p className="text-gray-600">Refunded</p>
                                      <p className="font-bold text-green-600">
                                        ₹{Math.floor(refundAmount).toLocaleString('en-IN')}
                                      </p>
                                    </div>
                                    {chargesDeducted > 0 && (
                                      <div className="bg-red-50 p-2 rounded">
                                        <p className="text-gray-600">Charges Deducted</p>
                                        <p className="font-bold text-red-600">
                                          -₹{Math.floor(chargesDeducted).toLocaleString('en-IN')}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mb-1">
                                    {new Date(refund.created_at).toLocaleDateString('en-IN', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })} • {refund.method || 'N/A'} • by {refund.recorded_by}
                                  </p>
                                  {refund.notes && (
                                    <div className="bg-white border-l-3 border-l-yellow-500 pl-3 py-2 mt-2">
                                      <p className="text-xs font-semibold text-yellow-800 mb-1">
                                        {chargesDeducted > 0 ? '💬 Reason for deduction:' : '💬 Notes:'}
                                      </p>
                                      <p className="text-sm text-gray-700">{refund.notes}</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    Refunded: ₹{Math.floor(refundAmount).toLocaleString('en-IN')}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(refund.created_at).toLocaleDateString('en-IN')} • {refund.method || 'N/A'}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Record Refund Button */}
                  <button
                    onClick={() => setShowRecordRefund(true)}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    Complete Remaining Refunds
                  </button>

                  {/* Transaction History */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
                    {transactions.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No transactions recorded</p>
                    ) : (
                      <div className="space-y-4">
                        {/* Regular Transactions (payments, refunds, adjustments) */}
                        {transactions.filter((t: any) => t.type !== 'date_change_charge').length > 0 && (
                          <div className="space-y-3">
                            {transactions
                              .filter((t: any) => t.type !== 'date_change_charge')
                              .map((transaction: any) => (
                                <div
                                  key={transaction.id}
                                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                                          transaction.type === 'payment'
                                            ? 'text-green-600 bg-green-50'
                                            : transaction.type === 'refund'
                                            ? 'text-red-600 bg-red-50'
                                            : 'text-blue-600 bg-blue-50'
                                        }`}>
                                          {transaction.type}
                                        </span>
                                        <span className="text-sm text-gray-600">
                                          {new Date(transaction.created_at).toLocaleDateString('en-IN', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-4 mb-2">
                                        <span className={`text-lg font-bold ${
                                          transaction.type === 'payment' ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                          {transaction.type === 'refund' ? '-' : '+'}₹{Math.floor(
                                            typeof transaction.amount === 'number'
                                              ? transaction.amount
                                              : parseFloat(transaction.amount || '0')
                                          ).toLocaleString('en-IN')}
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
                                .map((transaction: any) => (
                                  <div
                                    key={transaction.id}
                                    className="border border-purple-200 rounded-lg p-4 hover:bg-purple-50 transition-colors bg-purple-50/30"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="px-2 py-1 rounded text-xs font-semibold uppercase text-purple-600 bg-purple-50">
                                            Date Change Charge
                                          </span>
                                          <span className="text-sm text-gray-600">
                                            {new Date(transaction.created_at).toLocaleDateString('en-IN', {
                                              year: 'numeric',
                                              month: 'short',
                                              day: 'numeric',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                            })}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-4 mb-2">
                                          <span className="text-lg font-bold text-purple-700">
                                            +₹{Math.floor(
                                              typeof transaction.amount === 'number'
                                                ? transaction.amount
                                                : parseFloat(transaction.amount || '0')
                                            ).toLocaleString('en-IN')}
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
                </div>
              );
            }

            // No refund yet - show payment/refund buttons
            return (
              <div className="space-y-4">
                {!isFullyPaid ? (
                  <button
                    onClick={() => setShowRecordPayment(true)}
                    className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
                  >
                    RECORD PAYMENT
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setShowRecordRefund(true)}
                      className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
                    >
                      RECORD REFUND
                    </button>
                    <p className="text-xs text-gray-500 text-center">
                      Maximum refund: ₹{Math.floor(securityDeposit).toLocaleString('en-IN')} (Security Deposit)
                    </p>
                  </>
                )}

                {/* Transaction History - Show even when no refunds */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment History</h3>
                  {transactions.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No transactions recorded</p>
                  ) : (
                    <div className="space-y-4">
                      {/* Regular Transactions (payments, refunds, adjustments) */}
                      {transactions.filter((t: any) => t.type !== 'date_change_charge').length > 0 && (
                        <div className="space-y-3">
                          {transactions
                            .filter((t: any) => t.type !== 'date_change_charge')
                            .map((transaction: any) => (
                              <div
                                key={transaction.id}
                                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                                        transaction.type === 'payment'
                                          ? 'text-green-600 bg-green-50'
                                          : transaction.type === 'refund'
                                          ? 'text-red-600 bg-red-50'
                                          : 'text-blue-600 bg-blue-50'
                                      }`}>
                                        {transaction.type}
                                      </span>
                                      <span className="text-sm text-gray-600">
                                        {new Date(transaction.created_at).toLocaleDateString('en-IN', {
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-1">
                                      <span className="font-medium">Method:</span> {transaction.method || transaction.payment_method || 'N/A'}
                                    </p>
                                    {transaction.notes && (
                                      <p className="text-sm text-gray-600">
                                        <span className="font-medium">Notes:</span> {transaction.notes}
                                      </p>
                                    )}
                                    <p className="text-xs text-gray-500 mt-2">
                                      Recorded by: {transaction.recorded_by || 'N/A'}
                                    </p>
                                  </div>
                                  <div className="text-right ml-4">
                                    <p className={`text-lg font-bold ${
                                      transaction.type === 'refund' ? 'text-red-600' : 'text-green-600'
                                    }`}>
                                      {transaction.type === 'refund' ? '-' : '+'}₹{Math.floor(parseFloat(transaction.amount || '0')).toLocaleString('en-IN')}
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
                              .map((transaction: any) => (
                                <div
                                  key={transaction.id}
                                  className="border border-purple-200 rounded-lg p-4 hover:bg-purple-50 transition-colors bg-purple-50/30"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className="px-2 py-1 rounded text-xs font-semibold uppercase text-purple-600 bg-purple-50">
                                          Date Change Charge
                                        </span>
                                        <span className="text-sm text-gray-600">
                                          {new Date(transaction.created_at).toLocaleDateString('en-IN', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                      </div>
                                      <p className="text-sm text-gray-600 mb-1">
                                        <span className="font-medium">Method:</span> {transaction.method || transaction.payment_method || 'N/A'}
                                      </p>
                                      {transaction.notes && (
                                        <p className="text-sm text-gray-700 mb-2">
                                          <span className="font-medium">Notes:</span> {transaction.notes}
                                        </p>
                                      )}
                                      <p className="text-xs text-gray-500">
                                        Recorded by: {transaction.recorded_by || 'N/A'}
                                      </p>
                                    </div>
                                    <div className="text-right ml-4">
                                      <p className="text-lg font-bold text-purple-700">
                                        +₹{Math.floor(parseFloat(transaction.amount || '0')).toLocaleString('en-IN')}
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
              </div>
            );
          })()}
        </div>
      </div>

      {/* PDF Preview Modal - Unified for Estimate, Invoice, and Tax Invoice */}
      {(showEstimate || showInvoice || showTaxInvoice) && pdfUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[95vh] flex flex-col">
            {/* Header with Title and Actions */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  {pdfType === 'estimate' ? 'Estimate' : pdfType === 'invoice' ? 'Invoice' : 'Tax Invoice'}
                </h2>
                <div className="flex items-center gap-3">
                  {/* Download Button */}
                  <button
                    onClick={handleDownloadPdf}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    title="Download PDF"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download
                  </button>
                  
                  {/* WhatsApp Share Button */}
                  <button
                    onClick={() => setShowWhatsAppShareModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    title="Share via WhatsApp"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                    WhatsApp
                  </button>
                  
                  {/* Email Share Button */}
                  <button
                    onClick={handleShareEmail}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    title="Share via Email"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    Email
                  </button>
                  
                  {/* Close Button */}
                  <button
                    onClick={handleClosePreview}
                    className="text-gray-600 hover:text-gray-900 p-2"
                    title="Close"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* PDF Preview */}
            <div className="flex-1 overflow-hidden p-6">
              <div className="w-full h-full border border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full min-h-[600px]"
                  title={`${pdfType} preview`}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Share Options Modal */}
      {showWhatsAppShareModal && booking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Share via WhatsApp</h2>
              <button
                onClick={() => setShowWhatsAppShareModal(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Choose which phone number(s) to share the {pdfType === 'estimate' ? 'Estimate' : pdfType === 'invoice' ? 'Invoice' : 'Tax Invoice'} to:
            </p>

            <div className="space-y-3">
              {/* Customer Phone Option */}
              {booking.customer_phone && (
                <button
                  onClick={() => handleShareWhatsApp('customer')}
                  className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-left flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">Customer Phone</div>
                    <div className="text-sm text-green-100">{booking.customer_phone}</div>
                  </div>
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </button>
              )}

              {/* Alternate Phone Option */}
              {booking.alternate_phone && (
                <button
                  onClick={() => handleShareWhatsApp('alternate')}
                  className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-left flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold">Alternate Phone</div>
                    <div className="text-sm text-green-100">{booking.alternate_phone}</div>
                  </div>
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </button>
              )}

              {/* Both Numbers Option */}
              {booking.customer_phone && booking.alternate_phone && (
                <button
                  onClick={() => handleShareWhatsApp('both')}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-left flex items-center justify-between border-2 border-green-500"
                >
                  <div>
                    <div className="font-semibold">Both Numbers</div>
                    <div className="text-sm text-green-100">Customer & Alternate</div>
                  </div>
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                  </svg>
                </button>
              )}

              {!booking.customer_phone && !booking.alternate_phone && (
                <div className="text-center py-4 text-gray-500">
                  No phone numbers available for this booking
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Change Date Modal */}
      {showChangeDateModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full p-8">
            <div className="flex items-center mb-8">
              <button
                onClick={() => {
                  setShowChangeDateModal(false);
                  setDateChangeCharge(0);
                }}
                className="mr-4 text-gray-600 hover:text-gray-900"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h2 className="text-3xl font-bold text-gray-900">
                Change Booking Date
              </h2>
            </div>

            {/* Product Card */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 flex gap-6 mb-6">
              <div className="w-32 h-40 bg-gray-100 rounded-lg overflow-hidden">
                {(() => {
                  const hasImage = selectedProduct.image && selectedProduct.image !== null && selectedProduct.image !== '';
                  const imageUrl = hasImage ? getImageUrl(selectedProduct.image) : null;
                  
                  if (imageUrl) {
                    return (
                      <img
                        src={imageUrl}
                        alt={selectedProduct.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><span class="text-4xl">👔</span></div>';
                          }
                        }}
                      />
                    );
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl">👔</span>
                    </div>
                  );
                })()}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-1">
                  {selectedProduct.name}
                </h3>
                {selectedProduct.code && (
                  <p className="text-xs text-gray-500 font-mono mb-1">Code: {selectedProduct.code}</p>
                )}
                <p className="text-gray-600 mb-4">
                  ₹{Math.floor(selectedProduct.rent_per_day || 0)} / Day
                </p>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Dates:</p>
                  <p className="text-red-600 font-semibold">
                    {new Date(changeDateFrom).toLocaleDateString('en-GB')} To{' '}
                    {new Date(changeDateTo).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>
            </div>

            {/* Check Availability */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Check Availability
              </h3>
              <DateRangePicker
                label=""
                startDate={changeDateFrom}
                endDate={changeDateTo}
                onStartDateChange={(date) => setChangeDateFrom(date)}
                onEndDateChange={(date) => setChangeDateTo(date)}
                bookings={productBookingsForChange}
                productName={selectedProduct.name}
                minDate={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Reason for change */}
            <div className="mb-6">
              <label className="block text-sm text-gray-700 mb-2">
                Reason for date change*
              </label>
              <input
                type="text"
                placeholder="Enter"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Date Change Charge - Show when dates are changed */}
            {changeDateFrom && changeDateTo && (changeDateFrom !== selectedProduct.booked_from?.split('T')[0] || changeDateTo !== selectedProduct.booked_to?.split('T')[0]) && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
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
                        selectedProduct.booked_from?.split('T')[0] || '',
                        selectedProduct.booked_to?.split('T')[0] || '',
                        changeDateFrom,
                        changeDateTo
                      ).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {dateChangeChargeSettings.charge_type === 'manual' 
                    ? 'Enter the charge amount manually'
                    : dateChangeChargeSettings.charge_type === 'fixed'
                    ? `Fixed charge: ₹${dateChangeChargeSettings.fixed_amount.toLocaleString('en-IN')}`
                    : `Variable charge: ₹${dateChangeChargeSettings.variable_per_day.toLocaleString('en-IN')} per day changed`}
                </p>
              </div>
            )}

            <button
              onClick={handleSaveDateChange}
              className="w-full max-w-sm mx-auto block px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              SAVE
            </button>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showRecordPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-8">
            <div className="flex items-center mb-8">
              <button
                onClick={() => {
                  setShowRecordPayment(false);
                  setShowPaymentBreakdown(false);
                  setPaymentAmount('');
                }}
                className="mr-4 text-gray-600 hover:text-gray-900"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <h2 className="text-3xl font-bold text-gray-900">Record Payment</h2>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-700 mb-2">
                Enter Amount(in Rs.)*
              </label>
              <input
                type="number"
                placeholder="Enter"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {!showPaymentBreakdown ? (
              <button
                onClick={handleRecordPayment}
                className="w-full max-w-sm mx-auto block px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
              >
                CALCULATE
              </button>
            ) : (
              <div>
                {/* Payment Breakdown */}
                <div className="bg-gray-50 rounded-lg p-6 mb-6 border border-gray-200">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Breakdown</h3>
                  
                  <div className="space-y-4">
                    {/* Rental Due Status */}
                    <div className="flex justify-between items-center py-3 border-b border-gray-200">
                      <span className="text-gray-700 font-medium">Due Rent:</span>
                      <span className={`font-bold text-lg ${
                        paymentBreakdown.rentDue === 'Fully Paid' 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        {paymentBreakdown.rentDue}
                      </span>
                    </div>

                    {/* Security Deposit Due Status - Only show if rental is fully paid */}
                    {paymentBreakdown.rentDue === 'Fully Paid' && (
                      <div className="flex justify-between items-center py-3 border-b border-gray-200">
                        <span className="text-gray-700 font-medium">Security Deposit Due:</span>
                        <span className={`font-bold text-lg ${
                          paymentBreakdown.securityDepositDue === 'Fully Paid' 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {paymentBreakdown.securityDepositDue}
                        </span>
                      </div>
                    )}

                    {/* Refund to Customer */}
                    {paymentBreakdown.refundToCustomer > 0 && (
                      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mt-4">
                        <div className="flex items-start">
                          <svg className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div>
                            <p className="font-bold text-yellow-800 mb-1">Overpayment Detected</p>
                            <p className="text-yellow-700">
                              Please pay <span className="font-bold">₹{Math.floor(paymentBreakdown.refundToCustomer).toLocaleString('en-IN')}</span> to customer
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Confirm Button */}
                <button
                  onClick={confirmPaymentRecord}
                  className="w-full max-w-sm mx-auto block px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition-colors"
                >
                  CONFIRM & SAVE
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Record Refund Modal */}
      {showRecordRefund && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-8 sticky top-0 bg-white pb-4 border-b">
              <div className="flex items-center">
              <button
                onClick={() => {
                  setShowRecordRefund(false);
                    setItemRefunds({});
                  setRefundMethod('Cash');
                }}
                className="mr-4 text-gray-600 hover:text-gray-900"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
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
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Items for Refund</h3>
              <div className="space-y-4">
                {(Array.isArray(booking?.products) ? booking.products : []).map((product: any) => {
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
                                    amount: e.target.checked ? refundData.amount : '',
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
                                  <p className="text-gray-500 text-xs mt-1">
                                    Maximum: ₹{Math.floor(productSecurityDeposit).toLocaleString('en-IN')}
                                  </p>
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
                      placeholder={requiresNotes ? "Required: Explain why refund is less than security deposit..." : "Optional: Add notes about this refund..."}
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
                  </div>

            <div className="flex gap-3 sticky bottom-0 bg-white pt-4 border-t">
                    <button
                      onClick={() => {
                        setShowRecordRefund(false);
                  setItemRefunds({});
                        setRefundMethod('Cash');
                      }}
                      className="flex-1 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRecordRefund}
                      className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
                    >
                      CONFIRM REFUND
                    </button>
                  </div>
          </div>
        </div>
      )}

      {/* Measurement Confirmation Modal */}
      {showMeasurementModal && booking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8">
            <div className="flex items-center mb-6">
              <svg className="w-8 h-8 text-green-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <h2 className="text-2xl font-bold text-gray-900">Your Payment Has Been Confirmed</h2>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Confirm your measurements to confirm your order
            </h3>

            {products.map((product: any, index: number) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex gap-4 mb-4">
                  <div className="w-16 h-20 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                    {getImageUrl(product.image) ? (
                      <img src={getImageUrl(product.image)!} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-2xl">👔</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="mb-1">
                      <h4 className="font-semibold text-gray-900">{product.name}</h4>
                      {product.code && (
                        <p className="text-xs text-gray-500 font-mono mt-0.5">Code: {product.code}</p>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">₹{Math.floor(product.rent_per_day || 0)} / Day</p>
                    <p className="text-sm text-red-600 mt-1">
                      Dates: {new Date(product.booked_from || booking.booked_from).toLocaleDateString('en-GB')} To {new Date(product.booked_to || booking.booked_to).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </div>

                {/* Measurement Fields - Different for Female vs Male Clothing */}
                {isFemaleClothing(product.name) ? (
                  // Female Clothing: Lehenga, Gown, Girlish Crop Top
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <input
                          type="text"
                          placeholder="Waist (in inches)"
                          value={measurements[product.id]?.waist || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'waist', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-waist`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-waist`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-waist`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Bust (in inches)"
                          value={measurements[product.id]?.bust || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'bust', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-bust`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-bust`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-bust`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Shoulder (in inches)"
                          value={measurements[product.id]?.shoulder || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'shoulder', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-shoulder`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-shoulder`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-shoulder`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Sleeves Up (in inches)"
                          value={measurements[product.id]?.sleevesUp || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sleevesUp', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sleevesUp`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sleevesUp`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sleevesUp`]}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <input
                          type="text"
                          placeholder="Sleeves E (in inches)"
                          value={measurements[product.id]?.sleevesE || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sleevesE', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sleevesE`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sleevesE`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sleevesE`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Sleeves B (in inches)"
                          value={measurements[product.id]?.sleevesB || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sleevesB', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sleevesB`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sleevesB`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sleevesB`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Lehenga Length (in inches)"
                          value={measurements[product.id]?.lehengaLength || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'lehengaLength', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-lehengaLength`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-lehengaLength`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-lehengaLength`]}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : isMaleClothing(product.name) ? (
                  // Male Clothing: Sherwani, Suit, Kurta Pajama, Indo Western
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <input
                          type="text"
                          placeholder="Side Tight (in inches)"
                          value={measurements[product.id]?.sideTight || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sideTight', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sideTight`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sideTight`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sideTight`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Sleeves Tight (in inches)"
                          value={measurements[product.id]?.sleevesTight || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sleevesTight', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sleevesTight`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sleevesTight`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sleevesTight`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Sleeves Length (in inches)"
                          value={measurements[product.id]?.sleevesLength || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sleevesLength', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sleevesLength`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sleevesLength`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sleevesLength`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Pant Length (in inches)"
                          value={measurements[product.id]?.pantLength || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'pantLength', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-pantLength`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-pantLength`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-pantLength`]}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <input
                          type="text"
                          placeholder="Side Loose (in inches)"
                          value={measurements[product.id]?.sideLoose || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sideLoose', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sideLoose`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sideLoose`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sideLoose`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Sleeves Loose (in inches)"
                          value={measurements[product.id]?.sleevesLoose || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sleevesLoose', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sleevesLoose`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sleevesLoose`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sleevesLoose`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Sleeves Length (in inches)"
                          value={measurements[product.id]?.sleevesLengthLoose || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'sleevesLengthLoose', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-sleevesLengthLoose`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-sleevesLengthLoose`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-sleevesLengthLoose`]}</p>
                        )}
                      </div>
                      <div>
                        <input
                          type="text"
                          placeholder="Pant Length (in inches)"
                          value={measurements[product.id]?.pantLengthLoose || ''}
                          onChange={(e) => handleMeasurementChange(product.id, 'pantLengthLoose', e.target.value)}
                          maxLength={2}
                          className={`px-3 py-2 border rounded w-full ${
                            measurementErrors[`${product.id}-pantLengthLoose`] ? 'border-red-500' : 'border-gray-300'
                          }`}
                        />
                        {measurementErrors[`${product.id}-pantLengthLoose`] && (
                          <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-pantLengthLoose`]}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Default measurements for other product types
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <input
                        type="text"
                        placeholder="Waist (in inches)"
                        value={measurements[product.id]?.waist || ''}
                        onChange={(e) => handleMeasurementChange(product.id, 'waist', e.target.value)}
                        maxLength={2}
                        className={`px-3 py-2 border rounded w-full ${
                          measurementErrors[`${product.id}-waist`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {measurementErrors[`${product.id}-waist`] && (
                        <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-waist`]}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Bust (in inches)"
                        value={measurements[product.id]?.bust || ''}
                        onChange={(e) => handleMeasurementChange(product.id, 'bust', e.target.value)}
                        maxLength={2}
                        className={`px-3 py-2 border rounded w-full ${
                          measurementErrors[`${product.id}-bust`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {measurementErrors[`${product.id}-bust`] && (
                        <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-bust`]}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Chest (in inches)"
                        value={measurements[product.id]?.chest || ''}
                        onChange={(e) => handleMeasurementChange(product.id, 'chest', e.target.value)}
                        maxLength={2}
                        className={`px-3 py-2 border rounded w-full ${
                          measurementErrors[`${product.id}-chest`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {measurementErrors[`${product.id}-chest`] && (
                        <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-chest`]}</p>
                      )}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Shoulder (in inches)"
                        value={measurements[product.id]?.shoulder || ''}
                        onChange={(e) => handleMeasurementChange(product.id, 'shoulder', e.target.value)}
                        maxLength={2}
                        className={`px-3 py-2 border rounded w-full ${
                          measurementErrors[`${product.id}-shoulder`] ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {measurementErrors[`${product.id}-shoulder`] && (
                        <p className="text-xs text-red-600 mt-1">{measurementErrors[`${product.id}-shoulder`]}</p>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Special Requirements */}
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Special Requirements (if any):
                  </label>
                  <textarea
                    placeholder="Enter any additional fitting requirements"
                    value={specialRequirements[product.id] || ''}
                    onChange={(e) => setSpecialRequirements({
                      ...specialRequirements,
                      [product.id]: e.target.value,
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    rows={2}
                  />
                </div>
              </div>
            ))}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowMeasurementModal(false)}
                className="flex-1 px-6 py-3 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  // Save measurements to booking
                  try {
                    // Update booking with measurements and special requirements
                    const measurementsData = Object.keys(measurements).reduce((acc: any, productId: string) => {
                      acc[productId] = measurements[parseInt(productId)];
                      return acc;
                    }, {});
                    
                    const specialReqsData = Object.keys(specialRequirements).reduce((acc: any, productId: string) => {
                      if (specialRequirements[parseInt(productId)]) {
                        acc[productId] = specialRequirements[parseInt(productId)];
                      }
                      return acc;
                    }, {});

                    // Save measurements to database
                    await bookingsApi.update(booking!.id, {
                      measurements: measurementsData,
                      special_requirements: JSON.stringify(specialReqsData)
                    } as any);

                    setShowMeasurementModal(false);
                    await fetchBooking();
                    toast.success('Measurements saved successfully!');
                  } catch (error) {
                    console.error('Error saving measurements:', error);
                    toast.error('Error saving measurements');
                  }
                }}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Measurements Modal */}
      {showViewMeasurements && selectedProductForMeasurements && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Measurements</h2>
              <button
                onClick={() => {
                  setShowViewMeasurements(false);
                  setSelectedProductForMeasurements(null);
                }}
                className="text-gray-600 hover:text-gray-900"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Product Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex gap-4">
                <div className="w-20 h-28 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                  {getImageUrl(selectedProductForMeasurements.image) ? (
                    <img
                      src={getImageUrl(selectedProductForMeasurements.image)!}
                      alt={selectedProductForMeasurements.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl">👔</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {selectedProductForMeasurements.name}
                  </h3>
                  {selectedProductForMeasurements.code && (
                    <p className="text-xs text-gray-500 font-mono mb-1">Code: {selectedProductForMeasurements.code}</p>
                  )}
                  <p className="text-sm text-gray-600">
                    ₹{Math.floor(selectedProductForMeasurements.rent_per_day || 0)} / Day
                  </p>
                </div>
              </div>
            </div>

            {/* Measurements Display/Edit */}
            {(() => {
              const productMeasurements = measurements[selectedProductForMeasurements.id] || {};
              const hasMeasurements = Object.keys(productMeasurements).length > 0;
              const isFemale = isFemaleClothing(selectedProductForMeasurements.name);
              const isMale = isMaleClothing(selectedProductForMeasurements.name);
              
              // Use editing state if in edit mode, otherwise use saved measurements
              const currentMeasurements = isEditingMeasurements ? editingMeasurements : productMeasurements;
              const currentSpecialReqs = isEditingMeasurements ? editingSpecialRequirements : (specialRequirements[selectedProductForMeasurements.id] || '');

              // Helper function to handle measurement field change
              function handleEditMeasurementChange(field: string, value: string) {
                const numericValue = value.replace(/\D/g, '');
                if (numericValue.length > 2) {
                  return;
                }
                const updatedEditingMeasurements = {
                  ...editingMeasurements,
                  [field]: numericValue,
                };
                setEditingMeasurements(updatedEditingMeasurements);
                
                // Immediately update the main measurements state to preserve data when switching products
                setMeasurements({
                  ...measurements,
                  [selectedProductForMeasurements.id]: updatedEditingMeasurements,
                });
              }

              // If no measurements and not editing, show add message
              if (!hasMeasurements && !isEditingMeasurements) {
                return (
                  <div className="space-y-6">
                    <div className="text-center py-8">
                      <p className="text-gray-500 text-lg mb-4">No measurements recorded yet</p>
                      {isOrderCompleted ? (
                        <div className="px-6 py-2 bg-gray-300 text-gray-600 rounded-lg font-medium cursor-not-allowed inline-block">
                          Measurements Locked (Order Completed)
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setIsEditingMeasurements(true);
                            // Preserve any existing measurements from the main state
                            setEditingMeasurements(measurements[selectedProductForMeasurements.id] || {});
                            setEditingSpecialRequirements(specialRequirements[selectedProductForMeasurements.id] || '');
                          }}
                          className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                        >
                          ➕ Add Measurements
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // If viewing (not editing) and measurements exist
              if (!isEditingMeasurements && hasMeasurements) {
                return (
                  <div className="space-y-6">
                    {isFemale ? (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Female Measurements (in inches)</h3>
                        <div className="grid grid-cols-2 gap-4">
                          {productMeasurements.waist && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Waist</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.waist}"</p>
                            </div>
                          )}
                          {productMeasurements.bust && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Bust</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.bust}"</p>
                            </div>
                          )}
                          {productMeasurements.shoulder && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Shoulder</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.shoulder}"</p>
                            </div>
                          )}
                          {productMeasurements.sleevesUp && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Sleeves Up</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesUp}"</p>
                            </div>
                          )}
                          {productMeasurements.sleevesE && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Sleeves E</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesE}"</p>
                            </div>
                          )}
                          {productMeasurements.sleevesB && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Sleeves B</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesB}"</p>
                            </div>
                          )}
                          {productMeasurements.lehengaLength && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Lehenga Length</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.lehengaLength}"</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : isMale ? (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Male Measurements (in inches)</h3>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-md font-medium text-gray-700 mb-3">Tight Fit</h4>
                            <div className="grid grid-cols-2 gap-4">
                              {productMeasurements.sideTight && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Side Tight</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sideTight}"</p>
                                </div>
                              )}
                              {productMeasurements.sleevesTight && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Sleeves Tight</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesTight}"</p>
                                </div>
                              )}
                              {productMeasurements.sleevesLength && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Sleeves Length</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesLength}"</p>
                                </div>
                              )}
                              {productMeasurements.pantLength && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Pant Length</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.pantLength}"</p>
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-md font-medium text-gray-700 mb-3">Loose Fit</h4>
                            <div className="grid grid-cols-2 gap-4">
                              {productMeasurements.sideLoose && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Side Loose</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sideLoose}"</p>
                                </div>
                              )}
                              {productMeasurements.sleevesLoose && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Sleeves Loose</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesLoose}"</p>
                                </div>
                              )}
                              {productMeasurements.sleevesLengthLoose && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Sleeves Length</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesLengthLoose}"</p>
                                </div>
                              )}
                              {productMeasurements.pantLengthLoose && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Pant Length</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.pantLengthLoose}"</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Measurements (in inches)</h3>
                        <div className="grid grid-cols-2 gap-4">
                          {productMeasurements.waist && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Waist</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.waist}"</p>
                            </div>
                          )}
                          {productMeasurements.bust && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Bust</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.bust}"</p>
                            </div>
                          )}
                          {productMeasurements.chest && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Chest</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.chest}"</p>
                            </div>
                          )}
                          {productMeasurements.shoulder && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Shoulder</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.shoulder}"</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Special Requirements */}
                    {specialRequirements[selectedProductForMeasurements.id] && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Special Requirements</h3>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-gray-700 whitespace-pre-wrap">{specialRequirements[selectedProductForMeasurements.id]}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              // Editing mode - show input fields
              // If order is completed or drop date passed, prevent editing
              const isDropDatePassed = isProductDropDatePassed(selectedProductForMeasurements);
              if (isOrderCompleted || isDropDatePassed) {
                return (
                  <div className="space-y-6">
                    <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 mb-4">
                      <div className="flex items-center">
                        <svg className="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <p className="text-yellow-800 font-medium">
                          {isOrderCompleted 
                            ? 'Measurements cannot be changed after order completion.'
                            : 'Measurements cannot be changed after the product drop date has passed.'}
                        </p>
                      </div>
                    </div>
                    {/* Show measurements in read-only mode */}
                    {isFemale ? (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Female Measurements (in inches)</h3>
                        <div className="grid grid-cols-2 gap-4">
                          {productMeasurements.waist && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Waist</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.waist}"</p>
                            </div>
                          )}
                          {productMeasurements.bust && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Bust</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.bust}"</p>
                            </div>
                          )}
                          {productMeasurements.shoulder && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Shoulder</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.shoulder}"</p>
                            </div>
                          )}
                          {productMeasurements.sleevesUp && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Sleeves Up</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesUp}"</p>
                            </div>
                          )}
                          {productMeasurements.sleevesE && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Sleeves E</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesE}"</p>
                            </div>
                          )}
                          {productMeasurements.sleevesB && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Sleeves B</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesB}"</p>
                            </div>
                          )}
                          {productMeasurements.lehengaLength && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Lehenga Length</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.lehengaLength}"</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : isMale ? (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Male Measurements (in inches)</h3>
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-md font-medium text-gray-700 mb-3">Tight Fit</h4>
                            <div className="grid grid-cols-2 gap-4">
                              {productMeasurements.sideTight && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Side Tight</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sideTight}"</p>
                                </div>
                              )}
                              {productMeasurements.sleevesTight && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Sleeves Tight</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesTight}"</p>
                                </div>
                              )}
                              {productMeasurements.sleevesLength && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Sleeves Length</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesLength}"</p>
                                </div>
                              )}
                              {productMeasurements.pantLength && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Pant Length</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.pantLength}"</p>
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-md font-medium text-gray-700 mb-3">Loose Fit</h4>
                            <div className="grid grid-cols-2 gap-4">
                              {productMeasurements.sideLoose && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Side Loose</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sideLoose}"</p>
                                </div>
                              )}
                              {productMeasurements.sleevesLoose && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Sleeves Loose</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesLoose}"</p>
                                </div>
                              )}
                              {productMeasurements.sleevesLengthLoose && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Sleeves Length</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.sleevesLengthLoose}"</p>
                                </div>
                              )}
                              {productMeasurements.pantLengthLoose && (
                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="text-sm text-gray-600 mb-1">Pant Length</p>
                                  <p className="text-lg font-semibold text-gray-900">{productMeasurements.pantLengthLoose}"</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Measurements (in inches)</h3>
                        <div className="grid grid-cols-2 gap-4">
                          {productMeasurements.waist && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Waist</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.waist}"</p>
                            </div>
                          )}
                          {productMeasurements.bust && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Bust</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.bust}"</p>
                            </div>
                          )}
                          {productMeasurements.chest && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Chest</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.chest}"</p>
                            </div>
                          )}
                          {productMeasurements.shoulder && (
                            <div className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="text-sm text-gray-600 mb-1">Shoulder</p>
                              <p className="text-lg font-semibold text-gray-900">{productMeasurements.shoulder}"</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {specialRequirements[selectedProductForMeasurements.id] && (
                      <div className="mt-6 pt-6 border-t border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-3">Special Requirements</h3>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-gray-700 whitespace-pre-wrap">{specialRequirements[selectedProductForMeasurements.id]}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {isFemale ? (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Female Measurements (in inches)</h3>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <input
                            type="text"
                            placeholder="Waist (in inches)"
                            value={editingMeasurements.waist || ''}
                            onChange={(e) => handleEditMeasurementChange('waist', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Bust (in inches)"
                            value={editingMeasurements.bust || ''}
                            onChange={(e) => handleEditMeasurementChange('bust', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Shoulder (in inches)"
                            value={editingMeasurements.shoulder || ''}
                            onChange={(e) => handleEditMeasurementChange('shoulder', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Sleeves Up (in inches)"
                            value={editingMeasurements.sleevesUp || ''}
                            onChange={(e) => handleEditMeasurementChange('sleevesUp', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <input
                            type="text"
                            placeholder="Sleeves E (in inches)"
                            value={editingMeasurements.sleevesE || ''}
                            onChange={(e) => handleEditMeasurementChange('sleevesE', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Sleeves B (in inches)"
                            value={editingMeasurements.sleevesB || ''}
                            onChange={(e) => handleEditMeasurementChange('sleevesB', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Lehenga Length (in inches)"
                            value={editingMeasurements.lehengaLength || ''}
                            onChange={(e) => handleEditMeasurementChange('lehengaLength', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : isMale ? (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Male Measurements (in inches)</h3>
                      <div>
                        <h4 className="text-md font-medium text-gray-700 mb-3">Tight Fit</h4>
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <input
                              type="text"
                              placeholder="Side Tight (in inches)"
                              value={editingMeasurements.sideTight || ''}
                              onChange={(e) => handleEditMeasurementChange('sideTight', e.target.value)}
                              maxLength={2}
                              className="px-3 py-2 border border-gray-300 rounded w-full"
                              disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Sleeves Tight (in inches)"
                              value={editingMeasurements.sleevesTight || ''}
                              onChange={(e) => handleEditMeasurementChange('sleevesTight', e.target.value)}
                              maxLength={2}
                              className="px-3 py-2 border border-gray-300 rounded w-full"
                              disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Sleeves Length (in inches)"
                              value={editingMeasurements.sleevesLength || ''}
                              onChange={(e) => handleEditMeasurementChange('sleevesLength', e.target.value)}
                              maxLength={2}
                              className="px-3 py-2 border border-gray-300 rounded w-full"
                              disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Pant Length (in inches)"
                              value={editingMeasurements.pantLength || ''}
                              onChange={(e) => handleEditMeasurementChange('pantLength', e.target.value)}
                              maxLength={2}
                              className="px-3 py-2 border border-gray-300 rounded w-full"
                              disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-md font-medium text-gray-700 mb-3">Loose Fit</h4>
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <input
                              type="text"
                              placeholder="Side Loose (in inches)"
                              value={editingMeasurements.sideLoose || ''}
                              onChange={(e) => handleEditMeasurementChange('sideLoose', e.target.value)}
                              maxLength={2}
                              className="px-3 py-2 border border-gray-300 rounded w-full"
                              disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Sleeves Loose (in inches)"
                              value={editingMeasurements.sleevesLoose || ''}
                              onChange={(e) => handleEditMeasurementChange('sleevesLoose', e.target.value)}
                              maxLength={2}
                              className="px-3 py-2 border border-gray-300 rounded w-full"
                              disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Sleeves Length (in inches)"
                              value={editingMeasurements.sleevesLengthLoose || ''}
                              onChange={(e) => handleEditMeasurementChange('sleevesLengthLoose', e.target.value)}
                              maxLength={2}
                              className="px-3 py-2 border border-gray-300 rounded w-full"
                              disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              placeholder="Pant Length (in inches)"
                              value={editingMeasurements.pantLengthLoose || ''}
                              onChange={(e) => handleEditMeasurementChange('pantLengthLoose', e.target.value)}
                              maxLength={2}
                              className="px-3 py-2 border border-gray-300 rounded w-full"
                              disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Measurements (in inches)</h3>
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <input
                            type="text"
                            placeholder="Waist (in inches)"
                            value={editingMeasurements.waist || ''}
                            onChange={(e) => handleEditMeasurementChange('waist', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Bust (in inches)"
                            value={editingMeasurements.bust || ''}
                            onChange={(e) => handleEditMeasurementChange('bust', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Chest (in inches)"
                            value={editingMeasurements.chest || ''}
                            onChange={(e) => handleEditMeasurementChange('chest', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            placeholder="Shoulder (in inches)"
                            value={editingMeasurements.shoulder || ''}
                            onChange={(e) => handleEditMeasurementChange('shoulder', e.target.value)}
                            maxLength={2}
                            className="px-3 py-2 border border-gray-300 rounded w-full"
                            disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Special Requirements */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Special Requirements (if any):
                    </label>
                    <textarea
                      placeholder="Enter any additional fitting requirements"
                      value={editingSpecialRequirements}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setEditingSpecialRequirements(newValue);
                        // Immediately update the main special requirements state to preserve data when switching products
                        setSpecialRequirements({
                          ...specialRequirements,
                          [selectedProductForMeasurements.id]: newValue,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={3}
                      disabled={hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 flex gap-3 justify-end">
              {isEditingMeasurements ? (
                <>
                  <button
                    onClick={() => {
                      setIsEditingMeasurements(false);
                      // Reset to saved values
                      const productMeasurements = measurements[selectedProductForMeasurements.id] || {};
                      setEditingMeasurements(productMeasurements);
                      setEditingSpecialRequirements(specialRequirements[selectedProductForMeasurements.id] || '');
                    }}
                    className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        // Update measurements for this product
                        const updatedMeasurements = {
                          ...measurements,
                          [selectedProductForMeasurements.id]: editingMeasurements,
                        };
                        
                        const updatedSpecialReqs = {
                          ...specialRequirements,
                          [selectedProductForMeasurements.id]: editingSpecialRequirements,
                        };

                        // Save to database
                        await bookingsApi.update(booking!.id, {
                          measurements: updatedMeasurements,
                          special_requirements: JSON.stringify(updatedSpecialReqs)
                        } as any);

                        // Update local state
                        setMeasurements(updatedMeasurements);
                        setSpecialRequirements(updatedSpecialReqs);
                        setIsEditingMeasurements(false);
                        
                        await fetchBooking();
                        toast.success('Measurements saved successfully!');
                      } catch (error) {
                        console.error('Error saving measurements:', error);
                        toast.error('Error saving measurements');
                      }
                    }}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setShowViewMeasurements(false);
                      setSelectedProductForMeasurements(null);
                    }}
                    className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
                  >
                    Close
                  </button>
                  {measurements[selectedProductForMeasurements.id] && Object.keys(measurements[selectedProductForMeasurements.id]).length > 0 && (
                    (hasProductRefund(selectedProductForMeasurements?.id) || isProductDropDatePassed(selectedProductForMeasurements)) ? (
                      <div className="px-6 py-2 bg-gray-300 text-gray-600 rounded-lg font-medium cursor-not-allowed">
                        {hasProductRefund(selectedProductForMeasurements?.id)
                          ? 'Edit (Locked - Refund Completed)'
                          : 'Edit (Locked - Drop Date Passed)'}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setIsEditingMeasurements(true);
                          const productMeasurements = measurements[selectedProductForMeasurements.id] || {};
                          setEditingMeasurements(productMeasurements);
                          setEditingSpecialRequirements(specialRequirements[selectedProductForMeasurements.id] || '');
                        }}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                      >
                        Edit
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {ConfirmDialogComponent}
    </div>
  );
}

