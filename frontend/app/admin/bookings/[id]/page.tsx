'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingsApi, paymentTransactionsApi, PaymentSummary } from '@/lib/api';
import { creditNotesApi } from '@/lib/creditNotesApi';
import { settingsApi } from '@/lib/settingsApi';
import { productTrackingApi } from '@/lib/productTrackingApi';
import { Booking } from '@/types';
import { Button, PaymentManagement, ProductExchange } from '@/components/common';
import { AutoCancelCountdown } from '@/components/common/AutoCancelCountdown';
import { toast } from '@/lib/toast';
import { getImageUrl } from '@/lib/imageHelper';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [measurements, setMeasurements] = useState<{[key: string]: any}>({});
  const [specialRequirements, setSpecialRequirements] = useState<{[key: string]: string}>({});
  const [showMeasurements, setShowMeasurements] = useState<{[key: string]: boolean}>({});
  const [showEstimate, setShowEstimate] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showTaxInvoice, setShowTaxInvoice] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfType, setPdfType] = useState<'estimate' | 'invoice' | 'tax-invoice' | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfPublicUrl, setPdfPublicUrl] = useState<string | null>(null);
  const [showWhatsAppShareModal, setShowWhatsAppShareModal] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);

  useEffect(() => {
    if (params.id) {
      fetchBooking();
      fetchPaymentSummary();
    }
  }, [params.id]);

  async function fetchPaymentSummary() {
    if (!params.id) return;
    
    try {
      const response = await bookingsApi.getPaymentSummary(Number(params.id));
      console.log('📊 Payment Summary:', response.data);
      setPaymentSummary(response.data);
    } catch (error) {
      console.error('Error fetching payment summary:', error);
      setPaymentSummary(null);
    }
  }

  async function fetchBooking() {
    try {
      const response = await bookingsApi.getById(Number(params.id));
      setBooking(response.data);
      
      // Load measurements from booking if they exist
      if (response.data.measurements) {
        try {
          const measurementsData = typeof response.data.measurements === 'string' 
            ? JSON.parse(response.data.measurements)
            : response.data.measurements;
          
          // Convert old format (keyed by product.id) to new format (keyed by product.id + dates)
          const convertedMeasurements: {[key: string]: any} = {};
          const products = Array.isArray(response.data.products) ? response.data.products : [];
          
          if (typeof measurementsData === 'object' && measurementsData !== null) {
            // If it's keyed by product ID (old format), convert it
            products.forEach((product: any) => {
              const productId = product.id;
              const bookedFrom = product.booked_from || response.data.booked_from;
              const bookedTo = product.booked_to || response.data.booked_to;
              const uniqueKey = `${productId}_${bookedFrom}_${bookedTo}`;
              
              // Prioritize unique key first, then fall back to product ID only if unique key doesn't exist
              // This ensures each product instance with different dates gets independent measurements
              const productMeas = measurementsData[uniqueKey] || measurementsData[productId] || {};
              if (Object.keys(productMeas).length > 0) {
                // Only store with unique key - don't create backward compatibility entries
                // to prevent overwriting when same product has multiple instances
                convertedMeasurements[uniqueKey] = productMeas;
              }
            });
          }
          
          setMeasurements(convertedMeasurements);
        } catch (error) {
          console.error('Error parsing measurements:', error);
        }
      }

      // Load special requirements from booking if they exist
      if (response.data.special_requirements) {
        try {
          const specialReqsData = typeof response.data.special_requirements === 'string'
            ? JSON.parse(response.data.special_requirements)
            : response.data.special_requirements;
          if (typeof specialReqsData === 'object' && specialReqsData !== null) {
            // Convert old format to new format (keyed by product.id + dates)
            const convertedSpecialReqs: {[key: string]: string} = {};
            const products = Array.isArray(response.data.products) ? response.data.products : [];
            
            products.forEach((product: any) => {
              const productId = product.id;
              const bookedFrom = product.booked_from || response.data.booked_from;
              const bookedTo = product.booked_to || response.data.booked_to;
              const uniqueKey = `${productId}_${bookedFrom}_${bookedTo}`;
              
              // Prioritize unique key first, then fall back to product ID only if unique key doesn't exist
              // This ensures each product instance with different dates gets independent special requirements
              const productReq = specialReqsData[uniqueKey] || specialReqsData[productId] || '';
              if (productReq && typeof productReq === 'string') {
                // Only store with unique key - don't create backward compatibility entries
                // to prevent overwriting when same product has multiple instances
                convertedSpecialReqs[uniqueKey] = productReq;
              }
            });
            
            setSpecialRequirements(convertedSpecialReqs);
          }
        } catch (error) {
          console.error('Error parsing special requirements:', error);
        }
      }
      
      // Fetch transactions for status calculation
      try {
        const transactionsResponse = await paymentTransactionsApi.getByBookingId(Number(params.id));
        setTransactions(transactionsResponse.data || []);
      } catch (transError) {
        console.error('Error fetching transactions:', transError);
        setTransactions([]);
      }
      
      // Fetch payment summary
      await fetchPaymentSummary();
    } catch (error) {
      console.error('Error fetching booking:', error);
      toast.error('Error loading booking');
    } finally {
      setLoading(false);
    }
  }

  function getStatusDisplay(status: string): { text: string; color: string } {
    // Use backend-provided status directly - backend calculates based on payments/refunds/cancellations
    const displayStatus = booking?.status || status;
    
    switch (displayStatus) {
      case 'completed':
        return { text: 'Completed', color: 'text-blue-600' };
      case 'cancelled':
        return { text: 'Cancelled', color: 'text-red-600' };
      case 'partially_completed':
        return { text: 'Partially Completed', color: 'text-blue-600' };
      case 'in_progress':
        return { text: 'Under Process', color: 'text-blue-600' };
      case 'confirmed':
        return { text: 'Confirmed', color: 'text-green-600' };
      case 'pending':
        return { text: 'Payment Due', color: 'text-red-600' };
      default:
        return { text: 'Pending', color: 'text-yellow-600' };
    }
  }

  async function handleStatusUpdate(newStatus: string) {
    if (!booking) return;
    
    // Check if trying to confirm a booking that has a credit note
    if (booking.status !== 'confirmed' && newStatus === 'confirmed') {
      try {
        const creditNotesResponse = await creditNotesApi.getByBookingId(booking.id);
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
    
    if (booking) {
      setBooking({ ...booking, status: newStatus as any });
    }
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
    let pdfDownloadLink = '';
    
    if (pdfPublicUrl) {
      pdfDownloadLink = pdfPublicUrl;
    } else {
      // Fallback: construct URL from API_URL
      const baseUrl = API_URL.replace('/api', '');
      if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
        if (typeof window !== 'undefined') {
          const hostname = window.location.hostname;
          const protocol = window.location.protocol;
          if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            pdfDownloadLink = `${protocol}//${hostname}:3001/uploads/${pdfType}_${booking.id}.pdf`;
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

  // Helper to check if a product is cancelled
  function isProductCancelled(product: any): boolean {
    return product.status === 'cancelled';
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
            {booking && (
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-semibold">
                Order ID: #{booking.id}
              </span>
            )}
          </div>
          <div className="w-20"></div>
        </div>

        {/* Order Info */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Customer Details</h3>
            <p className="text-lg font-semibold">{booking.customer_name}</p>
            <p className="text-sm text-gray-600">Phone: {booking.customer_phone || 'N/A'}</p>
            <p className="text-sm text-gray-600 mt-2">Delivery Address</p>
            <p className="text-sm">{booking.customer_address || 'N/A'}</p>
            {/* Debug: Show transportation status */}
            {(() => {
              const isTransportationOpted = (booking.transport_charge || 0) > 0;
              if (isTransportationOpted) {
                return (
                  <div className="mt-3 p-2 bg-teal-50 border border-teal-200 rounded">
                    <p className="text-xs text-teal-700 font-semibold">🚚 Local Transportation: Opted</p>
                    <p className="text-xs text-teal-600">Charge: ₹{Math.floor(parseFloat(booking.transport_charge || '0')).toLocaleString('en-IN')}</p>
                  </div>
                );
              }
              return null;
            })()}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">
              Order Summary • {(() => {
                const statusDisplay = getStatusDisplay(booking.status);
                return <span className={statusDisplay.color}>{statusDisplay.text}</span>;
              })()}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{(() => {
                  if (!paymentSummary) return '0';
                  const totalRent = (paymentSummary.charges.rent.due || 0) + (paymentSummary.charges.rent.paid || 0);
                  return Math.floor(totalRent).toLocaleString('en-IN');
                })()}</span>
              </div>
              {(() => {
                const isTransportationOpted = (booking.transport_charge || 0) > 0;
                const transportationCharge = booking.transport_charge || 0;
                
                if (isTransportationOpted) {
                  return (
                    <div className="flex justify-between items-center bg-teal-50 px-2 py-1 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-teal-700">Local Transportation</span>
                        <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded font-semibold">Opted</span>
                      </div>
                      <span className="text-sm text-teal-700 font-semibold">₹{Math.floor(transportationCharge).toLocaleString('en-IN')}</span>
              </div>
                  );
                }
                return null;
              })()}
              <div className="flex justify-between">
                <span>Security Deposit</span>
                <span>₹{paymentSummary ? Math.floor((paymentSummary.charges.security.due || 0) + (paymentSummary.charges.security.paid || 0)).toLocaleString('en-IN') : '0'}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total</span>
                <span>₹{(() => {
                  if (!paymentSummary) return '0';
                  const totalRent = (paymentSummary.charges.rent.due || 0) + (paymentSummary.charges.rent.paid || 0);
                  const totalSecurity = (paymentSummary.charges.security.due || 0) + (paymentSummary.charges.security.paid || 0);
                  const total = totalRent + totalSecurity;
                  return Math.floor(total).toLocaleString('en-IN');
                })()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Products List */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Products</h3>
          {products.map((product: any, index: number) => {
            // Create unique key for this product instance (product.id + dates)
            const bookedFrom = product.booked_from || booking.booked_from;
            const bookedTo = product.booked_to || booking.booked_to;
            const uniqueKey = `${product.id}_${bookedFrom}_${bookedTo}`;
            
            const productMeasurements = measurements[uniqueKey] || {};
            const hasMeasurements = Object.keys(productMeasurements).length > 0;
            const isFemale = isFemaleClothing(product.name);
            const isMale = isMaleClothing(product.name);
            const isExpanded = showMeasurements[uniqueKey] || false;
            const isCancelled = isProductCancelled(product);

            return (
            <div key={index} className={`border rounded-lg p-4 mb-4 ${
              isCancelled ? 'opacity-60 border-red-300 bg-red-50' : ''
            }`}>
              <div className="flex justify-between items-start mb-2">
                  <div className="flex items-start gap-3">
                    {/* Product Image */}
                    {(() => {
                      const hasImage = product.image && product.image !== null && product.image !== '';
                      const imageUrl = hasImage ? getImageUrl(product.image) : null;
                      return imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.name}
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200 flex-shrink-0"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                      ) : null;
                    })()}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-lg">{product.name}</p>
                    {isCancelled && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                        ❌ Cancelled
                      </span>
                    )}
                  </div>
                      {product.code && (
                        <div className="flex items-center gap-2 mt-1">
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
                      <p className="text-sm text-gray-600 mt-1">₹{product.rent?.toLocaleString()}/Day</p>
                    </div>
                </div>
              </div>
              <div className="text-sm text-gray-700">
                <p><strong>Dates:</strong> {new Date(product.booked_from || booking.booked_from).toLocaleDateString('en-GB')} To {new Date(product.booked_to || booking.booked_to).toLocaleDateString('en-GB')}</p>
              </div>

                {/* Customer Measurements - Collapsible */}
                {hasMeasurements && (
                  <div className="mt-4 bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg p-4 border-l-4 border-pink-500">
                    <button
                      onClick={() => setShowMeasurements({
                        ...showMeasurements,
                        [uniqueKey]: !isExpanded
                      })}
                      className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
                    >
                      <h4 className="text-md font-semibold text-gray-800 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 mr-2 text-pink-600">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25h6M9 12h6m-6 3.75h6" />
                        </svg>
                        Customer Measurements
                        <span className="ml-2 text-sm text-pink-600">(Click to {isExpanded ? 'hide' : 'view'})</span>
                      </h4>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className={`w-5 h-5 text-pink-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="mt-4 space-y-4">
                        {isFemale ? (
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
                        ) : isMale ? (
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
                        ) : (
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
                        )}

                        {specialRequirements[uniqueKey] && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h5 className="text-sm font-semibold text-gray-700 mb-2">Special Requirements</h5>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{specialRequirements[uniqueKey]}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
            </div>
            );
          })}
        </div>

        {/* Document Generation Buttons */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => handleGenerateDocument('estimate')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            ESTIMATE
          </button>
          <button
            onClick={() => handleGenerateDocument('invoice')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            INVOICE
          </button>
          <button
            onClick={() => handleGenerateDocument('tax-invoice')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors"
          >
            TAX INVOICE
          </button>
        </div>

        {/* Product Exchange Section */}
        {booking && (
          <div className="mt-6 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <ProductExchange
              bookingId={booking.id}
              bookingDate={booking.booking_date}
              currentProducts={Array.isArray(booking.products) ? booking.products.filter((p: any) => p.status !== 'cancelled') : []}
              onExchangeComplete={fetchBooking}
              userRole="admin"
              bookingStatus={booking.status}
            />
          </div>
        )}

        {/* Payment Summary - Late Fees Display */}
        {paymentSummary && paymentSummary.products && (
          <div className="mt-6">
            {/* Check if any product has late fees */}
            {(() => {
              const productsWithLateFees = paymentSummary.products.filter((p: any) => 
                p.charges?.late_fee && p.charges.late_fee.due > 0
              );
              
              if (productsWithLateFees.length === 0) return null;
              
              const totalLateFees = productsWithLateFees.reduce((sum: number, p: any) => 
                sum + (p.charges.late_fee.due || 0), 0
              );
              
              return (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <h3 className="text-lg font-semibold text-yellow-900">Late Fees</h3>
                  </div>
                  
                  <div className="space-y-3">
                    {productsWithLateFees.map((product: any, index: number) => (
                      <div key={index} className="bg-white rounded-lg p-4 border border-yellow-200">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-gray-900">{product.name || 'Product'}</p>
                            <p className="text-sm text-gray-600">Code: {product.code || 'N/A'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-gray-600">Late Fee:</p>
                            <p className="text-lg font-bold text-yellow-700">
                              ₹{product.charges.late_fee.due.toLocaleString('en-IN')}
                            </p>
                            {product.charges.late_fee.paid > 0 && (
                              <p className="text-xs text-green-600 mt-1">
                                Paid: ₹{product.charges.late_fee.paid.toLocaleString('en-IN')}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    
                    <div className="bg-yellow-100 rounded-lg p-4 border border-yellow-300">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold text-yellow-900">Total Late Fees Due:</span>
                        <span className="text-2xl font-bold text-yellow-900">
                          ₹{totalLateFees.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 border-l-4 border-blue-400 p-3">
                      <p className="text-xs text-blue-800">
                        <strong>Note:</strong> Late fees are automatically calculated by the system when products are returned after their scheduled date. Use the Payment Management section below to record payments for these fees.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Payment Management Section */}
        <div className="mt-6">
          {/* Auto-cancel countdown for bookings with no payment */}
          {paymentSummary && paymentSummary.totals.total_paid === 0 && booking.status === 'pending' && (
            <div className="mb-4">
              <AutoCancelCountdown
                createdAt={booking.created_at}
                paidAmount={paymentSummary.totals.total_paid}
                onExpired={() => {
                  // Refresh booking data when countdown expires
                  fetchBooking();
                }}
              />
            </div>
          )}
          
          {/* Payment Management - Show read-only for fully cancelled bookings */}
          {(() => {
            const isFullyCancelled = booking?.status === 'cancelled';
            
            if (isFullyCancelled) {
              // Use backend payment summary for cancelled booking financial data
              const totalDue = paymentSummary?.totals.total_due || 0;
              const totalPaid = paymentSummary?.totals.total_paid || 0;
              const balance = paymentSummary?.totals.balance || 0;
              const penalties = (paymentSummary?.charges.penalties.due || 0) + (paymentSummary?.charges.penalties.paid || 0);
              
              return (
                <div className="space-y-4">
                  {/* Cancellation Summary */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <h3 className="text-lg font-semibold text-red-900">Booking Fully Cancelled</h3>
                    </div>
                    
                    {/* Financial Summary */}
                    <div className="bg-white rounded-lg p-4 mb-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">📊 Financial Summary</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-sm text-gray-600">Total Due:</span>
                          <span className="text-lg font-bold text-gray-900">₹{Math.floor(totalDue).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-gray-200">
                          <span className="text-sm text-gray-600">Total Paid:</span>
                          <span className="text-lg font-bold text-green-600">₹{Math.floor(totalPaid).toLocaleString('en-IN')}</span>
                        </div>
                        {penalties > 0 && (
                          <div className="flex justify-between items-center py-2 border-b border-gray-200">
                            <span className="text-sm text-gray-600">Penalties Applied:</span>
                            <span className="text-lg font-bold text-red-600">₹{Math.floor(penalties).toLocaleString('en-IN')}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center py-3 bg-gray-50 rounded px-3 mt-2">
                          <span className="text-sm font-semibold text-gray-800">Balance:</span>
                          <span className={`text-xl font-bold ${balance <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {balance <= 0 ? 'Fully Settled' : `₹${Math.floor(balance).toLocaleString('en-IN')}`}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-sm text-red-700">
                      All products in this booking have been cancelled. No further payments can be recorded.
                      Transaction history is available below for reference.
                    </p>
                  </div>
                  
                  {/* Payment History - Read Only */}
                  <PaymentManagement
                    bookingId={booking.id}
                    totalAmount={0}
                    securityDeposit={0}
                    userRole="admin"
                    isFullyCancelled={true}
                    onPaymentUpdate={() => {
                      fetchBooking();
                    }}
                    onStatusUpdate={handleStatusUpdate}
                  />
                </div>
              );
            }
            
            return (
              <PaymentManagement
                bookingId={booking.id}
                totalAmount={(() => {
                  if (!paymentSummary) return 0;
                  return (paymentSummary.charges.rent.due || 0) + (paymentSummary.charges.rent.paid || 0);
            })()}
            securityDeposit={paymentSummary ? (paymentSummary.charges.security.due || 0) + (paymentSummary.charges.security.paid || 0) : 0}
            userRole="admin"
            onPaymentUpdate={() => {
              fetchBooking(); // Refresh booking and transactions
            }}
            onStatusUpdate={handleStatusUpdate}
          />
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
    </div>
  );
}

