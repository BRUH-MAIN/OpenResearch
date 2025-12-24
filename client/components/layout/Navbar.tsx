'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui';
import { Home, MessageSquare, FileText, User, LogOut } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  
  const navLinks = [
    { href: '/home', label: 'Groups', icon: Home },
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/paper', label: 'Papers', icon: FileText },
    { href: '/profile', label: 'Profile', icon: User },
  ];
  
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const handleLogout = async () => {
    await logout();
    router.push('/landing');
  };
  
  return (
    <nav className="bg-[#212121] border-b border-[#323232] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/home" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">OR</span>
            </div>
            <span className="text-xl font-bold text-white">OpenResearch</span>
          </Link>
          
          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                    isActive(link.href)
                      ? 'bg-[#0D7377] text-[#14FFEC]'
                      : 'text-gray-300 hover:bg-[#323232]'
                  }`}
                >
                  <Icon size={20} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
          
          {/* User Menu */}
          <div className="flex items-center space-x-3">
            <Avatar src={user?.avatar} alt={user?.name || 'User'} size="md" />
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-white">{user?.name || 'Loading...'}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-[#14FFEC] transition-colors"
              title="Sign out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-[#323232]">
        <div className="flex justify-around py-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center px-3 py-2 rounded-lg transition-colors ${
                  isActive(link.href)
                    ? 'text-[#14FFEC]'
                    : 'text-gray-400'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs mt-1">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
