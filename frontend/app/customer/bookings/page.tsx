'use client';

import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';

export default function CustomerBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Function to check if a booking is urgent (based on tight scheduling with other bookings)
  function isBookingUrgent(booking: Booking): boolean {
    if (booking.status === 'cancelled') {
      return false;
    }

    const products = Array.isArray(booking.products) ? booking.products : [];
    
    for (const product of products) {
      const thisPickupDate = new Date(product.booked_from || booking.booked_from);
      const thisDropDate = new Date(product.booked_to || booking.booked_to);
      thisPickupDate.setHours(0, 0, 0, 0);
      thisDropDate.setHours(0, 0, 0, 0);

      for (const otherBooking of allBookings) {
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
            return true;
          }

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

      for (const otherBooking of allBookings) {
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

  useEffect(() => {
    fetchBookings();
    // Update timer every second for real-time countdown only
    const timerInterval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => {
      clearInterval(timerInterval);
    };
  }, []);

  async function fetchBookings() {
    try {
      // Get logged-in customer name FIRST
      const userData = localStorage.getItem('customer_user');
      let customerName = '';
      
      if (userData) {
        try {
          const user = JSON.parse(userData);
          customerName = user.name || user.userName || '';
        } catch (e) {
          customerName = localStorage.getItem('customer_name') || '';
        }
      } else {
        customerName = localStorage.getItem('customer_name') || '';
      }
      
      // If no customer is logged in, don't fetch bookings
      if (!customerName || customerName.trim() === '') {
        console.log('⚠️ No customer logged in, waiting for login...');
        setLoading(false);
        return;
      }
      
      const response = await bookingsApi.getAll();
      
      // Store ALL bookings for urgent checking
      setAllBookings(response.data);
      
      // Normalize names for comparison (case-insensitive, trimmed)
      const normalizeName = (name: string | null | undefined): string => {
        if (!name) return '';
        return name.trim().toLowerCase();
      };
      
      const normalizedCustomerName = normalizeName(customerName);
      
      console.log('🔍 Fetching bookings for customer:', customerName, '(normalized:', normalizedCustomerName + ')');
      console.log('📦 Total bookings from API:', response.data.length);
      
      // Filter bookings for this customer (match by customer_name in booking)
      const customerBookings = response.data.filter((booking: Booking) => {
        const bookingCustomerName = normalizeName(booking.customer_name);
        const matches = normalizedCustomerName && bookingCustomerName && bookingCustomerName === normalizedCustomerName;
        
        console.log(`🔎 Checking booking ${booking.id}:`);
        console.log(`   Booking customer_name: "${booking.customer_name}" (normalized: "${bookingCustomerName}")`);
        console.log(`   Logged-in customer: "${customerName}" (normalized: "${normalizedCustomerName}")`);
        console.log(`   Matches: ${matches ? '✅ YES' : '❌ NO'}`);
        
        return matches;
      });
      
      console.log('📋 Filtered customer bookings count:', customerBookings.length);
      
      setBookings(customerBookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(bookingId: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!confirm('Are you sure you want to cancel this booking? This action cannot be undone.')) {
      return;
    }

    try {
      await bookingsApi.delete(bookingId);
      await fetchBookings();
      alert('✅ Booking cancelled successfully');
    } catch (error) {
      console.error('Error deleting booking:', error);
      alert('❌ Failed to cancel booking. Please try again.');
    }
  }

  function isPending(booking: Booking): boolean {
    // A booking is pending if its status is 'pending'
    return booking.status === 'pending';
  }

  function calculateTimeRemaining(booking: Booking): { minutes: number; seconds: number } | null {
    if (!isPending(booking) || !booking.created_at) {
      return null;
    }

    const createdAt = new Date(booking.created_at).getTime();
    const now = currentTime; // Use currentTime state for real-time updates
    const elapsed = now - createdAt;
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    const remaining = fiveMinutes - elapsed;

    if (remaining <= 0) {
      return { minutes: 0, seconds: 0 };
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return { minutes, seconds };
  }

  function getStatusIcon(status: string) {
    if (status === 'confirmed') {
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
    } else if (status === 'pending') {
      return (
        <div className="flex items-center text-yellow-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Pending Confirmation
        </div>
      );
    } else if (status === 'completed') {
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
    } else if (status === 'cancelled') {
      return (
        <div className="flex items-center text-red-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          Cancelled
        </div>
      );
    }
    return status;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading bookings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">My Bookings</h1>
      
      {bookings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <div className="text-6xl mb-4">📦</div>
          <p className="text-gray-600 font-medium mb-2">No bookings found</p>
          <p className="text-sm text-gray-500 mb-4">Start browsing products to make a booking</p>
          <Link
            href="/customer/products"
            className="inline-block px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
          >
            Browse Products
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((booking) => {
            const canDelete = isPending(booking);
            const timeRemaining = calculateTimeRemaining(booking);
            const isExpired = timeRemaining && timeRemaining.minutes === 0 && timeRemaining.seconds === 0;
            const isUrgent = isBookingUrgent(booking);
            const urgentReason = isUrgent ? getUrgentReason(booking) : '';
            
            return (
              <div
                key={booking.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow relative"
              >
                {/* Urgent Badge */}
                {isUrgent && (
                  <div className="absolute top-4 right-4 z-10">
                    <span 
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded uppercase shadow-lg"
                      title={urgentReason}
                    >
                      URGENT
                    </span>
                  </div>
                )}
                
            <Link
              href={`/customer/bookings/${booking.id}`}
                  className="block"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-4">
                    <h3 className="text-xl font-bold text-gray-900">Order #{booking.id}</h3>
                    {getStatusIcon(booking.status)}
                  </div>
                      
                      {/* Payment Timer for Pending Bookings */}
                      {canDelete && timeRemaining && !isExpired && (
                        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            <p className="text-sm font-semibold text-yellow-800">
                              Pay within {timeRemaining.minutes}:{timeRemaining.seconds.toString().padStart(2, '0')} to confirm your booking
                            </p>
                          </div>
                          <p className="text-xs text-yellow-700">
                            Your booking will be automatically cancelled if payment is not recorded within 5 minutes.
                          </p>
                        </div>
                      )}
                      
                      {isExpired && canDelete && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm font-semibold text-red-800">
                            ⚠️ Booking expired - Please contact the store or create a new booking
                          </p>
                        </div>
                      )}
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-500">Booking Date</p>
                      <p className="font-medium text-gray-900">
                        {new Date(booking.booking_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Rental Period</p>
                      <p className="font-medium text-gray-900">
                        {new Date(booking.booked_from).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short'
                        })}{' '}
                        -{' '}
                        {new Date(booking.booked_to).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total Rent</p>
                      <p className="font-bold text-red-600 text-lg">
                        ₹{Math.floor(
                          ((booking as any).total_effective_rent || 0) + ((booking as any).transport_charge || 0)
                        ).toLocaleString('en-IN')}
                      </p>
                    </div>
                    {booking.security_deposit && (
                      <div>
                        <p className="text-sm text-gray-500">Security Deposit</p>
                        <p className="font-medium text-gray-900">
                          ₹{Math.floor(booking.security_deposit).toLocaleString('en-IN')}
                        </p>
                      </div>
                    )}
                  </div>

                  {booking.products && booking.products.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">Products ({booking.products.length})</p>
                      <div className="flex gap-2 flex-wrap">
                        {booking.products.slice(0, 3).map((product: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
                          >
                            {product.image && getImageUrl(product.image) ? (
                              <img
                                src={getImageUrl(product.image)!}
                                alt={product.name}
                                className="w-8 h-8 rounded object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center">
                                <span className="text-xs">👔</span>
                              </div>
                            )}
                            <span className="text-sm font-medium text-gray-900">
                              {product.name}
                            </span>
                          </div>
                        ))}
                        {booking.products.length > 3 && (
                          <div className="flex items-center bg-gray-50 rounded-lg px-3 py-2">
                            <span className="text-sm text-gray-600">
                              +{booking.products.length - 3} more
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="ml-4">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </Link>
                
                {/* Delete/Cancel Button for Pending Bookings */}
                {canDelete && (
                  <button
                    onClick={(e) => handleDelete(booking.id, e)}
                    className="absolute top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Cancel Booking
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

