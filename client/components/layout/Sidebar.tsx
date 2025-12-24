'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageSquare, FileText, User, Settings } from 'lucide-react';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className = '' }: SidebarProps) {
  const pathname = usePathname();
  
  const navItems = [
    { href: '/home', label: 'Groups', icon: Home },
    { href: '/chat', label: 'Chat', icon: MessageSquare },
    { href: '/paper', label: 'Papers', icon: FileText },
    { href: '/profile', label: 'Profile', icon: User },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];
  
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  
  return (
    <aside className={`w-64 bg-white border-r border-gray-200 h-screen sticky top-16 ${className}`}>
      <nav className="p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                isActive(item.href)
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
