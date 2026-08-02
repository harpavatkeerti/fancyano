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
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  
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
  }, []);

  async function fetchBookings() {
    try {
      const response = await bookingsApi.getAll();
      
      // Store ALL bookings for urgent checking
      setAllBookings(response.data);
      
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
    // A booking is pending if its status is 'pending'
    return booking.status === 'pending';
  }

  function getStatusIcon(status: string, booking: Booking) {
    // Use backend-provided status directly - backend calculates based on payments/refunds
    const displayStatus = booking.status || status;
    
    // Cancelled
    if (displayStatus === 'cancelled') {
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

    // Completed or Partially Completed
    if (displayStatus === 'completed' || displayStatus === 'partially_completed') {
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          {displayStatus === 'partially_completed' ? 'Partially Completed' : 'Completed'}
        </div>
      );
    }

    // In Progress / Under Process
    if (displayStatus === 'in_progress') {
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

    // Confirmed
    if (displayStatus === 'confirmed') {
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

    // Pending (default)
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
            const isUrgent = isBookingUrgent(booking);
            const urgentReason = isUrgent ? getUrgentReason(booking) : '';
            const canDelete = isPending(booking);
            
            return (
              <div
                key={booking.id}
                className="bg-white border border-gray-200 rounded-lg p-6 relative hover:shadow-lg transition-shadow"
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
                  href={`/bookings/${booking.id}`}
                  className="block"
                >
                  <div className="flex items-start gap-6">
                    {/* Product Images */}
                    <div className="flex gap-2">
                      {products.slice(0, 3).map((product: any, idx: number) => (
                        <div key={idx} className="text-center">
                          <div className="w-20 h-28 bg-gray-100 rounded-lg overflow-hidden">
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
                          <p className="text-[10px] text-gray-500 mt-1 truncate w-20">
                            {product.code}{product.size ? ` · ${product.size}` : ''}
                          </p>
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
                        Customer: {booking.user.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        Phone: {booking.user.phone}
                      </p>
                      <p className="text-sm text-gray-600">
                        Total: ₹{Math.floor(
                          ((booking as any).total_effective_rent || 0) + ((booking as any).transport_charge || 0)
                        )}
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

