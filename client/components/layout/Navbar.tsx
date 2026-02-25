'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui';
import { Users, FileText, User, LogOut, ChevronDown, Mail, Bell, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { useTheme } from '@/components/providers';
import { usePendingInvitations } from '@/lib/hooks/useInvitations';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const { data: pendingInvitations = [] } = usePendingInvitations();
  const pendingCount = pendingInvitations.length;
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const navLinks = [
    { href: '/home', label: 'Groups', icon: Users },
    { href: '/paper', label: 'Papers', icon: FileText },
    { href: '/profile', label: 'Profile', icon: User },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/landing');
  };

  return (
    <nav
      className="glass backdrop-blur-xl border-b sticky top-0"
      style={{
        borderColor: 'var(--color-border-primary)',
        zIndex: 'var(--z-fixed)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-3 group">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-shadow"
              style={{
                background: 'linear-gradient(135deg, var(--color-brand-primary), var(--color-brand-secondary))',
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              <span className="text-white font-bold text-lg">OR</span>
            </div>
            <span
              className="text-xl font-bold hidden sm:block"
              style={{ color: 'var(--color-text-primary)' }}
            >
              OpenResearch
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200"
                  style={{
                    background: active ? 'rgba(13, 115, 119, 0.15)' : 'transparent',
                    color: active ? 'var(--color-brand-secondary)' : 'var(--color-text-tertiary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                      e.currentTarget.style.color = 'var(--color-text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--color-text-tertiary)';
                    }
                  }}
                >
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl transition-all"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
                e.currentTarget.style.background = 'var(--color-bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 rounded-xl transition-all"
                title="Notifications"
                style={{ color: 'var(--color-text-tertiary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                  e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-tertiary)';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Bell size={18} />
                {pendingCount > 0 && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-5 h-5 text-xs font-bold rounded-full flex items-center justify-center"
                    style={{
                      background: 'var(--color-brand-secondary)',
                      color: 'var(--color-bg-primary)',
                    }}
                  >
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 rounded-xl shadow-xl"
                  style={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-primary)',
                    zIndex: 'var(--z-dropdown)',
                  }}
                >
                  <div
                    className="p-3 border-b"
                    style={{ borderColor: 'var(--color-border-primary)' }}
                  >
                    <h3
                      className="font-semibold text-sm"
                      style={{ color: 'var(--color-text-primary)' }}
                    >
                      Notifications
                    </h3>
                  </div>
                  <div className="p-2">
                    <Link
                      href="/invitations"
                      className="flex items-center gap-3 p-2 rounded-lg transition-colors"
                      onClick={() => setShowNotifications(false)}
                      style={{ color: 'var(--color-text-primary)' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-tertiary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <Mail size={18} style={{ color: 'var(--color-brand-secondary)' }} />
                      <span className="text-sm">Group Invitations</span>
                      {pendingCount > 0 && (
                        <span
                          className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{
                            background: 'var(--color-brand-secondary)',
                            color: 'var(--color-bg-primary)',
                          }}
                        >
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div
              className="flex items-center gap-3 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-tertiary)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Avatar src={user?.avatar} alt={user?.name || 'User'} size="sm" />
              <div className="hidden sm:block">
                <p
                  className="text-sm font-medium leading-tight"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {user?.name || 'Loading...'}
                </p>
                <p
                  className="text-xs leading-tight"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  {user?.email}
                </p>
              </div>
              <ChevronDown
                size={16}
                className="hidden sm:block"
                style={{ color: 'var(--color-text-muted)' }}
              />
            </div>
            <div
              className="w-px h-8 hidden sm:block"
              style={{ background: 'var(--color-border-primary)' }}
            />
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl transition-all"
              title="Sign out"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-error)';
                e.currentTarget.style.background = 'var(--color-error-bg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-tertiary)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div
        className="md:hidden border-t"
        style={{
          borderColor: 'var(--color-border-primary)',
          background: 'var(--color-bg-primary)',
        }}
      >
        <div className="flex justify-around py-2 px-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200 min-w-[60px]"
                style={{
                  color: active ? 'var(--color-brand-secondary)' : 'var(--color-text-tertiary)',
                  background: active ? 'rgba(13, 115, 119, 0.1)' : 'transparent',
                }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-xs font-medium">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
