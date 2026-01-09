'use client';

import { useState, useEffect } from 'react';

export default function ReportsPage() {
  const [bookingsDateRange, setBookingsDateRange] = useState('Past 7 days');
  const [salesDateRange, setSalesDateRange] = useState('Past 7 days');
  const [categoryDateRange, setCategoryDateRange] = useState('Past 7 days');
  const [categoryGender, setCategoryGender] = useState<'Male' | 'Female'>('Male');

  // Placeholder data - replace with actual API calls
  const bookingsData = [1200, 1800, 2100, 4500, 2000, 3500, 3200];
  const ordersData = [1100, 1700, 2000, 4300, 1900, 3400, 3100];
  const salesData = [1200, 1800, 2100, 4500, 2000, 3500, 3200];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const categoryData = {
    Male: [
      { name: 'Groom Sherwani', value: 300, color: '#3B82F6' },
      { name: 'Sherwani', value: 150, color: '#10B981' },
      { name: 'Formals', value: 75, color: '#F59E0B' },
      { name: 'Western', value: 37, color: '#EC4899' },
      { name: 'Other', value: 18, color: '#8B5CF6' },
    ],
    Female: [
      { name: 'Lehenga', value: 250, color: '#3B82F6' },
      { name: 'Saree', value: 180, color: '#10B981' },
      { name: 'Gown', value: 90, color: '#F59E0B' },
      { name: 'Western', value: 45, color: '#EC4899' },
      { name: 'Other', value: 15, color: '#8B5CF6' },
    ],
  };

  const maxBookings = Math.max(...bookingsData, ...ordersData);
  const maxSales = Math.max(...salesData);
  const totalSales = salesData.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-black">Reports</h1>
        <button className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
          Export
        </button>
      </div>

      {/* No. of Bookings Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-black">No. of Bookings</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-red-500"></div>
              <span className="text-sm text-gray-600">No. of Orders</span>
            </div>
            <select
              value={bookingsDateRange}
              onChange={(e) => setBookingsDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-red-50 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option>Past 7 days</option>
              <option>Past 30 days</option>
              <option>Past 90 days</option>
            </select>
          </div>
        </div>
        
        {/* Line Chart */}
        <div className="relative h-64">
          <svg className="w-full h-full">
            {/* Y-axis labels */}
            {[0, 1000, 2000, 3000, 4000, 5000].map((value, i) => (
              <text
                key={i}
                x="30"
                y={250 - (i * 50)}
                className="text-xs fill-gray-500"
                textAnchor="end"
              >
                {value}
              </text>
            ))}
            
            {/* Grid lines */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line
                key={i}
                x1="50"
                y1={250 - (i * 50)}
                x2="95%"
                y2={250 - (i * 50)}
                stroke="#f3f4f6"
                strokeWidth="1"
              />
            ))}
            
            {/* Line path */}
            <polyline
              points={bookingsData
                .map((value, i) => {
                  const x = 50 + (i * (window.innerWidth * 0.12));
                  const y = 250 - (value / maxBookings) * 250;
                  return `${x},${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#ef4444"
              strokeWidth="3"
            />
            
            {/* X-axis labels */}
            {days.map((day, i) => (
              <text
                key={i}
                x={50 + (i * (window.innerWidth * 0.12))}
                y="265"
                className="text-xs fill-gray-600"
                textAnchor="middle"
              >
                {day}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Sales Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-black">Sales</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-gray-700">Total: ₹{totalSales.toLocaleString('en-IN')}</span>
            <select
              value={salesDateRange}
              onChange={(e) => setSalesDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-red-50 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option>Past 7 days</option>
              <option>Past 30 days</option>
              <option>Past 90 days</option>
            </select>
          </div>
        </div>
        
        {/* Line Chart */}
        <div className="relative h-64">
          <svg className="w-full h-full">
            {/* Y-axis labels */}
            {[0, 1000, 2000, 3000, 4000, 5000].map((value, i) => (
              <text
                key={i}
                x="30"
                y={250 - (i * 50)}
                className="text-xs fill-gray-500"
                textAnchor="end"
              >
                {value}
              </text>
            ))}
            
            {/* Grid lines */}
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <line
                key={i}
                x1="50"
                y1={250 - (i * 50)}
                x2="95%"
                y2={250 - (i * 50)}
                stroke="#f3f4f6"
                strokeWidth="1"
              />
            ))}
            
            {/* Line path */}
            <polyline
              points={salesData
                .map((value, i) => {
                  const x = 50 + (i * (window.innerWidth * 0.12));
                  const y = 250 - (value / maxSales) * 250;
                  return `${x},${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#ef4444"
              strokeWidth="3"
            />
            
            {/* X-axis labels */}
            {days.map((day, i) => (
              <text
                key={i}
                x={50 + (i * (window.innerWidth * 0.12))}
                y="265"
                className="text-xs fill-gray-600"
                textAnchor="middle"
              >
                {day}
              </text>
            ))}
          </svg>
        </div>
      </div>

      {/* Urgent Cases and Return Rate */}
      <div className="grid grid-cols-2 gap-6">
        {/* Urgent Cases */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-black">Urgent Cases</h2>
            <div className="flex items-center gap-1 text-sm text-green-600 font-semibold">
              <span>20% from Oct 25</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" transform="rotate(180 12 12)" />
              </svg>
            </div>
          </div>
          
          {/* Gauge Chart */}
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="16"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="url(#urgentGradient)"
                  strokeWidth="16"
                  strokeDasharray="502"
                  strokeDashoffset="402"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="urgentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">20%</div>
                </div>
              </div>
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-4">20 Open Urgent Cases</p>
          </div>
        </div>

        {/* Return Rate */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-black">Return Rate</h2>
            <div className="flex items-center gap-1 text-sm text-green-600 font-semibold">
              <span>20% from Oct 25</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" transform="rotate(180 12 12)" />
              </svg>
            </div>
          </div>
          
          {/* Gauge Chart */}
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="16"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="url(#returnGradient)"
                  strokeWidth="16"
                  strokeDasharray="502"
                  strokeDashoffset="402"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="returnGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">20%</div>
                </div>
              </div>
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-4">10 (Nov'25)</p>
          </div>
        </div>
      </div>

      {/* Category Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-black">Category</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setCategoryGender('Male')}
                className={`px-6 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  categoryGender === 'Male'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Male
              </button>
              <button
                onClick={() => setCategoryGender('Female')}
                className={`px-6 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  categoryGender === 'Female'
                    ? 'bg-red-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Female
              </button>
            </div>
            <select
              value={categoryDateRange}
              onChange={(e) => setCategoryDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-red-50 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option>Past 7 days</option>
              <option>Past 30 days</option>
              <option>Past 90 days</option>
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-8 items-center">
          {/* Pie Chart */}
          <div className="flex justify-center">
            <svg className="w-64 h-64" viewBox="0 0 200 200">
              {(() => {
                const data = categoryData[categoryGender];
                const total = data.reduce((sum, item) => sum + item.value, 0);
                let currentAngle = 0;
                
                return data.map((item, index) => {
                  const percentage = (item.value / total) * 100;
                  const angle = (percentage / 100) * 360;
                  const startAngle = currentAngle;
                  const endAngle = currentAngle + angle;
                  
                  const x1 = 100 + 80 * Math.cos((startAngle - 90) * Math.PI / 180);
                  const y1 = 100 + 80 * Math.sin((startAngle - 90) * Math.PI / 180);
                  const x2 = 100 + 80 * Math.cos((endAngle - 90) * Math.PI / 180);
                  const y2 = 100 + 80 * Math.sin((endAngle - 90) * Math.PI / 180);
                  
                  const largeArc = angle > 180 ? 1 : 0;
                  
                  const pathData = [
                    `M 100 100`,
                    `L ${x1} ${y1}`,
                    `A 80 80 0 ${largeArc} 1 ${x2} ${y2}`,
                    `Z`
                  ].join(' ');
                  
                  currentAngle = endAngle;
                  
                  return (
                    <path
                      key={index}
                      d={pathData}
                      fill={item.color}
                      stroke="white"
                      strokeWidth="2"
                    />
                  );
                });
              })()}
            </svg>
          </div>
          
          {/* Legend */}
          <div className="space-y-3">
            {categoryData[categoryGender].map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-sm text-gray-700">{item.name}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
