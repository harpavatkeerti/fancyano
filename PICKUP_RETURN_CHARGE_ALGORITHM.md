# Early Pickup & Late Return Charge Algorithm

## 📊 Complete Algorithm Documentation

### 🎯 Purpose
Allow admin to charge customers for:
1. **Early Pickup**: Picking up products before scheduled date
2. **Late Return**: Returning products after scheduled date

---

## 🔢 Algorithm 1: Early Pickup Charges

### Formula:
```
Early Pickup Charge = Days Early × Rent Per Day × Charge Percentage
```

### Calculation Steps:
```javascript
1. Get scheduled pickup date (from booking)
2. Get actual pickup date (when customer came)
3. Calculate days difference:
   Days Early = Scheduled Date - Actual Date
4. If Days Early > 0:
   Charge = Days Early × Rent Per Day × (Charge % / 100)
```

### Example 1: Early Pickup with 50% Charge
```
Booking Details:
- Product: Sherwani
- Rent Per Day: ₹1000
- Scheduled Pickup: Jan 10, 2025
- Actual Pickup: Jan 7, 2025
- Early Pickup Charge Setting: 50%

Calculation:
Days Early = Jan 10 - Jan 7 = 3 days
Charge = 3 × ₹1000 × 50% = ₹1,500

Final Bill:
Base Rent: ₹3,000 (3 days × ₹1,000)
Early Pickup Charge: ₹1,500
Total: ₹4,500
```

### Example 2: No Early Pickup Charge (0%)
```
Setting: Early Pickup Charge = 0%
Days Early: 3 days
Charge = 3 × ₹1000 × 0% = ₹0
(Admin allows early pickup for free)
```

---

## 🔢 Algorithm 2: Late Return Charges

### Formula:
```
Late Return Charge = Days Late × Rent Per Day × Charge Percentage
```

### Calculation Steps:
```javascript
1. Get scheduled return date (from booking)
2. Get actual return date (when customer returned)
3. Calculate days difference:
   Days Late = Actual Date - Scheduled Date
4. If Days Late > 0:
   Charge = Days Late × Rent Per Day × (Charge % / 100)
```

### Example 1: Late Return with 100% Charge
```
Booking Details:
- Product: Lehenga
- Rent Per Day: ₹2000
- Scheduled Return: Jan 15, 2025
- Actual Return: Jan 18, 2025
- Late Return Charge Setting: 100% (default)

Calculation:
Days Late = Jan 18 - Jan 15 = 3 days
Charge = 3 × ₹2000 × 100% = ₹6,000

Final Bill:
Base Rent: ₹10,000 (5 days booking)
Late Return Charge: ₹6,000
Total: ₹16,000
```

### Example 2: Late Return with 150% Penalty
```
Setting: Late Return Charge = 150% (penalty)
Days Late: 2 days
Rent Per Day: ₹1,500
Charge = 2 × ₹1,500 × 150% = ₹4,500
(Higher penalty for late returns)
```

---

## 🎨 Combined Example: Both Early & Late

### Scenario:
```
Product: Sherwani
Rent Per Day: ₹1,000
Booking: Jan 10 - Jan 15 (5 days)

Customer Timeline:
- Picked up: Jan 8 (2 days early)
- Returned: Jan 17 (2 days late)

Settings:
- Early Pickup Charge: 30%
- Late Return Charge: 100%

Calculations:
1. Early Pickup:
   2 days × ₹1,000 × 30% = ₹600

2. Late Return:
   2 days × ₹1,000 × 100% = ₹2,000

Final Bill:
Base Rent: ₹5,000 (5 days)
Early Pickup: ₹600
Late Return: ₹2,000
Total: ₹7,600
```

---

## 🏗️ Backend Algorithm Structure

### Database Fields Added:
```sql
product_tracking table:
- actual_pickup_date (TIMESTAMP)
- scheduled_pickup_date (TIMESTAMP)
- is_early_pickup (BOOLEAN)
- early_pickup_days (INTEGER)
- actual_return_date (TIMESTAMP)
- scheduled_return_date (TIMESTAMP)
- is_late_return (BOOLEAN)
- late_return_days (INTEGER)
```

### Settings Table:
```sql
settings table entries:
- early_pickup_charge_percent (0-100)
- late_return_charge_percent (0-500)
```

### API Functions:

#### 1. Calculate Early Pickup
```javascript
calculateEarlyPickupCharge(
  scheduledDate,    // From booking
  actualDate,       // Current date/time
  rentPerDay,       // Product rent
  chargePercent     // From settings
)
Returns: {
  isEarly: true/false,
  days: 3,
  chargeAmount: 1500,
  chargePercent: 50,
  description: "Early pickup by 3 days"
}
```

#### 2. Calculate Late Return
```javascript
calculateLateReturnCharge(
  scheduledDate,    // From booking
  actualDate,       // Current date/time
  rentPerDay,       // Product rent
  chargePercent     // From settings (default 100)
)
Returns: {
  isLate: true/false,
  days: 2,
  chargeAmount: 4000,
  chargePercent: 100,
  description: "Late return by 2 days"
}
```

#### 3. Calculate Complete Booking
```javascript
calculateBookingCharges(booking, products, settings)
Returns: {
  baseAmount: 10000,
  earlyPickupCharge: 600,
  lateReturnCharge: 2000,
  additionalCharges: 2600,
  finalAmount: 12600,
  productCharges: [...details per product...],
  settings: { earlyPickupChargePercent: 30, ... }
}
```

---

## 🎯 Admin Settings (Future Implementation)

### In Settings & Policies Page:

```
┌─────────────────────────────────────────┐
│ Pickup & Return Charges                 │
├─────────────────────────────────────────┤
│                                          │
│ Early Pickup Charge                      │
│ [____30____]%                            │
│ Charge percentage if customer picks up   │
│ before scheduled date                    │
│                                          │
│ Late Return Charge                       │
│ [____100____]%                           │
│ Charge percentage if customer returns    │
│ late (100% = full rent rate)            │
│                                          │
│ [Save Settings]                          │
└─────────────────────────────────────────┘
```

### Common Settings:
- **0%** - No charge (free early pickup/no late penalty)
- **30%** - Discounted charge
- **50%** - Half rate
- **100%** - Full rental rate
- **150%** - Penalty rate (1.5x)
- **200%** - Double penalty

---

## 📱 How Admin Uses It

### When Customer Picks Up Early:
```
1. Admin clicks "Pickup" checkbox
2. System captures current date/time
3. Compares with scheduled pickup date
4. If early:
   ✓ Calculates charge automatically
   ✓ Shows: "Early pickup by 2 days - Charge: ₹600"
   ✓ Adds to bill
```

### When Customer Returns Late:
```
1. Admin clicks "Return" checkbox
2. System captures current date/time
3. Compares with scheduled return date
4. If late:
   ✓ Calculates charge automatically
   ✓ Shows: "Late return by 3 days - Charge: ₹3,000"
   ✓ Adds to bill
```

---

## 🔄 Real-World Scenarios

### Scenario 1: Wedding Urgency (Early Pickup)
```
Customer: "Wedding moved up by 2 days, need dress now!"
Admin: Allows early pickup
System: 
- Scheduled: Jan 15
- Actual: Jan 13
- Days Early: 2
- Setting: 20% early charge
- Extra Charge: ₹400
- Customer pays extra for urgency
```

### Scenario 2: Travel Delay (Late Return)
```
Customer: Returns 4 days late due to flight delay
System:
- Scheduled: Jan 20
- Actual: Jan 24
- Days Late: 4
- Setting: 100% late charge
- Extra Charge: ₹8,000 (4 × ₹2,000/day)
- Customer pays for extra rental days
```

### Scenario 3: No Charges
```
Admin Setting: Early = 0%, Late = 0%
Customer picks up early: ₹0 extra
Customer returns late: ₹0 extra
(Flexible policy, no penalties)
```

---

## 💰 Charge Examples by Product Type

### Sherwani (₹1,000/day):
```
Early Pickup Charges (30%):
- 1 day early: ₹300
- 2 days early: ₹600
- 5 days early: ₹1,500

Late Return Charges (100%):
- 1 day late: ₹1,000
- 3 days late: ₹3,000
- 7 days late: ₹7,000
```

### Lehenga (₹2,500/day):
```
Early Pickup Charges (50%):
- 1 day early: ₹1,250
- 2 days early: ₹2,500

Late Return Charges (150% penalty):
- 1 day late: ₹3,750
- 2 days late: ₹7,500
```

---

## 📊 Charge Summary Display

### On Invoice:
```
┌─────────────────────────────────────────┐
│ INVOICE #123                             │
├─────────────────────────────────────────┤
│ Base Rental (5 days)         ₹5,000     │
│                                          │
│ Additional Charges:                      │
│ • Early Pickup (2 days)      ₹600       │
│ • Late Return (3 days)       ₹3,000     │
│                                          │
│ TOTAL AMOUNT                 ₹8,600     │
└─────────────────────────────────────────┘
```

---

## 🎯 Benefits of Algorithm

✅ **Automated**: No manual calculation needed
✅ **Flexible**: Admin controls charge percentages
✅ **Transparent**: Customer sees breakdown
✅ **Fair**: Based on actual dates
✅ **Profitable**: Captures extra charges
✅ **Configurable**: Can be turned off (0%)

---

## 🔧 Implementation Status

✅ **Algorithm Created**: Math logic ready
✅ **Backend Module**: Functions implemented
✅ **Database Schema**: Fields defined
⏳ **Settings Page**: To be added
⏳ **Frontend Display**: To be added
⏳ **Invoice Integration**: To be added

---

## 📝 Next Steps

1. Add columns to database (manual SQL)
2. Add settings in Settings & Policies page
3. Update tracking modal to show charges
4. Update invoice to include charges
5. Test with various scenarios

**Algorithm is ready! Just needs UI integration.** 🚀

