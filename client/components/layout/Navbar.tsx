'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui';
import { Users, FileText, User, LogOut, ChevronDown, Mail, Bell } from 'lucide-react';
import { useAuthStore } from '@/lib/auth';
import { api } from '@/lib/api';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, accessToken } = useAuthStore();
  const [pendingCount, setPendingCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  
  const navLinks = [
    { href: '/home', label: 'Groups', icon: Users },
    { href: '/paper', label: 'Papers', icon: FileText },
    { href: '/profile', label: 'Profile', icon: User },
  ];
  
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // Fetch pending group invitations count
  useEffect(() => {
    async function fetchPending() {
      if (!accessToken) return;
      try {
        const groupInvites = await api.getPendingInvitations(accessToken);
        setPendingCount(groupInvites.length);
      } catch {
        // Silently fail
      }
    }
    fetchPending();
    const interval = setInterval(fetchPending, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [accessToken]);

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
    <nav className="bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-[#2a2a2a] sticky top-0 z-[300]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-[#0D7377] to-[#14FFEC] rounded-xl flex items-center justify-center shadow-lg shadow-[#0D7377]/25 group-hover:shadow-[#0D7377]/40 transition-shadow">
              <span className="text-white font-bold text-lg">OR</span>
            </div>
            <span className="text-xl font-bold text-white hidden sm:block">OpenResearch</span>
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
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-xl
                    font-medium text-sm
                    transition-all duration-200
                    ${active
                      ? 'bg-[#0D7377]/20 text-[#14FFEC] shadow-inner'
                      : 'text-[#a1a1aa] hover:text-white hover:bg-[#1a1a1a]'
                    }
                  `}
                >
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
          
          {/* User Menu */}
          <div className="flex items-center gap-3">
            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2.5 rounded-xl text-[#71717a] hover:text-white hover:bg-[#1a1a1a] transition-all"
                title="Notifications"
              >
                <Bell size={18} />
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#14FFEC] text-black text-xs font-bold rounded-full flex items-center justify-center">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
              
              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl shadow-xl z-50">
                  <div className="p-3 border-b border-[#2a2a2a]">
                    <h3 className="font-semibold text-white text-sm">Notifications</h3>
                  </div>
                  <div className="p-2">
                    <Link
                      href="/invitations"
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#2a2a2a] transition-colors"
                      onClick={() => setShowNotifications(false)}
                    >
                      <Mail size={18} className="text-[#14FFEC]" />
                      <span className="text-sm text-white">Group Invitations</span>
                      {pendingCount > 0 && (
                        <span className="ml-auto bg-[#14FFEC] text-black text-xs font-bold px-2 py-0.5 rounded-full">
                          {pendingCount}
                        </span>
                      )}
                    </Link>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-[#1a1a1a] transition-colors cursor-pointer">
              <Avatar src={user?.avatar} alt={user?.name || 'User'} size="sm" />
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-white leading-tight">{user?.name || 'Loading...'}</p>
                <p className="text-xs text-[#71717a] leading-tight">{user?.email}</p>
              </div>
              <ChevronDown size={16} className="text-[#71717a] hidden sm:block" />
            </div>
            <div className="w-px h-8 bg-[#2a2a2a] hidden sm:block" />
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl text-[#71717a] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-all"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-[#2a2a2a] bg-[#0f0f0f]">
        <div className="flex justify-around py-2 px-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`
                  flex flex-col items-center gap-1 px-4 py-2 rounded-xl
                  transition-all duration-200 min-w-[60px]
                  ${active
                    ? 'text-[#14FFEC] bg-[#0D7377]/10'
                    : 'text-[#71717a] hover:text-white'
                  }
                `}
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
