# Shared Package

This package contains shared code used by both web and mobile applications:
- API client
- TypeScript types
- Business logic

## Usage

### In Web App (Next.js)
```typescript
import { createApi } from '@rental/shared';
import { Product, Booking } from '@rental/shared';

const api = createApi({ baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api' });
const products = await api.products.getAll();
```

### In Mobile App (React Native)
```typescript
import { createApi } from '@rental/shared';
import { Product, Booking } from '@rental/shared';

const api = createApi({ baseURL: 'http://10.0.2.2:3001/api' });
const products = await api.products.getAll();
```

## Building

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

