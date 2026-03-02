'use client';

import React, { useMemo } from 'react';
import type { MethodologyRow } from '@/lib/api';

export interface MethodologyMatrixProps {
  rows: MethodologyRow[];
  className?: string;
}

const COLUMN_HEADERS: Array<{ key: keyof MethodologyRow; label: string }> = [
  { key: 'paper_title', label: 'Paper' },
  { key: 'design', label: 'Design' },
  { key: 'sample_size', label: 'Sample Size' },
  { key: 'population', label: 'Population' },
  { key: 'measures', label: 'Measures' },
  { key: 'statistical_methods', label: 'Stats Methods' },
  { key: 'limitations', label: 'Limitations' },
  { key: 'replication_risk', label: 'Replication Risk' },
];

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  high: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

/**
 * Renders a methodology comparison matrix as a horizontally scrollable table.
 */
export function MethodologyMatrix({ rows, className = '' }: MethodologyMatrixProps) {
  const data = useMemo(() => rows || [], [rows]);

  if (!data.length) {
    return (
      <div className={`rounded-lg border border-dashed border-muted p-4 text-center text-sm text-muted-foreground ${className}`}>
        No methodology data available.
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto rounded-lg border ${className}`}>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {COLUMN_HEADERS.map(({ key, label }) => (
              <th
                key={key}
                className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              {COLUMN_HEADERS.map(({ key }) => {
                const value = row[key] || 'N/A';
                const isRisk = key === 'replication_risk';
                const riskClass = isRisk ? RISK_COLORS[value.toLowerCase()] || '' : '';
                return (
                  <td key={key} className="px-3 py-2 align-top">
                    {isRisk && riskClass ? (
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${riskClass}`}>
                        {value}
                      </span>
                    ) : key === 'paper_title' ? (
                      <span className="font-medium">{value}</span>
                    ) : (
                      <span className="text-muted-foreground">{value}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
