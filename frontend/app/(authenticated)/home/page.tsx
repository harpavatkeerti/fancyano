'use client';

import { useEffect, useState } from 'react';
import { productsApi } from '@/lib/api';
import { Product } from '@/types';
import Link from 'next/link';
import { getImageUrl } from '@/lib/imageHelper';

export default function SalesmanHome() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [genderFilter, setGenderFilter] = useState<'Male' | 'Female'>('Male');

  useEffect(() => {
    fetchProducts();
  }, []);

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

  // Filter products by selected gender
  const filteredProducts = products.filter(
    (p) => (p as any).gender === genderFilter
  );

  // Get newly added products (last 4 of filtered)
  const newlyAdded = filteredProducts.slice(-4);

  // Get products for continue browsing (first 4 of filtered)
  const continueBrowsing = filteredProducts.slice(0, 4);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-yellow-100 to-yellow-200 rounded-lg p-12 mb-4 relative overflow-hidden">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-red-600 mb-2">
            EXPLORE NEW TRENDS
          </h1>
          <p className="text-red-500 text-lg">
            one stop destination for all your rental needs
          </p>
        </div>
      </div>

      {/* Gender Filter Buttons - Compact */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => setGenderFilter('Male')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer
            ${genderFilter === 'Male'
              ? 'bg-red-600 text-white shadow-md shadow-red-200'
              : 'bg-white text-gray-600 border border-gray-300 hover:border-red-300 hover:text-red-600'
            }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="7" r="4" fill="currentColor" />
            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="currentColor" />
          </svg>
          FOR MEN
          {genderFilter === 'Male' && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <button
          onClick={() => setGenderFilter('Female')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer
            ${genderFilter === 'Female'
              ? 'bg-red-600 text-white shadow-md shadow-red-200'
              : 'bg-white text-gray-600 border border-gray-300 hover:border-red-300 hover:text-red-600'
            }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="7" r="4" fill="currentColor" />
            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="currentColor" />
            <rect x="10" y="3" width="4" height="1" rx="0.5" fill="currentColor" opacity="0.5" />
          </svg>
          FOR WOMEN
          {genderFilter === 'Female' && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      </div>

      {/* Categories Section */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Categories</h2>
          <Link href="/products" className="flex items-center text-sm font-semibold text-red-600 hover:text-red-700">
            See All
            <span className="ml-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center">
              →
            </span>
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {filteredProducts.slice(0, 4).map((product, idx) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="group"
            >
              <div className="relative aspect-[3/4] rounded-lg overflow-hidden mb-3 bg-gray-100">
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
              </div>
              <h3 className="font-semibold text-gray-900">{product.name}</h3>
            </Link>
          ))}
        </div>
      </div>

      {/* Newly Added Products */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Newly Added Products</h2>
          <Link href="/products" className="flex items-center text-sm font-semibold text-red-600 hover:text-red-700">
            See All
            <span className="ml-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center">
              →
            </span>
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {newlyAdded.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="group bg-white rounded-lg overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
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
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                <p className="text-red-600 font-bold">₹{Math.floor(product.rent)} / Day</p>
                {(product as any).security_deposit > 0 && (
                  <p className="text-gray-500 text-xs mt-0.5">Security: ₹{Math.floor((product as any).security_deposit).toLocaleString('en-IN')}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Continue Browsing */}
      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Continue Browsing...</h2>
        <div className="grid grid-cols-4 gap-6">
          {continueBrowsing.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="group bg-white rounded-lg overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
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
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                <p className="text-red-600 font-bold">₹{Math.floor(product.rent)} / Day</p>
                {(product as any).security_deposit > 0 && (
                  <p className="text-gray-500 text-xs mt-0.5">Security: ₹{Math.floor((product as any).security_deposit).toLocaleString('en-IN')}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
