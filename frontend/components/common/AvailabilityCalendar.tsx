'use client';

import React, { useState } from 'react';

interface BookingDateRange {
  booked_from: string;
  booked_to: string;
  user: {
    name: string;
    phone: string;
  };
}

interface AvailabilityCalendarProps {
  bookings: BookingDateRange[];
  onClose: () => void;
  productName: string;
}

export default function AvailabilityCalendar({ bookings, onClose, productName }: AvailabilityCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Get first day of month and total days
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

  // Helper to check if a date is booked
  const isDateBooked = (day: number): BookingDateRange | null => {
    const checkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    
    for (const booking of bookings) {
      const fromDate = new Date(booking.booked_from);
      const toDate = new Date(booking.booked_to);
      
      // Set to start of day for comparison
      checkDate.setHours(0, 0, 0, 0);
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(0, 0, 0, 0);
      
      if (checkDate >= fromDate && checkDate <= toDate) {
        return booking;
      }
    }
    return null;
  };

  // Navigate months
  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="relative mb-6">
          <h2 className="text-lg font-bold text-gray-800 leading-tight text-center pr-8">
            Check Availability - {productName}
          </h2>
          <button
            onClick={onClose}
            className="absolute top-0 right-0 text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Month Navigation */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={previousMonth}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold"
          >
            ← Previous
          </button>
          <h3 className="text-xl font-semibold">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h3>
          <button
            onClick={nextMonth}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold"
          >
            Next →
          </button>
        </div>

        {/* Calendar Grid Container */}
        <div className="mb-6">
          <div className="grid grid-cols-7 gap-2">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="text-center font-bold text-gray-600 py-2">
                {day}
              </div>
            ))}

            {/* Empty cells for days before month starts */}
            {Array.from({ length: startingDayOfWeek }).map((_, index) => (
              <div key={`empty-${index}`} className="aspect-square" />
            ))}

            {/* Calendar days */}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const booking = isDateBooked(day);
              const isToday = 
                new Date().getDate() === day &&
                new Date().getMonth() === currentDate.getMonth() &&
                new Date().getFullYear() === currentDate.getFullYear();

              return (
                <div
                  key={day}
                  className={`
                    aspect-square flex items-center justify-center rounded-lg border-2 text-sm font-medium
                    ${booking
                      ? 'bg-red-500 text-white border-red-600 cursor-pointer hover:bg-red-600'
                      : 'bg-green-50 text-gray-800 border-green-200'
                    }
                    ${isToday ? 'ring-2 ring-blue-500' : ''}
                  `}
                  title={booking ? `Booked: ${booking.user.name} (${booking.user.phone})` : 'Available'}
                >
                  {day}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-6 justify-center items-center py-4 border-t border-b bg-gray-50 -mx-6 px-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-50 border-2 border-green-200 rounded"></div>
            <span className="text-sm text-gray-600">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-500 border-2 border-red-600 rounded"></div>
            <span className="text-sm text-gray-600">Booked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white border-2 border-blue-500 ring-2 ring-blue-500 rounded"></div>
            <span className="text-sm text-gray-600">Today</span>
          </div>
        </div>

        {/* Booking Details */}
        {bookings.length > 0 && (
          <div className="mt-6">
            <h4 className="font-semibold text-gray-800 mb-3">Current Bookings:</h4>
            <div className="space-y-2 h-32 overflow-y-auto">
              {bookings.map((booking, index) => (
                <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-800">{booking.user.name}</span>
                    <span className="text-gray-600">{booking.user.phone}</span>
                  </div>
                  <div className="text-red-600 mt-1">
                    {new Date(booking.booked_from).toLocaleDateString('en-GB')} → {new Date(booking.booked_to).toLocaleDateString('en-GB')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {bookings.length === 0 && (
          <div className="mt-6">
            <h4 className="font-semibold text-gray-800 mb-3">Current Bookings:</h4>
            <div className="h-32 flex items-center justify-center text-center text-gray-500">
              No bookings for this product. All dates are available! ✨
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

