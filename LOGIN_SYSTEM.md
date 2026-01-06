# Login System Documentation

## Overview
A simple name-based login system has been implemented for all three portals (Admin, Salesman, Customer). Password authentication will be added in a future update.

## Current Implementation

### 1. **Salesman Portal** (`/salesman`)
- **Login Modal**: Appears on first visit or when no name is stored
- **Required Fields**: 
  - Name (required)
- **Storage Keys**:
  - `salesman_name`: Salesman's name
  - `name`: Backup storage
  - `user`: JSON object with `{ name, userName }`
- **Usage**: 
  - Name is used to track bookings created by each salesman
  - Enables commission tracking
  - Filters "My Bookings" to show only salesman's own bookings

### 2. **Customer Portal** (`/customer`)
- **Login Modal**: Appears on first visit or when no name is stored
- **Required Fields**: 
  - Name (required)
  - Email (optional - for future booking updates)
- **Storage Keys**:
  - `customer_name`: Customer's name
  - `customer_email`: Customer's email (if provided)
  - `customer_user`: JSON object with `{ name, userName, email }`
- **Usage**: 
  - Name is pre-filled in the cart/booking form
  - Used to identify customer bookings
  - Email will be used for booking notifications (future)

### 3. **Admin Portal** (`/admin`)
- **Login Modal**: Appears on first visit or when no name is stored
- **Required Fields**: 
  - Name (required)
  - Username (optional - auto-generated from name if empty)
- **Storage Keys**:
  - `admin_name`: Admin's name
  - `admin_username`: Admin's username
  - `admin_user`: JSON object with `{ name, userName, username, role: 'admin' }`
- **Usage**: 
  - Identifies admin user
  - Role-based access (future)

## Features

### Current Features
✅ **Name-based login** for all portals
✅ **Persistent sessions** using localStorage
✅ **Auto-fill forms** with logged-in user data
✅ **Modal-based UI** for login prompts
✅ **No password required** (temporary)
✅ **User tracking** for bookings and actions

### Planned Features (Future Updates)
🔲 **Password authentication**
🔲 **Secure password hashing**
🔲 **Session expiry/timeout**
🔲 **Remember me** functionality
🔲 **Logout** button
🔲 **Profile management**
🔲 **Password reset** functionality
🔲 **Email verification**
🔲 **Two-factor authentication** (optional)
🔲 **Backend authentication API**
🔲 **JWT tokens** for secure sessions

## Technical Details

### Login Flow
1. User visits portal (Admin/Salesman/Customer)
2. Layout component checks localStorage for user data
3. If no valid user data found, login modal appears
4. User enters required information (name, email, etc.)
5. Data is stored in localStorage
6. Modal closes and user can access the portal
7. User data persists across sessions until cleared

### Data Storage Structure

#### Salesman
```javascript
{
  name: "John Doe",
  userName: "John Doe"
}
```

#### Customer
```javascript
{
  name: "Jane Smith",
  userName: "Jane Smith",
  email: "jane@example.com"
}
```

#### Admin
```javascript
{
  name: "Admin User",
  userName: "Admin User",
  username: "adminuser",
  role: "admin"
}
```

### Files Modified
- `frontend/app/salesman/layout.tsx` - Added login modal
- `frontend/app/customer/layout.tsx` - Added login modal
- `frontend/components/layout/AdminLayout.tsx` - Added login modal
- `frontend/app/customer/cart/page.tsx` - Auto-fill customer name
- `frontend/app/salesman/cart/page.tsx` - Store salesman name with booking
- `frontend/app/salesman/my-bookings/page.tsx` - Filter by salesman name

## Security Considerations

### Current State (Development)
⚠️ **WARNING**: This is a development/demo implementation
- No password protection
- Data stored in plain text in localStorage
- No server-side validation
- Anyone can access any portal
- No session management

### Before Production
Before deploying to production, implement:
1. **Backend Authentication API**
   - User registration endpoint
   - Login endpoint with password verification
   - JWT token generation
   - Token refresh mechanism

2. **Password Security**
   - Hash passwords using bcrypt or similar
   - Minimum password requirements
   - Password strength indicator
   - Secure password reset flow

3. **Session Management**
   - JWT tokens instead of localStorage
   - Token expiration (e.g., 24 hours)
   - Refresh token mechanism
   - Logout functionality

4. **Role-Based Access Control (RBAC)**
   - Verify user role on backend
   - Protect admin routes
   - Limit salesman permissions
   - Customer-specific data access

5. **Additional Security**
   - HTTPS only
   - CSRF protection
   - Rate limiting on login attempts
   - Account lockout after failed attempts
   - Audit logging

## Usage Examples

### Check if User is Logged In
```javascript
// Salesman
const userData = localStorage.getItem('user');
const salesmanName = userData ? JSON.parse(userData).name : '';

// Customer
const customerData = localStorage.getItem('customer_user');
const customerName = customerData ? JSON.parse(customerData).name : '';

// Admin
const adminData = localStorage.getItem('admin_user');
const adminName = adminData ? JSON.parse(adminData).name : '';
```

### Manually Clear Login (Logout)
```javascript
// Salesman
localStorage.removeItem('salesman_name');
localStorage.removeItem('name');
localStorage.removeItem('user');

// Customer
localStorage.removeItem('customer_name');
localStorage.removeItem('customer_email');
localStorage.removeItem('customer_user');

// Admin
localStorage.removeItem('admin_name');
localStorage.removeItem('admin_username');
localStorage.removeItem('admin_user');

// Then refresh the page
window.location.reload();
```

## Testing

### Test Login Flow
1. Open browser DevTools (F12)
2. Go to Application/Storage → Local Storage
3. Clear all storage for localhost:3000
4. Navigate to any portal
5. Login modal should appear
6. Enter name and submit
7. Verify data is stored in localStorage
8. Refresh page - should not show modal again

### Test Booking Creation
1. Login as salesman
2. Create a booking
3. Check browser console for: `📝 Creating booking with created_by: [Name]`
4. Go to "My Bookings"
5. Check console for: `🔍 Fetching bookings for salesman: [Name]`
6. Verify booking appears in the list

## Notes
- All login data is currently stored in **localStorage** (not secure for production)
- Password fields are commented out in the code with `/* */` for easy future implementation
- The system is designed to be easily upgraded to full authentication
- Each portal has its own separate login/user data

