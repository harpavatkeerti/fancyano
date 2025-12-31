'use client';

import { useEffect, useState } from 'react';
import { bookingsApi, productsApi } from '@/lib/api';
import { Booking, Product } from '@/types';
import { Button, Input, DateRangePicker, PhoneInput, QRScanner, BookingProductTrackingModal } from '@/components/common';
import { isValidPhoneNumber, getCountryByCode } from '@/lib/countryCodes';
import { settingsApi } from '@/lib/settingsApi';
import { productTrackingApi } from '@/lib/productTrackingApi';

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [productBookings, setProductBookings] = useState<Record<number, any[]>>({});
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    booked_from: '',
    booked_to: '',
    status: 'pending' as const,
  });
  const [addFormData, setAddFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_phone_country: 'IN', // ISO code
    alternate_phone: '',
    alternate_phone_country: 'IN', // ISO code
    customer_address: '',
    booking_date: new Date().toISOString().split('T')[0],
    booked_from: '', // Not used anymore, kept for compatibility
    booked_to: '', // Not used anymore, kept for compatibility
    products: [] as { id: number; name: string; rent_per_day: number; code: string; size?: string; booked_from: string; booked_to: string }[],
    total_amount: 0,
    transportation_opted: false,
  });
  const [lastProductDates, setLastProductDates] = useState<{ from: string; to: string } | null>(null);
  const [showDateConfirmModal, setShowDateConfirmModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<any>(null);
  const [phoneNumberError, setPhoneNumberError] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [productSearchCode, setProductSearchCode] = useState('');
  const [transportationCharge, setTransportationCharge] = useState(0);
  const [customTransportationCharge, setCustomTransportationCharge] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [trackingBooking, setTrackingBooking] = useState<Booking | null>(null);
  const [showProductTrackingList, setShowProductTrackingList] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    fetchBookings();
    fetchProducts();
    fetchTransportationCharge();
  }, []);

  async function fetchTransportationCharge() {
    try {
      const response = await settingsApi.getByKey('transportation_charge');
      setTransportationCharge(parseFloat(response.data.setting_value) || 0);
    } catch (error) {
      console.error('Error fetching transportation charge:', error);
      setTransportationCharge(500); // Default fallback
    }
  }

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

  async function fetchProducts() {
    try {
      const response = await productsApi.getAll();
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }

  // Fetch bookings for a specific product to check availability
  async function fetchProductBookings(productId: number) {
    try {
      const response = await bookingsApi.getByProductId(productId);
      const bookingsData = response.data || [];
      setProductBookings(prev => ({
        ...prev,
        [productId]: bookingsData
      }));
      return bookingsData;
    } catch (error) {
      console.error('Error fetching product bookings:', error);
      return [];
    }
  }

  function handleModify(booking: Booking) {
    setSelectedBooking(booking);
    setFormData({
      customer_name: booking.customer_name,
      customer_phone: booking.customer_phone || '',
      customer_address: booking.customer_address || '',
      booked_from: booking.booked_from.split('T')[0],
      booked_to: booking.booked_to.split('T')[0],
      status: booking.status,
    });
    setShowModifyModal(true);
  }

  async function handleUpdate() {
    if (!selectedBooking) return;
    try {
      const oldStatus: string = selectedBooking.status;
      const newStatus: string = formData.status;
      
      await bookingsApi.update(selectedBooking.id, formData);
      
      // Auto-track when status changes to 'confirmed' (picked by customer)
      if (oldStatus !== 'confirmed' && newStatus === 'confirmed') {
        await handleAutoTrackPickup(selectedBooking);
      }
      
      // Auto-track return when status changes to 'completed'
      if (oldStatus !== 'completed' && newStatus === 'completed') {
        await handleAutoTrackReturn(selectedBooking);
      }
      
      await fetchBookings();
      setShowModifyModal(false);
      setSelectedBooking(null);
    } catch (error) {
      console.error('Error updating booking:', error);
      alert('Error updating booking');
    }
  }

  async function handleAutoTrackPickup(booking: Booking) {
    try {
      const products = Array.isArray(booking.products) ? booking.products : [];
      
      for (const product of products) {
        await productTrackingApi.create({
          product_id: product.id,
          booking_id: booking.id,
          product_code: product.code,
          tracking_type: 'picked_by_customer',
          notes: `Automatically tracked: Product picked up by ${booking.customer_name}`,
        });
      }
      
      console.log('✅ Products automatically tracked as picked by customer');
    } catch (error) {
      console.error('Error auto-tracking pickup:', error);
    }
  }

  async function handleAutoTrackReturn(booking: Booking) {
    try {
      // Get all tracking records and filter for this booking's active ones
      const response = await productTrackingApi.getAll();
      const allTracks = response.data?.data || response.data || [];
      const bookingTracks = allTracks.filter((track: any) => 
        track.booking_id === booking.id && track.status === 'out'
      );
      
      // Mark all as returned
      for (const track of bookingTracks) {
        await productTrackingApi.markReturned(
          track.id,
          `Automatically returned: Booking completed for ${booking.customer_name}`
        );
      }
      
      console.log('✅ Products automatically marked as returned');
    } catch (error) {
      console.error('Error auto-tracking return:', error);
    }
  }

  async function handleCancel(id: number, customerName: string) {
    if (!confirm(`Are you sure you want to cancel the booking with "${customerName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      // First, fetch the full booking details
      const response = await bookingsApi.getById(id);
      const booking = response.data;
      
      // Update the status and send the complete booking
      await bookingsApi.update(id, {
        ...booking,
        status: 'cancelled'
      });
      
      await fetchBookings();
      alert('✅ Booking cancelled successfully');
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('❌ Failed to cancel booking. Please try again.');
    }
  }

  // Check if phone numbers are the same
  function checkPhoneNumberDuplicate(phone1: string, country1: string, phone2: string, country2: string) {
    if (!phone1 || !phone2) {
      setPhoneNumberError('');
      return false;
    }

    const c1 = getCountryByCode(country1);
    const c2 = getCountryByCode(country2);
    
    if (!c1 || !c2) {
      setPhoneNumberError('');
      return false;
    }

    const fullPhone1 = `${c1.callingCode}${phone1}`;
    const fullPhone2 = `${c2.callingCode}${phone2}`;
    
    if (fullPhone1 === fullPhone2) {
      setPhoneNumberError('❌ Mobile Number and Alternate Mobile Number cannot be the same. Please enter a different number.');
      return true;
    } else {
      setPhoneNumberError('');
      return false;
    }
  }

  function handleAddBooking() {
    setAddFormData({
      customer_name: '',
      customer_phone: '',
      customer_phone_country: 'IN', // ISO code
      alternate_phone: '',
      alternate_phone_country: 'IN', // ISO code
      customer_address: '',
      booking_date: new Date().toISOString().split('T')[0],
      booked_from: '',
      booked_to: '',
      products: [],
      total_amount: 0,
      transportation_opted: false,
    });
    setPhoneNumberError('');
    setProductSearchCode('');
    setShowAddModal(true);
  }

  async function handleAddProduct(product: Product) {
    // Fetch availability for this product FIRST
    await fetchProductBookings(product.id);
    
    // Check if we have previous product dates
    if (lastProductDates && addFormData.products.length > 0) {
      // Ask if they want to use same dates
      setPendingProduct({
        id: product.id,
        name: product.name,
        code: product.code,
        size: product.size,
        rent_per_day: product.rent_per_day,
      });
      setShowDateConfirmModal(true);
    } else {
      // First product - add with empty dates
      setAddFormData({
        ...addFormData,
        products: [...addFormData.products, {
          id: product.id,
          name: product.name,
          code: product.code,
          size: product.size,
          rent_per_day: product.rent_per_day,
          booked_from: '',
          booked_to: '',
        }],
      });
      // Scroll to products table
      setTimeout(() => scrollToProducts(), 100);
    }
  }

  // Scroll to products table when product is added
  function scrollToProducts() {
    const productsTable = document.getElementById('booking-invoice-table');
    if (productsTable) {
      productsTable.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function confirmSameDates(useSameDates: boolean) {
    if (!pendingProduct) return;

    const newProduct = {
      ...pendingProduct,
      booked_from: useSameDates ? lastProductDates!.from : '',
      booked_to: useSameDates ? lastProductDates!.to : '',
    };

    // Add the new product and also fill any other empty products in one update
    if (useSameDates && lastProductDates) {
      const updatedProducts = [...addFormData.products, newProduct].map(p => {
        // Fill empty dates with the confirmed dates
        if ((!p.booked_from || p.booked_from === '') && (!p.booked_to || p.booked_to === '')) {
          return { ...p, booked_from: lastProductDates.from, booked_to: lastProductDates.to };
        }
        return p;
      });
      
      setAddFormData({
        ...addFormData,
        products: updatedProducts,
      });
    } else {
      // Just add the new product without auto-fill
      setAddFormData({
        ...addFormData,
        products: [...addFormData.products, newProduct],
      });
    }

    setShowDateConfirmModal(false);
    setPendingProduct(null);
    
    // Scroll to products table after modal closes
    setTimeout(() => scrollToProducts(), 100);
  }

  // Auto-fill dates for products without dates (only called when user confirms in modal)
  function autoFillProductDates(fromDate: string, toDate: string) {
    // Only fill products that have empty dates
    const updated = addFormData.products.map(p => {
      if ((!p.booked_from || p.booked_from === '') && (!p.booked_to || p.booked_to === '')) {
        return { ...p, booked_from: fromDate, booked_to: toDate };
      }
      return p;
    });
    
    setAddFormData({ ...addFormData, products: updated });
  }

  // Handle product search input change with autocomplete
  function handleSearchInputChange(value: string) {
    setProductSearchCode(value);
    
    if (value.trim().length > 0) {
      // Filter products by code or name, excluding already added products
      const filtered = products.filter(p => 
        (p.code.toLowerCase().includes(value.toLowerCase()) ||
        p.name.toLowerCase().includes(value.toLowerCase())) &&
        !addFormData.products.some(ap => ap.id === p.id)
      ).slice(0, 10); // Limit to 10 suggestions
      
      setFilteredProducts(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredProducts([]);
      setShowSuggestions(false);
    }
  }

  // Select product from suggestions
  function handleSelectSuggestion(product: Product) {
    handleAddProduct(product);
    setProductSearchCode('');
    setShowSuggestions(false);
    setFilteredProducts([]);
    alert(`✅ Product "${product.name}" added successfully!`);
  }

  // Search product by code (for Enter key or Add button)
  async function handleSearchByCode(code: string) {
    if (!code.trim()) return;
    
    try {
      const product = products.find(p => p.code.toLowerCase() === code.toLowerCase());
      if (product) {
        // Check if product is already added
        const isAlreadyAdded = addFormData.products.some(ap => ap.id === product.id);
        if (isAlreadyAdded) {
          alert(`⚠️ Product "${product.name}" is already in the booking`);
          return;
        }
        
        handleAddProduct(product);
        setProductSearchCode('');
        setShowSuggestions(false);
        setFilteredProducts([]);
        alert(`✅ Product "${product.name}" added successfully!`);
      } else {
        alert(`❌ Product with code "${code}" not found`);
      }
    } catch (error) {
      console.error('Error searching product:', error);
      alert('Error searching for product');
    }
  }

  // Handle QR code scan
  function handleQRScan(code: string) {
    console.log('QR Code scanned:', code);
    handleSearchByCode(code);
    setShowQRScanner(false);
  }

  // Calculate subtotal
  function calculateSubtotal() {
    const total = addFormData.products.reduce((sum, product) => {
      return sum + Math.floor(product.rent_per_day);
    }, 0);
    return Math.floor(total);
  }

  // Calculate final total (subtotal + transportation if opted)
  function calculateTotal() {
    const subtotal = calculateSubtotal();
    const transport = addFormData.transportation_opted ? Math.floor(transportationCharge) : 0;
    return Math.floor(subtotal + transport);
  }

  function handleRemoveProduct(productId: number) {
    setAddFormData({
      ...addFormData,
      products: addFormData.products.filter(p => p.id !== productId),
    });
  }


  async function handleCreateBooking() {
    // Basic required field validation
    if (!addFormData.customer_name || !addFormData.customer_phone || !addFormData.alternate_phone || addFormData.products.length === 0) {
      alert('Please fill in all required fields (name, mobile numbers) and add at least one product');
      return;
    }

    // Validate that all products have dates
    const productsWithoutDates = addFormData.products.filter(p => !p.booked_from || !p.booked_to);
    if (productsWithoutDates.length > 0) {
      alert('Please set pickup and return dates for all products');
      return;
    }

    // Validate mobile numbers using the library function
    if (!isValidPhoneNumber(addFormData.customer_phone, addFormData.customer_phone_country)) {
      alert('Please enter a valid Mobile Number');
      return;
    }

    if (!isValidPhoneNumber(addFormData.alternate_phone, addFormData.alternate_phone_country)) {
      alert('Please enter a valid Alternate Mobile Number');
      return;
    }

    // Get calling codes for submission
    const country1 = getCountryByCode(addFormData.customer_phone_country);
    const country2 = getCountryByCode(addFormData.alternate_phone_country);
    
    if (!country1 || !country2) {
      alert('Invalid country selection');
      return;
    }

    // Check if both numbers are the same
    const fullPhone1 = `${country1.callingCode}${addFormData.customer_phone}`;
    const fullPhone2 = `${country2.callingCode}${addFormData.alternate_phone}`;
    if (fullPhone1 === fullPhone2) {
      alert('❌ Mobile Number and Alternate Mobile Number cannot be the same. Please enter a different number.');
      return;
    }

    // Check if there's a phone number error
    if (phoneNumberError) {
      alert(phoneNumberError);
      return;
    }

    try {
      const finalTotal = calculateTotal();
      
      await bookingsApi.create({
        customer_name: addFormData.customer_name,
        customer_phone: fullPhone1,
        alternate_phone: fullPhone2,
        customer_address: addFormData.customer_address,
        booking_date: addFormData.booking_date,
        booked_from: addFormData.booked_from || '',
        booked_to: addFormData.booked_to || '',
        products: addFormData.products.map(p => ({ 
          id: p.id, 
          booked_from: p.booked_from,
          booked_to: p.booked_to
        })),
        total_amount: finalTotal,
        transportation_opted: addFormData.transportation_opted,
        status: 'pending',
      } as any);
      
      await fetchBookings();
      setShowAddModal(false);
      setProductSearchCode('');
      alert(`✅ Booking created successfully! Total: ₹${Math.floor(finalTotal)}`);
    } catch (error) {
      console.error('Error creating booking:', error);
      alert('Error creating booking');
    }
  }

  const filteredBookings = bookings.filter((b) => {
    // Search filter
    const matchesSearch = b.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.customer_phone && b.customer_phone.includes(searchTerm));
    
    // Date range filter - check if booking overlaps with selected date range
    let matchesDateRange = true;
    if (filterDateFrom && filterDateTo) {
      const products = Array.isArray(b.products) ? b.products : [];
      
      // Check if any product in this booking overlaps with the filter date range
      const hasOverlap = products.some((product: any) => {
        if (!product.booked_from || !product.booked_to) return false;
        
        const productFrom = new Date(product.booked_from);
        const productTo = new Date(product.booked_to);
        const filterFrom = new Date(filterDateFrom);
        const filterTo = new Date(filterDateTo);
        
        // Normalize to start of day
        productFrom.setHours(0, 0, 0, 0);
        productTo.setHours(0, 0, 0, 0);
        filterFrom.setHours(0, 0, 0, 0);
        filterTo.setHours(0, 0, 0, 0);
        
        // Check if date ranges overlap
        return productFrom <= filterTo && productTo >= filterFrom;
      });
      
      matchesDateRange = hasOverlap;
    }
    
    return matchesSearch && matchesDateRange;
  });

  if (loading) {
    return <div className="text-center py-12">Loading bookings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Bookings</h1>
        <Button onClick={handleAddBooking}>Add Booking</Button>
      </div>

      {/* Search and Date Filter */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex items-center space-x-4">
          <Input
            placeholder="Search by customer name or mobile..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <span className="text-sm text-gray-600">Total Orders: {bookings.length}</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <DateRangePicker
              label="📅 Check Bookings By Date"
              startDate={filterDateFrom}
              endDate={filterDateTo}
              onStartDateChange={(date) => setFilterDateFrom(date)}
              onEndDateChange={(date) => setFilterDateTo(date)}
              minDate="2000-01-01"
            />
          </div>
          {(filterDateFrom || filterDateTo) && (
            <button
              onClick={() => {
                setFilterDateFrom('');
                setFilterDateTo('');
              }}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Clear Dates
            </button>
          )}
        </div>
        
        {filterDateFrom && filterDateTo && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">🔍 Filtering:</span> Showing bookings overlapping between{' '}
              <strong>{new Date(filterDateFrom).toLocaleDateString('en-GB')}</strong> and{' '}
              <strong>{new Date(filterDateTo).toLocaleDateString('en-GB')}</strong>
            </p>
          </div>
        )}
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Products
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Booking Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Booked For
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product Tracking
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBookings.map((booking) => {
              const products = Array.isArray(booking.products) ? booking.products : [];
              const productCount = products.length;
              return (
                <tr key={booking.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {booking.customer_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {productCount} {productCount === 1 ? 'item' : 'items'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(booking.booking_date).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(booking.booked_from).toLocaleDateString('en-GB')} -{' '}
                    {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
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
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {products.length > 0 ? (
                      <button
                        onClick={() => {
                          setTrackingBooking(booking);
                          setShowProductTrackingList(true);
                        }}
                        className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        title="Track Products"
                      >
                        📦 Track ({products.length})
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No products</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-3">
                      {/* View Order Button */}
                      <button
                        onClick={() => window.location.href = `/admin/bookings/${booking.id}`}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                        title="View Order Details"
                      >
                        📋 View Order
                      </button>

                      {/* Watch Button */}
                      <button
                        onClick={() => setViewingBooking(booking)}
                        className="relative text-gray-600 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
                        title="Quick View"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-5 h-5"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
                      </button>

                      {/* Modify Button */}
                      <button
                        onClick={() => handleModify(booking)}
                        className="text-blue-600 hover:text-blue-900 hover:underline transition-colors"
                      >
                        Modify
                      </button>

                      {/* Cancel Button */}
                      {booking.status !== 'cancelled' && (
                        <button
                          onClick={() => handleCancel(booking.id, booking.customer_name)}
                          className="text-red-600 hover:text-red-900 hover:underline transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modify Modal */}
      {showModifyModal && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Modify Booking</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                  <Input
                    type="date"
                    value={formData.booked_from}
                    onChange={(e) => setFormData({ ...formData, booked_from: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                  <Input
                    type="date"
                    value={formData.booked_to}
                    onChange={(e) => setFormData({ ...formData, booked_to: e.target.value })}
                  />
                </div>
              </div>

              <h3 className="text-lg font-semibold mt-6">Contact Details</h3>
              <Input
                label="Name*"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                required
              />
              <Input
                label="Mobile Number (with country code)"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                placeholder="e.g., +911234567890"
              />

              <h3 className="text-lg font-semibold mt-6">Add Address</h3>
              <Input
                label="House Number*"
                onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
              />
              <Input
                label="Street Address*"
                value={formData.customer_address}
                onChange={(e) => setFormData({ ...formData, customer_address: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Town/City*" />
                <Input label="Pincode*" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="State*" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="flex space-x-3 mt-6">
                <Button onClick={handleUpdate}>Save</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowModifyModal(false);
                    setSelectedBooking(null);
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Booking Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl my-8">
            <h2 className="text-2xl font-bold mb-4">Add New Booking</h2>
            <div className="space-y-4">
              {/* Booking Date Display */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Booking Date:</span> {new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>

              {/* Note: Individual dates are set per product below */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  ℹ️ <strong>Note:</strong> You'll set pickup and return dates for each product individually when adding them to the bill.
                </p>
              </div>

              {/* Customer Details */}
              <h3 className="text-lg font-semibold mt-6">Customer Details</h3>
              <Input
                label="Customer Name*"
                value={addFormData.customer_name}
                onChange={(e) => setAddFormData({ ...addFormData, customer_name: e.target.value })}
                required
              />
              
              {/* Mobile Numbers with Country Codes */}
              <div className="grid grid-cols-2 gap-4">
                <PhoneInput
                  label="Mobile Number"
                  value={addFormData.customer_phone}
                  countryCode={addFormData.customer_phone_country}
                  onValueChange={(value) => {
                    console.log('Phone value changed:', value);
                    setAddFormData((prev) => {
                      const updated = { ...prev, customer_phone: value };
                      // Check for duplicate after state update
                      setTimeout(() => {
                        checkPhoneNumberDuplicate(value, prev.customer_phone_country, prev.alternate_phone, prev.alternate_phone_country);
                      }, 0);
                      return updated;
                    });
                  }}
                  onCountryCodeChange={(code) => {
                    console.log('Country code changed:', code);
                    setAddFormData((prev) => {
                      const updated = { ...prev, customer_phone_country: code };
                      // Check for duplicate after state update
                      setTimeout(() => {
                        checkPhoneNumberDuplicate(prev.customer_phone, code, prev.alternate_phone, prev.alternate_phone_country);
                      }, 0);
                      return updated;
                    });
                  }}
                  required
                />
                <PhoneInput
                  label="Alternate Mobile Number"
                  value={addFormData.alternate_phone}
                  countryCode={addFormData.alternate_phone_country}
                  onValueChange={(value) => {
                    console.log('Alt phone value changed:', value);
                    setAddFormData((prev) => {
                      const updated = { ...prev, alternate_phone: value };
                      // Check for duplicate after state update
                      setTimeout(() => {
                        checkPhoneNumberDuplicate(prev.customer_phone, prev.customer_phone_country, value, prev.alternate_phone_country);
                      }, 0);
                      return updated;
                    });
                  }}
                  onCountryCodeChange={(code) => {
                    console.log('Alt country code changed:', code);
                    setAddFormData((prev) => {
                      const updated = { ...prev, alternate_phone_country: code };
                      // Check for duplicate after state update
                      setTimeout(() => {
                        checkPhoneNumberDuplicate(prev.customer_phone, prev.customer_phone_country, prev.alternate_phone, code);
                      }, 0);
                      return updated;
                    });
                  }}
                  required
                />
              </div>
              
              {/* Error Message for Duplicate Phone Numbers */}
              {phoneNumberError && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg animate-fadeIn">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-red-800 font-semibold text-sm">{phoneNumberError}</p>
                  </div>
                </div>
              )}
              
              <Input
                label="Address"
                value={addFormData.customer_address}
                onChange={(e) => setAddFormData({ ...addFormData, customer_address: e.target.value })}
              />

              {/* Products Selection - Enhanced with Search & QR */}
              <div className="mt-6 space-y-4">
                <h3 className="text-lg font-semibold">Add Products*</h3>
                
                {/* Product Search Bar with Autocomplete */}
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Enter Product Code or Name
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={productSearchCode}
                          onChange={(e) => handleSearchInputChange(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              handleSearchByCode(productSearchCode);
                            }
                          }}
                          onFocus={() => {
                            if (productSearchCode.trim() && filteredProducts.length > 0) {
                              setShowSuggestions(true);
                            }
                          }}
                          onBlur={() => {
                            // Delay to allow click on suggestion
                            setTimeout(() => setShowSuggestions(false), 200);
                          }}
                          placeholder="Type code or name... (e.g., SH-000001 or Sherwani)"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        
                        {/* Autocomplete Suggestions Dropdown */}
                        {showSuggestions && filteredProducts.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border-2 border-blue-300 rounded-lg shadow-xl max-h-80 overflow-y-auto">
                            <div className="p-2">
                              <p className="text-xs text-gray-500 px-3 py-1 font-semibold uppercase">
                                {filteredProducts.length} {filteredProducts.length === 1 ? 'match' : 'matches'} found
                              </p>
                              {filteredProducts.map((product) => (
                                <button
                                  key={product.id}
                                  onClick={() => handleSelectSuggestion(product)}
                                  className="w-full text-left px-3 py-3 hover:bg-blue-50 rounded-lg transition-colors border-b border-gray-100 last:border-0"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <p className="font-semibold text-gray-900">{product.name}</p>
                                      <p className="text-sm text-gray-600">
                                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{product.code}</span>
                                        {product.size && <span className="ml-2">• Size: {product.size}</span>}
                                      </p>
                                    </div>
                                    <div className="text-right ml-3">
                                      <p className="font-bold text-green-600">₹{Math.floor(product.rent_per_day)}</p>
                                      <p className="text-xs text-gray-500">/day</p>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* No Results Message */}
                        {showSuggestions && productSearchCode.trim() && filteredProducts.length === 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg p-4">
                            <div className="text-center text-gray-500">
                              <p className="text-sm">❌ No products found matching "{productSearchCode}"</p>
                              <p className="text-xs mt-1">Try different code or name</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      💡 Start typing to see suggestions from inventory
                    </p>
                  </div>
                  
                  <div className="pt-6">
                    <button
                      onClick={() => setShowQRScanner(true)}
                      className="px-6 py-2 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      <span className="text-xl">📷</span>
                      Scan QR
                    </button>
                  </div>
                </div>

                {/* Bill-Style Product Display */}
                {addFormData.products.length > 0 ? (
                  <div id="booking-invoice-table" className="bg-white border-2 border-gray-300 rounded-lg overflow-hidden">
                    {/* Bill Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-3">
                      <h4 className="text-lg font-bold">📋 Booking Invoice</h4>
                      <p className="text-sm text-blue-100">Selected Products & Services</p>
                    </div>

                    {/* Products Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-100 border-b-2 border-gray-300">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase w-12">#</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Product Details</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase w-24">Size</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase w-64">Rental Dates*</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase w-32">Price</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase w-20">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {addFormData.products.map((product, index) => (
                            <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-4 text-center">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
                                  {index + 1}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <div>
                                  <p className="font-semibold text-gray-900">{product.name}</p>
                                  <p className="text-sm text-gray-500 font-mono">{product.code}</p>
                                  <p className="text-xs text-gray-400">₹{Math.floor(product.rent_per_day)}/day</p>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <span className="inline-block px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                                  {product.size || 'N/A'}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <DateRangePicker
                                  key={`date-picker-${product.id}-${index}`}
                                  label=""
                                  startDate={addFormData.products[index]?.booked_from || ''}
                                  endDate={addFormData.products[index]?.booked_to || ''}
                                  bookings={productBookings[product.id] || []}
                                  productName={product.name}
                                  onStartDateChange={(date) => {
                                    setAddFormData(prev => {
                                      const updated = [...prev.products];
                                      updated[index] = { ...updated[index], booked_from: date };
                                      return { ...prev, products: updated };
                                    });
                                    
                                    // Only update last dates for reference, don't auto-fill
                                    if (date && addFormData.products[index].booked_to) {
                                      setLastProductDates({ from: date, to: addFormData.products[index].booked_to });
                                    }
                                  }}
                                  onEndDateChange={(date) => {
                                    setAddFormData(prev => {
                                      const updated = [...prev.products];
                                      updated[index] = { ...updated[index], booked_to: date };
                                      return { ...prev, products: updated };
                                    });
                                    
                                    // Only update last dates for reference, don't auto-fill
                                    if (product.booked_from && date) {
                                      setLastProductDates({ from: product.booked_from, to: date });
                                    }
                                  }}
                                  compact={true}
                                />
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="font-bold text-gray-900">₹{Math.floor(product.rent_per_day)}</p>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <button
                                  onClick={() => handleRemoveProduct(product.id)}
                                  className="text-red-600 hover:text-red-800 font-medium text-sm transition-colors"
                                  title="Remove Product"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Subtotal */}
                    <div className="bg-blue-50 border-t-2 border-blue-200 px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">Subtotal ({addFormData.products.length} {addFormData.products.length === 1 ? 'item' : 'items'})</span>
                      <span className="text-xl font-bold text-blue-600">₹{calculateSubtotal()}</span>
                    </div>

                    {/* Transportation Option */}
                    <div className="bg-gray-50 border-t border-gray-200 px-4 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">🚚</span>
                          <div>
                            <p className="font-semibold text-gray-800">Transportation Service</p>
                            <p className="text-sm text-gray-600">Local delivery & pickup service</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="transportation"
                              checked={!addFormData.transportation_opted}
                              onChange={() => {
                                setAddFormData({ ...addFormData, transportation_opted: false });
                                setCustomTransportationCharge('');
                                setTransportationCharge(0);
                              }}
                              className="w-5 h-5 text-gray-600"
                            />
                            <span className="font-medium text-gray-700">No</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="transportation"
                              checked={addFormData.transportation_opted}
                              onChange={() => setAddFormData({ ...addFormData, transportation_opted: true })}
                              className="w-5 h-5 text-blue-600"
                            />
                            <span className="font-medium text-gray-700">Yes</span>
                          </label>
                        </div>
                      </div>
                      
                      {/* Transportation Charge Input - Shows when Yes is selected */}
                      {addFormData.transportation_opted && (
                        <div className="mt-3 pl-12">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Enter Transportation Charge*
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700 font-medium">₹</span>
                            <input
                              type="number"
                              value={customTransportationCharge}
                              onChange={(e) => {
                                const value = e.target.value;
                                // Only allow positive numbers
                                if (value === '' || parseFloat(value) >= 0) {
                                  setCustomTransportationCharge(value);
                                  setTransportationCharge(parseFloat(value) || 0);
                                }
                              }}
                              placeholder="Enter amount"
                              min="0"
                              step="1"
                              className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Final Total */}
                    <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-4 py-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm text-green-100 uppercase tracking-wide">Total Rental Amount</p>
                          {addFormData.transportation_opted && (
                            <p className="text-xs text-green-200 mt-1">
                              (Includes local transportation: ₹{Math.floor(transportationCharge)})
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-4xl font-bold">₹{calculateTotal()}</p>
                          <p className="text-sm text-green-100">per rental period</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <div className="text-6xl mb-4">📦</div>
                    <p className="text-gray-600 font-medium mb-2">No products added yet</p>
                    <p className="text-sm text-gray-500">Enter a product code or scan QR to add products</p>
                  </div>
                )}

              </div>

              <div className="flex space-x-3 mt-6">
                <Button onClick={handleCreateBooking}>Create Booking</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setProductSearchCode('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Confirmation Modal */}
      {showDateConfirmModal && lastProductDates && pendingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-xl font-bold mb-4 text-gray-900">Use Same Rental Period?</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-700 mb-2">
                Previous product rental period:
              </p>
              <p className="text-lg font-bold text-blue-700">
                {new Date(lastProductDates.from).toLocaleDateString('en-GB')} to {new Date(lastProductDates.to).toLocaleDateString('en-GB')}
              </p>
            </div>
            <p className="text-gray-700 mb-6">
              Do you want to use the same rental period for <strong>{pendingProduct.name}</strong>?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => confirmSameDates(true)}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-colors"
              >
                ✓ Yes, Use Same Dates
              </button>
              <button
                onClick={() => confirmSameDates(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 rounded-lg transition-colors"
              >
                ✗ No, I'll Set Different Dates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* Booking Product Tracking Modal */}
      {trackingBooking && showProductTrackingList && (
        <BookingProductTrackingModal
          booking={trackingBooking}
          onClose={() => {
            setTrackingBooking(null);
            setShowProductTrackingList(false);
            fetchBookings(); // Refresh bookings after tracking updates
          }}
        />
      )}

      {/* View Booking Modal */}
      {viewingBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slideIn">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                📋 Booking Details
              </h2>
              <button
                onClick={() => {
                  setViewingBooking(null);
                  setShowMeasurements(false);
                }}
                className="text-gray-500 hover:text-gray-700 text-3xl font-bold transition-colors"
              >
                ×
              </button>
            </div>

            {/* Booking Content */}
            <div className="space-y-6">
              {/* Customer Information */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 border-l-4 border-blue-500">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-blue-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  Customer Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="text-base font-semibold text-gray-900">{viewingBooking.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="text-base font-semibold text-gray-900">{viewingBooking.customer_phone || 'N/A'}</p>
                  </div>
                  {viewingBooking.alternate_phone && (
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600">Alternate Phone</p>
                      <p className="text-base font-semibold text-gray-900">{viewingBooking.alternate_phone}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">Address</p>
                    <p className="text-base font-semibold text-gray-900">{viewingBooking.customer_address || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Booking Details */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-5 border-l-4 border-green-500">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-green-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  Booking Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Booking Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      {new Date(viewingBooking.booking_date).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <span
                      className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                        viewingBooking.status === 'confirmed'
                          ? 'bg-green-100 text-green-800'
                          : viewingBooking.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : viewingBooking.status === 'completed'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {viewingBooking.status.charAt(0).toUpperCase() + viewingBooking.status.slice(1)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Pickup Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      📅 {new Date(viewingBooking.booked_from).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Return Date</p>
                    <p className="text-base font-semibold text-gray-900">
                      📅 {new Date(viewingBooking.booked_to).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">Rental Duration</p>
                    <p className="text-base font-semibold text-gray-900">
                      {Math.ceil((new Date(viewingBooking.booked_to).getTime() - new Date(viewingBooking.booked_from).getTime()) / (1000 * 60 * 60 * 24))} days
                    </p>
                  </div>
                </div>
              </div>

              {/* Products */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-5 border-l-4 border-purple-500">
                <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-purple-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  Booked Products ({Array.isArray(viewingBooking.products) ? viewingBooking.products.length : 0})
                </h3>
                {Array.isArray(viewingBooking.products) && viewingBooking.products.length > 0 ? (
                  <div className="space-y-3">
                    {viewingBooking.products.map((product: any, index: number) => (
                      <div key={index} className="bg-white rounded-lg p-4 shadow-sm border border-purple-200">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-900 text-lg">{product.name}</p>
                            <p className="text-sm text-gray-600 mt-1">Code: <span className="font-mono font-semibold">{product.code || 'N/A'}</span></p>
                            {product.size && (
                              <p className="text-sm text-gray-600">Size: <span className="font-semibold">{product.size}</span></p>
                            )}
                            {product.rent_per_day && (
                              <p className="text-sm text-gray-600">Rate: <span className="font-semibold text-green-600">₹{Math.floor(product.rent_per_day)}/day</span></p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No products in this booking</p>
                )}
              </div>

              {/* Payment Information */}
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-5 border-l-4 border-yellow-500">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-yellow-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                  Payment Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-yellow-200">
                    <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                    <p className="text-2xl font-bold text-gray-900">₹{Math.floor(viewingBooking.total_amount || 0)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-green-200">
                    <p className="text-sm text-gray-600 mb-1">Paid Amount</p>
                    <p className="text-2xl font-bold text-green-600">₹{Math.floor(viewingBooking.paid_amount || 0)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-red-200">
                    <p className="text-sm text-gray-600 mb-1">Due Amount</p>
                    <p className="text-2xl font-bold text-red-600">₹{Math.floor(viewingBooking.due_amount || viewingBooking.total_amount || 0)}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-blue-200">
                    <p className="text-sm text-gray-600 mb-1">Payment Status</p>
                    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                      viewingBooking.payment_status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : viewingBooking.payment_status === 'partial'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {viewingBooking.payment_status === 'paid' ? '✓ Paid' : viewingBooking.payment_status === 'partial' ? '⚠ Partial' : '✗ Unpaid'}
                    </span>
                  </div>
                  {viewingBooking.payment_method && (
                    <div className="col-span-2 bg-white rounded-lg p-4 shadow-sm border-2 border-purple-200">
                      <p className="text-sm text-gray-600 mb-1">Payment Method</p>
                      <p className="text-base font-semibold text-gray-900">{viewingBooking.payment_method}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Special Requirements */}
              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg p-5 border-l-4 border-teal-500">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-teal-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                  Special Requirements
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center bg-white rounded-lg p-4 shadow-sm border-2 border-teal-200">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-3 text-teal-600">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 4.5h7.5m-7.5 0V3.375c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125V4.5m-13.5 0h15m-13.5 0v9.375c0 .621.504 1.125 1.125 1.125h13.5c.621 0 1.125-.504 1.125-1.125V4.5m0 0V3.375c0-.621-.504-1.125-1.125-1.125h-1.5" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">Transportation</p>
                      <p className="text-base font-semibold text-gray-900">
                        {viewingBooking.transportation_opted ? (
                          <span className="text-green-600">✓ Yes - Transportation service opted</span>
                        ) : (
                          <span className="text-gray-600">✗ No transportation required</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {viewingBooking.special_requirements && (
                    <div className="bg-white rounded-lg p-4 shadow-sm border-2 border-teal-200">
                      <p className="text-sm text-gray-600 mb-2">Additional Requirements</p>
                      <p className="text-base text-gray-900">{viewingBooking.special_requirements}</p>
                    </div>
                  )}
                  {!viewingBooking.special_requirements && !viewingBooking.transportation_opted && (
                    <p className="text-gray-500 text-center py-2 text-sm">No special requirements specified</p>
                  )}
                </div>
              </div>

              {/* Measurements - Collapsible */}
              {viewingBooking.measurements && Object.keys(viewingBooking.measurements).length > 0 && (
                <div className="bg-gradient-to-r from-pink-50 to-rose-50 rounded-lg p-5 border-l-4 border-pink-500">
                  <button
                    onClick={() => setShowMeasurements(!showMeasurements)}
                    className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
                  >
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 mr-2 text-pink-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25h6M9 12h6m-6 3.75h6" />
                      </svg>
                      Customer Measurements
                      <span className="ml-2 text-sm text-pink-600">(Click to {showMeasurements ? 'hide' : 'view'})</span>
                    </h3>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className={`w-6 h-6 text-pink-600 transition-transform duration-300 ${showMeasurements ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {showMeasurements && (
                    <div className="mt-4 grid grid-cols-2 gap-3 animate-slideIn">
                      {viewingBooking.measurements.chest && (
                        <div className="bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600">Chest</p>
                          <p className="text-lg font-bold text-gray-900">{viewingBooking.measurements.chest}</p>
                        </div>
                      )}
                      {viewingBooking.measurements.waist && (
                        <div className="bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600">Waist</p>
                          <p className="text-lg font-bold text-gray-900">{viewingBooking.measurements.waist}</p>
                        </div>
                      )}
                      {viewingBooking.measurements.height && (
                        <div className="bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600">Height</p>
                          <p className="text-lg font-bold text-gray-900">{viewingBooking.measurements.height}</p>
                        </div>
                      )}
                      {viewingBooking.measurements.shoulder && (
                        <div className="bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600">Shoulder</p>
                          <p className="text-lg font-bold text-gray-900">{viewingBooking.measurements.shoulder}</p>
                        </div>
                      )}
                      {viewingBooking.measurements.sleeve && (
                        <div className="bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600">Sleeve</p>
                          <p className="text-lg font-bold text-gray-900">{viewingBooking.measurements.sleeve}</p>
                        </div>
                      )}
                      {viewingBooking.measurements.length && (
                        <div className="bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600">Length</p>
                          <p className="text-lg font-bold text-gray-900">{viewingBooking.measurements.length}</p>
                        </div>
                      )}
                      {viewingBooking.measurements.hip && (
                        <div className="bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600">Hip</p>
                          <p className="text-lg font-bold text-gray-900">{viewingBooking.measurements.hip}</p>
                        </div>
                      )}
                      {viewingBooking.measurements.inseam && (
                        <div className="bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600">Inseam</p>
                          <p className="text-lg font-bold text-gray-900">{viewingBooking.measurements.inseam}</p>
                        </div>
                      )}
                      {viewingBooking.measurements.notes && (
                        <div className="col-span-2 bg-white rounded-lg p-3 shadow-sm border-2 border-pink-200">
                          <p className="text-xs text-gray-600 mb-1">Additional Notes</p>
                          <p className="text-sm text-gray-900">{viewingBooking.measurements.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Close Button */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => {
                  setViewingBooking(null);
                  setShowMeasurements(false);
                }}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

