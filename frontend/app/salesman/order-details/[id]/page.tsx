'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import { DateRangePicker } from '@/components/common';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEstimate, setShowEstimate] = useState(false);
  const [showChangeDateModal, setShowChangeDateModal] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Change date form
  const [changeDateFrom, setChangeDateFrom] = useState('');
  const [changeDateTo, setChangeDateTo] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [productBookingsForChange, setProductBookingsForChange] = useState<any[]>([]);

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');

  useEffect(() => {
    if (params.id) {
      fetchBooking();
    }
  }, [params.id]);

  async function fetchBooking() {
    try {
      const response = await bookingsApi.getById(Number(params.id));
      setBooking(response.data);
    } catch (error) {
      console.error('Error fetching booking:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateDocument(type: 'estimate' | 'invoice' | 'tax-invoice') {
    try {
      const response = await axios.post(
        `${API_URL}/invoices/${type}/${booking?.id}`,
        {},
        { responseType: 'blob' }
      );

      // Download PDF
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_${booking?.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      // Show preview modal for estimate
      if (type === 'estimate') {
        setShowEstimate(true);
      }
    } catch (error) {
      console.error(`Error generating ${type}:`, error);
      alert(`Document generated! (In production, this would download the ${type})`);
      
      // Show preview for demonstration
      if (type === 'estimate') {
        setShowEstimate(true);
      }
    }
  }

  function handleEditDate(product: any) {
    setSelectedProduct(product);
    setChangeDateFrom(product.booked_from?.split('T')[0] || '');
    setChangeDateTo(product.booked_to?.split('T')[0] || '');
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
      alert('Please provide a reason for date change');
      return;
    }

    try {
      // Update booking with new dates
      const updatedProducts = booking!.products.map((p: any) =>
        p.id === selectedProduct.id
          ? { ...p, booked_from: changeDateFrom, booked_to: changeDateTo }
          : p
      );

      await bookingsApi.update(booking!.id, {
        ...booking!,
        products: updatedProducts.map((p: any) => ({
          id: p.id,
          booked_from: p.booked_from,
          booked_to: p.booked_to,
        })),
      });

      alert('Booking date updated successfully!');
      setShowChangeDateModal(false);
      setChangeReason('');
      fetchBooking();
    } catch (error) {
      console.error('Error updating booking date:', error);
      alert('Error updating booking date');
    }
  }

  async function handleRecordPayment() {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      const newPaidAmount = (booking?.paid_amount || 0) + amount;
      const newDueAmount = (booking?.total_amount || 0) - newPaidAmount;

      await bookingsApi.update(booking!.id, {
        ...booking!,
        paid_amount: newPaidAmount,
        due_amount: newDueAmount,
        payment_status:
          newDueAmount <= 0 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid',
      });

      alert('Payment recorded successfully!');
      setShowRecordPayment(false);
      setPaymentAmount('');
      fetchBooking();
    } catch (error) {
      console.error('Error recording payment:', error);
      alert('Error recording payment');
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

      <div className="grid grid-cols-3 gap-8">
        {/* Left Side - Product Cards */}
        <div className="col-span-2 space-y-4">
          {products.map((product: any, index: number) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-lg p-6 flex gap-6"
            >
              <div className="w-32 h-40 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                {getImageUrl(product.image) ? (
                  <img
                    src={getImageUrl(product.image)!}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-4xl">👔</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-1">
                  {product.name}
                </h3>
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
              {booking.special_requirements && (
                <p className="text-sm text-gray-600">
                  Special Notes: {booking.special_requirements}
                </p>
              )}
              <p className="text-sm text-gray-900">
                {booking.customer_address || 'No address provided'}
              </p>
            </div>
          </div>

          {/* Order Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Order Summary
              </h3>
              <span className="text-red-600 font-semibold">• Payment Due</span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">
                  ₹{Math.floor(booking.total_amount || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Security Deposit</span>
                <span className="font-medium">
                  ₹{Math.floor(booking.security_deposit || 4000).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-3">
                <span>Total</span>
                <span>
                  ₹
                  {Math.floor(
                    (booking.total_amount || 0) + (booking.security_deposit || 4000)
                  ).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Record Payment Button */}
          <button
            onClick={() => setShowRecordPayment(true)}
            className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
          >
            RECORD PAYMENT
          </button>
        </div>
      </div>

      {/* Estimate Preview Modal */}
      {showEstimate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Estimate</h2>
                <div className="flex items-center gap-4">
                  <button className="text-gray-600 hover:text-gray-900">
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
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => setShowEstimate(false)}
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
              </div>

              {/* Estimate Document Preview */}
              <div className="border border-gray-300 bg-white">
                {/* Header */}
                <div className="flex justify-between items-start p-6 pb-4">
                  <div>
                    <div className="bg-red-600 text-white inline-block px-3 py-1 font-bold text-sm mb-1">
                      FAN-C-YA-NO
                    </div>
                    <p className="text-xs font-semibold mb-3">Wedding Dress Rental</p>
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold">Fancyano</p>
                      <p className="font-semibold">Wedding Dress, Fancy Dress & Artificial Jewellery</p>
                      <p className="leading-tight text-gray-700">
                        23, 1st Floor, Shobhagpura, Main 100 Feet Road, Near SBI Bank,<br />
                        Udaipur (Raj.), 313001
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-bold text-sm mb-2">Order ID: {booking.id}</p>
                    <div className="space-y-0.5 text-gray-700">
                      <p className="font-semibold text-gray-900">Shop Timings:</p>
                      <p>Mon to Sat: 11 am to 6 pm</p>
                      <p>Sunday Closed</p>
                      <p className="font-semibold text-gray-900 mt-2">Phone: {booking.customer_phone || '9876543210'}</p>
                      <p>{booking.customer_phone || '9876543210'}</p>
                      <p className="font-semibold text-gray-900">Paytm: 9876543210</p>
                    </div>
                  </div>
                </div>

                {/* Booking and Customer Details */}
                <div className="bg-gray-50 px-6 py-4 border-t border-b border-gray-200">
                  <div className="grid grid-cols-2 gap-12 text-xs">
                    <div className="space-y-3">
                      <div>
                        <p className="text-gray-500 text-[11px] mb-1">Booking Date:</p>
                        <p className="font-semibold text-gray-900">{new Date(booking.booking_date).toLocaleDateString('en-GB')}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[11px] mb-1">Rental Dates:</p>
                        <p className="font-semibold text-gray-900">
                          {new Date(booking.booked_from).toLocaleDateString('en-GB')} - {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="text-gray-500 text-[11px] mb-1">Customer Details:</p>
                        <p className="font-semibold text-gray-900">{booking.customer_name} {booking.customer_phone}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-[11px] mb-1">Address:</p>
                        <p className="text-gray-900">{booking.customer_address || 'Lorem ipsum dolor sit amet, consectetur adipiscing elit'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="px-6 py-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-300">
                        <th className="text-left py-2.5 px-3 font-semibold text-gray-600 text-[11px]">S.NO.</th>
                        <th className="text-left py-2.5 px-3 font-semibold text-gray-600 text-[11px]">ITEMS</th>
                        <th className="text-center py-2.5 px-3 font-semibold text-gray-600 text-[11px]">QUANTITY</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-[11px]">RENT</th>
                        <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-[11px]">TOTAK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product: any, index: number) => (
                        <tr key={index} className="border-b border-gray-200">
                          <td className="py-3 px-3 text-gray-900">{index + 1}</td>
                          <td className="py-3 px-3 text-gray-900">{product.name}</td>
                          <td className="text-center py-3 px-3 text-gray-900">₹{Math.floor(product.rent_per_day)}</td>
                          <td className="text-right py-3 px-3 text-gray-900">₹{booking.transportation_opted ? '20' : '20'}</td>
                          <td className="text-right py-3 px-3 text-gray-900">₹{Math.floor(product.rent_per_day) + 20}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Totals */}
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-end items-center">
                      <div className="w-64 flex justify-between">
                        <span className="text-xs text-gray-600">Total</span>
                        <span className="text-xs font-semibold text-gray-900">₹{Math.floor(booking.total_amount || 0)}</span>
                      </div>
                    </div>
                    <div className="flex justify-end items-center">
                      <div className="w-64 flex justify-between">
                        <span className="text-xs text-gray-600">Other Charges</span>
                        <span className="text-xs font-semibold text-gray-900">₹20</span>
                      </div>
                    </div>
                    <div className="flex justify-end items-center pt-2 border-t border-gray-300">
                      <div className="w-64 flex justify-between">
                        <span className="text-xs font-bold text-gray-900">Grand Total</span>
                        <span className="text-xs font-bold text-gray-900">₹{Math.floor((booking.total_amount || 0) + 20)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pay Details Section */}
                <div className="bg-gray-50 px-6 py-6 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-12 text-xs">
                    <div>
                      <p className="text-gray-500 text-[11px] font-semibold mb-3">PAY DETAILS:</p>
                      <div className="space-y-3">
                        <p className="font-semibold text-gray-900">Total Rent + Security Deposit</p>
                        <div className="space-y-2 text-gray-900">
                          <p className="font-semibold">Advance Paid:</p>
                          <p className="font-semibold pl-8">Due:</p>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-500 text-[11px] font-semibold mb-3">AUTHORISED BALANCE AMT:</p>
                      <div className="space-y-2 text-gray-900 font-semibold">
                        <p>Total Deposit:</p>
                        <p>Damage:</p>
                        <p>Lost:</p>
                        <p>Late Charges:</p>
                        <p className="pt-1">Total Refund:</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-300 text-center">
                  <div className="inline-block border-2 border-gray-900 rounded-full px-6 py-1.5 mb-3">
                    <p className="text-[11px] font-bold text-gray-900">
                      NO CANCELLATION &nbsp;|&nbsp; NO EXCHANGE, NO REFUND
                    </p>
                  </div>
                  <p className="text-[11px] text-gray-700 leading-relaxed max-w-3xl mx-auto">
                    सही पहचान पत्र की फोटोकॉपी लाना अनिवार्य है अन्यथा आपकी बुक कराई गई ड्रेस या ज्वेलरी नहीं दी जायेगी एवं सिक्योरिटी रिफंड में 4-5 Working Days का समय लग सकता है
                  </p>
                </div>
              </div>
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
                onClick={() => setShowChangeDateModal(false)}
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
                {getImageUrl(selectedProduct.image) && (
                  <img
                    src={getImageUrl(selectedProduct.image)!}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 mb-1">
                  {selectedProduct.name}
                </h3>
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
                onClick={() => setShowRecordPayment(false)}
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

            <button
              onClick={handleRecordPayment}
              className="w-full max-w-sm mx-auto block px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              CONFIRM
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

