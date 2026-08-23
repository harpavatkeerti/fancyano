'use client';

import { useEffect, useState } from 'react';
import { bookingsApi, availabilityApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from '@/components/common/AlertBanner';
import { useConfirm } from '@/hooks/useConfirm';
import { isBookingUrgent, getUrgentReason, isPending } from '@/lib/bookingHelpers';
import { BookingStatusIcon } from '@/components/common/BookingStatusIcon';

export default function CustomerBookingsPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [urgentBookingsMap, setUrgentBookingsMap] = useState<Record<number, { is_urgent: boolean; reasons: string[] }>>({});
  const [loading, setLoading] = useState(true);
  


  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    try {
      const response = await bookingsApi.getAll();
      
      // Store ALL bookings for display
      setAllBookings(response.data);
      
      // Filter for customer bookings (where created_by is null, empty, or undefined)
      // These are bookings created directly by customers, not by salesmen
      const filteredBookings = response.data.filter((booking: Booking) => {
        return !booking.created_by || booking.created_by.trim() === '';
      });
      
      setBookings(filteredBookings);

      // Fetch urgency status for active bookings from the backend
      const activeBookingIds = response.data
        .filter((b: any) => !['cancelled', 'completed', 'discarded'].includes(b.status))
        .map((b: any) => b.id);
      if (activeBookingIds.length > 0) {
        try {
          const urgentResponse = await availabilityApi.getUrgentBulk(activeBookingIds);
          setUrgentBookingsMap(urgentResponse.data);
        } catch (err) {
          console.error('Error fetching urgent status:', err);
        }
      }
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
      addAlert('Failed to delete booking. Please try again.');
    }
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
      {/* Inline alert banner */}
      <AlertBanner alerts={alerts} onDismiss={removeAlert} className="mb-4" />
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Customer Bookings</h1>

      {bookings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No bookings found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {bookings.map((booking) => {
            const products = Array.isArray(booking.products) ? booking.products : [];
            const isUrgent = isBookingUrgent(booking.id, urgentBookingsMap);
            const urgentReason = isUrgent ? getUrgentReason(booking.id, urgentBookingsMap) : '';
            const canDelete = isPending(booking.status);
            
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
                      <BookingStatusIcon booking={booking} />
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

