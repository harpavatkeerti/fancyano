const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = { role: 'admin', id: 'test-admin', name: 'jest_mt_admin' };
  next();
});
app.use('/measurement-templates', require('./measurementTemplates'));

describe('Measurement Templates Routes', () => {
  const prefix = 'jest_mt_';
  let createdIds = [];

  afterAll(async () => {
    // Clean up test templates
    for (const id of createdIds) {
      await pool.query('DELETE FROM measurement_templates WHERE id = $1', [id]);
    }
    await pool.query("DELETE FROM measurement_templates WHERE name LIKE $1", [`${prefix}%`]);
  });

  describe('GET /measurement-templates', () => {
    test('should list all active measurement templates', async () => {
      const response = await request(app).get('/measurement-templates');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /measurement-templates', () => {
    test('should create a new measurement template', async () => {
      const templateData = {
        name: `${prefix}Test Template`,
        fields: [
          { key: 'waist', label: 'Waist (in inches)' },
          { key: 'bust', label: 'Bust (in inches)', group: 'Upper Body' },
        ],
      };

      const response = await request(app)
        .post('/measurement-templates')
        .send(templateData);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(templateData.name);
      expect(response.body.fields).toEqual(templateData.fields);
      expect(response.body.id).toBeDefined();
      createdIds.push(response.body.id);
    });

    test('should reject duplicate name', async () => {
      const templateData = {
        name: `${prefix}Dupe Template`,
        fields: [{ key: 'x', label: 'X' }],
      };

      const res1 = await request(app).post('/measurement-templates').send(templateData);
      expect(res1.status).toBe(201);
      createdIds.push(res1.body.id);

      const res2 = await request(app).post('/measurement-templates').send(templateData);
      expect(res2.status).toBe(409);
    });

    test('should reject empty name', async () => {
      const response = await request(app)
        .post('/measurement-templates')
        .send({ name: '', fields: [] });

      expect(response.status).toBe(400);
    });

    test('should reject fields without key/label', async () => {
      const response = await request(app)
        .post('/measurement-templates')
        .send({ name: `${prefix}Bad Fields`, fields: [{ key: 'only_key' }] });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /measurement-templates/:id', () => {
    test('should get a specific template by ID', async () => {
      const created = await request(app)
        .post('/measurement-templates')
        .send({ name: `${prefix}Get By ID`, fields: [{ key: 'a', label: 'A' }] });
      createdIds.push(created.body.id);

      const response = await request(app).get(`/measurement-templates/${created.body.id}`);
      expect(response.status).toBe(200);
      expect(response.body.name).toBe(`${prefix}Get By ID`);
      expect(response.body.fields).toEqual([{ key: 'a', label: 'A' }]);
    });

    test('should return 404 for non-existent ID', async () => {
      const response = await request(app).get('/measurement-templates/999999');
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /measurement-templates/:id', () => {
    test('should update template name and fields', async () => {
      const created = await request(app)
        .post('/measurement-templates')
        .send({ name: `${prefix}Update Me`, fields: [{ key: 'old', label: 'Old' }] });
      createdIds.push(created.body.id);

      const response = await request(app)
        .put(`/measurement-templates/${created.body.id}`)
        .send({
          name: `${prefix}Updated`,
          fields: [{ key: 'new', label: 'New Field' }],
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe(`${prefix}Updated`);
      expect(response.body.fields).toEqual([{ key: 'new', label: 'New Field' }]);
    });

    test('should return 404 for non-existent ID', async () => {
      const response = await request(app)
        .put('/measurement-templates/999999')
        .send({ name: 'Whatever' });
      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /measurement-templates/:id', () => {
    test('should soft-delete a template', async () => {
      const created = await request(app)
        .post('/measurement-templates')
        .send({ name: `${prefix}Delete Me`, fields: [{ key: 'x', label: 'X' }] });
      createdIds.push(created.body.id);

      const response = await request(app).delete(`/measurement-templates/${created.body.id}`);
      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted');

      // Should no longer appear in listing
      const listResponse = await request(app).get('/measurement-templates');
      const found = listResponse.body.find(t => t.id === created.body.id);
      expect(found).toBeUndefined();
    });

    test('should return 404 for non-existent ID', async () => {
      const response = await request(app).delete('/measurement-templates/999999');
      expect(response.status).toBe(404);
    });
  });

  describe('Template field validation', () => {
    test('should preserve field groups in stored data', async () => {
      const fields = [
        { key: 'waistSize', label: 'Waist Size' },
        { key: 'sideTight', label: 'Side Tight', group: 'Tight Fit' },
        { key: 'sleevesLoose', label: 'Sleeves Loose', group: 'Loose Fit' },
      ];
      const created = await request(app)
        .post('/measurement-templates')
        .send({ name: `${prefix}Groups`, fields });
      createdIds.push(created.body.id);

      expect(created.status).toBe(201);
      expect(created.body.fields.length).toBe(3);
      expect(created.body.fields[1].group).toBe('Tight Fit');
      expect(created.body.fields[2].group).toBe('Loose Fit');
    });
  });
});
