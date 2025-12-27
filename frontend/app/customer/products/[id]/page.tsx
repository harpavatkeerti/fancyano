'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { productsApi, bookingsApi } from '@/lib/api';
import { Product } from '@/types';
import { Button, Input } from '@/components/common';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingData, setBookingData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    booked_from: '',
    booked_to: '',
  });

  useEffect(() => {
    if (params.id) {
      fetchProduct();
    }
  }, [params.id]);

  async function fetchProduct() {
    try {
      const response = await productsApi.getById(Number(params.id));
      setProduct(response.data);
    } catch (error) {
      console.error('Error fetching product:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      await bookingsApi.create({
        ...bookingData,
        booking_date: today,
        products: [{ id: product.id, quantity: 1 }],
        total_amount: calculateTotal(),
      });
      alert('Booking created successfully!');
      router.push('/customer/bookings');
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Error creating booking');
    }
  }

  function calculateTotal() {
    if (!product || !bookingData.booked_from || !bookingData.booked_to) return 0;
    const from = new Date(bookingData.booked_from);
    const to = new Date(bookingData.booked_to);
    const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    return days * product.rent_per_day;
  }

  if (loading) {
    return <div className="text-center py-12">Loading product...</div>;
  }

  if (!product) {
    return <div className="text-center py-12">Product not found</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-gray-600">Product Code</p>
              <p className="font-semibold">{product.code}</p>
            </div>
            <div>
              <p className="text-gray-600">Rent per Day</p>
              <p className="text-2xl font-bold text-blue-600">₹{product.rent_per_day}</p>
            </div>
            {product.category && (
              <div>
                <p className="text-gray-600">Category</p>
                <p className="font-semibold">{product.category}</p>
              </div>
            )}
            <div>
              <p className="text-gray-600">Availability</p>
              <span
                className={`inline-block px-2 py-1 text-xs rounded ${
                  product.availability
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {product.availability ? 'Available' : 'Unavailable'}
              </span>
            </div>
          </div>
          {product.description && (
            <div className="mb-6">
              <p className="text-gray-600 mb-2">Description</p>
              <p>{product.description}</p>
            </div>
          )}

          {product.availability && (
            <Button onClick={() => setShowBookingForm(true)}>Book Now</Button>
          )}
        </div>

        {/* Booking Form Modal */}
        {showBookingForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-2xl font-bold mb-4">Create Booking</h2>
              <form onSubmit={handleBooking} className="space-y-4">
                <Input
                  label="Your Name*"
                  value={bookingData.customer_name}
                  onChange={(e) => setBookingData({ ...bookingData, customer_name: e.target.value })}
                  required
                />
                <Input
                  label="Phone Number*"
                  value={bookingData.customer_phone}
                  onChange={(e) => setBookingData({ ...bookingData, customer_phone: e.target.value })}
                  required
                />
                <Input
                  label="Address"
                  value={bookingData.customer_address}
                  onChange={(e) => setBookingData({ ...bookingData, customer_address: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="From Date*"
                    type="date"
                    value={bookingData.booked_from}
                    onChange={(e) => setBookingData({ ...bookingData, booked_from: e.target.value })}
                    required
                  />
                  <Input
                    label="To Date*"
                    type="date"
                    value={bookingData.booked_to}
                    onChange={(e) => setBookingData({ ...bookingData, booked_to: e.target.value })}
                    required
                  />
                </div>
                {bookingData.booked_from && bookingData.booked_to && (
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold">₹{calculateTotal()}</p>
                  </div>
                )}
                <div className="flex space-x-3">
                  <Button type="submit">Confirm Booking</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowBookingForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

