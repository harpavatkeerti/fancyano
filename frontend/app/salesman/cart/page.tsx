'use client';

import { bookingsApi, settingsApi } from '@/lib/api';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getImageUrl } from '@/lib/imageHelper';
import { getCountryByCode, isValidPhoneNumber } from '@/lib/countryCodes';
import { PhoneInput } from '@/components/common';
import { toast } from '@/lib/toast';

interface CartItem {
  product: any;
  dateFrom: string;
  dateTo: string;
  specialNotes: string;
  discountType?: 'percentage' | 'fixed' | null;
  discountValue?: number;
}

export default function CartPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [transportationRequired, setTransportationRequired] = useState<'yes' | 'no'>('no');
  const [transportationCharge, setTransportationCharge] = useState(0); // Default to 0
  const [bookingPreview, setBookingPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Customer details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerPhoneCountry, setCustomerPhoneCountry] = useState('IN');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [alternatePhoneCountry, setAlternatePhoneCountry] = useState('IN');

  // Discount state
  const [discountType, setDiscountType] = useState<'percentage' | 'amount' | null>(null);
  const [discountValue, setDiscountValue] = useState(0);

  // Measurements
  const [measurements, setMeasurements] = useState<{ [key: number]: any }>({});
  const [measurementErrors, setMeasurementErrors] = useState<{ [key: string]: string }>({});
  const [specialRequirements, setSpecialRequirements] = useState<{ [key: number]: string }>({});

  // Cart timeout timer
  const [timeRemaining, setTimeRemaining] = useState<{ minutes: number; seconds: number } | null>(null);

  // Permission & collapsible state
  const [discountAllowed, setDiscountAllowed] = useState(false);
  const [showAdditionalSettings, setShowAdditionalSettings] = useState(false);

  // Warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');

  // Calculate time remaining before cart expires
  function calculateTimeRemaining(): { minutes: number; seconds: number } | null {
    try {
      const cartCreatedAt = localStorage.getItem('salesman_cart_created_at');
      if (!cartCreatedAt) {
        return null;
      }

      const createdAt = parseInt(cartCreatedAt, 10);
      const now = Date.now();
      const elapsedMs = now - createdAt;
      const totalMs = 5 * 60 * 1000; // 5 minutes in milliseconds
      const remainingMs = totalMs - elapsedMs;

      if (remainingMs <= 0) {
        return { minutes: 0, seconds: 0 };
      }

      const minutes = Math.floor(remainingMs / (1000 * 60));
      const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

      return { minutes, seconds };
    } catch (error) {
      console.error('Error calculating time remaining:', error);
      return null;
    }
  }

  // Check if cart should be cleared (5 minutes timeout)
  function checkCartTimeout() {
    try {
      const cartCreatedAt = localStorage.getItem('salesman_cart_created_at');
      if (!cartCreatedAt) {
        setTimeRemaining(null);
        return;
      }

      const timeRem = calculateTimeRemaining();
      setTimeRemaining(timeRem);

      if (timeRem && timeRem.minutes === 0 && timeRem.seconds === 0) {
        console.log('⏰ Cart expired (5 minutes passed), clearing cart...');
        localStorage.removeItem('salesman_cart');
        localStorage.removeItem('salesman_cart_created_at');
        setCartItems([]);
        setTimeRemaining(null);
        window.dispatchEvent(new Event('cartUpdated'));

        // Show notification to user
        toast.info('Your cart has been cleared because no payment was recorded within 5 minutes of adding the first product.');
      }
    } catch (error) {
      console.error('Error checking cart timeout:', error);
    }
  }

  // Fetch salesman discount permission
  useEffect(() => {
    async function fetchPermissions() {
      try {
        const response = await settingsApi.getByKey('salesman_permissions');
        if (response.data?.setting_value) {
          const permissions = JSON.parse(response.data.setting_value);
          setDiscountAllowed(permissions.discount_allowed || false);
        }
      } catch (error) {
        console.error('Error fetching salesman permissions:', error);
      }
    }
    fetchPermissions();
  }, []);

  useEffect(() => {
    // Load cart from localStorage
    try {
      const cart = JSON.parse(localStorage.getItem('salesman_cart') || '[]');
      // Validate cart items have required product data
      const validCart = cart.filter((item: any) => item?.product && item?.product?.rent !== undefined);
      setCartItems(validCart);
      if (validCart.length !== cart.length) {
        // Update localStorage with valid items only
        localStorage.setItem('salesman_cart', JSON.stringify(validCart));
      }

      // Check if cart should be cleared due to timeout
      checkCartTimeout();
    } catch (error) {
      console.error('Error loading cart:', error);
      setCartItems([]);
    }

    // Set up interval to update timer every second
    const intervalId = setInterval(() => {
      checkCartTimeout();
    }, 1000); // Update every second for real-time countdown

    return () => clearInterval(intervalId);
  }, []);

  // Fetch booking preview whenever cart, discounts, or transport changes
  useEffect(() => {
    async function fetchPreview() {
      if (cartItems.length === 0) {
        setBookingPreview(null);
        return;
      }

      setLoadingPreview(true);
      try {
        const response = await bookingsApi.getPreview({
          products: cartItems.map(item => ({
            id: item.product.id,
            discountType: item.discountType || null,
            discountValue: item.discountValue || 0
          })),
          transport_charge: transportationRequired === 'yes' ? transportationCharge : 0,
          booking_discount_type: discountType,
          booking_discount_value: discountValue
        });
        setBookingPreview(response.data);
      } catch (error) {
        console.error('Error fetching booking preview:', error);
        setBookingPreview(null);
      } finally {
        setLoadingPreview(false);
      }
    }

    fetchPreview();
  }, [cartItems, transportationRequired, transportationCharge, discountType, discountValue]);

  function removeFromCart(index: number) {
    const newCart = cartItems.filter((_, i) => i !== index);
    setCartItems(newCart);
    localStorage.setItem('salesman_cart', JSON.stringify(newCart));

    // If cart is now empty, clear the timestamp and timer
    if (newCart.length === 0) {
      localStorage.removeItem('salesman_cart_created_at');
      setTimeRemaining(null);
    }

    // Dispatch event to update cart count in header
    window.dispatchEvent(new Event('cartUpdated'));
  }

  // Get subtotal from backend preview
  function calculateSubtotal() {
    return bookingPreview?.subtotal || 0;
  }

  function calculateDeliveryFee() {
    return transportationRequired === 'yes' ? transportationCharge : 0;
  }

  // Get security deposit from backend preview
  function calculateSecurityDeposit() {
    if (bookingPreview?.products) {
      return bookingPreview.products.reduce((sum: number, p: any) => sum + (p.security_deposit || 0), 0);
    }
    return 0;
  }

  // Get total from backend preview
  function calculateTotal() {
    return bookingPreview?.total || 0;
  }

  // Get discount from backend preview
  function calculateDiscount() {
    return bookingPreview?.booking_discount_amount || 0;
  }

  // Check availability for all cart items before checkout
  async function validateCartAvailability(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const item of cartItems) {
      if (!item.product || !item.dateFrom || !item.dateTo) {
        errors.push(`Invalid cart item: ${item.product?.name || 'Unknown product'}`);
        continue;
      }

      try {
        // Fetch current bookings for this product
        const response = await bookingsApi.getByProductId(item.product.id);
        const bookings = response.data || [];

        const fromDate = new Date(item.dateFrom);
        const toDate = new Date(item.dateTo);
        fromDate.setHours(0, 0, 0, 0);
        toDate.setHours(0, 0, 0, 0);

        // Check against existing bookings
        for (const booking of bookings) {
          if (!booking.booked_from || !booking.booked_to) continue;

          const bookingFrom = new Date(booking.booked_from);
          const bookingTo = new Date(booking.booked_to);
          bookingFrom.setHours(0, 0, 0, 0);
          bookingTo.setHours(0, 0, 0, 0);

          // Check if dates overlap
          if (fromDate <= bookingTo && toDate >= bookingFrom) {
            errors.push(
              `${item.product.name} (${item.product.code || 'N/A'}): Already booked from ${new Date(booking.booked_from).toLocaleDateString('en-GB')} to ${new Date(booking.booked_to).toLocaleDateString('en-GB')}`
            );
          }
        }

        // Check for duplicate products in cart with overlapping dates
        for (const otherItem of cartItems) {
          if (otherItem === item) continue;
          if (otherItem.product.id !== item.product.id) continue;
          if (!otherItem.dateFrom || !otherItem.dateTo) continue;

          const otherFrom = new Date(otherItem.dateFrom);
          const otherTo = new Date(otherItem.dateTo);
          otherFrom.setHours(0, 0, 0, 0);
          otherTo.setHours(0, 0, 0, 0);

          if (fromDate <= otherTo && toDate >= otherFrom) {
            errors.push(
              `${item.product.name} (${item.product.code || 'N/A'}): Duplicate in cart with overlapping dates (${new Date(otherItem.dateFrom).toLocaleDateString('en-GB')} to ${new Date(otherItem.dateTo).toLocaleDateString('en-GB')})`
            );
          }
        }
      } catch (error) {
        console.error(`Error checking availability for product ${item.product.id}:`, error);
        errors.push(`Failed to verify availability for ${item.product.name}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  async function handleConfirm() {
    if (!customerName || !customerPhone || !alternatePhone) {
      toast.warning('Please fill in all customer details');
      return;
    }

    if (!isValidPhoneNumber(customerPhone, customerPhoneCountry)) {
      toast.warning('Please enter a valid phone number');
      return;
    }

    if (!isValidPhoneNumber(alternatePhone, alternatePhoneCountry)) {
      toast.warning('Please enter a valid alternate phone number');
      return;
    }

    if (cartItems.length === 0) {
      toast.warning('Your cart is empty');
      return;
    }

    // Validate availability before proceeding
    const validation = await validateCartAvailability();
    if (!validation.valid) {
      toast.error(`Cannot proceed with checkout:\n\n${validation.errors.join('\n')}\n\nPlease remove conflicting items or update dates.`);
      return;
    }

    // Check real-time availability from database
    const dbCheck = await checkDatabaseAvailability();
    if (!dbCheck.success) {
      toast.error(dbCheck.message);
      return;
    }

    // Check for tight schedule (bookings within 2 days)
    const tightScheduleCheck = await checkTightSchedule();
    if (tightScheduleCheck.hasTightSchedule) {
      setWarningMessage(tightScheduleCheck.message);
      setShowWarningModal(true);
      return;
    }

    await createBooking();
  }

  async function checkDatabaseAvailability() {
    try {
      const { availabilityApi } = await import('@/lib/api');

      const products = cartItems.map(item => ({
        product_id: item.product.id,
        date_from: item.dateFrom,
        date_to: item.dateTo
      }));

      const response = await availabilityApi.checkBulk({ products });

      if (!response.data.all_available) {
        const unavailableDetails = response.data.results
          .filter((r: any) => !r.available)
          .map((r: any) => {
            const cartItem = cartItems.find(ci => ci.product.id === r.product_id);
            const fromDate = new Date(cartItem?.dateFrom || '').toLocaleDateString('en-GB');
            const toDate = new Date(cartItem?.dateTo || '').toLocaleDateString('en-GB');
            return `• ${cartItem?.product.name} (${cartItem?.product.code})\n  Selected: ${fromDate} to ${toDate}`;
          })
          .join('\n\n');

        return {
          success: false,
          message: `⚠️ Product Already Booked!\n\nThe following products are already booked for your selected dates:\n\n${unavailableDetails}\n\nPlease select other dates or remove these items from your cart.`
        };
      }

      return { success: true, message: '' };
    } catch (error) {
      console.error('Error checking database availability:', error);
      // Continue with booking even if check fails (fallback)
      return { success: true, message: '' };
    }
  }

  async function checkTightSchedule() {
    try {
      const response = await bookingsApi.getAll();
      const allBookings = response.data;
      const warnings: string[] = [];

      for (const item of cartItems) {
        const thisPickupDate = new Date(item.dateFrom);
        const thisDropDate = new Date(item.dateTo);
        thisPickupDate.setHours(0, 0, 0, 0);
        thisDropDate.setHours(0, 0, 0, 0);

        for (const otherBooking of allBookings) {
          if (otherBooking.status === 'cancelled' || otherBooking.status === 'completed') continue;

          const otherProducts = Array.isArray(otherBooking.products) ? otherBooking.products : [];

          for (const otherProduct of otherProducts) {
            if (otherProduct.id !== item.product.id && otherProduct.code !== item.product.code) {
              continue;
            }

            const otherPickupDate = new Date(otherProduct.booked_from || otherBooking.booked_from);
            const otherDropDate = new Date(otherProduct.booked_to || otherBooking.booked_to);
            otherPickupDate.setHours(0, 0, 0, 0);
            otherDropDate.setHours(0, 0, 0, 0);

            const daysBetweenDropAndPickup = Math.ceil((thisPickupDate.getTime() - otherDropDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysBetweenDropAndPickup > 0 && daysBetweenDropAndPickup <= 2) {
              warnings.push(`${item.product.name} (${item.product.code}) is booked ${daysBetweenDropAndPickup} day before your selected date.`);
              break;
            }

            const daysBetweenDropAndNextPickup = Math.ceil((otherPickupDate.getTime() - thisDropDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysBetweenDropAndNextPickup > 0 && daysBetweenDropAndNextPickup <= 2) {
              warnings.push(`${item.product.name} (${item.product.code}) is booked ${daysBetweenDropAndNextPickup} day after your selected date.`);
              break;
            }
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

  async function createBooking() {
    try {
      const country1 = getCountryByCode(customerPhoneCountry);
      const country2 = getCountryByCode(alternatePhoneCountry);

      // Calculate total security deposit from all products
      const totalSecurityDeposit = calculateSecurityDeposit();

      // Get logged-in salesman name from localStorage
      // Try multiple possible keys where user name might be stored
      const userData = localStorage.getItem('user');
      let salesmanName = 'Salesman';

      if (userData) {
        try {
          const user = JSON.parse(userData);
          salesmanName = user.name || user.userName || salesmanName;
        } catch (e) {
          // If parsing fails, try direct keys
          salesmanName = localStorage.getItem('salesman_name') || localStorage.getItem('user_name') || localStorage.getItem('name') || 'Salesman';
        }
      } else {
        salesmanName = localStorage.getItem('salesman_name') || localStorage.getItem('user_name') || localStorage.getItem('name') || 'Salesman';
      }

      // Trim whitespace to ensure consistent matching
      salesmanName = salesmanName.trim();

      console.log('📝 Creating booking with created_by:', salesmanName);

      // Create one booking with all products
      const discountAmount = calculateDiscount();
      const bookingResponse = await bookingsApi.create({
        customer_name: customerName,
        customer_phone: `${country1?.callingCode}${customerPhone}`,
        alternate_phone: `${country2?.callingCode}${alternatePhone}`,
        customer_address: '',
        booking_date: new Date().toISOString().split('T')[0],
        booked_from: '', // Will be calculated from products
        booked_to: '', // Will be calculated from products
        products: cartItems.map(item => ({
          id: item.product.id,
          booked_from: item.dateFrom,
          booked_to: item.dateTo,
          discountType: item.discountType || null,
          discountValue: item.discountValue || 0
        })),
        // Backend calculates total_rent and total_security from products
        transport_charge: transportationRequired === 'yes' ? transportationCharge : 0,
        discount_amount: bookingPreview?.booking_discount_amount || 0,
        status: 'pending', // Will be updated to 'confirmed' when payment is recorded
        special_requirements: '',
        created_by: salesmanName, // Store salesman name who created the booking
      } as any);

      // Clear cart and reset timer
      localStorage.removeItem('salesman_cart');
      localStorage.removeItem('salesman_cart_created_at');
      setTimeRemaining(null);
      // Dispatch event to update cart count in header
      window.dispatchEvent(new Event('cartUpdated'));

      // Redirect to order details page using the booking ID from response
      const bookingId = bookingResponse.data?.id;
      if (bookingId) {
        router.push(`/salesman/order-details/${bookingId}`);
      } else {
        router.push('/salesman/my-bookings');
      }
    } catch (error: any) {
      console.error('Error creating booking:', error);
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error || errorData.details || error.message || 'Unknown error occurred';
      const errorDetail = errorData.detail || '';
      const errorHint = errorData.hint || '';

      let fullErrorMessage = `Error creating booking: ${errorMessage}`;
      if (errorDetail) {
        fullErrorMessage += `\n\nDetails: ${errorDetail}`;
      }
      if (errorHint) {
        fullErrorMessage += `\n\nHint: ${errorHint}`;
      }

      toast.error(fullErrorMessage);
    }
  }

  function handleMeasurementChange(productId: number, field: string, value: string) {
    // Remove any non-digit characters
    const numericValue = value.replace(/\D/g, '');

    // Check if more than 2 digits
    if (numericValue.length > 2) {
      const errorKey = `${productId}-${field}`;
      setMeasurementErrors({
        ...measurementErrors,
        [errorKey]: 'Please enter correct measurement (maximum 2 digits)',
      });
      return;
    }

    // Clear error if valid
    const errorKey = `${productId}-${field}`;
    setMeasurementErrors({
      ...measurementErrors,
      [errorKey]: '',
    });

    setMeasurements({
      ...measurements,
      [productId]: {
        ...measurements[productId],
        [field]: numericValue,
      },
    });
  }

  // Determine if product is female clothing (Lehenga, Gown, Girlish Crop Top)
  function isFemaleClothing(productName: string): boolean {
    const femaleTypes = ['Lehenga', 'Gown', 'Gowns', 'Girlish Crop Top'];
    return femaleTypes.some(type => productName.toLowerCase().includes(type.toLowerCase()));
  }

  // Determine if product is male clothing (Sherwani, Suit, Kurta Pajama, Indo Western)
  function isMaleClothing(productName: string): boolean {
    const maleTypes = ['Sherwani', 'Suit', 'Kurta Pajama', 'Indo Western'];
    return maleTypes.some(type => productName.toLowerCase().includes(type.toLowerCase()));
  }

  if (cartItems.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
          <button
            onClick={() => router.push('/salesman/products')}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
          >
            Browse Products
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Cart</h1>
        {timeRemaining && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${timeRemaining.minutes < 1
            ? 'bg-red-50 border-red-500 text-red-700'
            : timeRemaining.minutes < 2
              ? 'bg-yellow-50 border-yellow-500 text-yellow-700'
              : 'bg-blue-50 border-blue-500 text-blue-700'
            }`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-medium">Cart expires in:</span>
              <span className="text-xl font-bold tabular-nums">
                {String(timeRemaining.minutes).padStart(2, '0')}:{String(timeRemaining.seconds).padStart(2, '0')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="col-span-2 space-y-4">
          {cartItems.map((item, index) => (
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex gap-4">
                <div className="w-20 h-28 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {getImageUrl(item.product.image) ? (
                    <img
                      src={getImageUrl(item.product.image)!}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-2xl">👔</span>
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="mb-1">
                    <h3 className="font-semibold text-gray-900 text-lg">{item.product.name}</h3>
                    {item.product.code && (
                      <p className="text-xs text-gray-500 font-mono mt-0.5">Code: {item.product.code}</p>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {(() => {
                      // Use backend preview if available
                      const previewProduct = bookingPreview?.products?.find((p: any) => p.id === item.product.id);
                      if (previewProduct) {
                        const hasDiscount = previewProduct.discount_amount > 0;
                        return (
                          <div>
                            {hasDiscount ? (
                              <div className="flex items-center gap-2">
                                <span className="line-through text-gray-400">₹{Math.floor(previewProduct.rent)}</span>
                                <span className="font-semibold text-green-600">₹{Math.floor(previewProduct.effective_rent)}</span>
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                  {previewProduct.discount_type === 'percentage'
                                    ? `${item.discountValue}% off`
                                    : `-₹${previewProduct.discount_amount}`}
                                </span>
                              </div>
                            ) : (
                              <span>₹{Math.floor(previewProduct.rent)}</span>
                            )}
                            {previewProduct.security_deposit > 0 && (
                              <p className="text-xs text-gray-500 mt-0.5">Security: ₹{Math.floor(previewProduct.security_deposit).toLocaleString('en-IN')}</p>
                            )}
                          </div>
                        );
                      }
                      // Fallback display (before preview loads)
                      return (
                        <div>
                          <span>₹{Math.floor(item.product.rent || 0)}</span>
                          {item.product.security_deposit > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">Security: ₹{Math.floor(item.product.security_deposit).toLocaleString('en-IN')}</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-red-600 mt-2">
                    Dates: {new Date(item.dateFrom).toLocaleDateString('en-GB')} To{' '}
                    {new Date(item.dateTo).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <button
                  onClick={() => removeFromCart(index)}
                  className="text-red-600 hover:text-red-800 flex-shrink-0"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* Per-Product Discount Controls — only shown if Additional Settings is open */}
              {showAdditionalSettings && (
                <div className={`mt-4 pt-4 border-t border-gray-200 ${!discountAllowed ? 'opacity-50 pointer-events-none' : ''}`}>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    💰 Product Discount (Optional)
                  </label>
                  <div className="flex gap-2 items-center">
                    <select
                      value={item.discountType || ''}
                      disabled={!discountAllowed}
                      onChange={(e) => {
                        const newType = e.target.value as 'percentage' | 'fixed' | '';
                        const updatedItems = [...cartItems];
                        updatedItems[index] = {
                          ...updatedItems[index],
                          discountType: newType || null,
                          discountValue: newType ? (updatedItems[index].discountValue || 0) : 0
                        };
                        setCartItems(updatedItems);
                        localStorage.setItem('salesman_cart', JSON.stringify(updatedItems));
                      }}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <option value="">No Discount</option>
                      <option value="percentage">Percentage %</option>
                      <option value="fixed">Fixed ₹</option>
                    </select>

                    {item.discountType && (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max={item.discountType === 'percentage' ? 100 : item.product.rent}
                          step={item.discountType === 'percentage' ? 1 : 10}
                          value={item.discountValue || 0}
                          disabled={!discountAllowed}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            const updatedItems = [...cartItems];
                            updatedItems[index] = {
                              ...updatedItems[index],
                              discountValue: value
                            };
                            setCartItems(updatedItems);
                            localStorage.setItem('salesman_cart', JSON.stringify(updatedItems));
                          }}
                          placeholder="0"
                          className="w-24 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <span className="text-sm text-gray-600">
                          {item.discountType === 'percentage' ? '%' : '₹'}
                        </span>
                      </div>
                    )}
                  </div>
                  {!discountAllowed && (
                    <p className="text-xs text-red-500 mt-1">⚠️ Discount not allowed. Contact admin.</p>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Transportation */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Local Transportation Required?
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={transportationRequired === 'yes'}
                  onChange={() => setTransportationRequired('yes')}
                  className="mr-2"
                />
                Yes
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={transportationRequired === 'no'}
                  onChange={() => {
                    setTransportationRequired('no');
                    setTransportationCharge(0);
                  }}
                  className="mr-2"
                />
                No
              </label>
            </div>

            {/* Transportation Charge Input - Shows when Yes is selected */}
            {transportationRequired === 'yes' && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter Local Transportation Charge*
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-700 font-medium">₹</span>
                  <input
                    type="number"
                    value={transportationCharge}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Only allow positive numbers
                      if (value === '' || parseFloat(value) >= 0) {
                        setTransportationCharge(parseFloat(value) || 0);
                      }
                    }}
                    placeholder="Enter amount"
                    min="0"
                    step="1"
                    className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  />
                </div>
              </div>
            )}
          </div>

          {/* Collapsible Additional Settings */}
          <div className="mt-6 border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowAdditionalSettings(!showAdditionalSettings)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-800">⚙️ Additional Settings</span>
              <svg className={`w-5 h-5 text-gray-500 transform transition-transform ${showAdditionalSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showAdditionalSettings && (
              <div className="p-4 space-y-4 border-t border-gray-300">
                {!discountAllowed && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                    <p className="text-xs text-red-600 font-medium">🔒 Discount is disabled by admin. Contact admin to enable.</p>
                  </div>
                )}

                {/* Overall Discount Section */}
                <div className={`bg-yellow-50 border border-yellow-200 rounded-lg p-4 ${!discountAllowed ? 'opacity-50 pointer-events-none' : ''}`}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    💰 Apply Discount to All Products (Optional)
                  </label>
                  <p className="text-xs text-gray-600 mb-2">
                    Note: Discount applies only on product rent, not on transportation charges
                  </p>
                  <div className="flex gap-4 mb-3">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={!discountType}
                        disabled={!discountAllowed}
                        onChange={() => {
                          setDiscountType(null);
                          setDiscountValue(0);
                        }}
                        className="mr-2"
                      />
                      No Discount
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={discountType === 'percentage'}
                        disabled={!discountAllowed}
                        onChange={() => {
                          setDiscountType('percentage');
                          setDiscountValue(0);
                        }}
                        className="mr-2"
                      />
                      Percentage (%)
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        checked={discountType === 'amount'}
                        disabled={!discountAllowed}
                        onChange={() => {
                          setDiscountType('amount');
                          setDiscountValue(0);
                        }}
                        className="mr-2"
                      />
                      Fixed Amount (₹)
                    </label>
                  </div>

                  {/* Discount Input - Shows when discount type is selected */}
                  {discountType && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {discountType === 'percentage' ? 'Enter Discount Percentage*' : 'Enter Discount Amount*'}
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700 font-medium">
                          {discountType === 'amount' ? '₹' : ''}
                        </span>
                        <input
                          type="number"
                          value={discountValue || ''}
                          disabled={!discountAllowed}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            // Validate percentage (0-100) or amount
                            if (discountType === 'percentage') {
                              if (value >= 0 && value <= 100) {
                                setDiscountValue(value);
                              }
                            } else {
                              if (value >= 0) {
                                setDiscountValue(value);
                              }
                            }
                          }}
                          placeholder={discountType === 'percentage' ? 'Enter percentage (0-100)' : 'Enter amount'}
                          min="0"
                          max={discountType === 'percentage' ? 100 : undefined}
                          step={discountType === 'percentage' ? '0.1' : '1'}
                          className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                          required
                        />
                        {discountType === 'percentage' && (
                          <span className="text-gray-700 font-medium">%</span>
                        )}
                      </div>
                      {calculateDiscount() > 0 && (
                        <p className="text-sm text-green-600 mt-2 font-medium">
                          💵 Discount Amount: ₹{calculateDiscount()}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Customer Contact Details */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Customer Contact Details</h3>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Name*"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <div className="grid grid-cols-2 gap-4">
                <PhoneInput
                  label="Phone Number"
                  value={customerPhone}
                  countryCode={customerPhoneCountry}
                  onValueChange={(value) => {
                    setCustomerPhone(value);
                    // Check for duplicates
                    if (value && alternatePhone) {
                      const c1 = getCountryByCode(customerPhoneCountry);
                      const c2 = getCountryByCode(alternatePhoneCountry);
                      if (c1 && c2) {
                        const full1 = `${c1.callingCode}${value}`;
                        const full2 = `${c2.callingCode}${alternatePhone}`;
                        if (full1 === full2) {
                          toast.warning('Phone numbers cannot be the same');
                        }
                      }
                    }
                  }}
                  onCountryCodeChange={(code) => setCustomerPhoneCountry(code)}
                  required
                />
                <PhoneInput
                  label="Alternate Phone Number"
                  value={alternatePhone}
                  countryCode={alternatePhoneCountry}
                  onValueChange={(value) => {
                    setAlternatePhone(value);
                    // Check for duplicates
                    if (customerPhone && value) {
                      const c1 = getCountryByCode(customerPhoneCountry);
                      const c2 = getCountryByCode(alternatePhoneCountry);
                      if (c1 && c2) {
                        const full1 = `${c1.callingCode}${customerPhone}`;
                        const full2 = `${c2.callingCode}${value}`;
                        if (full1 === full2) {
                          toast.warning('Phone numbers cannot be the same');
                        }
                      }
                    }
                  }}
                  onCountryCodeChange={(code) => setAlternatePhoneCountry(code)}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div>
          <div className="bg-white border border-gray-200 rounded-lg p-6 sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">₹{isNaN(calculateSubtotal()) ? '0' : Math.floor(calculateSubtotal()).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Delivery Fee</span>
                <span className="font-medium">₹{isNaN(calculateDeliveryFee()) ? '0' : Math.floor(calculateDeliveryFee()).toLocaleString('en-IN')}</span>
              </div>
              {calculateDiscount() > 0 && (
                <div className="flex justify-between text-green-600">
                  <span className="font-medium">Discount {discountType === 'percentage' ? `(${discountValue}%)` : ''}</span>
                  <span className="font-medium">-₹{Math.floor(calculateDiscount()).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-3">
                <span>Total Payable Now:</span>
                <span>₹{isNaN(calculateTotal()) ? '0' : Math.floor(calculateTotal()).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Security Deposit</span>
                <span className="font-medium">₹{isNaN(calculateSecurityDeposit()) ? '0' : Math.floor(calculateSecurityDeposit()).toLocaleString('en-IN')}</span>
              </div>
              <p className="text-xs text-gray-500 italic">
                Note: The Payment of Security will only be collected at the time of delivery
              </p>
            </div>

            <button
              onClick={handleConfirm}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              SUBMIT BOOKING REQUEST
            </button>
          </div>
        </div>
      </div>

      {/* Warning Modal */}
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
                onClick={() => setShowWarningModal(false)}
                className="px-6 py-2 border-2 border-red-600 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowWarningModal(false);
                  createBooking();
                }}
                className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation & Measurements Modal */}
    </div>
  );
}

