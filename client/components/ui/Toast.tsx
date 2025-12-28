'use client';

import React from 'react';
import { useToastStore, ToastType } from '@/lib/toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const toastStyles: Record<ToastType, { 
  bg: string; 
  border: string; 
  iconBg: string;
  icon: React.ReactNode 
}> = {
  success: {
    bg: 'bg-[#1a1a1a]/95',
    border: 'border-[#22c55e]/50',
    iconBg: 'bg-[#22c55e]/20',
    icon: <CheckCircle size={18} className="text-[#4ade80]" />,
  },
  error: {
    bg: 'bg-[#1a1a1a]/95',
    border: 'border-[#ef4444]/50',
    iconBg: 'bg-[#ef4444]/20',
    icon: <AlertCircle size={18} className="text-[#f87171]" />,
  },
  info: {
    bg: 'bg-[#1a1a1a]/95',
    border: 'border-[#3b82f6]/50',
    iconBg: 'bg-[#3b82f6]/20',
    icon: <Info size={18} className="text-[#60a5fa]" />,
  },
  warning: {
    bg: 'bg-[#1a1a1a]/95',
    border: 'border-[#f59e0b]/50',
    iconBg: 'bg-[#f59e0b]/20',
    icon: <AlertTriangle size={18} className="text-[#fbbf24]" />,
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[800] flex flex-col gap-3 max-w-md">
      {toasts.map((toast) => {
        const style = toastStyles[toast.type];
        return (
          <div
            key={toast.id}
            className={`
              ${style.bg} ${style.border} 
              border rounded-xl p-4
              shadow-xl shadow-black/30
              backdrop-blur-xl
              animate-slide-in
              flex items-start gap-3
              min-w-[320px]
            `}
          >
            <div className={`${style.iconBg} p-2 rounded-lg flex-shrink-0`}>
              {style.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium leading-relaxed">
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="
                flex-shrink-0 p-1 rounded-lg
                text-[#71717a] hover:text-white 
                hover:bg-[#2a2a2a]
                transition-colors
              "
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
