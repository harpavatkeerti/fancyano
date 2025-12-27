# Why Do You Need Database Migration?

## What is Migration?

Migration is the process of creating the database **structure** (tables, relationships, indexes) in your PostgreSQL database. Think of it as building the foundation and framework of your application's data storage.

## What Migration Does

When you run `npm run db:migrate`, it:

1. **Creates all the tables** your app needs:
   - `users` - for storing admin, salesman, and customer accounts
   - `products` - for your rental inventory
   - `bookings` - for booking records
   - `booking_products` - to link bookings with products
   - `complaints` - for customer complaints
   - `feedback` - for customer reviews

2. **Sets up relationships** between tables (foreign keys)

3. **Creates indexes** for better query performance

4. **Defines constraints** (like ensuring status values are valid)

## Without Migration

If you don't run migration:
- ❌ No tables exist in your database
- ❌ Your API will fail when trying to save/retrieve data
- ❌ You'll get errors like "relation does not exist"

## With Migration

After running migration:
- ✅ All tables are created
- ✅ Your API can save and retrieve data
- ✅ Your application works properly

## The Error You're Getting

The error `client password must be a string` means:
- Your `backend/.env` file either doesn't exist, or
- The `DB_PASSWORD` is not set correctly

## Quick Fix

1. **Check if `backend/.env` exists:**
   ```bash
   ls backend/.env
   ```

2. **If it doesn't exist, create it:**
   ```bash
   cp backend/.env.example backend/.env
   ```

3. **Edit `backend/.env` and set the password:**
   ```env
   DB_PASSWORD=your_actual_password
   ```
   
   **OR if PostgreSQL has no password (default in WSL), leave it empty:**
   ```env
   DB_PASSWORD=
   ```

4. **Run migration again:**
   ```bash
   cd backend
   npm run db:migrate
   ```

## In WSL - Password Might Not Be Needed

If you installed PostgreSQL in WSL and didn't set a password, you might be able to connect without one. In that case, either:
- Leave `DB_PASSWORD=` empty in `.env`
- Or don't include the password field (the code now handles this)

The updated connection.js file will work with or without a password.

