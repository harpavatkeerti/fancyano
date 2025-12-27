'use client';

import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';

export default function CustomerBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBookings() {
      try {
        const response = await bookingsApi.getAll();
        setBookings(response.data);
      } catch (error) {
        console.error('Error fetching bookings:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchBookings();
  }, []);

  if (loading) {
    return <div className="text-center py-12">Loading bookings...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">My Bookings</h1>
        <div className="space-y-4">
          {bookings.map((booking) => (
            <div key={booking.id} className="bg-white p-6 rounded-lg shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold mb-2">Booking #{booking.id}</h3>
                  <p className="text-gray-600 mb-1">
                    <strong>Date:</strong> {new Date(booking.booking_date).toLocaleDateString()}
                  </p>
                  <p className="text-gray-600 mb-1">
                    <strong>Period:</strong> {new Date(booking.booked_from).toLocaleDateString()} -{' '}
                    {new Date(booking.booked_to).toLocaleDateString()}
                  </p>
                  {booking.total_amount && (
                    <p className="text-gray-600 mb-1">
                      <strong>Amount:</strong> ₹{booking.total_amount}
                    </p>
                  )}
                </div>
                <span
                  className={`px-3 py-1 text-sm rounded-full ${
                    booking.status === 'confirmed'
                      ? 'bg-green-100 text-green-800'
                      : booking.status === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : booking.status === 'completed'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {booking.status}
                </span>
              </div>
            </div>
          ))}
          {bookings.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No bookings found. <a href="/customer/products" className="text-blue-600 hover:underline">Browse products</a> to make a booking.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

