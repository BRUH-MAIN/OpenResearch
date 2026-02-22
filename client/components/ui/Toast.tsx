'use client';

import React from 'react';
import { useToastStore, ToastType } from '@/lib/toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

function ToastIcon({ type }: { type: ToastType }) {
  const iconStyle = { color: `var(--color-${type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info'})` };
  switch (type) {
    case 'success': return <CheckCircle size={18} style={iconStyle} />;
    case 'error': return <AlertCircle size={18} style={iconStyle} />;
    case 'warning': return <AlertTriangle size={18} style={iconStyle} />;
    case 'info': return <Info size={18} style={iconStyle} />;
  }
}

function getToastBorderColor(type: ToastType): string {
  switch (type) {
    case 'success': return 'var(--color-success)';
    case 'error': return 'var(--color-error)';
    case 'warning': return 'var(--color-warning)';
    case 'info': return 'var(--color-info)';
  }
}

function getToastIconBg(type: ToastType): string {
  switch (type) {
    case 'success': return 'var(--color-success-bg)';
    case 'error': return 'var(--color-error-bg)';
    case 'warning': return 'var(--color-warning-bg)';
    case 'info': return 'var(--color-info-bg)';
  }
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 max-w-md" style={{ zIndex: 'var(--z-toast)' }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="glass-strong rounded-xl p-4 shadow-xl animate-slide-in flex items-start gap-3 min-w-[320px]"
          style={{ border: `1px solid ${getToastBorderColor(toast.type)}` }}
        >
          <div className="p-2 rounded-lg flex-shrink-0" style={{ background: getToastIconBg(toast.type) }}>
            <ToastIcon type={toast.type} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
              {toast.message}
            </p>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 p-1 rounded-lg transition-colors"
            style={{ color: 'var(--color-text-tertiary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text-primary)';
              e.currentTarget.style.background = 'var(--color-bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-tertiary)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
