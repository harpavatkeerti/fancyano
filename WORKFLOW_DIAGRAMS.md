# Workflow Diagrams - Rental Booking Management System

## 1. Booking Creation Workflow

```
Customer/Salesman                    System                    Admin
     │                                  │                        │
     │─── Browse Products ────────────>│                        │
     │                                  │                        │
     │<─── Product List ───────────────│                        │
     │                                  │                        │
     │─── Select Product & Dates ──────>│                        │
     │                                  │                        │
     │                                  │─── Check Availability ─>│
     │                                  │<─── Availability Status ─│
     │                                  │                        │
     │<─── Availability Confirmation ───│                        │
     │                                  │                        │
     │─── Enter Contact & Address ────>│                        │
     │                                  │                        │
     │─── Proceed to Payment ──────────>│                        │
     │                                  │                        │
     │                                  │─── Payment Gateway ────>│
     │                                  │<─── Payment Status ────│
     │                                  │                        │
     │<─── Booking Confirmation ────────│                        │
     │                                  │                        │
     │                                  │─── Notify Admin ───────>│
     │                                  │                        │
     │<─── Booking Details & Invoice ──│                        │
```

## 2. Booking Status Lifecycle

```
[Pending] ──> [Confirmed] ──> [In Progress] ──> [Completed]
    │              │                 │                │
    │              │                 │                │
    └──────────────┴─────────────────┴────────────────┘
         [Cancelled] (at any stage)
```

**Status Definitions:**
- **Pending**: Booking created, payment pending
- **Confirmed**: Payment received, booking confirmed
- **In Progress**: Product delivered, rental period active
- **Completed**: Product returned, rental period ended
- **Cancelled**: Booking cancelled (refund if applicable)

## 3. Inventory Availability Check Flow

```
Booking Request
     │
     ├───> Check Product Availability
     │         │
     │         ├───> Query Database
     │         │         │
     │         │         ├───> Check Existing Bookings
     │         │         │         │
     │         │         │         ├───> Date Range Overlap?
     │         │         │         │         │
     │         │         │         │         ├───> YES ──> Not Available
     │         │         │         │         │
     │         │         │         │         └───> NO ──> Available
     │         │         │         │
     │         │         │         └───> Check Total Quantity
     │         │         │                   │
     │         │         │                   ├───> Available Units > 0?
     │         │         │                   │         │
     │         │         │                   │         ├───> YES ──> Available
     │         │         │                   │         │
     │         │         │                   │         └───> NO ──> Not Available
     │         │         │                   │
     │         │         │                   └───> Update Redis Cache
     │         │         │
     │         │         └───> Return Availability Status
     │         │
     │         └───> Return to User
```

## 4. Payment Processing Workflow

```
User Initiates Payment
     │
     ├───> Create Payment Intent
     │         │
     │         ├───> Calculate Amount
     │         │         │
     │         │         ├───> Base Rent (days × rate)
     │         │         ├───> Discounts (if applicable)
     │         │         ├───> Taxes
     │         │         └───> Security Deposit
     │         │
     │         └───> Generate Payment Link/Intent
     │
     ├───> Redirect to Payment Gateway
     │
     ├───> User Completes Payment
     │
     ├───> Payment Gateway Webhook
     │         │
     │         ├───> Verify Payment Signature
     │         ├───> Update Payment Status
     │         ├───> Update Booking Status
     │         ├───> Send Confirmation
     │         └───> Notify Admin
```

## 5. Admin Workflow - Booking Management

```
Admin Dashboard
     │
     ├───> View Bookings
     │         │
     │         ├───> Filter by Status/Date
     │         ├───> Search by Customer/Order ID
     │         └───> View Booking Details
     │
     ├───> Modify Booking
     │         │
     │         ├───> Change Dates
     │         ├───> Update Contact/Address
     │         ├───> Apply Discounts
     │         └───> Save Changes
     │
     ├───> Cancel Booking
     │         │
     │         ├───> Confirm Cancellation
     │         ├───> Process Refund (if applicable)
     │         ├───> Update Inventory
     │         └───> Notify Customer
     │
     └───> Generate Reports
               │
               ├───> Revenue Reports
               ├───> Booking Analytics
               ├───> Product Performance
               └───> Export (PDF/Excel)
```

## 6. User Roles & Permissions

```
┌─────────────────────────────────────────────────────────┐
│                    USER ROLES                            │
├──────────────────┬──────────────────┬───────────────────┤
│   ADMIN          │   SALESMAN       │   CUSTOMER        │
├──────────────────┼──────────────────┼───────────────────┤
│ • Full Access    │ • View Products  │ • Browse Products │
│ • Manage Users   │ • Create Bookings│ • Create Bookings │
│ • Manage Products│ • View Bookings  │ • View Own Bookings│
│ • Manage Bookings│ • Update Status  │ • Cancel Own      │
│ • View Reports   │ • Apply Discounts│   Bookings        │
│ • Manage Settings│ • View Customers │ • Submit Feedback │
│ • Handle Complaints│ • Limited Reports│ • View Invoices  │
└──────────────────┴──────────────────┴───────────────────┘
```

## 7. Notification Flow

```
Event Trigger
     │
     ├───> Booking Created ──> Notify Admin
     │
     ├───> Payment Received ──> Notify Customer & Admin
     │
     ├───> Booking Confirmed ──> Notify Customer
     │
     ├───> Delivery Scheduled ──> Notify Customer
     │
     ├───> Return Reminder (1 day before) ──> Notify Customer
     │
     ├───> Booking Completed ──> Notify Customer & Admin
     │
     ├───> Booking Cancelled ──> Notify Customer & Admin
     │
     └───> Complaint Raised ──> Notify Admin
```

## 8. Missing Workflow: Return & Damage Assessment

```
Return Request
     │
     ├───> Schedule Return Pickup
     │
     ├───> Product Inspection
     │         │
     │         ├───> Check for Damage
     │         ├───> Check for Missing Items
     │         └───> Assess Condition
     │
     ├───> Calculate Charges
     │         │
     │         ├───> Damage Charges (if any)
     │         ├───> Late Return Charges (if any)
     │         └───> Refund Security Deposit
     │
     ├───> Update Booking Status to "Completed"
     │
     ├───> Update Inventory Availability
     │
     └───> Send Final Invoice to Customer
```

## 9. Missing Workflow: Product Management

```
Add/Edit Product
     │
     ├───> Enter Product Details
     │         │
     │         ├───> Name, Code, Category
     │         ├───> Description
     │         ├───> Rent per Day
     │         ├───> Sizes/Variants
     │         └───> Upload Images
     │
     ├───> Set Availability
     │         │
     │         ├───> Total Quantity
     │         └───> Initial Status
     │
     ├───> Save Product
     │
     └───> Update Inventory Cache
```

## 10. Missing Workflow: Complaint Resolution

```
Complaint Raised
     │
     ├───> Admin Receives Notification
     │
     ├───> View Complaint Details
     │
     ├───> Assign to Staff (if needed)
     │
     ├───> Update Resolution Status
     │         │
     │         ├───> Pending
     │         ├───> In Progress
     │         ├───> Resolved
     │         └───> Closed
     │
     ├───> Add Resolution Notes
     │
     └───> Notify Customer of Resolution
```

