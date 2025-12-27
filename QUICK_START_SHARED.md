# Quick Start: Shared Code Setup

## ✅ What's Been Done

I've restructured your project to use **shared code** between web, Android, and iOS. No more duplication!

## 📁 New Structure

```
app/
├── shared/              # ✨ NEW: Shared code package
│   ├── src/
│   │   ├── api/        # API client (used by web & mobile)
│   │   └── types/      # TypeScript types (used by web & mobile)
│   └── package.json
├── frontend/           # Web app (uses @rental/shared)
├── mobile/             # Mobile app (uses @rental/shared)
└── backend/            # API server
```

## 🚀 Quick Setup

### Step 1: Install All Dependencies
```bash
npm install
```

This installs dependencies for all packages including the new `shared` package.

### Step 2: Verify It Works

**Web App:**
```bash
cd frontend
npm run dev
```

**Mobile App:**
```bash
cd mobile
npm install  # First time only
npm start
```

## ✨ Benefits

1. **No Code Duplication** - API logic written once in `shared/`
2. **Type Safety** - Same types across web and mobile
3. **Easy Updates** - Change API logic once, works everywhere
4. **Consistency** - Same behavior on all platforms

## 📝 How It Works

### Shared Code (`shared/`)
- API client functions
- TypeScript types
- Platform-agnostic business logic

### Web App (`frontend/`)
- Imports from `@rental/shared`
- Uses Next.js/React for UI
- Platform-specific: web UI components

### Mobile App (`mobile/`)
- Imports from `@rental/shared`
- Uses React Native for UI
- Platform-specific: mobile UI components

## 🔧 Usage Example

Both web and mobile now use the same API:

```typescript
// Same code in both frontend/lib/api.ts and mobile/src/lib/api.ts
import { createApi } from '@rental/shared';

const api = createApi({ baseURL: '...' });
const products = await api.products.getAll();
```

## 📚 Documentation

- **Full Guide**: See `SHARED_CODE_GUIDE.md`
- **Update Instructions**: See `UPDATE_INSTRUCTIONS.md`

## ⚠️ Important

After running `npm install`, both web and mobile will automatically use the shared code. No other changes needed!

The shared package is included in npm workspaces, so it's automatically linked.

