'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { productsApi, bookingsApi, availabilityApi } from '@/lib/api';
import { Product } from '@/types';
import Link from 'next/link';
import { getImageUrl } from '@/lib/imageHelper';
import { DateRangePicker, TightScheduleWarningModal } from '@/components/common';
import type { UrgentConflict } from '@rental/shared';
import { toast } from '@/lib/toast';
import { sortSizes } from '@/lib/productConstants';

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isAvailable, setIsAvailable] = useState(true);
  const [productBookings, setProductBookings] = useState<any[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  // Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningConflicts, setWarningConflicts] = useState<UrgentConflict[]>([]);
  const [pendingAddToCart, setPendingAddToCart] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchProduct();
    }
  }, [params.id]);

  // Re-fetch bookings when size changes (or on initial load for sizeless products)
  useEffect(() => {
    if (params.id && product) {
      const hasSizes = product.available_sizes && product.available_sizes.length > 0;
      if (!hasSizes || selectedSize) {
        fetchProductBookings(selectedSize);
      } else {
        // Clear bookings until a size is selected
        setProductBookings([]);
      }
    }
  }, [params.id, product, selectedSize]);

  // Reset image index when product changes
  useEffect(() => {
    setCurrentImageIndex(0);
  }, [product]);

  // Re-enable buttons when user changes size or dates (new intent to add)
  useEffect(() => {
    setIsSubmitting(false);
  }, [selectedSize, dateFrom, dateTo]);

  // Listen for cart updates (e.g. to update header cart count)
  // Note: We intentionally do NOT re-validate availability here.
  // The cartUpdated event fires after we add an item, and re-checking
  // would find the item we just added as a conflict, causing a flash.

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

  async function fetchProductBookings(size?: string | null) {
    try {
      const response = await bookingsApi.getByProductId(Number(params.id), size || undefined);
      setProductBookings(response.data || []);
    } catch (error) {
      console.error('Error fetching product bookings:', error);
      setProductBookings([]);
    }
  }

  // Check if dates overlap with existing bookings or cart items
  function checkAvailability(dateFrom: string, dateTo: string, productId: number, size?: string | null): { available: boolean; conflictType: string; conflictDetails?: string } {
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

      for (const item of cart) {
        const itemProductId = item.product?.id || item.product_id;
        if (!itemProductId || itemProductId !== productId) continue;

        // Different sizes of the same product are independent items
        const itemSize = item.size || null;
        const currentSize = size || null;
        if (itemSize !== currentSize) continue;

        const cartDateFrom = item.dateFrom || item.booked_from;
        const cartDateTo = item.dateTo || item.booked_to;

        if (!cartDateFrom || !cartDateTo) continue;

        const cartFrom = new Date(cartDateFrom);
        const cartTo = new Date(cartDateTo);
        cartFrom.setHours(0, 0, 0, 0);
        cartTo.setHours(0, 0, 0, 0);

        if (fromDate <= cartTo && toDate >= cartFrom) {
          return {
            available: false,
            conflictType: 'cart_item',
            conflictDetails: `This product is already in your cart for dates ${new Date(cartDateFrom).toLocaleDateString('en-GB')} to ${new Date(cartDateTo).toLocaleDateString('en-GB')}`
          };
        }
      }
    } catch (error) {
      console.error('Error checking cart:', error);
    }

    return { available: true, conflictType: 'none' };
  }

  // Validate dates when they change
  useEffect(() => {
    if (dateFrom && dateTo && product) {
      const availability = checkAvailability(dateFrom, dateTo, product.id, selectedSize);
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
  }, [dateFrom, dateTo, product, selectedSize]);

  async function checkTightSchedule() {
    if (!product || !dateFrom || !dateTo) {
      return { hasTightSchedule: false, conflicts: [] };
    }

    try {
      const response = await availabilityApi.checkTightSchedule([{
        product_id: product.id,
        size: selectedSize || null,
        booked_from: dateFrom,
        booked_to: dateTo,
      }]);

      if (response.data.has_tight_schedule) {
        return {
          hasTightSchedule: true,
          conflicts: response.data.conflicts
        };
      }

      return { hasTightSchedule: false, conflicts: [] };
    } catch (error) {
      console.error('Error checking tight schedule:', error);
      return { hasTightSchedule: false, conflicts: [] };
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

    // Require size for sized products
    const hasSizes = product.available_sizes && product.available_sizes.length > 0;
    if (hasSizes && !selectedSize) {
      toast.warning('Please select a size first');
      return false;
    }

    // Check if same product-size combination is already in cart
    try {
      const cart = JSON.parse(localStorage.getItem('salesman_cart') || '[]');
      const duplicate = cart.find((item: any) => {
        const itemProductId = item.product?.id || item.product_id;
        const itemSize = item.size || null;
        const currentSize = selectedSize || null;
        return itemProductId === product.id && itemSize === currentSize;
      });
      if (duplicate) {
        const sizeLabel = selectedSize ? ` (Size: ${selectedSize})` : '';
        toast.warning(`This product${sizeLabel} is already in your cart. Please remove it first or select a different size.`);
        return false;
      }
    } catch (error) {
      console.error('Error checking cart for duplicates:', error);
    }

    // Check availability before adding to cart
    const availability = checkAvailability(dateFrom, dateTo, product.id, selectedSize);

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
      setWarningConflicts(tightScheduleCheck.conflicts);
      setShowWarningModal(true);
      setPendingAddToCart(true);
      // Navigation will happen after the user confirms the warning modal
      return false;
    }

    setIsSubmitting(true);
    addToCartConfirmed();
    return true;
  }

  function addToCartConfirmed() {

    // Add to cart logic
    const cartItem = {
      product,
      size: selectedSize,
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
      router.push('/cart');
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
                      className={`aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden border-2 transition-all ${idx === currentImageIndex ? 'border-orange-500 ring-2 ring-orange-200' : 'border-gray-200 hover:border-gray-300'
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
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{product.name}</h1>
          <p className="text-sm text-gray-500 mb-3">
            Code: {product.code}
            {selectedSize && <span className="ml-2">· Size: {selectedSize}</span>}
          </p>
          <p className="text-2xl font-bold text-gray-900 mb-1">
            {(() => {
              const rentsBySize = (product as any).rents_by_size || {};
              const displayRent = (selectedSize && rentsBySize[selectedSize]) ? rentsBySize[selectedSize] : product.rent;
              return `₹${Math.floor(displayRent)} / Day`;
            })()}
          </p>
          {(product as any).security_deposit > 0 && (
            <p className="text-gray-600 text-base mb-1">
              Security Deposit: ₹{Math.floor((product as any).security_deposit).toLocaleString('en-IN')}
            </p>
          )}
          {product.description && (
            <p className="text-gray-600 mb-6">{product.description}</p>
          )}
          {!product.description && (
            <p className="text-gray-600 mb-6">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
              incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam
            </p>
          )}

          {/* Size Selector — shown for sized products */}
          {product.available_sizes && product.available_sizes.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Size *</h3>
              <div className="flex flex-wrap gap-2">
                {sortSizes(product.available_sizes).map(sz => {
                  const isSelected = selectedSize === sz;
                  const rentsBySize = (product as any).rents_by_size || {};
                  const sizeRent = rentsBySize[sz] ?? product.rent;
                  const isOverridden = sizeRent !== product.rent;
                  return (
                    <button
                      key={sz}
                      onClick={() => {
                        setSelectedSize(sz);
                        // Reset dates when size changes
                        setDateFrom('');
                        setDateTo('');
                        setAvailabilityError('');
                        setIsAvailable(true);
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-all duration-200 ${isSelected
                          ? 'bg-red-600 text-white border-red-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-red-400 hover:text-red-600'
                        }`}
                    >
                      {sz}
                      {isOverridden && <span className="text-xs ml-1 opacity-70">₹{sizeRent}</span>}
                    </button>
                  );
                })}
              </div>
              {!selectedSize && (
                <p className="text-xs text-orange-600 mt-2">⚠️ Please select a size to check availability</p>
              )}
            </div>
          )}

          {/* Color Selection */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Colors</h3>
            <div className="flex gap-2">
              {colors.map((color, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedColor(idx)}
                  className={`w-8 h-8 rounded-full border-2 ${selectedColor === idx ? 'border-gray-900' : 'border-gray-300'
                    }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Check Availability — disabled until size is selected for sized products */}
          {(() => {
            const hasSizes = product.available_sizes && product.available_sizes.length > 0;
            const sizeReady = !hasSizes || !!selectedSize;
            return (
              <div className={`mb-6 ${!sizeReady ? 'opacity-50 pointer-events-none' : ''}`}>
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
            );
          })()}

          {/* Action Buttons */}
          {(() => {
            const hasSizes = product.available_sizes && product.available_sizes.length > 0;
            const needsSize = hasSizes && !selectedSize;
            const isDisabled = !isAvailable || !dateFrom || !dateTo || needsSize || isSubmitting;
            return (
              <div className="flex gap-4">
                <button
                  onClick={handleAddToCart}
                  disabled={isDisabled}
                  className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${isDisabled
                      ? 'text-gray-400 bg-gray-100 border-2 border-gray-300 cursor-not-allowed'
                      : 'text-red-600 bg-white border-2 border-red-600 hover:bg-red-50'
                    }`}
                >
                  🛒 ADD TO CART
                </button>
                <button
                  onClick={handleBookNow}
                  disabled={isDisabled}
                  className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${isDisabled
                      ? 'text-gray-400 bg-gray-300 cursor-not-allowed'
                      : 'text-white bg-red-600 hover:bg-red-700'
                    }`}
                >
                  BOOK NOW
                </button>
              </div>
            );
          })()}
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



      {/* Tight Schedule Warning Modal */}
      {showWarningModal && warningConflicts.length > 0 && (
        <TightScheduleWarningModal
          conflicts={warningConflicts}
          onCancel={() => {
            setShowWarningModal(false);
            setPendingAddToCart(false);
          }}
          onContinue={() => {
            setShowWarningModal(false);
            const wasPendingBookNow = pendingAddToCart;
            setPendingAddToCart(false);
            addToCartConfirmed();
            // If triggered via Book Now, navigate to cart after confirming
            if (wasPendingBookNow) {
              router.push('/cart');
            }
          }}
        />
      )}
    </div>
  );
}

