const pool = require('../database/connection');
const bankAccountService = require('./bankAccountService');
const qrCodeService = require('./qrCodeService');

describe('BankAccountService', () => {
  const prefix = 'jest_bank_';
  let createdIds = [];

  afterAll(async () => {
    // Clean up QR codes first (FK), then bank accounts
    for (const id of createdIds) {
      await pool.query('DELETE FROM qr_codes WHERE bank_account_id = $1', [id]);
      await pool.query('DELETE FROM bank_accounts WHERE id = $1', [id]);
    }
  });

  describe('create', () => {
    test('should create a bank account', async () => {
      const result = await bankAccountService.create({ account_name: `${prefix}HDFC Main` });
      createdIds.push(result.id);
      expect(result.id).toBeDefined();
      expect(result.account_name).toBe(`${prefix}HDFC Main`);
      expect(result.is_active).toBe(true);
    });

    test('should reject empty name', async () => {
      await expect(bankAccountService.create({ account_name: '' }))
        .rejects.toThrow('Account name is required');
    });
  });

  describe('list', () => {
    test('should return accounts with QR count', async () => {
      const accounts = await bankAccountService.list();
      expect(Array.isArray(accounts)).toBe(true);
      if (accounts.length > 0) {
        expect(accounts[0]).toHaveProperty('qr_code_count');
      }
    });
  });

  describe('delete', () => {
    test('should delete account without linked QR codes', async () => {
      const created = await bankAccountService.create({ account_name: `${prefix}DeleteMe` });
      const deleted = await bankAccountService.delete(created.id);
      expect(deleted.id).toBe(created.id);
    });

    test('should reject delete with linked QR codes', async () => {
      const account = await bankAccountService.create({ account_name: `${prefix}WithQR` });
      createdIds.push(account.id);

      await qrCodeService.create({
        qr_type: 'rent',
        name: `${prefix}test_qr`,
        bank_account_id: account.id,
        qr_image: 'data:image/png;base64,test'
      });

      await expect(bankAccountService.delete(account.id))
        .rejects.toThrow('Cannot delete bank account with linked QR codes');
    });
  });
});

describe('QrCodeService', () => {
  const prefix = 'jest_qr_';
  let bankAccountId;
  let createdQrIds = [];

  beforeAll(async () => {
    const account = await bankAccountService.create({ account_name: `${prefix}TestBank` });
    bankAccountId = account.id;
  });

  afterAll(async () => {
    for (const id of createdQrIds) {
      await pool.query('DELETE FROM qr_codes WHERE id = $1', [id]);
    }
    await pool.query("DELETE FROM qr_codes WHERE name LIKE $1", [`${prefix}%`]);
    await pool.query("DELETE FROM bank_accounts WHERE account_name LIKE $1", [`${prefix}%`]);
  });

  describe('create', () => {
    test('should create a QR code', async () => {
      const result = await qrCodeService.create({
        qr_type: 'rent',
        name: `${prefix}RentQR`,
        bank_account_id: bankAccountId,
        qr_image: 'data:image/png;base64,testimage'
      });
      createdQrIds.push(result.id);
      expect(result.id).toBeDefined();
      expect(result.qr_type).toBe('rent');
      expect(result.is_active).toBe(false);
    });

    test('should reject invalid qr_type', async () => {
      await expect(qrCodeService.create({
        qr_type: 'invalid',
        name: 'test',
        bank_account_id: bankAccountId,
        qr_image: 'test'
      })).rejects.toThrow('QR type must be "rent" or "security"');
    });
  });

  describe('activate/deactivate', () => {
    test('should activate a QR code and deactivate others of same type', async () => {
      const qr1 = await qrCodeService.create({
        qr_type: 'security',
        name: `${prefix}Sec1`,
        bank_account_id: bankAccountId,
        qr_image: 'data:image/png;base64,qr1'
      });
      createdQrIds.push(qr1.id);

      const qr2 = await qrCodeService.create({
        qr_type: 'security',
        name: `${prefix}Sec2`,
        bank_account_id: bankAccountId,
        qr_image: 'data:image/png;base64,qr2'
      });
      createdQrIds.push(qr2.id);

      // Activate qr1
      await qrCodeService.activate(qr1.id);
      let active = await qrCodeService.getActive('security');
      expect(active.id).toBe(qr1.id);

      // Activate qr2 — qr1 should be deactivated
      await qrCodeService.activate(qr2.id);
      active = await qrCodeService.getActive('security');
      expect(active.id).toBe(qr2.id);

      const qr1After = await qrCodeService.getById(qr1.id);
      expect(qr1After.is_active).toBe(false);
    });
  });

  describe('getActive', () => {
    test('should return null when no active QR for type', async () => {
      // Deactivate all rent QRs
      const allRent = await qrCodeService.list({ qr_type: 'rent' });
      for (const qr of allRent) {
        if (qr.is_active) await qrCodeService.deactivate(qr.id);
      }
      const active = await qrCodeService.getActive('rent');
      expect(active).toBeNull();
    });
  });
});
