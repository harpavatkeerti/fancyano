'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { productsApi } from '@/lib/api';
import { ToastContainer } from '@/components/common';
import { authApi } from '@/lib/authApi';
import { toast } from '@/lib/toast';

export default function SalesmanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1); // For keyboard navigation
  const [products, setProducts] = useState<any[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  
  // Login modal
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [salesmanName, setSalesmanName] = useState('');
  const [tempName, setTempName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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
    checkSalesmanName();
  }, []);
  
  // Check if salesman is logged in
  function checkSalesmanName() {
    const userData = localStorage.getItem('salesman_user') || localStorage.getItem('user');
    let storedName = '';
    let userRole = '';
    
    if (userData) {
      try {
        const user = JSON.parse(userData);
        storedName = user.name || user.userName || '';
        userRole = user.role || '';
        // Check if user is actually a salesman
        if (userRole && userRole !== 'salesman') {
          // Not a salesman, clear and show login
          localStorage.removeItem('salesman_user');
          localStorage.removeItem('salesman_name');
          localStorage.removeItem('name');
          localStorage.removeItem('user');
          setShowNamePrompt(true);
          return;
        }
      } catch (e) {
        storedName = localStorage.getItem('salesman_name') || localStorage.getItem('user_name') || localStorage.getItem('name') || '';
      }
    } else {
      storedName = localStorage.getItem('salesman_name') || localStorage.getItem('user_name') || localStorage.getItem('name') || '';
    }
    
    if (!storedName || storedName.trim() === '' || storedName === 'Salesman') {
      setShowNamePrompt(true);
    } else {
      setSalesmanName(storedName);
    }
  }
  
  async function handleSaveName() {
    if (!tempName || tempName.trim() === '') {
      toast.error('Please enter your name');
      return;
    }
    
    try {
      setLoading(true);
      const name = tempName.trim();
      
      // Authenticate with backend (password is optional if user doesn't have one set)
      const response = await authApi.login({
        name: name,
        password: tempPassword || '', // Allow empty password for users without password set
        role: 'salesman'
      });
      
      const user = response.data.user;
      
      // Verify role is salesman
      if (user.role !== 'salesman') {
        toast.error('Access denied. Salesman role required.');
        return;
      }
      
      // Store salesman data
      localStorage.setItem('salesman_name', user.name);
      localStorage.setItem('name', user.name);
      localStorage.setItem('salesman_user', JSON.stringify({ 
        id: user.id,
        name: user.name, 
        userName: user.name,
        role: 'salesman'
      }));
      localStorage.setItem('user', JSON.stringify({ 
        id: user.id,
        name: user.name, 
        userName: user.name,
        role: 'salesman'
      }));
      
      setSalesmanName(user.name);
      setShowNamePrompt(false);
      setTempName('');
      setTempPassword('');
      
      toast.success('Login successful');
      console.log('✅ Salesman logged in:', user.name);
    } catch (error: any) {
      console.error('Login error:', error);
      const errorMessage = error.response?.data?.error || 'Invalid credentials. Please check your name and password.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }
  
  function handleLogout() {
    if (confirm('Are you sure you want to logout? Your cart will be cleared.')) {
      // Clear salesman localStorage
      localStorage.removeItem('salesman_name');
      localStorage.removeItem('name');
      localStorage.removeItem('user');
      localStorage.removeItem('salesman_user');
      localStorage.removeItem('salesman_cart');
      localStorage.removeItem('salesman_cart_created_at');
      
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
    setSelectedSuggestionIndex(-1); // Reset selection when typing
    
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
    setSelectedSuggestionIndex(-1);
    router.push(`/salesman/products?search=${encodeURIComponent(suggestion)}`);
  }

  // Handle keyboard navigation in search suggestions
  function handleKeyboardNavigation(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && searchQuery.trim()) {
        e.preventDefault();
        router.push(`/salesman/products?search=${encodeURIComponent(searchQuery)}`);
        setSearchQuery('');
        setShowSuggestions(false);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        } else if (searchQuery.trim()) {
          router.push(`/salesman/products?search=${encodeURIComponent(searchQuery)}`);
          setSearchQuery('');
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
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
                  onKeyDown={handleKeyboardNavigation}
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
                        className={`w-full text-left px-4 py-2 transition-colors border-b border-gray-100 last:border-0 ${
                          index === selectedSuggestionIndex 
                            ? 'bg-red-100 border-red-300 border-2' 
                            : 'hover:bg-gray-100'
                        }`}
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
              <Link
                href="/salesman/complaints"
                className={`text-sm font-medium ${
                  pathname === '/salesman/complaints'
                    ? 'text-gray-900'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Support
              </Link>
              
              {/* User Display */}
              {salesmanName && (
                <div className="flex items-center space-x-2 ml-4 pl-4 border-l border-gray-300">
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                    {salesmanName.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{salesmanName}</p>
                    <p className="text-xs text-gray-500">Salesman</p>
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
      {showNamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Salesman Portal</h2>
            <p className="text-gray-600 mb-6">Please enter your credentials to continue</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSaveName()}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {tempPassword ? <span className="text-red-600">*</span> : <span className="text-gray-500">(Optional)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSaveName()}
                    placeholder="Enter your password"
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleSaveName}
              disabled={loading}
              className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Login to Salesman Portal'}
            </button>
            <p className="text-sm text-gray-500 mt-4 text-center">
              Authorized personnel only
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

