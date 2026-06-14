'use client';

import { useState } from 'react';
import { complaintsApi, CreateComplaintData } from '@/lib/api';
import { toast } from '@/lib/toast';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error('Please enter a title');
      return;
    }

    try {
      setSubmitting(true);
      await complaintsApi.create(formData);
      toast.success('Complaint submitted successfully');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error submitting complaint:', error);
      toast.error('Failed to submit complaint');
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
          <div>
            <p className="text-sm font-medium text-gray-500">Raised by</p>
            <p className="text-sm text-gray-900 mt-0.5">{formData.raised_by}</p>
          </div>

          {bookingId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Booking ID
              </label>
              <input
                type="text"
                value={bookingId}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
              />
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

