
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingsApi, paymentTransactionsApi, settingsApi, PaymentSummary, invoicesApi, SERVER_BASE_URL } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import { makeShareableUrl } from '@/lib/urlHelper';
import { DateRangePicker, ComplaintForm, FeedbackForm, ProductExchange, PaymentManagement, securityPaidByProductFromSummary, MeasurementModal, ProductStatusBadge, MarkPickedUpButton } from '@/components/common';
import { BookingCancellation } from '@/components/common/BookingCancellation';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';


export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
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
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [userName, setUserName] = useState('Salesman'); // Default fallback
  const [paymentRefreshKey, setPaymentRefreshKey] = useState(0);

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


  // Transaction history
  const [transactions, setTransactions] = useState<any[]>([]);

  // Measurement confirmation modal
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [measurements, setMeasurements] = useState<{ [key: string]: any }>({});
  const [specialRequirements, setSpecialRequirements] = useState<{ [key: string]: string }>({});

  // View/Edit measurements modal
  const [showViewMeasurements, setShowViewMeasurements] = useState(false);
  const [selectedProductForMeasurements, setSelectedProductForMeasurements] = useState<any>(null);
  // Controls whether view modal opens in edit mode (true when product has no measurements yet)
  const [measurementDefaultEditMode, setMeasurementDefaultEditMode] = useState(false);

  // Salesman permissions
  const [salesmanPermissions, setSalesmanPermissions] = useState({
    exchange_allowed: false,
    cancellation_allowed: false,
  });

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


  useEffect(() => {
    if (params.id) {
      fetchBooking();
      fetchDateChangeChargeSettings();
      fetchSalesmanPermissions();

    }

    // Initialize userName from localStorage (client-side only)
    if (typeof window !== 'undefined') {
      const storedUserName = localStorage.getItem('userName') ||
        localStorage.getItem('salesman_user') ||
        'Salesman';
      setUserName(storedUserName);
    }
  }, [params.id]);

  async function fetchSalesmanPermissions() {
    try {
      const response = await settingsApi.getByKey('salesman_permissions');
      if (response.data?.setting_value) {
        const permissions = JSON.parse(response.data.setting_value);
        setSalesmanPermissions({
          exchange_allowed: permissions.exchange_allowed || false,
          cancellation_allowed: permissions.cancellation_allowed || false,
        });
      }
    } catch (error) {
      console.error('Error fetching salesman permissions:', error);
    }
  }

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
      setPaymentRefreshKey(prev => prev + 1);
      const [bookingResponse, transactionsResponse, summaryResponse] = await Promise.all([
        bookingsApi.getById(Number(params.id)),
        paymentTransactionsApi.getByBookingId(Number(params.id)),
        bookingsApi.getPaymentSummary(Number(params.id)),
      ]);

      setBooking(bookingResponse.data);
      setPaymentSummary(summaryResponse.data);
      const allTransactions = transactionsResponse.data || [];
      setTransactions(allTransactions);

      // Backend handles product and booking status through lifecycle APIs (pickup, return, etc.)
      // No frontend status derivation needed

      // Load measurements from each product (stored in booking_products.measurements)
      // The bookings table does NOT have a measurements column; data lives per-product.
      const bProducts = Array.isArray(bookingResponse.data.products) ? bookingResponse.data.products : [];
      const convertedMeasurements: { [key: string]: any } = {};
      const convertedSpecialReqs: { [key: string]: string } = {};

      bProducts.forEach((product: any) => {
        const productId = product.id;
        const bookedFrom = product.booked_from || bookingResponse.data.booked_from;
        const bookedTo = product.booked_to || bookingResponse.data.booked_to;
        const uniqueKey = `${productId}_${bookedFrom}_${bookedTo}`;

        // Load measurements from this product
        if (product.measurements) {
          try {
            const meas = typeof product.measurements === 'string'
              ? JSON.parse(product.measurements)
              : product.measurements;
            if (meas && typeof meas === 'object' && Object.keys(meas).length > 0) {
              convertedMeasurements[uniqueKey] = meas;
            }
          } catch (error) {
            console.error('Error parsing product measurements:', error);
          }
        }

        // Load special requirements from this product
        if (product.special_requirements) {
          try {
            const req = typeof product.special_requirements === 'string'
              ? product.special_requirements
              : JSON.stringify(product.special_requirements);
            if (req && req.trim()) {
              convertedSpecialReqs[uniqueKey] = req;
            }
          } catch (error) {
            console.error('Error parsing product special requirements:', error);
          }
        }
      });

      if (Object.keys(convertedMeasurements).length > 0) {
        setMeasurements(convertedMeasurements);
      }
      if (Object.keys(convertedSpecialReqs).length > 0) {
        setSpecialRequirements(convertedSpecialReqs);
      }
    } catch (error) {
      console.error('Error fetching booking:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateDocument(type: 'estimate' | 'invoice' | 'tax-invoice') {
    if (!booking) return;
    try {
      // Use POST endpoint to generate PDF and get blob directly for preview
      const response = await invoicesApi.generate(type, booking.id);

      // Store PDF blob and show preview instead of auto-downloading
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      setPdfBlob(blob);
      setPdfType(type);
      setPdfUrl(url);

      // Generate public URL for WhatsApp sharing
      // Use GET endpoint to get the public URL
      try {
        const generateResponse = await invoicesApi.getPublicUrl(type, booking.id);
        const publicUrl = generateResponse.data.url;
        const fullUrl = generateResponse.data.fullUrl || `${SERVER_BASE_URL}${publicUrl}`;
        setPdfPublicUrl(makeShareableUrl(fullUrl));
      } catch (urlError) {
        // If GET fails, construct URL manually
        console.warn('Could not get public URL, constructing manually:', urlError);
        setPdfPublicUrl(makeShareableUrl(`${SERVER_BASE_URL}/uploads/${type}_${booking.id}.pdf`));
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
      const errorMessage = error.response?.data?.details || error.response?.data?.error || error.message || 'Unknown error';
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
      // Fallback: construct URL from server base URL
      pdfDownloadLink = makeShareableUrl(`${SERVER_BASE_URL}/uploads/${pdfType}_${booking.id}.pdf`);
      if (/localhost|127\.0\.0\.1/.test(pdfDownloadLink)) {
        toast.warning('Please configure NEXT_PUBLIC_SERVER_IP for mobile sharing');
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

    if (!pdfType) {
      toast.warning('No document type selected.');
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
      const response = await invoicesApi.sendEmail({
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
        toast.error(`Failed to send email: ${error.response?.data?.details || error.response?.data?.error || error.message}`);
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
    fetchProductBookingsForChange(product.product_id);
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

      // Update booking with new product dates
      // The backend will automatically:
      // 1. Update booking_products table (releasing old dates, blocking new dates)
      // 2. Recalculate booking-level dates
      const bookingId = booking?.id || Number(params.id);
      if (!bookingId || isNaN(bookingId)) {
        toast.error('Invalid booking ID');
        return;
      }

      await bookingsApi.update(bookingId, {
        products: [{
          id: selectedProduct.id,
          booked_from: changeDateFrom,
          booked_to: changeDateTo,
        }],
      });

      // Record the charge if any (as date_change_charge - does not affect payment calculations)
      if (finalCharge > 0) {
        await paymentTransactionsApi.create({
          booking_id: bookingId,
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

  // In salesman page, exchanged / cancelled products are not required
  const products = Array.isArray(booking.products) ? booking.products.filter((p: any) => p.status !== 'exchanged' && p.status !== 'cancelled') : [];

  // Use backend-provided status — no frontend status derivation
  const activeProducts = products.filter((p: any) => p.status !== 'cancelled' && p.status !== 'exchanged');
  const isOrderCompleted = booking.status === 'completed';
  const isPartiallyCompleted = booking.status === 'partially_completed';

  // A product is "refunded" if its backend status is 'completed'
  function hasProductRefund(productId: number): boolean {
    const product = products.find((p: any) => p.id === productId);
    return product?.status === 'completed';
  }

  // Helper to check if a product is cancelled
  function isProductCancelled(product: any): boolean {
    return product.status === 'cancelled';
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

  // Build security-paid map once so it can be used both for the date-edit button
  // and for the ProductExchange component below.
  const securityByProduct = securityPaidByProductFromSummary(paymentSummary?.products ?? []);

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
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
          {booking && (
            <>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-semibold">
                Order ID: #{booking.id}
              </span>
              {(() => {
                const status = booking.status;
                let bgColor = 'bg-gray-100';
                let textColor = 'text-gray-800';
                let label = status.charAt(0).toUpperCase() + status.slice(1);

                if (status === 'pending') {
                  bgColor = 'bg-yellow-100';
                  textColor = 'text-yellow-800';
                  label = 'Pending';
                } else if (status === 'confirmed') {
                  bgColor = 'bg-green-100';
                  textColor = 'text-green-800';
                  label = 'Confirmed';
                } else if (status === 'cancelled') {
                  bgColor = 'bg-red-100';
                  textColor = 'text-red-800';
                  label = 'Cancelled';
                } else if (status === 'partially_completed') {
                  bgColor = 'bg-blue-100';
                  textColor = 'text-blue-800';
                  label = 'Partially Completed';
                } else if (status === 'completed') {
                  bgColor = 'bg-blue-100';
                  textColor = 'text-blue-800';
                  label = 'Completed';
                } else if (status === 'in_progress') {
                  bgColor = 'bg-purple-100';
                  textColor = 'text-purple-800';
                  label = 'In Progress';
                }

                return (
                  <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${bgColor} ${textColor}`}>
                    {label}
                  </span>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex gap-3">
          <button
            onClick={() => setShowComplaintForm(true)}
            className="flex-1 px-4 py-3 bg-red-50 text-red-600 border border-red-200 font-semibold rounded-lg hover:bg-red-100 transition-colors"
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Report Issue</span>
            </div>
          </button>
          <button
            onClick={() => setShowFeedbackForm(true)}
            className="flex-1 px-4 py-3 bg-green-50 text-green-600 border border-green-200 font-semibold rounded-lg hover:bg-green-100 transition-colors"
          >
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              <span>Give Feedback</span>
            </div>
          </button>
        </div>
      </div>

      {/* Order Status Banner */}
      {booking?.status === 'cancelled' && (
        <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg className="w-6 h-6 text-red-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-bold text-red-800">Order Cancelled</h3>
              <p className="text-sm text-red-700">This booking has been cancelled.</p>
            </div>
          </div>
        </div>
      )}

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
          {products.map((product: any, index: number) => {
            const isCancelled = isProductCancelled(product);
            return (
              <div
                key={index}
                className={`bg-white border rounded-lg p-6 flex gap-6 ${isCancelled ? 'opacity-60 border-red-300 bg-red-50' : 'border-gray-200'
                  }`}
              >
                <div className="w-32 h-40 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {(() => {
                    // Check multiple possible image fields: image, imageUrl, rawImage
                    const imageData = product.image || product.imageUrl || product.rawImage;
                    const hasImage = imageData && imageData !== null && imageData !== '';
                    const imageUrl = hasImage ? getImageUrl(imageData) : null;

                    if (imageUrl) {
                      return (
                        <img
                          src={imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const img = e.currentTarget;
                            console.error(`Failed to load image for ${product.name} (${product.code}):`, {
                              originalImage: product.image,
                              imageUrl: product.imageUrl,
                              rawImage: product.rawImage,
                              processedUrl: imageUrl,
                              error: 'Image file not found or server error'
                            });
                            // Replace with placeholder instead of hiding
                            img.style.display = 'none';
                            const parent = img.parentElement;
                            if (parent && !parent.querySelector('.placeholder-icon')) {
                              const placeholder = document.createElement('div');
                              placeholder.className = 'w-full h-full flex items-center justify-center placeholder-icon';
                              placeholder.innerHTML = '<span class="text-4xl">👔</span>';
                              parent.appendChild(placeholder);
                            }
                          }}
                          onLoad={(e) => {
                            // Remove any placeholder if image loads successfully
                            const parent = (e.currentTarget as HTMLImageElement).parentElement;
                            const placeholder = parent?.querySelector('.placeholder-icon');
                            if (placeholder) {
                              placeholder.remove();
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
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {product.name}
                    </h3>
                    <ProductStatusBadge status={product.status} size="md" />
                  </div>
                  {product.code && (
                    <div className="flex items-center gap-2 mb-1">
                      {(() => {
                        const imageData = product.image || product.imageUrl || product.rawImage;
                        const hasImage = imageData && imageData !== null && imageData !== '';
                        const imageUrl = hasImage ? getImageUrl(imageData) : null;
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
                    ₹{Math.floor(product.effective_rent || product.rent || 0)} / Day
                    {product.effective_rent && product.effective_rent < product.rent && (
                      <span className="text-xs text-gray-400 line-through ml-1">₹{Math.floor(product.rent)}</span>
                    )}
                    {product.security_deposit > 0 && (
                      <span className="text-xs text-gray-500 block mt-0.5">Security: ₹{Math.floor(product.security_deposit).toLocaleString('en-IN')}</span>
                    )}
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
                    {/* Hide edit button if product refund is completed, product is cancelled, or security has been paid */}
                    {!hasProductRefund(product.id) && !isCancelled && !(securityByProduct[product.id] > 0) && (
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
                    {hasProductRefund(product.id) || isProductDropDatePassed(product) || isCancelled ? (
                      <div className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-300 text-gray-600 cursor-not-allowed">
                        {isCancelled
                          ? '📏 Measurements (Product Cancelled)'
                          : hasProductRefund(product.id)
                            ? '📏 Measurements (Locked - Refund Completed)'
                            : '📏 Measurements (Locked)'}
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedProductForMeasurements(product);
                          const bookedFrom = product.booked_from || booking?.booked_from;
                          const bookedTo = product.booked_to || booking?.booked_to;
                          const uniqueKey = `${product.id}_${bookedFrom}_${bookedTo}`;
                          const productMeasurements = measurements[uniqueKey] || {};
                          const hasMeasurements = Object.keys(productMeasurements).length > 0;
                          // Open directly in edit mode when no measurements exist yet
                          setMeasurementDefaultEditMode(!hasMeasurements);
                          setShowViewMeasurements(true);
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${(() => {
                          const bookedFrom = product.booked_from || booking?.booked_from;
                          const bookedTo = product.booked_to || booking?.booked_to;
                          const uniqueKey = `${product.id}_${bookedFrom}_${bookedTo}`;
                          const productMeas = measurements[uniqueKey] || measurements[uniqueKey];
                          return productMeas && Object.keys(productMeas).length > 0
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-green-600 text-white hover:bg-green-700';
                        })()
                          }`}
                      >
                        {(() => {
                          const bookedFrom = product.booked_from || booking?.booked_from;
                          const bookedTo = product.booked_to || booking?.booked_to;
                          const uniqueKey = `${product.id}_${bookedFrom}_${bookedTo}`;
                          const productMeas = measurements[uniqueKey] || measurements[uniqueKey];
                          return productMeas && Object.keys(productMeas).length > 0
                            ? '📏 Measurements'
                            : '➕ Add Measurements';
                        })()}
                      </button>
                    )}
                  </div>
                  {/* Mark Picked Up — shown for all confirmed products; backend enforces security-paid rule */}
                  {!isCancelled && product.status === 'confirmed' && (
                    <MarkPickedUpButton
                      product={product}
                      bookingId={booking.id}
                      pickedUpBy="Salesman"
                      onSuccess={fetchBooking}
                    />
                  )}
                </div>
              </div>
            );
          })}
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

          {/* Product Exchange Section */}
          {salesmanPermissions.exchange_allowed && booking && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <ProductExchange
                bookingId={booking.id}
                bookingDate={booking.booking_date}
                currentProducts={Array.isArray(booking.products) ? booking.products.filter((p: any) => p.status !== 'cancelled' && p.status !== 'exchanged') : []}
                onExchangeComplete={fetchBooking}
                userRole="salesman"
                bookingStatus={booking.status}
                userName={userName}
                securityPaidByProduct={securityByProduct}
              />
            </div>
          )}

          {/* Booking Cancellation Section */}
          {salesmanPermissions.cancellation_allowed && booking && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Cancel Booking
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Cancel this booking and apply cancellation policy. Refunds will be processed based on the cancellation timing.
              </p>
              <BookingCancellation
                bookingId={booking.id}
                bookingStatus={booking.status}
                onCancellationComplete={fetchBooking}
                userRole="salesman"
                userName={userName}
                canCancel={salesmanPermissions.cancellation_allowed}
              />
            </div>
          )}

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

          {/* Payment management - shared component handles all payment/refund UI */}
          <PaymentManagement
            bookingId={booking.id}
            totalAmount={paymentSummary ? (paymentSummary.charges.rent.due || 0) : 0}
            securityDeposit={paymentSummary ? (paymentSummary.charges.security.due || 0) : 0}
            userRole="salesman"
            isFullyCancelled={booking?.status === 'cancelled'}
            refreshTrigger={paymentRefreshKey}
            onPaymentUpdate={() => {
              fetchBooking();
            }}
            onFirstPayment={() => setShowMeasurementModal(true)}
          />

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
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
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
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
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
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
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
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
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
                  const imageData = selectedProduct.image || selectedProduct.imageUrl || selectedProduct.rawImage;
                  const hasImage = imageData && imageData !== null && imageData !== '';
                  const imageUrl = hasImage ? getImageUrl(imageData) : null;

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
                  ₹{Math.floor(selectedProduct.effective_rent || selectedProduct.rent || 0)} / Day
                </p>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Original dates:</p>
                  <p className="text-gray-500 font-semibold">
                    {new Date(selectedProduct.booked_from).toLocaleDateString('en-GB')} →{' '}
                    {new Date(selectedProduct.booked_to).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>
            </div>

            {/* Calendar — pre-seeded with current dates (shown in blue).
                Other bookings for this product are shown red, but the
                current booking is excluded so its own dates don't block. */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Select New Dates
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Your current booking dates are pre-selected. Click to change them.
              </p>
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
              {/* Live new-dates summary — only shown once the user has changed the dates */}
              {changeDateFrom && changeDateTo &&
                (changeDateFrom !== selectedProduct.booked_from?.split('T')[0] ||
                 changeDateTo   !== selectedProduct.booked_to?.split('T')[0]) && (
                <div className="mt-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 font-medium">
                  New dates: {new Date(changeDateFrom).toLocaleDateString('en-GB')} → {new Date(changeDateTo).toLocaleDateString('en-GB')}
                </div>
              )}
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


      {/* Measurement Confirmation Modal */}
      {showMeasurementModal && booking && (
        <MeasurementModal
          mode="confirm"
          bookingId={booking.id || Number(params.id)}
          booking={booking}
          products={products}
          measurements={measurements}
          specialRequirements={specialRequirements}
          onMeasurementsChange={setMeasurements}
          onSpecialRequirementsChange={setSpecialRequirements}
          onClose={() => setShowMeasurementModal(false)}
          onSaved={fetchBooking}
        />
      )}


      {showViewMeasurements && selectedProductForMeasurements && (
        <MeasurementModal
          mode="view"
          bookingId={booking?.id || Number(params.id)}
          booking={booking}
          selectedProduct={selectedProductForMeasurements}
          measurements={measurements}
          specialRequirements={specialRequirements}
          onMeasurementsChange={setMeasurements}
          onSpecialRequirementsChange={setSpecialRequirements}
          isOrderCompleted={isOrderCompleted}
          isProductRefunded={(productId) => hasProductRefund(productId)}
          isDropDatePassed={(product) => isProductDropDatePassed(product)}
          defaultEditMode={measurementDefaultEditMode}
          onClose={() => {
            setShowViewMeasurements(false);
            setSelectedProductForMeasurements(null);
          }}
          onSaved={fetchBooking}
        />
      )}
      {ConfirmDialogComponent}

      {/* Complaint Form Modal */}
      {showComplaintForm && booking && (
        <ComplaintForm
          onClose={() => setShowComplaintForm(false)}
          onSuccess={() => {
            setShowComplaintForm(false);
          }}
          userName={userName}
          bookingId={booking.id}
        />
      )}

      {/* Feedback Form Modal */}
      {showFeedbackForm && booking && (
        <FeedbackForm
          onClose={() => setShowFeedbackForm(false)}
          onSuccess={() => {
            setShowFeedbackForm(false);
          }}
          userName={userName}
          bookingId={booking.id}
        />
      )}
    </div>
  );
}

