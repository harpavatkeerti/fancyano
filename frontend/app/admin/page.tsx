'use client';

import { useEffect, useState } from 'react';
import { bookingsApi, productsApi } from '@/lib/api';

interface BookingStats {
  day: string;
  count: number;
}

interface CategoryData {
  name: string;
  count: number;
  color: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    urgentCases: 0,
    urgentPercentChange: 0,
    returnRate: 0,
    returnPercentChange: 0,
    openUrgentCases: 0,
    totalProducts: 0,
    totalBookings: 0,
  });
  const [weeklyBookings, setWeeklyBookings] = useState<BookingStats[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('Past 7 days');
  const [genderFilter, setGenderFilter] = useState<'Male' | 'Female' | 'All'>('Male');

  const categoryColors: { [key: string]: string } = {
    'Groom Sherwani': '#4A90E2',
    'Sherwani': '#E94B4B',
    'Formals': '#8BC88B',
    'Western': '#F5A623',
    'Kurta': '#9B59B6',
    'Indo Western': '#E74C3C',
    'Jodhpuri': '#3498DB',
    'Other': '#95A5A6',
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      const [productsRes, bookingsRes] = await Promise.all([
        productsApi.getAll(),
        bookingsApi.getAll(),
      ]);

      const products = productsRes.data;
      const bookings = bookingsRes.data;

      // Calculate weekly booking trends (last 7 days)
      const today = new Date();
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date(today);
        date.setDate(date.getDate() - (6 - i));
        return date;
      });

      const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const weeklyData: BookingStats[] = last7Days.map((date, index) => {
        const dayBookings = bookings.filter((b: any) => {
          const bookingDate = new Date(b.booking_date || b.created_at);
          return bookingDate.toDateString() === date.toDateString();
        });
        
        return {
          day: daysOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1], // Adjust Sunday
          count: dayBookings.length,
        };
      });

      setWeeklyBookings(weeklyData);

      // Calculate urgent cases (bookings with tight schedules)
      const urgentBookings = bookings.filter((b: any) => {
        if (b.status === 'completed' || b.status === 'cancelled') return false;
        
        const products = Array.isArray(b.products) ? b.products : [];
        for (const product of products) {
          const pickupDate = new Date(product.booked_from || b.booked_from);
          const daysUntilPickup = Math.ceil((pickupDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntilPickup <= 2 && daysUntilPickup >= 0) return true;
        }
        return false;
      });

      // Calculate category breakdown
      const categoryCount: { [key: string]: number } = {};
      products.forEach((p: any) => {
        const cat = p.name || p.category || 'Other';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      });

      const categoryDataArray: CategoryData[] = Object.entries(categoryCount)
        .map(([name, count]) => ({
          name,
          count: count as number,
          color: categoryColors[name] || categoryColors['Other'],
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5 categories

      setCategoryData(categoryDataArray);

      // Calculate return rate (products returned vs total rented)
      const completedBookings = bookings.filter((b: any) => b.status === 'completed');
      const returnRate = bookings.length > 0 
        ? Math.round((completedBookings.length / bookings.length) * 100)
        : 0;

      setStats({
        urgentCases: urgentBookings.length,
        urgentPercentChange: 20,
        returnRate,
        returnPercentChange: 20,
        openUrgentCases: urgentBookings.length,
        totalProducts: products.length,
        totalBookings: bookings.length,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  function getMaxBookingCount() {
    return Math.max(...weeklyBookings.map(d => d.count), 1);
  }

  function calculateGaugeRotation(value: number, max: number = 100): number {
    // Gauge ranges from -90deg (0%) to 90deg (100%)
    return ((value / max) * 180) - 90;
  }

  function getGaugeColor(value: number): string {
    if (value < 30) return '#8BC88B'; // Green
    if (value < 60) return '#F5A623'; // Yellow
    return '#E94B4B'; // Red
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  const maxCount = getMaxBookingCount();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">Dashboard:</h1>
          </div>
          <p className="text-gray-600">Hello, Admin</p>
        </div>

        {/* Bookings Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">No. of Bookings</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-0.5 bg-red-500"></div>
                <span className="text-sm text-gray-600">No. of Orders</span>
              </div>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option>Past 7 days</option>
                <option>Past 30 days</option>
                <option>Past 90 days</option>
              </select>
            </div>
          </div>

          {/* Line Chart */}
          <div className="relative h-64">
            <svg className="w-full h-full" viewBox="0 0 700 200">
              {/* Y-axis labels */}
              {[0, 1000, 2000, 3000, 4000, 5000].map((value, index) => (
                <text
                  key={value}
                  x="30"
                  y={180 - (index * 36)}
                  className="text-xs fill-gray-500"
                  textAnchor="end"
                >
                  {value}
                </text>
              ))}

              {/* Grid lines */}
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <line
                  key={index}
                  x1="50"
                  y1={180 - (index * 36)}
                  x2="680"
                  y2={180 - (index * 36)}
                  stroke="#E5E7EB"
                  strokeWidth="1"
                />
              ))}

              {/* Line chart path */}
              <polyline
                points={weeklyBookings.map((d, i) => {
                  const x = 50 + (i * 90);
                  const y = 180 - ((d.count / maxCount) * 160);
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke="#E94B4B"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points */}
              {weeklyBookings.map((d, i) => {
                const x = 50 + (i * 90);
                const y = 180 - ((d.count / maxCount) * 160);
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#E94B4B"
                  />
                );
              })}

              {/* X-axis labels */}
              {weeklyBookings.map((d, i) => (
                <text
                  key={i}
                  x={50 + (i * 90)}
                  y="195"
                  className="text-xs fill-gray-600"
                  textAnchor="middle"
                >
                  {d.day}
                </text>
              ))}
            </svg>
          </div>
        </div>

        {/* Stats Cards Row */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Urgent Cases Gauge */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Urgent Cases</h3>
              <div className="flex items-center gap-1 text-green-600 text-sm">
                <span>{stats.urgentPercentChange}% from Oct'25</span>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            {/* Gauge Chart */}
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative w-48 h-24">
                {/* Gauge background */}
                <svg className="w-full h-full" viewBox="0 0 200 100">
                  {/* Background arc */}
                  <path
                    d="M 20 80 A 80 80 0 0 1 180 80"
                    fill="none"
                    stroke="#E5E7EB"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Green section */}
                  <path
                    d="M 20 80 A 80 80 0 0 1 73 35"
                    fill="none"
                    stroke="#8BC88B"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Yellow section */}
                  <path
                    d="M 73 35 A 80 80 0 0 1 127 35"
                    fill="none"
                    stroke="#F5A623"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Red section */}
                  <path
                    d="M 127 35 A 80 80 0 0 1 180 80"
                    fill="none"
                    stroke="#E94B4B"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Needle */}
                  <g transform={`rotate(${calculateGaugeRotation(stats.urgentCases, 100)} 100 80)`}>
                    <line
                      x1="100"
                      y1="80"
                      x2="100"
                      y2="20"
                      stroke="#1F2937"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="80" r="8" fill="#1F2937" />
                  </g>
                </svg>
              </div>
              <div className="text-center mt-4">
                <p className="text-3xl font-bold text-gray-900">{stats.openUrgentCases}</p>
                <p className="text-sm text-gray-600 mt-1">Open Urgent Cases</p>
              </div>
            </div>
          </div>

          {/* Return Rate Gauge */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Return Rate</h3>
              <div className="flex items-center gap-1 text-green-600 text-sm">
                <span>{stats.returnPercentChange}% from Oct'25</span>
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            </div>

            {/* Gauge Chart */}
            <div className="flex flex-col items-center justify-center py-8">
              <div className="relative w-48 h-24">
                <svg className="w-full h-full" viewBox="0 0 200 100">
                  {/* Background arc */}
                  <path
                    d="M 20 80 A 80 80 0 0 1 180 80"
                    fill="none"
                    stroke="#E5E7EB"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Green section */}
                  <path
                    d="M 20 80 A 80 80 0 0 1 73 35"
                    fill="none"
                    stroke="#8BC88B"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Yellow section */}
                  <path
                    d="M 73 35 A 80 80 0 0 1 127 35"
                    fill="none"
                    stroke="#F5A623"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Red section */}
                  <path
                    d="M 127 35 A 80 80 0 0 1 180 80"
                    fill="none"
                    stroke="#E94B4B"
                    strokeWidth="20"
                    strokeLinecap="round"
                  />
                  
                  {/* Needle */}
                  <g transform={`rotate(${calculateGaugeRotation(stats.returnRate)} 100 80)`}>
                    <line
                      x1="100"
                      y1="80"
                      x2="100"
                      y2="20"
                      stroke="#1F2937"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="80" r="8" fill="#1F2937" />
                  </g>
                </svg>
              </div>
              <div className="text-center mt-4">
                <p className="text-3xl font-bold text-gray-900">{stats.returnRate}%</p>
                <p className="text-sm text-gray-600 mt-1">10 (Nov'25)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Category</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setGenderFilter('Male')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  genderFilter === 'Male'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Male
              </button>
              <button
                onClick={() => setGenderFilter('Female')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  genderFilter === 'Female'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Female
              </button>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option>Past 7 days</option>
                <option>Past 30 days</option>
                <option>Past 90 days</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-12">
            {/* Pie Chart */}
            <div className="relative w-64 h-64">
              <svg className="w-full h-full" viewBox="0 0 200 200">
                {(() => {
                  const total = categoryData.reduce((sum, cat) => sum + cat.count, 0);
                  let currentAngle = -90; // Start from top

                  return categoryData.map((cat, index) => {
                    const percentage = (cat.count / total) * 100;
                    const angle = (percentage / 100) * 360;
                    const startAngle = currentAngle;
                    const endAngle = currentAngle + angle;

                    const startRad = (startAngle * Math.PI) / 180;
                    const endRad = (endAngle * Math.PI) / 180;

                    const x1 = 100 + 80 * Math.cos(startRad);
                    const y1 = 100 + 80 * Math.sin(startRad);
                    const x2 = 100 + 80 * Math.cos(endRad);
                    const y2 = 100 + 80 * Math.sin(endRad);

                    const largeArcFlag = angle > 180 ? 1 : 0;

                    const pathData = [
                      `M 100 100`,
                      `L ${x1} ${y1}`,
                      `A 80 80 0 ${largeArcFlag} 1 ${x2} ${y2}`,
                      `Z`,
                    ].join(' ');

                    currentAngle = endAngle;

                    return (
                      <path
                        key={index}
                        d={pathData}
                        fill={cat.color}
                        stroke="white"
                        strokeWidth="2"
                      />
                    );
                  });
                })()}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-3">
              {categoryData.map((cat, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    ></div>
                    <span className="text-sm text-gray-700">{cat.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{cat.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          © 2025 FAN-C-YA-NO. All Rights Reserved.
        </div>
      </div>
    </div>
  );
}
