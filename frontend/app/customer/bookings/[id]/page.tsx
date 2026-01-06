'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { bookingsApi, paymentTransactionsApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';

export default function CustomerOrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showMeasurementsModal, setShowMeasurementsModal] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchBooking();
    }
  }, [params.id]);

  async function fetchBooking() {
    try {
      const [bookingResponse, transactionsResponse] = await Promise.all([
        bookingsApi.getById(Number(params.id)),
        paymentTransactionsApi.getByBookingId(Number(params.id)),
      ]);
      
      setBooking(bookingResponse.data);
      setTransactions(transactionsResponse.data || []);
    } catch (error) {
      console.error('Error fetching booking:', error);
      alert('Failed to load order details');
    } finally {
      setLoading(false);
    }
  }

  // Helper function to determine which products have refunds
  function getProductsWithRefunds(): Set<number> {
    const productsWithRefunds = new Set<number>();
    const refundTransactions = transactions.filter((t: any) => t.type === 'refund');
    const products = Array.isArray(booking?.products) ? booking.products : [];
    
    refundTransactions.forEach((transaction: any) => {
      const notes = transaction.notes || '';
      
      // Try to match product code in notes
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
        
        // Last resort: check if product code appears as a whole word AND product name is present
        const codePattern = new RegExp(`\\b${product.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (codePattern.test(notes) && notes.includes(product.name)) {
          productsWithRefunds.add(product.id);
        }
      });
    });
    
    return productsWithRefunds;
  }

  function getStatusIcon(status: string) {
    if (status === 'pending') {
      return (
        <div className="flex items-center text-yellow-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Payment Pending
        </div>
      );
    } else if (status === 'confirmed') {
      return (
        <div className="flex items-center text-green-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Order Confirmed
        </div>
      );
    } else if (status === 'in_progress') {
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          Under Process
        </div>
      );
    } else if (status === 'partially_completed') {
      return (
        <div className="flex items-center text-indigo-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Partially Completed
        </div>
      );
    } else if (status === 'completed') {
      return (
        <div className="flex items-center text-green-700">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Completed
        </div>
      );
    } else if (status === 'cancelled') {
      return (
        <div className="flex items-center text-red-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          Cancelled
        </div>
      );
    }
    return status;
  }

  function viewMeasurements(product: any) {
    setSelectedProduct(product);
    setShowMeasurementsModal(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading order details...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-red-600">Order not found</div>
      </div>
    );
  }

  const products = Array.isArray(booking.products) ? booking.products : [];
  const paidAmount = parseFloat(String(booking.paid_amount || 0));
  const totalAmount = parseFloat(String(booking.total_amount || 0));
  const securityDeposit = parseFloat(String(booking.security_deposit || 0));
  const balanceDue = Math.max(0, totalAmount - paidAmount);
  
  // Get set of product IDs that have refunds
  const productsWithRefunds = getProductsWithRefunds();
  
  // Check if all products have refunds (order is completed)
  const isOrderCompleted = products.length > 0 && products.every((p: any) => productsWithRefunds.has(p.id));
  const hasAnyRefund = productsWithRefunds.size > 0;
  const isPartiallyCompleted = hasAnyRefund && !isOrderCompleted;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button
            onClick={() => router.back()}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Bookings
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Order #{booking.id}</h1>
        </div>
        <div className="text-right">
          {getStatusIcon(booking.status)}
          <p className="text-sm text-gray-500 mt-1">
            Booked on {new Date(booking.booking_date).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          </p>
        </div>
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
              <p className="text-sm text-yellow-700">Some items have been refunded. Remaining items are still in process.</p>
            </div>
          </div>
        </div>
      )}

      {/* Order Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Order Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-500">Customer Name</p>
            <p className="font-medium text-gray-900">{booking.customer_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Phone</p>
            <p className="font-medium text-gray-900">{booking.customer_phone}</p>
          </div>
          {booking.customer_alternate_phone && (
            <div>
              <p className="text-sm text-gray-500">Alternate Phone</p>
              <p className="font-medium text-gray-900">{booking.customer_alternate_phone}</p>
            </div>
          )}
          {booking.customer_email && (
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium text-gray-900">{booking.customer_email}</p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-500">Total Amount</p>
            <p className="font-bold text-red-600 text-lg">₹{Math.floor(totalAmount).toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Paid Amount</p>
            <p className="font-bold text-green-600 text-lg">₹{Math.floor(paidAmount).toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Balance Due</p>
            <p className="font-bold text-orange-600 text-lg">₹{Math.floor(balanceDue).toLocaleString('en-IN')}</p>
          </div>
          {securityDeposit > 0 && (
            <div>
              <p className="text-sm text-gray-500">Security Deposit</p>
              <p className="font-medium text-gray-900">₹{Math.floor(securityDeposit).toLocaleString('en-IN')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Products */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Products ({products.length})</h2>
        <div className="space-y-4">
          {products.map((product: any, index: number) => {
            const imageUrl = getImageUrl(product.image);
            const hasMeasurements = product.measurements && Object.keys(product.measurements).length > 0;
            const isDropDatePassed = new Date(product.booked_to) < new Date();
            const hasRefund = productsWithRefunds.has(product.id);
            
            return (
              <div key={index} className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                hasRefund ? 'border-green-500 bg-green-50' : 'border-gray-200'
              }`}>
                {hasRefund && (
                  <div className="mb-3 flex items-center gap-2 text-green-700">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-semibold">Refund Processed</span>
                  </div>
                )}
                <div className="flex gap-4">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={product.name}
                      className="w-24 h-24 rounded object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded bg-gray-200 flex items-center justify-center">
                      <span className="text-2xl">👔</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">{product.name}</h3>
                        <p className="text-sm text-gray-500">Code: {product.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-600">₹{Math.floor(product.price || 0).toLocaleString('en-IN')}</p>
                        <p className="text-xs text-gray-500">per day</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <p className="text-xs text-gray-500">Pickup Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(product.booked_from).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Drop Date</p>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(product.booked_to).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    
                    {/* Measurements Button */}
                    <div className="mt-3">
                      {hasMeasurements ? (
                        <button
                          onClick={() => viewMeasurements(product)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                          View Measurements
                        </button>
                      ) : (
                        <div className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm inline-block">
                          No measurements added
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Payment History</h2>
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No transactions recorded</p>
        ) : (
          <div className="space-y-4">
            {/* Regular Transactions (payments, refunds) */}
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
                              {new Date(transaction.created_at || transaction.transaction_date).toLocaleDateString('en-IN', {
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
                          {transaction.recorded_by && (
                            <p className="text-xs text-gray-500 mt-2">
                              Recorded by: {transaction.recorded_by}
                            </p>
                          )}
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
                              <span className="px-2 py-1 rounded text-xs font-semibold uppercase text-purple-600 bg-purple-100">
                                DATE CHANGE CHARGE
                              </span>
                              <span className="text-sm text-gray-600">
                                {new Date(transaction.created_at || transaction.transaction_date).toLocaleDateString('en-IN', {
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
                            {transaction.recorded_by && (
                              <p className="text-xs text-gray-500 mt-2">
                                Recorded by: {transaction.recorded_by}
                              </p>
                            )}
                          </div>
                          <div className="text-right ml-4">
                            <p className="text-lg font-bold text-purple-600">
                              ₹{Math.floor(parseFloat(transaction.amount || '0')).toLocaleString('en-IN')}
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

      {/* Measurements Modal */}
      {showMeasurementsModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Measurements - {selectedProduct.name}</h3>
                <button
                  onClick={() => setShowMeasurementsModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                {selectedProduct.measurements && Object.entries(selectedProduct.measurements).map(([key, value]: [string, any]) => (
                  <div key={key} className="border-b border-gray-200 pb-3">
                    <p className="text-sm font-medium text-gray-700 capitalize">
                      {key.replace(/_/g, ' ')}
                    </p>
                    <p className="text-lg text-gray-900 mt-1">{value}</p>
                  </div>
                ))}
                
                {selectedProduct.special_requirements && (
                  <div className="border-b border-gray-200 pb-3">
                    <p className="text-sm font-medium text-gray-700">Special Requirements</p>
                    <p className="text-lg text-gray-900 mt-1">{selectedProduct.special_requirements}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowMeasurementsModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

