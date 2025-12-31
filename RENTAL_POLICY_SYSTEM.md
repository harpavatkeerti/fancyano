# 🏷️ Rental Policy System - Complete Documentation

## Overview

The system now tracks and manages rental policies for different product types. All rental information is stored in the database for future use and reporting.

---

## 📋 Rental Policies

### **Default Policy: 3-Day Rental**
- **Applies to:** All products except Fancy Costumes
- **Products:**
  - Sherwani
  - Indo Western
  - Suit
  - Kurta Pajama
  - Lehenga
  - Girlish Crop Top
  - Gowns
  - Artificial Jewelleries
  - Other

**Meaning:** The "Rent per Day" price includes 3 days of rental by default.

**Example:**
- Product: Sherwani
- Rent per Day: ₹5,000
- Customer gets: 3 days rental for ₹5,000
- Rental Policy: `3_days`

---

### **Special Policy: 24-Hour Rental**
- **Applies to:** Fancy Costumes only
- **Duration:** 24 hours from time of bill generation

**Meaning:** The rental period is exactly 24 hours, calculated from when the invoice/bill is created.

**Example:**
- Product: Fancy Costumes
- Rent per Day: ₹1,500
- Bill Generated: Dec 30, 2025 at 2:00 PM
- Return Time: Dec 31, 2025 at 2:00 PM
- Rental Policy: `24_hours`

---

## 🗄️ Database Implementation

### New Column: `rental_policy`

**Table:** `products`
**Column:** `rental_policy VARCHAR(20) DEFAULT '3_days'`

**Values:**
- `'3_days'` - Default, includes 3 days rental
- `'24_hours'` - 24-hour rental from bill generation time

**Migration:** `add_rental_policy.sql`

```sql
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS rental_policy VARCHAR(20) DEFAULT '3_days';

-- Automatically set Fancy Costumes to 24-hour policy
UPDATE products 
SET rental_policy = '24_hours' 
WHERE name = 'Fancy Costumes';
```

---

## 💻 Backend Implementation

### Product Creation (POST)

**File:** `backend/src/routes/products.js`

The system automatically determines rental policy based on product type:

```javascript
// Fancy Costumes: 24 hours rental
// All other categories: 3 days rental (default)
const rental_policy = name === 'Fancy Costumes' ? '24_hours' : '3_days';
```

**Database Insert:**
```javascript
INSERT INTO products (..., rental_policy, ...) 
VALUES (..., $5, ...)
```

### Product Update (PUT)

When updating a product, if the name changes to/from "Fancy Costumes", the rental policy is automatically updated:

```javascript
const rental_policy = name === 'Fancy Costumes' ? '24_hours' : '3_days';
```

---

## 🎨 Frontend Display

### Add/Edit Product Form

**File:** `frontend/app/admin/inventory/page.tsx`

When adding or editing a product, a blue info box displays the rental policy:

**For Standard Products (3-Day Rental):**
```
ℹ️ Rental Policy
   3-Day Rental: This rental price includes 3 days by default.
   This is the standard policy for all products except Fancy Costumes.
   
   💡 To change rental policies, go to Settings & Policies section.
```

**For Fancy Costumes (24-Hour Rental):**
```
ℹ️ Rental Policy
   24-Hour Rental: This product follows a 24-hour rental policy.
   Rental duration is calculated from the time of bill generation.
   
   💡 To change rental policies, go to Settings & Policies section.
```

### View Product Modal

When viewing product details, the rental policy is shown below the rent per day:

**Standard Products:**
```
Rent per Day
₹5,000
📅 Includes 3 days
```

**Fancy Costumes:**
```
Rent per Day
₹1,500
⏰ 24-hour rental
```

---

## 📊 Data Storage Benefits

All rental policy information is now stored in the database, enabling:

### **1. Reporting & Analytics**
- Track revenue by rental policy
- Compare 3-day vs 24-hour rental performance
- Identify popular products by rental type

### **2. Billing System**
- Calculate exact rental duration
- Apply correct late fees
- Generate accurate invoices

### **3. Policy Management**
- Future feature: Admin can change policies from Settings
- Bulk update rental policies
- Create custom rental periods

### **4. Customer Communication**
- Show rental policy on booking confirmation
- Send reminders based on policy (3-day vs 24-hour)
- Clear return date expectations

---

## 🔄 Future Enhancements

The stored rental policy data enables these future features:

### **1. Settings & Policies Section**
Currently mentioned in the UI, can be implemented to allow:
- Change default 3-day period to custom duration
- Set different policies per product category
- Define late fee structure per policy type
- Holiday/weekend pricing adjustments

### **2. Booking System Integration**
- Auto-calculate return date based on rental policy
- Show policy on booking confirmation
- Send policy-specific reminders:
  - 3-day products: Reminder on day 3
  - 24-hour products: Reminder at 22 hours

### **3. Advanced Policies**
- Weekly rental discounts
- Extended rental options
- Hourly rentals for specific products
- Custom rental periods per customer type

### **4. Reporting Dashboard**
- Revenue by rental policy
- Most rented products per policy type
- Average rental duration
- Policy compliance rate

---

## 🧪 Testing

### Test Case 1: Create Standard Product
1. Go to Inventory → Add Product
2. Select Product Type: "Sherwani"
3. Enter all details
4. Check rental policy info box
5. ✅ Should show: "3-Day Rental: This rental price includes 3 days by default"
6. Create product
7. View product details
8. ✅ Should show: "📅 Includes 3 days" below rent per day

### Test Case 2: Create Fancy Costume
1. Go to Inventory → Add Product
2. Select Product Type: "Fancy Costumes"
3. Enter all details
4. Check rental policy info box
5. ✅ Should show: "24-Hour Rental: This product follows a 24-hour rental policy"
6. Create product
7. View product details
8. ✅ Should show: "⏰ 24-hour rental" below rent per day

### Test Case 3: Update Product Type
1. Edit an existing Sherwani (3-day policy)
2. Change Product Type to "Fancy Costumes"
3. Save
4. ✅ Rental policy should automatically update to 24_hours
5. View product
6. ✅ Should show "⏰ 24-hour rental"

### Test Case 4: Database Verification
```sql
-- Check rental policies in database
SELECT name, code, rent_per_day, rental_policy 
FROM products 
ORDER BY rental_policy;

-- Expected results:
-- Fancy Costumes: rental_policy = '24_hours'
-- All others: rental_policy = '3_days'
```

---

## 📝 Important Notes

### For Admin Users:
1. **Default Behavior:** All new products get 3-day rental policy automatically
2. **Exception:** Only "Fancy Costumes" gets 24-hour policy
3. **Policy Info:** Always displayed when adding/editing products
4. **Settings Link:** UI mentions "Settings & Policies" for future customization
5. **Data Stored:** All policies are saved in database for reporting

### For Developers:
1. **Automatic:** Rental policy is set automatically based on product name
2. **Database Column:** `rental_policy` in `products` table
3. **Values:** Only `'3_days'` or `'24_hours'` are valid
4. **Default:** Database default is `'3_days'`
5. **Backend Logic:** In `backend/src/routes/products.js`
6. **Frontend Display:** In `frontend/app/admin/inventory/page.tsx`

### For Billing System:
1. **3-Day Policy:** Customer gets 3 full days from pickup date
2. **24-Hour Policy:** Customer gets exactly 24 hours from bill generation time
3. **Late Fees:** Can be calculated based on policy type
4. **Return Date:** Should be displayed clearly on invoice

---

## 🎯 Key Benefits

✅ **Automated:** Policy is set automatically based on product type
✅ **Stored:** All data is in database for future use
✅ **Visible:** Clear display in admin interface
✅ **Flexible:** Easy to extend with more policies
✅ **Scalable:** Can add custom policies via Settings (future)
✅ **Reportable:** Can generate analytics on rental policies
✅ **User-Friendly:** Clear info boxes guide admin users

---

## 📞 Summary

The rental policy system now:
- ✅ Stores rental policy for each product
- ✅ Shows clear policy information when adding/editing products
- ✅ Automatically assigns correct policy based on product type
- ✅ Displays policy in product details
- ✅ Provides foundation for Settings & Policies section
- ✅ Enables future reporting and analytics
- ✅ Supports billing system integration

All rental policy data is now captured and available for future features like custom policies, advanced reporting, and automated billing calculations!

