'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users, FileText, User } from 'lucide-react';

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className = '' }: SidebarProps) {
  const pathname = usePathname();
  
  const navItems = [
    { href: '/home', label: 'Groups', icon: Users },
    { href: '/paper', label: 'Papers', icon: FileText },
    { href: '/profile', label: 'Profile', icon: User },
  ];
  
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  
  return (
    <aside className={`w-64 bg-[#0f0f0f] border-r border-[#2a2a2a] h-screen sticky top-16 ${className}`}>
      <nav className="p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl
                font-medium text-sm
                transition-all duration-200
                ${active
                  ? 'bg-[#0D7377]/20 text-[#14FFEC] shadow-inner border border-[#0D7377]/30'
                  : 'text-[#a1a1aa] hover:bg-[#1a1a1a] hover:text-white border border-transparent'
                }
              `}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
