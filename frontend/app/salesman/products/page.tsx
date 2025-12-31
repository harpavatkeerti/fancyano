'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { productsApi, bookingsApi } from '@/lib/api';
import { Product } from '@/types';
import Link from 'next/link';
import { getImageUrl } from '@/lib/imageHelper';

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter states matching admin inventory page
  const [filterProductType, setFilterProductType] = useState('');
  const [filterCategory, setFilterCategory] = useState(''); // Gender
  const [filterSize, setFilterSize] = useState('');
  const [sortBy, setSortBy] = useState('');

  useEffect(() => {
    fetchProducts();
    // Set search term from URL if provided
    const urlSearch = searchParams?.get('search');
    if (urlSearch) {
      setSearchTerm(urlSearch);
    }
  }, [searchParams]);

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

  function handleResetFilters() {
    setSearchTerm('');
    setFilterProductType('');
    setFilterCategory('');
    setFilterSize('');
    setSortBy('');
  }

  // Get filtered products (same logic as admin inventory)
  const filteredProducts = products.filter((product) => {
    // Search term filter
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.code.toLowerCase().includes(searchTerm.toLowerCase());

    // Product type filter
    const matchesProductType =
      !filterProductType || product.name === filterProductType;

    // Category filter (gender)
    const matchesCategory =
      !filterCategory || (product as any).gender === filterCategory;

    // Size filter
    const matchesSize = !filterSize || (product as any).size === filterSize;

    return matchesSearch && matchesProductType && matchesCategory && matchesSize;
  });

  // Sort products (same logic as admin inventory)
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-low-high') {
      return a.rent_per_day - b.rent_per_day;
    } else if (sortBy === 'price-high-low') {
      return b.rent_per_day - a.rent_per_day;
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Search Bar */}
      <div className="mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search products by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
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
          </div>
          <span className="text-sm text-gray-600 whitespace-nowrap">
            Showing: {filteredProducts.length} / {products.length}
          </span>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Filters</h2>
        
        <div className="space-y-4">
          {/* Product Type Filter */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Product Type</label>
              <select
                value={filterProductType}
                onChange={(e) => setFilterProductType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">All Types</option>
                <option value="Sherwani">Sherwani</option>
                <option value="Indo Western">Indo Western</option>
                <option value="Suit">Suit</option>
                <option value="Kurta Pajama">Kurta Pajama</option>
                <option value="Lehenga">Lehenga</option>
                <option value="Girlish Crop Top">Girlish Crop Top</option>
                <option value="Gowns">Gowns</option>
                <option value="Artificial Jewelleries">Artificial Jewelleries</option>
                <option value="Fancy Costumes">Fancy Costumes</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Category (Gender) Filter */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">All Categories</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            {/* Size Filter */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Size</label>
              <select
                value={filterSize}
                onChange={(e) => setFilterSize(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">All Sizes</option>
                <optgroup label="Standard Sizes">
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </optgroup>
                <optgroup label="Numeric Sizes">
                  <option value="34">34</option>
                  <option value="36">36</option>
                  <option value="38">38</option>
                  <option value="40">40</option>
                  <option value="42">42</option>
                  <option value="44">44</option>
                  <option value="46">46</option>
                </optgroup>
                <optgroup label="Age-Based (Fancy Costumes)">
                  <option value="2-3 years">2-3 years</option>
                  <option value="3-4 years">3-4 years</option>
                  <option value="3-5 years">3-5 years</option>
                  <option value="4-6 years">4-6 years</option>
                  <option value="5-6 years">5-6 years</option>
                  <option value="5-7 years">5-7 years</option>
                  <option value="8-10 years">8-10 years</option>
                  <option value="12-14 years">12-14 years</option>
                  <option value="14-16 years">14-16 years</option>
                  <option value="Adult Size">Adult Size</option>
                </optgroup>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-xs text-gray-600 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="">Default</option>
                <option value="price-low-high">Price: Low to High</option>
                <option value="price-high-low">Price: High to Low</option>
                <option value="name-asc">Name: A-Z</option>
                <option value="name-desc">Name: Z-A</option>
              </select>
            </div>
          </div>

          {/* Clear Filters Button */}
          <div className="flex justify-end">
            <button
              onClick={handleResetFilters}
              className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-6">
          Products ({sortedProducts.length})
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
                {!product.availability && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                    ⚠️ Unavailable
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-500 mb-1">{product.code}</p>
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">
                  {product.name}
                </h3>
                {(product as any).size && (
                  <p className="text-xs text-gray-600 mb-1">Size: {(product as any).size}</p>
                )}
                {(product as any).gender && (
                  <p className="text-xs text-gray-600 mb-2">{(product as any).gender}</p>
                )}
                <p className="text-red-600 font-bold">₹{Math.floor(product.rent_per_day)} / Day</p>
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
  );
}

