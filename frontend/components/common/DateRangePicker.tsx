'use client';

import { useState, useEffect } from 'react';

interface BookingDateRange {
  booked_from: string;
  booked_to: string;
  customer_name?: string;
  customer_phone?: string;
}

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  label?: string;
  compact?: boolean;
  minDate?: string; // Minimum selectable date (defaults to today)
  bookings?: BookingDateRange[]; // Bookings to check availability
  productName?: string; // Product name for display
}

export default function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  label = 'Select Dates',
  compact = false,
  minDate,
  bookings = [],
  productName,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');

  // Reset selecting mode when dates change externally or when opening calendar
  useEffect(() => {
    if (!isOpen) {
      // When calendar is closed, reset selection mode based on current dates
      if (!startDate || startDate === '') {
        setSelecting('start');
      } else if (!endDate || endDate === '') {
        setSelecting('end');
      } else {
        // Both dates are set, next time calendar opens, start fresh
        setSelecting('start');
      }
    }
  }, [startDate, endDate, isOpen]);



  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return 'Select date';
    // Parse the date string as local date to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    // Format as DD/MM/YYYY for compact mode, or with day name for full mode
    if (compact) {
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
    
    return date.toLocaleDateString('en-GB', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const handleDateClick = (day: number) => {
    const { year, month } = getDaysInMonth(currentMonth);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    if (selecting === 'start') {
      // Setting start date - clear end date and switch to end selection
      onStartDateChange(dateStr);
      onEndDateChange(''); // Clear end date when changing start
      setSelecting('end');
    } else {
      // Setting end date
      // Check if clicked date is before start date - if so, treat it as new start date
      if (startDate && dateStr < startDate) {
        onStartDateChange(dateStr);
        onEndDateChange('');
        setSelecting('end');
      } else {
        onEndDateChange(dateStr);
        setIsOpen(false);
        setSelecting('start'); // Reset for next time
      }
    }
  };

  // Find the first booked date after the start date (in current viewing month)
  const getFirstBookedDayAfterStart = (): number | null => {
    if (!startDate || startDate === '' || selecting === 'start') return null;
    
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const { year, month, daysInMonth: totalDays } = getDaysInMonth(currentMonth);
    
    // If viewing month is before start month, no restriction
    if (year < startYear || (year === startYear && month < startMonth - 1)) {
      return null;
    }
    
    // Start checking from the day after start date (if in same month) or from day 1 (if later month)
    const checkFromDay = (year === startYear && month === startMonth - 1) ? startDay + 1 : 1;
    
    // Find first booked date
    for (let day = checkFromDay; day <= totalDays; day++) {
      const bookedInfo = isDateBooked(day);
      if (bookedInfo) {
        return day;
      }
    }
    return null;
  };

  const isDateInRange = (day: number) => {
    if (!startDate || !endDate || startDate === '' || endDate === '') return false;
    const { year, month } = getDaysInMonth(currentMonth);
    const currentDate = new Date(year, month, day);
    
    // Parse start and end dates as local dates
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay);
    
    return currentDate >= start && currentDate <= end;
  };

  const isDateSelected = (day: number) => {
    // Ensure dates are not empty strings
    if (!startDate || startDate === '' || (!endDate && !startDate)) return false;
    const { year, month } = getDaysInMonth(currentMonth);
    const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return (startDate && startDate !== '' && currentDateStr === startDate) || 
           (endDate && endDate !== '' && currentDateStr === endDate);
  };

  const isToday = (day: number) => {
    const { year, month } = getDaysInMonth(currentMonth);
    const currentDate = new Date(year, month, day);
    const today = new Date();
    return (
      currentDate.getDate() === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const isPastDate = (day: number) => {
    const { year, month } = getDaysInMonth(currentMonth);
    const currentDate = new Date(year, month, day);
    
    // Get minimum date (either provided or today)
    let minDateObj = new Date();
    if (minDate) {
      const [minYear, minMonth, minDay] = minDate.split('-').map(Number);
      minDateObj = new Date(minYear, minMonth - 1, minDay);
    }
    
    // Set time to start of day for accurate comparison
    minDateObj.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);
    
    return currentDate < minDateObj;
  };

  const isBeforeStartDate = (day: number) => {
    if (!startDate || selecting === 'start') return false;
    const { year, month } = getDaysInMonth(currentMonth);
    const currentDate = new Date(year, month, day);
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);
    return currentDate < start;
  };

  // Check if a date is booked
  const isDateBooked = (day: number): BookingDateRange | null => {
    if (!bookings || bookings.length === 0) return null;
    
    const { year, month } = getDaysInMonth(currentMonth);
    const checkDate = new Date(year, month, day);
    
    for (const booking of bookings) {
      if (!booking.booked_from || !booking.booked_to) continue;
      
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

  // Check if a date range is valid (no booked dates in between)
  const isRangeValid = (startDay: number, endDay: number): boolean => {
    const { year, month } = getDaysInMonth(currentMonth);
    
    for (let day = startDay; day <= endDay; day++) {
      if (isDateBooked(day)) {
        return false;
      }
    }
    return true;
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  const resetDates = () => {
    onStartDateChange('');
    onEndDateChange('');
    setSelecting('start');
  };

  const { daysInMonth, startingDayOfWeek, year, month } = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


  return (
    <div className="relative">
      {!compact && label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      )}
      
      {/* Date Display Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            // When opening, always start with selecting start date if both are already set
            // This allows changing the pickup date
            if (startDate && endDate) {
              setSelecting('start');
            }
          }
        }}
        className={`w-full border border-gray-300 rounded-lg bg-white text-left flex items-center justify-between hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          compact ? 'px-2 py-1.5 text-sm' : 'px-4 py-3'
        }`}
      >
        <div className={`flex items-center ${compact ? 'space-x-1' : 'space-x-2'}`}>
          {!compact && (
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          )}
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-gray-900`}>
            {startDate ? formatDisplayDate(startDate) : 'From'}
          </span>
          <span className="text-gray-400">→</span>
          <span className={`${compact ? 'text-xs' : 'text-sm'} text-gray-900`}>
            {endDate ? formatDisplayDate(endDate) : 'To'}
          </span>
        </div>
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Calendar Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          {/* Calendar Popup */}
          <div key={`${startDate}-${endDate}`} className="fixed z-50 bg-white rounded-lg shadow-2xl border border-gray-200 p-4" style={{ 
            width: '320px',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}>
          {/* Header with Reset and Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={resetDates}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Reset
            </button>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-medium min-w-[120px] text-center">{monthName}</span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Selection Mode Indicator */}
          <div className="mb-3 text-center">
            <p className="text-xs text-gray-600">
              {selecting === 'start' ? (
                <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded">
                  <span>📅</span> Select <strong>Pickup Date</strong>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded">
                  <span>📅</span> Select <strong>Return Date</strong>
                </span>
              )}
            </p>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day, idx) => (
              <div key={`weekday-${idx}`} className="text-center text-xs font-medium text-gray-500 py-2">
                {day.charAt(0)}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startingDayOfWeek }).map((_, index) => (
              <div key={`empty-${index}`} className="aspect-square" />
            ))}
            {days.map((day) => {
              const { year, month } = getDaysInMonth(currentMonth);
              const currentDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              
              const isStart = startDate && startDate !== '' && currentDateStr === startDate;
              const isEnd = endDate && endDate !== '' && currentDateStr === endDate;
              const selected = isStart || isEnd;
              
              const inRange = isDateInRange(day);
              const today = isToday(day);
              const past = isPastDate(day);
              const booked = isDateBooked(day);
              
              // Calculate disabled state
              let disabled = false;
              
              // Always disable past dates and booked dates
              if (past || booked) {
                disabled = true;
              }
              
              // When selecting END date (start is already selected)
              if (selecting === 'end' && startDate && startDate !== '') {
                const beforeStart = isBeforeStartDate(day);
                
                // Disable dates before start
                if (beforeStart) {
                  disabled = true;
                }
                
                // Disable dates on or after first booked date
                const firstBookedDay = getFirstBookedDayAfterStart();
                if (firstBookedDay !== null && day >= firstBookedDay) {
                  disabled = true;
                }
              }

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => !disabled && handleDateClick(day)}
                  disabled={disabled}
                  title={booked ? `Booked: ${booked.customer_name || 'Customer'}` : undefined}
                  className={`
                    aspect-square flex items-center justify-center text-sm rounded-full
                    transition-colors
                    ${disabled
                      ? booked
                        ? 'bg-red-500 text-white cursor-not-allowed border-2 border-red-600'
                        : 'text-gray-300 cursor-not-allowed'
                      : selected 
                        ? 'bg-blue-600 text-white font-semibold' 
                        : inRange 
                          ? 'bg-blue-100 text-blue-900'
                          : today
                            ? 'bg-green-100 text-green-700 font-medium border-2 border-green-500'
                            : 'text-gray-700 hover:bg-green-50 border border-green-200'
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Selection Hint */}
          <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-500 text-center">
            {selecting === 'start' ? '1️⃣ Select start date' : '2️⃣ Select end date'}
          </div>

          {/* Legend - only show if bookings are provided */}
          {bookings && bookings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 flex gap-4 justify-center text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-green-50 border border-green-200 rounded-full"></div>
                <span className="text-gray-600">Available</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-red-500 border-2 border-red-600 rounded-full"></div>
                <span className="text-gray-600">Booked</span>
              </div>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}

