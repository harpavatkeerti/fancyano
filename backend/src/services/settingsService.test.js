const pool = require('../database/connection');
const settingsService = require('./settingsService');

describe('SettingsService', () => {
  const testKey = 'test_setting_jest';
  
  afterAll(async () => {
    await pool.query('DELETE FROM settings WHERE setting_key LIKE $1', ['test_setting_jest%']);
  });
  
  beforeEach(async () => {
    await pool.query('DELETE FROM settings WHERE setting_key LIKE $1', ['test_setting_jest%']);
  });
  
  describe('create', () => {
    test('should create a new setting', async () => {
      const setting = await settingsService.create({
        setting_key: testKey,
        setting_value: 'hello',
        setting_type: 'string',
        description: 'A test setting',
        category: 'test'
      });
      
      expect(setting.setting_key).toBe(testKey);
      expect(setting.setting_value).toBe('hello');
      expect(setting.setting_type).toBe('string');
      expect(setting.category).toBe('test');
    });
    
    test('should default to string type and general category', async () => {
      const setting = await settingsService.create({
        setting_key: testKey,
        setting_value: '42'
      });
      
      expect(setting.setting_type).toBe('string');
      expect(setting.category).toBe('general');
    });
    
    test('should throw on duplicate key', async () => {
      await settingsService.create({ setting_key: testKey, setting_value: 'first' });
      
      await expect(
        settingsService.create({ setting_key: testKey, setting_value: 'second' })
      ).rejects.toThrow();
    });
  });
  
  describe('getByKey', () => {
    test('should return setting by key', async () => {
      await settingsService.create({
        setting_key: testKey,
        setting_value: 'found_me',
        category: 'test'
      });
      
      const setting = await settingsService.getByKey(testKey);
      expect(setting).not.toBeNull();
      expect(setting.setting_value).toBe('found_me');
    });
    
    test('should return null for non-existent key', async () => {
      const setting = await settingsService.getByKey('non_existent_key_xyz');
      expect(setting).toBeNull();
    });
  });
  
  describe('getAll', () => {
    test('should return all settings', async () => {
      await settingsService.create({ setting_key: `${testKey}_a`, setting_value: 'a', category: 'test' });
      await settingsService.create({ setting_key: `${testKey}_b`, setting_value: 'b', category: 'test' });
      
      const settings = await settingsService.getAll();
      expect(settings.length).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('getByCategory', () => {
    test('should return settings filtered by category', async () => {
      await settingsService.create({ setting_key: `${testKey}_cat1`, setting_value: '1', category: 'test_jest_cat' });
      await settingsService.create({ setting_key: `${testKey}_cat2`, setting_value: '2', category: 'test_jest_cat' });
      
      const settings = await settingsService.getByCategory('test_jest_cat');
      expect(settings).toHaveLength(2);
      settings.forEach(s => expect(s.category).toBe('test_jest_cat'));
    });
  });
  
  describe('update', () => {
    test('should update setting value', async () => {
      await settingsService.create({ setting_key: testKey, setting_value: 'old' });
      
      const updated = await settingsService.update(testKey, { setting_value: 'new' });
      expect(updated).not.toBeNull();
      expect(updated.setting_value).toBe('new');
    });
    
    test('should return null for non-existent key', async () => {
      const result = await settingsService.update('non_existent_xyz', { setting_value: 'val' });
      expect(result).toBeNull();
    });
  });
  
  describe('delete', () => {
    test('should delete setting by key', async () => {
      await settingsService.create({ setting_key: testKey, setting_value: 'to_delete' });
      
      const deleted = await settingsService.delete(testKey);
      expect(deleted).not.toBeNull();
      expect(deleted.setting_key).toBe(testKey);
      
      const after = await settingsService.getByKey(testKey);
      expect(after).toBeNull();
    });
    
    test('should return null for non-existent key', async () => {
      const result = await settingsService.delete('non_existent_xyz');
      expect(result).toBeNull();
    });
  });
});
