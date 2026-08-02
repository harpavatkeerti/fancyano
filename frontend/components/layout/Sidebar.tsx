'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';

const adminMenuItems = [
  { name: 'Dashboard',            href: '/dashboard',    icon: '📊' },
  { name: 'Inventory',            href: '/inventory',    icon: '📦' },
  { name: 'Bookings',             href: '/bookings',     icon: '📅' },
  { name: 'Credit Notes',         href: '/credit-notes', icon: '💳' },
  { name: 'User Management',      href: '/users',        icon: '👥' },
  { name: 'Vendor Management',    href: '/vendors',      icon: '🏭' },
  { name: 'Complaints & Feedback',href: '/complaints',   icon: '💬' },
  { name: 'Reports',              href: '/reports',      icon: '📈' },
  { name: 'Settings & Policies',  href: '/settings',     icon: '⚙️' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  // Sidebar is admin-only
  if (!isAdmin) return null;

  return (
    <div className="w-64 bg-white h-screen fixed left-0 top-0 shadow-lg z-40 pt-16 border-r border-gray-200">
      <nav className="p-4">
        <ul className="space-y-2">
          {adminMenuItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-red-50 text-red-700 font-semibold'
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
