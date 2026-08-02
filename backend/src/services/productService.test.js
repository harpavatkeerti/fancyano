const productService = require('./productService');
const pool = require('../database/connection');
const imageStorage = require('./imageStorage');

// Mock imageStorage
jest.mock('./imageStorage');

describe('ProductService', () => {
  let testProductId;

  beforeAll(async () => {
    // Setup mock
    imageStorage.saveImage.mockResolvedValue('/uploads/test-image.jpg');
    imageStorage.deleteImage.mockResolvedValue(true);
  });

  afterAll(async () => {
    // pool.end() handled by global teardown
  });

  afterEach(async () => {
    // Cleanup test products (cascade deletes booking_products)
    await pool.query(`DELETE FROM booking_products WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = 1 AND status IN ('confirmed','cancelled'))`);
    await pool.query(`DELETE FROM bookings WHERE user_id = 1 AND status IN ('confirmed','cancelled')`);
    await pool.query(`DELETE FROM products WHERE code LIKE 'TEST-PROD-%'`);
  });

  describe('getProducts', () => {
    beforeEach(async () => {
      // Create test products: one available, one archived
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-PROD-001', 'Test Product 1', 10000, 5000, 'test-category', 'available']
      );
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-PROD-002', 'Test Product 2', 20000, 10000, 'other-category', 'archived']
      );
    });

    it('should only return available products by default', async () => {
      const products = await productService.getProducts();

      expect(products.some(p => p.code === 'TEST-PROD-001')).toBe(true);
      expect(products.some(p => p.code === 'TEST-PROD-002')).toBe(false);
      expect(products.every(p => p.status === 'available')).toBe(true);
    });

    it('should return all products including archived when includeArchived=true', async () => {
      const products = await productService.getProducts({ includeArchived: true });

      expect(products.some(p => p.code === 'TEST-PROD-001')).toBe(true);
      expect(products.some(p => p.code === 'TEST-PROD-002')).toBe(true);
    });

    it('should filter products by search term', async () => {
      const products = await productService.getProducts({ search: 'TEST-PROD-001' });

      expect(products.length).toBeGreaterThanOrEqual(1);
      expect(products[0].code).toBe('TEST-PROD-001');
    });

    it('should filter products by category', async () => {
      const products = await productService.getProducts({ category: 'test-category' });

      expect(products.length).toBeGreaterThanOrEqual(1);
      expect(products.every(p => p.category === 'test-category')).toBe(true);
    });

    it('should include vendor_name via LEFT JOIN', async () => {
      const vendorRes = await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-PROD-LISTVENDOR', '9988776655']
      );
      const vendorId = vendorRes.rows[0].id;

      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, vendor_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-PROD-WITH-V', 'Product With Vendor', 10000, 5000, vendorId, 'available']
      );

      const products = await productService.getProducts({ search: 'TEST-PROD-WITH-V' });
      expect(products.length).toBeGreaterThanOrEqual(1);
      expect(products[0].vendor_name).toBe('TEST-PROD-LISTVENDOR');

      // Cleanup
      await pool.query(`DELETE FROM products WHERE code = 'TEST-PROD-WITH-V'`);
      await pool.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
    });

    it('should return null vendor_name when product has no vendor', async () => {
      const products = await productService.getProducts({ search: 'TEST-PROD-001' });
      expect(products.length).toBeGreaterThanOrEqual(1);
      expect(products[0].vendor_name).toBeNull();
    });

    it('should return size_tracking_map with sized tracking records', async () => {
      // Get the product id for TEST-PROD-001
      const prodRes = await pool.query(`SELECT id FROM products WHERE code = 'TEST-PROD-001'`);
      const prodId = prodRes.rows[0].id;

      // Insert tracking records with sizes
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status, size)
         VALUES ($1, 'TEST-PROD-001', 'repair', 'M'), ($1, 'TEST-PROD-001', 'going_to_dry_clean', 'L')`,
        [prodId]
      );

      const products = await productService.getProducts({ search: 'TEST-PROD-001' });
      expect(products.length).toBeGreaterThanOrEqual(1);
      const map = products[0].size_tracking_map;
      expect(map).toBeDefined();
      expect(map['M']).toBe('repair');
      expect(map['L']).toBe('going_to_dry_clean');

      // Cleanup tracking
      await pool.query(`DELETE FROM product_tracking WHERE product_id = $1`, [prodId]);
    });

    it('should use _ key for sizeless (NULL) tracking records via COALESCE', async () => {
      const prodRes = await pool.query(`SELECT id FROM products WHERE code = 'TEST-PROD-001'`);
      const prodId = prodRes.rows[0].id;

      // Insert a tracking record with NULL size
      await pool.query(
        `INSERT INTO product_tracking (product_id, product_code, tracking_status, size)
         VALUES ($1, 'TEST-PROD-001', 'going_to_dry_clean', NULL)`,
        [prodId]
      );

      const products = await productService.getProducts({ search: 'TEST-PROD-001' });
      expect(products.length).toBeGreaterThanOrEqual(1);
      const map = products[0].size_tracking_map;
      expect(map).toBeDefined();
      expect(map['_']).toBe('going_to_dry_clean');

      // Cleanup tracking
      await pool.query(`DELETE FROM product_tracking WHERE product_id = $1`, [prodId]);
    });

    it('should return null size_tracking_map when no tracking records exist', async () => {
      const products = await productService.getProducts({ search: 'TEST-PROD-001' });
      expect(products.length).toBeGreaterThanOrEqual(1);
      expect(products[0].size_tracking_map).toBeNull();
    });
  });

  describe('getProductById', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['TEST-PROD-003', 'Test Product 3', 15000, 7500]
      );
      testProductId = result.rows[0].id;
    });

    it('should get product by id', async () => {
      const product = await productService.getProductById(testProductId);

      expect(product.id).toBe(testProductId);
      expect(product.code).toBe('TEST-PROD-003');
      expect(product.name).toBe('Test Product 3');
    });

    it('should throw error for non-existent product', async () => {
      await expect(productService.getProductById(999999))
        .rejects
        .toThrow('Product not found');
    });
  });

  describe('createProduct', () => {
    it('should create a product with status=available by default', async () => {
      const productData = {
        name: 'Test New Product',
        code: 'TEST-PROD-NEW-001',
        purchase_price: 50000,
        rent: 10000,
        security_deposit: 5000,
        category: 'test',
        gender: 'unisex',
        available_sizes: ['M'],
        description: 'Test description',
      };

      const product = await productService.createProduct(productData);

      expect(product.code).toBe('TEST-PROD-NEW-001');
      expect(product.name).toBe('Test New Product');
      expect(product.rent).toBe(10000);
      expect(product.status).toBe('available');
      expect(product.available_sizes).toEqual(['M']);
    });

    it('should create a product with image', async () => {
      const productData = {
        name: 'Test Product With Image',
        code: 'TEST-PROD-IMG-001',
        rent: 10000,
        security_deposit: 5000,
        image: 'data:image/png;base64,test'
      };

      const product = await productService.createProduct(productData);

      expect(imageStorage.saveImage).toHaveBeenCalled();
      expect(product.image).toBe('/uploads/test-image.jpg');
    });

    it('should throw DUPLICATE_CODE error when code matches', async () => {
      const productData = {
        name: 'Test Product',
        code: 'TEST-PROD-DUP',
        available_sizes: ['M'],
        rent: 10000,
        security_deposit: 5000
      };

      await productService.createProduct(productData);

      const err = await productService.createProduct({
        name: 'Test Product',
        code: 'TEST-PROD-DUP',
        available_sizes: ['L'],
        rent: 10000,
        security_deposit: 5000
      }).catch(e => e);
      expect(err.code).toBe('DUPLICATE_CODE');
    });

    it('should throw DUPLICATE_CODE error for sizeless duplicate', async () => {
      await productService.createProduct({
        name: 'Test Product',
        code: 'TEST-PROD-DUP-NULLSIZE',
        available_sizes: null,
        rent: 10000,
        security_deposit: 5000
      });

      const err = await productService.createProduct({
        name: 'Test Product',
        code: 'TEST-PROD-DUP-NULLSIZE',
        available_sizes: null,
        rent: 10000,
        security_deposit: 5000
      }).catch(e => e);
      expect(err.code).toBe('DUPLICATE_CODE');
    });

    it('should create a product with available_sizes array', async () => {
      const product = await productService.createProduct({
        name: 'Test Multi Size',
        code: 'TEST-PROD-MULTI-SZ',
        available_sizes: ['S', 'M', 'L', 'XL'],
        rent: 10000,
        security_deposit: 5000
      });

      expect(product.available_sizes).toEqual(['S', 'M', 'L', 'XL']);
      expect(product.rents_by_size).toEqual({ S: 10000, M: 10000, L: 10000, XL: 10000 });
    });

    it('should create a product with rent_overrides and compute rents_by_size', async () => {
      const product = await productService.createProduct({
        name: 'Test Override',
        code: 'TEST-PROD-OVERRIDE',
        available_sizes: ['36', '38', '44'],
        rent: 1200,
        rent_overrides: { '44': 1500 },
        security_deposit: 5000
      });

      expect(product.rents_by_size).toEqual({ '36': 1200, '38': 1200, '44': 1500 });
      // rent_overrides should NOT be in the response
      expect(product.rent_overrides).toBeUndefined();
    });

    it('should create a sizeless product with null available_sizes', async () => {
      const product = await productService.createProduct({
        name: 'Test Jewellery',
        code: 'TEST-PROD-JEWEL',
        available_sizes: null,
        rent: 5000,
        security_deposit: 2000
      });

      expect(product.available_sizes).toBeNull();
      expect(product.rents_by_size).toBeNull();
    });

    it('should create a product linked to a vendor', async () => {
      // Create a vendor first
      const vendorRes = await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-PROD-VENDOR', '1234567890']
      );
      const vendorId = vendorRes.rows[0].id;

      const product = await productService.createProduct({
        name: 'Test Product',
        code: 'TEST-PROD-WITH-VENDOR',
        rent: 10000,
        security_deposit: 5000,
        vendor_id: vendorId,
      });

      expect(product.vendor_id).toBe(vendorId);

      // Cleanup vendor
      await pool.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
    });
  });

  describe('updateProduct', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['TEST-PROD-UPD-001', 'Original Name', 10000, 5000]
      );
      testProductId = result.rows[0].id;
    });

    it('should update product details', async () => {
      const updateData = {
        name: 'Updated Name',
        code: 'TEST-PROD-UPD-001',
        rent: 15000,
        security_deposit: 7500,
        category: 'updated-category'
      };

      const product = await productService.updateProduct(testProductId, updateData);

      expect(product.name).toBe('Updated Name');
      expect(product.rent).toBe(15000);
      expect(product.category).toBe('updated-category');
    });

    it('should update available_sizes to add a new size', async () => {
      // First set initial sizes
      await productService.updateProduct(testProductId, {
        name: 'Original Name',
        code: 'TEST-PROD-UPD-001',
        rent: 10000,
        security_deposit: 5000,
        available_sizes: ['36', '38'],
      });

      // Now add a size
      const product = await productService.updateProduct(testProductId, {
        name: 'Original Name',
        code: 'TEST-PROD-UPD-001',
        rent: 10000,
        security_deposit: 5000,
        available_sizes: ['36', '38', '40'],
      });

      expect(product.available_sizes).toEqual(['36', '38', '40']);
      expect(product.rents_by_size).toEqual({ '36': 10000, '38': 10000, '40': 10000 });
    });

    it('should update rent_overrides and reflect in rents_by_size', async () => {
      const product = await productService.updateProduct(testProductId, {
        name: 'Original Name',
        code: 'TEST-PROD-UPD-001',
        rent: 1200,
        security_deposit: 5000,
        available_sizes: ['36', '38', '44'],
        rent_overrides: { '44': 1500 },
      });

      expect(product.rents_by_size).toEqual({ '36': 1200, '38': 1200, '44': 1500 });
      expect(product.rent_overrides).toBeUndefined();
    });

    it('should update vendor_id on a product', async () => {
      const vendorRes = await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-PROD-UPD-VENDOR', '9876543210']
      );
      const vendorId = vendorRes.rows[0].id;

      const product = await productService.updateProduct(testProductId, {
        name: 'Updated Name',
        code: 'TEST-PROD-UPD-001',
        rent: 15000,
        security_deposit: 7500,
        vendor_id: vendorId,
      });

      expect(product.vendor_id).toBe(vendorId);

      // Cleanup vendor
      await pool.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
    });

    it('should allow clearing vendor_id (set to null)', async () => {
      // First assign a vendor
      const vendorRes = await pool.query(
        `INSERT INTO vendors (name, phone) VALUES ($1, $2) RETURNING id`,
        ['TEST-PROD-UPD-VENDOR2', '1111222233']
      );
      const vendorId = vendorRes.rows[0].id;
      await pool.query(`UPDATE products SET vendor_id = $1 WHERE id = $2`, [vendorId, testProductId]);

      // Now clear the vendor
      const product = await productService.updateProduct(testProductId, {
        name: 'Updated Name',
        code: 'TEST-PROD-UPD-001',
        rent: 15000,
        security_deposit: 7500,
        vendor_id: null,
      });

      expect(product.vendor_id).toBeNull();

      // Cleanup vendor
      await pool.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
    });

    it('should throw error if security_deposit is missing', async () => {
      const updateData = {
        name: 'Updated Name',
        code: 'TEST-PROD-UPD-001',
        rent: 15000
        // Missing security_deposit
      };

      await expect(productService.updateProduct(testProductId, updateData))
        .rejects
        .toThrow('security_deposit is required');
    });

    it('should throw error for non-existent product', async () => {
      const updateData = {
        name: 'Updated Name',
        code: 'TEST-PROD-UPD-001',
        rent: 15000,
        security_deposit: 7500
      };

      await expect(productService.updateProduct(999999, updateData))
        .rejects
        .toThrow('Product not found');
    });
  });

  describe('archiveProduct', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-PROD-ARCH-001', 'To Archive', 10000, 5000, 'available']
      );
      testProductId = result.rows[0].id;
    });

    it('should archive an available product with no active bookings', async () => {
      const product = await productService.archiveProduct(testProductId);

      expect(product.status).toBe('archived');
    });

    it('should throw error for non-existent product', async () => {
      await expect(productService.archiveProduct(999999))
        .rejects
        .toThrow('Product not found');
    });

    it('should throw error if product is already archived', async () => {
      await productService.archiveProduct(testProductId);

      await expect(productService.archiveProduct(testProductId))
        .rejects
        .toThrow('Product is already archived');
    });

    it('should block archiving when product has an active booking', async () => {
      const bookingResult = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status)
         VALUES (1, CURRENT_DATE, $1)
         RETURNING id`,
        ['confirmed']
      );
      const bookingId = bookingResult.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [bookingId, testProductId, '2025-01-01', '2025-01-03', 'confirmed', 10000, 5000, 10000]
      );

      await expect(productService.archiveProduct(testProductId))
        .rejects
        .toThrow('Cannot archive this product because it has active bookings');
    });

    it('should allow archiving when bookings are cancelled or completed', async () => {
      const bookingResult = await pool.query(
        `INSERT INTO bookings (user_id, booking_date, status)
         VALUES (1, CURRENT_DATE, $1)
         RETURNING id`,
        ['cancelled']
      );
      const bookingId = bookingResult.rows[0].id;

      await pool.query(
        `INSERT INTO booking_products (booking_id, product_id, booked_from, booked_to, status, rent, security_deposit, effective_rent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [bookingId, testProductId, '2025-01-01', '2025-01-03', 'cancelled', 10000, 5000, 10000]
      );

      const product = await productService.archiveProduct(testProductId);
      expect(product.status).toBe('archived');
    });
  });

  describe('restoreProduct', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        ['TEST-PROD-REST-001', 'To Restore', 10000, 5000, 'archived']
      );
      testProductId = result.rows[0].id;
    });

    it('should restore an archived product to available', async () => {
      const product = await productService.restoreProduct(testProductId);

      expect(product.status).toBe('available');
    });

    it('should throw error for non-existent product', async () => {
      await expect(productService.restoreProduct(999999))
        .rejects
        .toThrow('Product not found');
    });

    it('should throw error if product is already available', async () => {
      await productService.restoreProduct(testProductId);

      await expect(productService.restoreProduct(testProductId))
        .rejects
        .toThrow('Product is already available');
    });
  });
});
