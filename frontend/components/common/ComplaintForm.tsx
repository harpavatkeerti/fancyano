'use client';

import { useState, useEffect, useRef } from 'react';
import { complaintsApi, bookingsApi, CreateComplaintData } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from './AlertBanner';

interface ComplaintFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  userName: string;
  bookingId?: number;
}

export default function ComplaintForm({ onClose, onSuccess, userName, bookingId }: ComplaintFormProps) {
  const [formData, setFormData] = useState<CreateComplaintData>({
    raised_by: userName,
    title: '',
    description: '',
    booking_id: bookingId,
  });
  const [submitting, setSubmitting] = useState(false);
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();

  // Booking search state (only used when bookingId is not pre-provided)
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingSearch, setBookingSearch] = useState('');
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedBookingLabel, setSelectedBookingLabel] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookingId) {
      setLoadingBookings(true);
      setBookingError('');
      bookingsApi
        .getAll()
        .then((res) => {
          const data = Array.isArray(res.data) ? res.data : [];
          console.log('[ComplaintForm] Loaded bookings:', data.length);
          setBookings(data);
        })
        .catch((err) => {
          console.error('[ComplaintForm] Failed to load bookings:', err);
          setBookingError('Could not load bookings. Enter the Booking ID manually below.');
        })
        .finally(() => setLoadingBookings(false));
    }
  }, [bookingId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = bookingSearch.toLowerCase().trim();
  const filteredBookings = q
    ? bookings.filter(
        (b) =>
          String(b.id).includes(q) ||
          (b.customer_name || '').toLowerCase().includes(q) ||
          (b.customer_phone || '').toLowerCase().includes(q)
      )
    : bookings;

  const handleSelectBooking = (b: any) => {
    setFormData({ ...formData, booking_id: b.id });
    setSelectedBookingLabel(`#${b.id} · ${b.customer_name}${b.customer_phone ? ` · ${b.customer_phone}` : ''}`);
    setBookingSearch('');
    setShowDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.booking_id) {
      addAlert('Please select an associated booking');
      return;
    }

    if (!formData.title.trim()) {
      addAlert('Please enter a title');
      return;
    }

    try {
      setSubmitting(true);
      clearAlerts();
      await complaintsApi.create(formData);
      toast.success('Complaint submitted successfully');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error submitting complaint:', error);
      addAlert('Failed to submit complaint');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">Submit Complaint</h2>
          <button
            onClick={onClose}
            className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors"
          >
            ×
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Inline alert banner for validation / submission errors */}
          <AlertBanner alerts={alerts} onDismiss={removeAlert} />
          <div>
            <p className="text-sm font-medium text-gray-500">Raised by</p>
            <p className="text-sm text-gray-900 mt-0.5">{formData.raised_by}</p>
          </div>

          {/* Booking ID */}
          {bookingId ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Booking ID*
              </label>
              <input
                type="text"
                value={bookingId}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Associated Booking*
              </label>

              {/* Selected booking pill */}
              {formData.booking_id && (
                <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <span className="text-sm font-semibold text-red-700">{selectedBookingLabel}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, booking_id: undefined });
                      setSelectedBookingLabel('');
                    }}
                    className="ml-auto text-red-400 hover:text-red-600 text-lg leading-none"
                    title="Clear selection"
                  >
                    ×
                  </button>
                </div>
              )}

              {!formData.booking_id && (
                <div ref={dropdownRef} className="relative">
                  <input
                    type="text"
                    value={bookingSearch}
                    onChange={(e) => {
                      setBookingSearch(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder={
                      loadingBookings
                        ? 'Loading bookings…'
                        : 'Search by booking ID, customer name or phone…'
                    }
                    disabled={loadingBookings}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />

                  {showDropdown && !loadingBookings && (
                    <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {filteredBookings.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-400">
                          {bookingError || (q ? 'No bookings match your search.' : 'No bookings found.')}
                        </p>
                      ) : (
                        filteredBookings.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleSelectBooking(b)}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-red-50 transition-colors border-b border-gray-100 last:border-0"
                          >
                            <span className="font-semibold text-red-700 mr-2">#{b.id}</span>
                            <span className="text-gray-800">{b.customer_name}</span>
                            {b.customer_phone && (
                              <span className="text-gray-500 ml-2">{b.customer_phone}</span>
                            )}
                            {b.status && (
                              <span className="ml-2 text-xs text-gray-400 capitalize">[{b.status.replace('_', ' ')}]</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title*
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter complaint title"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe your complaint in detail..."
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-white border-2 border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'SUBMITTING...' : 'SUBMIT'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
