'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';

/* ─── Types ─── */
export interface ClaimNode {
  id: string;
  type: 'claim' | 'source' | 'synthesis' | 'vector_store' | 'web' | 'arxiv';
  label: string;
  sourceUrl?: string;
  url?: string;
  authors?: string;
  year?: string;
  verdict?: 'supported' | 'contradicted' | 'mixed' | 'unverified';
  excerpt?: string;
}

export interface ClaimEdge {
  id: string;
  source: string;
  target: string;
  type: 'supports' | 'contradicts' | 'derives_from' | 'cites' | 'co_cited' | 'similar';
  weight?: number;
  label?: string;
}

export interface ClaimLineageGraphProps {
  nodes: ClaimNode[];
  edges: ClaimEdge[];
  className?: string;
  onNodeClick?: (node: ClaimNode) => void;
}

/* ─── Colors ─── */
const NODE_FILL: Record<string, string> = {
  arxiv: '#0D7377',
  web: '#2563eb',
  vector_store: '#7c3aed',
  synthesis: '#14FFEC',
  source: '#10b981',
  claim: '#f59e0b',
};

const EDGE_COLORS: Record<string, string> = {
  co_cited: 'rgba(20, 255, 236, 0.3)',
  cites: 'rgba(255, 255, 255, 0.25)',
  derives_from: 'rgba(20, 255, 236, 0.5)',
  supports: 'rgba(16, 185, 129, 0.4)',
  contradicts: 'rgba(239, 68, 68, 0.4)',
  similar: 'rgba(168, 85, 247, 0.4)',
};

const VERDICT_COLORS: Record<string, string> = {
  supported: '#10b981',
  contradicted: '#ef4444',
  mixed: '#f59e0b',
  unverified: '#6b7280',
};

/* ─── Simulation types ─── */
interface SimNode {
  id: string; x: number; y: number; vx: number; vy: number;
  type: string; label: string; url: string; authors: string; year: string; radius: number;
  verdict?: string; excerpt?: string;
}
interface SimEdge { source: string; target: string; type: string; label: string; }

/* ─── Force layout ─── */
function runForceLayout(nodes: SimNode[], edges: SimEdge[], w: number, h: number, iters = 120): SimNode[] {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const cx = w / 2, cy = h / 2;
  nodes.forEach((n, i) => {
    const a = (2 * Math.PI * i) / nodes.length;
    const r = Math.min(w, h) * 0.35;
    n.x = cx + r * Math.cos(a); n.y = cy + r * Math.sin(a); n.vx = 0; n.vy = 0;
  });
  for (let t = 0; t < iters; t++) {
    const alpha = 1 - t / iters, str = alpha * 0.3;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (300 * alpha) / (d * d);
        dx *= f; dy *= f;
        a.vx -= dx; a.vy -= dy; b.vx += dx; b.vy += dy;
      }
    }
    edges.forEach((e) => {
      const a = map.get(e.source), b = map.get(e.target);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 100) * str * 0.05;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    });
    nodes.forEach((n) => {
      n.vx += (cx - n.x) * str * 0.01; n.vy += (cy - n.y) * str * 0.01;
      n.vx *= 0.6; n.vy *= 0.6; n.x += n.vx; n.y += n.vy;
      n.x = Math.max(40, Math.min(w - 40, n.x)); n.y = Math.max(40, Math.min(h - 40, n.y));
    });
  }
  return nodes;
}

/* ─── Component ─── */
export function ClaimLineageGraph({ nodes, edges, className = '', onNodeClick }: ClaimLineageGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 400 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setDims({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!nodes.length) return { nodes: [] as SimNode[], edges: [] as SimEdge[] };
    const sn: SimNode[] = nodes.map((n) => ({
      id: n.id, x: 0, y: 0, vx: 0, vy: 0,
      type: n.type, label: n.label, url: n.url || n.sourceUrl || '',
      authors: n.authors || '', year: n.year || '',
      radius: n.type === 'synthesis' ? 24 : n.type === 'claim' ? 20 : 16,
      verdict: n.verdict, excerpt: n.excerpt,
    }));
    const se: SimEdge[] = edges.map((e) => ({ source: e.source, target: e.target, type: e.type, label: e.label || e.type }));
    const positioned = runForceLayout(sn, se, dims.width, dims.height);
    return { nodes: positioned, edges: se };
  }, [nodes, edges, dims]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
      setDragging(true);
      dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [pan]);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }, [dragging]);
  const handleMouseUp = useCallback(() => setDragging(false), []);
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.3, Math.min(3, z - e.deltaY * 0.001)));
  }, []);
  const resetView = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  const nodeMap = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);

  if (!nodes.length) {
    return (
      <div className={`flex items-center justify-center h-full text-sm ${className}`} style={{ color: 'var(--color-text-muted)' }}>
        No citation data. Run a research query to generate the graph.
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        {[
          { icon: <ZoomIn size={14} />, action: () => setZoom((z) => Math.min(3, z + 0.2)), tip: 'Zoom in' },
          { icon: <ZoomOut size={14} />, action: () => setZoom((z) => Math.max(0.3, z - 0.2)), tip: 'Zoom out' },
          { icon: <Maximize2 size={14} />, action: resetView, tip: 'Reset' },
        ].map((btn, i) => (
          <button key={i} onClick={btn.action} title={btn.tip} className="p-1.5 rounded-md"
            style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
            {btn.icon}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-10 text-[10px] p-2 rounded-md" style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)' }}>
        <div className="flex flex-wrap gap-2 mb-1">
          {Object.entries(NODE_FILL).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1">
              {type === 'claim'
                ? <span className="inline-block w-2.5 h-2.5" style={{ background: color, transform: 'rotate(45deg)' }} />
                : <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
              }
              {type.replace('_', ' ')}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1" style={{ borderTop: '1px solid var(--color-border-primary)' }}>
          {Object.entries(EDGE_COLORS).map(([type, color]) => (
            <span key={type} className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5" style={{ background: color }} />
              {type.replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* SVG */}
      <svg ref={svgRef} width={dims.width} height={dims.height}
        className="cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel}>
        <rect width={dims.width} height={dims.height} fill="transparent" />
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {layout.edges.map((edge, i) => {
            const src = nodeMap.get(edge.source), tgt = nodeMap.get(edge.target);
            if (!src || !tgt) return null;
            const hl = hoveredNode === edge.source || hoveredNode === edge.target;
            const isDashed = edge.type === 'similar' || edge.type === 'co_cited';
            return (
              <line key={i} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke={EDGE_COLORS[edge.type] || 'rgba(255,255,255,0.15)'}
                strokeWidth={hl ? 2 : 1}
                strokeDasharray={isDashed ? '4 3' : undefined}
                opacity={hoveredNode && !hl ? 0.15 : 1}
                style={{ transition: 'opacity 0.2s' }} />
            );
          })}
          {/* Nodes */}
          {layout.nodes.map((node) => {
            const isH = hoveredNode === node.id;
            const isSel = selectedNode === node.id;
            const fill = NODE_FILL[node.type] || '#666';
            const dimmed = hoveredNode && !isH && !layout.edges.some(
              (e) => (e.source === node.id || e.target === node.id) && (e.source === hoveredNode || e.target === hoveredNode));
            const isClaim = node.type === 'claim';
            return (
              <g key={node.id} transform={`translate(${node.x},${node.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => {
                  if (isClaim) {
                    setSelectedNode((prev) => prev === node.id ? null : node.id);
                  } else if (node.url) {
                    window.open(node.url, '_blank', 'noopener');
                  }
                  onNodeClick?.({ id: node.id, type: node.type as ClaimNode['type'], label: node.label, url: node.url, verdict: node.verdict as ClaimNode['verdict'], excerpt: node.excerpt });
                }}
                className="cursor-pointer" style={{ opacity: dimmed ? 0.25 : 1, transition: 'opacity 0.2s' }}>
                {isClaim ? (
                  /* Diamond shape for claims */
                  <>
                    {(isH || isSel) && <rect x={-(node.radius + 6)} y={-(node.radius + 6)} width={(node.radius + 6) * 2} height={(node.radius + 6) * 2}
                      fill={fill} opacity={0.15} transform="rotate(45)" rx={2} />}
                    <rect x={-node.radius} y={-node.radius} width={node.radius * 2} height={node.radius * 2}
                      fill={fill} opacity={0.85} transform="rotate(45)" rx={2}
                      stroke={isH || isSel ? '#fff' : 'transparent'} strokeWidth={isH || isSel ? 2 : 0} />
                    {node.verdict && (
                      <circle cx={node.radius - 2} cy={-node.radius + 2} r={5}
                        fill={VERDICT_COLORS[node.verdict] || '#6b7280'} stroke="var(--color-bg-primary)" strokeWidth={1.5} />
                    )}
                  </>
                ) : (
                  /* Circle for other node types */
                  <>
                    {isH && <circle r={node.radius + 6} fill={fill} opacity={0.15} />}
                    <circle r={node.radius} fill={fill} opacity={0.85}
                      stroke={isH ? '#fff' : 'transparent'} strokeWidth={isH ? 2 : 0} />
                    {node.url && <circle cx={node.radius - 2} cy={-node.radius + 2} r={4} fill="var(--color-brand-secondary)" opacity={0.7} />}
                  </>
                )}
                <text y={node.radius + 14} textAnchor="middle" fill="var(--color-text-secondary)"
                  fontSize={10} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {node.label.length > 25 ? node.label.slice(0, 24) + '…' : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {hoveredNode && !selectedNode && (() => {
        const n = nodeMap.get(hoveredNode);
        if (!n) return null;
        return (
          <div className="absolute z-20 max-w-[240px] p-2.5 rounded-lg border text-[12px]"
            style={{
              left: Math.min(n.x * zoom + pan.x + 20, dims.width - 260),
              top: Math.max(n.y * zoom + pan.y - 30, 8),
              background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)',
              color: 'var(--color-text-primary)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              pointerEvents: 'none',
            }}>
            <p className="font-medium leading-tight">{n.label}</p>
            {n.authors && <p className="mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{n.authors}</p>}
            {n.year && <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{n.year}</p>}
            {n.url && <p className="mt-1 text-[10px] truncate" style={{ color: 'var(--color-brand-secondary)' }}>{n.url}</p>}
            <p className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{n.type.replace('_', ' ')}</p>
          </div>
        );
      })()}

      {/* Claim Detail Panel */}
      {selectedNode && (() => {
        const n = nodeMap.get(selectedNode);
        if (!n) return null;
        const relatedEdges = layout.edges.filter((e) => e.source === selectedNode || e.target === selectedNode);
        return (
          <div className="absolute top-2 left-2 z-30 w-[280px] rounded-lg border text-[12px] overflow-hidden"
            style={{ background: 'var(--color-bg-elevated)', borderColor: 'var(--color-border-primary)', boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
            <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: NODE_FILL[n.type] || '#666', transform: n.type === 'claim' ? 'rotate(45deg)' : undefined }} />
                <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>{n.type.replace('_', ' ')}</span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="p-0.5 rounded hover:opacity-70" style={{ color: 'var(--color-text-muted)' }}>
                <X size={14} />
              </button>
            </div>
            <div className="p-3 space-y-2">
              <p className="font-medium leading-tight" style={{ color: 'var(--color-text-primary)' }}>{n.label}</p>
              {n.verdict && (
                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ background: VERDICT_COLORS[n.verdict] + '22', color: VERDICT_COLORS[n.verdict] || '#6b7280' }}>
                  {n.verdict}
                </span>
              )}
              {n.excerpt && (
                <div className="p-2 rounded text-[11px] leading-relaxed" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                  &ldquo;{n.excerpt}&rdquo;
                </div>
              )}
              {n.authors && <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{n.authors}</p>}
              {n.year && <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{n.year}</p>}
              {n.url && (
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="block text-[10px] truncate hover:underline" style={{ color: 'var(--color-brand-secondary)' }}>
                  {n.url}
                </a>
              )}
              {relatedEdges.length > 0 && (
                <div className="pt-2" style={{ borderTop: '1px solid var(--color-border-primary)' }}>
                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--color-text-tertiary)' }}>Connections</p>
                  {relatedEdges.slice(0, 8).map((e, i) => {
                    const otherId = e.source === selectedNode ? e.target : e.source;
                    const other = nodeMap.get(otherId);
                    return (
                      <div key={i} className="flex items-center gap-1.5 py-0.5">
                        <span className="inline-block w-2 h-0.5" style={{ background: EDGE_COLORS[e.type] || 'rgba(255,255,255,0.15)' }} />
                        <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                          {e.type.replace('_', ' ')} &rarr; {other ? (other.label.length > 30 ? other.label.slice(0, 29) + '…' : other.label) : otherId}
                        </span>
                      </div>
                    );
                  })}
                  {relatedEdges.length > 8 && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>+{relatedEdges.length - 8} more</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
