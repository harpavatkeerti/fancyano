'use client';

import { useEffect, useState } from 'react';
import { bookingsApi, availabilityApi } from '@/lib/api';
import { Booking } from '@/types';
import { getImageUrl } from '@/lib/imageHelper';
import Link from 'next/link';
import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from '@/components/common/AlertBanner';
import { useConfirm } from '@/hooks/useConfirm';
import { useAuth } from '@/lib/authContext';
import { isBookingUrgent, getUrgentReason, isPending } from '@/lib/bookingHelpers';
import { BookingStatusIcon } from '@/components/common/BookingStatusIcon';

export default function MyBookingsPage() {
  const { confirm, ConfirmDialog: ConfirmDialogComponent } = useConfirm();
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();
  const auth = useAuth();
  if (!auth.user) return null;
  const currentUser = auth.user;
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]); // All bookings for search/display
  const [urgentBookingsMap, setUrgentBookingsMap] = useState<Record<number, { is_urgent: boolean; reasons: string[] }>>({});
  const [loading, setLoading] = useState(true);
  
  // Search functionality
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Booking[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all'); // Status filter
  


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
      const customerNameMatch = booking.user.name.toLowerCase().includes(searchTerm);
      
      // Search by Mobile Number (only when search term contains digits)
      const digitsOnly = searchTerm.replace(/\D/g, '');
      const phoneMatch = digitsOnly.length > 0
        ? booking.user.phone.replace(/\D/g, '').includes(digitsOnly)
        : false;
      
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

      // Store ALL bookings for search/display
      setAllBookings(response.data);

      // Identify current user from auth context — always reliable
      const createdBy = currentUser.name.trim();

      // Normalize names for comparison (trim whitespace, case-insensitive)
      const normalizeName = (name: string | null | undefined): string => {
        if (!name) return '';
        return name.trim().toLowerCase();
      };

      const normalizedCreatedBy = normalizeName(createdBy);

      // Filter for current user's own bookings (where created_by matches logged-in user)
      const filteredBookings = response.data.filter((booking: Booking) => {
        const bookingCreatedBy = normalizeName(booking.created_by);
        return normalizedCreatedBy && bookingCreatedBy && bookingCreatedBy === normalizedCreatedBy;
      });

      setBookings(filteredBookings);

      // Fetch urgency status for active bookings from the backend
      const activeBookingIds = response.data
        .filter((b: any) => !['cancelled', 'completed', 'discarded'].includes(b.status))
        .map((b: any) => b.id);
      if (activeBookingIds.length > 0) {
        try {
          const urgentResponse = await availabilityApi.getUrgentBulk(activeBookingIds);
          setUrgentBookingsMap(urgentResponse.data);
        } catch (err) {
          console.error('Error fetching urgent status:', err);
        }
      }
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
      addAlert('Failed to delete booking. Please try again.');
    }
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
      {/* Inline alert banner */}
      <AlertBanner alerts={alerts} onDismiss={removeAlert} className="mb-4" />
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
        const displayBookings = (isSearching ? searchResults : allBookings)
          .filter(b => statusFilter === 'all' || b.status === statusFilter);
        const listTitle = isSearching ? 'Search Results' : 'All Bookings';
        
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
            const canDelete = isPending(booking.status);
            const isUrgent = isBookingUrgent(booking.id, urgentBookingsMap);
            const urgentReason = isUrgent ? getUrgentReason(booking.id, urgentBookingsMap) : '';
            
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
                  href={`/bookings/${booking.id}`}
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
                      <BookingStatusIcon booking={booking} />
                      <p className="text-red-600 font-semibold mt-2">
                        Dates:{' '}
                        {new Date(booking.booked_from).toLocaleDateString('en-GB')} To{' '}
                        {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Customer: {booking.user.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        Total: ₹{Math.floor(
                          ((booking as any).total_effective_rent || 0) + ((booking as any).transport_charge || 0)
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

