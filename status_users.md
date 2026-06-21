# Status: Users as First-Class Entity & Booking-User Linkage

> **Plan**: [PLAN_users.md](file:///c:/Users/User/Documents/app/PLAN_users.md)
> **Last updated**: 2026-06-21
> **Last updated by**: Agent
> **Current step**: All steps complete ✅

---

## Current Status (Summary)

| Area | Status |
|------|--------|
| Step 1: Database — Schema changes (users + bookings) | `[x]` Completed |
| Step 2: Backend — Users API (`/users/search`, phone_country fields, soft delete) | `[x]` Completed |
| Step 3: Backend — Bookings API (user_id FK, JOIN with users, aliases) | `[x]` Completed |
| Step 4: Frontend — Users page (PhoneInput, soft delete) | `[x]` Completed |
| Step 4a: Backend — Remove flat customer_* aliases, return nested user object | `[x]` Completed |
| Step 4b: Frontend — Migrate all booking.customer_* references to booking.user.* | `[x]` Completed |
| Step 5: Frontend — Create Booking form (phone search, auto-fill, confirm dialog) | `[x]` Completed |
| Step 5a: Backend — Extract `users.js` into `usersService.js` | `[x]` Completed |
| Step 6: Frontend — Booking detail & modify modal (PhoneInput with country from API) | `[x]` Completed |
| Step 7: Backend — Extract remaining routes into service layer (complaints, creditNotes, feedback, productTracking) | `[x]` Completed |

---

## Implementation Rules

1. **Step-by-step execution only.** Complete one step fully before starting the next.
2. **User review after EVERY step.**
3. **Update this file after every step.**
4. **Run backend server after each backend step to verify no startup errors.**
5. **No changes to any logic outside the scope of this plan.**

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
| 8 | Backend field aliases | Removed (Step 4a) — backend now returns `user: { id, name, phone, ... }` nested object; all frontend code uses `booking.user.*`. |

---

## Progress Tracker

| Step | Description | Status | Completed By | Date | Notes |
|------|-------------|--------|-------------|------|-------|
| 1 | Database — Add `phone_country`, `alternate_phone`, `alternate_phone_country`, `is_deleted` to `users`; restructure `bookings` with `user_id` FK, truncate bookings data | `[x]` | Agent | 2026-06-21 | Both migrations ran cleanly. Server starts with no errors. Also fixed `autoCancelService` + `availabilityService` (both referenced dropped `customer_name` column — updated to JOIN users). |
| 2 | Backend — Users API: search endpoint, phone_country fields, soft delete | `[x]` | Agent | 2026-06-21 | All 11 test cases passed (24 assertions). Includes: /users/search, is_deleted filter on all reads, phone_country on POST/PUT, IN=10-digit validation, soft delete with active-booking guard, auto username=+91{phone}. NOTE: phone_country subsequently removed from PUT (phone+country are immutable after creation). |
| 3 | Backend — Bookings API: accept `user_id`, JOIN users for all queries, alias customer fields | `[x]` | Agent | 2026-06-21 | 22/22 tests passed. POST /bookings accepts user_id, validates user exists; all queries JOIN users with customer_* aliases; search works on JOIN aliases; getBookingsByProductId updated too. |
| 4 | Frontend — Users page: PhoneInput for both phones, role selector, soft delete | `[x]` | Agent | 2026-06-21 | TypeScript clean. formData strips username/password; role selector restored (admin/salesman/customer). handleEdit reads phone_country from API; phone field disabled on edit (immutable). handleSubmit sends national digits split from country; phone+phone_country excluded from update payload. Delete: soft deactivate with history-preservation message. Shared User type updated with phone_country/alternate_phone/alternate_phone_country/is_deleted. Booking type updated with user: User (nested). PhoneInput.tsx: new disabled prop added. PUT /users: phone_country removed (immutable). |
| 4a | Backend — Remove flat customer_* aliases from booking service, return nested user JSON object | `[x]` | Agent | 2026-06-21 | Rewrote getBookingById, getBookingsList, getBookingsByProductId to return json_build_object(...) AS user. Removed all flat customer_* aliases and JS post-processing. |
| 4b | Frontend — Migrate booking.customer_* to booking.user.* across 5 files; clean Booking type | `[x]` | Agent | 2026-06-21 | Booking type: removed all flat aliases, only user_id+user: User remain. bookings/page.tsx, [id]/page.tsx, my-bookings/page.tsx, customer-bookings/page.tsx, AvailabilityCalendar.tsx all migrated. TS check passes. |
| 5 | Frontend — Create Booking: phone-first search, auto-fill, confirm dialog for changes, new user auto-create | `[x]` | Agent | 2026-06-21 | Implemented in cart/page.tsx (the real booking-creation flow for admin/salesman). Added usersApi.search (shared api client), debounced phone search, user-select auto-fill, Path A (existing user: diff → confirm dialog → PUT /users → createBooking(userId)), Path B (new user: POST /users 409-aware → createBooking(userId)). createBooking() now accepts userId and uses user_id in POST /bookings payload. bookings/page.tsx: fixed filteredBookings to use booking.user.name/phone, fixed table/modal/cancel display to booking.user.*, updated warning modal Continue to use user_id path. TS check clean. |
| 5a | Backend — Extract `users.js` into `usersService.js` (route → service → DB pattern) | `[x]` | Agent | 2026-06-21 | Created usersService.js with listUsers, searchUsers, getUserById, createUser, updateUser, deleteUser. Moved all pool.query blocks and helpers (PHONE_LENGTH_MAP, CALLING_CODE_MAP, validatePhoneLength, getCallingCode) into service. Route handlers are now thin (parse → call service → respond). users.js no longer imports pool. Both files load without errors; server starts cleanly. |
| 6 | Frontend — Booking detail & modify modal: use country from API, PhoneInput in modify modal | `[x]` | Agent | 2026-06-21 | bookings/[id]/page.tsx: country flag displayed next to primary phone and alternate phone using booking.user.phone_country/alternate_phone_country (flagcdn URLs). bookings/page.tsx Modify modal: phone field replaced with read-only flag+number display (phone immutable), address section simplified to single textarea, stale booked_from/booked_to removed from formData. TypeScript check passes. |
| 7 | Backend — Extract remaining route files (complaints, creditNotes, feedback, productTracking) into service layer | `[x]` | Agent | 2026-06-21 | Created complaintsService.js, creditNotesService.js, feedbackService.js, productTrackingService.js. Each service owns all pool.query calls. Route files are now thin delegators (no pool import). Also fixed customer_name/phone JOINs in complaints/feedback/productTracking to go through bookings.user_id → users (dropped flat column reference). All 8 modules load cleanly; server starts with no errors. |

### Status Legend
- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked

---

## Step Details & Checklist

### Step 1: Database — Schema Changes

- [x] Create `backend/src/database/migrations/024_add_phone_columns_to_users.sql`
  - [x] `phone_country VARCHAR(2) NOT NULL DEFAULT 'IN'`
  - [x] `alternate_phone VARCHAR(20)`
  - [x] `alternate_phone_country VARCHAR(2) DEFAULT 'IN'`
  - [x] `is_deleted BOOLEAN NOT NULL DEFAULT FALSE`
  - [x] `UNIQUE` constraint on `phone`
  - [x] Index on `users.phone`
- [x] Create `backend/src/database/migrations/025_restructure_bookings_for_user_fk.sql`
  - [x] `TRUNCATE bookings CASCADE`
  - [x] Add `user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT`
  - [x] Alter `user_id` to `NOT NULL`
  - [x] Drop `customer_name`, `customer_phone`, `customer_email`, `customer_address`, `alternate_phone`
  - [x] Index on `bookings.user_id`
- [x] Run both migrations via `run_step1_users_migration.js`
- [x] Verify schema in DB
- [x] Backend server starts cleanly
- **Bonus fixes**: `autoCancelService.js` and `availabilityService.js` updated to JOIN users (both referenced dropped `b.customer_name`)

### Step 2: Backend — Users API

- [x] `GET /users` — filter `is_deleted = FALSE`
- [x] `GET /users/search?phone=<q>` — new endpoint, `ILIKE` partial match, limit 10
- [x] `GET /users/:id` — return all fields, no password hash
- [x] `POST /users` — accept `phone_country`, `alternate_phone`, `alternate_phone_country`; default username/password/role for customers; 409 on duplicate phone; **400 if `phone_country='IN'` and phone is not exactly 10 digits**
- [x] `PUT /users/:id` — update `alternate_phone`, `alternate_phone_country`, `name`, `address`, `email`, `role` (phone and phone_country are immutable after creation)
- [x] `DELETE /users/:id` — soft delete; block if active bookings exist
- [x] Verify each endpoint

### Step 3: Backend — Bookings API

- [x] `POST /bookings` route — accept `user_id`, remove customer_* fields from validation
- [x] `bookingService.createBooking` — accept `userId`, insert `user_id`, verify user exists
- [x] `bookingService.getBookingById` — JOIN users, alias customer fields
- [x] `bookingService.getBookingsList` — JOIN users, alias customer fields, search on aliases
- [x] `bookingService.getBookingsByProductId` — JOIN users for customer fields
- [x] Verify `GET /bookings` returns `customer_name`, `customer_phone`, `customer_phone_country` etc. via JOIN
- [x] Verify `POST /bookings` creates booking linked to user
- [x] Verify search by name/phone works on JOIN aliases

### Step 4: Frontend — Users Page

- [x] `shared/src/types/index.ts` — Add `phone_country`, `alternate_phone`, `alternate_phone_country`, `is_deleted` to `User`; add `customer_phone_country`, `alternate_phone_country`, `user_id` to `Booking`
- [x] `formData` — remove `username`, `password`, `role` (customer-only page)
- [x] `handleSubmit` — send national digits + country code separately (not concatenated)
- [x] `handleEdit` — pre-fill `phone_country`/`alternate_phone_country` from API response
- [x] `handleDelete` — soft deactivate with history-preservation confirmation message
- [x] Form UI — remove username/password/role fields; rename labels to 'Customer'
- [x] TypeScript check passes (only pre-existing ambient warnings)
- [x] Verify: create user with non-India phone → correct country in DB
- [x] Verify: edit user → correct flags shown
- [x] Verify: delete → disappears from list

### Step 4a: Backend — Remove flat aliases, nested user object

- [x] `getBookingById`: rewrite SELECT to return `json_build_object(...) AS user`; remove flat `customer_*` aliases; remove JS post-processing
- [x] `getBookingsList`: same
- [x] `getBookingsByProductId`: replace flat `customer_name/phone` aliases with `json_build_object`
- [x] Verify: `GET /bookings` returns `{ user: { id, name, phone, ... } }`, no flat `customer_*` fields

### Step 4b: Frontend — Migrate booking.customer_* to booking.user.*

- [x] `shared/src/types/index.ts`: remove all `customer_*` / flat aliases from `Booking`; keep only `user: User` (user_id also removed — use user.id instead)
- [x] `bookings/page.tsx`: replace all `booking.customer_*` with `booking.user.*`
- [x] `bookings/[id]/page.tsx`: replace all `booking.customer_*` / `booking.alternate_phone*` with `booking.user.*`
- [x] `my-bookings/page.tsx`: replace `booking.customer_name`, `booking.customer_phone`
- [x] `customer-bookings/page.tsx`: replace `booking.customer_name`, `booking.customer_phone`
- [x] `AvailabilityCalendar.tsx`: replace `booking.customer_name`, `booking.customer_phone`
- [x] `npx tsc --noEmit` passes with no new errors

### Step 5: Frontend — Create Booking Form

- [x] Add state: `phoneSearchResults`, `selectedUser`, `isSearching` (cart/page.tsx)
- [x] Reorder form: Mobile Number (Primary Phone) first
- [x] Debounced search on phone digits (350ms, 3+ chars), via `usersApi.search`
- [x] Show dropdown with matching users (name + phone)
- [x] On user select: auto-fill all form fields (name, alt phone, country, address)
- [x] On submit — Path A (user selected):
  - [x] Fetch fresh user details (`GET /users/:id`)
  - [x] Diff form vs DB values (name, alt phone, country, address)
  - [x] If diff → show confirm dialog with changed fields
  - [x] On confirm → `PUT /users/:id` → `createBooking(userId)`
  - [x] On skip → `createBooking(userId)` without update
- [x] On submit — Path B (no user selected):
  - [x] `POST /users` → on 409 show "Already registered" error
  - [x] On success → `createBooking(userId)`
- [x] `createBooking` uses `user_id` in POST /bookings payload (no more flat customer_* fields)
- [x] Tight schedule warning modal also uses user_id path
- [x] bookings/page.tsx: filteredBookings search uses `booking.user.name/phone`
- [x] bookings/page.tsx: table, view modal, cancel modal use `booking.user.*`
- [x] TypeScript check passes with no new errors

### Step 5a: Backend — Extract `users.js` into `usersService.js`

- [x] Create `backend/src/services/usersService.js` with functions: `listUsers`, `searchUsers`, `getUserById`, `createUser`, `updateUser`, `deleteUser`
- [x] Move all `pool.query` blocks from `users.js` into the corresponding service functions
- [x] Modify `users.js` to import `usersService` and replace inline queries with service calls
- [x] Remove direct `pool` import from `users.js`
- [x] Both files load cleanly: `node -e require(...)` passes
- [x] Backend server starts cleanly (no startup errors)

### Step 6: Frontend — Booking Detail & Modify Modal

- [x] `bookings/[id]/page.tsx`: show flag next to phone using `booking.user.phone_country`
- [x] `bookings/[id]/page.tsx`: show `alternate_phone` with flag from `booking.user.alternate_phone_country`
- [x] `bookings/page.tsx` (Modify modal): replace editable phone `<Input>` with read-only flag+number display (phone is immutable)
- [x] `bookings/page.tsx` (Modify modal): remove stale `booked_from`/`booked_to` from `formData` state
- [x] `bookings/page.tsx` (Modify modal): simplify duplicate address inputs to single `<textarea>`
- [x] TypeScript check passes (no new errors)

### Step 7: Backend — Extract remaining routes into service layer

- [x] Create `backend/src/services/complaintsService.js` — all `pool.query` from `complaints.js`; fix customer JOIN via bookings.user_id
- [x] Create `backend/src/services/creditNotesService.js` — all `pool.query` from `creditNotes.js`
- [x] Create `backend/src/services/feedbackService.js` — all `pool.query` from `feedback.js`; fix customer JOIN via bookings.user_id
- [x] Create `backend/src/services/productTrackingService.js` — all `pool.query` from `productTracking.js`; fix customer JOIN via bookings.user_id
- [x] Refactor `complaints.js` — thin router, no pool import
- [x] Refactor `creditNotes.js` — thin router, no pool import
- [x] Refactor `feedback.js` — thin router, no pool import
- [x] Refactor `productTracking.js` — thin router, no pool import
- [x] All 8 modules load cleanly (`node check_services.js` → all OK)
- [x] None of the 4 route files import `pool` after refactor
- [x] Backend server starts cleanly (no startup errors)

---

## Completion Criteria

- [ ] All 6 steps completed
- [ ] `users` table has `phone_country`, `alternate_phone`, `alternate_phone_country`, `is_deleted`
- [ ] `bookings` table has `user_id` FK, no `customer_*` columns
- [ ] `GET /bookings` and `GET /bookings/:id` return full customer data via JOIN aliases
- [ ] Create Booking form: phone-first search with autocomplete
- [ ] Returning customers auto-filled; changes confirmed before save
- [ ] New customers auto-created with customer role/login
- [ ] Users page: `PhoneInput` for both phone fields with correct pre-fill on edit
- [ ] Soft delete working: active booking check, `is_deleted` flag, filtered from lists
- [ ] No TypeScript errors
- [ ] Backend starts cleanly after migrations
