'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/lib/auth';
import { toast } from '@/lib/toast';

export default function SignInPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');

    if (!validateForm()) return;

    try {
      await login(formData.email, formData.password);
      toast.success('Welcome back!');
      router.push('/home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      setApiError(message);
      toast.error(message);
    }
  };

  const handleGoogleSignIn = () => {
    // TODO: Implement Google OAuth
    toast.info('Google sign-in coming soon!');
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--color-brand-primary)]/10 rounded-full blur-3xl opacity-50 dark:opacity-100" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--color-brand-secondary)]/5 rounded-full blur-3xl opacity-50 dark:opacity-100" />

      <div className="max-w-md w-full relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/landing" className="inline-flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[var(--color-brand-primary)] to-[var(--color-brand-secondary)] rounded-xl flex items-center justify-center shadow-lg shadow-[var(--color-brand-primary)]/30">
              <span className="text-white font-bold text-xl">OR</span>
            </div>
            <span className="text-2xl font-bold text-[var(--color-text-primary)]">OpenResearch</span>
          </Link>
          <h1 className="mt-8 text-3xl font-bold text-[var(--color-text-primary)]">Welcome Back</h1>
          <p className="mt-2 text-[var(--color-text-secondary)]">Sign in to continue your research</p>
        </div>

        {/* Sign In Form */}
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl shadow-xl p-8 border border-[var(--color-border-primary)]">
          {apiError && (
            <div className="mb-6 p-4 bg-[var(--color-error-bg)] border border-[var(--color-error)]/30 rounded-xl text-[var(--color-error)] text-sm">
              {apiError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={errors.email}
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              error={errors.password}
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-[var(--color-border-primary)] text-[var(--color-brand-primary)] focus:ring-[var(--color-brand-secondary)] focus:ring-offset-0 bg-[var(--color-bg-tertiary)]" />
                <span className="ml-2 text-sm text-[var(--color-text-secondary)]">Remember me</span>
              </label>
              <a href="#" className="text-sm text-[var(--color-accent-primary)] hover:text-[var(--color-brand-primary)] transition-colors">
                Forgot password?
              </a>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Divider */}
          <div className="mt-8 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--color-border-primary)]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-[var(--color-bg-secondary)] text-[var(--color-text-tertiary)]">Or continue with</span>
            </div>
          </div>

          {/* Google Sign In */}
          <Button
            type="button"
            variant="secondary"
            className="w-full mt-6"
            onClick={handleGoogleSignIn}
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </Button>

          {/* Sign Up Link */}
          <p className="mt-8 text-center text-sm text-[var(--color-text-tertiary)]">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="text-[var(--color-accent-primary)] hover:text-[var(--color-brand-primary)] font-medium transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}