'use client';

import React, { useCallback, useMemo } from 'react';

export interface ClaimNode {
  id: string;
  type: 'claim' | 'source' | 'synthesis';
  label: string;
  sourceUrl?: string;
}

export interface ClaimEdge {
  id: string;
  source: string;
  target: string;
  type: 'supports' | 'contradicts' | 'derives_from' | 'cites';
  weight?: number;
}

export interface ClaimLineageGraphProps {
  nodes: ClaimNode[];
  edges: ClaimEdge[];
  className?: string;
  onNodeClick?: (node: ClaimNode) => void;
}

const NODE_COLORS: Record<ClaimNode['type'], string> = {
  claim: 'bg-blue-200 border-blue-400 dark:bg-blue-900 dark:border-blue-600',
  source: 'bg-green-200 border-green-400 dark:bg-green-900 dark:border-green-600',
  synthesis: 'bg-purple-200 border-purple-400 dark:bg-purple-900 dark:border-purple-600',
};

const EDGE_STYLES: Record<ClaimEdge['type'], string> = {
  supports: 'text-green-600',
  contradicts: 'text-red-600',
  derives_from: 'text-blue-600',
  cites: 'text-gray-500',
};

const EDGE_LABELS: Record<ClaimEdge['type'], string> = {
  supports: '✓ supports',
  contradicts: '✗ contradicts',
  derives_from: '→ derives from',
  cites: '📎 cites',
};

/**
 * Lightweight claim-lineage visualization.
 *
 * Uses a simple list-based layout as a lightweight fallback.
 * For a full graph visualization, integrate @xyflow/react when available.
 */
export function ClaimLineageGraph({ nodes, edges, className = '', onNodeClick }: ClaimLineageGraphProps) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const grouped = useMemo(() => {
    const sources = nodes.filter((n) => n.type === 'source');
    const claims = nodes.filter((n) => n.type === 'claim');
    const syntheses = nodes.filter((n) => n.type === 'synthesis');
    return { sources, claims, syntheses };
  }, [nodes]);

  const getEdgesFor = useCallback(
    (nodeId: string) => edges.filter((e) => e.source === nodeId || e.target === nodeId),
    [edges],
  );

  if (!nodes.length) {
    return (
      <div className={`rounded-lg border border-dashed border-muted p-4 text-center text-sm text-muted-foreground ${className}`}>
        No claim lineage data available.
      </div>
    );
  }

  const renderNode = (node: ClaimNode) => {
    const nodeEdges = getEdgesFor(node.id);
    return (
      <div
        key={node.id}
        className={`cursor-pointer rounded-lg border-2 px-3 py-2 transition-shadow hover:shadow-md ${NODE_COLORS[node.type]}`}
        onClick={() => onNodeClick?.(node)}
        role="button"
        tabIndex={0}
      >
        <div className="text-xs font-semibold uppercase text-muted-foreground">{node.type}</div>
        <div className="text-sm font-medium">{node.label}</div>
        {node.sourceUrl && (
          <a
            href={node.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View source ↗
          </a>
        )}
        {nodeEdges.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {nodeEdges.map((e) => {
              const other = e.source === node.id ? e.target : e.source;
              const otherNode = nodeMap.get(other);
              return (
                <div key={e.id} className={`text-xs ${EDGE_STYLES[e.type]}`}>
                  {EDGE_LABELS[e.type]} → {otherNode?.label || other}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {grouped.sources.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.sources.map(renderNode)}
          </div>
        </div>
      )}
      {grouped.claims.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Claims</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {grouped.claims.map(renderNode)}
          </div>
        </div>
      )}
      {grouped.syntheses.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Syntheses</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {grouped.syntheses.map(renderNode)}
          </div>
        </div>
      )}
    </div>
  );
}
