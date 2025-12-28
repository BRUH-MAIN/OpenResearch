import React from 'react';
import Image from 'next/image';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  status?: 'online' | 'offline' | 'busy' | 'away';
  className?: string;
}

export function Avatar({ 
  src, 
  alt, 
  size = 'md', 
  status,
  className = '' 
}: AvatarProps) {
  const sizes = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-20 h-20',
  };

  const imageSizes = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
    '2xl': 80,
  };

  const fontSizes = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-2xl',
    '2xl': 'text-3xl',
  };

  const statusSizes = {
    xs: 'w-1.5 h-1.5 border',
    sm: 'w-2 h-2 border',
    md: 'w-2.5 h-2.5 border-2',
    lg: 'w-3 h-3 border-2',
    xl: 'w-4 h-4 border-2',
    '2xl': 'w-5 h-5 border-2',
  };

  const statusColors = {
    online: 'bg-[#22c55e]',
    offline: 'bg-[#71717a]',
    busy: 'bg-[#ef4444]',
    away: 'bg-[#f59e0b]',
  };
  
  const fallbackInitial = alt.charAt(0).toUpperCase();

  // Generate a consistent color based on the name
  const getAvatarColor = (name: string) => {
    const colors = [
      'from-[#0D7377] to-[#14FFEC]',
      'from-[#8b5cf6] to-[#a78bfa]',
      'from-[#ec4899] to-[#f472b6]',
      'from-[#f59e0b] to-[#fbbf24]',
      'from-[#22c55e] to-[#4ade80]',
      'from-[#3b82f6] to-[#60a5fa]',
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };
  
  return (
    <div className={`relative inline-flex ${className}`}>
      <div 
        className={`
          ${sizes[size]} 
          rounded-full overflow-hidden 
          bg-gradient-to-br ${getAvatarColor(alt)}
          flex items-center justify-center 
          text-white font-semibold
          ring-2 ring-[#2a2a2a] ring-offset-2 ring-offset-[#0f0f0f]
          transition-all duration-200
        `}
      >
        {src ? (
          <Image
            src={src}
            alt={alt}
            width={imageSizes[size]}
            height={imageSizes[size]}
            className="object-cover w-full h-full"
          />
        ) : (
          <span className={fontSizes[size]}>
            {fallbackInitial}
          </span>
        )}
      </div>
      {status && (
        <span 
          className={`
            absolute bottom-0 right-0 
            ${statusSizes[size]} 
            ${statusColors[status]}
            rounded-full 
            border-[#0f0f0f]
          `}
        />
      )}
    </div>
  );
}

interface AvatarGroupProps {
  avatars: { src?: string; alt: string }[];
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AvatarGroup({ 
  avatars, 
  max = 4, 
  size = 'md',
  className = '' 
}: AvatarGroupProps) {
  const displayAvatars = avatars.slice(0, max);
  const remaining = avatars.length - max;

  const overlapSizes = {
    sm: '-ml-2',
    md: '-ml-3',
    lg: '-ml-4',
  };

  return (
    <div className={`flex items-center ${className}`}>
      {displayAvatars.map((avatar, index) => (
        <div 
          key={index} 
          className={`${index > 0 ? overlapSizes[size] : ''} relative`}
          style={{ zIndex: displayAvatars.length - index }}
        >
          <Avatar src={avatar.src} alt={avatar.alt} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div 
          className={`
            ${overlapSizes[size]}
            ${size === 'sm' ? 'w-8 h-8 text-xs' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-12 h-12 text-base'}
            rounded-full bg-[#242424] border-2 border-[#0f0f0f]
            flex items-center justify-center
            text-[#a1a1aa] font-medium
          `}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
