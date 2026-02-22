'use client';

import React from 'react';

interface Tab {
  /** Unique identifier for the tab */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon (React element) */
  icon?: React.ReactNode;
  /** Optional badge count */
  count?: number;
  /** Whether the tab is disabled */
  disabled?: boolean;
}

interface TabGroupProps {
  /** Array of tab definitions */
  tabs: Tab[];
  /** Currently active tab ID */
  activeTab: string;
  /** Callback when tab changes */
  onChange: (tabId: string) => void;
  /** Tab style variant */
  variant?: 'default' | 'pills' | 'underline';
  /** Size of the tabs */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

export function TabGroup({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  size = 'md',
  className = '',
}: TabGroupProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      style={{
        borderBottom: variant === 'underline' ? '1px solid var(--color-border-primary)' : 'none',
      }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const isDisabled = tab.disabled ?? false;

        let style: React.CSSProperties = {};

        if (isDisabled) {
          style = { color: 'var(--color-text-muted)', cursor: 'not-allowed' };
        } else {
          switch (variant) {
            case 'pills':
              if (isActive) {
                style = {
                  background: 'rgba(20, 255, 236, 0.1)',
                  color: 'var(--color-brand-secondary)',
                  borderRadius: '9999px',
                };
              } else {
                style = {
                  color: 'var(--color-text-secondary)',
                  borderRadius: '9999px',
                };
              }
              break;
            case 'underline':
              if (isActive) {
                style = {
                  color: 'var(--color-brand-secondary)',
                  borderBottom: '2px solid var(--color-brand-secondary)',
                };
              } else {
                style = {
                  color: 'var(--color-text-secondary)',
                  borderBottom: '2px solid transparent',
                };
              }
              break;
            default:
              if (isActive) {
                style = {
                  background: 'rgba(20, 255, 236, 0.1)',
                  color: 'var(--color-brand-secondary)',
                  borderRadius: 'var(--radius-lg)',
                };
              } else {
                style = {
                  color: 'var(--color-text-secondary)',
                  borderRadius: 'var(--radius-lg)',
                };
              }
          }
        }

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            tabIndex={isDisabled ? -1 : 0}
            onClick={() => !isDisabled && onChange(tab.id)}
            className={`flex items-center gap-2 font-medium transition-all ${sizeClasses[size]}`}
            style={style}
            onMouseEnter={(e) => {
              if (!isActive && !isDisabled) {
                if (variant === 'underline') {
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                } else {
                  e.currentTarget.style.background = 'var(--color-bg-hover)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive && !isDisabled) {
                if (variant === 'underline') {
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                } else {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }
            }}
          >
            {tab.icon && (
              <span className="w-4 h-4">{tab.icon}</span>
            )}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className="px-1.5 py-0.5 text-xs rounded-full"
                style={{
                  background: isActive ? 'rgba(20, 255, 236, 0.2)' : 'var(--color-bg-tertiary)',
                  color: isActive ? 'var(--color-brand-secondary)' : 'var(--color-text-tertiary)',
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default TabGroup;
