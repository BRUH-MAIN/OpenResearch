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

  const handleGoogleSignUp = () => {
    // TODO: Implement Google OAuth
    toast.info('Google sign-up coming soon!');
  };

  return (
    <div className="min-h-screen bg-[#212121] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/landing" className="inline-flex items-center space-x-2">
            <div className="w-12 h-12 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">OR</span>
            </div>
            <span className="text-2xl font-bold text-white">OpenResearch</span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-white">Create Account</h1>
          <p className="mt-2 text-gray-400">Start your research journey today</p>
        </div>

        {/* Sign Up Form */}
        <div className="bg-[#323232] rounded-xl shadow-lg p-8 border border-[#0D7377]">
          {apiError && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500 rounded-lg text-red-300 text-sm">
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
                className="mt-1 rounded border-gray-600 text-[#0D7377] focus:ring-[#14FFEC] bg-[#212121]"
                required
              />
              <span className="ml-2 text-sm text-gray-300">
                I agree to the{' '}
                <a href="#" className="text-[#14FFEC] hover:text-[#0D7377]">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-[#14FFEC] hover:text-[#0D7377]">Privacy Policy</a>
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
          <div className="mt-6 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#0D7377]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-[#323232] text-gray-400">Or continue with</span>
            </div>
          </div>

          {/* Google Sign Up */}
          <Button
            type="button"
            variant="outline"
            className="w-full mt-6"
            onClick={handleGoogleSignUp}
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
            Sign up with Google
          </Button>

          {/* Sign In Link */}
          <p className="mt-6 text-center text-sm text-gray-400">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-[#14FFEC] hover:text-[#0D7377] font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}