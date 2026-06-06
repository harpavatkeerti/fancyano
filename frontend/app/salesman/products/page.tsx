'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { productsApi, bookingsApi } from '@/lib/api';
import { Product } from '@/types';
import Link from 'next/link';
import { getImageUrl } from '@/lib/imageHelper';
import { DateRangePicker } from '@/components/common';

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [productBookings, setProductBookings] = useState<Record<number, any[]>>({});
  
  // Filter states
  const [availabilityFrom, setAvailabilityFrom] = useState('');
  const [availabilityTo, setAvailabilityTo] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [filtersApplied, setFiltersApplied] = useState(false);

  useEffect(() => {
    fetchProducts();
    // Set search term from URL if provided
    const urlSearch = searchParams?.get('search');
    if (urlSearch) {
      setSearchTerm(urlSearch);
    }
  }, [searchParams]);

  useEffect(() => {
    // Fetch bookings when availability dates change
    if (availabilityFrom && availabilityTo) {
      fetchAllProductBookings();
    }
  }, [availabilityFrom, availabilityTo, products]);

  async function fetchProducts() {
    try {
      const response = await productsApi.getAll();
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllProductBookings() {
    try {
      const bookingsMap: Record<number, any[]> = {};
      for (const product of products) {
        try {
          const response = await bookingsApi.getByProductId(product.id);
          bookingsMap[product.id] = response.data || [];
        } catch (error) {
          bookingsMap[product.id] = [];
        }
      }
      setProductBookings(bookingsMap);
    } catch (error) {
      console.error('Error fetching product bookings:', error);
    }
  }

  function handleApplyFilters() {
    setFiltersApplied(true);
  }

  function handleResetFilters() {
    setSearchTerm('');
    setAvailabilityFrom('');
    setAvailabilityTo('');
    setSortBy('');
    setSelectedCategory('');
    setFiltersApplied(false);
  }

  // Check if product is available for selected date range
  function isProductAvailable(productId: number): boolean {
    if (!availabilityFrom || !availabilityTo || !filtersApplied) return true;
    
    const bookings = productBookings[productId] || [];
    if (bookings.length === 0) return true;
    
    const fromDate = new Date(availabilityFrom);
    const toDate = new Date(availabilityTo);
    
    for (const booking of bookings) {
      if (!booking.booked_from || !booking.booked_to) continue;
      
      const bookingFrom = new Date(booking.booked_from);
      const bookingTo = new Date(booking.booked_to);
      
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(0, 0, 0, 0);
      bookingFrom.setHours(0, 0, 0, 0);
      bookingTo.setHours(0, 0, 0, 0);
      
      if (fromDate <= bookingTo && toDate >= bookingFrom) {
        return false;
      }
    }
    
    return true;
  }

  // Get filtered products
  const filteredProducts = products.filter((product) => {
    // Search term filter
    const matchesSearch =
      !searchTerm ||
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.code.toLowerCase().includes(searchTerm.toLowerCase());

    // Category filter
    const matchesCategory =
      !selectedCategory || product.name === selectedCategory || (product as any).gender === selectedCategory;

    // Availability filter (only if filters are applied)
    const matchesAvailability = !filtersApplied || isProductAvailable(product.id);

    return matchesSearch && matchesCategory && matchesAvailability;
  });

  // Sort products (same logic as admin inventory)
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-low-high') {
      return a.rent - b.rent;
    } else if (sortBy === 'price-high-low') {
      return b.rent - a.rent;
    } else if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    }
    return 0;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading products...</div>
      </div>
    );
  }

  // Count active filters
  const activeFiltersCount = [
    availabilityFrom && availabilityTo,
    sortBy,
    selectedCategory,
  ].filter(Boolean).length;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex gap-8">
        {/* Left Sidebar - Filters */}
        <div className="w-64 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Filter by:</h2>
          
          {/* Availability Filter */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Availability</span>
              <button
                onClick={() => {
                  setAvailabilityFrom('');
                  setAvailabilityTo('');
                }}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Reset
              </button>
            </div>
            <DateRangePicker
              label=""
              startDate={availabilityFrom}
              endDate={availabilityTo}
              onStartDateChange={(date) => setAvailabilityFrom(date)}
              onEndDateChange={(date) => setAvailabilityTo(date)}
              minDate={new Date().toISOString().split('T')[0]}
              compact={true}
            />
          </div>

          {/* Sort By */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Sort by</span>
              <button
                onClick={() => setSortBy('')}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Reset
              </button>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Select</option>
              <option value="price-low-high">Price: Low to High</option>
              <option value="price-high-low">Price: High to Low</option>
            </select>
          </div>

          {/* Categories */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">Categories</span>
              <button
                onClick={() => setSelectedCategory('')}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Reset
              </button>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Select</option>
              {Array.from(new Set(products.map(p => p.name)))
                .filter(name => name) // Filter out empty names
                .sort()
                .map((productType) => (
                  <option key={productType} value={productType}>
                    {productType}
                  </option>
                ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleResetFilters}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset All
            </button>
            <button
              onClick={handleApplyFilters}
              className={`w-full px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                filtersApplied
                  ? 'bg-red-400 hover:bg-red-500'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {filtersApplied ? 'Applied' : `Apply Filters(${activeFiltersCount})`}
            </button>
          </div>
        </div>

        {/* Right Side - Products Grid */}
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 mb-6">
            Results showing for...
          </h2>
          <div className="grid grid-cols-4 gap-6">
            {sortedProducts.map((product) => (
              <Link
                key={product.id}
                href={`/salesman/products/${product.id}`}
                className="group bg-white rounded-lg overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow relative"
              >
                <div className="relative aspect-[3/4] bg-gray-100">
                  {getImageUrl((product as any).image) ? (
                    <img
                      src={getImageUrl((product as any).image)!}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200">
                      <span className="text-4xl">👔</span>
                    </div>
                  )}
                  {/* Availability indicator */}
                  {filtersApplied && availabilityFrom && availabilityTo && !isProductAvailable(product.id) && (
                    <div className="absolute inset-0 bg-red-500 bg-opacity-75 flex items-center justify-center">
                      <div className="bg-white rounded-lg p-3 text-center">
                        <div className="text-2xl mb-1">⚠️</div>
                        <p className="text-xs font-semibold text-red-600">Not Available for Selected Dates</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <p className="text-xs text-gray-500 mb-1">{product.code}</p>
                  <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                    {product.name}
                  </h3>
                  <p className="text-xs text-gray-600 mb-1">
                    {(product as any).gender ? `For ${(product as any).gender}` : ''}
                  </p>
                  <p className="text-red-600 font-bold">₹{Math.floor(product.rent)} / Day</p>
                  {(product as any).security_deposit > 0 && (
                    <p className="text-gray-500 text-xs mt-0.5">Security: ₹{Math.floor((product as any).security_deposit).toLocaleString('en-IN')}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {sortedProducts.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-gray-600 font-medium mb-2">No products found</p>
              <p className="text-sm text-gray-500">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

