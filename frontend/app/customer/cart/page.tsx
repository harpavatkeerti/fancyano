'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bookingsApi } from '@/lib/api';
import { getImageUrl } from '@/lib/imageHelper';
import { getCountryByCode, isValidPhoneNumber } from '@/lib/countryCodes';
import { PhoneInput } from '@/components/common';
import { toast } from '@/lib/toast';

interface CartItem {
  product: any;
  dateFrom: string;
  dateTo: string;
  specialNotes: string;
}

export default function CartPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [transportationRequired, setTransportationRequired] = useState<'yes' | 'no'>('no');
  
  // Customer details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerPhoneCountry, setCustomerPhoneCountry] = useState('IN');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [alternatePhoneCountry, setAlternatePhoneCountry] = useState('IN');
  const [customerAddress, setCustomerAddress] = useState('');
  
  // Cart timeout timer
  const [timeRemaining, setTimeRemaining] = useState<{ minutes: number; seconds: number } | null>(null);

  // Calculate time remaining before cart expires
  function calculateTimeRemaining(): { minutes: number; seconds: number } | null {
    try {
      const cartCreatedAt = localStorage.getItem('customer_cart_created_at');
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
      const cartCreatedAt = localStorage.getItem('customer_cart_created_at');
      if (!cartCreatedAt) {
        setTimeRemaining(null);
        return;
      }

      const timeRem = calculateTimeRemaining();
      setTimeRemaining(timeRem);

      if (timeRem && timeRem.minutes === 0 && timeRem.seconds === 0) {
        console.log('⏰ Cart expired (5 minutes passed), clearing cart...');
        localStorage.removeItem('customer_cart');
        localStorage.removeItem('customer_cart_created_at');
        setCartItems([]);
        setTimeRemaining(null);
        window.dispatchEvent(new Event('cartUpdated'));
        
        // Show notification to user
        toast.info('Your cart has been cleared because no booking was created within 5 minutes of adding the first product.');
      }
    } catch (error) {
      console.error('Error checking cart timeout:', error);
    }
  }

  useEffect(() => {
    // Load cart from localStorage
    try {
      const cart = JSON.parse(localStorage.getItem('customer_cart') || '[]');
      // Validate cart items have required product data
      const validCart = cart.filter((item: any) => item?.product && item?.product?.rent_per_day !== undefined);
      setCartItems(validCart);
      if (validCart.length !== cart.length) {
        // Update localStorage with valid items only
        localStorage.setItem('customer_cart', JSON.stringify(validCart));
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

  function removeFromCart(index: number) {
    const newCart = cartItems.filter((_, i) => i !== index);
    setCartItems(newCart);
    localStorage.setItem('customer_cart', JSON.stringify(newCart));
    
    // If cart is now empty, clear the timestamp and timer
    if (newCart.length === 0) {
      localStorage.removeItem('customer_cart_created_at');
      setTimeRemaining(null);
    }
    
    // Dispatch event to update cart count in header
    window.dispatchEvent(new Event('cartUpdated'));
  }

  function calculateSubtotal() {
    if (!cartItems || cartItems.length === 0) return 0;
    return cartItems.reduce((sum, item) => {
      const rentPerDay = item?.product?.rent_per_day || 0;
      return sum + (typeof rentPerDay === 'number' ? rentPerDay : parseFloat(rentPerDay) || 0);
    }, 0);
  }

  function calculateDeliveryFee() {
    return transportationRequired === 'yes' ? 199 : 0;
  }

  function calculateSecurityDeposit() {
    if (!cartItems || cartItems.length === 0) return 0;
    return cartItems.reduce((sum, item) => {
      const securityDeposit = item?.product?.security_deposit || 0;
      return sum + (typeof securityDeposit === 'number' ? securityDeposit : parseFloat(securityDeposit) || 0);
    }, 0);
  }

  function calculateTotal() {
    const subtotal = calculateSubtotal();
    const deliveryFee = calculateDeliveryFee();
    const securityDeposit = calculateSecurityDeposit();
    return subtotal + deliveryFee + securityDeposit;
  }

  // Calculate rental total (without security deposit) for booking
  function calculateRentalTotal() {
    const subtotal = calculateSubtotal();
    const deliveryFee = calculateDeliveryFee();
    return subtotal + deliveryFee;
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

  async function handleSubmitBooking() {
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
      toast.error(`Cannot proceed with booking:\n\n${validation.errors.join('\n')}\n\nPlease remove conflicting items or update dates.`);
      return;
    }

    await createBooking();
  }

  async function createBooking() {
    try {
      const country1 = getCountryByCode(customerPhoneCountry);
      const country2 = getCountryByCode(alternatePhoneCountry);

      // Calculate total security deposit from all products
      const totalSecurityDeposit = calculateSecurityDeposit();

      // Create one booking with all products
      const bookingResponse = await bookingsApi.create({
        customer_name: customerName,
        customer_phone: `${country1?.callingCode}${customerPhone}`,
        alternate_phone: `${country2?.callingCode}${alternatePhone}`,
        customer_address: customerAddress,
        booking_date: new Date().toISOString().split('T')[0],
        booked_from: '', // Will be calculated from products
        booked_to: '', // Will be calculated from products
        products: cartItems.map(item => ({
          id: item.product.id,
          booked_from: item.dateFrom,
          booked_to: item.dateTo
        })),
        total_amount: calculateRentalTotal(), // Rental amount only (without security deposit)
        security_deposit: totalSecurityDeposit,
        transportation_opted: transportationRequired === 'yes',
        status: 'pending', // Customer bookings start as pending until salesman confirms payment
        special_requirements: '',
      } as any);

      // Clear cart and reset timer
      localStorage.removeItem('customer_cart');
      localStorage.removeItem('customer_cart_created_at');
      setTimeRemaining(null);
      // Dispatch event to update cart count in header
      window.dispatchEvent(new Event('cartUpdated'));
      
      toast.success('Booking request submitted successfully! Your booking is pending confirmation. A salesman will contact you shortly.');
      
      // Redirect to bookings page
      router.push('/customer/bookings');
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

  if (cartItems.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h2>
          <button
            onClick={() => router.push('/customer/products')}
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
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${
            timeRemaining.minutes < 1 
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
            <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 flex gap-4">
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
                <p className="text-sm text-gray-600 mt-1">₹{Math.floor(item.product.rent_per_day || 0)} / Day</p>
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
          ))}

          {/* Transportation */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transportation Required?
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
                  onChange={() => setTransportationRequired('no')}
                  className="mr-2"
                />
                No
              </label>
            </div>
          </div>

          {/* Customer Contact Details */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Contact Details</h3>
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
              <input
                type="text"
                placeholder="Address (Optional)"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
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
               <div className="flex justify-between text-lg font-bold border-t pt-3">
                 <span>Total Payable:</span>
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
              onClick={handleSubmitBooking}
              className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors"
            >
              SUBMIT BOOKING REQUEST
            </button>
            <p className="text-xs text-gray-500 text-center mt-3">
              Your booking will be pending until confirmed by our team
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

