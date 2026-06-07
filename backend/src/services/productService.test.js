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
    await pool.query(`DELETE FROM bookings WHERE customer_phone = '9999999999' OR customer_phone LIKE '999999999%'`);
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
        size: 'M',
        description: 'Test description',
      };

      const product = await productService.createProduct(productData);

      expect(product.code).toBe('TEST-PROD-NEW-001');
      expect(product.name).toBe('Test New Product');
      expect(product.rent).toBe(10000);
      expect(product.status).toBe('available');
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

    it('should throw error for duplicate product code', async () => {
      const productData = {
        name: 'Test Product',
        code: 'TEST-PROD-DUP',
        rent: 10000,
        security_deposit: 5000
      };

      await productService.createProduct(productData);

      await expect(productService.createProduct(productData))
        .rejects
        .toThrow();
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
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, status)
         VALUES ($1, $2, CURRENT_DATE, $3)
         RETURNING id`,
        ['Test Customer', '9999999999', 'confirmed']
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
        `INSERT INTO bookings (customer_name, customer_phone, booking_date, status)
         VALUES ($1, $2, CURRENT_DATE, $3)
         RETURNING id`,
        ['Test Customer', '9999999999', 'cancelled']
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
