# 📅 Date Range Filter for Inventory

## Overview

The inventory page now includes a date range filter that allows you to search for products based on their booking dates. This helps you quickly identify which products are booked during a specific time period.

---

## 🎯 How It Works

### Filter Logic:
The date range filter shows **products that are booked** during the selected date range. This is useful for:
- Checking which products are unavailable during a specific period
- Planning inventory for upcoming events
- Identifying popular products during certain dates
- Managing bookings for seasonal demand

### Date Overlap Detection:
The filter uses smart date overlap logic:
```
Selected Range: [From Date] ────────────── [To Date]
                    │                          │
                    ▼                          ▼
Booking Range:  [Pickup Date] ──────── [Return Date]

✅ Shows product if: Booking overlaps with selected range
❌ Hides product if: No bookings in selected range
```

---

## 🎨 User Interface

### Filter Section (2 Rows):

**Row 1:** Product Type | Category | Size

**Row 2:** Date Range Filter

```
┌─────────────────────────────────────────────────────────────────┐
│ 📅 Booked From Date    │ 📅 Booked To Date    │ Info           │
├─────────────────────────┼──────────────────────┼────────────────┤
│ [Date Picker]          │ [Date Picker]        │ 🔍 Showing:    │
│ YYYY-MM-DD             │ YYYY-MM-DD           │ Products...    │
└─────────────────────────┴──────────────────────┴────────────────┘
                                                   [Clear Filters]
```

### Info Box (appears when dates are selected):
```
🔍 Showing: Products booked between [Start Date] and [End Date]
```

---

## 📊 Example Usage

### Example 1: Find Products Booked for New Year's Week

**Steps:**
1. Go to **Inventory** page
2. Set **Booked From Date:** `2025-12-28`
3. Set **Booked To Date:** `2026-01-05`
4. Click outside the date picker

**Result:**
```
✅ Shows:
- Sherwani SH-000001 (Booked: Dec 30 - Jan 2)
- Lehenga LH-000003 (Booked: Dec 28 - Dec 31)
- Fancy Costumes FA-000001 (Booked: Jan 1)

❌ Hides:
- Products with no bookings in this range
- Products booked outside this date range
```

### Example 2: Check Wedding Season Availability (Combine Filters)

**Steps:**
1. **Product Type:** Sherwani
2. **Category:** Male
3. **Size:** 40
4. **Booked From:** `2025-11-01`
5. **Booked To:** `2025-11-30`

**Result:**
Shows only **Sherwani, Size 40** products that have bookings in November 2025

---

## 🔍 Filter Combinations

### Scenario 1: All Booked Products (Any Type)
- **From Date:** Select date
- **To Date:** Select date
- **Other Filters:** Leave empty
- **Result:** All products booked in that range

### Scenario 2: Booked Fancy Costumes for Kids
- **Product Type:** Fancy Costumes
- **From Date:** Select event date
- **To Date:** Select event end date
- **Result:** Only fancy costumes booked during event

### Scenario 3: Male Sherwanis Booked This Month
- **Product Type:** Sherwani
- **Category:** Male
- **From Date:** First day of month
- **To Date:** Last day of month
- **Result:** Male Sherwanis with bookings this month

---

## 💡 Technical Details

### Date Overlap Algorithm:

**Overlap Condition:**
```javascript
booking_start_date <= filter_end_date
AND
booking_end_date >= filter_start_date
```

**Example:**
```
Filter Range:  [Dec 25] ──────────── [Dec 31]

Booking 1:     [Dec 20] ──── [Dec 27]    ✅ OVERLAPS (Dec 25-27)
Booking 2:              [Dec 26] ── [Dec 30]    ✅ OVERLAPS (Dec 26-30)
Booking 3:                      [Dec 29] ──── [Jan 3]   ✅ OVERLAPS (Dec 29-31)
Booking 4:     [Dec 15] ── [Dec 20]    ❌ NO OVERLAP (before range)
Booking 5:                              [Jan 5] ── [Jan 10]  ❌ NO OVERLAP (after range)
```

### Booking Status Filter:
Only counts bookings with status:
- ✅ `confirmed` - Active confirmed bookings
- ✅ `active` - Currently ongoing bookings
- ❌ `cancelled` - Ignored
- ❌ `completed` - Ignored (past bookings)
- ❌ `pending` - Ignored (not confirmed yet)

---

## 📚 Data Flow

### 1. Component Load:
```javascript
useEffect(() => {
  fetchProducts();      // Load all products
  fetchAllBookings();   // Load all bookings
}, []);
```

### 2. User Selects Date Range:
```javascript
setFilterFromDate('2025-12-25');
setFilterToDate('2025-12-31');
```

### 3. Filter Applied:
```javascript
filteredProducts = products.filter((product) => {
  // Check if product has any bookings in selected range
  const hasOverlappingBooking = allBookings.some((booking) => {
    // Match product ID
    if (booking.product_id !== product.id) return false;
    
    // Check status
    if (booking.status !== 'confirmed' && booking.status !== 'active') 
      return false;
    
    // Check date overlap
    return (
      booking.booked_from <= filterToDate &&
      booking.booked_to >= filterFromDate
    );
  });
  
  return hasOverlappingBooking;
});
```

### 4. Display Results:
- Table shows only matching products
- Info box shows selected date range

---

## 🎯 Use Cases

### For Business Planning:

**1. Event Management:**
```
Scenario: School function on Dec 15
Action: Filter Dec 10-20 to see booked fancy costumes
Result: Plan inventory for other events
```

**2. Peak Season Analysis:**
```
Scenario: Wedding season Nov-Feb
Action: Filter each month separately
Result: Identify most booked products
```

**3. Inventory Availability:**
```
Scenario: Customer wants Sherwani for Jan 10
Action: Filter Jan 5-15, Size 40, Sherwani
Result: See if any Size 40 Sherwanis are booked
```

**4. Revenue Forecasting:**
```
Scenario: Predict Q1 revenue
Action: Filter Jan-Mar by product type
Result: Count bookings per category
```

### For Daily Operations:

**1. Quick Availability Check:**
- Customer calls: "Do you have Lehenga for this weekend?"
- Filter: This Sat-Sun, Product Type: Lehenga
- Result: Instant answer on availability

**2. Booking Conflicts:**
- Before confirming booking, check date range
- See which products are already booked
- Suggest alternatives if needed

**3. Maintenance Planning:**
- Filter next week's bookings
- Prepare products in advance
- Quality check before pickup

---

## ✨ Features

### ✅ Smart Date Picker:
- Native HTML5 date input
- Calendar popup for easy selection
- Keyboard navigation support
- Format: YYYY-MM-DD

### ✅ Visual Feedback:
- Info box shows selected range
- Clear indication of filter being active
- "Clear Filters" button resets everything

### ✅ Performance:
- Bookings loaded once on page load
- Client-side filtering (instant results)
- No server requests when changing dates

### ✅ Flexible:
- Works with any date range (days, weeks, months)
- Combines with other filters
- No date range required (optional filter)

---

## 🚀 Testing the Feature

### Test Case 1: Basic Date Filter
1. Go to Inventory page
2. Select **From Date:** Today
3. Select **To Date:** 7 days from today
4. ✅ Should show only products with bookings in next 7 days

### Test Case 2: No Bookings in Range
1. Select a far future date (e.g., 2026-12-25 to 2026-12-31)
2. ✅ Should show empty table or "No products found"

### Test Case 3: Combine with Product Type
1. **Product Type:** Fancy Costumes
2. **From Date:** This month start
3. **To Date:** This month end
4. ✅ Should show only Fancy Costumes booked this month

### Test Case 4: Clear Filters
1. Set date range and other filters
2. Click "Clear Filters"
3. ✅ All filters should reset
4. ✅ Full inventory should be visible again

### Test Case 5: Date Range Display
1. Select dates
2. ✅ Blue info box should appear showing: "🔍 Showing: Products booked between [date1] and [date2]"

---

## 🎨 UI Design

### Filter Layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ Inventory                                          [+ Add Product]│
├──────────────────────────────────────────────────────────────────┤
│ [Search...]                                      Showing X items  │
│                                                                    │
│ ROW 1:                                                             │
│ ┌──────────────┬──────────────┬──────────────────────────────┐  │
│ │ Product Type │ Category     │ Size                         │  │
│ │ [Dropdown▼]  │ [Dropdown▼]  │ [Dropdown▼]                 │  │
│ └──────────────┴──────────────┴──────────────────────────────┘  │
│                                                                    │
│ ROW 2:                                                             │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐  │
│ │ From Date    │ To Date      │ [Info Box]   │ [Clear Btn]  │  │
│ │ [YYYY-MM-DD] │ [YYYY-MM-DD] │ Products...  │              │  │
│ └──────────────┴──────────────┴──────────────┴──────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Responsive Behavior:
- Desktop: Filters in 2 rows, side by side
- Mobile: Filters stack vertically (future enhancement)

---

## 📝 Important Notes

### Booking Status:
- Only `confirmed` and `active` bookings are counted
- `cancelled`, `completed`, `pending` bookings are excluded

### Date Format:
- Input: `YYYY-MM-DD` (ISO 8601)
- Display: Locale-based (e.g., "12/25/2025" in US)

### Edge Cases:
- **Only From Date:** Filter is not applied (both dates required)
- **Only To Date:** Filter is not applied (both dates required)
- **Invalid Range (To < From):** Still works (no bookings will match)

### Performance:
- All bookings loaded once on page load
- Filtering happens in browser (instant)
- Works well with 1000+ products and bookings

---

## 🔮 Future Enhancements

### Possible Additions:

**1. Available Products Filter:**
```
Toggle: [Booked Products] / [Available Products]
- Currently shows booked products
- Could add option to show available (non-booked) products
```

**2. Date Presets:**
```
Quick Filters:
- [This Week] [This Month] [Next 7 Days] [Next 30 Days]
```

**3. Booking Count:**
```
Show number of bookings per product in selected range:
Sherwani SH-000001 (3 bookings in selected range)
```

**4. Visual Calendar:**
```
Instead of date inputs, show mini calendar with:
- Booked dates highlighted
- Click to select range
```

**5. Export Filtered Results:**
```
[Export to CSV] button to download filtered products
```

---

## ✅ Summary

### What This Filter Does:
✅ Shows products that **have bookings** in selected date range
✅ Combines with other filters (type, category, size)
✅ Uses smart date overlap detection
✅ Ignores cancelled/completed bookings
✅ Provides visual feedback of active filter

### When to Use:
- Planning inventory for events
- Checking availability for specific dates
- Analyzing booking patterns
- Managing peak season inventory
- Quick availability checks for customers

### How to Clear:
Click **"Clear Filters"** button to reset all filters including date range

---

## 🎯 Quick Reference

| Action | Result |
|--------|--------|
| Select both dates | Shows products booked in that range |
| Select only one date | Filter not applied (both required) |
| Clear filters | Shows all products |
| Combine with product type | Shows only that type booked in range |
| No products shown | No bookings in selected date range |

---

This date range filter makes inventory management more powerful by letting you quickly identify booking patterns and availability! 📅✨

