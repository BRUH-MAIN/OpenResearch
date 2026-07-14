'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/lib/auth';
import { toast } from '@/lib/toast';

export default function SignUpPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

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

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');

    if (!validateForm()) return;

    try {
      await register(formData.name, formData.email, formData.password);
      toast.success('Account created successfully!');
      router.push('/home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      setApiError(message);
      toast.error(message);
    }
  };


  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center px-4 py-8 relative overflow-hidden">
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
          <h1 className="mt-8 text-3xl font-bold text-[var(--color-text-primary)]">Create Account</h1>
          <p className="mt-2 text-[var(--color-text-secondary)]">Start your research journey today</p>
        </div>

        {/* Sign Up Form */}
        <div className="bg-[var(--color-bg-secondary)] rounded-2xl shadow-xl p-8 border border-[var(--color-border-primary)]">
          {apiError && (
            <div className="mb-6 p-4 bg-[var(--color-error-bg)] border border-[var(--color-error)]/30 rounded-xl text-[var(--color-error)] text-sm">
              {apiError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              label="Full Name"
              type="text"
              placeholder="John Doe"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={errors.name}
            />

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

            <Input
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              error={errors.confirmPassword}
            />

            <div className="flex items-start">
              <input
                type="checkbox"
                className="mt-1 w-4 h-4 rounded border-[var(--color-border-primary)] text-[var(--color-brand-primary)] focus:ring-[var(--color-brand-secondary)] focus:ring-offset-0 bg-[var(--color-bg-tertiary)]"
                required
              />
              <span className="ml-3 text-sm text-[var(--color-text-secondary)]">
                I agree to the{' '}
                <a href="#" className="text-[var(--color-accent-primary)] hover:text-[var(--color-brand-primary)] transition-colors">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-[var(--color-accent-primary)] hover:text-[var(--color-brand-primary)] transition-colors">Privacy Policy</a>
              </span>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>

          {/* Divider */}

          {/* Sign In Link */}
          <p className="mt-8 text-center text-sm text-[var(--color-text-tertiary)]">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-[var(--color-accent-primary)] hover:text-[var(--color-brand-primary)] font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}