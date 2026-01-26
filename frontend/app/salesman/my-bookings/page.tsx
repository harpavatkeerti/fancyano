'use client';

import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import { useConfirm } from '@/hooks/useConfirm';

export default function MyBookingsPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]); // All bookings for comparison
  const [loading, setLoading] = useState(true);
  
  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Booking[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all'); // Status filter
  
  // Function to check if a booking is urgent (based on tight scheduling with other bookings)
  function isBookingUrgent(booking: Booking): boolean {
    // Don't check urgent status for cancelled bookings
    if (booking.status === 'cancelled') {
      return false;
    }

    const products = Array.isArray(booking.products) ? booking.products : [];
    
    for (const product of products) {
      const thisPickupDate = new Date(product.booked_from || booking.booked_from);
      const thisDropDate = new Date(product.booked_to || booking.booked_to);
      thisPickupDate.setHours(0, 0, 0, 0);
      thisDropDate.setHours(0, 0, 0, 0);

      // Check all OTHER bookings for the SAME product
      for (const otherBooking of allBookings) {
        if (otherBooking.id === booking.id || otherBooking.status === 'cancelled') {
          continue;
        }

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
            return true;
          }

          const daysBetweenDropAndNextPickup = Math.ceil((otherPickupDate.getTime() - thisDropDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysBetweenDropAndNextPickup > 0 && daysBetweenDropAndNextPickup <= 2) {
            return true;
          }
        }
      }
    }

    return false;
  }

  // Function to get urgent reason
  function getUrgentReason(booking: Booking): string {
    const products = Array.isArray(booking.products) ? booking.products : [];
    const reasons: string[] = [];
    
    for (const product of products) {
      const thisPickupDate = new Date(product.booked_from || booking.booked_from);
      const thisDropDate = new Date(product.booked_to || booking.booked_to);
      thisPickupDate.setHours(0, 0, 0, 0);
      thisDropDate.setHours(0, 0, 0, 0);

      for (const otherBooking of allBookings) {
        if (otherBooking.id === booking.id || otherBooking.status === 'cancelled') {
          continue;
        }

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
            reasons.push(`${product.code}: Only ${daysBetweenDropAndPickup} day gap before pickup`);
          }

          const daysBetweenDropAndNextPickup = Math.ceil((otherPickupDate.getTime() - thisDropDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysBetweenDropAndNextPickup > 0 && daysBetweenDropAndNextPickup <= 2) {
            reasons.push(`${product.code}: Only ${daysBetweenDropAndNextPickup} day gap after return`);
          }
        }
      }
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Tight schedule';
  }

  // Handle search across all bookings
  function handleSearch(query: string) {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const searchTerm = query.toLowerCase().trim();
    
    // Search in ALL bookings (not just salesman's own)
    const results = allBookings.filter((booking) => {
      // Search by Booking ID
      const bookingIdMatch = booking.id.toString().includes(searchTerm);
      
      // Search by Customer Name
      const customerNameMatch = booking.customer_name?.toLowerCase().includes(searchTerm);
      
      // Search by Mobile Number (remove country code and search)
      const phoneMatch = booking.customer_phone?.replace(/\D/g, '').includes(searchTerm.replace(/\D/g, ''));
      
      return bookingIdMatch || customerNameMatch || phoneMatch;
    });
    
    setSearchResults(results);
  }

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    try {
      const response = await bookingsApi.getAll();
      
      // Store ALL bookings for urgent checking
      setAllBookings(response.data);
      
      // Get logged-in salesman name from localStorage (same logic as cart page)
      const userData = localStorage.getItem('user');
      let salesmanName = '';
      
      if (userData) {
        try {
          const user = JSON.parse(userData);
          salesmanName = user.name || user.userName || '';
        } catch (e) {
          // If parsing fails, try direct keys
          salesmanName = localStorage.getItem('salesman_name') || localStorage.getItem('user_name') || localStorage.getItem('name') || '';
        }
      } else {
        salesmanName = localStorage.getItem('salesman_name') || localStorage.getItem('user_name') || localStorage.getItem('name') || '';
      }
      
      // Normalize names for comparison (trim whitespace, case-insensitive)
      const normalizeName = (name: string | null | undefined): string => {
        if (!name) return '';
        return name.trim().toLowerCase();
      };
      
      const normalizedSalesmanName = normalizeName(salesmanName);
      
      console.log('🔍 Fetching bookings for salesman:', salesmanName, '(normalized:', normalizedSalesmanName + ')');
      console.log('📦 Total bookings from API:', response.data.length);
      
      // Filter for salesman's own bookings (where created_by matches logged-in salesman)
      // Use case-insensitive comparison and trim whitespace
      const filteredBookings = response.data.filter((booking: Booking) => {
        const bookingCreatedBy = normalizeName(booking.created_by);
        const matches = normalizedSalesmanName && bookingCreatedBy && bookingCreatedBy === normalizedSalesmanName;
        
        if (matches) {
          console.log(`✅ Booking ${booking.id} matches (created_by: "${booking.created_by}")`);
        }
        
        return matches;
      });
      
      console.log('📋 Filtered bookings count:', filteredBookings.length);
      console.log('📋 Filtered bookings:', filteredBookings.map((b: Booking) => ({ id: b.id, created_by: b.created_by, status: b.status })));
      
      setBookings(filteredBookings);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(bookingId: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    const confirmed = await confirm({
      title: 'Delete Booking',
      message: 'Are you sure you want to delete this booking? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'red',
      onConfirm: () => {},
      onCancel: () => {},
    });

    if (!confirmed) {
      return;
    }

    try {
      await bookingsApi.delete(bookingId);
      await fetchBookings();
      toast.success('Booking deleted successfully');
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast.error('Failed to delete booking. Please try again.');
    }
  }

  function isPending(booking: Booking): boolean {
    // A booking is pending if its status is 'pending'
    return booking.status === 'pending';
  }

  function getStatusIcon(status: string, booking: Booking) {
    // If booking is cancelled, show cancelled status
    if (status === 'cancelled' || booking.status === 'cancelled') {
      return (
        <div className="flex items-center text-red-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          Cancelled
        </div>
      );
    }

    // If status is already completed (refund processed), show completed
    if (status === 'completed') {
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Completed
        </div>
      );
    }

    // Use the booking status from backend - backend updates status based on product states and payments
    // Simplified logic: trust the backend status
    let displayStatus = status;
    
    // Check if refund exists (completed)
    if (status === 'completed' || displayStatus === 'completed') {
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          Completed
        </div>
      );
    }

    if (actualStatus === 'in_progress') {
      // Check if it's partially completed (multiple products with different dates)
      const products = Array.isArray(booking.products) ? booking.products : [];
      if (products.length > 1) {
        const dates = products.map((p: any) => ({
          from: p.booked_from || booking.booked_from,
          to: p.booked_to || booking.booked_to
        }));
        const uniqueDates = new Set(dates.map((d: any) => `${d.from}-${d.to}`));
        if (uniqueDates.size > 1) {
          return (
            <div className="flex items-center text-orange-600">
              <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Partially Completed
            </div>
          );
        }
      }
      return (
        <div className="flex items-center text-blue-600">
          <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
          Under Process
        </div>
      );
    }

    if (actualStatus === 'confirmed') {
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
    }

    // Pending (no payment recorded)
    return (
      <div className="flex items-center text-gray-600">
        <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
            clipRule="evenodd"
          />
        </svg>
        Payment Pending
      </div>
    );
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

      {/* Search Bar */}
      <div className="mb-8 bg-white border-2 border-gray-300 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🔍 Search All Bookings</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by Booking ID, Customer Name, or Mobile Number..."
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-base"
            />
            <p className="text-xs text-gray-500 mt-2">
              💡 Tip: Type booking ID (e.g., "120"), customer name, or mobile number to search across all bookings
            </p>
          </div>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setIsSearching(false);
                setSearchResults([]);
              }}
              className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        
        {/* Status Filter */}
        <div className="flex items-center gap-3 mt-4">
          <label className="text-sm font-medium text-gray-700">Filter by Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
          >
            <option value="all">All Status</option>
            <option value="pending">⏳ Pending</option>
            <option value="confirmed">✅ Confirmed</option>
            <option value="in_progress">🔄 In Progress</option>
            <option value="completed">✔️ Completed</option>
            <option value="cancelled">❌ Cancelled</option>
          </select>
        </div>
        
        {/* Search Results Summary */}
        {isSearching && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              {searchResults.length === 0 ? (
                <>❌ No bookings found matching "<strong>{searchQuery}</strong>"</>
              ) : (
                <>✅ Found <strong>{searchResults.length}</strong> booking(s) matching "<strong>{searchQuery}</strong>"</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Display appropriate bookings list */}
      {(() => {
        const displayBookings = (isSearching ? searchResults : bookings)
          .filter(b => statusFilter === 'all' || b.status === statusFilter);
        const listTitle = isSearching ? 'Search Results' : 'My Bookings';
        
        return (
          <>
            {isSearching && searchResults.length > 0 && (
              <h2 className="text-xl font-semibold text-gray-900 mb-4">{listTitle}</h2>
            )}
            
            {displayBookings.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <p className="text-gray-500 mb-4">
                  {isSearching 
                    ? 'No bookings found matching your search'
                    : 'No bookings found'}
                </p>
                {!isSearching && (
                  <p className="text-sm text-gray-400">
                    Create a booking from the cart to see it here
                  </p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">{displayBookings.map((booking) => {
            const products = Array.isArray(booking.products) ? booking.products : [];
            const canDelete = isPending(booking);
            const isUrgent = isBookingUrgent(booking);
            const urgentReason = isUrgent ? getUrgentReason(booking) : '';
            
            return (
              <div
                key={booking.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow relative"
              >
                {/* Urgent Badge */}
                {isUrgent && (
                  <div className="absolute top-4 right-4 z-10">
                    <span 
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded uppercase shadow-lg"
                      title={urgentReason}
                    >
                      URGENT
                    </span>
                  </div>
                )}
                
                <Link
                  href={`/salesman/order-details/${booking.id}`}
                  className="block"
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
                      {getStatusIcon(booking.status, booking)}
                      <p className="text-red-600 font-semibold mt-2">
                        Dates:{' '}
                        {new Date(booking.booked_from).toLocaleDateString('en-GB')} To{' '}
                        {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Customer: {booking.customer_name}
                      </p>
                      <p className="text-sm text-gray-600">
                        Total: ₹{Math.floor(
                          ((booking as any).total_rent || 0) + ((booking as any).transport_charge || 0)
                        )}
                      </p>
                    </div>
                  </div>
                </Link>
                
                {/* Delete Button for Pending Bookings */}
                {canDelete && (
                  <button
                    onClick={(e) => handleDelete(booking.id, e)}
                    className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
            )}
          </>
        );
      })()}
      {ConfirmDialogComponent}
    </div>
  );
}

