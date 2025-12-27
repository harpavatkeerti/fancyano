'use client';

import { useEffect, useState } from 'react';
import { bookingsApi, productsApi } from '@/lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    urgentCases: 0,
    returnRate: 0,
    openUrgentCases: 0,
    totalProducts: 0,
    totalBookings: 0,
  });
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const [productsRes, bookingsRes] = await Promise.all([
          productsApi.getAll(),
          bookingsApi.getAll(),
        ]);

        const products = productsRes.data;
        const bookings = bookingsRes.data;

        // Calculate urgent cases (bookings due soon or overdue)
        const today = new Date();
        const urgentBookings = bookings.filter((b: any) => {
          const returnDate = new Date(b.booked_to);
          const daysUntilReturn = Math.ceil((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return daysUntilReturn <= 2 && b.status !== 'completed' && b.status !== 'cancelled';
        });

        // Calculate category breakdown
        const categoryCount: { [key: string]: number } = {};
        products.forEach((p: any) => {
          const cat = p.category || 'Other';
          categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });

        setCategoryData(Object.entries(categoryCount).map(([name, count]) => ({ name, count })));

        setStats({
          urgentCases: urgentBookings.length,
          returnRate: 20, // Placeholder
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

    fetchDashboardData();
  }, []);

  if (loading) {
    return <div className="text-center py-12">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Urgent Cases</p>
              <p className="text-2xl font-bold text-gray-800 mt-2">{stats.urgentCases}</p>
              <p className="text-xs text-gray-500 mt-1">20% from Oct'25</p>
            </div>
            <div className="text-4xl">⚠️</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Return Rate</p>
              <p className="text-2xl font-bold text-gray-800 mt-2">{stats.returnRate}%</p>
              <p className="text-xs text-gray-500 mt-1">20% from Oct'25</p>
            </div>
            <div className="text-4xl">📊</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Open Urgent Cases</p>
              <p className="text-2xl font-bold text-gray-800 mt-2">{stats.openUrgentCases}</p>
              <p className="text-xs text-gray-500 mt-1">10 (Nov'25)</p>
            </div>
            <div className="text-4xl">🔴</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Products</p>
              <p className="text-2xl font-bold text-gray-800 mt-2">{stats.totalProducts}</p>
              <p className="text-xs text-gray-500 mt-1">Active inventory</p>
            </div>
            <div className="text-4xl">📦</div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-4">Category Breakdown</h2>
        <div className="space-y-3">
          {categoryData.length > 0 ? (
            categoryData.map((cat) => (
              <div key={cat.name} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="font-medium text-gray-700">{cat.name}</span>
                <span className="text-gray-600">{cat.count} products</span>
              </div>
            ))
          ) : (
            <p className="text-gray-500">No categories found</p>
          )}
        </div>
      </div>
    </div>
  );
}

