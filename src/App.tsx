import { useRef, useState, useMemo, useCallback } from 'react';
import Buffer from './components/Buffer';
import ConfigBuffer from './components/ConfigBuffer';
import AgentBuffer, { type Message as AgentMessage } from './components/AgentBuffer';
import AgentsBuffer from './components/AgentsBuffer';
import HelpBuffer from './components/HelpBuffer';
import TilingWorkspace from './components/TilingWorkspace';
import CommandPrompt from './components/CommandPrompt';
import { insertBuffer, removeBuffer, swapLeaves, updateRatio, type BSPNode, type BSPPath } from './utils/bsp';
import type { AgentBufferHandle } from './components/AgentBuffer';

interface AgentRecord {
  identifier: string;
  model: string;
}

type BufferType = 'config' | 'agent' | 'agents' | 'help';

type BufferData = {
  id: string;
  type: BufferType;
  title: string;
  props: Record<string, unknown>;
  initialPosition: { x: number; y: number };
};

export default function App() {
  // ── Core state ───────────────────────────────────────────────────────────────
  const [buffers, setBuffers] = useState<BufferData[]>([]);
  const [bspTree, setBspTree] = useState<BSPNode | null>(null);
  const [tiledIds, setTiledIds] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<Map<string, AgentRecord>>(new Map());
  const [agentHistories, setAgentHistories] = useState<Map<string, AgentMessage[]>>(new Map());

  /**
   * Per-agent tool sets: agentId (e.g. "alpha") -> Set of peer agent identifiers it can call.
   * Keyed by buffer-id prefix (the agent identifier string, NOT "agent-X").
   */
  const [agentTools, setAgentTools] = useState<Map<string, Set<string>>>(new Map());

  const agentRefs = useRef<Map<string, AgentBufferHandle>>(new Map());

  // Refs to latest state — used inside stable callbacks to avoid stale closures
  const buffersRef = useRef<BufferData[]>([]);
  buffersRef.current = buffers;
  const agentsRef = useRef<Map<string, AgentRecord>>(new Map());
  agentsRef.current = agents;

  // ── Stable history helpers ───────────────────────────────────────────────────

  const setAgentHistory = useCallback((bufferId: string, msgs: AgentMessage[]) => {
    setAgentHistories(prev => new Map([...prev, [bufferId, msgs]]));
  }, []);

  // ── Stable agent-tools helpers ───────────────────────────────────────────────

  const setAgentToolSet = useCallback((agentId: string, tools: Set<string>) => {
    setAgentTools(prev => new Map([...prev, [agentId, tools]]));
  }, []);

  // ── Stable buffer / tiling callbacks ────────────────────────────────────────

  const removeBufferById = useCallback((id: string) => {
    setBuffers(prev => prev.filter(b => b.id !== id));
    setTiledIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setBspTree(prev => (prev ? removeBuffer(prev, id) : null));
  }, []);

  const tileBuffer = useCallback((id: string) => {
    setTiledIds(prev => new Set([...prev, id]));
    setBspTree(prev => insertBuffer(prev, id));
  }, []);

  const floatBuffer = useCallback((id: string) => {
    setTiledIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setBspTree(prev => (prev ? removeBuffer(prev, id) : null));
  }, []);

  const handleRatioChange = useCallback((path: BSPPath, ratio: number) => {
    setBspTree(prev => (prev ? updateRatio(prev, path, ratio) : null));
  }, []);

  const handleSwap = useCallback((a: string, b: string) => {
    setBspTree(prev => (prev ? swapLeaves(prev, a, b) : null));
  }, []);

  // ── Command execution (stable via ref pattern) ───────────────────────────────

  const nextPosition = (curr: BufferData[]) => ({
    x: window.innerWidth / 2 - 200 + curr.length * 20,
    y: window.innerHeight / 4 + curr.length * 20,
  });

  const executeCommandImpl = (cmdStr: string) => {
    const parts = cmdStr.trim().split(/\s+/);
    const base = parts[0];

    if (base === 'SPAWN') {
      const identifier = parts[1];
      const model = parts.slice(2).join(' ');
      if (!identifier || !model) return;
      setAgents(prev => new Map([...prev, [identifier, { identifier, model }]]));
      const id = `agent-${identifier}`;
      setBuffers(prev => {
        if (prev.find(b => b.id === id)) return prev;
        return [...prev, { id, type: 'agent', title: `AGENT: ${identifier}`, props: { identifier, model }, initialPosition: nextPosition(prev) }];
      });

    } else if (base === 'AGENT') {
      const identifier = parts[1];
      if (!identifier) return;
      const record = agentsRef.current.get(identifier);
      if (!record) return;
      const id = `agent-${identifier}`;
      setBuffers(prev => {
        if (prev.find(b => b.id === id)) return prev;
        return [...prev, { id, type: 'agent', title: `AGENT: ${identifier}`, props: { identifier, model: record.model }, initialPosition: nextPosition(prev) }];
      });

    } else if (base === 'AGENTS') {
      setBuffers(prev => {
        if (prev.find(b => b.id === 'agents')) return prev;
        return [...prev, { id: 'agents', type: 'agents', title: 'AGENTS', props: {}, initialPosition: nextPosition(prev) }];
      });

    } else if (base === 'KILL') {
      const identifier = parts[1];
      if (!identifier) return;
      const id = `agent-${identifier}`;
      setAgents(prev => { const n = new Map(prev); n.delete(identifier); return n; });
      setAgentHistories(prev => { const n = new Map(prev); n.delete(id); return n; });
      setAgentTools(prev => { const n = new Map(prev); n.delete(identifier); return n; });
      removeBufferById(id);

    } else if (base === 'CONFIG') {
      const provider = parts[1] ?? 'OPENROUTER';
      const id = `config-${provider}`;
      setBuffers(prev => {
        if (prev.find(b => b.id === id)) return prev;
        return [...prev, { id, type: 'config', title: `CONFIG: ${provider}`, props: { provider }, initialPosition: nextPosition(prev) }];
      });

    } else if (base === 'CLEAR') {
      setBuffers([]);
      setBspTree(null);
      setTiledIds(new Set());

    } else if (base === 'HELP') {
      setBuffers(prev => {
        if (prev.find(b => b.id === 'help')) return prev;
        return [...prev, { id: 'help', type: 'help', title: 'HELP', props: {}, initialPosition: nextPosition(prev) }];
      });
    }
  };

  const executeCommandRef = useRef(executeCommandImpl);
  executeCommandRef.current = executeCommandImpl;
  const executeCommand = useCallback((cmd: string) => executeCommandRef.current(cmd), []);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const agentsList = useMemo(() => Array.from(agents.values()), [agents]);

  const getTitle = useCallback(
    (bufferId: string) => buffersRef.current.find(b => b.id === bufferId)?.title ?? bufferId,
    [],
  );

  /**
   * Returns the AgentBufferHandle for a given agent identifier (not buffer id).
   * Used by AgentBuffer to call peer agents as tools.
   */
  const getAgentHandle = useCallback((agentId: string): AgentBufferHandle | null => {
    return agentRefs.current.get(`agent-${agentId}`) ?? null;
  }, []);

  const renderBufferContent = useCallback(
    (bufferId: string) => {
      const buf = buffersRef.current.find(b => b.id === bufferId);
      if (!buf) return null;

      if (buf.type === 'config') {
        return <ConfigBuffer provider={buf.props.provider as string} onSave={() => {}} />;
      }

      if (buf.type === 'agent') {
        const identifier = buf.props.identifier as string;
        const model = buf.props.model as string;
        const messages =
          agentHistories.get(bufferId) ?? [
            {
              role: 'assistant' as const,
              content: `Agent ${identifier} online. Running \`${model}\`. How can I assist?`,
              timestamp: Date.now(),
            },
          ];
        const enabledTools = agentTools.get(identifier) ?? new Set<string>();

        return (
          <AgentBuffer
            ref={node => {
              if (node) agentRefs.current.set(bufferId, node);
              else agentRefs.current.delete(bufferId);
            }}
            model={model}
            identifier={identifier}
            messages={messages}
            onMessagesChange={msgs => setAgentHistory(bufferId, msgs)}
            availableAgents={agentsList}
            enabledTools={enabledTools}
            onToolsChange={tools => setAgentToolSet(identifier, tools)}
            getAgentHandle={getAgentHandle}
          />
        );
      }

      if (buf.type === 'agents') {
        return <AgentsBuffer agents={agentsList} />;
      }

      if (buf.type === 'help') {
        return <HelpBuffer />;
      }

      return null;
    },
    [agentHistories, agentsList, agentTools, setAgentHistory, setAgentToolSet, getAgentHandle],
  );

  const floatingBuffers = useMemo(
    () => buffers.filter(b => !tiledIds.has(b.id)),
    [buffers, tiledIds],
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-white font-mono overflow-hidden !rounded-none">
      {/* Main Workspace */}
      <div className="flex-1 bg-background relative">

        {/* Tiling layer — isolated stacking context */}
        {bspTree && (
          <div className="absolute inset-0" style={{ isolation: 'isolate', zIndex: 0 }}>
            <TilingWorkspace
              tree={bspTree}
              getTitle={getTitle}
              renderContent={renderBufferContent}
              onRatioChange={handleRatioChange}
              onSwap={handleSwap}
              onFloat={floatBuffer}
              onClose={removeBufferById}
            />
          </div>
        )}

        {/* Floating buffers layer */}
        {floatingBuffers.map((buffer, index) => (
          <Buffer
            key={buffer.id}
            id={buffer.id}
            title={buffer.title}
            onClose={removeBufferById}
            onTile={tileBuffer}
            initialPosition={buffer.initialPosition}
            zIndex={100 + index}
            padded={buffer.type !== 'agent'}
            initialSize={
              buffer.type === 'agent' ? { w: 400, h: 480 }
              : buffer.type === 'agents' ? { w: 400, h: 280 }
              : buffer.type === 'help' ? { w: 520, h: 560 }
              : { w: 400, h: 320 }
            }
          >
            {renderBufferContent(buffer.id)}
          </Buffer>
        ))}
      </div>

      {/* Command Prompt — owns all typing state, never causes workspace re-renders */}
      <CommandPrompt onExecute={executeCommand} />
    </div>
  );
}
