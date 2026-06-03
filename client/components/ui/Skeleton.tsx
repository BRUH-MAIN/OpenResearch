'use client';

import React from 'react';

interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
    borderRadius?: string;
}

/**
 * Animated skeleton placeholder for loading states.
 * Uses the existing shimmer animation from globals.css.
 */
export function Skeleton({
    className = '',
    width,
    height,
    borderRadius = 'var(--radius-lg)',
}: SkeletonProps) {
    return (
        <div
            className={`animate-pulse ${className}`}
            style={{
                width,
                height,
                borderRadius,
                background: 'linear-gradient(90deg, var(--color-bg-tertiary) 25%, var(--color-bg-secondary) 50%, var(--color-bg-tertiary) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
            }}
        />
    );
}

/** Text line skeleton */
export function SkeletonText({
    lines = 3,
    className = '',
}: {
    lines?: number;
    className?: string;
}) {
    return (
        <div className={`space-y-2 ${className}`}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    height={14}
                    width={i === lines - 1 ? '60%' : '100%'}
                    borderRadius="var(--radius-sm)"
                />
            ))}
        </div>
    );
}

/** Card skeleton — mimics a Card component loading state */
export function SkeletonCard({ className = '' }: { className?: string }) {
    return (
        <div
            className={`p-5 ${className}`}
            style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--color-border-primary)',
            }}
        >
            {/* Header row */}
            <div className="flex items-center gap-3 mb-4">
                <Skeleton width={44} height={44} borderRadius="50%" />
                <div className="flex-1 space-y-2">
                    <Skeleton height={16} width="60%" borderRadius="var(--radius-sm)" />
                    <Skeleton height={12} width="40%" borderRadius="var(--radius-sm)" />
                </div>
            </div>
            {/* Body text */}
            <SkeletonText lines={2} />
            {/* Footer row */}
            <div className="flex justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border-primary)' }}>
                <Skeleton height={12} width={80} borderRadius="var(--radius-sm)" />
                <Skeleton height={12} width={60} borderRadius="var(--radius-sm)" />
            </div>
        </div>
    );
}

/** Avatar skeleton */
export function SkeletonAvatar({
    size = 40,
    className = '',
}: {
    size?: number;
    className?: string;
}) {
    return <Skeleton width={size} height={size} borderRadius="50%" className={className} />;
}
