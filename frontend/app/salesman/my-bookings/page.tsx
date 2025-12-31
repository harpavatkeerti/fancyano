'use client';

import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import Link from 'next/link';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    try {
      const response = await bookingsApi.getAll();
      // Filter for salesman's own bookings (in real app, filter by salesman ID)
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
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
          Order Return Pending
        </div>
      );
    }
    return status;
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
      <h1 className="text-3xl font-bold text-gray-900 mb-8">My Bookings</h1>

      {bookings.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No bookings found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {bookings.map((booking) => {
            const products = Array.isArray(booking.products) ? booking.products : [];
            return (
              <Link
                key={booking.id}
                href={`/salesman/order-details/${booking.id}`}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
              >
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
                    {getStatusIcon(booking.status)}
                    <p className="text-red-600 font-semibold mt-2">
                      Dates:{' '}
                      {new Date(booking.booked_from).toLocaleDateString('en-GB')} To{' '}
                      {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Customer: {booking.customer_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      Total: ₹{Math.floor(booking.total_amount || 0)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

