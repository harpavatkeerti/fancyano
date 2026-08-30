'use client';

import { productsApi, bookingsApi, vendorsApi, productCategoriesApi, TrackingStatus, TRACKING_STATUS_LABELS, MANUAL_TRACKING_STATUSES, Vendor, ProductCategory, ProductTypeDefinition } from '@/lib/api';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  MALE_NUMERIC_SIZES, STANDARD_SIZES, FANCY_COSTUME_SIZES,
  NO_SIZE_TYPES, sortSizes,
  getSizesForSizeType, getSizeTypeLabel,
} from '@/lib/productConstants';


import { toast } from '@/lib/toast';
import { useAlerts } from '@/lib/useAlerts';
import { AlertBanner } from '@/components/common/AlertBanner';
import { integerKeyDown, isIntegerInput } from '@/lib/integerInput';
import { Product } from '@/types';
import { Button, Input, MultipleImageUpload, ProductTrackingModal, QRScanner, PhoneInput, VendorAutocomplete } from '@/components/common';
import DateRangePicker from '@/components/common/DateRangePicker';
import { getImageUrl } from '@/lib/imageHelper';
import { GST_REGEX, PAN_REGEX } from '@/lib/vendorValidation';

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { alerts, addAlert, removeAlert, clearAlerts } = useAlerts();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | 3>(1);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [productBookings, setProductBookings] = useState<Record<string, any[]>>({});
  const [trackingProduct, setTrackingProduct] = useState<Product | null>(null);
  const [trackingSize, setTrackingSize] = useState<string | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Filter states
  const [filterProductType, setFilterProductType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSize, setFilterSize] = useState('');
  const [filterTrackingStatus, setFilterTrackingStatus] = useState<TrackingStatus[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'archived'>('all');

  // Real-time code duplicate check
  const [codeCheckStatus, setCodeCheckStatus] = useState<'idle' | 'checking' | 'taken' | 'available'>('idle');
  const codeCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Code autocomplete dropdown
  const [codeDropdownOpen, setCodeDropdownOpen] = useState(false);
  const codeInputRef = useRef<HTMLDivElement>(null);
  // Tracks if the typed code already belongs to a different product type
  const [codeWrongType, setCodeWrongType] = useState(false);
  // Rent overrides UI visibility
  const [showRentOverrides, setShowRentOverrides] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    purchase_price: '',
    rent: '',
    security_deposit: '',
    category: '',
    available_sizes: [] as string[],
    rent_overrides: {} as Record<string, number>,
    description: '',

    image: '', // Keep for backward compatibility
    images: [] as string[], // New: array of images
    vendor_id: null as number | null,
    category_id: null as number | null,
  });

  // ── Product categories (dynamic from API) ──
  const [inventoryCategories, setInventoryCategories] = useState<ProductCategory[]>([]);

  // Vendor search state
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorFormData, setVendorFormData] = useState({
    name: '',
    phone: '',
    phone_country: 'IN',
    address: '',
    gst_number: '',
    pan_number: '',
    notes: '',
  });
  const [vendorFieldErrors, setVendorFieldErrors] = useState<{ gst_number?: string; pan_number?: string }>({});
  // Vendor update confirm dialog
  const [showVendorConfirmDialog, setShowVendorConfirmDialog] = useState(false);
  const [vendorConfirmDiff, setVendorConfirmDiff] = useState<{ field: string; old: string; new: string }[]>([]);
  const [pendingSubmitData, setPendingSubmitData] = useState<any>(null);

  useEffect(() => {
    fetchProducts();
    fetchInventoryCategories();
  }, []);

  // Reset image index when viewing product changes
  useEffect(() => {
    setCurrentImageIndex(0);
  }, [viewingProduct]);

  async function fetchInventoryCategories() {
    try {
      const response = await productCategoriesApi.getAll();
      setInventoryCategories(response.data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }

  async function fetchProducts() {
    try {
      const response = await productsApi.getAll({ includeArchived: true });
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  }

  // QR scan handler — sets search to the scanned product code
  function handleQRScan(code: string) {
    setSearchTerm(code);
    setShowQRScanner(false);
    toast.success(`Searching for product: ${code}`);
  }

  // Debounced real-time code duplicate checker
  const checkCodeDuplicate = useCallback((code: string, currentEditingId?: number) => {
    if (codeCheckTimerRef.current) clearTimeout(codeCheckTimerRef.current);

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setCodeCheckStatus('idle');
      return;
    }

    setCodeCheckStatus('checking');
    codeCheckTimerRef.current = setTimeout(() => {
      const duplicate = products.find((p) => {
        if (p.id === currentEditingId) return false;
        return p.code.trim().toLowerCase() === trimmedCode.toLowerCase();
      });
      setCodeCheckStatus(duplicate ? 'taken' : 'available');
    }, 400);
  }, [products]);

  /** Copy shared fields from the first existing same-type product with the given code. */
  function autofillFromExistingCode(code: string, currentFormData: typeof formData) {
    const source = products.find(
      p => p.code.toUpperCase() === code.toUpperCase() && p.name === currentFormData.name
    );
    if (!source) return;

    // Collect images from the source product
    const srcImg = (source as any).image;
    let srcImages: string[] = [];
    if (Array.isArray(srcImg)) {
      srcImages = srcImg;
    } else if (typeof srcImg === 'string' && srcImg.startsWith('[')) {
      try { srcImages = JSON.parse(srcImg); } catch { srcImages = srcImg ? [srcImg] : []; }
    } else if (srcImg) {
      srcImages = [srcImg];
    }

    setFormData(prev => ({
      ...prev,
      purchase_price: source.purchase_price != null ? String(source.purchase_price) : prev.purchase_price,
      rent: String(source.rent ?? prev.rent),
      security_deposit: String(source.security_deposit ?? prev.security_deposit),
      description: (source as any).description || prev.description,
      images: srcImages.length > 0 ? srcImages : prev.images,
      image: srcImages[0] || prev.image,
      vendor_id: source.vendor_id ?? prev.vendor_id,
    }));

    // Restore vendor chip if source has a vendor
    if (source.vendor_id) {
      vendorsApi.getById(source.vendor_id).then(res => {
        const v = res.data;
        setSelectedVendor(v);
        setVendorSearchQuery(v.name);
      }).catch(() => {});
    }
  }

  // Auto-fill vendor fields when selected from dropdown
  function handleVendorSelect(vendor: Vendor) {
    setSelectedVendor(vendor);
    setVendorSearchQuery(vendor.name);
    setVendorFormData({
      name: vendor.name,
      phone: vendor.phone,
      phone_country: vendor.phone_country || 'IN',
      address: vendor.address || '',
      gst_number: vendor.gst_number || '',
      pan_number: vendor.pan_number || '',
      notes: vendor.notes || '',
    });
    setVendorFieldErrors({});
    setFormData(prev => ({ ...prev, vendor_id: vendor.id }));
  }

  // Compute vendor diff for confirm dialog
  function computeVendorDiff(): { field: string; old: string; new: string }[] {
    if (!selectedVendor) return [];
    const diff: { field: string; old: string; new: string }[] = [];
    if (vendorFormData.phone !== selectedVendor.phone)
      diff.push({ field: 'Phone', old: selectedVendor.phone, new: vendorFormData.phone });
    if ((vendorFormData.address || '') !== (selectedVendor.address || ''))
      diff.push({ field: 'Address', old: selectedVendor.address || '(none)', new: vendorFormData.address || '(none)' });
    if ((vendorFormData.gst_number || '') !== (selectedVendor.gst_number || ''))
      diff.push({ field: 'GST Number', old: selectedVendor.gst_number || '(none)', new: vendorFormData.gst_number || '(none)' });
    if ((vendorFormData.pan_number || '') !== (selectedVendor.pan_number || ''))
      diff.push({ field: 'PAN Number', old: selectedVendor.pan_number || '(none)', new: vendorFormData.pan_number || '(none)' });
    if ((vendorFormData.notes || '') !== (selectedVendor.notes || ''))
      diff.push({ field: 'Notes', old: selectedVendor.notes || '(none)', new: vendorFormData.notes || '(none)' });
    return diff;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Block submit if the code is known to be taken (only for new products)
    if (!editingProduct && codeCheckStatus === 'taken') {
      addAlert('A product with this code already exists.');
      return;
    }

    try {
      // Prepare images array - use images if available, otherwise fall back to single image
      const imagesToSubmit = formData.images.length > 0
        ? formData.images
        : (formData.image ? [formData.image] : []);

      // Build rent_overrides: only include sizes where rent differs from base rent
      const baseRent = Math.round(parseFloat(formData.rent));
      const rentOverrides: Record<string, number> = {};
      for (const [sz, r] of Object.entries(formData.rent_overrides)) {
        if (r !== baseRent && formData.available_sizes.includes(sz)) {
          rentOverrides[sz] = r;
        }
      }

      const dataToSubmit: any = {
        ...formData,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
        rent: baseRent, // Ensure it's a whole number
        security_deposit: Math.round((parseFloat(formData.security_deposit) || 0) / 100) * 100, // Round to nearest ₹100

        // Sizes: send array or null for sizeless products
        available_sizes: formData.available_sizes.length > 0 ? formData.available_sizes : null,
        // Rent overrides: only if there are any
        rent_overrides: Object.keys(rentOverrides).length > 0 ? rentOverrides : null,
        // Send images array to backend
        images: imagesToSubmit,
        // Keep image for backward compatibility (first image from array)
        image: imagesToSubmit.length > 0 ? imagesToSubmit[0] : '',
      };

      // ── Vendor logic ──────────────────────────────────────────────
      // If a vendor was selected and name hasn't changed, check for detail updates
      if (selectedVendor && vendorFormData.name === selectedVendor.name) {
        const diff = computeVendorDiff();
        if (diff.length > 0) {
          // Show confirm dialog; pause submission
          setVendorConfirmDiff(diff);
          setPendingSubmitData(dataToSubmit);
          setShowVendorConfirmDialog(true);
          return;
        }
        dataToSubmit.vendor_id = selectedVendor.id;
      } else if (vendorFormData.name.trim()) {
        // Validate vendor fields before creating
        const vErrors: { gst_number?: string; pan_number?: string } = {};
        if (vendorFormData.gst_number.trim() && !GST_REGEX.test(vendorFormData.gst_number.trim())) {
          vErrors.gst_number = 'Invalid GST format (e.g. 22AAAAA0000A1Z5)';
        }
        if (vendorFormData.pan_number.trim() && !PAN_REGEX.test(vendorFormData.pan_number.trim())) {
          vErrors.pan_number = 'Invalid PAN format (e.g. ABCDE1234F)';
        }
        if (Object.keys(vErrors).length > 0) {
          setVendorFieldErrors(vErrors);
          addAlert('Please fix vendor field errors before submitting', 'warning');
          return;
        }
        // Name changed or no vendor selected: create new vendor
        const newVendor = await vendorsApi.create({
          name: vendorFormData.name.trim(),
          phone: vendorFormData.phone.trim(),
          phone_country: vendorFormData.phone_country,
          address: vendorFormData.address.trim() || undefined,
          gst_number: vendorFormData.gst_number.trim() || undefined,
          pan_number: vendorFormData.pan_number.trim() || undefined,
          notes: vendorFormData.notes.trim() || undefined,
        });
        dataToSubmit.vendor_id = newVendor.data.id;
      } else {
        dataToSubmit.vendor_id = null;
      }

      await submitProduct(dataToSubmit);
    } catch (error: any) {
      handleSubmitError(error);
    }
  }

  // Separated for reuse from both direct submit and post-confirm submit
  async function submitProduct(dataToSubmit: any) {
    if (editingProduct) {
      await productsApi.update(editingProduct.id, dataToSubmit);
    } else {
      await productsApi.create(dataToSubmit);
    }
    await fetchProducts();
    setShowAddModal(false);
    setEditingProduct(null);
    resetForm();
  }

  function handleSubmitError(error: any) {
    console.error('❌ Error saving product:', error);

    const status = error.response?.status;
    const serverError = error.response?.data?.error || error.response?.data?.details || error.message || 'Unknown error';

    // Give a friendly message for duplicate code (409 Conflict)
    if (status === 409 || serverError?.toLowerCase().includes('already exists')) {
      addAlert('⚠️ A product with this code already exists.', 'warning');
    } else {
      addAlert(`Failed to save product: ${serverError}`, 'error');
    }
  }

  async function handleEdit(product: Product) {
    setEditingProduct(product);

    // Handle images - can be array or single string
    const productImage = (product as any).image;
    let images: string[] = [];
    let singleImage = '';

    if (Array.isArray(productImage)) {
      images = productImage;
      singleImage = productImage.length > 0 ? productImage[0] : '';
    } else if (typeof productImage === 'string' && productImage) {
      // Try to parse as JSON array
      try {
        const parsed = JSON.parse(productImage);
        if (Array.isArray(parsed)) {
          images = parsed;
          singleImage = parsed.length > 0 ? parsed[0] : '';
        } else {
          singleImage = productImage;
          images = [productImage];
        }
      } catch (e) {
        // Not JSON, treat as single image
        singleImage = productImage;
        images = [productImage];
      }
    }

    // Build rent_overrides from rents_by_size for the edit form
    const rentOverrides: Record<string, number> = {};
    const productRentsBySize = (product as any).rents_by_size;
    if (productRentsBySize) {
      for (const [sz, r] of Object.entries(productRentsBySize)) {
        if ((r as number) !== product.rent) {
          rentOverrides[sz] = r as number;
        }
      }
    }

    setFormData({
      name: product.name,
      code: product.code,
      purchase_price: (product as any).purchase_price?.toString() || '',
      rent: product.rent.toString(),
      security_deposit: product.security_deposit?.toString() || '',
      category: product.category || '',
      available_sizes: product.available_sizes || [],
      rent_overrides: rentOverrides,
      description: product.description || '',
      image: singleImage,
      images: images,
      vendor_id: product.vendor_id || null,
      category_id: (product as any).category_id || null,
    });

    // Show rent overrides section if there are any
    setShowRentOverrides(Object.keys(rentOverrides).length > 0);

    // Load vendor details if product has a vendor
    if (product.vendor_id) {
      try {
        const vendorRes = await vendorsApi.getById(product.vendor_id);
        const vendor = vendorRes.data;
        setSelectedVendor(vendor);
        setVendorSearchQuery(vendor.name);
        setVendorFormData({
          name: vendor.name,
          phone: vendor.phone,
          phone_country: vendor.phone_country || 'IN',
          address: vendor.address || '',
          gst_number: vendor.gst_number || '',
          pan_number: vendor.pan_number || '',
          notes: vendor.notes || '',
        });
      } catch {
        // Vendor might have been deleted, ignore
      }
    } else {
      setSelectedVendor(null);
      setVendorSearchQuery('');
      setVendorFormData({ name: '', phone: '', phone_country: 'IN', address: '', gst_number: '', pan_number: '', notes: '' });
    }

    setShowAddModal(true);
  }

  async function handleArchive(id: number) {
    if (!confirm('Archive this product? It will no longer appear in booking or product listings.')) return;
    try {
      await productsApi.archive(id);
      await fetchProducts();
      toast.success('Product archived successfully');
    } catch (error: any) {
      console.error('Error archiving product:', error);
      const message = error.response?.data?.error || 'Error archiving product';
      addAlert(message);
    }
  }

  async function handleRestore(id: number) {
    try {
      await productsApi.restore(id);
      await fetchProducts();
      toast.success('Product restored to available');
    } catch (error: any) {
      console.error('Error restoring product:', error);
      const message = error.response?.data?.error || 'Error restoring product';
      addAlert(message);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      code: '',
      purchase_price: '',
      rent: '',
      security_deposit: '',
      category: '',
      available_sizes: [],
      rent_overrides: {},
      description: '',
      image: '',
      images: [],
      vendor_id: null,
      category_id: null,
    });
    setCodeCheckStatus('idle');
    setCodeDropdownOpen(false);
    setCodeWrongType(false);
    setShowRentOverrides(false);
    setAddStep(1);
    if (codeCheckTimerRef.current) clearTimeout(codeCheckTimerRef.current);
    // Reset vendor state
    setSelectedVendor(null);
    setVendorSearchQuery('');
    setVendorFormData({ name: '', phone: '', phone_country: 'IN', address: '', gst_number: '', pan_number: '', notes: '' });
    setVendorFieldErrors({});
    setShowVendorConfirmDialog(false);
    setVendorConfirmDiff([]);
    setPendingSubmitData(null);
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
      rent: calculatedRent,
    });
  }

  async function fetchProductBookings(productId: number, size?: string) {
    const key = size ? `${productId}-${size}` : `${productId}`;
    if (productBookings[key]) return; // already loaded
    try {
      const response = await bookingsApi.getByProductId(productId, size);
      setProductBookings(prev => ({ ...prev, [key]: response.data || [] }));
    } catch (error) {
      console.error('Error fetching product bookings:', error);
      addAlert('Error loading availability calendar');
    }
  }

  const filteredProducts = products
    .filter((p) => {
      // Search term filter
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase());

      // Product type filter
      const matchesProductType =
        !filterProductType || p.name === filterProductType;

      // Category filter
      const matchesCategory =
        !filterCategory || p.category_name === filterCategory;

      // Size filter — check if any size in available_sizes matches
      const matchesSize = !filterSize || (p.available_sizes || []).includes(filterSize);

      // Tracking status filter — use size_tracking_map
      const sizeTrackingMap = p.size_tracking_map || {};
      const trackingValues = Object.values(sizeTrackingMap);
      const matchesTrackingStatus =
        filterTrackingStatus.length === 0 ||
        filterTrackingStatus.some(fs => {
          if (fs === 'in_house') {
            // Product matches if any size is in_house (or has no tracking map = all in_house)
            const availSizes = p.available_sizes || [];
            if (availSizes.length === 0) return trackingValues.length === 0 || trackingValues.includes('in_house');
            return availSizes.some(sz => !sizeTrackingMap[sz] || sizeTrackingMap[sz] === 'in_house');
          }
          return trackingValues.includes(fs);
        });

      // Status filter (archived vs available)
      const matchesStatus =
        filterStatus === 'all' ||
        p.status === filterStatus;

      return matchesSearch && matchesProductType && matchesCategory && matchesSize && matchesTrackingStatus && matchesStatus;
    })
    .sort((a, b) => {
      // Sort: out-of-house products first, then by newest product (highest id = newest)
      const aMap = a.size_tracking_map || {};
      const bMap = b.size_tracking_map || {};
      const aOut = Object.values(aMap).some(v => v !== 'in_house');
      const bOut = Object.values(bMap).some(v => v !== 'in_house');
      if (aOut && !bOut) return -1;
      if (!aOut && bOut) return 1;
      // Use id as reliable newest-first sort (auto-increment, higher = newer)
      return b.id - a.id;
    });

  if (loading) {
    return <div className="text-center py-12">Loading inventory...</div>;
  }

  // Products currently out (any size has status except in_house)
  const outProducts = products.filter(p => {
    const map = p.size_tracking_map || {};
    return Object.values(map).some(v => v !== 'in_house');
  });
  const outCount = outProducts.length;

  return (
    <div className="space-y-6">
      {/* Inline alert banner for page-level errors */}
      <AlertBanner alerts={alerts} onDismiss={removeAlert} />
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

      {/* Out-of-House Alert Banner */}
      {outCount > 0 && (
        <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-lg px-4 py-2.5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-orange-600 text-lg flex-shrink-0">⚠️</span>
              <span className="text-sm font-bold text-orange-900 flex-shrink-0">
                {outCount} Out
              </span>
              <span className="text-xs text-orange-700 truncate">
                {outProducts.slice(0, 3).map(p => {
                  const map = p.size_tracking_map || {};
                  const outEntries = Object.entries(map).filter(([, v]) => v !== 'in_house');
                  return outEntries.map(([sz, v]) => {
                    const sizeLabel = sz === '_' ? '' : ` (${sz})`;
                    return `${p.code}${sizeLabel}: ${TRACKING_STATUS_LABELS[v as TrackingStatus] || v}`;
                  }).join(' | ');
                }).join(' | ')}
                {outCount > 3 && ` +${outCount - 3} more`}
              </span>
            </div>
            {(() => {
              const isOutFilterActive = MANUAL_TRACKING_STATUSES.every(s => filterTrackingStatus.includes(s)) && filterTrackingStatus.length === MANUAL_TRACKING_STATUSES.length;
              return (
                <button
                  onClick={() => {
                    if (isOutFilterActive) {
                      setFilterTrackingStatus([]);
                    } else {
                      setFilterTrackingStatus(MANUAL_TRACKING_STATUSES);
                      setTimeout(() => {
                        document.querySelector('table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }
                  }}
                  className={`px-3 py-1.5 text-white text-xs font-semibold rounded-lg transition-colors flex-shrink-0 ${
                    isOutFilterActive
                      ? 'bg-red-600 hover:bg-red-700 ring-2 ring-red-300'
                      : 'bg-orange-500 hover:bg-orange-600'
                  }`}
                >
                  {isOutFilterActive ? '✕ Clear Out Filter' : 'View All Out Products'}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow space-y-4">
        <div className="flex items-center space-x-4">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
          <button
            id="inventory-qr-scan-btn"
            onClick={() => setShowQRScanner(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            title="Scan QR code to find product"
          >
            📷 Scan QR
          </button>
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
                {inventoryCategories.map((cat) => (
                  <optgroup key={cat.id ?? 'neutral'} label={cat.name}>
                    {(cat.types || []).map((type) => (
                      <option key={type.id} value={type.name}>{type.name}</option>
                    ))}
                  </optgroup>
                ))}
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
                {inventoryCategories.filter(cat => cat.id !== null).map((cat) => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
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

            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Tracking Status</label>
              <div className="flex flex-wrap gap-1">
                {(['in_house', 'picked_by_customer', 'going_to_dry_clean', 'alternation_related_work', 'repair', 'other_work'] as TrackingStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setFilterTrackingStatus(prev =>
                        prev.includes(status)
                          ? prev.filter(s => s !== status)
                          : [...prev, status]
                      );
                    }}
                    className={`px-2 py-1 text-xs rounded-full border transition-colors ${filterTrackingStatus.includes(status)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                      }`}
                  >
                    {TRACKING_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1">
              <label className="block text-xs text-gray-600 mb-1">Product Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | 'available' | 'archived')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                <option value="available">✅ Available</option>
                <option value="archived">🗃️ Archived</option>
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
                  setFilterTrackingStatus([]);
                  setFilterStatus('all');
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
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Base Rent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Check Availability
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sizes &amp; Tracking
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredProducts.map((product) => {
              const sizeTrackingMap = product.size_tracking_map || {};
              // Sizeless products get key '_' in the map (via COALESCE in SQL)
              const sizelessStatus = sizeTrackingMap['_'] as TrackingStatus | undefined;
              const isOutOfHouse = Object.values(sizeTrackingMap).some(v => v !== 'in_house');

              const trackingColorMap: Record<string, string> = {
                in_house: 'bg-green-100 text-green-800 border-green-300',
                picked_by_customer: 'bg-blue-100 text-blue-800 border-blue-300',
                going_to_dry_clean: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                alternation_related_work: 'bg-purple-100 text-purple-800 border-purple-300',
                repair: 'bg-orange-100 text-orange-800 border-orange-300',
                other_work: 'bg-gray-200 text-gray-800 border-gray-400',
              };

              const sizes = sortSizes(product.available_sizes || []);
              const hasSizes = sizes.length > 0;

              return (
                <React.Fragment key={product.id}>
                  {/* ── Main product row ── */}
                  <tr className={`${isOutOfHouse ? 'bg-orange-50 border-l-4 border-orange-500' : 'hover:bg-gray-50'}`}>
                    {/* Image */}
                    <td className="px-6 py-4 whitespace-nowrap" rowSpan={hasSizes ? sizes.length + 1 : 1}>
                      {(() => {
                        const getFirstImage = (img: any): string | null => {
                          if (!img) return null;
                          if (Array.isArray(img)) return img.length > 0 ? img[0] : null;
                          if (typeof img === 'string' && img.startsWith('[')) {
                            try { const parsed = JSON.parse(img); if (Array.isArray(parsed) && parsed.length > 0) return parsed[0]; } catch (e) {}
                          }
                          return img;
                        };
                        const imageUrl = getFirstImage((product as any).image) ? getImageUrl(getFirstImage((product as any).image)!) : null;
                        return imageUrl ? (
                          <img src={imageUrl} alt={product.name} className="w-12 h-12 object-cover rounded-md border border-gray-200" />
                        ) : (
                          <div className="w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center border border-gray-200">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        );
                      })()}
                    </td>
                    {/* Product Type */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" rowSpan={hasSizes ? sizes.length + 1 : 1}>
                      {product.name}
                    </td>
                    {/* Code */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" rowSpan={hasSizes ? sizes.length + 1 : 1}>
                      {product.code}
                    </td>
                    {/* Category */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" rowSpan={hasSizes ? sizes.length + 1 : 1}>
                      {product.category_name || <span className="text-gray-400">N/A</span>}
                    </td>
                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap" rowSpan={hasSizes ? sizes.length + 1 : 1}>
                      {product.status === 'available' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">✅ Available</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">🗃️ Archived</span>
                      )}
                    </td>
                    {/* Base Rent */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" rowSpan={hasSizes ? sizes.length + 1 : 1}>
                      ₹{product.rent}
                    </td>
                    {/* Availability calendar */}
                    {hasSizes ? (
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-xs text-gray-400 italic">Per size ↓</span>
                      </td>
                    ) : (
                      <td className="px-4 py-4 whitespace-nowrap">
                        <DateRangePicker
                          startDate=""
                          endDate=""
                          onStartDateChange={() => { }}
                          onEndDateChange={() => { }}
                          bookings={productBookings[`${product.id}`] || []}
                          onOpen={() => fetchProductBookings(product.id)}
                          compact
                          label=""
                          readOnly
                        />
                      </td>
                    )}
                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" rowSpan={hasSizes ? sizes.length + 1 : 1}>
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
                        {/* Single Track button for no-size products */}
                        {!hasSizes && (
                          <button
                            id={`track-btn-${product.id}`}
                            onClick={() => { setTrackingSize(null); setTrackingProduct(product); }}
                            className="px-3 py-2 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-md transition-all duration-200 hover:scale-110 flex items-center justify-center min-w-[60px]"
                            title="Track product status"
                          >
                            🗺️ Track
                          </button>
                        )}
                        {product.status === 'archived' ? (
                          <button
                            onClick={() => handleRestore(product.id)}
                            className="px-3 py-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md transition-all duration-200 hover:scale-110 flex items-center justify-center min-w-[60px]"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchive(product.id)}
                            className="px-3 py-2 text-orange-600 hover:text-orange-900 hover:bg-orange-50 rounded-md transition-all duration-200 hover:scale-110 flex items-center justify-center min-w-[60px]"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                    {/* Sizes & Tracking — last column */}
                    <td className="px-6 py-3">
                      {!hasSizes ? (
                        (() => {
                          const st = sizelessStatus || 'in_house';
                          const colors = trackingColorMap[st] || trackingColorMap['in_house'];
                          return (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${colors}`}>
                              {TRACKING_STATUS_LABELS[st as TrackingStatus]}
                            </span>
                          );
                        })()
                      ) : null}
                    </td>
                  </tr>

                  {/* ── Per-size sub-rows ── */}
                  {hasSizes && sizes.map((sz, szIdx) => {
                    const ts = (sizeTrackingMap[sz] || 'in_house') as TrackingStatus;
                    const colors = trackingColorMap[ts] || trackingColorMap['in_house'];
                    const rentsBySize = (product as any).rents_by_size || {};
                    const sizeRent = rentsBySize[sz] ?? product.rent;
                    const isOverridden = sizeRent !== product.rent;
                    const isSzOut = ts !== 'in_house';
                    return (
                      <tr
                        key={`${product.id}-${sz}`}
                        className={`border-t border-dashed border-gray-100 ${isSzOut ? 'bg-orange-50' : 'bg-gray-50/60'} ${szIdx === sizes.length - 1 ? 'border-b-2 border-b-gray-200' : ''}`}
                      >
                        {/* Per-size availability calendar */}
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{sz}</span>
                          <DateRangePicker
                            startDate=""
                            endDate=""
                            onStartDateChange={() => { }}
                            onEndDateChange={() => { }}
                            bookings={productBookings[`${product.id}-${sz}`] || []}
                            onOpen={() => fetchProductBookings(product.id, sz)}
                            compact
                            label=""
                            readOnly
                          />
                          </div>
                        </td>
                        {/* Sizes & Tracking */}
                        <td className="px-6 py-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${colors}`}>
                              {sz}
                              {isOverridden && <span className="text-[10px] opacity-70 ml-0.5">₹{sizeRent}</span>}
                            </span>
                            <span className={`text-xs font-medium ${isSzOut ? 'text-orange-700' : 'text-green-700'}`}>
                              {TRACKING_STATUS_LABELS[ts]}
                            </span>
                            <button
                              id={`track-btn-${product.id}-${sz}`}
                              onClick={() => { setTrackingSize(sz); setTrackingProduct(product); }}
                              className={`ml-auto p-1 rounded-md transition-all duration-200 hover:scale-110 ${isSzOut ? 'text-orange-600 hover:bg-orange-100' : 'text-indigo-500 hover:bg-indigo-50'}`}
                              title={`Track ${sz} — ${TRACKING_STATUS_LABELS[ts]}`}
                            >
                              📍
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                 </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingProduct ? 'Edit Product' : 'Add Product'}
                </h2>
                {!editingProduct && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    Step {addStep} of 2 — {addStep === 1 ? 'Product type & code' : 'Product details'}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setEditingProduct(null); resetForm(); }}
                className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Step indicator (add mode only) */}
            {!editingProduct && (
              <div className="flex px-8 pt-4 gap-2">
                <div className={`h-1 flex-1 rounded-full transition-colors ${addStep >= 1 ? 'bg-red-600' : 'bg-gray-200'}`} />
                <div className={`h-1 flex-1 rounded-full transition-colors ${addStep >= 2 ? 'bg-red-600' : 'bg-gray-200'}`} />
                <div className={`h-1 flex-1 rounded-full transition-colors ${addStep >= 3 ? 'bg-red-600' : 'bg-gray-200'}`} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="px-8 py-6 space-y-6 max-h-[75vh] overflow-y-auto">

              {/* ── STEP 1 (Add mode): Select Category (Men / Women / etc.) ── */}
              {(!editingProduct && addStep === 1) && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Select Category *</label>
                    {inventoryCategories.length === 0 ? (
                      <p className="text-gray-500 text-sm">No categories found. Please create categories in Settings first.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {inventoryCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setFormData({ ...formData, category_id: cat.id })}
                            className={`px-5 py-4 rounded-xl text-sm font-semibold border-2 text-left transition-all duration-150 ${
                              formData.category_id === cat.id
                                ? 'bg-red-600 text-white border-red-600 shadow-md'
                                : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:bg-red-50'
                            }`}
                          >
                            {cat.name}
                            <span className="block text-xs font-normal mt-0.5 opacity-75">
                              {cat.types.filter(t => t.category_id === cat.id).length} product type{cat.types.filter(t => t.category_id === cat.id).length !== 1 ? 's' : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step 1 Footer */}
                  <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => { setShowAddModal(false); resetForm(); }}
                      className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!formData.category_id}
                      onClick={() => setAddStep(2)}
                      className="px-6 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      Next
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 2 (Add mode): Product Type + Code ── */}
              {(!editingProduct && addStep === 2) && (() => {
                const selectedCat = inventoryCategories.find(c => c.id === formData.category_id);
                const availableTypes = selectedCat?.types || [];
                return (
                <div className="space-y-6">
                  {/* Back to category */}
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <button type="button" onClick={() => setAddStep(1)} className="text-gray-400 hover:text-gray-600 transition-colors" title="Go back">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <div>
                      <p className="text-xs text-gray-500">Category</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedCat?.name || 'Unknown'}</p>
                    </div>
                  </div>

                  {/* Product Type grid */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Product Type *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {availableTypes.map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, name: type.name, available_sizes: [], rent_overrides: {} });
                          }}
                          className={`px-4 py-2.5 rounded-xl text-sm font-medium border-2 text-left transition-all duration-150 ${
                            formData.name === type.name
                              ? 'bg-red-600 text-white border-red-600 shadow-sm'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:bg-red-50'
                          }`}
                        >
                          {type.name}
                          {type.category_id === null && <span className="ml-1 text-xs opacity-60">(All)</span>}
                        </button>
                      ))}
                    </div>

                  </div>

                  {/* Product Code */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Product Code *</label>
                    <input
                      type="text"
                      value={formData.code}
                      disabled={!formData.name}
                      onChange={(e) => { const newCode = e.target.value.toUpperCase(); setFormData({ ...formData, code: newCode }); checkCodeDuplicate(newCode); }}
                      placeholder={formData.name ? 'e.g. SHR-001' : 'Select product type first'}
                      className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm font-medium bg-white focus:outline-none transition-colors ${
                        !formData.name ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
                          : codeCheckStatus === 'taken' ? 'border-red-400 focus:border-red-500 text-gray-900'
                            : codeCheckStatus === 'available' ? 'border-green-400 focus:border-green-500 text-gray-900'
                              : 'border-gray-300 focus:border-red-500 text-gray-900'
                      }`}
                    />
                    {codeCheckStatus === 'checking' && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        Checking code availability…
                      </p>
                    )}
                    {codeCheckStatus === 'taken' && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                        A product with this code already exists — cannot proceed.
                      </p>
                    )}
                    {codeCheckStatus === 'available' && formData.code.trim() && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-green-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        Code is available ✓
                      </p>
                    )}
                  </div>

                  {/* Step 2 Footer */}
                  <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                    <button type="button" onClick={() => setAddStep(1)} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors">Back</button>
                    <button
                      type="button"
                      disabled={!formData.name || !formData.code.trim() || codeCheckStatus === 'taken' || codeCheckStatus === 'checking' || codeCheckStatus === 'idle'}
                      onClick={() => setAddStep(3)}
                      className="px-6 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      Next
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
                );
              })()}

              {/* ── STEP 3 (Add) or full form (Edit) ── */}
              {(editingProduct || addStep === 3) && (
                <>
                  {/* Step 3 summary pill — back button */}
                  {!editingProduct && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <button
                        type="button"
                        onClick={() => setAddStep(2)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title="Go back"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <div>
                        <p className="text-xs text-gray-500">Category &middot; Product Type &amp; Code</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {inventoryCategories.find(c => c.id === formData.category_id)?.name || ''} &middot; {formData.name} &middot; <span className="font-mono">{formData.code}</span>
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Edit mode: product type select */}
                  {editingProduct && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product Type *</label>
                      <select
                        value={formData.name}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setFormData({ ...formData, name: newName, available_sizes: [], rent_overrides: {} });
                        }}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        {inventoryCategories.map((cat) => (
                          <optgroup key={cat.id ?? 'neutral'} label={cat.name}>
                            {(cat.types || []).map((type) => (
                              <option key={type.id} value={type.name}>{type.name}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}



                  {/* Edit mode: code field */}
                  {editingProduct && (
                    <div ref={codeInputRef} className="relative">
                      <Input
                        label="Product Code *"
                        value={formData.code}
                        onChange={(e) => {
                          const newCode = e.target.value.toUpperCase();
                          setFormData({ ...formData, code: newCode });
                          checkCodeDuplicate(newCode, editingProduct?.id);
                        }}
                        required
                        placeholder="e.g. SHR-001"
                      />
                      {codeCheckStatus === 'taken' && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-red-600">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          A product with this code already exists.
                        </p>
                      )}
                      {codeCheckStatus === 'available' && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-green-600">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Product code is available ✓
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Details grid (2 columns) ── */}
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <Input
                        label="Purchase Price (₹) *"
                        type="number"
                        step="1"
                        value={formData.purchase_price}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (isIntegerInput(val)) {
                            handlePurchasePriceChange(val);
                          }
                        }}
                        onKeyDown={integerKeyDown(
                          () => formData.purchase_price,
                          (v) => handlePurchasePriceChange(v)
                        )}
                        required
                        placeholder="Enter purchase price"
                      />
                      <p className="text-xs text-gray-500 mt-1">Rent auto-calculated</p>
                    </div>
                    <div>
                      <Input
                        label="Rent per Day (₹) *"
                        type="number"
                        step="100"
                        value={formData.rent}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (isIntegerInput(val)) {
                            setFormData({ ...formData, rent: val });
                          }
                        }}
                        onKeyDown={integerKeyDown(
                          () => formData.rent,
                          (v) => setFormData({ ...formData, rent: v }),
                          100
                        )}
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">Adjust by ₹100 increments</p>
                    </div>
                    <div>
                      <Input
                        label="Security Deposit (₹) *"
                        type="number"
                        step="100"
                        value={formData.security_deposit}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (isIntegerInput(val)) {
                            setFormData({ ...formData, security_deposit: val });
                          }
                        }}
                        onKeyDown={integerKeyDown(
                          () => formData.security_deposit,
                          (v) => setFormData({ ...formData, security_deposit: v }),
                          100
                        )}
                        onBlur={(e) => {
                          const value = e.target.value;
                          if (value && !isNaN(parseFloat(value))) {
                            const rounded = Math.round(parseFloat(value) / 100) * 100;
                            setFormData({ ...formData, security_deposit: rounded.toString() });
                          }
                        }}
                        required
                        placeholder="Enter security deposit"
                      />
                      <p className="text-xs text-gray-500 mt-1">Rounded to nearest ₹100</p>
                    </div>
                    <div>
                      <Input
                        label="Sub-Category (Optional)"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        placeholder="e.g., Formal, Casual"
                      />
                    </div>
                  </div>

                  {/* Sizes */}
                  {formData.name && (() => {
                    // Look up the selected product type from categories to get its size_type
                    const allTypes = inventoryCategories.flatMap(c => c.types || []);
                    const selectedTypeObj = allTypes.find(t => t.name === formData.name);
                    const sizeType = selectedTypeObj?.size_type;
                    // All dynamic types have size_type; if not found, no sizes
                    if (!sizeType || sizeType === 'none') return null;
                    const possibleSizes = getSizesForSizeType(sizeType);
                    if (possibleSizes.length === 0) return null;
                    const toggleSize = (sz: string) => {
                      const current = formData.available_sizes;
                      const next = current.includes(sz) ? current.filter(s => s !== sz) : [...current, sz];
                      const newOverrides = { ...formData.rent_overrides };
                      if (!next.includes(sz)) delete newOverrides[sz];
                      setFormData({ ...formData, available_sizes: next, rent_overrides: newOverrides });
                    };
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-semibold text-gray-700">
                            Available Sizes{formData.name !== 'Other' ? ' *' : ' (Optional)'}
                          </label>
                          <div className="flex gap-3">
                            <button type="button" onClick={() => setFormData({ ...formData, available_sizes: [...possibleSizes] })} className="text-xs text-blue-600 hover:text-blue-800">Select All</button>
                            <button type="button" onClick={() => setFormData({ ...formData, available_sizes: [], rent_overrides: {} })} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {possibleSizes.map(sz => {
                            const isSelected = formData.available_sizes.includes(sz);
                            return (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => toggleSize(sz)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all duration-150 ${isSelected ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-red-400 hover:text-red-600'}`}
                              >
                                {sz}
                              </button>
                            );
                          })}
                        </div>
                        {formData.available_sizes.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">{formData.available_sizes.length} size{formData.available_sizes.length > 1 ? 's' : ''} selected</p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Rent overrides */}
                  {formData.available_sizes.length > 0 && (
                    <div>
                      {!showRentOverrides ? (
                        <button type="button" onClick={() => setShowRentOverrides(true)} className="text-xs text-blue-600 hover:text-blue-800 underline">
                          Set different rent for specific sizes →
                        </button>
                      ) : (
                        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-semibold text-gray-700">Per-Size Rent Overrides</label>
                            <button type="button" onClick={() => { setShowRentOverrides(false); setFormData({ ...formData, rent_overrides: {} }); }} className="text-xs text-gray-500 hover:text-gray-700">Clear &amp; Hide</button>
                          </div>
                          <p className="text-xs text-gray-500">Only change sizes that differ from base rent (₹{formData.rent || 0}).</p>
                          <div className="grid grid-cols-3 gap-2">
                            {sortSizes(formData.available_sizes).map(sz => {
                              const overrideValue = formData.rent_overrides[sz];
                              const baseRent = parseInt(formData.rent) || 0;
                              return (
                                <div key={sz} className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-600 w-10 text-right">{sz}:</span>
                                  <input
                                    type="number"
                                    step="100"
                                    value={overrideValue ?? ''}
                                    placeholder={`₹${baseRent}`}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (isIntegerInput(val)) {
                                        const newOverrides = { ...formData.rent_overrides };
                                        if (val === '' || parseInt(val) === baseRent) delete newOverrides[sz];
                                        else newOverrides[sz] = parseInt(val);
                                        setFormData({ ...formData, rent_overrides: newOverrides });
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === '.' || e.key === 'e' || e.key === 'E') {
                                        e.preventDefault();
                                        return;
                                      }
                                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const current = overrideValue ?? baseRent;
                                        const next = e.key === 'ArrowUp' ? current + 100 : Math.max(0, current - 100);
                                        const newOverrides = { ...formData.rent_overrides };
                                        if (next === baseRent) delete newOverrides[sz];
                                        else newOverrides[sz] = next;
                                        setFormData({ ...formData, rent_overrides: newOverrides });
                                      }
                                    }}
                                    className={`w-20 px-2 py-1 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 ${overrideValue !== undefined ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Images */}
                  <MultipleImageUpload
                    value={formData.images.length > 0 ? formData.images : (formData.image ? formData.image : [])}
                    onChange={(images) => setFormData({ ...formData, images, image: images.length > 0 ? images[0] : '' })}
                    label="Product Images (Optional)"
                    maxImages={10}
                  />

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={3}
                    />
                  </div>

                  {/* Rental Policy Info */}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600">ℹ️</span>
                      <div>
                        <p className="text-sm font-semibold text-blue-900 mb-0.5">Rental Policy</p>
                        {formData.name === 'Fancy Costumes' ? (
                          <p className="text-xs text-blue-800"><strong>24-Hour Rental</strong> — duration calculated from bill generation time.</p>
                        ) : (
                          <p className="text-xs text-blue-800"><strong>3-Day Rental</strong> — standard policy for all products except Fancy Costumes.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Vendor Section */}
                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Vendor Information (Optional)</h3>
                    <div className="mb-3">
                      <VendorAutocomplete
                        label="Vendor Name"
                        value={vendorSearchQuery}
                        onChange={(val) => {
                          setVendorSearchQuery(val);
                          setVendorFormData(prev => ({ ...prev, name: val }));
                          if (selectedVendor && val !== selectedVendor.name) {
                            setSelectedVendor(null);
                            setFormData(prev => ({ ...prev, vendor_id: null }));
                          }
                        }}
                        onSelect={handleVendorSelect}
                      />
                    </div>
                    {selectedVendor && (
                      <div className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm bg-green-50 border-green-300 mb-3">
                        <span className="text-green-600">✓</span>
                        <span className="font-medium text-green-800">Existing vendor: {selectedVendor.name}</span>
                        <button type="button" onClick={() => { setSelectedVendor(null); setVendorSearchQuery(''); setVendorFormData({ name: '', phone: '', phone_country: 'IN', address: '', gst_number: '', pan_number: '', notes: '' }); setVendorFieldErrors({}); setFormData(prev => ({ ...prev, vendor_id: null })); }} className="ml-auto text-gray-400 hover:text-red-500 text-xs">✕ Clear</button>
                      </div>
                    )}
                    {vendorFormData.name.trim() && (
                      <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                        <PhoneInput
                          label="Phone"
                          value={vendorFormData.phone}
                          countryCode={vendorFormData.phone_country}
                          onValueChange={(v) => setVendorFormData({ ...vendorFormData, phone: v })}
                          onCountryCodeChange={(c) => setVendorFormData({ ...vendorFormData, phone_country: c, phone: '' })}
                          required
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            label="GST Number"
                            value={vendorFormData.gst_number}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                              if (val.length <= 15) {
                                setVendorFormData({ ...vendorFormData, gst_number: val });
                                if (!val) {
                                  setVendorFieldErrors((prev) => ({ ...prev, gst_number: undefined }));
                                } else if (!GST_REGEX.test(val)) {
                                  setVendorFieldErrors((prev) => ({ ...prev, gst_number: 'Format: 22AAAAA0000A1Z5 (15 chars)' }));
                                } else {
                                  setVendorFieldErrors((prev) => ({ ...prev, gst_number: undefined }));
                                }
                              }
                            }}
                            placeholder="22AAAAA0000A1Z5"
                            maxLength={15}
                            error={vendorFieldErrors.gst_number}
                          />
                          <Input
                            label="PAN Number"
                            value={vendorFormData.pan_number}
                            onChange={(e) => {
                              const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                              if (val.length <= 10) {
                                setVendorFormData({ ...vendorFormData, pan_number: val });
                                if (!val) {
                                  setVendorFieldErrors((prev) => ({ ...prev, pan_number: undefined }));
                                } else if (!PAN_REGEX.test(val)) {
                                  setVendorFieldErrors((prev) => ({ ...prev, pan_number: 'Format: ABCDE1234F (10 chars)' }));
                                } else {
                                  setVendorFieldErrors((prev) => ({ ...prev, pan_number: undefined }));
                                }
                              }
                            }}
                            placeholder="ABCDE1234F"
                            maxLength={10}
                            error={vendorFieldErrors.pan_number}
                          />
                        </div>
                        <Input label="Address" value={vendorFormData.address} onChange={(e) => setVendorFormData({ ...vendorFormData, address: e.target.value })} placeholder="Vendor address" />
                        <Input label="Notes" value={vendorFormData.notes} onChange={(e) => setVendorFormData({ ...vendorFormData, notes: e.target.value })} placeholder="Any notes about this vendor" />
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => { setShowAddModal(false); setEditingProduct(null); resetForm(); }}
                      className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <Button
                      type="submit"
                      disabled={!formData.name || codeCheckStatus === 'taken'}
                    >
                      {editingProduct ? 'Update Product' : 'Create Product'}
                    </Button>
                  </div>
                </>
              )}
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
              {/* Product Images - Carousel for Multiple Images */}
              {(() => {
                // Helper to get images array
                const getImages = (img: any): string[] => {
                  if (!img) return [];
                  if (Array.isArray(img)) return img;
                  // Try to parse as JSON array
                  if (typeof img === 'string' && img.startsWith('[')) {
                    try {
                      const parsed = JSON.parse(img);
                      if (Array.isArray(parsed)) return parsed;
                    } catch (e) {
                      // Not JSON, treat as single image
                    }
                  }
                  // Single image
                  return img ? [img] : [];
                };

                const images = getImages((viewingProduct as any).image);
                const imageUrls = images.map(img => getImageUrl(img)).filter(Boolean) as string[];

                if (imageUrls.length === 0) return null;

                if (imageUrls.length === 1) {
                  return (
                    <div className="flex justify-center">
                      <img
                        src={imageUrls[0]}
                        alt={viewingProduct.name}
                        className="w-64 h-64 object-contain rounded-lg border-2 border-gray-200 bg-white"
                      />
                    </div>
                  );
                }

                // Multiple images - show carousel
                return (
                  <div className="space-y-2">
                    <div className="flex justify-center relative">
                      <img
                        src={imageUrls[currentImageIndex >= imageUrls.length ? 0 : currentImageIndex]}
                        alt={`${viewingProduct.name} - Image ${(currentImageIndex >= imageUrls.length ? 0 : currentImageIndex) + 1}`}
                        className="w-64 h-64 object-contain rounded-lg border-2 border-gray-200 bg-white"
                      />
                      {imageUrls.length > 1 && (
                        <>
                          <button
                            onClick={() => setCurrentImageIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1))}
                            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 transition-opacity"
                            title="Previous image"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setCurrentImageIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-75 transition-opacity"
                            title="Next image"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                    {/* Image indicators */}
                    <div className="flex justify-center gap-2">
                      {imageUrls.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentImageIndex(index)}
                          className={`w-2 h-2 rounded-full transition-colors ${index === (currentImageIndex >= imageUrls.length ? 0 : currentImageIndex) ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                          title={`Image ${index + 1}`}
                        />
                      ))}
                    </div>
                    <p className="text-center text-sm text-gray-500">
                      Image {(currentImageIndex >= imageUrls.length ? 0 : currentImageIndex) + 1} of {imageUrls.length}
                    </p>
                  </div>
                );
              })()}

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
                    {viewingProduct.category_name || <span className="text-gray-400">N/A</span>}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Base Rent</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">₹{viewingProduct.rent}/day</p>
                </div>
              </div>

              {/* Available Sizes with Tracking */}
              {viewingProduct.available_sizes && viewingProduct.available_sizes.length > 0 && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Sizes & Tracking</p>
                  <div className="flex flex-wrap gap-2">
                    {sortSizes(viewingProduct.available_sizes).map(sz => {
                      const sizeMap = viewingProduct.size_tracking_map || {};
                      const ts = sizeMap[sz] || 'in_house';
                      const colorMap: Record<string, string> = {
                        in_house: 'bg-green-100 text-green-800 border-green-300',
                        picked_by_customer: 'bg-blue-100 text-blue-800 border-blue-300',
                        going_to_dry_clean: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                        alternation_related_work: 'bg-purple-100 text-purple-800 border-purple-300',
                        repair: 'bg-orange-100 text-orange-800 border-orange-300',
                        other_work: 'bg-gray-200 text-gray-800 border-gray-400',
                      };
                      const rentsBySize = viewingProduct.rents_by_size || {};
                      const sizeRent = rentsBySize[sz] ?? viewingProduct.rent;
                      const isOverridden = sizeRent !== viewingProduct.rent;
                      return (
                        <div key={sz} className={`inline-flex flex-col items-center px-3 py-1.5 rounded-lg border ${colorMap[ts] || colorMap['in_house']}`}>
                          <span className="text-sm font-semibold">{sz}</span>
                          <span className="text-[10px]">{TRACKING_STATUS_LABELS[ts as TrackingStatus] || ts}</span>
                          {isOverridden && <span className="text-[10px] font-medium">₹{sizeRent}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Purchase Price</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {(viewingProduct as any).purchase_price ? `₹${(viewingProduct as any).purchase_price}` : <span className="text-gray-400">-</span>}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Security Deposit</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">₹{viewingProduct.security_deposit || 0}</p>
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
                <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                <span
                  className={`inline-flex mt-1 px-2 py-1 text-xs font-semibold rounded-full ${viewingProduct.status === 'available'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                    }`}
                >
                  {viewingProduct.status === 'available' ? '✅ Available' : '🗃️ Archived'}
                </span>
              </div>
            </div>

            {/* Vendor Information */}
            {(viewingProduct as any).vendor_name && (
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Vendor</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{(viewingProduct as any).vendor_name}</p>
              </div>
            )}

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

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <QRScanner
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
        />
      )}

      {/* Product Tracking Modal */}
      {trackingProduct && (
        <ProductTrackingModal
          productId={trackingProduct.id}
          productCode={trackingProduct.code}
          size={trackingSize}
          onClose={() => {
            setTrackingProduct(null);
            setTrackingSize(null);
            // Refresh products to get updated size_tracking_map
            fetchProducts();
          }}
        />
      )}
      {/* Vendor Details Change Confirm Dialog */}
      {showVendorConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Update Vendor Details?</h3>
            <p className="text-sm text-gray-600 mb-4">
              You've changed some details for vendor "<strong>{selectedVendor?.name}</strong>". Do you want to update their record?
            </p>
            <div className="space-y-2 mb-6 bg-gray-50 rounded-lg p-3">
              {vendorConfirmDiff.map((d, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium text-gray-700">{d.field}:</span>{' '}
                  <span className="line-through text-red-500">{d.old}</span>
                  {' → '}
                  <span className="text-green-700 font-medium">{d.new}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  // Revert vendor form to saved values and stay on page
                  if (selectedVendor) {
                    setVendorFormData({
                      name: selectedVendor.name,
                      phone: selectedVendor.phone,
                      phone_country: selectedVendor.phone_country || 'IN',
                      address: selectedVendor.address || '',
                      gst_number: selectedVendor.gst_number || '',
                      pan_number: selectedVendor.pan_number || '',
                      notes: selectedVendor.notes || '',
                    });
                  }
                  setShowVendorConfirmDialog(false);
                  setPendingSubmitData(null);
                  toast.info('Vendor details reverted. Review and submit when ready.');
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Keep Old Details
              </button>
              <button
                onClick={async () => {
                  setShowVendorConfirmDialog(false);
                  try {
                    // Update vendor then submit product
                    if (selectedVendor) {
                      await vendorsApi.update(selectedVendor.id, {
                        name: vendorFormData.name.trim(),
                        phone: vendorFormData.phone.trim(),
                        phone_country: vendorFormData.phone_country,
                        address: vendorFormData.address.trim() || undefined,
                        gst_number: vendorFormData.gst_number.trim() || undefined,
                        pan_number: vendorFormData.pan_number.trim() || undefined,
                        notes: vendorFormData.notes.trim() || undefined,
                      });
                    }
                    if (pendingSubmitData) {
                      pendingSubmitData.vendor_id = selectedVendor?.id || null;
                      await submitProduct(pendingSubmitData);
                    }
                  } catch (error: any) {
                    handleSubmitError(error);
                  } finally {
                    setPendingSubmitData(null);
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Update & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

