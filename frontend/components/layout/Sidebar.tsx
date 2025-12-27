'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  role?: 'admin' | 'salesman' | 'customer';
}

const adminMenuItems = [
  { name: 'Dashboard', href: '/admin', icon: '📊' },
  { name: 'Inventory', href: '/admin/inventory', icon: '📦' },
  { name: 'Bookings', href: '/admin/bookings', icon: '📅' },
  { name: 'User Management', href: '/admin/users', icon: '👥' },
  { name: 'Complaints & Feedback', href: '/admin/complaints', icon: '💬' },
  { name: 'Reports', href: '/admin/reports', icon: '📈' },
  { name: 'Settings & Policies', href: '/admin/settings', icon: '⚙️' },
];

const salesmanMenuItems = [
  { name: 'Dashboard', href: '/salesman', icon: '📊' },
  { name: 'Products', href: '/salesman/products', icon: '📦' },
  { name: 'Bookings', href: '/salesman/bookings', icon: '📅' },
  { name: 'Customers', href: '/salesman/customers', icon: '👥' },
];

const customerMenuItems = [
  { name: 'Home', href: '/customer', icon: '🏠' },
  { name: 'Products', href: '/customer/products', icon: '📦' },
  { name: 'My Bookings', href: '/customer/bookings', icon: '📅' },
];

export default function Sidebar({ role = 'admin' }: SidebarProps) {
  const pathname = usePathname();
  const menuItems = role === 'admin' ? adminMenuItems : role === 'salesman' ? salesmanMenuItems : customerMenuItems;

  return (
    <div className="w-64 bg-white h-screen fixed left-0 top-0 shadow-lg">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold text-gray-800">FAN-CYAND</h1>
        <p className="text-sm text-gray-500">Wedding Dress Rental</p>
      </div>
      <nav className="p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

