# Project Structure

```
rental-booking-system/
│
├── frontend/                          # Next.js Frontend Application
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx               # Root layout
│   │   ├── page.tsx                 # Home page
│   │   ├── globals.css              # Global styles
│   │   ├── admin/                   # Admin portal pages
│   │   ├── customer/                # Customer portal pages
│   │   └── salesman/                # Salesman portal pages
│   ├── components/                   # Reusable React components
│   │   ├── common/                  # Common components (Button, Input, etc.)
│   │   ├── products/                # Product-related components
│   │   ├── bookings/                # Booking-related components
│   │   └── admin/                   # Admin-specific components
│   ├── lib/                         # Utilities and helpers
│   │   └── api.ts                   # API client functions
│   ├── types/                       # TypeScript type definitions
│   │   └── index.ts                # Shared types
│   ├── public/                      # Static assets
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── .env.local                   # Frontend environment variables
│
├── backend/                          # Node.js Backend API
│   ├── src/
│   │   ├── server.js                # Express server entry point
│   │   ├── routes/                  # API route handlers
│   │   │   ├── health.js           # Health check endpoint
│   │   │   ├── products.js         # Product CRUD operations
│   │   │   ├── bookings.js         # Booking CRUD operations
│   │   │   └── users.js            # User CRUD operations
│   │   ├── database/                   # Database related files
│   │   │   ├── connection.js       # PostgreSQL connection pool
│   │   │   ├── schema.sql          # Database schema
│   │   │   ├── migrate.js          # Migration script
│   │   │   └── seed.js             # Seed script
│   │   └── middleware/              # Express middleware (future)
│   ├── package.json
│   └── .env                         # Backend environment variables
│
├── database/                         # Database scripts
│   └── schema.sql                   # Complete database schema
│
├── storage/                          # Local file storage
│   └── uploads/                     # Uploaded files
│       ├── products/                # Product images
│       ├── invoices/                # Invoice PDFs
│       └── profiles/                # User profile pictures
│
├── package.json                     # Root package.json (workspace)
├── .gitignore
├── README.md                        # Main project README
├── SETUP_GUIDE.md                  # Detailed setup instructions
├── setup.sh                        # Linux/Mac setup script
├── setup.ps1                       # Windows PowerShell setup script
└── PROJECT_STRUCTURE.md            # This file
```

## Key Files Explained

### Frontend

- **app/**: Next.js 14 App Router directory. All pages go here.
- **components/**: Reusable React components organized by feature.
- **lib/api.ts**: Centralized API client using Axios.
- **types/index.ts**: TypeScript interfaces for type safety.

### Backend

- **src/server.js**: Main Express server setup and middleware configuration.
- **src/routes/**: RESTful API endpoints organized by resource.
- **src/database/**: Database connection, schema, and migration scripts.

### Database

- **schema.sql**: Complete PostgreSQL schema with all tables, indexes, and constraints.

### Storage

- **storage/uploads/**: Local file storage organized by file type.

## API Endpoints

### Products
- `GET /api/products` - List all products (with optional filters)
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Bookings
- `GET /api/bookings` - List all bookings (with optional filters)
- `GET /api/bookings/:id` - Get booking by ID
- `POST /api/bookings` - Create new booking
- `PUT /api/bookings/:id` - Update booking
- `DELETE /api/bookings/:id` - Delete booking

### Users
- `GET /api/users` - List all users (with optional filters)
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Health
- `GET /api/health` - Server health check

## Database Tables

1. **users** - User accounts (admin, salesman, customer)
2. **products** - Rental products catalog
3. **bookings** - Booking records
4. **booking_products** - Many-to-many relationship between bookings and products
5. **complaints** - Customer complaints
6. **feedback** - Customer feedback and ratings

## Development Workflow

1. **Backend Development**: Add routes in `backend/src/routes/`, update schema in `backend/src/database/schema.sql`
2. **Frontend Development**: Create pages in `frontend/app/`, components in `frontend/components/`
3. **Database Changes**: Update schema.sql, run migration: `npm run db:migrate`
4. **Testing**: Use Postman/curl for API, browser for frontend

