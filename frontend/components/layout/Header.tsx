'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { productsApi } from '@/lib/api';
import { LOGO_PATH } from '@/lib/brand';
import { getHomeRoute } from '@/lib/routePermissions';
import { getImageUrl } from '@/lib/imageHelper';

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

interface ProductSuggestion {
  id: number;
  name: string;
  code: string;
  size?: string;
  rent: number;
  image?: any;
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<ProductSuggestion[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const role = auth.user?.role;
  const navItems = role ? NAV_ITEMS[role] : null;

  // Fetch products once when search opens
  useEffect(() => {
    if (searchOpen && products.length === 0) {
      productsApi.getAll().then((res: any) => {
        setProducts(res.data || []);
      }).catch(() => {});
    }
  }, [searchOpen]);

  // Close search on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchTerm('');
      }
    }
    if (searchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchOpen]);

  // Focus input when opened
  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  // Reset highlight when search term changes
  useEffect(() => {
    setHighlightIdx(-1);
  }, [searchTerm]);

  // Filter suggestions — match by name or code, limit to 6
  const suggestions = searchTerm.trim().length > 0
    ? products
        .filter((p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.code.toLowerCase().includes(searchTerm.toLowerCase())
        )
    : [];

  function handleSearchSubmit() {
    const trimmed = searchTerm.trim();
    if (trimmed) {
      router.push(`/products?search=${encodeURIComponent(trimmed)}`);
      setSearchOpen(false);
      setSearchTerm('');
    }
  }

  function handleSelectSuggestion(product: ProductSuggestion) {
    router.push(`/products/${product.id}`);
    setSearchOpen(false);
    setSearchTerm('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
        handleSelectSuggestion(suggestions[highlightIdx]);
      } else {
        handleSearchSubmit();
      }
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchTerm('');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, -1));
    }
  }

  // Highlight matching text in suggestion
  function highlightMatch(text: string) {
    const term = searchTerm.trim();
    if (!term) return text;
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="font-bold text-red-600">{text.slice(idx, idx + term.length)}</span>
        {text.slice(idx + term.length)}
      </>
    );
  }

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

        {/* Search icon + expandable input with suggestions */}
        <div ref={searchRef} className="relative flex items-center px-3">
          {searchOpen ? (
            <div className="relative">
              <div className="flex items-center bg-gray-100 rounded-full overflow-hidden transition-all duration-200">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search products..."
                  className="w-48 px-3 py-1.5 text-sm bg-transparent outline-none"
                />
                <button
                  onClick={handleSearchSubmit}
                  className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>

              {/* Suggestions dropdown */}
              {suggestions.length > 0 && (
                <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-[60]">
                  <div className="max-h-72 overflow-y-auto">
                  {suggestions.map((product, idx) => (
                    <button
                      key={product.id}
                      onClick={() => handleSelectSuggestion(product)}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        idx === highlightIdx ? 'bg-red-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="w-9 h-9 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                        {getImageUrl(product.image) ? (
                          <img src={getImageUrl(product.image)!} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm">👔</div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{highlightMatch(product.name)}</p>
                        <p className="text-xs text-gray-500">
                          {highlightMatch(product.code)}
                          {product.size && <span className="ml-1">· {product.size}</span>}
                          <span className="ml-1">· ₹{Math.floor(product.rent)}/day</span>
                        </p>
                      </div>
                    </button>
                  ))}
                  </div>
                  {/* "See all results" link */}
                  <button
                    onClick={handleSearchSubmit}
                    className="w-full px-3 py-2 text-xs text-center text-red-600 font-medium border-t border-gray-100 hover:bg-red-50 transition-colors"
                  >
                    See all results for &quot;{searchTerm.trim()}&quot;
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 text-gray-500 hover:text-red-600 transition-colors rounded-full hover:bg-gray-100"
              title="Search products"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          )}
        </div>

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

