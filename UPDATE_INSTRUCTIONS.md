# Update Instructions: Migrating to Shared Code

## Steps to Update Your Project

### 1. Install Dependencies

From the root directory:
```bash
npm install
```

This will install dependencies for all workspaces including the new `shared` package.

### 2. Verify Shared Package

Check that `shared/` directory exists with:
- `package.json`
- `src/api/` folder
- `src/types/` folder

### 3. Test Web App

```bash
cd frontend
npm run dev
```

The web app should work exactly as before, but now uses shared code.

### 4. Test Mobile App

```bash
cd mobile
npm install
npm start
```

The mobile app should work exactly as before, but now uses shared code.

## What Changed

### ✅ No Breaking Changes
- All existing functionality works the same
- Same API endpoints
- Same UI/UX
- Same features

### ✅ Code Organization
- API client code moved to `shared/`
- Types moved to `shared/`
- Web and mobile import from shared package

### ✅ Benefits
- Single source of truth for API logic
- No code duplication
- Easier to maintain
- Type safety across platforms

## Verification

1. **Web app works**: http://localhost:3000
2. **Mobile app works**: Run `npm start` in mobile/
3. **API calls work**: Check network tab/console
4. **No errors**: Check for TypeScript/build errors

## Troubleshooting

### "Cannot find module '@rental/shared'"
- Run `npm install` from root directory
- Make sure `shared/` folder exists
- Check `package.json` workspaces include "shared"

### TypeScript Errors
- Make sure `shared/tsconfig.json` exists
- Run `npm install` to ensure types are available

### API Not Working
- Check API URL configuration in `frontend/lib/api.ts` and `mobile/src/lib/api.ts`
- Make sure backend is running

## Next Steps

Now that code is shared:
1. Add new API endpoints in `shared/src/api/`
2. Add new types in `shared/src/types/`
3. Both web and mobile automatically get updates!

