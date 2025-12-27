# API Usage Examples

## Products API

### Get All Products
```bash
curl http://localhost:3001/api/products
```

### Get Products with Filters
```bash
# Search by name or code
curl "http://localhost:3001/api/products?search=bridal"

# Filter by category
curl "http://localhost:3001/api/products?category=Bridal"

# Filter by availability
curl "http://localhost:3001/api/products?availability=true"
```

### Get Product by ID
```bash
curl http://localhost:3001/api/products/1
```

### Create Product
```bash
curl -X POST http://localhost:3001/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bridal Lehanga",
    "code": "BL-002",
    "rent_per_day": 1200,
    "category": "Bridal",
    "description": "Beautiful red bridal lehenga",
    "availability": true
  }'
```

### Update Product
```bash
curl -X PUT http://localhost:3001/api/products/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bridal Lehanga Updated",
    "code": "BL-002",
    "rent_per_day": 1500,
    "category": "Bridal",
    "availability": false
  }'
```

### Delete Product
```bash
curl -X DELETE http://localhost:3001/api/products/1
```

## Bookings API

### Get All Bookings
```bash
curl http://localhost:3001/api/bookings
```

### Get Bookings with Filters
```bash
# Filter by status
curl "http://localhost:3001/api/bookings?status=pending"

# Search by customer name or phone
curl "http://localhost:3001/api/bookings?search=John"
```

### Get Booking by ID
```bash
curl http://localhost:3001/api/bookings/1
```

### Create Booking
```bash
curl -X POST http://localhost:3001/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "John Doe",
    "customer_phone": "9876543210",
    "customer_address": "123 Main St, City",
    "booking_date": "2025-01-15",
    "booked_from": "2025-01-20",
    "booked_to": "2025-01-22",
    "total_amount": 3000,
    "products": [
      {"id": 1, "quantity": 1},
      {"id": 2, "quantity": 1}
    ]
  }'
```

### Update Booking
```bash
curl -X PUT http://localhost:3001/api/bookings/1 \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "John Doe Updated",
    "customer_phone": "9876543210",
    "booked_from": "2025-01-21",
    "booked_to": "2025-01-23",
    "status": "confirmed"
  }'
```

### Delete Booking
```bash
curl -X DELETE http://localhost:3001/api/bookings/1
```

## Users API

### Get All Users
```bash
curl http://localhost:3001/api/users
```

### Get Users with Filters
```bash
# Filter by role
curl "http://localhost:3001/api/users?role=admin"

# Search by name or phone
curl "http://localhost:3001/api/users?search=John"
```

### Get User by ID
```bash
curl http://localhost:3001/api/users/1
```

### Create User
```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "phone": "9876543213",
    "role": "customer"
  }'
```

### Update User
```bash
curl -X PUT http://localhost:3001/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe Updated",
    "phone": "9876543213",
    "role": "salesman"
  }'
```

### Delete User
```bash
curl -X DELETE http://localhost:3001/api/users/1
```

## Health Check

### Check Server Status
```bash
curl http://localhost:3001/api/health
```

Response:
```json
{
  "status": "ok",
  "message": "Server is running",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## Frontend Usage Examples

### Using the API Client

```typescript
import { productsApi, bookingsApi } from '@/lib/api';

// Get all products
const products = await productsApi.getAll();

// Create a product
const newProduct = await productsApi.create({
  name: 'New Product',
  code: 'NP-001',
  rent_per_day: 1000,
  category: 'Formals',
  availability: true
});

// Get all bookings
const bookings = await bookingsApi.getAll();

// Create a booking
const newBooking = await bookingsApi.create({
  customer_name: 'John Doe',
  customer_phone: '9876543210',
  booking_date: '2025-01-15',
  booked_from: '2025-01-20',
  booked_to: '2025-01-22',
  products: [
    { id: 1, quantity: 1 }
  ]
});
```

### React Component Example

```typescript
'use client';

import { useEffect, useState } from 'react';
import { productsApi } from '@/lib/api';
import { Product } from '@/types';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const response = await productsApi.getAll();
        setProducts(response.data);
      } catch (error) {
        console.error('Error fetching products:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Products</h1>
      <ul>
        {products.map(product => (
          <li key={product.id}>
            {product.name} - ₹{product.rent_per_day}/day
          </li>
        ))}
      </ul>
    </div>
  );
}
```

