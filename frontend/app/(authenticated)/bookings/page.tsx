'use client';

import { useEffect, useState } from 'react';
import { bookingsApi, creditNotesApi, bookingDiscardApi, availabilityApi } from '@/lib/api';
import { BookingCancellation } from '@/components/common/BookingCancellation';
import { Booking } from '@/types';
import { Input, DateRangePicker } from '@/components/common';
import { UrgentDetailsModal } from '@/components/common';
import RequireRole from '@/components/common/RequireRole';
import { getImageUrl } from '@/lib/imageHelper';
import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from '@/components/common/AlertBanner';
import { integerKeyDown, isIntegerInput } from '@/lib/integerInput';
import { useAuth } from '@/lib/authContext';

import { isBookingUrgent, getUrgentReason } from '@/lib/bookingHelpers';

export default function BookingsPage() {
  const auth = useAuth();
  if (!auth.user) return null;
  const currentUser = auth.user;
  const isAdmin = currentUser.role === 'admin';
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [viewingBooking, setViewingBooking] = useState<Booking | null>(null);

  const [parsedSpecialRequirements, setParsedSpecialRequirements] = useState<{ [key: string]: string }>({});
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();

  // Credit note modal state
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [bookingToCancelWithPolicy, setBookingToCancelWithPolicy] = useState<Booking | null>(null);
  const [creditNoteData, setCreditNoteData] = useState({
    validity: '',
    amount: '',
  });

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [urgentFilter, setUrgentFilter] = useState<'all' | 'urgent' | 'normal'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all_except_discarded'); // Default excludes discarded
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<number | null>(null); // Booking ID to discard
  const [delayedBookingsMap, setDelayedBookingsMap] = useState<Map<number, Array<{name: string, code: string, size?: string | null, booked_to: string, days_delayed: number}>>>(new Map());
  const [urgentBookingsMap, setUrgentBookingsMap] = useState<Record<number, { is_urgent: boolean; reasons: string[]; conflicts: any[] }>>({});

  // Urgent details modal
  const [urgentModalBookingId, setUrgentModalBookingId] = useState<number | null>(null);

  useEffect(() => {
    fetchBookings();
    fetchDelayedBookings();
  }, []);


  async function fetchBookings() {
    try {
      const response = await bookingsApi.getAll();
      setBookings(response.data);

      // Fetch urgency status for all active bookings from the backend
      const activeBookingIds = response.data
        .filter((b: any) => !['cancelled', 'completed', 'discarded'].includes(b.status))
        .map((b: any) => b.id);
      if (activeBookingIds.length > 0) {
        try {
          const urgentResponse = await availabilityApi.getUrgentBulk(activeBookingIds);
          setUrgentBookingsMap(urgentResponse.data);
        } catch (err) {
          console.error('Error fetching urgent status:', err);
          setUrgentBookingsMap({});
        }
      } else {
        setUrgentBookingsMap({});
      }
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDelayedBookings() {
    try {
      const response = await bookingsApi.getDelayed();
      const map = new Map<number, Array<{name: string, code: string, size?: string | null, booked_to: string, days_delayed: number}>>();
      for (const row of response.data) {
        map.set(row.booking_id, row.delayed_products);
      }
      setDelayedBookingsMap(map);
    } catch (error) {
      console.error('Error fetching delayed bookings:', error);
      setDelayedBookingsMap(new Map());
    }
  }

  async function handleCancelClick(id: number, customerName: string) {
    try {
      // Fetch the booking details
      const response = await bookingsApi.getById(id);
      const booking = response.data;

      // Use new cancellation modal with policy
      setBookingToCancelWithPolicy(booking);
      setShowCancellationModal(true);
    } catch (error) {
      console.error('Error fetching booking:', error);
      addAlert('Failed to load booking details');
    }
  }

  function handleCancellationComplete() {
    setShowCancellationModal(false);
    setBookingToCancelWithPolicy(null);
    fetchBookings(); // Refresh the bookings list
  }

  async function handleDiscardBooking(bookingId: number) {
    try {
      await bookingDiscardApi.discard(bookingId, currentUser.name);
      toast.success('Booking discarded successfully');
      setShowDiscardConfirm(null);
      await fetchBookings();
    } catch (error: any) {
      console.error('Error discarding booking:', error);
      addAlert(error.response?.data?.error || 'Failed to discard booking');
    }
  }

  async function handleConfirmCancel() {
    if (!bookingToCancel) return;

    try {
      // Cancel the booking
      await bookingsApi.update(bookingToCancel.id, {
        ...bookingToCancel,
        status: 'cancelled'
      });

      // Create credit note if validity and amount are provided
      if (creditNoteData.validity && creditNoteData.amount) {
        const amount = parseFloat(creditNoteData.amount);
        if (amount > 0) {
          try {
            const issuedBy = currentUser.name;
            await creditNotesApi.create({
              booking_id: bookingToCancel.id,
              customer_name: bookingToCancel.user.name,
              customer_phone: bookingToCancel.user.phone,
              amount: amount,
              valid_until: creditNoteData.validity,
              issued_by: issuedBy,
              notes: `Credit note issued for cancelled booking #${bookingToCancel.id}`,
            });
            toast.success('Booking cancelled and credit note issued successfully');
          } catch (error: any) {
            console.error('Error creating credit note:', error);
            const errorMessage = error.response?.data?.details || error.response?.data?.message || error.response?.data?.error || 'Failed to create credit note';
            addAlert(errorMessage);
            // Still show success for cancellation even if credit note creation fails
            toast.success('Booking cancelled successfully');
          }
        } else {
          toast.success('Booking cancelled successfully');
        }
      } else {
        toast.success('Booking cancelled successfully');
      }

      // Reset and refresh
      setShowCreditNoteModal(false);
      setBookingToCancel(null);
      setCreditNoteData({ validity: '', amount: '' });
      await fetchBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      addAlert('Failed to cancel booking. Please try again.');
    }
  }




  const filteredBookings = bookings.filter((b) => {
    // Search filter — use nested user object
    const searchDigits = searchTerm.replace(/\D/g, '');
    const searchLower = searchTerm.toLowerCase().trim();

    // Check if any product code matches the search term
    const products = Array.isArray(b.products) ? b.products : [];
    const productCodeMatch = searchLower.length > 0 && products.some((p: any) =>
      p.code && p.code.toLowerCase().includes(searchLower)
    );

    const matchesSearch = searchTerm.trim() === '' ||
      b.user.name.toLowerCase().includes(searchLower) ||
      (searchDigits.length > 0 && b.user.phone.includes(searchDigits)) ||
      productCodeMatch;

    // Status filter
    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'all_except_discarded'
        ? b.status !== 'discarded'
        : b.status === statusFilter;

    // Urgent filter
    const isUrgent = isBookingUrgent(b.id, urgentBookingsMap);
    const matchesUrgentFilter = urgentFilter === 'all' ||
      (urgentFilter === 'urgent' && isUrgent) ||
      (urgentFilter === 'normal' && !isUrgent);

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

    return matchesSearch && matchesStatus && matchesUrgentFilter && matchesDateRange;
  }).sort((a, b) => {
    // Sort delayed bookings to the top (highest priority)
    const aDelayed = delayedBookingsMap.has(a.id);
    const bDelayed = delayedBookingsMap.has(b.id);

    if (aDelayed && !bDelayed) return -1; // a comes first
    if (!aDelayed && bDelayed) return 1;  // b comes first

    // If both delayed or both not delayed, sort by booking_date (newest first)
    const dateA = new Date(a.booking_date).getTime();
    const dateB = new Date(b.booking_date).getTime();
    return dateB - dateA;
  });

  if (loading) {
    return <div className="text-center py-12">Loading bookings...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Bookings</h1>

      {/* Inline alert banner for page-level errors */}
      <AlertBanner alerts={alerts} onDismiss={removeAlert} />

      {/* Delayed Bookings Alert */}
      {(() => {
        const delayedCount = filteredBookings.filter(b => delayedBookingsMap.has(b.id)).length;
        if (delayedCount > 0) {
          return (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-r-lg px-4 py-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-red-600 text-lg flex-shrink-0">🚨</span>
                  <span className="text-sm font-bold text-red-900 flex-shrink-0">
                    URGENT: {delayedCount} Delayed Booking{delayedCount > 1 ? 's' : ''}
                  </span>
                  <span className="text-xs text-red-700 truncate">
                    Product(s) not returned on scheduled date. Follow-up required immediately!
                  </span>
                </div>
                <span className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg flex-shrink-0">
                  {delayedCount}
                </span>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Search and Date Filter */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex items-center space-x-4">
          <Input
            placeholder="Search by customer name, mobile, or product code..."
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
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Booking Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            >
              <option value="all_except_discarded">All Status</option>
              <option value="all">All (incl. Discarded)</option>
              <option value="pending">⏳ Pending</option>
              <option value="confirmed">✅ Confirmed</option>
              <option value="in_progress">🔄 In Progress</option>
              <option value="completed">✔️ Completed</option>
              <option value="cancelled">❌ Cancelled</option>
              <option value="discarded">🗑️ Discarded</option>
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Priority:</label>
            <select
              value={urgentFilter}
              onChange={(e) => setUrgentFilter(e.target.value as 'all' | 'urgent' | 'normal')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            >
              <option value="all">All Bookings</option>
              <option value="urgent">🚨 Urgent Only</option>
              <option value="normal">Normal Only</option>
            </select>
          </div>
          {(filterDateFrom || filterDateTo || statusFilter !== 'all_except_discarded' || urgentFilter !== 'all') && (
            <button
              onClick={() => {
                setFilterDateFrom('');
                setFilterDateTo('');
                setStatusFilter('all_except_discarded');
                setUrgentFilter('all');
              }}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-800 font-medium whitespace-nowrap"
            >
              Clear Filters
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
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                ID
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                Items
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                Booking Date
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Booked For
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                Status
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBookings.map((booking) => {
              const allProducts = Array.isArray(booking.products) ? booking.products : [];
              const activeProducts = allProducts.filter((p: any) => p.status !== 'cancelled' && p.status !== 'exchanged' && p.status !== 'discarded');
              const productCount = activeProducts.length;
              const isUrgent = isBookingUrgent(booking.id, urgentBookingsMap);
              const urgentReason = isUrgent ? getUrgentReason(booking.id, urgentBookingsMap) : '';
              const isDelayed = delayedBookingsMap.has(booking.id);
              const delayedProducts = isDelayed ? delayedBookingsMap.get(booking.id)! : [];

              return (
                <tr key={booking.id} className={`hover:bg-gray-50 relative ${isDelayed ? 'bg-red-50 border-l-4 border-red-500' : ''}`}>
                  <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-600">#{booking.id}</span>
                      {isDelayed && (
                        <span className="px-2 py-1 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
                          DELAYED
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-1 max-w-[200px]">
                      <span className="truncate">{booking.user.name}</span>
                      {isDelayed && (
                        <button
                          onClick={() => {
                            const delayInfo = delayedProducts.map(p =>
                              `${p.name} (${p.code}${p.size ? ` · ${p.size}` : ''}): ${p.days_delayed} day${p.days_delayed > 1 ? 's' : ''} overdue`
                            ).join('\n');
                            toast.error(`⚠️ DELAYED PRODUCTS:\n\n${delayInfo}\n\nExpected return: ${new Date(delayedProducts[0].booked_to).toLocaleDateString('en-GB')}\n\n⚠️ FOLLOW UP REQUIRED - Product(s) not returned!`, 10000);
                          }}
                          className="flex-shrink-0 px-1.5 py-0.5 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700 transition-colors animate-pulse"
                          title="Click for details"
                        >
                          🚨
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                    {productCount} {productCount === 1 ? 'item' : 'items'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(booking.booking_date).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-500">
                    {new Date(booking.booked_from).toLocaleDateString('en-GB')} - {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${booking.status === 'confirmed'
                        ? 'bg-green-100 text-green-800'
                        : booking.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : booking.status === 'completed'
                            ? 'bg-blue-100 text-blue-800'
                            : booking.status === 'discarded'
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-yellow-100 text-yellow-800'
                        }`}
                    >
                      {booking.status === 'discarded' ? '🗑️ discarded' : booking.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm font-medium">
                    <div className="flex items-center gap-2">
                      {/* View Order Button */}
                      <button
                        onClick={() => window.location.href = `/bookings/${booking.id}`}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors whitespace-nowrap"
                        title="View Order Details"
                      >
                        📋 View
                      </button>

                      {/* Quick View Icon Button */}
                      <button
                        onClick={() => setViewingBooking(booking)}
                        className="relative text-gray-600 hover:text-blue-600 transition-colors p-1.5 rounded hover:bg-blue-50"
                        title="Quick View"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-4 h-4"
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
                      </button>



                      {/* Discard Icon Button — admin only */}
                      <RequireRole roles={['admin']}>
                        {!['cancelled', 'completed', 'discarded'].includes(booking.status) && (
                          <button
                            onClick={() => setShowDiscardConfirm(booking.id)}
                            className="text-gray-600 hover:text-gray-900 transition-colors p-1.5 rounded hover:bg-gray-100"
                            title="Discard Booking"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </RequireRole>

                      {/* Urgent Badge — clickable, opens conflict details modal */}
                      {isUrgent && (
                        <button
                          onClick={() => setUrgentModalBookingId(booking.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded uppercase cursor-pointer transition-colors"
                          title={urgentReason}
                        >
                          URGENT
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

      {/* View Booking Modal */}
      {
        viewingBooking && (() => {
          return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
              <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slideIn">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 pb-4 border-b-2 border-gray-200">
                  <h2 className="text-2xl font-bold text-gray-800">
                    📋 Booking Details
                  </h2>
                  <button
                    onClick={() => setViewingBooking(null)}
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
                        <p className="text-base font-semibold text-gray-900">{viewingBooking.user.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Phone</p>
                        <p className="text-base font-semibold text-gray-900">{viewingBooking.user.phone || 'N/A'}</p>
                      </div>
                      {viewingBooking.user.alternate_phone && (
                        <div className="col-span-2">
                          <p className="text-sm text-gray-600">Alternate Phone</p>
                          <p className="text-base font-semibold text-gray-900">{viewingBooking.user.alternate_phone}</p>
                        </div>
                      )}
                      <div className="col-span-2">
                        <p className="text-sm text-gray-600">Address</p>
                        <p className="text-base font-semibold text-gray-900">{viewingBooking.user.address || 'N/A'}</p>
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
                          className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${viewingBooking.status === 'confirmed'
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
                          {Math.ceil((new Date(viewingBooking.booked_to).getTime() - new Date(viewingBooking.booked_from).getTime()) / (1000 * 60 * 60 * 24)) + 1} days
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
                      Booked Products ({Array.isArray(viewingBooking.products) ? viewingBooking.products.filter((p: any) => p.status !== 'cancelled' && p.status !== 'exchanged' && p.status !== 'discarded').length : 0})
                    </h3>
                    {Array.isArray(viewingBooking.products) && viewingBooking.products.length > 0 ? (
                      <div className="space-y-3">
                        {viewingBooking.products.map((product: any, index: number) => {
                          const hasImage = product.image && product.image !== null && product.image !== '';
                          const imageUrl = hasImage ? getImageUrl(product.image) : null;
                          const isCancelled = product.status === 'cancelled';
                          const isExchanged = product.status === 'exchanged';

                          const bookedFrom = product.booked_from || viewingBooking.booked_from;
                          const bookedTo = product.booked_to || viewingBooking.booked_to;
                          const uniqueKey = `${product.id}_${bookedFrom}_${bookedTo}_${index}`;

                          return (
                            <div key={uniqueKey} className={`bg-white rounded-lg p-4 shadow-sm border ${isCancelled ? 'opacity-60 border-red-300 bg-red-50' :
                              isExchanged ? 'opacity-60 border-orange-300 bg-orange-50' :
                                'border-purple-200'
                              }`}>
                              <div className="flex justify-between items-start gap-4">
                                {/* Product Image */}
                                {imageUrl && (
                                  <div className="flex-shrink-0">
                                    <img
                                      src={imageUrl}
                                      alt={product.name || 'Product'}
                                      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-900 text-lg">{product.name}</p>
                                    {isCancelled && (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-xs font-semibold">❌ Cancelled</span>
                                    )}
                                    {isExchanged && (
                                      <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs font-semibold">🔄 Exchanged</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600 mt-1">Code: <span className="font-mono font-semibold">{product.code || 'N/A'}</span>{product.size && <span className="ml-2">· Size: <span className="font-semibold">{product.size}</span></span>}</p>

                                  {product.rent && (
                                    <p className="text-sm text-gray-600">Rate: <span className="font-semibold text-green-600">₹{Math.floor(product.rent)}/day</span></p>
                                  )}
                                  <div className="mt-2 pt-2 border-t border-gray-200">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <p className="text-xs text-gray-500">Pickup Date</p>
                                        <p className="text-sm font-semibold text-blue-600">
                                          📅 {bookedFrom ? new Date(bookedFrom).toLocaleDateString('en-GB') : 'N/A'}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-gray-500">Drop Date</p>
                                        <p className="text-sm font-semibold text-red-600">
                                          📅 {bookedTo ? new Date(bookedTo).toLocaleDateString('en-GB') : 'N/A'}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No products in this booking</p>
                    )}
                  </div>

                  {/* Transportation indicator */}
                  {((viewingBooking as any).transport_charge || 0) > 0 && (
                    <div className="bg-teal-50 rounded-lg p-3 border-l-4 border-teal-500">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-teal-600">🚚</span>
                          <p className="text-sm font-medium text-teal-800">Local Transportation Opted</p>
                        </div>
                        <p className="text-lg font-bold text-teal-700">
                          ₹{Math.floor((viewingBooking as any).transport_charge || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                      {/* Per-product transport details */}
                      {Array.isArray(viewingBooking.products) && viewingBooking.products.some((p: any) => p.transport_details) && (
                        <div className="mt-2 space-y-1">
                          {viewingBooking.products.filter((p: any) => p.transport_details).map((p: any, idx: number) => (
                            <div key={idx} className="text-xs text-teal-700 flex items-start gap-1">
                              <span>📦</span>
                              <span>
                                {p.name}
                                {p.transport_details.destination && <span> → {p.transport_details.destination}</span>}
                                {p.transport_details.transporter_name && <span> via {p.transport_details.transporter_name}</span>}
                                {p.transport_details.bus_no && <span> (Bus: {p.transport_details.bus_no})</span>}
                                {p.transport_details.destination_phone && <span> 📞 {p.transport_details.destination_phone}</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}


                </div>

                {/* Close Button */}

                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => setViewingBooking(null)}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      }



      {/* Credit Note Modal — admin only */}
      <RequireRole roles={['admin']}>
      {
        showCreditNoteModal && bookingToCancel && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex items-start gap-4 mb-6">
                <div className="bg-red-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Cancel Booking</h2>
                  <p className="text-gray-600">
                    Are you sure you want to cancel the booking with name <span className="font-semibold text-red-600">&quot;{bookingToCancel.user.name}&quot;</span>. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  Provide the Validity and Amount for the Credit Note:
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Validity*
                    </label>
                    <input
                      type="date"
                      value={creditNoteData.validity}
                      onChange={(e) => setCreditNoteData({ ...creditNoteData, validity: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Enter"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount*
                    </label>
                    <input
                      type="number"
                      value={creditNoteData.amount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (isIntegerInput(val)) {
                          setCreditNoteData({ ...creditNoteData, amount: val });
                        }
                      }}
                      onKeyDown={integerKeyDown(
                        () => creditNoteData.amount,
                        (v) => setCreditNoteData({ ...creditNoteData, amount: v })
                      )}
                      min="0"
                      step="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="Enter"
                    />
                  </div>
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  * Leave empty if you don&apos;t want to issue a credit note
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCreditNoteModal(false);
                    setBookingToCancel(null);
                    setCreditNoteData({ validity: '', amount: '' });
                  }}
                  className="flex-1 px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                >
                  Don&apos;t Cancel
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      }
      </RequireRole>

      {/* New Cancellation Modal with Policy */}
      {
        showCancellationModal && bookingToCancelWithPolicy && (
          <BookingCancellation
            bookingId={bookingToCancelWithPolicy.id}
            bookingStatus={bookingToCancelWithPolicy.status}
            onCancellationComplete={handleCancellationComplete}
            userRole={currentUser.role}
            userName={currentUser.name}
            canCancel={true}
            autoOpen={true}
          />
        )
      }

      {/* Discard Booking Confirmation Modal — admin only */}
      <RequireRole roles={['admin']}>
        {showDiscardConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <div className="flex items-start gap-4 mb-6">
                <div className="bg-gray-100 rounded-full p-3">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Discard Booking</h2>
                  <p className="text-gray-600">
                    Are you sure you want to discard booking <span className="font-semibold text-gray-900">#{showDiscardConfirm}</span>? This will release all dates for the products involved. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDiscardConfirm(null)}
                  className="flex-1 px-4 py-2 border-2 border-gray-400 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Go Back
                </button>
                <button
                  onClick={() => handleDiscardBooking(showDiscardConfirm)}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                >
                  🗑️ Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </RequireRole>

      {/* Urgent Details Modal */}
      {urgentModalBookingId && urgentBookingsMap[urgentModalBookingId]?.conflicts && (
        <UrgentDetailsModal
          bookingId={urgentModalBookingId}
          conflicts={urgentBookingsMap[urgentModalBookingId].conflicts}
          onClose={() => setUrgentModalBookingId(null)}
        />
      )}

    </div >
  );
}
