'use client';

import { useEffect, useState } from 'react';
import { bookingsApi } from '@/lib/api';
import { Booking } from '@/types';
import { Button, Input } from '@/components/common';

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    booked_from: '',
    booked_to: '',
    status: 'pending' as const,
  });

  useEffect(() => {
    fetchBookings();
  }, []);

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
      await bookingsApi.update(selectedBooking.id, formData);
      await fetchBookings();
      setShowModifyModal(false);
      setSelectedBooking(null);
    } catch (error) {
      console.error('Error updating booking:', error);
      alert('Error updating booking');
    }
  }

  async function handleCancel(id: number, customerName: string) {
    if (!confirm(`Are you sure you want to cancel the booking with "${customerName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await bookingsApi.update(id, { status: 'cancelled' });
      await fetchBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Error cancelling booking');
    }
  }

  const filteredBookings = bookings.filter(
    (b) =>
      b.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.customer_phone && b.customer_phone.includes(searchTerm))
  );

  if (loading) {
    return <div className="text-center py-12">Loading bookings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Bookings</h1>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-lg shadow flex items-center space-x-4">
        <Input
          placeholder="Search by customer name or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <span className="text-sm text-gray-600">Total Orders: {bookings.length}</span>
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
                    {new Date(booking.booking_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(booking.booked_from).toLocaleDateString()} -{' '}
                    {new Date(booking.booked_to).toLocaleDateString()}
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleModify(booking)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Modify
                    </button>
                    {booking.status !== 'cancelled' && (
                      <button
                        onClick={() => handleCancel(booking.id, booking.customer_name)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Cancel
                      </button>
                    )}
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

              <h3 className="text-lg font-semibold mt-6">Add Contact Details</h3>
              <Input
                label="Name*"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                required
              />
              <Input
                label="Phone Number*"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
              />
              <Input
                label="Alternate Phone Number"
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
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
    </div>
  );
}

