'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { LOGO_PATH } from '@/lib/brand';
import { getHomeRoute } from '@/lib/routePermissions';

// Nav items per role — all hrefs use flat routes
// Admin: show shared/user-facing nav in header; admin-management links live in the sidebar.
// Salesman/Customer: full nav in header (no sidebar).
const NAV_ITEMS = {
  admin: [
    { name: 'Home',               href: '/home'               },
    { name: 'Products',           href: '/products'           },
    { name: 'Cart',               href: '/cart'               },
    { name: 'Complaints',         href: '/complaints'         },
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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 h-16">
      <div className="flex items-center h-full">
        {/* Logo — w-64 flush left, no padding, aligns with sidebar below for admin */}
        <Link
          href={getHomeRoute(role)}
          className="flex items-center justify-center shrink-0 h-full w-64 border-r border-gray-200"
        >
          <Image src={LOGO_PATH} alt="Fancyano" width={200} height={56} className="object-contain h-14 w-auto" />
        </Link>

        {/* Nav links */}
        <nav className="flex items-center justify-center gap-6 px-6 flex-1">
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
          <div className="flex items-center gap-3 pr-6 pl-4 border-l border-gray-200">
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
