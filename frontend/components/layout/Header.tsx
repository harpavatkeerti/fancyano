'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { productsApi, notificationsApi, expensesApi, cashAdjustmentsApi } from '@/lib/api';
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
    { name: 'Bookings',            href: '/bookings'           },
    { name: 'Expenses / Cash',    href: '/expenses-cash'      },
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

  // Notification state (admin only)
  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const role = auth.user?.role;
  const isAdmin = auth.isAdmin;
  const navItems = role ? NAV_ITEMS[role] : null;

  // Poll unread notification count for admin
  useEffect(() => {
    if (!isAdmin) return;
    const fetchCount = () => {
      notificationsApi.getUnreadCount().then(res => {
        setNotifCount(res.data.count);
      }).catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 30000); // every 30s
    return () => clearInterval(interval);
  }, [role]);

  // Load notifications when dropdown opens
  useEffect(() => {
    if (notifOpen && isAdmin) {
      notificationsApi.list({ limit: 10 }).then(res => {
        setNotifications(res.data);
      }).catch(() => {});
    }
  }, [notifOpen, role]);

  // Close notification dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllAsRead();
      setNotifCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch { }
  };

  // Navigate to the appropriate page when clicking a notification
  const handleNotificationClick = (n: any) => {
    if (!n.is_read) handleMarkRead(n.id);
    const routeMap: Record<string, string> = {
      expense: '/reports?module=expenses',
      cash_adjustment: '/reports?module=ledger',
      recurring_expense: '/reports?module=expenses',
    };
    const route = routeMap[n.reference_type];
    if (route) {
      router.push(route + '&t=' + Date.now());
      setNotifOpen(false);
    }
  };

  // Approve/Reject directly from notification — works for expense + cash_adjustment
  const getApproveRejectApi = (type: string) => {
    if (type === 'expense') return { approve: expensesApi.approve, reject: expensesApi.reject };
    if (type === 'recurring_expense') return { approve: expensesApi.approveRecurring, reject: expensesApi.rejectRecurring };
    if (type === 'cash_adjustment') return { approve: cashAdjustmentsApi.approve, reject: cashAdjustmentsApi.reject };
    return null;
  };

  const handleApproveNotif = async (e: React.MouseEvent, notif: any) => {
    e.stopPropagation();
    const api = getApproveRejectApi(notif.reference_type);
    if (!api || !notif.reference_id) return;
    try {
      await api.approve(notif.reference_id);
      if (!notif.is_read) setNotifCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
    } catch { }
  };

  const handleRejectNotif = async (e: React.MouseEvent, notif: any) => {
    e.stopPropagation();
    const api = getApproveRejectApi(notif.reference_type);
    if (!api || !notif.reference_id) return;
    try {
      await api.reject(notif.reference_id);
      if (!notif.is_read) setNotifCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.filter(n => n.id !== notif.id));
    } catch { }
  };

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

        {/* Notification Bell (admin only) */}
        {isAdmin && (
          <div ref={notifRef} className="relative flex items-center px-2">
            <button
              onClick={() => setNotifOpen(!notifOpen)}
              className="relative p-2 text-gray-500 hover:text-red-600 transition-colors rounded-full hover:bg-gray-100"
              title="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {notifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {notifOpen && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-[60] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
                  {notifCount > 0 && (
                    <button onClick={handleMarkAllRead} className="text-xs text-red-600 hover:text-red-800 font-medium">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400 text-sm">No notifications</div>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${!n.is_read ? 'bg-red-50' : ''}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${!n.is_read ? 'bg-red-500' : 'bg-transparent'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-[10px] text-gray-400">
                              {new Date(n.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            {/* Quick approve/reject for actionable notifications */}
                            {n.type === 'action_required' && (n.reference_type === 'expense' || n.reference_type === 'recurring_expense' || n.reference_type === 'cash_adjustment') && n.reference_id && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={(e) => handleApproveNotif(e, n)}
                                  className="w-6 h-6 flex items-center justify-center rounded-full bg-green-100 text-green-600 hover:bg-green-500 hover:text-white transition-colors"
                                  title="Approve"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => handleRejectNotif(e, n)}
                                  className="w-6 h-6 flex items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-500 hover:text-white transition-colors"
                                  title="Reject"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

