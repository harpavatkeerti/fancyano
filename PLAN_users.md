# Implementation Plan: Users as First-Class Entity & Booking-User Linkage

> **Status**: [status_users.md](file:///c:/Users/User/Documents/app/status_users.md)

---

## Overview

Restructure the data model so that customer data lives in exactly one place — the `users` table — and `bookings` references it via a foreign key. Eliminates data duplication between `bookings` and `users`, enables returning customer auto-fill in booking creation, and provides the foundation for customer portal login.

> [!CAUTION]
> **Data reset required**: Existing bookings data will be cleared as part of this migration (agreed). The `users` table is preserved and extended. All code logic and UI functionality outside the data model change must remain intact.

### Current State

| Aspect | Current |
|--------|---------|
| Customer data | Duplicated — stored in both `bookings` (`customer_name`, `customer_phone`, `customer_address`) AND `users` |
| Booking → User link | None — bookings are standalone records |
| Create booking form | Manually type all customer fields every time; no returning customer recognition |
| Phone storage | Single combined string (e.g. `+919876543210`) — country code not stored separately |
| Customer login | Customers exist in `users` table but with no consistent auth setup |
| Soft delete | Not implemented — users/bookings can be hard deleted |

### Target State

| Aspect | Target |
|--------|---------|
| Customer data | Single source of truth in `users` table only |
| Booking → User link | `bookings.user_id` FK → `users.id` |
| Create booking form | Phone-number-first search → auto-fill from `users` table; new user auto-created if not found |
| Phone storage | `phone` (digits only) + `phone_country` (ISO code, e.g. `IN`) stored separately for both primary and alternate |
| Customer login | Auto-created with `username = full phone`, `password = "customer"` (bcrypt hashed), `role = "customer"` |
| Soft delete | `is_deleted` flag on `users` — no hard deletes; all queries filter `is_deleted = false` |

---

## Design Decisions

### 1. Primary Key for Users
**Surrogate `id` (auto-increment)** is kept as PK. Phone is `UNIQUE NOT NULL`. This avoids cascade nightmares if a phone number ever changes.

### 2. Historical Booking Data Integrity
When a customer updates their name/address, past bookings will reflect the new data (via JOIN). This is an accepted trade-off. The Create Booking confirmation dialog will explicitly warn: *"Updating these details will affect all past and future bookings for this customer."*

### 3. Auto-created Customer Accounts
When a new customer is found (not in `users`), they are auto-created with:
- `username` = full phone number with country code (e.g. `+919876543210`)
- `password` = `"customer"` (bcrypt-hashed)
- `role` = `"customer"`
A future "Customer Login" feature will allow them to change their password.

### 4. Data Reset
Existing bookings data is cleared. The `users` table is preserved but extended with new columns.

### 5. Alternate Phone on Bookings
`bookings` table will no longer store `alternate_phone` — that lives only in `users`.

---

## Step 1: Database — Schema Changes

**Priority**: Critical
**Estimated scope**: Small (2 SQL migration files)
**Depends on**: Nothing

### Changes

#### [NEW] `backend/src/database/migrations/add_phone_columns_to_users.sql`

Add to `users` table:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_country            VARCHAR(2)  NOT NULL DEFAULT 'IN';
ALTER TABLE users ADD COLUMN IF NOT EXISTS alternate_phone          VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS alternate_phone_country  VARCHAR(2)  DEFAULT 'IN';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted               BOOLEAN     NOT NULL DEFAULT FALSE;

-- Phone must be unique (it is the natural identifier)
ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);

-- Index for search
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);
```

#### [NEW] `backend/src/database/migrations/restructure_bookings_for_user_fk.sql`

```sql
-- 1. Clear all bookings data (agreed — development only)
TRUNCATE bookings CASCADE;
-- cascades to: booking_products, product_charges, booking_activity_log,
--              payment_transactions, product_exchanges, booking_cancellations, credit_notes

-- 2. Add user_id FK column
ALTER TABLE bookings ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT;

-- 3. Make it NOT NULL (safe after truncate)
ALTER TABLE bookings ALTER COLUMN user_id SET NOT NULL;

-- 4. Drop old customer columns (no longer needed)
ALTER TABLE bookings DROP COLUMN IF EXISTS customer_name;
ALTER TABLE bookings DROP COLUMN IF EXISTS customer_phone;
ALTER TABLE bookings DROP COLUMN IF EXISTS customer_email;
ALTER TABLE bookings DROP COLUMN IF EXISTS customer_address;
ALTER TABLE bookings DROP COLUMN IF EXISTS alternate_phone;

-- 5. Index for fast lookups
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON bookings(user_id);
```

### Verification
- `users` table has `phone_country`, `alternate_phone`, `alternate_phone_country`, `is_deleted`
- `bookings` table has `user_id` FK, no `customer_*` columns
- `UNIQUE` constraint on `users.phone` is enforced

---

## Step 2: Backend — Users API

**Priority**: Critical
**Estimated scope**: Medium (1 file)
**Depends on**: Step 1

#### [MODIFY] `backend/src/routes/users.js`

**GET `/users`** — Filter out soft-deleted:
```sql
SELECT * FROM users WHERE is_deleted = FALSE ORDER BY id DESC
```

**GET `/users/search?phone=<substring>`** — New endpoint for booking form autocomplete:
```sql
SELECT id, name, phone, phone_country, alternate_phone, alternate_phone_country, address, email
FROM users
WHERE phone ILIKE $1 AND is_deleted = FALSE
LIMIT 10
```
Returns partial matches on national digits. Used by the live search dropdown in Create Booking.

**GET `/users/:id`** — Fetch full user details (used for "confirm changes" dialog):
- Do NOT return password hash
- Return all phone/address fields

**Phone number length validation** (enforced in API, not schema):
> Backend mirrors the frontend's `PHONE_LENGTH_MAP` in `lib/countryCodes.ts`.
> Countries with a known national length are validated exactly; unlisted countries fall back to ITU 7–15 digits.
> Error message format: `"Phone number for {COUNTRY} must be {N} digits (got {actual})."`
> Same rule applies to `alternate_phone` / `alternate_phone_country` when provided.

**POST `/users`** — Accept and store:
- `name`, `phone`, `phone_country`, `alternate_phone` *(required)*, `alternate_phone_country`, `address`, `email`
- Validate phone length per country (see rule above)
- `username` defaults to full phone (`${calling_code}${phone}`)
- `password` defaults to `"customer"`, always bcrypt-hashed before store
- `role` defaults to `"customer"`
- Enforce `UNIQUE` on `phone` — return `409` with clear message if duplicate

**PUT `/users/:id`** — Accept and update:
- `name`, `phone_country`, `alternate_phone`, `alternate_phone_country`, `address`, `email`
- Validate alternate phone length per country if provided (same rule)
- Phone itself is not editable here (future scope)

**DELETE `/users/:id`** — Soft delete only:
```sql
UPDATE users SET is_deleted = TRUE WHERE id = $1
-- Block if user has non-cancelled/completed bookings
```

### Verification
- `GET /users/search?phone=9876` returns matching users
- `POST /users` with duplicate phone → 409
- `POST /users` with `phone_country='IN'` and 9-digit phone → 400
- `POST /users` with `phone_country='IN'` and 10-digit phone → 201
- `DELETE /users/:id` with active bookings → 400
- `DELETE /users/:id` without active bookings → soft deleted, removed from list

---

## Step 3: Backend — Bookings API

**Priority**: Critical
**Estimated scope**: Medium (2 files)
**Depends on**: Steps 1, 2

#### [MODIFY] `backend/src/routes/bookings.js`

**POST `/bookings`** — Accept `user_id` instead of customer fields:
```diff
- customer_name, customer_phone, customer_email, customer_address
+ user_id   (required)
```

> [!NOTE]
> Phone validation (IN = 10 digits) is enforced at user creation/update time (Step 2). The bookings route trusts `user_id` — no re-validation of phone needed here.

#### [MODIFY] `backend/src/services/bookingService.js`

All queries that read or write customer data use JOIN with `users`:

```sql
SELECT
  b.*,
  u.name              AS customer_name,
  u.phone             AS customer_phone,
  u.phone_country     AS customer_phone_country,
  u.alternate_phone,
  u.alternate_phone_country,
  u.address           AS customer_address,
  u.email             AS customer_email
FROM bookings b
JOIN users u ON b.user_id = u.id
WHERE u.is_deleted = FALSE
```

> [!NOTE]
> Aliases (`customer_name`, `customer_phone`, etc.) preserve all existing frontend field references — **no changes needed** in booking list or detail display code.

- `createBooking`: accept `userId`, insert `user_id` into bookings
- `getBookingById`: JOIN users, alias fields as above
- `getBookingsList`: JOIN users, alias fields as above, search on aliased fields
- Remove all `customer_*` column references from INSERT statements

### Verification
- `POST /bookings` with `user_id` → booking created, linked to user
- `GET /bookings` → each booking has `customer_name`, `customer_phone` (from JOIN)
- `GET /bookings/:id` → full customer details via JOIN
- Search by name/phone works on the JOIN aliases

---

## Step 4: Frontend — Users Page

**Priority**: High
**Estimated scope**: Medium (1 file)
**Depends on**: Steps 1, 2

#### [MODIFY] `frontend/app/(authenticated)/users/page.tsx`

**Create User form**:
- Replace plain `<Input>` for phone with `<PhoneInput>` (country picker + digits) — both primary and alternate
- `phone_country` and `alternate_phone_country` sent as separate fields to API
- Validation: both phones required, valid per country, not the same

**Edit User form**:
- Pre-fill `phone_country` directly from `user.phone_country` (now a real DB field — no parsing)
- Pre-fill `alternate_phone_country` directly from `user.alternate_phone_country`

**Delete**:
- Change hard-delete to soft-delete (`is_deleted = true`)
- Toast: "Customer deactivated"
- Filter: `is_deleted = true` users do not appear in the list

### Verification
- Create user with UAE phone (`+971`) → DB has `phone_country = 'AE'`, `phone = '501234567'`
- Edit user → PhoneInput shows correct flag + digits without any parsing
- Delete user with no bookings → disappears from list, DB shows `is_deleted = true`
- Delete user with active bookings → error toast

---

## Step 4a: Backend — Remove flat customer_* aliases, return nested `user` object

**Priority**: High
**Estimated scope**: Small (1 file)
**Depends on**: Step 4

#### [MODIFY] `backend/src/services/bookingService.js`

Rewrite the SELECT queries in `getBookingById` and `getBookingsList` to return `user` as a nested JSON object instead of flat `customer_*` aliases:

```sql
json_build_object(
  'id',                    u.id,
  'name',                  u.name,
  'phone',                 u.phone,
  'phone_country',         u.phone_country,
  'alternate_phone',       u.alternate_phone,
  'alternate_phone_country', u.alternate_phone_country,
  'address',               u.address,
  'email',                 u.email
) AS user
```

Remove all `customer_*` flat alias columns from SELECT. Remove the JS post-processing object assembly added in Step 4.

`getBookingsByProductId`: replace `u.name AS customer_name, u.phone AS customer_phone` with `json_build_object(...)` or keep flat (it's only used for availability display).

### Verification
- `GET /bookings` → each row has `{ user: { id, name, phone, ... } }`, no top-level `customer_*` fields
- `GET /bookings/:id` → same nested shape

---

## Step 4b: Frontend — Migrate all `booking.customer_*` references to `booking.user.*`

**Priority**: High
**Estimated scope**: Medium (5 files)
**Depends on**: Step 4a

#### [MODIFY] `shared/src/types/index.ts`
- Remove flat `customer_*` aliases from `Booking` interface entirely
- Keep only `user_id: number` and `user: User`

#### [MODIFY] `frontend/app/(authenticated)/bookings/page.tsx`
- Replace `booking.customer_name` → `booking.user.name`
- Replace `booking.customer_phone` → `booking.user.phone`
- Replace `booking.customer_address` → `booking.user.address`

#### [MODIFY] `frontend/app/(authenticated)/bookings/[id]/page.tsx`
- Replace all `booking.customer_*` / `booking.alternate_phone*` → `booking.user.*`

#### [MODIFY] `frontend/app/(authenticated)/my-bookings/page.tsx`
- Replace `booking.customer_name`, `booking.customer_phone` → `booking.user.*`

#### [MODIFY] `frontend/app/(authenticated)/customer-bookings/page.tsx`
- Replace `booking.customer_name`, `booking.customer_phone` → `booking.user.*`

#### [MODIFY] `frontend/components/common/AvailabilityCalendar.tsx`
- Replace `booking.customer_name`, `booking.customer_phone` → `booking.user.*`

### Verification
- `npx tsc --noEmit` passes with no new errors
- Booking list page renders customer names correctly
- Booking detail page renders phone numbers and address correctly

---

## Step 5: Frontend — Create Booking Form (Phone Search + Auto-fill)

**Priority**: Critical
**Estimated scope**: Large (1 file)
**Depends on**: Steps 1, 2, 3

This is the core UX change.

#### [MODIFY] `frontend/app/(authenticated)/bookings/page.tsx`

**New state**:
```ts
const [phoneSearchResults, setPhoneSearchResults] = useState<User[]>([]);
const [selectedUser, setSelectedUser]             = useState<User | null>(null);
const [isSearching, setIsSearching]               = useState(false);
```

**Create Booking form — new field order**:
1. **Mobile Number** (`<PhoneInput>` — first field)
   - As digits are typed (3+ chars) → debounced `GET /users/search?phone=<digits>`
   - Dropdown shows: name + phone for each match
   - On selection → `selectedUser` set → all other fields auto-filled (still editable)
   - If no match → user fills fields manually
2. Customer Name
3. Alternate Mobile Number (`<PhoneInput>`)
4. Address
5. *(rest unchanged)*

**On "Create Booking" — two paths**:

**Path A — user selected from search (returning customer)**:
1. Compare current form values against `GET /users/:id` (fresh fetch)
2. If any field differs (name, alternate phone, address):
   - Show confirmation dialog:
     > *"The following details for {phone} will be updated and will affect all past and future bookings for this customer: [list of changed fields]. Proceed?"*
3. On confirm → `PUT /users/:id` → then `POST /bookings` with `user_id`
4. On cancel → user cannot proceed until they confirm or revert changes

**Path B — no user selected (new customer)**:
1. `POST /users` with form data (auto-sets role=customer, username=full phone, password="customer")
2. On 409 (phone exists but wasn't selected) → error: *"This phone number is already registered. Search and select the existing customer."*
3. On success → `POST /bookings` with returned `user_id`

**`addFormData` submission**: send `user_id` instead of customer fields.

### Verification
- Type 3 digits → dropdown appears with matching users
- Select user → all fields auto-fill, remain editable
- Change name → on submit, confirm dialog appears showing the diff
- Accept → user record updated, booking created with `user_id`
- Decline → blocked until resolved
- Unrecognized phone → manual fill → new user created → booking created
- Duplicate phone (unselected) → error message shown

---

---

## Step 5a: Backend — Extract `users.js` into `usersService.js`

**Priority**: High (architecture correctness — route currently has direct `pool.query`)
**Estimated scope**: Small–Medium (1 new file, 1 modified file)
**Depends on**: Step 2 (users.js already has all the right logic — just needs to be moved)

All production routes should follow the same `router → service → DB` pattern. `users.js` currently does all its DB queries inline, breaking the layering convention established by `bookings.js`, `products.js`, etc.

#### [NEW] `backend/src/services/usersService.js`

Extract every `pool.query` block out of `users.js` into named service functions:

| Function | Description |
|---|---|
| `listUsers()` | `SELECT ... WHERE is_deleted = FALSE` |
| `searchUsers(phone)` | `SELECT ... WHERE phone ILIKE ... LIMIT 10` |
| `getUserById(id)` | Full user record, no password hash |
| `createUser(data)` | INSERT with phone validation, bcrypt, 409 on dupe |
| `updateUser(id, data)` | UPDATE name/alt_phone/address/email (phone immutable) |
| `deleteUser(id)` | Soft delete with active-booking guard |

#### [MODIFY] `backend/src/routes/users.js`

- Import `usersService`
- Replace every inline `pool.query` block with the corresponding service call
- Route handlers become thin: validate input → call service → return response
- Remove direct `pool` import

### Verification
- All existing users API tests pass unchanged
- `users.js` no longer imports `pool` directly
- New `usersService.js` has direct pool access (correct — service layer owns DB)

---

## Step 6: Frontend — Booking Detail & Modify Modal

**Priority**: Medium
**Estimated scope**: Small (1 file)
**Depends on**: Step 3

Because the backend aliases customer fields in the JOIN, **all existing display code for `booking.customer_name`, `booking.customer_phone`, `booking.customer_address` works without changes**.

Only targeted additions:

#### [MODIFY] `frontend/app/(authenticated)/bookings/[id]/page.tsx`

- Show country flag alongside phone (using `booking.customer_phone_country`)
- Show `alternate_phone` with its country flag

#### [MODIFY] `frontend/app/(authenticated)/bookings/page.tsx` (Modify Booking modal)

- Replace plain `<Input>` for phone with `<PhoneInput>` now that `booking.customer_phone_country` is returned directly from API
- No parsing needed — country is a real field

### Verification
- Booking detail: correct flag shown next to phone
- Modify booking modal: correct country pre-filled in `<PhoneInput>`
- All display fields show correct customer data

---

## Step 7: Backend — Extract remaining routes into service layer

**Priority**: Medium (architecture hygiene — no behaviour change)
**Estimated scope**: Medium (4 new service files, 4 modified route files)
**Depends on**: Step 5a (establishes the pattern)

The following routes have direct `pool.query` inline — extract each into a dedicated service file:

| Route file | New service file | Notes |
|---|---|---|
| `complaints.js` | `complaintsService.js` | Full CRUD + notes |
| `creditNotes.js` | `creditNotesService.js` | CRUD |
| `feedback.js` | `feedbackService.js` | CRUD |
| `productTracking.js` | `productTrackingService.js` | Tracking log CRUD |

#### Pattern (same as Step 5a)
For each route:
1. Create `backend/src/services/<name>Service.js` — all `pool.query` blocks moved here as named functions
2. Modify `backend/src/routes/<name>.js` — import service, replace inline queries with service calls, remove direct `pool` import
3. Route handler becomes: validate → call service → return response

> [!NOTE]
> `auth.js`, `health.js`, and `setup.js` also have inline queries but are intentionally excluded:
> - `auth.js` — foundational, sensitive, no service abstraction needed
> - `health.js` — trivial single-query health check
> - `setup.js` — one-time admin migration tool

### Verification
- All existing API tests for each route pass unchanged
- None of the 4 route files import `pool` directly after refactor
- Each new service file correctly imports `pool` from `database/connection`

---

## File Change Summary

| File | Step | Type |
|------|------|------|
| `backend/src/database/migrations/add_phone_columns_to_users.sql` | 1 | NEW |
| `backend/src/database/migrations/restructure_bookings_for_user_fk.sql` | 1 | NEW |
| `backend/src/routes/users.js` | 2, 5a | MODIFY |
| `backend/src/routes/bookings.js` | 3 | MODIFY |
| `backend/src/services/bookingService.js` | 3 | MODIFY |
| `frontend/app/(authenticated)/users/page.tsx` | 4 | MODIFY |
| `frontend/app/(authenticated)/bookings/page.tsx` | 5 | MODIFY |
| `frontend/app/(authenticated)/cart/page.tsx` | 5 | MODIFY |
| `backend/src/services/usersService.js` | 5a | NEW |
| `frontend/app/(authenticated)/bookings/[id]/page.tsx` | 6 | MODIFY |
| `backend/src/services/complaintsService.js` | 7 | NEW |
| `backend/src/services/creditNotesService.js` | 7 | NEW |
| `backend/src/services/feedbackService.js` | 7 | NEW |
| `backend/src/services/productTrackingService.js` | 7 | NEW |
| `backend/src/routes/complaints.js` | 7 | MODIFY |
| `backend/src/routes/creditNotes.js` | 7 | MODIFY |
| `backend/src/routes/feedback.js` | 7 | MODIFY |
| `backend/src/routes/productTracking.js` | 7 | MODIFY |

---

## Decisions Made

| # | Question | Decision |
|---|----------|----------|
| 1 | Primary key for users | Surrogate `id` (auto-increment). Phone is `UNIQUE NOT NULL`. |
| 2 | Historical data integrity | Live JOIN — changes to customer data affect all bookings. Warning shown in confirm dialog. |
| 3 | Auto-created customer auth | `username = full phone`, `password = "customer"` (bcrypt hashed), `role = "customer"` |
| 4 | Existing bookings data | Cleared (`TRUNCATE CASCADE`) — development phase, accepted. |
| 5 | Alternate phone on bookings | Removed from `bookings` — lives only in `users`. |
| 6 | Soft delete | `is_deleted` flag. Hard delete blocked if user has any bookings. |
| 7 | Duplicate phone on new booking | Show error: "Already registered — search and select." |
| 8 | Backend field aliases | JOINed fields aliased as `customer_name` etc. — no frontend display changes needed. |
| 9 | India phone length | `phone_country = 'IN'` → `phone` must be exactly 10 digits. Enforced in backend API validation (not DB schema). Returns 400. Same for alternate phone. |

---

## Execution Rules

1. **Step-by-step execution only.** Complete one step fully before starting the next.
2. **User review after EVERY step.**
3. **Update [status_users.md](file:///c:/Users/User/Documents/app/status_users.md) after every step.**
4. **Run backend server after each backend step to verify no startup errors.**
5. **Use WSL for all terminal commands.**
6. **No changes to any logic outside the scope of this plan.**
