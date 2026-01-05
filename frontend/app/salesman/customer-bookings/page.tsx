'use client';

import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';

export default function CustomerBookingsPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
    // Refresh bookings every 10 seconds to check for auto-cancelled bookings
    const interval = setInterval(fetchBookings, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchBookings() {
    try {
      const response = await bookingsApi.getAll();
      
      // Filter for customer bookings (where created_by is null, empty, or undefined)
      // These are bookings created directly by customers, not by salesmen
      const filteredBookings = response.data.filter((booking: Booking) => {
        return !booking.created_by || booking.created_by.trim() === '';
      });
      
      setBookings(filteredBookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(bookingId: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    const confirmed = await confirm({
      title: 'Delete Booking',
      message: 'Are you sure you want to delete this booking? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: () => {},
      onCancel: () => {},
    });

    if (!confirmed) {
      return;
    }

    try {
      await bookingsApi.delete(bookingId);
      await fetchBookings();
      toast.success('Booking deleted successfully');
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast.error('Failed to delete booking. Please try again.');
    }
  }

  function isPending(booking: Booking): boolean {
    const paidAmount = typeof booking.paid_amount === 'number'
      ? booking.paid_amount
      : parseFloat(booking.paid_amount || '0') || 0;
    return paidAmount === 0 && booking.status === 'pending';
  }

  function getStatusIcon(status: string, booking: Booking) {
    // If status is already completed (refund processed), show completed
    if (status === 'completed') {
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Completed
        </div>
      );
    }

    // Calculate actual status based on payments
    const totalAmount = typeof booking.total_amount === 'number'
      ? booking.total_amount
      : parseFloat(booking.total_amount || '0') || 0;
    const securityDeposit = typeof booking.security_deposit === 'number'
      ? booking.security_deposit
      : parseFloat(booking.security_deposit || '0') || 0;
    const paidAmount = typeof booking.paid_amount === 'number'
      ? booking.paid_amount
      : parseFloat(booking.paid_amount || '0') || 0;

    const totalRequired = totalAmount + securityDeposit;
    const isFullyPaid = paidAmount >= totalRequired;
    const hasRentalPayment = paidAmount > 0;

    // Determine actual status
    let actualStatus = status;
    if (!hasRentalPayment) {
      actualStatus = 'pending';
    } else if (isFullyPaid) {
      // Check if multiple products with different dates
      const products = Array.isArray(booking.products) ? booking.products : [];
      if (products.length > 1) {
        const dates = products.map((p: any) => ({
          from: p.booked_from || booking.booked_from,
          to: p.booked_to || booking.booked_to
        }));
        const uniqueDates = new Set(dates.map(d => `${d.from}-${d.to}`));
        if (uniqueDates.size > 1) {
          actualStatus = 'in_progress'; // Partially Completed
        } else {
          actualStatus = 'in_progress'; // Under Process
        }
      } else {
        actualStatus = 'in_progress'; // Under Process
      }
    } else if (hasRentalPayment) {
      actualStatus = 'confirmed';
    }

    // Check if refund exists (completed)
    // Note: We'd need to fetch transactions to check, but for now use status
    if (status === 'completed' || actualStatus === 'completed') {
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Completed
        </div>
      );
    }

    if (actualStatus === 'in_progress') {
      // Check if it's partially completed (multiple products with different dates)
      const products = Array.isArray(booking.products) ? booking.products : [];
      if (products.length > 1) {
        const dates = products.map((p: any) => ({
          from: p.booked_from || booking.booked_from,
          to: p.booked_to || booking.booked_to
        }));
        const uniqueDates = new Set(dates.map(d => `${d.from}-${d.to}`));
        if (uniqueDates.size > 1) {
          return (
            <div className="flex items-center text-orange-600">
              <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Partially Completed
            </div>
          );
        }
      }
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
          Under Process
        </div>
      );
    }

    if (actualStatus === 'confirmed') {
      return (
        <div className="flex items-center text-green-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Order Confirmed
        </div>
      );
    }

    // Pending (no payment recorded)
    return (
      <div className="flex items-center text-gray-600">
        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
            clipRule="evenodd"
          />
        </svg>
        Payment Pending
      </div>
    );
  }

  function isUrgent(booking: Booking): boolean {
    const today = new Date();
    const returnDate = new Date(booking.booked_to);
    const daysUntilReturn = Math.ceil(
      (returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilReturn <= 2 && booking.status !== 'completed' && booking.status !== 'cancelled';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Customer Bookings</h1>

      {bookings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No bookings found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {bookings.map((booking) => {
            const products = Array.isArray(booking.products) ? booking.products : [];
            const urgent = isUrgent(booking);
            
            const canDelete = isPending(booking);
            
            return (
              <div
                key={booking.id}
                className="bg-white border border-gray-200 rounded-lg p-6 relative hover:shadow-lg transition-shadow"
              >
                <Link
                  href={`/salesman/order-details/${booking.id}`}
                  className="block"
                >
                  {/* Urgent Badge */}
                  {urgent && (
                    <div className="absolute top-4 right-20">
                      <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                        URGENT
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-6">
                    {/* Product Images */}
                    <div className="flex gap-2">
                      {products.slice(0, 3).map((product: any, idx: number) => (
                        <div key={idx} className="w-20 h-28 bg-gray-100 rounded-lg overflow-hidden">
                          {getImageUrl(product.image) ? (
                            <img
                              src={getImageUrl(product.image)!}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="text-2xl">👔</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Booking Details */}
                    <div className="flex-1">
                      {getStatusIcon(booking.status, booking)}
                      <p className="text-red-600 font-semibold mt-2">
                        Dates:{' '}
                        {new Date(booking.booked_from).toLocaleDateString('en-GB')} To{' '}
                        {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Customer: {booking.customer_name}
                      </p>
                      <p className="text-sm text-gray-600">
                        Phone: {booking.customer_phone}
                      </p>
                      <p className="text-sm text-gray-600">
                        Total: ₹{Math.floor(booking.total_amount || 0)}
                      </p>
                    </div>

                    {/* Created By Badge */}
                    <div>
                      <span className="inline-block border-2 border-red-600 text-red-600 text-xs font-semibold px-3 py-1 rounded-full">
                        {booking.created_by || 'By Customer'}
                      </span>
                    </div>
                  </div>
                </Link>
                
                {/* Delete Button for Pending Bookings */}
                {canDelete && (
                  <button
                    onClick={(e) => handleDelete(booking.id, e)}
                    className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {ConfirmDialogComponent}
    </div>
  );
}

