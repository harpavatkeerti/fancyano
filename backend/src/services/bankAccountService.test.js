const pool = require('../database/connection');
const bankAccountService = require('./bankAccountService');

describe('BankAccountService', () => {
  const prefix = 'jest_bank';

  afterAll(async () => {
    await pool.query("DELETE FROM bank_accounts WHERE account_name LIKE $1", [`${prefix}%`]);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM bank_accounts WHERE account_name LIKE $1", [`${prefix}%`]);
  });

  describe('create', () => {
    test('should create a bank account', async () => {
      const result = await bankAccountService.create({ account_name: `${prefix}_hdfc` });
      expect(result.id).toBeDefined();
      expect(result.account_name).toBe(`${prefix}_hdfc`);
      expect(result.is_active).toBe(true);
    });

    test('should reject empty account name', async () => {
      await expect(bankAccountService.create({ account_name: '' }))
        .rejects.toThrow('Account name is required');
    });

    test('should reject whitespace-only account name', async () => {
      await expect(bankAccountService.create({ account_name: '   ' }))
        .rejects.toThrow('Account name is required');
    });

    test('should trim account name', async () => {
      const result = await bankAccountService.create({ account_name: `  ${prefix}_trimmed  ` });
      expect(result.account_name).toBe(`${prefix}_trimmed`);
    });
  });

  describe('list', () => {
    test('should return all bank accounts', async () => {
      await bankAccountService.create({ account_name: `${prefix}_list1` });
      await bankAccountService.create({ account_name: `${prefix}_list2` });

      const all = await bankAccountService.list();
      const ours = all.filter(a => a.account_name.startsWith(prefix));
      expect(ours.length).toBe(2);
    });

    test('should include qr_code_count', async () => {
      await bankAccountService.create({ account_name: `${prefix}_qr_count` });
      const all = await bankAccountService.list();
      const ours = all.find(a => a.account_name === `${prefix}_qr_count`);
      expect(ours.qr_code_count).toBeDefined();
      expect(ours.qr_code_count).toBe(0);
    });
  });

  describe('getById', () => {
    test('should return bank account by id', async () => {
      const created = await bankAccountService.create({ account_name: `${prefix}_get` });
      const fetched = await bankAccountService.getById(created.id);
      expect(fetched.account_name).toBe(`${prefix}_get`);
    });

    test('should throw 404 for non-existent id', async () => {
      await expect(bankAccountService.getById(999999))
        .rejects.toThrow('Bank account not found');
    });
  });

  describe('update', () => {
    test('should update account name', async () => {
      const created = await bankAccountService.create({ account_name: `${prefix}_upd` });
      const updated = await bankAccountService.update(created.id, { account_name: `${prefix}_updated` });
      expect(updated.account_name).toBe(`${prefix}_updated`);
    });

    test('should update is_active', async () => {
      const created = await bankAccountService.create({ account_name: `${prefix}_deact` });
      const updated = await bankAccountService.update(created.id, { is_active: false });
      expect(updated.is_active).toBe(false);
    });

    test('should throw 404 for non-existent id', async () => {
      await expect(bankAccountService.update(999999, { account_name: 'x' }))
        .rejects.toThrow('Bank account not found');
    });
  });

  describe('delete', () => {
    test('should delete bank account', async () => {
      const created = await bankAccountService.create({ account_name: `${prefix}_del` });
      const deleted = await bankAccountService.delete(created.id);
      expect(deleted.id).toBe(created.id);
    });

    test('should throw 404 for non-existent id', async () => {
      await expect(bankAccountService.delete(999999))
        .rejects.toThrow('Bank account not found');
    });
  });
});
