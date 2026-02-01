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

/**
 * TabGroup - Consistent tab navigation
 * 
 * Design system:
 * - Active tab: #14FFEC text with #14FFEC/10 background
 * - Inactive tab: #a0a0a0 text
 * - Hover: #0D7377/10 background
 * 
 * Usage:
 * ```tsx
 * <TabGroup
 *   tabs={[
 *     { id: 'all', label: 'All Papers', count: 42 },
 *     { id: 'starred', label: 'Starred', icon: <Star /> },
 *   ]}
 *   activeTab={activeTab}
 *   onChange={setActiveTab}
 * />
 * ```
 */
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

  const getVariantClasses = (isActive: boolean, isDisabled: boolean) => {
    if (isDisabled) {
      return 'text-[#5a5a5a] cursor-not-allowed';
    }

    switch (variant) {
      case 'pills':
        return isActive
          ? 'bg-[#14FFEC]/10 text-[#14FFEC] rounded-full'
          : 'text-[#a0a0a0] hover:bg-[#0D7377]/10 hover:text-white rounded-full';

      case 'underline':
        return isActive
          ? 'text-[#14FFEC] border-b-2 border-[#14FFEC]'
          : 'text-[#a0a0a0] hover:text-white border-b-2 border-transparent';

      default:
        return isActive
          ? 'bg-[#14FFEC]/10 text-[#14FFEC] rounded-lg'
          : 'text-[#a0a0a0] hover:bg-[#0D7377]/10 hover:text-white rounded-lg';
    }
  };

  return (
    <div
      className={`
        flex items-center gap-1
        ${variant === 'underline' ? 'border-b border-[#2a2a2a]' : ''}
        ${className}
      `}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const isDisabled = tab.disabled ?? false;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            tabIndex={isDisabled ? -1 : 0}
            onClick={() => !isDisabled && onChange(tab.id)}
            className={`
              flex items-center gap-2 font-medium transition-all
              ${sizeClasses[size]}
              ${getVariantClasses(isActive, isDisabled)}
            `}
          >
            {tab.icon && (
              <span className="w-4 h-4">{tab.icon}</span>
            )}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`
                  px-1.5 py-0.5 text-xs rounded-full
                  ${isActive
                    ? 'bg-[#14FFEC]/20 text-[#14FFEC]'
                    : 'bg-[#2a2a2a] text-[#a0a0a0]'
                  }
                `}
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
