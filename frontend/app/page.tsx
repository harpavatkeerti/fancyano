'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-gray-800">Rental Booking System</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/admin">
            <div className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer">
              <h2 className="text-2xl font-semibold mb-4">Admin Portal</h2>
              <p className="text-gray-600">Manage inventory, bookings, and users</p>
            </div>
          </Link>
          <Link href="/customer">
            <div className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer">
              <h2 className="text-2xl font-semibold mb-4">Customer Portal</h2>
              <p className="text-gray-600">Browse products and make bookings</p>
            </div>
          </Link>
          <Link href="/salesman">
            <div className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer">
              <h2 className="text-2xl font-semibold mb-4">Salesman Portal</h2>
              <p className="text-gray-600">Assist customers and manage bookings</p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
