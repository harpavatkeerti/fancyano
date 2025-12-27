# Shared Code Architecture

## Overview

The project now uses a **shared package** (`shared/`) that contains code used by both web and mobile applications. This eliminates code duplication and ensures consistency.

## Structure

```
app/
├── shared/              # Shared code package
│   ├── src/
│   │   ├── api/        # API client (products, bookings, users)
│   │   └── types/      # TypeScript types
│   └── package.json
├── frontend/           # Next.js web app
│   └── lib/api.ts      # Uses @rental/shared
├── mobile/             # React Native app
│   └── src/lib/api.ts  # Uses @rental/shared
└── backend/            # Node.js API server
```

## What's Shared

### ✅ API Client
- Products API (getAll, getById, create, update, delete)
- Bookings API (getAll, getById, create, update, delete)
- Users API (getAll, getById, create, update, delete)

### ✅ TypeScript Types
- `Product` interface
- `Booking` interface
- `User` interface

### ✅ Business Logic
- API configuration
- Request/response handling

## How It Works

### 1. Shared Package (`shared/`)
Contains platform-agnostic code:
- API client factory functions
- Type definitions
- No platform-specific code

### 2. Web App (`frontend/`)
- Imports from `@rental/shared`
- Configures API with web-specific URL
- Uses Next.js/React components

### 3. Mobile App (`mobile/`)
- Imports from `@rental/shared`
- Configures API with mobile-specific URL (Android emulator, iOS simulator)
- Uses React Native components

## Usage Examples

### Web App
```typescript
// frontend/lib/api.ts
import { createApi } from '@rental/shared';

const api = createApi({ 
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api' 
});

export const productsApi = api.products;
```

### Mobile App
```typescript
// mobile/src/lib/api.ts
import { createApi } from '@rental/shared';

const api = createApi({ 
  baseURL: 'http://10.0.2.2:3001/api' // Android emulator
});

export const productsApi = api.products;
```

### Using Types
```typescript
// Both web and mobile
import { Product, Booking, User } from '@rental/shared';
```

## Benefits

1. **No Code Duplication** - API logic written once
2. **Type Safety** - Shared types ensure consistency
3. **Easy Updates** - Change API logic in one place
4. **Consistency** - Same behavior across platforms
5. **Maintainability** - Single source of truth

## Adding New Features

### Add New API Endpoint

1. **Create API function in shared:**
   ```typescript
   // shared/src/api/complaints.ts
   export function createComplaintsApi(api: AxiosInstance) {
     return {
       getAll: () => api.get('/complaints'),
       // ...
     };
   }
   ```

2. **Export from shared:**
   ```typescript
   // shared/src/api/index.ts
   export { createComplaintsApi } from './complaints';
   ```

3. **Use in web/mobile:**
   ```typescript
   // Both apps automatically get it
   const api = createApi({ baseURL: '...' });
   api.complaints.getAll();
   ```

### Add New Type

1. **Add to shared types:**
   ```typescript
   // shared/src/types/index.ts
   export interface Complaint {
     id: number;
     // ...
   }
   ```

2. **Use anywhere:**
   ```typescript
   import { Complaint } from '@rental/shared';
   ```

## Building Shared Package

The shared package uses TypeScript and can be built:

```bash
cd shared
npm run build
```

This creates JavaScript in `dist/` folder (though with workspaces, TypeScript is usually handled by the consuming apps).

## Workspace Configuration

The root `package.json` uses npm workspaces:

```json
{
  "workspaces": [
    "frontend",
    "backend",
    "mobile",
    "shared"
  ]
}
```

This allows:
- `npm install` at root installs all dependencies
- Packages can reference each other (e.g., `@rental/shared`)
- Shared dependencies are hoisted

## Platform-Specific Code

Platform-specific code stays in respective apps:
- **Web**: Next.js pages, React components, web-specific UI
- **Mobile**: React Native screens, mobile-specific UI, native features

Only **business logic** and **API client** are shared.

## Future Enhancements

Potential additions to shared package:
- Validation utilities
- Date formatting helpers
- Business logic functions
- Constants and configuration
- Error handling utilities

