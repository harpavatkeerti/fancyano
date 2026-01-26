'use client';

import { useEffect, useState } from 'react';
import { productsApi } from '@/lib/api';
import { Product } from '@/types';
import Link from 'next/link';
import { getImageUrl } from '@/lib/imageHelper';

export default function CustomerHome() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Get newly added products (last 4)
  const newlyAdded = products.slice(-4);

  // Get products for continue browsing (first 4)
  const continueBrowsing = products.slice(0, 4);

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
      <div className="bg-gradient-to-r from-yellow-100 to-yellow-200 rounded-lg p-12 mb-8 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="mb-4">
              <span className="text-sm font-semibold text-gray-700">FOR MEN</span>
            </div>
            <h1 className="text-4xl font-bold text-red-600 mb-2">
              EXPLORE NEW TRENDS
            </h1>
            <p className="text-red-500 text-lg">
              one stop destination for all your rental needs
            </p>
          </div>
          <div className="flex-1 text-right">
            <span className="text-sm font-semibold text-gray-700">FOR WOMEN</span>
          </div>
        </div>
      </div>

      {/* Categories Section */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Categories</h2>
          <Link href="/customer/products" className="flex items-center text-sm font-semibold text-red-600 hover:text-red-700">
            See All
            <span className="ml-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center">
              →
            </span>
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {products.slice(0, 4).map((product, idx) => (
            <Link
              key={product.id}
              href={`/customer/products/${product.id}`}
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
          <Link href="/customer/products" className="flex items-center text-sm font-semibold text-red-600 hover:text-red-700">
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
              href={`/customer/products/${product.id}`}
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
              href={`/customer/products/${product.id}`}
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
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

