import React from 'react';
import Image from 'next/image';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Avatar({ src, alt, size = 'md', className = '' }: AvatarProps) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };
  
  const fallbackInitial = alt.charAt(0).toUpperCase();
  
  return (
    <div className={`${sizes[size]} rounded-full overflow-hidden bg-gradient-to-br from-[#0D7377] to-[#14FFEC] flex items-center justify-center text-white font-semibold ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={size === 'sm' ? 32 : size === 'md' ? 40 : size === 'lg' ? 48 : 64}
          height={size === 'sm' ? 32 : size === 'md' ? 40 : size === 'lg' ? 48 : 64}
          className="object-cover"
        />
      ) : (
        <span className={size === 'sm' ? 'text-sm' : size === 'xl' ? 'text-2xl' : 'text-base'}>
          {fallbackInitial}
        </span>
      )}
    </div>
  );
}
