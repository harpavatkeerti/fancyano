'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { getHomeRoute } from '@/lib/routePermissions';

export default function RootPage() {
  const { user, isAuthenticated, isInitialised } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialised) return; // wait until localStorage has been read
    if (isAuthenticated && user) {
      router.replace(getHomeRoute(user.role));
    } else {
      router.replace('/login');
    }
  }, [isInitialised, isAuthenticated, user]);

  return null;
}
