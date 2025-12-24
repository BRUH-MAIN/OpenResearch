'use client';

import React from 'react';
import { useToastStore, ToastType } from '@/lib/toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const toastStyles: Record<ToastType, { bg: string; border: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-green-900/90',
    border: 'border-green-500',
    icon: <CheckCircle size={20} className="text-green-400" />,
  },
  error: {
    bg: 'bg-red-900/90',
    border: 'border-red-500',
    icon: <AlertCircle size={20} className="text-red-400" />,
  },
  info: {
    bg: 'bg-blue-900/90',
    border: 'border-blue-500',
    icon: <Info size={20} className="text-blue-400" />,
  },
  warning: {
    bg: 'bg-yellow-900/90',
    border: 'border-yellow-500',
    icon: <AlertTriangle size={20} className="text-yellow-400" />,
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const style = toastStyles[toast.type];
        return (
          <div
            key={toast.id}
            className={`${style.bg} ${style.border} border rounded-lg p-4 shadow-lg backdrop-blur-sm animate-slide-in flex items-start gap-3`}
          >
            {style.icon}
            <p className="text-white text-sm flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
