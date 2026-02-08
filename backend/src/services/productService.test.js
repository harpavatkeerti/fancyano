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
    // Cleanup test products
    await pool.query(`DELETE FROM products WHERE code LIKE 'TEST-PROD-%'`);
  });

  describe('getProducts', () => {
    beforeEach(async () => {
      // Create test products
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category, availability)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-PROD-001', 'Test Product 1', 10000, 5000, 'test-category', true]
      );
      await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit, category, availability)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['TEST-PROD-002', 'Test Product 2', 20000, 10000, 'other-category', false]
      );
    });

    it('should get all products', async () => {
      const products = await productService.getProducts();
      
      expect(products.length).toBeGreaterThanOrEqual(2);
      expect(products.some(p => p.code === 'TEST-PROD-001')).toBe(true);
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

    it('should filter products by availability', async () => {
      const products = await productService.getProducts({ availability: true });
      
      expect(products.every(p => p.availability === true)).toBe(true);
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
    it('should create a product without images', async () => {
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
        availability: true
      };

      const product = await productService.createProduct(productData);
      
      expect(product.code).toBe('TEST-PROD-NEW-001');
      expect(product.name).toBe('Test New Product');
      expect(product.rent).toBe(10000);
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

  describe('deleteProduct', () => {
    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO products (code, name, rent, security_deposit)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['TEST-PROD-DEL-001', 'To Delete', 10000, 5000]
      );
      testProductId = result.rows[0].id;
    });

    it('should delete product', async () => {
      const result = await productService.deleteProduct(testProductId);
      
      expect(result.message).toBe('Product deleted successfully');
      
      // Verify deletion
      await expect(productService.getProductById(testProductId))
        .rejects
        .toThrow('Product not found');
    });

    it('should throw error for non-existent product', async () => {
      await expect(productService.deleteProduct(999999))
        .rejects
        .toThrow('Product not found');
    });
  });
});
