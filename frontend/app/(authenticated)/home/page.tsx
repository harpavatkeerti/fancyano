'use client';

import { useEffect, useState } from 'react';
import { productsApi, productCategoriesApi } from '@/lib/api';
import { Product } from '@/types';
import Link from 'next/link';
import { getImageUrl } from '@/lib/imageHelper';

interface CategoryWithTypes {
  id: number | null;
  name: string;
  types?: { id: number; name: string; category_id: number | null }[];
}

export default function SalesmanHome() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryWithTypes[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        productsApi.getAll(),
        productCategoriesApi.getAll(),
      ]);
      setProducts(productsRes.data);

      // Extract real categories (exclude the virtual "Accessories & Others" with id=null)
      const cats: CategoryWithTypes[] = (categoriesRes.data.categories || []).filter((c: any) => c.id !== null);
      setCategories(cats);

      // Default to first category
      if (cats.length > 0) {
        setCategoryFilter(cats[0].name);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filter products by selected category
  const filteredProducts = categoryFilter
    ? products.filter((p) => p.category_name === categoryFilter)
    : products;

  // Get product types for the selected category (for the Categories grid)
  const selectedCat = categories.find(c => c.name === categoryFilter);
  const categoryTypes = selectedCat?.types || [];

  // Get newly added products sorted by created_at (most recent first)
  const newlyAdded = [...filteredProducts]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);

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

      {/* Category Filter Buttons */}
      <div className="flex gap-3 mb-8 flex-wrap">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.name)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer
              ${categoryFilter === cat.name
                ? 'bg-red-600 text-white shadow-md shadow-red-200'
                : 'bg-white text-gray-600 border border-gray-300 hover:border-red-300 hover:text-red-600'
              }`}
          >
            {cat.name}
            {categoryFilter === cat.name && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* Product Types in selected category */}
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
          {categoryTypes.slice(0, 4).map((type) => {
            // Find a representative product for this type to get its image
            const representativeProduct = filteredProducts.find(p => p.name === type.name);
            return (
              <Link
                key={type.id}
                href={`/products?search=${encodeURIComponent(type.name)}`}
                className="group"
              >
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden mb-3 bg-gray-100">
                  {representativeProduct && getImageUrl((representativeProduct as any).image) ? (
                    <img
                      src={getImageUrl((representativeProduct as any).image)!}
                      alt={type.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-200">
                      <span className="text-4xl">👔</span>
                    </div>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900">{type.name}</h3>
              </Link>
            );
          })}
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
    </div>
  );
}
