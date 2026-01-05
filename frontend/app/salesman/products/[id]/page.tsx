'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { productsApi, bookingsApi } from '@/lib/api';
import { Product } from '@/types';
import Link from 'next/link';
import { getImageUrl } from '@/lib/imageHelper';
import { DateRangePicker } from '@/components/common';
import { toast } from '@/lib/toast';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showWarning, setShowWarning] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [productBookings, setProductBookings] = useState<any[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string>('');

  useEffect(() => {
    if (params.id) {
      fetchProduct();
      fetchProductBookings();
    }
  }, [params.id]);

  // Listen for cart updates to re-validate availability
  useEffect(() => {
    function handleCartUpdate() {
      // Re-validate if dates are already selected
      if (dateFrom && dateTo && product) {
        const availability = checkAvailability(dateFrom, dateTo, product.id);
        if (!availability.available) {
          if (availability.conflictType === 'cart_item') {
            setAvailabilityError(availability.conflictDetails || 'This product is already in your cart for these dates');
          } else if (availability.conflictType === 'existing_booking') {
            setAvailabilityError(availability.conflictDetails || 'This product is already booked for these dates');
          } else {
            setAvailabilityError('Selected dates are not available');
          }
          setIsAvailable(false);
        } else {
          setAvailabilityError('');
          setIsAvailable(true);
        }
      }
    }

    window.addEventListener('cartUpdated', handleCartUpdate);
    return () => window.removeEventListener('cartUpdated', handleCartUpdate);
  }, [dateFrom, dateTo, product]);

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

  // Check if dates overlap with existing bookings or cart items
  function checkAvailability(dateFrom: string, dateTo: string, productId: number): { available: boolean; conflictType: string; conflictDetails?: string } {
    if (!dateFrom || !dateTo || !productId) {
      return { available: false, conflictType: 'invalid_dates' };
    }

    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(0, 0, 0, 0);

    // Check against existing bookings in database
    for (const booking of productBookings) {
      if (!booking.booked_from || !booking.booked_to) continue;
      
      const bookingFrom = new Date(booking.booked_from);
      const bookingTo = new Date(booking.booked_to);
      bookingFrom.setHours(0, 0, 0, 0);
      bookingTo.setHours(0, 0, 0, 0);
      
      // Check if dates overlap: fromDate <= bookingTo && toDate >= bookingFrom
      if (fromDate <= bookingTo && toDate >= bookingFrom) {
        return {
          available: false,
          conflictType: 'existing_booking',
          conflictDetails: `Product is already booked from ${new Date(booking.booked_from).toLocaleDateString('en-GB')} to ${new Date(booking.booked_to).toLocaleDateString('en-GB')}`
        };
      }
    }

    // Check against items already in cart
    try {
      const cart = JSON.parse(localStorage.getItem('salesman_cart') || '[]');
      console.log('🔍 Checking cart for conflicts:', {
        productId,
        cartLength: cart.length,
        requestedDates: { from: dateFrom, to: dateTo }
      });
      
      for (const item of cart) {
        // Check if this cart item is for the same product
        const itemProductId = item.product?.id || item.product_id;
        if (!itemProductId || itemProductId !== productId) {
          continue;
        }
        
        // Get dates from cart item (handle both dateFrom/dateTo and booked_from/booked_to)
        const cartDateFrom = item.dateFrom || item.booked_from;
        const cartDateTo = item.dateTo || item.booked_to;
        
        if (!cartDateFrom || !cartDateTo) {
          console.log('⚠️ Cart item missing dates:', item);
          continue;
        }
        
        const cartFrom = new Date(cartDateFrom);
        const cartTo = new Date(cartDateTo);
        cartFrom.setHours(0, 0, 0, 0);
        cartTo.setHours(0, 0, 0, 0);
        
        console.log('🔍 Comparing dates:', {
          requested: { from: fromDate.toISOString(), to: toDate.toISOString() },
          cartItem: { from: cartFrom.toISOString(), to: cartTo.toISOString() },
          overlap: fromDate <= cartTo && toDate >= cartFrom
        });
        
        // Check if dates overlap: fromDate <= cartTo && toDate >= cartFrom
        if (fromDate <= cartTo && toDate >= cartFrom) {
          console.log('❌ Overlap detected!');
          return {
            available: false,
            conflictType: 'cart_item',
            conflictDetails: `This product is already in your cart for dates ${new Date(cartDateFrom).toLocaleDateString('en-GB')} to ${new Date(cartDateTo).toLocaleDateString('en-GB')}`
          };
        }
      }
      
      console.log('✅ No cart conflicts found');
    } catch (error) {
      console.error('Error checking cart:', error);
    }

    return { available: true, conflictType: 'none' };
  }

  // Validate dates when they change
  useEffect(() => {
    if (dateFrom && dateTo && product) {
      const availability = checkAvailability(dateFrom, dateTo, product.id);
      if (!availability.available) {
        if (availability.conflictType === 'cart_item') {
          setAvailabilityError(availability.conflictDetails || 'This product is already in your cart for these dates');
        } else if (availability.conflictType === 'existing_booking') {
          setAvailabilityError(availability.conflictDetails || 'This product is already booked for these dates');
        } else {
          setAvailabilityError('Selected dates are not available');
        }
        setIsAvailable(false);
      } else {
        setAvailabilityError('');
        setIsAvailable(true);
      }
    } else {
      setAvailabilityError('');
      setIsAvailable(true);
    }
  }, [dateFrom, dateTo, product]);

  function handleAddToCart() {
    if (!dateFrom || !dateTo) {
      toast.warning('Please select rental dates');
      return;
    }

    if (!product) {
      toast.error('Product information is missing');
      return;
    }

    // Check availability before adding to cart
    const availability = checkAvailability(dateFrom, dateTo, product.id);
    
    if (!availability.available) {
      if (availability.conflictType === 'existing_booking') {
        toast.error(`Product Not Available!\n\n${availability.conflictDetails}\n\nPlease select different dates.`);
      } else if (availability.conflictType === 'cart_item') {
        toast.warning(`Product Already in Cart!\n\n${availability.conflictDetails}\n\nPlease remove it from cart first or select different dates.`);
      } else {
        toast.error('Selected dates are not available. Please choose different dates.');
      }
      return;
    }

    // Add to cart logic
    const cartItem = {
      product,
      dateFrom,
      dateTo,
      specialNotes: '', // Will be set on cart page
    };

    // Store in localStorage
    const cart = JSON.parse(localStorage.getItem('salesman_cart') || '[]');
    const isFirstItem = cart.length === 0;
    cart.push(cartItem);
    localStorage.setItem('salesman_cart', JSON.stringify(cart));

    // Store timestamp when first product is added to cart
    if (isFirstItem) {
      localStorage.setItem('salesman_cart_created_at', Date.now().toString());
      console.log('🕐 Cart timer started:', new Date().toISOString());
    }

    // Dispatch event to update cart count in header
    window.dispatchEvent(new Event('cartUpdated'));

    toast.success('Product added to cart!');
  }

  function handleBookNow() {
    if (!dateFrom || !dateTo) {
      toast.warning('Please select rental dates');
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
            {availabilityError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-sm text-red-700 font-medium">{availabilityError}</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleAddToCart}
              disabled={!isAvailable || !dateFrom || !dateTo}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                !isAvailable || !dateFrom || !dateTo
                  ? 'text-gray-400 bg-gray-100 border-2 border-gray-300 cursor-not-allowed'
                  : 'text-red-600 bg-white border-2 border-red-600 hover:bg-red-50'
              }`}
            >
              🛒 ADD TO CART
            </button>
            <button
              onClick={handleBookNow}
              disabled={!isAvailable || !dateFrom || !dateTo}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                !isAvailable || !dateFrom || !dateTo
                  ? 'text-gray-400 bg-gray-300 cursor-not-allowed'
                  : 'text-white bg-red-600 hover:bg-red-700'
              }`}
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

