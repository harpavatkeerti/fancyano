-- Migration: Create bank_accounts table (dropdown source) and qr_codes table.
-- bank_accounts stores the bank/UPI account registry that powers the QR dropdown.
-- qr_codes links to bank_accounts via FK.

CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  account_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qr_codes (
  id SERIAL PRIMARY KEY,
  qr_type VARCHAR(20) NOT NULL CHECK (qr_type IN ('rent', 'security')),
  name VARCHAR(255) NOT NULL,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  qr_image TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  activated_at TIMESTAMP,
  deactivated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_type ON qr_codes(qr_type);
CREATE INDEX IF NOT EXISTS idx_qr_codes_bank_account ON qr_codes(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_active ON qr_codes(is_active);

COMMENT ON TABLE bank_accounts IS 'Bank/UPI account registry — dropdown source for QR code management';
COMMENT ON TABLE qr_codes IS 'QR code management linked to bank accounts';
