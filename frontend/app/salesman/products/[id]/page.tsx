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
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAvailable, setIsAvailable] = useState(true);
  const [productBookings, setProductBookings] = useState<any[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string>('');
  
  // Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');
  const [pendingAddToCart, setPendingAddToCart] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchProduct();
      fetchProductBookings();
    }
  }, [params.id]);

  // Reset image index when product changes
  useEffect(() => {
    setCurrentImageIndex(0);
  }, [product]);

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

  async function checkTightSchedule() {
    if (!product || !dateFrom || !dateTo) {
      return { hasTightSchedule: false, message: '' };
    }

    try {
      const response = await bookingsApi.getAll();
      const allBookings = response.data;
      const warnings: string[] = [];

      const thisPickupDate = new Date(dateFrom);
      const thisDropDate = new Date(dateTo);
      thisPickupDate.setHours(0, 0, 0, 0);
      thisDropDate.setHours(0, 0, 0, 0);

      for (const otherBooking of allBookings) {
        if (otherBooking.status === 'cancelled' || otherBooking.status === 'completed') continue;

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
            warnings.push(`${product.name} (${product.code}) is booked ${daysBetweenDropAndPickup} day before your selected date.`);
            break;
          }

          const daysBetweenDropAndNextPickup = Math.ceil((otherPickupDate.getTime() - thisDropDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysBetweenDropAndNextPickup > 0 && daysBetweenDropAndNextPickup <= 2) {
            warnings.push(`${product.name} (${product.code}) is booked ${daysBetweenDropAndNextPickup} day after your selected date.`);
            break;
          }
        }
      }

      if (warnings.length > 0) {
        return {
          hasTightSchedule: true,
          message: warnings.join(' ')
        };
      }

      return { hasTightSchedule: false, message: '' };
    } catch (error) {
      console.error('Error checking tight schedule:', error);
      return { hasTightSchedule: false, message: '' };
    }
  }

  async function handleAddToCart(): Promise<boolean> {
    if (!dateFrom || !dateTo) {
      toast.warning('Please select rental dates');
      return false;
    }

    if (!product) {
      toast.error('Product information is missing');
      return false;
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
      return false;
    }

    // Check for tight schedule (bookings within 2 days)
    const tightScheduleCheck = await checkTightSchedule();
    if (tightScheduleCheck.hasTightSchedule) {
      setWarningMessage(tightScheduleCheck.message);
      setShowWarningModal(true);
      setPendingAddToCart(true);
      // Navigation will happen after the user confirms the warning modal
      return false;
    }

    addToCartConfirmed();
    return true;
  }

  function addToCartConfirmed() {

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

  async function handleBookNow() {
    if (!dateFrom || !dateTo) {
      toast.warning('Please select rental dates');
      return;
    }

    // Add to cart and redirect only if successfully added
    const added = await handleAddToCart();
    if (added) {
      router.push('/salesman/cart');
    }
    // If not added (e.g. tight schedule warning modal shown), don't navigate yet.
    // The warning modal's Continue button will call addToCartConfirmed() and then navigate.
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
          {(() => {
            // Helper to get images array
            const getImages = (img: any): string[] => {
              if (!img) return [];
              if (Array.isArray(img)) return img;
              // Try to parse as JSON array
              if (typeof img === 'string' && img.trim().startsWith('[')) {
                try {
                  const parsed = JSON.parse(img);
                  if (Array.isArray(parsed)) return parsed;
                } catch (e) {
                  // Not JSON, treat as single image
                }
              }
              // Single image
              return img ? [img] : [];
            };
            
            const images = getImages((product as any).image);
            const imageUrls = images.map(img => getImageUrl(img)).filter(Boolean) as string[];
            
            if (imageUrls.length === 0) {
              return (
                <div className="aspect-[3/4] bg-gray-100 rounded-lg mb-4 overflow-hidden flex items-center justify-center">
                  <span className="text-6xl">👔</span>
                </div>
              );
            }
            
            if (imageUrls.length === 1) {
              return (
                <>
                  <div className="aspect-[3/4] bg-gray-100 rounded-lg mb-4 overflow-hidden">
                    <img
                      src={imageUrls[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </>
              );
            }
            
            // Multiple images - show carousel
            return (
              <div className="space-y-4">
                {/* Main Image with Navigation */}
                <div className="relative aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={imageUrls[currentImageIndex >= imageUrls.length ? 0 : currentImageIndex]}
                    alt={`${product.name} - Image ${(currentImageIndex >= imageUrls.length ? 0 : currentImageIndex) + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {imageUrls.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentImageIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1))}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 transition-opacity"
                        title="Previous image"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setCurrentImageIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1))}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 transition-opacity"
                        title="Next image"
                      >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
                        {currentImageIndex + 1} / {imageUrls.length}
                      </div>
                    </>
                  )}
                </div>
                
                {/* Thumbnails */}
                <div className="grid grid-cols-4 gap-2">
                  {imageUrls.map((url, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border-2 transition-all ${
                        idx === currentImageIndex ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img
                        src={url}
                        alt={`${product.name} ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Product Info */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            ₹{Math.floor(product.rent)} / Day
          </p>
          {(product as any).security_deposit > 0 && (
            <p className="text-gray-600 text-base mb-1">
              Security Deposit: ₹{Math.floor((product as any).security_deposit).toLocaleString('en-IN')}
            </p>
          )}
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

      {/* Tight Schedule Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Warning</h3>
                <p className="text-sm text-gray-600">
                  {warningMessage} Do you still want to proceed?
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowWarningModal(false);
                  setPendingAddToCart(false);
                }}
                className="px-6 py-2 border-2 border-red-600 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowWarningModal(false);
                  const wasPendingBookNow = pendingAddToCart;
                  setPendingAddToCart(false);
                  addToCartConfirmed();
                  // If triggered via Book Now, navigate to cart after confirming
                  if (wasPendingBookNow) {
                    router.push('/salesman/cart');
                  }
                }}
                className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
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

