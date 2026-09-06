const pool = require('../database/connection');
const measurementTemplatesService = require('./measurementTemplatesService');

describe('MeasurementTemplatesService', () => {
  const prefix = 'jest_mts_';
  let createdIds = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await pool.query('DELETE FROM measurement_templates WHERE id = $1', [id]);
    }
    await pool.query("DELETE FROM measurement_templates WHERE name LIKE $1", [`${prefix}%`]);
  });

  describe('create', () => {
    test('should create a template with valid fields', async () => {
      const result = await measurementTemplatesService.create(
        `${prefix}Svc Create`,
        [{ key: 'waist', label: 'Waist' }]
      );
      createdIds.push(result.id);
      expect(result.name).toBe(`${prefix}Svc Create`);
      expect(result.fields).toEqual([{ key: 'waist', label: 'Waist' }]);
    });

    test('should reject empty name', async () => {
      await expect(
        measurementTemplatesService.create('', [{ key: 'x', label: 'X' }])
      ).rejects.toThrow('Template name is required');
    });

    test('should reject non-array fields', async () => {
      await expect(
        measurementTemplatesService.create(`${prefix}Bad`, 'not-an-array')
      ).rejects.toThrow('Fields must be an array');
    });

    test('should reject field without key', async () => {
      await expect(
        measurementTemplatesService.create(`${prefix}NoKey`, [{ label: 'Only Label' }])
      ).rejects.toThrow('Each field must have a "key" and "label"');
    });

    test('should reject field without label', async () => {
      await expect(
        measurementTemplatesService.create(`${prefix}NoLabel`, [{ key: 'only_key' }])
      ).rejects.toThrow('Each field must have a "key" and "label"');
    });

    test('should reject duplicate name', async () => {
      const name = `${prefix}Dupe`;
      const first = await measurementTemplatesService.create(name, [{ key: 'a', label: 'A' }]);
      createdIds.push(first.id);
      await expect(
        measurementTemplatesService.create(name, [{ key: 'b', label: 'B' }])
      ).rejects.toThrow('already exists');
    });

    test('should auto-assign display_order if not provided', async () => {
      const result = await measurementTemplatesService.create(
        `${prefix}AutoOrder`,
        [{ key: 'x', label: 'X' }]
      );
      createdIds.push(result.id);
      expect(result.display_order).toBeGreaterThan(0);
    });
  });

  describe('getAll', () => {
    test('should return active templates', async () => {
      const result = await measurementTemplatesService.getAll();
      expect(Array.isArray(result)).toBe(true);
      // All returned should be active
      result.forEach(t => expect(t.is_active).toBe(true));
    });
  });

  describe('getById', () => {
    test('should return a template by ID', async () => {
      const created = await measurementTemplatesService.create(
        `${prefix}GetById`,
        [{ key: 'h', label: 'Height' }]
      );
      createdIds.push(created.id);

      const result = await measurementTemplatesService.getById(created.id);
      expect(result.name).toBe(`${prefix}GetById`);
    });

    test('should throw 404 for non-existent ID', async () => {
      await expect(
        measurementTemplatesService.getById(999999)
      ).rejects.toThrow('not found');
    });
  });

  describe('update', () => {
    test('should update name and fields', async () => {
      const created = await measurementTemplatesService.create(
        `${prefix}UpdateSvc`,
        [{ key: 'a', label: 'A' }]
      );
      createdIds.push(created.id);

      const updated = await measurementTemplatesService.update(created.id, {
        name: `${prefix}Updated Svc`,
        fields: [{ key: 'b', label: 'B' }],
      });
      expect(updated.name).toBe(`${prefix}Updated Svc`);
      expect(updated.fields).toEqual([{ key: 'b', label: 'B' }]);
    });

    test('should reject update with no fields', async () => {
      const created = await measurementTemplatesService.create(
        `${prefix}UpdateEmpty`,
        [{ key: 'a', label: 'A' }]
      );
      createdIds.push(created.id);

      await expect(
        measurementTemplatesService.update(created.id, {})
      ).rejects.toThrow('No fields to update');
    });
  });

  describe('delete', () => {
    test('should soft-delete a template', async () => {
      const created = await measurementTemplatesService.create(
        `${prefix}DeleteSvc`,
        [{ key: 'z', label: 'Z' }]
      );
      createdIds.push(created.id);

      const result = await measurementTemplatesService.delete(created.id);
      expect(result.message).toContain('deleted');

      // Should not appear in getAll
      const all = await measurementTemplatesService.getAll();
      const found = all.find(t => t.id === created.id);
      expect(found).toBeUndefined();
    });

    test('should block delete when product types reference it', async () => {
      const template = await measurementTemplatesService.create(
        `${prefix}BlockDelete`,
        [{ key: 'x', label: 'X' }]
      );
      createdIds.push(template.id);

      // Create a product category and type referencing this template
      const catResult = await pool.query(
        "INSERT INTO product_categories (name) VALUES ($1) RETURNING id",
        [`${prefix}Cat`]
      );
      const catId = catResult.rows[0].id;

      const typeResult = await pool.query(
        "INSERT INTO product_types (name, category_id, size_type, measurement_template_id) VALUES ($1, $2, 'standard', $3) RETURNING id",
        [`${prefix}Type`, catId, template.id]
      );
      const typeId = typeResult.rows[0].id;

      await expect(
        measurementTemplatesService.delete(template.id)
      ).rejects.toThrow('Cannot delete');

      // Clean up
      await pool.query('DELETE FROM product_types WHERE id = $1', [typeId]);
      await pool.query('DELETE FROM product_categories WHERE id = $1', [catId]);
    });
  });
});
