import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({ 
  label, 
  error, 
  hint,
  leftIcon,
  rightIcon,
  className = '', 
  ...props 
}: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[#e4e4e7] mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#71717a] pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          className={`
            w-full px-4 py-2.5
            bg-[#1a1a1a] text-white
            border rounded-xl
            placeholder:text-[#52525b]
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-[#14FFEC]/40 focus:border-[#14FFEC]
            hover:border-[#3a3a3a]
            disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[#0f0f0f]
            ${error 
              ? 'border-[#ef4444] focus:ring-red-500/40 focus:border-[#ef4444]' 
              : 'border-[#2a2a2a]'
            }
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${className}
          `}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a]">
            {rightIcon}
          </div>
        )}
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-sm text-[#71717a]">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-sm text-[#ef4444] flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Textarea({ 
  label, 
  error, 
  hint,
  className = '', 
  ...props 
}: TextareaProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[#e4e4e7] mb-2">
          {label}
        </label>
      )}
      <textarea
        className={`
          w-full px-4 py-3
          bg-[#1a1a1a] text-white
          border rounded-xl
          placeholder:text-[#52525b]
          transition-all duration-200
          resize-none
          focus:outline-none focus:ring-2 focus:ring-[#14FFEC]/40 focus:border-[#14FFEC]
          hover:border-[#3a3a3a]
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[#0f0f0f]
          ${error 
            ? 'border-[#ef4444] focus:ring-red-500/40 focus:border-[#ef4444]' 
            : 'border-[#2a2a2a]'
          }
          ${className}
        `}
        {...props}
      />
      {hint && !error && (
        <p className="mt-1.5 text-sm text-[#71717a]">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-sm text-[#ef4444] flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

interface SearchInputProps extends Omit<InputProps, 'leftIcon'> {
  onSearch?: (value: string) => void;
}

export function SearchInput({ 
  onSearch, 
  className = '', 
  ...props 
}: SearchInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch((e.target as HTMLInputElement).value);
    }
    props.onKeyDown?.(e);
  };

  return (
    <Input
      leftIcon={
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      }
      className={className}
      {...props}
      onKeyDown={handleKeyDown}
    />
  );
}
