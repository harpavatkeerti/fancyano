'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { productsApi, bookingsApi } from '@/lib/api';
import { Product } from '@/types';
import Link from 'next/link';
import { getImageUrl } from '@/lib/imageHelper';
import { DateRangePicker } from '@/components/common';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [productBookings, setProductBookings] = useState<any[]>([]);

  useEffect(() => {
    if (params.id) {
      fetchProduct();
      fetchProductBookings();
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

  async function fetchProductBookings() {
    try {
      const response = await bookingsApi.getByProductId(Number(params.id));
      setProductBookings(response.data || []);
    } catch (error) {
      console.error('Error fetching product bookings:', error);
      setProductBookings([]);
    }
  }

  function handleAddToCart() {
    if (!dateFrom || !dateTo) {
      alert('Please select rental dates');
      return;
    }

    // Add to cart logic
    const cartItem = {
      product,
      dateFrom,
      dateTo,
      specialNotes,
    };

    // Store in localStorage
    const cart = JSON.parse(localStorage.getItem('salesman_cart') || '[]');
    cart.push(cartItem);
    localStorage.setItem('salesman_cart', JSON.stringify(cart));

    alert('Product added to cart!');
  }

  function handleBookNow() {
    if (!dateFrom || !dateTo) {
      alert('Please select rental dates');
      return;
    }

    // Add to cart and redirect
    handleAddToCart();
    router.push('/salesman/cart');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Product not found</div>
      </div>
    );
  }

  // Mock related products
  const relatedProducts = [];

  const colors = ['#FFA500', '#333333', '#000080']; // Example colors

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Product Detail Section */}
      <div className="grid grid-cols-2 gap-12 mb-12">
        {/* Product Images */}
        <div>
          <div className="aspect-[3/4] bg-gray-100 rounded-lg mb-4 overflow-hidden">
            {getImageUrl((product as any).image) ? (
              <img
                src={getImageUrl((product as any).image)!}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-6xl">👔</span>
              </div>
            )}
          </div>
          {/* Thumbnails */}
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border-2 border-orange-500 cursor-pointer"
              >
                {getImageUrl((product as any).image) ? (
                  <img
                    src={getImageUrl((product as any).image)!}
                    alt={`${product.name} ${idx}`}
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
        </div>

        {/* Product Info */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            ₹{Math.floor(product.rent_per_day)} / Day & ₹2000 (Deposit)
          </p>
          <p className="text-gray-600 mb-6">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
            incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam
          </p>

          {/* Color Selection */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Colors</h3>
            <div className="flex gap-2">
              {colors.map((color, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedColor(idx)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    selectedColor === idx ? 'border-gray-900' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Check Availability */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Check Availability</h3>
            <DateRangePicker
              label=""
              startDate={dateFrom}
              endDate={dateTo}
              onStartDateChange={(date) => setDateFrom(date)}
              onEndDateChange={(date) => setDateTo(date)}
              bookings={productBookings}
              productName={product.name}
              minDate={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* Special Notes */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Special Notes (if any):</h3>
            <input
              type="text"
              placeholder="Enter"
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleAddToCart}
              className="flex-1 px-6 py-3 text-red-600 bg-white border-2 border-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
            >
              🛒 ADD TO CART
            </button>
            <button
              onClick={handleBookNow}
              className="flex-1 px-6 py-3 text-white bg-red-600 rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              BOOK NOW
            </button>
          </div>
        </div>
      </div>

      {/* You might also like */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">You might also like</h2>
        <div className="grid grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className="bg-white rounded-lg overflow-hidden border border-gray-200">
              <div className="aspect-[3/4] bg-gray-100"></div>
              <div className="p-3">
                <p className="text-xs text-gray-500 mb-1">S-{1120 + idx}</p>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  Product Name
                </h3>
                <p className="text-red-600 font-bold text-sm">₹1,995 / Day</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warning Modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="flex items-start mb-4">
              <span className="text-3xl mr-3">⚠️</span>
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Warning</h3>
                <p className="text-gray-700">
                  This dress is booked 1 day before/after the selected date.
                  Do you still want to proceed?
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowWarning(false)}
                className="flex-1 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowWarning(false);
                  setIsAvailable(true);
                }}
                className="flex-1 px-4 py-2 text-white bg-red-600 rounded-lg font-medium hover:bg-red-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

