'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingsApi, paymentTransactionsApi } from '@/lib/api';
import { Booking } from '@/types';
import { Button, PaymentManagement } from '@/components/common';
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
  const [measurements, setMeasurements] = useState<{[key: number]: any}>({});
  const [specialRequirements, setSpecialRequirements] = useState<{[key: number]: string}>({});
  const [showMeasurements, setShowMeasurements] = useState<{[key: number]: boolean}>({});

  useEffect(() => {
    if (params.id) {
      fetchBooking();
    }
  }, [params.id]);

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
          setMeasurements(measurementsData || {});
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
            setSpecialRequirements(specialReqsData);
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
    } catch (error) {
      console.error('Error fetching booking:', error);
      toast.error('Error loading booking');
    } finally {
      setLoading(false);
    }
  }

  // Calculate booking status based on payments and refunds (same logic as salesman portal)
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

    // Check for per-item refunds
    const products = Array.isArray(booking.products) ? booking.products : [];
    const refundTransactions = transactions.filter((t: any) => t.type === 'refund');
    
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
    
    // If all products have refunds, status is completed
    if (allProductsHaveRefunds) {
      return 'completed';
    }
    
    // If some products have refunds, status is in_progress (Partially Completed)
    if (hasAnyRefund) {
      return 'in_progress';
    }

    // Check if Rent + Deposit is fully received
    const totalRequired = totalAmount + securityDeposit;
    const isFullyPaid = paidAmount >= totalRequired;

    if (isFullyPaid) {
      // Check if multiple products with different dates
      if (products.length > 1) {
        // Check if products have different dates
        const dates = products.map((p: any) => ({
          from: p.booked_from || booking.booked_from,
          to: p.booked_to || booking.booked_to
        }));
        
        const uniqueDates = new Set(dates.map(d => `${d.from}-${d.to}`));
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

  function getStatusDisplay(status: string): { text: string; color: string } {
    const calculatedStatus = calculateBookingStatus();
    
    switch (calculatedStatus) {
      case 'completed':
        return { text: 'Completed', color: 'text-blue-600' };
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

  function handleStatusUpdate(newStatus: string) {
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
      const response = await axios.post(`${API_URL}/invoices/${type}/${booking?.id}`, {}, {
        responseType: 'blob'
      });
      
      // Download PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_${booking?.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error(`Error generating ${type}:`, error);
      toast.error(`Error generating ${type}`);
    }
  }

  async function handleSendWhatsApp(type: 'estimate' | 'invoice' | 'tax-invoice') {
    if (!booking?.customer_phone) {
      toast.warning('Customer phone number not available');
      return;
    }

    const phoneNumber = booking.customer_phone.replace(/\D/g, ''); // Remove non-digits
    const message = `Hi ${booking.customer_name}, your ${type} for booking #${booking.id} is ready. Visit our shop to collect your order.`;
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
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
          <h1 className="text-3xl font-bold text-gray-900">Order Details</h1>
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
              const isTransportationOpted = booking.transportation_opted === true || 
                                            booking.transportation_opted === 'true' || 
                                            booking.transportation_opted === 1;
              if (isTransportationOpted) {
                return (
                  <div className="mt-3 p-2 bg-teal-50 border border-teal-200 rounded">
                    <p className="text-xs text-teal-700 font-semibold">🚚 Local Transportation: Opted</p>
                    <p className="text-xs text-teal-600">Charge: ₹{Math.floor(parseFloat(booking.other_charges || '0')).toLocaleString('en-IN')}</p>
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
                <span>₹{Math.floor(
                  typeof booking.total_amount === 'number' 
                    ? booking.total_amount 
                    : parseFloat(booking.total_amount || '0') || 0
                ).toLocaleString('en-IN')}</span>
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
                      <span className="text-sm text-teal-700 font-semibold">₹{Math.floor(transportationCharge).toLocaleString('en-IN')}</span>
                    </div>
                  );
                }
                return null;
              })()}
              <div className="flex justify-between">
                <span>Security Deposit</span>
                <span>₹{Math.floor(
                  typeof booking.security_deposit === 'number'
                    ? booking.security_deposit
                    : parseFloat(booking.security_deposit || '0') || 0
                ).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total</span>
                <span>₹{(() => {
                  const totalAmount = typeof booking.total_amount === 'number'
                    ? booking.total_amount
                    : parseFloat(booking.total_amount || '0') || 0;
                  const securityDeposit = typeof booking.security_deposit === 'number'
                    ? booking.security_deposit
                    : parseFloat(booking.security_deposit || '0') || 0;
                  // Transportation is already included in totalAmount, don't add it again
                  const total = totalAmount + securityDeposit;
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
            const productMeasurements = measurements[product.id] || {};
            const hasMeasurements = Object.keys(productMeasurements).length > 0;
            const isFemale = isFemaleClothing(product.name);
            const isMale = isMaleClothing(product.name);
            const isExpanded = showMeasurements[product.id] || false;

            return (
              <div key={index} className="border rounded-lg p-4 mb-4">
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
                      <p className="font-semibold text-lg">{product.name}</p>
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
                      <p className="text-sm text-gray-600 mt-1">₹{product.rent_per_day?.toLocaleString()}/Day</p>
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
                        [product.id]: !isExpanded
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

                        {specialRequirements[product.id] && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <h5 className="text-sm font-semibold text-gray-700 mb-2">Special Requirements</h5>
                            <div className="bg-white rounded-lg p-3 border border-gray-200">
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{specialRequirements[product.id]}</p>
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

        {/* Payment Management Section */}
        <div className="mt-6">
          <PaymentManagement
            bookingId={booking.id}
            totalAmount={
              typeof booking.total_amount === 'number'
                ? booking.total_amount
                : parseFloat(booking.total_amount || '0') || 0
            }
            securityDeposit={
              typeof booking.security_deposit === 'number'
                ? booking.security_deposit
                : parseFloat(booking.security_deposit || '0') || 0
            }
            onPaymentUpdate={() => {
              fetchBooking(); // Refresh booking and transactions
            }}
            onStatusUpdate={handleStatusUpdate}
          />
        </div>
      </div>
    </div>
  );
}

