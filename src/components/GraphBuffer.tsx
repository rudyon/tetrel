import { useEffect, useMemo, useState, type WheelEvent } from 'react';
import { Minus, Pause, Play, Plus, Trash2 } from 'lucide-react';
import type { GraphToolEvent } from '../types/graph';

interface GraphBufferProps {
  events: GraphToolEvent[];
  paused: boolean;
  onPauseChange: (paused: boolean) => void;
  onClear: () => void;
}

interface GraphNode {
  id: string;
  label: string;
  kind: 'agent' | 'tool' | 'resource';
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  status: 'pending' | 'success' | 'error' | 'noop';
  ageMs: number;
}

const HISTORY_WINDOW_MS = 2 * 60 * 1000;
const AGENT_RADIUS = 170;
const TOOL_RADIUS = 105;
const RESOURCE_RADIUS = 45;
const TOOL_SIZE = { w: 140, h: 34 };
const AGENT_SIZE = { w: 120, h: 32 };
const RESOURCE_SIZE = { w: 128, h: 30 };
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.2;
const ZOOM_STEP = 0.15;

function polar(centerX: number, centerY: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(rad),
    y: centerY + radius * Math.sin(rad),
  };
}

function ageOpacity(ageMs: number) {
  const t = Math.max(0, 1 - ageMs / HISTORY_WINDOW_MS);
  return 0.2 + t * 0.8;
}

function statusColor(status: GraphEdge['status']) {
  if (status === 'pending') return '#f59e0b';
  if (status === 'success') return '#22c55e';
  if (status === 'noop') return '#a78bfa';
  return '#ef4444';
}

function nodeStyle(kind: GraphNode['kind']) {
  if (kind === 'agent') return { fill: '#1f0b14', stroke: '#e3256b' };
  if (kind === 'tool') return { fill: '#1f1a0b', stroke: '#f59e0b' };
  return { fill: '#0b1826', stroke: '#3b82f6' };
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export default function GraphBuffer({ events, paused, onPauseChange, onClear }: GraphBufferProps) {
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 750);
    return () => window.clearInterval(id);
  }, []);

  const zoomIn = () => setZoom(prev => clampZoom(prev + ZOOM_STEP));
  const zoomOut = () => setZoom(prev => clampZoom(prev - ZOOM_STEP));
  const resetZoom = () => setZoom(1);
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    setZoom(prev => clampZoom(prev + direction * ZOOM_STEP));
  };

  const { nodes, edges, positions } = useMemo(() => {
    const now = nowTick;
    const activeEvents = events.filter(e => now - e.timestamp <= HISTORY_WINDOW_MS);

    const finalByToolCall = new Map<string, GraphToolEvent>();
    for (const event of activeEvents) {
      if (event.phase === 'done') {
        finalByToolCall.set(event.toolCallId, event);
      }
    }

    const allNodeMap = new Map<string, GraphNode>();
    const edgeList: GraphEdge[] = [];
    const pendingKeySet = new Set<string>();

    for (const event of activeEvents) {
      const sourceNodeId = `agent:${event.sourceAgentId}`;
      const toolNodeId = `tool:${event.toolName}`;
      allNodeMap.set(sourceNodeId, { id: sourceNodeId, label: event.sourceAgentId, kind: 'agent' });
      allNodeMap.set(toolNodeId, { id: toolNodeId, label: event.toolName, kind: 'tool' });

      const pendingKey = `${sourceNodeId}->${toolNodeId}:${event.toolCallId}`;
      if (!pendingKeySet.has(pendingKey)) {
        pendingKeySet.add(pendingKey);
        edgeList.push({
          id: `invoke:${event.toolCallId}`,
          from: sourceNodeId,
          to: toolNodeId,
          status: 'pending',
          ageMs: now - event.timestamp,
        });
      }

      const finalEvent = finalByToolCall.get(event.toolCallId);
      if (!finalEvent || finalEvent.targetId === null) continue;

      const targetNodeId =
        finalEvent.targetType === 'agent'
          ? `agent:${finalEvent.targetId}`
          : finalEvent.targetType === 'canvas'
            ? `resource:canvas:${finalEvent.targetId}`
            : finalEvent.targetType === 'spawn'
              ? `resource:spawn:${finalEvent.targetId}`
              : `resource:unknown:${finalEvent.targetId}`;

      allNodeMap.set(
        targetNodeId,
        finalEvent.targetType === 'agent'
          ? { id: targetNodeId, label: finalEvent.targetId, kind: 'agent' }
          : {
              id: targetNodeId,
              label: finalEvent.targetType === 'canvas' ? `canvas:${finalEvent.targetId}` : finalEvent.targetId,
              kind: 'resource',
            },
      );

      edgeList.push({
        id: `result:${finalEvent.toolCallId}`,
        from: toolNodeId,
        to: targetNodeId,
        status: finalEvent.resultStatus ?? 'success',
        ageMs: now - finalEvent.timestamp,
      });
    }

    const nodeList = Array.from(allNodeMap.values());
    const agentNodes = nodeList.filter(n => n.kind === 'agent');
    const toolNodes = nodeList.filter(n => n.kind === 'tool');
    const resourceNodes = nodeList.filter(n => n.kind === 'resource');

    const centerX = 470;
    const centerY = 250;
    const posMap = new Map<string, { x: number; y: number }>();

    agentNodes.forEach((node, idx) => {
      const angle = -90 + (360 * idx) / Math.max(1, agentNodes.length);
      posMap.set(node.id, polar(centerX, centerY, AGENT_RADIUS, angle));
    });

    toolNodes.forEach((node, idx) => {
      const angle = -90 + (360 * idx) / Math.max(1, toolNodes.length);
      posMap.set(node.id, polar(centerX, centerY, TOOL_RADIUS, angle));
    });

    resourceNodes.forEach((node, idx) => {
      const angle = -90 + (360 * idx) / Math.max(1, resourceNodes.length);
      posMap.set(node.id, polar(centerX, centerY, RESOURCE_RADIUS, angle));
    });

    return { nodes: nodeList, edges: edgeList, positions: posMap };
  }, [events, nowTick]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-razzmatazz/30 px-3 py-2 flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-widest text-razzmatazz/80">
          Tool-call topology · {nodes.length} nodes · {edges.length} edges
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPauseChange(!paused)}
            className="px-2 py-1 text-[10px] uppercase tracking-widest border border-razzmatazz/40 text-razzmatazz hover:bg-razzmatazz/15 transition-colors flex items-center gap-1 cursor-pointer"
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={onClear}
            className="px-2 py-1 text-[10px] uppercase tracking-widest border border-red-500/40 text-red-400 hover:bg-red-500/15 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Trash2 size={11} />
            Clear
          </button>
          <button
            onClick={zoomOut}
            className="px-2 py-1 text-[10px] uppercase tracking-widest border border-razzmatazz/40 text-razzmatazz hover:bg-razzmatazz/15 transition-colors flex items-center gap-1 cursor-pointer"
            title="Zoom out"
          >
            <Minus size={11} />
          </button>
          <button
            onClick={zoomIn}
            className="px-2 py-1 text-[10px] uppercase tracking-widest border border-razzmatazz/40 text-razzmatazz hover:bg-razzmatazz/15 transition-colors flex items-center gap-1 cursor-pointer"
            title="Zoom in"
          >
            <Plus size={11} />
          </button>
          <button
            onClick={resetZoom}
            className="px-2 py-1 text-[10px] uppercase tracking-widest border border-razzmatazz/40 text-razzmatazz hover:bg-razzmatazz/15 transition-colors cursor-pointer"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-black/20 relative overflow-hidden" onWheel={handleWheel}>
        {nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 text-xs uppercase tracking-widest">
            No tool activity yet
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-full h-full" viewBox="0 0 940 500" preserveAspectRatio="xMidYMid meet">
              <g transform={`translate(470 250) scale(${zoom}) translate(-470 -250)`}>
                {edges.map(edge => {
                  const from = positions.get(edge.from);
                  const to = positions.get(edge.to);
                  if (!from || !to) return null;
                  return (
                    <line
                      key={edge.id}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={statusColor(edge.status)}
                      strokeWidth={edge.status === 'pending' ? 2.4 : 1.8}
                      strokeOpacity={ageOpacity(edge.ageMs)}
                      strokeDasharray={edge.status === 'pending' ? '6 4' : undefined}
                    />
                  );
                })}

                {nodes.map(node => {
                  const p = positions.get(node.id);
                  if (!p) return null;
                  const size = node.kind === 'agent' ? AGENT_SIZE : node.kind === 'tool' ? TOOL_SIZE : RESOURCE_SIZE;
                  const x = p.x - size.w / 2;
                  const y = p.y - size.h / 2;
                  const style = nodeStyle(node.kind);
                  return (
                    <g key={node.id}>
                      <rect x={x} y={y} width={size.w} height={size.h} fill={style.fill} stroke={style.stroke} strokeWidth={1.2} />
                      <text
                        x={p.x}
                        y={p.y + 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        className="font-mono text-[10px] uppercase tracking-wide"
                      >
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
