'use client';

import { useEffect, useState } from 'react';
import { productsApi, bookingsApi } from '@/lib/api';
import { Product } from '@/types';
import { Button, Input, ImageUpload, AvailabilityCalendar, ProductTrackingModal } from '@/components/common';
import { getImageUrl } from '@/lib/imageHelper';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState<Product | null>(null);
  const [productBookings, setProductBookings] = useState<any[]>([]);
  const [trackingProduct, setTrackingProduct] = useState<Product | null>(null);
  
  // Filter states
  const [filterProductType, setFilterProductType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSize, setFilterSize] = useState('');

  // Verify new code is loaded
  console.log('🔄 Inventory page loaded with IMAGE HELPER v2.0');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    purchase_price: '',
    rent_per_day: '',
    category: '',
    gender: '', // Male or Female
    size: '',
    description: '',
    availability: true,
    image: '',
  });

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const dataToSubmit = {
        ...formData,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
        rent_per_day: Math.round(parseFloat(formData.rent_per_day)), // Ensure it's a whole number
        // Set gender to null for Fancy Costumes (uses age-based sizes instead), or if empty for Other
        // Set size to null for Artificial Jewelleries or if empty for Other
        gender: (formData.name === 'Fancy Costumes' || !formData.gender) ? null : formData.gender,
        size: (formData.name === 'Artificial Jewelleries' || !formData.size) ? null : formData.size,
      };

      console.log('📤 Submitting product data:', JSON.stringify(dataToSubmit, null, 2));

      if (editingProduct) {
        const response = await productsApi.update(editingProduct.id, dataToSubmit);
        console.log('Product updated:', response.data);
      } else {
        const response = await productsApi.create(dataToSubmit);
        console.log('Product created:', response.data);
        console.log('Image path from backend:', response.data.image);
      }
      await fetchProducts();
      setShowAddModal(false);
      setEditingProduct(null);
      resetForm();
    } catch (error: any) {
      console.error('❌ Error saving product:', error);
      console.error('   Error response:', error.response?.data);
      console.error('   Error status:', error.response?.status);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      alert(`Error saving product: ${errorMessage}`);
    }
  }

  function handleEdit(product: Product) {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      code: product.code,
      purchase_price: (product as any).purchase_price?.toString() || '',
      rent_per_day: product.rent_per_day.toString(),
      category: product.category || '',
      gender: (product as any).gender || '',
      size: (product as any).size || '',
      description: product.description || '',
      availability: product.availability,
      image: (product as any).image || '',
    });
    setShowAddModal(true);
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await productsApi.delete(id);
      await fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Error deleting product');
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      code: '',
      purchase_price: '',
      rent_per_day: '',
      category: '',
      gender: '',
      size: '',
      description: '',
      availability: true,
      image: '',
    });
  }

  // Auto-calculate rent per day based on purchase price
  function handlePurchasePriceChange(value: string) {
    const purchasePrice = parseFloat(value);
    let calculatedRent = '';
    
    if (!isNaN(purchasePrice) && purchasePrice > 0) {
      // Calculate rent as 49.5% of purchase price, rounded to nearest 100
      const baseRent = purchasePrice * 0.495;
      const roundedRent = Math.round(baseRent / 100) * 100;
      calculatedRent = roundedRent.toString();
    }
    
    setFormData({
      ...formData,
      purchase_price: value,
      rent_per_day: calculatedRent,
    });
  }

  async function handleCheckAvailability(product: Product) {
    try {
      setCheckingAvailability(product);
      const response = await bookingsApi.getByProductId(product.id);
      setProductBookings(response.data);
    } catch (error) {
      console.error('Error fetching product bookings:', error);
      alert('Error loading availability calendar');
    }
  }

  const filteredProducts = products.filter((p) => {
    // Search term filter
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase());

    // Product type filter
    const matchesProductType =
      !filterProductType || p.name === filterProductType;

    // Category filter (gender)
    const matchesCategory =
      !filterCategory || (p as any).gender === filterCategory;

    // Size filter
    const matchesSize = !filterSize || (p as any).size === filterSize;

    return matchesSearch && matchesProductType && matchesCategory && matchesSize;
  });

  if (loading) {
    return <div className="text-center py-12">Loading inventory...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Inventory</h1>
        <Button onClick={() => {
          resetForm();
          setEditingProduct(null);
          setShowAddModal(true);
        }}>
          + Add Product
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex items-center space-x-4">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <span className="text-sm text-gray-600">
            Showing: {filteredProducts.length} / {products.length}
          </span>
        </div>
        
        {/* Filter Row */}
        <div className="space-y-3">
          {/* First Row - Product Type, Category, Size */}
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Product Type</label>
              <select
                value={filterProductType}
                onChange={(e) => setFilterProductType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Categories</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
            
            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Size</label>
              <select
                value={filterSize}
                onChange={(e) => setFilterSize(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          </div>

          {/* Second Row - Clear Button */}
          <div className="flex items-end space-x-4">
            <div className="flex-1">
              {/* Empty spacer */}
            </div>
            
            <div className="flex-1">
              {/* Empty spacer */}
            </div>
            
            <div className="flex-1">
              {/* Empty spacer */}
            </div>

            <div>
              <button
                onClick={() => {
                  setFilterProductType('');
                  setFilterCategory('');
                  setFilterSize('');
                  setSearchTerm('');
                }}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Image
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pr. Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product Tracking
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rent per day
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Check Availability
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredProducts.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  {getImageUrl((product as any).image) ? (
                    <img 
                      src={getImageUrl((product as any).image)!} 
                      alt={product.name}
                      className="w-12 h-12 object-cover rounded-md border border-gray-200"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center border border-gray-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {product.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.code}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {(product as any).gender || <span className="text-gray-400">N/A</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {(product as any).size || <span className="text-gray-400">N/A</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => setTrackingProduct(product)}
                    className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    📦 Track
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  ₹{product.rent_per_day}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => handleCheckAvailability(product)}
                    className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    📅 View Calendar
                  </button>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewingProduct(product)}
                      className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md transition-all duration-300 hover:scale-110 animate-pulse hover:animate-none flex items-center justify-center"
                      title="View Details"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleEdit(product)}
                      className="px-3 py-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md transition-all duration-200 hover:scale-110 flex items-center justify-center min-w-[60px]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(product.id)}
                      className="px-3 py-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md transition-all duration-200 hover:scale-110 flex items-center justify-center min-w-[60px]"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-md my-8 mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Product Type Selection - First Step */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Type*
                </label>
                <select
                  value={formData.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    
                    // Auto-detect gender based on product type
                    const maleProducts = ['Sherwani', 'Indo Western', 'Suit', 'Kurta Pajama'];
                    const femaleProducts = ['Lehenga', 'Girlish Crop Top', 'Gowns'];
                    
                    let autoGender = '';
                    if (maleProducts.includes(newName)) {
                      autoGender = 'Male';
                    } else if (femaleProducts.includes(newName)) {
                      autoGender = 'Female';
                    } else if (newName === 'Artificial Jewelleries') {
                      autoGender = 'Female'; // Set gender but no size required
                    }
                    // For "Other" and other special categories (except Fancy Costumes), gender remains empty and needs to be selected
                    
                    setFormData({ ...formData, name: newName, gender: autoGender, size: '' });
                  }}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Product Type</option>
                  <optgroup label="Male">
                    <option value="Sherwani">Sherwani</option>
                    <option value="Indo Western">Indo Western</option>
                    <option value="Suit">Suit</option>
                    <option value="Kurta Pajama">Kurta Pajama</option>
                  </optgroup>
                  <optgroup label="Female">
                    <option value="Lehenga">Lehenga</option>
                    <option value="Girlish Crop Top">Girlish Crop Top</option>
                    <option value="Gowns">Gowns</option>
                    <option value="Artificial Jewelleries">Artificial Jewelleries</option>
                  </optgroup>
                  <optgroup label="Special Categories">
                    <option value="Fancy Costumes">Fancy Costumes</option>
                    <option value="Other">Other</option>
                  </optgroup>
                </select>
              </div>

              {/* Gender Selection - Show for "Other" (optional) */}
              {formData.name === 'Other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category (Optional)
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="gender"
                        value="Male"
                        checked={formData.gender === 'Male'}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value, size: '' })}
                        className="mr-2"
                      />
                      <span className="text-sm">Male</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="gender"
                        value="Female"
                        checked={formData.gender === 'Female'}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value, size: '' })}
                        className="mr-2"
                      />
                      <span className="text-sm">Female</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="gender"
                        value=""
                        checked={formData.gender === ''}
                        onChange={(e) => setFormData({ ...formData, gender: '', size: '' })}
                        className="mr-2"
                      />
                      <span className="text-sm">None</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Size Selection for Fancy Costumes - Age-based sizes */}
              {formData.name === 'Fancy Costumes' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Size (Age/Category)*
                  </label>
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Size</option>
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
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Age-based sizing for fancy costumes
                  </p>
                </div>
              )}

              {/* Size Selection - Auto-shown based on product type (Standard products) */}
              {formData.name && formData.name !== 'Fancy Costumes' && formData.name !== 'Artificial Jewelleries' && formData.gender && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Size{formData.name === 'Other' ? ' (Optional)' : '*'}
                  </label>
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    required={formData.name !== 'Other'}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Size</option>
                    {formData.gender === 'Male' && formData.name !== 'Kurta Pajama' ? (
                      <>
                        <option value="34">34</option>
                        <option value="36">36</option>
                        <option value="38">38</option>
                        <option value="40">40</option>
                        <option value="42">42</option>
                        <option value="44">44</option>
                        <option value="46">46</option>
                      </>
                    ) : (
                      <>
                        <option value="S">Small (S)</option>
                        <option value="M">Medium (M)</option>
                        <option value="L">Large (L)</option>
                        <option value="XL">Extra Large (XL)</option>
                        <option value="XXL">XX Large (XXL)</option>
                      </>
                    )}
                  </select>
                </div>
              )}
              <Input
                label="Product Code*"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                required
              />

              {/* Product Image Upload */}
              <ImageUpload
                value={formData.image}
                onChange={(dataUrl) => setFormData({ ...formData, image: dataUrl })}
                label="Product Image (Optional)"
              />

              {/* Purchase Price */}
              <div>
                <Input
                  label="Purchase Price (₹)*"
                  type="number"
                  step="0.01"
                  value={formData.purchase_price}
                  onChange={(e) => handlePurchasePriceChange(e.target.value)}
                  required
                  placeholder="Enter purchase price"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Rental price will be auto-calculated based on purchase price
                </p>
              </div>

              {/* Rental Information */}
              <div>
                <Input
                  label="Rent per Day (₹)*"
                  type="number"
                  step="100"
                  value={formData.rent_per_day}
                  onChange={(e) => setFormData({ ...formData, rent_per_day: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Auto-calculated (rounded to nearest ₹100). Use arrow keys to adjust by ₹100.
                </p>
                
                {/* Rental Policy Information */}
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-600 text-lg">ℹ️</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-900 mb-1">Rental Policy</p>
                      {formData.name === 'Fancy Costumes' ? (
                        <p className="text-xs text-blue-800">
                          <strong>24-Hour Rental:</strong> This product follows a 24-hour rental policy. 
                          Rental duration is calculated from the time of bill generation.
                        </p>
                      ) : (
                        <p className="text-xs text-blue-800">
                          <strong>3-Day Rental:</strong> This rental price includes 3 days by default. 
                          This is the standard policy for all products except Fancy Costumes.
                        </p>
                      )}
                      <p className="text-xs text-blue-600 mt-2">
                        💡 To change rental policies, go to <strong>Settings & Policies</strong> section.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <Input
                label="Sub-Category (Optional)"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Formal, Casual, Traditional"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div className="flex space-x-3">
                <Button type="submit">{editingProduct ? 'Update' : 'Create'}</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingProduct(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View/Watch Modal */}
      {viewingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-2xl transform transition-all duration-300 animate-slideIn">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Product Details</h2>
              <button
                onClick={() => setViewingProduct(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Product Image */}
              {getImageUrl((viewingProduct as any).image) && (
                <div className="flex justify-center">
                  <img 
                    src={getImageUrl((viewingProduct as any).image)!} 
                    alt={viewingProduct.name}
                    className="w-64 h-64 object-contain rounded-lg border-2 border-gray-200 bg-white"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Product Type</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{viewingProduct.name}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Product Code</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{viewingProduct.code}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Category</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {(viewingProduct as any).gender || <span className="text-gray-400">N/A</span>}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Size</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {(viewingProduct as any).size || <span className="text-gray-400">N/A</span>}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Purchase Price</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {(viewingProduct as any).purchase_price ? `₹${(viewingProduct as any).purchase_price}` : <span className="text-gray-400">-</span>}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Rent per Day</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">₹{viewingProduct.rent_per_day}</p>
                  <p className="text-xs text-blue-600 mt-1">
                    {(viewingProduct as any).rental_policy === '24_hours' 
                      ? '⏰ 24-hour rental' 
                      : '📅 Includes 3 days'}
                  </p>
                </div>
              </div>

              {viewingProduct.category && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Sub-Category</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{viewingProduct.category}</p>
                </div>
              )}

              {viewingProduct.description && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Description</p>
                  <p className="text-sm text-gray-900 mt-1">{viewingProduct.description}</p>
                </div>
              )}

              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Availability</p>
                <span
                  className={`inline-flex mt-1 px-2 py-1 text-xs font-semibold rounded-full ${
                    viewingProduct.availability
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {viewingProduct.availability ? 'Available' : 'Not Available'}
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setViewingProduct(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Availability Calendar Modal */}
      {checkingAvailability && (
        <AvailabilityCalendar
          bookings={productBookings}
          onClose={() => {
            setCheckingAvailability(null);
            setProductBookings([]);
          }}
          productName={`${checkingAvailability.name} - ${checkingAvailability.code}${(checkingAvailability as any).size ? ` (${(checkingAvailability as any).size})` : ''}`}
        />
      )}

      {/* Product Tracking Modal */}
      {trackingProduct && (
        <ProductTrackingModal
          productId={trackingProduct.id}
          productCode={trackingProduct.code}
          onClose={() => setTrackingProduct(null)}
        />
      )}
    </div>
  );
}

