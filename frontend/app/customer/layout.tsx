'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { productsApi } from '@/lib/api';
import { ToastContainer } from '@/components/common';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [tempName, setTempName] = useState('');
  const [tempEmail, setTempEmail] = useState(''); // Placeholder for future use

  // Function to update cart count from localStorage
  function updateCartCount() {
    try {
      const cart = JSON.parse(localStorage.getItem('customer_cart') || '[]');
      setCartCount(cart.length);
    } catch (error) {
      console.error('Error reading cart:', error);
      setCartCount(0);
    }
  }

  useEffect(() => {
    fetchProducts();
    updateCartCount();
    checkCustomerLogin();
  }, []);
  
  // Check if customer is logged in
  function checkCustomerLogin() {
    const userData = localStorage.getItem('customer_user');
    let storedName = '';
    
    if (userData) {
      try {
        const user = JSON.parse(userData);
        storedName = user.name || user.userName || '';
      } catch (e) {
        storedName = localStorage.getItem('customer_name') || '';
      }
    } else {
      storedName = localStorage.getItem('customer_name') || '';
    }
    
    if (!storedName || storedName.trim() === '') {
      setShowLoginModal(true);
    } else {
      setCustomerName(storedName);
    }
  }
  
  function handleLogin() {
    if (!tempName || tempName.trim() === '') {
      alert('Please enter your name');
      return;
    }
    
    const name = tempName.trim();
    const email = tempEmail.trim(); // Store for future use
    
    // Store customer data
    localStorage.setItem('customer_name', name);
    if (email) {
      localStorage.setItem('customer_email', email);
    }
    localStorage.setItem('customer_user', JSON.stringify({ 
      name, 
      userName: name,
      email: email || '',
      // password field will be added later
    }));
    
    setCustomerName(name);
    setShowLoginModal(false);
    
    console.log('✅ Customer logged in:', name);
    
    // Reload page to ensure all components get the updated localStorage
    window.location.reload();
  }
  
  function handleLogout() {
    if (confirm('Are you sure you want to logout? Your cart will be cleared.')) {
      // Clear customer localStorage
      localStorage.removeItem('customer_name');
      localStorage.removeItem('customer_email');
      localStorage.removeItem('customer_user');
      localStorage.removeItem('customer_cart');
      localStorage.removeItem('customer_cart_created_at');
      
      // Reload page to show login modal
      window.location.reload();
    }
  }

  // Update cart count when pathname changes (user navigates)
  useEffect(() => {
    updateCartCount();
  }, [pathname]);

  // Check if cart should be cleared (5 minutes timeout)
  function checkCartTimeout() {
    try {
      const cartCreatedAt = localStorage.getItem('customer_cart_created_at');
      if (!cartCreatedAt) {
        return;
      }

      const createdAt = parseInt(cartCreatedAt, 10);
      const now = Date.now();
      const elapsedMinutes = (now - createdAt) / (1000 * 60);

      if (elapsedMinutes >= 5) {
        console.log('⏰ Cart expired (5 minutes passed), clearing cart...');
        localStorage.removeItem('customer_cart');
        localStorage.removeItem('customer_cart_created_at');
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
    router.push(`/customer/products?search=${encodeURIComponent(suggestion)}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/customer/products?search=${encodeURIComponent(searchQuery)}`);
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
            <Link href="/customer" className="flex items-center">
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
                href="/customer"
                className={`text-sm font-medium ${
                  pathname === '/customer'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Home
              </Link>
              <Link
                href="/customer/products"
                className={`text-sm font-medium ${
                  pathname?.startsWith('/customer/products')
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Products
              </Link>
              <Link
                href="/customer/cart"
                className={`text-sm font-medium ${
                  pathname === '/customer/cart'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Cart({cartCount})
              </Link>
              <Link
                href="/customer/bookings"
                className={`text-sm font-medium ${
                  pathname === '/customer/bookings'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                My Bookings
              </Link>
              
              {/* User Display */}
              {customerName && (
                <div className="flex items-center space-x-2 ml-4 pl-4 border-l border-gray-300">
                  <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white font-semibold text-sm">
                    {customerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{customerName}</p>
                    <p className="text-xs text-gray-500">Customer</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded border border-red-600 hover:bg-red-50 transition-colors"
                    title="Logout"
                  >
                    Logout
                  </button>
                </div>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>{children}</main>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to FAN-C-YA-NO</h2>
            <p className="text-gray-600 mb-6">Please enter your details to continue</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleLogin()}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter your email"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">We'll use this for booking updates</p>
              </div>
              
              {/* Placeholder for password field - will be added later */}
              {/* 
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password <span className="text-red-600">*</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
              */}
            </div>
            
            <button
              onClick={handleLogin}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium mt-6"
            >
              Continue
            </button>
            
            <p className="text-sm text-gray-500 mt-4 text-center">
              By continuing, you agree to our Terms & Conditions
            </p>
          </div>
        </div>
      )}

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

