'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { authApi } from '@/lib/authApi';
import { getHomeRoute } from '@/lib/routePermissions';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, user } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to appropriate home
  useEffect(() => {
    if (isAuthenticated && user) {
      router.replace(getHomeRoute(user.role));
    }
  }, [isAuthenticated, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.login({ username, password });
      const { token, user: loggedInUser, expiresAt } = response.data;

      login({ user: loggedInUser, token, expiresAt });

      // Redirect based on role
      router.replace(getHomeRoute(loggedInUser.role));
    } catch (err: any) {
      const message = err.response?.data?.error || 'Login failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '24px',
        padding: '48px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '0.15em',
            background: 'linear-gradient(90deg, #a78bfa, #60a5fa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>
            FAN-C-YA-NO
          </div>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', margin: 0 }}>
            Sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Username */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px',
              letterSpacing: '0.05em',
            }}>
              USERNAME
            </label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              placeholder="Enter your username"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: '28px' }}>
            <label style={{
              display: 'block',
              color: 'rgba(255,255,255,0.7)',
              fontSize: '13px',
              fontWeight: 500,
              marginBottom: '8px',
              letterSpacing: '0.05em',
            }}>
              PASSWORD
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(167,139,250,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.15)'}
            />
          </div>

          {/* Error message */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              color: '#fca5a5',
              fontSize: '14px',
              marginBottom: '20px',
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: loading
                ? 'rgba(167,139,250,0.4)'
                : 'linear-gradient(135deg, #a78bfa, #60a5fa)',
              border: 'none',
              borderRadius: '12px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.2s, transform 0.1s',
              letterSpacing: '0.03em',
            }}
            onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.opacity = '0.9'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.opacity = '1'; }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
