# Admin Reports Section — Updated Implementation Plan (v2)

## Changes from v1 (Based on Your Feedback)

| Your Comment | What Changed |
|---|---|
| Cash not tallying at store, need adjustment option | Added **Cash Adjustment Entry** in ledger |
| Credit note impact on ledger | Credit note usage recorded as `method: 'Credit Note'` in transactions |
| Filter rent due by booking ID | Added **Booking-level drill-down** in rental collection |
| Penalties/fees always collected upfront? | **Confirmed**: penalties are added as charges and paid via waterfall — no "pending" scenario in practice. Removed unnecessary paid/unpaid filter |
| Expense dropdown categories? | Listed all categories + **configurable from Settings** |
| Exchange uses `effective_rent` (after discount) | **Confirmed**: exchange already uses `effective_rent` — no discount conflict with dead inventory |
| Simplified purchase — just total, no product details | **Simplified**: just amount + vendor + billing type, no product-level tracking |
| Shop rent missing from P&L | **Added** shop rent as expense category |
| Customer outstanding — explain | Explained and kept as useful sub-report |
| Salesman data — do we have it? | **Verified**: `bookings.created_by` and `payment_transactions.recorded_by` store salesman names ✅ |
| Customer, Salesman, Product Performance in same category | **Grouped** under "Business Reports" |
| P&L, Security Deposit, Overdue together | **Grouped** P&L + Security under "Financial Reports". Removed Overdue (not applicable) |
| Expense categories configurable from Settings | Yes, will use `settings` table |
| QR change = store QR name on each payment | **Updated**: every transaction tagged with QR code name, even if same booking uses different QRs |
| Export multiple formats + share via Email/WhatsApp to admin | **Added**: PDF, Excel, CSV + share to admin contact |

---

## Module 1: Financial Ledger (Cash/UPI/Other Payments)

### What Exists
`payment_transactions` already stores: `type` (payment/refund/adjustment), `method` (Cash, UPI, Card, Bank Transfer, Cheque, Other), `amount`, `booking_id`, `recorded_by`, `notes`, `transaction_date`.

### Ledger View
A chronological transaction table showing ALL transactions:

| Column | Source |
|--------|--------|
| Date | `transaction_date` |
| Booking ID | `booking_id` (clickable link to booking) |
| Customer | Joined from `bookings → users` |
| Type | `payment` → **Credit** ↑, `refund` → **Debit** ↓, `adjustment` → **Adjustment** ± |
| Amount | `amount` |
| Payment Method | `method` |
| Category | `charge_category` (rent/security/penalty etc.) |
| QR Code Used | From new `qr_code_id` → QR name (UPI payments only) |
| Recorded By | `recorded_by` |
| Notes | `notes` |
| Running Balance | Cumulative calculated (credits − debits) |

### Cash Adjustment Entry (NEW)
[REVIEW] - This should not be mixed with `payment_transactions` since it is a non-booking adjustment. It should be stored separately.
When cash doesn't tally at the store, admin can add a **manual adjustment entry**:
- This uses the existing `adjustment` transaction type in `payment_transactions`
- Form: Amount (+ or −), Reason/Notes, Date
- Shows in ledger as `Adjustment | +₹500 | Cash tally adjustment` or `Adjustment | -₹200 | Cash shortage`
- These are **non-booking** adjustments — `booking_id` will be NULL for standalone cash adjustments

[REVIEW] - DO NOT CHANGE CURRENT DB
> [!NOTE]
> **DB Change needed**: Currently `payment_transactions.booking_id` has `NOT NULL` constraint. We need to make it nullable for standalone cash adjustments. Adding a new column `is_standalone_adjustment BOOLEAN DEFAULT FALSE` to distinguish.

### Credit Note Impact on Ledger
[REVIEW] - Skip credit note related changes for now. We will do it later.
Currently credit notes (`credit_notes` table) are managed separately — they are **issued** (created) and **used** (redeemed against a booking), but they don't appear in `payment_transactions`.

**How this will work:**
- When a credit note is **used** against a booking, the system already reduces charges. To show this in the ledger, we will also record a `payment_transactions` entry with:
  - `type: 'payment'`
  - `method: 'Credit Note'`
  - `notes: 'Credit Note #CN-123 applied'`
- This way the ledger shows credit note usage as a regular credit entry
- **Credit Note Issued** (refund given as credit note instead of cash) will show as:
  - `type: 'refund'` with `method: 'Credit Note'` + `notes: 'Issued as Credit Note #CN-123'`

[REVIEW] - DO NOT CHANGE CURRENT DB. This change will be taken up later.
> [!NOTE]
> **DB Change needed**: Add `'Credit Note'` to the `method` CHECK constraint on `payment_transactions`. Also need to modify the `useCreditNote` service to create a `payment_transactions` entry.

### Filters
- Payment method: Cash / UPI / Card / Bank Transfer / Cheque / Credit Note / Other
- Type: Credit (payments) / Debit (refunds) / Adjustments / All
- Date range picker
- Booking ID search
- QR Code filter (for UPI payments)

### Summary Cards
- Total Credits (money IN) for filtered period
- Total Debits (money OUT) for filtered period
- Net Balance
- Cash vs UPI vs Other breakdown

[REVIEW] - DO NOT CHANGE CURRENT DB
### DB Changes for Module 1
| Change | Type |
|--------|------|
| `payment_transactions.booking_id` → make nullable | MODIFY |
| Add `is_standalone_adjustment` column | ADD COLUMN |
| Add `'Credit Note'` to method CHECK constraint | MODIFY |
| Modify `useCreditNote` to insert into `payment_transactions` | CODE CHANGE |

---

## Module 2: Rental Collection Report

### Period Report
- Date range picker → shows: **Total Rent Due** vs **Total Rent Collected** vs **Outstanding**
- Data from: `product_charges WHERE charge_type = 'rent'` aggregated with `payment_transactions WHERE charge_category = 'rent'`

### Financial Year View
- Dropdown: FY 2025-26, FY 2024-25, etc. (auto-generated from data range)
- Monthly breakdown table:

| Month | Rent Due | Rent Collected | Outstanding | Collection % |
|-------|----------|---------------|-------------|--------------|
| Apr 2025 | ₹2,00,000 | ₹1,85,000 | ₹15,000 | 92.5% |
| ... | ... | ... | ... | ... |

### Booking-Level Drill-Down (Per Your Feedback)
- Click on any month row → expands to show **individual bookings** in that month:

| Booking ID | Customer | Products | Rent Due | Rent Paid | Status |
|------------|----------|----------|----------|-----------|--------|
| #245 | Rahul S. | Sherwani, Pagdi | ₹5,000 | ₹5,000 | Fully Paid |
| #251 | Priya M. | Lehenga | ₹8,000 | ₹4,000 | Partial |

- Can also filter directly by Booking ID to see its rent details

### DB Changes: **None** — pure query aggregation.

---

## Module 3: Rent Collection QR Code Management & Reports
[REVIEW] - QR code in itself is just a display tool. The important logic is that the bank/UPI account to which it is linked matters. We need to track that instead of qr code id in this table. Add that field in this table, and use that for all the queries (group on that)
### New Table: `qr_codes`
```sql
CREATE TABLE qr_codes (
  id SERIAL PRIMARY KEY,
  qr_type VARCHAR(20) NOT NULL CHECK (qr_type IN ('rent', 'security')),
  name VARCHAR(255) NOT NULL,          -- e.g. "HDFC QR - Main", "SBI QR - Backup"
  qr_image TEXT NOT NULL,              -- base64 image
  is_active BOOLEAN DEFAULT FALSE,     -- only 1 active per type at a time
  activated_at TIMESTAMP,
  deactivated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Changes to `payment_transactions`
```sql
ALTER TABLE payment_transactions
ADD COLUMN IF NOT EXISTS qr_code_id INTEGER REFERENCES qr_codes(id);
```

### How QR Name is Stored Per Transaction (Per Your Feedback)
- **Every time a payment is recorded via UPI**, the currently active QR code ID is stamped on that `payment_transactions` row
- **Same booking, different QR** — if booking #100 has payment #1 on "HDFC QR" and payment #2 on "SBI QR" (because you changed QR between the two payments), both transactions store their respective QR code IDs independently
- **Result**: When you look at any transaction, you see exactly which QR was used: `Booking #100 → ₹5,000 → UPI via "HDFC QR - Main"`

### Settings Page Changes
- Remove single QR image upload
- Add **QR Code Manager** section:
  - List all QR codes (name, image preview, status: Active/Inactive, activation date)
  - **Add New QR** button → upload image + give name
  - **Activate** button → deactivates current active, activates new one (with timestamps)
  - **Cannot delete** a QR that has transactions against it (data integrity) -- [REVIEW] - This will need revisiting once we track the bank / UPI account instead of qr_codes table id

[REVIEW] - This will need revisiting once we track the bank / UPI account instead of qr_codes table id. Grouping by bank / UPI account would be needed for correct and clear understanding
### Rent QR Reports
1. **Combined Report**: All rent QR codes, total collected per QR for selected period
2. **Individual QR Report**: Select specific QR → table of all payments made against it
3. **Comparison**: Side-by-side bar chart of QR code collections

> [!WARNING]
> Historical payments (before this feature) will have `qr_code_id = NULL`. They'll appear under "Legacy / Before QR Tracking" in reports.

---

## Module 4: Security Deposit QR Code Management & Reports
[REVIEW] - This will also require changes in the payment management component to check whether a transaction corresponds (fully or partially) to security, and those cases need to be handled separately, and carefully without causing any regression in existing logic.

Shares the same `qr_codes` table (with `qr_type = 'security'`).

### Same QR-per-transaction tagging as Module 3
- Every security deposit payment via UPI stores the active security QR code ID
- When viewing a booking's security deposit details: `Booking #123 → Security ₹5,000 → UPI via "Axis QR - Security"`

### Security Deposit Reports (Per Your Feedback)
- **Method-wise breakdown**: How much security collected via Cash vs UPI vs Card for selected period
- **Remaining to collect**: For each booking, how much security is still pending AND what method was used for partial payments
- **QR-wise breakdown**: Security collected per QR code
- **Refund tracking**: How much security has been refunded, by what method

| Booking ID | Customer | Security Due | Paid Cash | Paid UPI | Paid Card | Pending | QR Used |
|------------|----------|-------------|-----------|----------|-----------|---------|---------|
| #200 | Amit K. | ₹10,000 | ₹5,000 | ₹3,000 | - | ₹2,000 | HDFC QR |

### DB Changes: Same as Module 3 (`qr_codes` table + `qr_code_id` column).

---

## Module 5: Additional Charges Report (Penalties & Fees)

### Verified Against Code

I checked the code thoroughly:

- **Exchange Penalty** → `chargeAccountingService.addCharge(bp_id, 'exchange_penalty', amount, ...)` → this charge is created and then the payment waterfall (`_applyToPenalties`) pays it from existing/new payments. **The penalty IS the charge — it gets added to the booking total and is either paid from existing funds or requires additional payment.**
- **Cancellation Penalty** → same flow via `booking_cancellation_history` + `addCharge`
- **Late Fee** → added on return when late, paid from existing balance or new payment
- **Damage Fee** → manually added

[REVIEW] - Explain the edge cases where pending is possible? Cancellation / Exchange / Booking completion is considered successful only when the corresponding cancellation / exchange / late or damage fee is paid, so there should be no scope of "pending" state for these penalties. If it does exist anywhere, let me know right now.
> [!NOTE]
> **You were partially right**: In MOST cases, penalties are deducted from the security deposit or existing overpayment, so they appear as "paid" immediately. But there ARE edge cases where the penalty exceeds available funds and the customer needs to pay more. So a "pending" column is technically possible but rare. **I'll show the data but won't add a separate filter for it — just a combined report.**

### Report Format (Simplified per your feedback)
**Combined Charges Report** — single table with category filter:

| Date | Booking ID | Customer | Charge Type | Amount | Product | Policy Applied |
|------|-----------|----------|-------------|--------|---------|---------------|
| 15 Jan | #120 | Rahul | Exchange Penalty | ₹800 | Sherwani-001 | 10% within 5 days |
| 18 Jan | #135 | Priya | Late Fee | ₹400 | Lehenga-005 | ₹200/day × 2 days |
| 22 Jan | #140 | Amit | Cancellation Penalty | ₹1,500 | Gown-012 | 20% (6-10 days) |
| 25 Jan | #145 | Sneha | Damage Fee | ₹2,000 | Sherwani-003 | Manual |

- **Filter by charge type** (tabs or dropdown): Exchange Penalty | Cancellation Penalty | Late Fee | Damage Fee | Downgrade Penalty | All
- **Date range filter**
- **Summary cards**: Total collected per charge type for the period

### DB Changes: **None**.

---

## Module 6: Expenses Management & Report

### New Table: `expenses`
```sql
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category VARCHAR(50) NOT NULL,       -- matches from expense_categories setting
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT,
  recorded_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Expense Categories (Configurable from Settings)
Default categories stored in `settings` table as JSON:
```json
{
  "key": "expense_categories",
  "value": [
    "Dry Clean",
    "Fuel",
    "Salary", 
    "Transport",
    "Alteration",
    "Beverage",
    "Shop Rent",
    "Other"
  ]
}
```
- Admin can **add/remove categories** from Settings page
- The expense form dropdown reads categories from this setting dynamically

### Features
- **Quick Add Form**: Date, Category (dropdown from settings), Amount, Description
- **Daily Entry View**: Calendar-style or list view for daily expense entry
- **Reports**:
  - Select duration (date range) OR select month → get expense report
  - Category-wise breakdown with pie chart
  - Monthly comparison bar chart
- **Summary Cards**: Total expenses, per-category totals

### DB Changes
| Change | Type |
|--------|------|
| `expenses` table | NEW |
| `expense_categories` setting in `settings` table | NEW ROW |

---

## Module 7: Dead Inventory / Slow-Moving Products Report

### Logic
For each active product, find `MAX(booked_to)` from `booking_products` (excluding cancelled/exchanged). If never booked, use `products.created_at`.

### Report
| Product Code | Product Name | Category | Rent/Day | Last Booked Date | Days Idle |
|-------------|-------------|----------|----------|-----------------|-----------|
| SHW-001 | Royal Sherwani | Groom | ₹2,000 | 15 Nov 2025 | 95 days |
| LHG-015 | Pink Lehenga | Bridal | ₹3,500 | Never | 180 days |

- **Quick Filters**: Idle 30+ / 60+ / 90+ / Custom days
- **Never Booked** tab: Products with zero bookings
- Clicking a product → opens product edit page (can add discount there)

### Exchange Pricing Note (Per Your Feedback)
I checked the exchange code — it uses **`effective_rent`** (rent after discount), not the original rent. So if you discount a dead inventory product and someone later exchanges it, the penalty is calculated on the discounted price. This is correct behavior — no issue.

### DB Changes: **None**.

---

## Module 8: Purchase Tracking (Simplified Per Your Feedback)

> [!IMPORTANT]
> **Keeping it simple**: No product-level purchase details. Just total purchase amount for accounting purposes.

### New Table: `purchases`
```sql
CREATE TABLE purchases (
  id SERIAL PRIMARY KEY,
  vendor_id INTEGER REFERENCES vendors(id),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_amount INTEGER NOT NULL CHECK (total_amount > 0),
  billing_type VARCHAR(20) NOT NULL CHECK (billing_type IN ('billed', 'unbilled_cash')),
  bill_number VARCHAR(100),            -- NULL for cash purchases
  bill_image TEXT,                     -- Uploaded bill photo (base64), NULL for cash
  notes TEXT,
  recorded_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Where to Put It
**Inside Reports section** as a sub-tab — simple form to add purchase + list view. Not a full separate section for now. Can expand later if needed.

### Features
- **Add Purchase**: Vendor (dropdown), Date, Amount, Billed/Cash, Bill number, Upload bill image, Notes
- **List View**: All purchases with vendor, amount, date, billed/unbilled badge
- **Summary**: Total purchases for period, billed vs unbilled breakdown, vendor-wise breakdown

### DB Changes
| Change | Type |
|--------|------|
| `purchases` table | NEW |

---

## Module 9: P&L Dashboard (Profit & Loss Overview)

This is the **main financial dashboard** combining all data:

### Income (for selected period)
| Source | Amount |
|--------|--------|
| Rent Collected | ₹X (from `payment_transactions` where `charge_category = 'rent'`) |
| Exchange Penalties | ₹X (from `charge_category = 'exchange_penalty'`) |
| Cancellation Penalties | ₹X |
| Late Fees | ₹X |
| Damage Fees | ₹X |
| Transport Charges | ₹X |
| **Total Income** | **₹X** |

### Expenses (for selected period)
| Source | Amount |
|--------|--------|
| Shop Rent | ₹X (from `expenses` where category = 'Shop Rent') |
| Salary | ₹X |
| Dry Clean | ₹X |
| Fuel | ₹X |
| Transport | ₹X |
| Alteration | ₹X |
| Beverage | ₹X |
| Other Expenses | ₹X |
| **Total Expenses** | **₹X** |

### Purchases (for selected period)
| Source | Amount |
|--------|--------|
| Billed Purchases | ₹X |
| Cash Purchases (Unbilled) | ₹X |
| **Total Purchases** | **₹X** |

### Net Profit/Loss
```
Net = Total Income − Total Expenses − Total Purchases
```

### DB Changes: **None** — aggregates from existing + new tables.

---

## Module 10: Security Deposit Summary (Under Financial Reports)

### Security Deposit Method-Wise Report (Per Your Feedback)

| Payment Method | Collected | Refunded | Currently Held |
|---------------|-----------|----------|----------------|
| Cash | ₹2,50,000 | ₹1,80,000 | ₹70,000 |
| UPI | ₹4,00,000 | ₹3,20,000 | ₹80,000 |
| Card | ₹50,000 | ₹45,000 | ₹5,000 |
| **Total** | **₹7,00,000** | **₹5,45,000** | **₹1,55,000** |

- **Drill-down**: Click any method → shows booking-wise security deposits in that method
- **Pending Security**: Bookings where security is not yet fully paid, showing how much was paid via which method
- **Date range filter**: See security deposit movements for any period
- **QR-wise breakdown** for UPI deposits

### DB Changes: **None** — queries from `payment_transactions` where `charge_category = 'security'`.

---

## Business Reports (Grouped Together Per Your Feedback)

### 11. Customer Report
- Top customers by booking count and revenue
- Repeat customer rate (booked more than once)
- **Customer-wise outstanding dues** = Bookings where `total_due > total_paid` for that customer. Example: "Customer Rahul has 2 active bookings with total ₹3,000 pending across them." This helps follow up for collections.

### 12. Salesman Performance Report

**Data Verification** ✅ — I confirmed the data exists:
- `bookings.created_by` → stores the salesman's name who created the booking
- `payment_transactions.recorded_by` → stores who collected the payment
- Both are VARCHAR fields storing the username/name

**Report will show:**
| Salesman | Bookings Created | Revenue Generated | Payments Collected | Cancellations |
|----------|-----------------|-------------------|-------------------|---------------|
| Rohit | 45 | ₹2,25,000 | ₹1,90,000 | 3 |
| Vikram | 38 | ₹1,80,000 | ₹1,65,000 | 5 |

### 13. Product Performance Report
- Revenue per product (total rent collected)
- Most/least rented products
- ROI: Rental revenue vs purchase price

### DB Changes: **None** — all data exists.

---

## ~~Module 14: Overdue/Outstanding~~ — REMOVED

Per your feedback, this doesn't apply to your business model. Removed.

---

## Report Export & Sharing

### Export Formats
- **PDF** — formatted report with your business name/logo
- **Excel (XLSX)** — raw data for further analysis
- **CSV** — simple data export

User selects format from a dropdown before exporting.

### Share via WhatsApp / Email (Admin Only)
- Same mechanism as invoice sharing (already exists in your codebase via `wa.me` URLs and `notificationService`)
- Reports can ONLY be sent to admin contact numbers (from `users` table where `role = 'admin'`)
- **WhatsApp**: Generates PDF → uploads → sends link via WhatsApp to admin
- **Email**: Generates PDF → emails to admin email (if stored)
- Share button shows on every report with "Send to Admin" option

---

## Reports Page Navigation Structure (Updated)

```
Admin → Reports
├── 💰 Financial Reports
│   ├── 📒 Financial Ledger (Module 1)
│   ├── 🏠 Rental Collection (Module 2)
│   ├── 🔒 Security Deposits (Module 10)
│   └── 📊 P&L Dashboard (Module 9)
│
├── 📱 QR Code Reports
│   ├── 📋 Rent QR Management & Report (Module 3)
│   └── 🔒 Security QR Management & Report (Module 4)
│
├── ⚠️ Charges & Penalties (Module 5)
│
├── 💸 Expenses (Module 6)
│   ├── Add / View Expenses
│   └── Expense Summary Report
│
├── 📦 Inventory Reports
│   ├── Dead Inventory (Module 7)
│   └── Product Performance (Module 13)
│
├── 🛒 Purchases (Module 8)
│   ├── Add / View Purchases
│   └── Purchase Summary Report
│
└── 👥 Business Reports
    ├── Customer Report (Module 11)
    └── Salesman Performance (Module 12)
```

---

## DB Changes Summary (Final)

| Change | Type | Table |
|--------|------|-------|
| `qr_codes` | **NEW TABLE** | QR code management with history |
| `expenses` | **NEW TABLE** | Daily expense tracking |
| `purchases` | **NEW TABLE** | Simplified purchase tracking |
| `payment_transactions.qr_code_id` | **ADD COLUMN** | Link payment to QR code used |
| `payment_transactions.booking_id` | **MAKE NULLABLE** | For standalone cash adjustments |
| `payment_transactions.is_standalone_adjustment` | **ADD COLUMN** | Distinguish standalone adjustments |
| `payment_transactions.approval_status` | **ADD COLUMN** | Pending/approved/rejected for salesman adjustments |
| `payment_transactions.method` CHECK | **MODIFY** | Add 'Credit Note' as valid method |
| `expense_categories` in `settings` | **NEW ROW** | Configurable expense categories |
| `monthly_shop_rent` in `settings` | **NEW ROW** | Fixed monthly shop rent, auto-creates expense |
| `useCreditNote` service | **CODE CHANGE** | Also insert payment_transaction when credit note used |

---

## Implementation Order (Phased)
[REVIEW] - Adhere to the following for any change you do:
- Run all tests in the backend directory using wsl before any of your change and verify all pass. Add tests for whatever changes you are doing, and ensure all tests pass after your changes. 
- Also ensure that no business logic is written in frontend, and frontend -> router -> service -> DB paradigm is strictly followed. 
- Ensure that no code duplication is there, reuse existing functions wherever possible. And for permission related changes, follow the existing code pattern, how it is handled at route level as well as within any frontend file. DO NOT copy files to create redundant code.
- Use wsl for running any commands
- Ensure that the current DB is NOT destructively changed and nothing is deleted from there. This is very very important.

### Phase 1: Reports Infrastructure + Data-Ready Reports
1. Restructure reports page with sidebar/tab navigation
2. Module 1: Financial Ledger (+ cash adjustment + credit note impact)
3. Module 2: Rental Collection (with booking drill-down)
4. Module 5: Charges & Penalties (combined report)
5. Module 7: Dead Inventory
6. Export functionality (PDF/Excel/CSV)

### Phase 2: New Tables + CRUD
7. Module 6: Expenses (new table + CRUD + report + configurable categories)
8. Module 3 & 4: QR Code Management (new table + settings refactor + per-transaction tagging)
9. Module 8: Purchases (simplified new table + CRUD + report)

### Phase 3: Dashboards & Business Reports
10. Module 9: P&L Dashboard
11. Module 10: Security Deposit Summary (method-wise)
12. Modules 11-13: Customer, Salesman, Product Performance
13. Share via WhatsApp/Email to admin

---

## Decisions (Finalized ✅)

| # | Question | Decision |
|---|----------|----------|
| 1 | **Cash Adjustment Permissions** | Admin can enter directly. Salesman can create adjustment but it goes into **pending approval** state — admin must approve before it reflects in the ledger. Need an `approval_status` column on standalone adjustments. |
| 2 | **Shop Rent** | Stored as a **fixed monthly setting** (e.g., ₹50,000/month) in `settings` table. System **auto-creates** a recurring expense entry on the 1st of each month. If admin revises the amount, new amount applies from next month onward. |
| 3 | **Phase Priority** | Current order confirmed: Phase 1 (data-ready reports) → Phase 2 (new tables + CRUD) → Phase 3 (dashboards + business reports). |

### Additional DB Impact from Decision 1 & 2
| Change | Type |
|--------|------|
| `payment_transactions.approval_status` | **ADD COLUMN** — `VARCHAR(20) DEFAULT 'approved'` with CHECK `('pending', 'approved', 'rejected')`. Only standalone adjustments by salesmen start as `'pending'`. |
| `monthly_shop_rent` setting in `settings` table | **NEW ROW** — `setting_key: 'monthly_shop_rent'`, `setting_type: 'number'`, auto-generates expense entry on 1st of each month. |

---

## Verification Plan
[REVIEW] - Run all existing tests too and ensure all pass

### Automated Tests
- Unit tests for all new report service functions
- API endpoint tests for each report route
- Migration tests for new tables + column changes

### Manual Verification
- Verify ledger running balance with real transaction data
- Verify credit note shows in ledger when used
- Verify cash adjustment entries appear correctly
- Verify QR code switching preserves per-transaction QR data
- Verify expense CRUD + category management from Settings
- Verify P&L calculations with real data
- Verify security deposit method-wise report accuracy
- Test all export formats (PDF, Excel, CSV)
- Test WhatsApp/Email sharing to admin contact
