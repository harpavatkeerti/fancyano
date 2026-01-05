'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { productsApi } from '@/lib/api';
import { ToastContainer } from '@/components/common';

export default function SalesmanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);

  // Function to update cart count from localStorage
  function updateCartCount() {
    try {
      const cart = JSON.parse(localStorage.getItem('salesman_cart') || '[]');
      setCartCount(cart.length);
    } catch (error) {
      console.error('Error reading cart:', error);
      setCartCount(0);
    }
  }

  useEffect(() => {
    fetchProducts();
    updateCartCount();
  }, []);

  // Update cart count when pathname changes (user navigates)
  useEffect(() => {
    updateCartCount();
  }, [pathname]);

  // Check if cart should be cleared (5 minutes timeout)
  function checkCartTimeout() {
    try {
      const cartCreatedAt = localStorage.getItem('salesman_cart_created_at');
      if (!cartCreatedAt) {
        return;
      }

      const createdAt = parseInt(cartCreatedAt, 10);
      const now = Date.now();
      const elapsedMinutes = (now - createdAt) / (1000 * 60);

      if (elapsedMinutes >= 5) {
        console.log('⏰ Cart expired (5 minutes passed), clearing cart...');
        localStorage.removeItem('salesman_cart');
        localStorage.removeItem('salesman_cart_created_at');
        updateCartCount();
      }
    } catch (error) {
      console.error('Error checking cart timeout:', error);
    }
  }

  // Listen for custom cart update events
  useEffect(() => {
    function handleCartUpdate() {
      updateCartCount();
    }

    // Check cart timeout on mount
    checkCartTimeout();

    // Listen for custom event
    window.addEventListener('cartUpdated', handleCartUpdate);
    
    // Also listen for storage events (for cross-tab updates)
    window.addEventListener('storage', handleCartUpdate);

    // Set up interval to check cart timeout every minute
    const intervalId = setInterval(() => {
      checkCartTimeout();
      updateCartCount(); // Also update count in case cart was cleared
    }, 60000); // Check every minute

    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate);
      window.removeEventListener('storage', handleCartUpdate);
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    // Close suggestions when clicking outside
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchProducts() {
    try {
      const response = await productsApi.getAll();
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }

  // Get unique product types from all products (dynamically)
  function getUniqueProductTypes(): string[] {
    const types = new Set<string>();
    products.forEach(product => {
      if (product.name) {
        types.add(product.name);
      }
    });
    return Array.from(types).sort();
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    
    // Get all unique product types
    const allProductTypes = getUniqueProductTypes();
    
    if (value.trim().length > 0) {
      // Filter product types that match the search query
      const filteredTypes = allProductTypes.filter(type =>
        type.toLowerCase().includes(value.toLowerCase())
      );
      
      setSuggestions(filteredTypes.slice(0, 10));
      setShowSuggestions(filteredTypes.length > 0);
    } else {
      // Show all product types when search box is empty but focused
      setSuggestions(allProductTypes.slice(0, 10));
      setShowSuggestions(allProductTypes.length > 0);
    }
  }

  function handleSearchFocus() {
    // Show all product types when search box is focused
    const allProductTypes = getUniqueProductTypes();
    setSuggestions(allProductTypes.slice(0, 10));
    setShowSuggestions(allProductTypes.length > 0);
  }

  function handleSuggestionClick(suggestion: string) {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    router.push(`/salesman/products?search=${encodeURIComponent(suggestion)}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/salesman/products?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
      setShowSuggestions(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/salesman" className="flex items-center">
              <div className="bg-red-600 text-white px-3 py-1 font-bold text-lg">
                FAN-C-YA-NO
              </div>
              <span className="ml-2 text-xs text-gray-600">Wedding Dress Rental</span>
            </Link>

            {/* Search with Autocomplete */}
            <div className="flex-1 max-w-md mx-8" ref={searchRef}>
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={handleSearchFocus}
                  className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button type="submit" className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <svg
                    className="w-4 h-4 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </button>
                
                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-100 last:border-0"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </form>
            </div>

            {/* Navigation */}
            <nav className="flex items-center space-x-8">
              <Link
                href="/salesman"
                className={`text-sm font-medium ${
                  pathname === '/salesman'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Home
              </Link>
              <Link
                href="/salesman/products"
                className={`text-sm font-medium ${
                  pathname?.startsWith('/salesman/products')
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Products
              </Link>
              <Link
                href="/salesman/cart"
                className={`text-sm font-medium ${
                  pathname === '/salesman/cart'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Cart({cartCount})
              </Link>
              <Link
                href="/salesman/my-bookings"
                className={`text-sm font-medium ${
                  pathname === '/salesman/my-bookings'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                My Bookings
              </Link>
              <Link
                href="/salesman/customer-bookings"
                className={`text-sm font-medium ${
                  pathname === '/salesman/customer-bookings'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Customer Bookings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>{children}</main>

      {/* Toast Container */}
      <ToastContainer>
        <div />
      </ToastContainer>

      {/* Footer */}
      <footer className="bg-gray-100 border-t border-gray-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm text-gray-600">
            © 2025 FAN-C-YA-NO. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

