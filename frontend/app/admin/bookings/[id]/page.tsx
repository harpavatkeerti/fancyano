'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';
import { Button } from '@/components/common';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    method: 'cash' as 'cash' | 'upi' | 'card',
  });

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
      alert('Error loading booking');
    } finally {
      setLoading(false);
    }
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
      alert(`Error generating ${type}`);
    }
  }

  async function handleSendWhatsApp(type: 'estimate' | 'invoice' | 'tax-invoice') {
    if (!booking?.customer_phone) {
      alert('Customer phone number not available');
      return;
    }

    const phoneNumber = booking.customer_phone.replace(/\D/g, ''); // Remove non-digits
    const message = `Hi ${booking.customer_name}, your ${type} for booking #${booking.id} is ready. Visit our shop to collect your order.`;
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
  }

  async function handleRecordPayment() {
    try {
      const amount = parseFloat(paymentData.amount);
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount');
        return;
      }

      const newPaidAmount = (booking?.paid_amount || 0) + amount;
      const newDueAmount = (booking?.total_amount || 0) - newPaidAmount;

      await bookingsApi.update(booking!.id, {
        ...booking!,
        customer_phone: booking!.customer_phone || '',
        paid_amount: newPaidAmount,
        due_amount: newDueAmount,
        payment_method: paymentData.method,
        payment_status: newDueAmount <= 0 ? 'paid' : newPaidAmount > 0 ? 'partial' : 'unpaid',
      });

      alert('Payment recorded successfully');
      setShowPaymentModal(false);
      setPaymentData({ amount: '', method: 'cash' });
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
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Order Summary • Payment Due</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{booking.total_amount?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Security Deposit</span>
                <span>₹{booking.security_deposit?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total</span>
                <span>₹{((booking.total_amount || 0) + (booking.security_deposit || 0)).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Products List */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">Products</h3>
          {products.map((product: any, index: number) => (
            <div key={index} className="border rounded-lg p-4 mb-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-semibold text-lg">{product.name}</p>
                  <p className="text-sm text-gray-600">₹{product.rent_per_day?.toLocaleString()}/Day</p>
                </div>
              </div>
              <div className="text-sm text-gray-700">
                <p><strong>Dates:</strong> {new Date(product.booked_from || booking.booked_from).toLocaleDateString('en-GB')} To {new Date(product.booked_to || booking.booked_to).toLocaleDateString('en-GB')}</p>
              </div>
            </div>
          ))}
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

        {/* Payment Recording */}
        <button
          onClick={() => setShowPaymentModal(true)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg mb-2 transition-colors"
        >
          RECORD PAYMENT
        </button>

        {/* Payment Status */}
        <div className="bg-gray-100 rounded-lg p-4 mb-4">
          <div className="flex justify-between mb-2">
            <span className="font-semibold">Advance Paid:</span>
            <span className="text-green-600 font-bold">₹{booking.paid_amount?.toLocaleString() || 0}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Due:</span>
            <span className="text-red-600 font-bold">₹{booking.due_amount?.toLocaleString() || 0}</span>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Record Payment</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Enter Amount (in Rs.)*</label>
                <input
                  type="number"
                  placeholder="Enter"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Payment Method</label>
                <div className="space-x-4">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      checked={paymentData.method === 'cash'}
                      onChange={() => setPaymentData({ ...paymentData, method: 'cash' })}
                      className="mr-2"
                    />
                    Cash
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      checked={paymentData.method === 'upi'}
                      onChange={() => setPaymentData({ ...paymentData, method: 'upi' })}
                      className="mr-2"
                    />
                    UPI
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      checked={paymentData.method === 'card'}
                      onChange={() => setPaymentData({ ...paymentData, method: 'card' })}
                      className="mr-2"
                    />
                    Card
                  </label>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleRecordPayment}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg"
                >
                  CONFIRM
                </button>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

