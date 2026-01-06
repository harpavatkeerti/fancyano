
const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const imageStorage = require('../services/imageStorage');

// GET all products
router.get('/', async (req, res) => {
  try {
    const { search, category, availability } = req.query;
    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(category);
    }

    if (availability !== undefined) {
      paramCount++;
      query += ` AND availability = $${paramCount}`;
      params.push(availability === 'true');
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    
    // Parse image data if it's JSON array
    const products = result.rows.map(product => {
      if (product.image) {
        // Check if it's a JSON string array
        if (typeof product.image === 'string' && product.image.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(product.image);
            if (Array.isArray(parsed)) {
              product.image = parsed;
              console.log(`📦 Product ${product.code} has ${parsed.length} images:`, parsed);
            }
          } catch (e) {
            console.warn(`⚠️ Failed to parse image JSON for product ${product.code}:`, e.message);
            // If parsing fails, keep as is
          }
        }
      }
      return product;
    });
    
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Parse image data if it's JSON array
    const product = result.rows[0];
    if (product.image) {
      // Check if it's a JSON string array
      if (typeof product.image === 'string' && product.image.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(product.image);
          if (Array.isArray(parsed)) {
            product.image = parsed;
            console.log(`📦 Product ${product.code} (ID: ${product.id}) has ${parsed.length} images:`, parsed);
          }
        } catch (e) {
          console.warn(`⚠️ Failed to parse image JSON for product ${product.code}:`, e.message);
          // If parsing fails, keep as is
        }
      }
    }
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST create product
router.post('/', async (req, res) => {
  try {
    const { name, code, purchase_price, rent_per_day, security_deposit, category, gender, size, description, availability, image, images } = req.body;
    
    console.log('📥 Received product creation request:');
    console.log('   Name:', name);
    console.log('   Code:', code);
    console.log('   Purchase Price:', purchase_price);
    console.log('   Rent per Day:', rent_per_day);
    console.log('   Security Deposit:', security_deposit);
    console.log('   Category:', category);
    console.log('   Gender:', gender);
    console.log('   Size:', size);
    console.log('   Has Image:', image ? 'Yes' : 'No');
    console.log('   Has Images (array):', images ? `Yes (${Array.isArray(images) ? images.length : 'not array'})` : 'No');
    
    if (!name || !code || !rent_per_day || security_deposit === undefined || security_deposit === null) {
      return res.status(400).json({ error: 'Name, code, rent_per_day, and security_deposit are required' });
    }

    // Determine rental policy based on product type
    // Fancy Costumes: 24 hours rental
    // All other categories: 3 days rental (default)
    const rental_policy = name === 'Fancy Costumes' ? '24_hours' : '3_days';

    // Process images - support both single image (backward compat) and multiple images
    let imageData = null;
    
    // If images array is provided, process multiple images
    if (images && Array.isArray(images) && images.length > 0) {
      console.log(`📸 Processing ${images.length} images for product ${code}`);
      const imageUrls = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img && img.startsWith('data:image')) {
          // Add small delay to ensure unique timestamps (1ms per image)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 10)); // Increased to 10ms for better uniqueness
          }
          // Log first 50 chars of base64 to check if images are different
          const imgPreview = img.substring(0, 50);
          console.log(`   Image ${i + 1}: ${imgPreview}...`);
          const imageUrl = await imageStorage.saveImage(img, code);
          console.log(`   ✅ Saved as: ${imageUrl}`);
          imageUrls.push(imageUrl);
        } else if (img && typeof img === 'string') {
          // Already a URL/path, keep it
          console.log(`   Image ${i + 1}: Already a URL: ${img}`);
          imageUrls.push(img);
        }
      }
      console.log(`📦 Final image URLs array:`, imageUrls);
      // Store as JSON array
      imageData = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null;
      console.log(`💾 Storing as JSON: ${imageData ? imageData.substring(0, 100) + '...' : 'null'}`);
    } 
    // If single image is provided (backward compatibility)
    else if (image) {
      if (image.startsWith('data:image')) {
        const imageUrl = await imageStorage.saveImage(image, code);
        imageData = imageUrl;
      } else if (typeof image === 'string') {
        // Already a URL/path
        imageData = image;
      }
    }

    const result = await pool.query(
      'INSERT INTO products (name, code, purchase_price, rent_per_day, security_deposit, rental_policy, category, gender, size, description, availability, image) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *',
      [name, code, purchase_price || null, rent_per_day, security_deposit || 0, rental_policy, category || null, gender || null, size || null, description || null, availability !== undefined ? availability : true, imageData]
    );

    // Parse image data if it's JSON array for response
    const product = result.rows[0];
    if (product.image && product.image.startsWith('[')) {
      try {
        product.image = JSON.parse(product.image);
      } catch (e) {
        // If parsing fails, keep as is
      }
    }

    res.status(201).json(product);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Product code already exists' });
    }
    console.error('❌ Error creating product:', error);
    console.error('   Error code:', error.code);
    console.error('   Error message:', error.message);
    console.error('   Error detail:', error.detail);
    res.status(500).json({ error: 'Failed to create product', details: error.message });
  }
});

// PUT update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, purchase_price, rent_per_day, security_deposit, category, gender, size, description, availability, image, images } = req.body;

    if (security_deposit === undefined || security_deposit === null) {
      return res.status(400).json({ error: 'security_deposit is required' });
    }

    // Determine rental policy based on product type
    const rental_policy = name === 'Fancy Costumes' ? '24_hours' : '3_days';

    // Get existing product to check for old images
    const existingProduct = await pool.query('SELECT image FROM products WHERE id = $1', [id]);
    
    if (existingProduct.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let imageData = image || null;

    // If images array is provided, process multiple images
    if (images && Array.isArray(images) && images.length > 0) {
      // Delete old images if they exist
      const oldImage = existingProduct.rows[0].image;
      if (oldImage) {
        try {
          // Try to parse as JSON array
          const oldImages = JSON.parse(oldImage);
          if (Array.isArray(oldImages)) {
            for (const oldImg of oldImages) {
              if (oldImg && oldImg.startsWith('/uploads/')) {
                await imageStorage.deleteImage(oldImg);
              }
            }
          } else if (typeof oldImage === 'string' && oldImage.startsWith('/uploads/')) {
            await imageStorage.deleteImage(oldImage);
          }
        } catch (e) {
          // If not JSON, treat as single image
          if (oldImage && oldImage.startsWith('/uploads/')) {
            await imageStorage.deleteImage(oldImage);
          }
        }
      }

      // Process new images
      const imageUrls = [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img && img.startsWith('data:image')) {
          // Add small delay to ensure unique timestamps (1ms per image)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          const imageUrl = await imageStorage.saveImage(img, code);
          imageUrls.push(imageUrl);
        } else if (img && typeof img === 'string') {
          // Already a URL/path, keep it
          imageUrls.push(img);
        }
      }
      // Store as JSON array
      imageData = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null;
    } 
    // If single image is provided (backward compatibility)
    else if (image) {
      // Delete old images if they exist
      const oldImage = existingProduct.rows[0].image;
      if (oldImage) {
        try {
          // Try to parse as JSON array
          const oldImages = JSON.parse(oldImage);
          if (Array.isArray(oldImages)) {
            for (const oldImg of oldImages) {
              if (oldImg && oldImg.startsWith('/uploads/')) {
                await imageStorage.deleteImage(oldImg);
              }
            }
          } else if (typeof oldImage === 'string' && oldImage.startsWith('/uploads/')) {
            await imageStorage.deleteImage(oldImage);
          }
        } catch (e) {
          // If not JSON, treat as single image
      if (oldImage && oldImage.startsWith('/uploads/')) {
        await imageStorage.deleteImage(oldImage);
      }
        }
      }

      if (image.startsWith('data:image')) {
        imageData = await imageStorage.saveImage(image, code);
      } else if (typeof image === 'string') {
        // Already a URL/path
        imageData = image;
      }
    }

    const result = await pool.query(
      'UPDATE products SET name = $1, code = $2, purchase_price = $3, rent_per_day = $4, security_deposit = $5, rental_policy = $6, category = $7, gender = $8, size = $9, description = $10, availability = $11, image = $12, updated_at = CURRENT_TIMESTAMP WHERE id = $13 RETURNING *',
      [name, code, purchase_price, rent_per_day, security_deposit || 0, rental_policy, category, gender, size, description, availability, imageData, id]
    );

    // Parse image data if it's JSON array for response
    const product = result.rows[0];
    if (product.image && product.image.startsWith('[')) {
      try {
        product.image = JSON.parse(product.image);
      } catch (e) {
        // If parsing fails, keep as is
      }
    }

    res.json(product);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Product code already exists' });
    }
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete associated images if exist
    const deletedProduct = result.rows[0];
    if (deletedProduct.image) {
      try {
        // Try to parse as JSON array
        const images = JSON.parse(deletedProduct.image);
        if (Array.isArray(images)) {
          for (const img of images) {
            if (img && img.startsWith('/uploads/')) {
              await imageStorage.deleteImage(img);
            }
          }
        } else if (typeof deletedProduct.image === 'string' && deletedProduct.image.startsWith('/uploads/')) {
          await imageStorage.deleteImage(deletedProduct.image);
        }
      } catch (e) {
        // If not JSON, treat as single image
    if (deletedProduct.image && deletedProduct.image.startsWith('/uploads/')) {
      await imageStorage.deleteImage(deletedProduct.image);
        }
      }
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;

