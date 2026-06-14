'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';

// Nav items per role — all hrefs use flat routes
const NAV_ITEMS = {
  admin: [
    { name: 'Dashboard',          href: '/dashboard'          },
    { name: 'Inventory',          href: '/inventory'          },
    { name: 'Bookings',           href: '/bookings'           },
    { name: 'Credit Notes',       href: '/credit-notes'       },
    { name: 'Users',              href: '/users'              },
    { name: 'Complaints',         href: '/complaints'         },
    { name: 'Reports',            href: '/reports'            },
    { name: 'Settings',           href: '/settings'           },
  ],
  salesman: [
    { name: 'Home',               href: '/home'               },
    { name: 'Products',           href: '/products'           },
    { name: 'Cart',               href: '/cart'               },
    { name: 'My Bookings',        href: '/my-bookings'        },
    { name: 'Customer Bookings',  href: '/customer-bookings'  },
    { name: 'Support',            href: '/complaints'         },
  ],
  customer: [
    { name: 'Home',               href: '/home'               },
    { name: 'Products',           href: '/products'           },
    { name: 'Cart',               href: '/cart'               },
    { name: 'My Bookings',        href: '/my-bookings'        },
    { name: 'Support',            href: '/complaints'         },
  ],
};

export default function Header() {
  const pathname = usePathname();
  const auth = useAuth();

  const role = auth.user?.role;
  const navItems = role ? NAV_ITEMS[role] : null;

  if (!navItems) {
    return (
      <header className="bg-red-50 border-b border-red-300 px-6 py-3 text-red-700 text-sm">
        Header error: user role is not defined.
      </header>
    );
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href={role === 'admin' ? '/dashboard' : '/home'} className="flex items-center gap-2 shrink-0">
          <div className="bg-red-600 text-white px-3 py-1 font-bold text-lg">
            FAN-C-YA-NO
          </div>
          <span className="text-xs text-gray-500 hidden sm:block">Wedding Dress Rental</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-red-600 border-b-2 border-red-600 pb-0.5'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        {auth.user && (
          <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
              {auth.user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-gray-900 leading-tight">{auth.user.name}</p>
              <p className="text-xs text-gray-500 capitalize">{auth.user.role}</p>
            </div>
            <button
              onClick={auth.logout}
              className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded border border-red-600 hover:bg-red-50 transition-colors"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
