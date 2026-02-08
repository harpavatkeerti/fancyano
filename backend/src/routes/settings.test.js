const request = require('supertest');
const express = require('express');
const pool = require('../database/connection');

const app = express();
app.use(express.json());
app.use('/settings', require('./settings'));

describe('Settings Routes', () => {
  const testKey = 'test_route_setting_jest';

  afterAll(async () => {
    await pool.query('DELETE FROM settings WHERE setting_key LIKE $1', ['test_route_setting_jest%']);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM settings WHERE setting_key LIKE $1', ['test_route_setting_jest%']);
  });

  describe('POST /settings', () => {
    it('should create a new setting', async () => {
      const response = await request(app)
        .post('/settings')
        .send({
          setting_key: testKey,
          setting_value: 'route_test_val',
          setting_type: 'string',
          description: 'Test setting from route',
          category: 'test'
        });

      expect(response.status).toBe(201);
      expect(response.body.setting_key).toBe(testKey);
      expect(response.body.setting_value).toBe('route_test_val');
    });

    it('should return 409 for duplicate key', async () => {
      await request(app).post('/settings').send({
        setting_key: testKey,
        setting_value: 'first'
      });

      const response = await request(app).post('/settings').send({
        setting_key: testKey,
        setting_value: 'second'
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('GET /settings', () => {
    it('should return all settings', async () => {
      await request(app).post('/settings').send({
        setting_key: `${testKey}_a`,
        setting_value: 'a'
      });

      const response = await request(app).get('/settings');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /settings/:key', () => {
    it('should return setting by key', async () => {
      await request(app).post('/settings').send({
        setting_key: testKey,
        setting_value: 'find_me'
      });

      const response = await request(app).get(`/settings/${testKey}`);

      expect(response.status).toBe(200);
      expect(response.body.setting_value).toBe('find_me');
    });

    it('should return 404 for non-existent key', async () => {
      const response = await request(app).get('/settings/non_existent_xyz_route');

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /settings/:key', () => {
    it('should update setting value', async () => {
      await request(app).post('/settings').send({
        setting_key: testKey,
        setting_value: 'old_val'
      });

      const response = await request(app)
        .put(`/settings/${testKey}`)
        .send({ setting_value: 'new_val' });

      expect(response.status).toBe(200);
      expect(response.body.setting_value).toBe('new_val');
    });

    it('should return 404 for non-existent key', async () => {
      const response = await request(app)
        .put('/settings/non_existent_xyz_route')
        .send({ setting_value: 'val' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /settings/:key', () => {
    it('should delete setting by key', async () => {
      await request(app).post('/settings').send({
        setting_key: testKey,
        setting_value: 'to_delete'
      });

      const response = await request(app).delete(`/settings/${testKey}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('deleted');

      const verify = await request(app).get(`/settings/${testKey}`);
      expect(verify.status).toBe(404);
    });

    it('should return 404 for non-existent key', async () => {
      const response = await request(app).delete('/settings/non_existent_xyz_route');

      expect(response.status).toBe(404);
    });
  });
});
