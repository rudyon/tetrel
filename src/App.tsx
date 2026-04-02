import { useRef, useState, useMemo, useCallback } from 'react';
import Buffer from './components/Buffer';
import ConfigBuffer from './components/ConfigBuffer';
import AgentBuffer, { type Message as AgentMessage } from './components/AgentBuffer';
import AgentsBuffer from './components/AgentsBuffer';
import HelpBuffer from './components/HelpBuffer';
import CanvasBuffer from './components/CanvasBuffer';
import TilingWorkspace from './components/TilingWorkspace';
import CommandPrompt from './components/CommandPrompt';
import { insertBuffer, removeBuffer, swapLeaves, updateRatio, type BSPNode, type BSPPath } from './utils/bsp';
import type { AgentBufferHandle } from './components/AgentBuffer';

interface AgentRecord {
  identifier: string;
  model: string;
}

interface CanvasRecord {
  id: string;
  mimeType: string;
  content: string;
  updatedAt: number;
}

interface AgentTools {
  agents: Set<string>;
  canvases: Set<string>;
  canSpawnCanvas: boolean;
}

type BufferType = 'config' | 'agent' | 'agents' | 'help' | 'canvas';

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
  const [canvases, setCanvases] = useState<Map<string, CanvasRecord>>(new Map());
  const [agentTools, setAgentTools] = useState<Map<string, AgentTools>>(new Map());

  const agentRefs = useRef<Map<string, AgentBufferHandle>>(new Map());

  // ── Stable history helpers ───────────────────────────────────────────────────

  const setAgentHistory = useCallback((bufferId: string, msgs: AgentMessage[]) => {
    setAgentHistories(prev => new Map([...prev, [bufferId, msgs]]));
  }, []);

  // ── Stable agent-tools helpers ───────────────────────────────────────────────

  const setAgentToolSet = useCallback((agentId: string, tools: AgentTools) => {
    setAgentTools(prev => new Map([...prev, [agentId, tools]]));
  }, []);

  const upsertCanvas = (id: string, content: string, mimeType = 'text/html') => {
    setCanvases(prev => {
      const next = new Map(prev);
      next.set(id, { id, content, mimeType, updatedAt: Date.now() });
      return next;
    });
    return `canvas-${id}`;
  };

  const openCanvasBuffer = (canvasId: string, content = '', mimeType = 'text/html') => {
    const id = `canvas-${canvasId}`;
    setCanvases(prev => {
      if (prev.has(canvasId)) return prev;
      const next = new Map(prev);
      next.set(canvasId, { id: canvasId, content, mimeType, updatedAt: Date.now() });
      return next;
    });
    setBuffers(prev => {
      if (prev.find(b => b.id === id)) return prev;
      return [...prev, { id, type: 'canvas', title: `CANVAS: ${canvasId}`, props: { canvasId }, initialPosition: nextPosition(prev) }];
    });
    return id;
  };

  // ── Stable buffer / tiling callbacks ────────────────────────────────────────

  const removeBufferById = (id: string) => {
    if (id.startsWith('canvas-')) {
      const canvasId = id.replace(/^canvas-/, '');
      setCanvases(prev => {
        const next = new Map(prev);
        next.delete(canvasId);
        return next;
      });
      setAgentTools(prev => {
        const next = new Map<string, AgentTools>();
        for (const [agentId, tools] of prev) {
          const canvasesSet = new Set(tools.canvases);
          canvasesSet.delete(canvasId);
          next.set(agentId, { ...tools, canvases: canvasesSet });
        }
        return next;
      });
    }
    setBuffers(prev => prev.filter(b => b.id !== id));
    setTiledIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setBspTree(prev => (prev ? removeBuffer(prev, id) : null));
  };

  const tileBuffer = (id: string) => {
    setTiledIds(prev => new Set([...prev, id]));
    setBspTree(prev => insertBuffer(prev, id));
  };

  const floatBuffer = (id: string) => {
    setTiledIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setBspTree(prev => (prev ? removeBuffer(prev, id) : null));
  };

  const handleRatioChange = (path: BSPPath, ratio: number) => {
    setBspTree(prev => (prev ? updateRatio(prev, path, ratio) : null));
  };

  const handleSwap = (a: string, b: string) => {
    setBspTree(prev => (prev ? swapLeaves(prev, a, b) : null));
  };

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
      const record = agents.get(identifier);
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

    } else if (base === 'ULTRAKILL') {
      setAgents(new Map());
      setAgentTools(new Map());
      setAgentHistories(prev => {
        const next = new Map(prev);
        for (const key of prev.keys()) {
          if (key.startsWith('agent-')) next.delete(key);
        }
        return next;
      });
      setBuffers(prev => prev.filter(b => b.type !== 'agent'));
      setTiledIds(prev => {
        const next = new Set<string>();
        for (const id of prev) {
          if (!id.startsWith('agent-')) next.add(id);
        }
        return next;
      });
      setBspTree(prev => {
        let tree = prev;
        if (!tree) return tree;
        for (const b of buffers) {
          if (b.type === 'agent') {
            tree = tree ? removeBuffer(tree, b.id) : null;
          }
        }
        return tree;
      });

    } else if (base === 'CANVAS') {
      const canvasId = parts[1];
      if (!canvasId) return;
      openCanvasBuffer(canvasId);

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
      setCanvases(new Map());
      setAgentTools(prev => {
        const next = new Map<string, AgentTools>();
        for (const [agentId, tools] of prev) {
          next.set(agentId, { ...tools, canvases: new Set() });
        }
        return next;
      });

    } else if (base === 'HELP') {
      setBuffers(prev => {
        if (prev.find(b => b.id === 'help')) return prev;
        return [...prev, { id: 'help', type: 'help', title: 'HELP', props: {}, initialPosition: nextPosition(prev) }];
      });
    }
  };

  const executeCommand = (cmd: string) => executeCommandImpl(cmd);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const agentsList = useMemo(() => Array.from(agents.values()), [agents]);

  const getTitle = useCallback(
    (bufferId: string) => buffers.find(b => b.id === bufferId)?.title ?? bufferId,
    [buffers],
  );

  /**
   * Returns the AgentBufferHandle for a given agent identifier (not buffer id).
   * Used by AgentBuffer to call peer agents as tools.
   */
  const getAgentHandle = useCallback((agentId: string): AgentBufferHandle | null => {
    return agentRefs.current.get(`agent-${agentId}`) ?? null;
  }, []);

  const renderBufferContent = (bufferId: string) => {
    const buf = buffers.find(b => b.id === bufferId);
    if (!buf) return null;

    if (buf.type === 'config') {
      return <ConfigBuffer provider={buf.props.provider as string} onSave={() => {}} />;
    }

    if (buf.type === 'agent') {
      const identifier = buf.props.identifier as string;
      const model = buf.props.model as string;
      const messages = agentHistories.get(bufferId) ?? [];
      const toolState = agentTools.get(identifier) ?? { agents: new Set<string>(), canvases: new Set<string>(), canSpawnCanvas: false };

      return (
        <AgentBuffer
          ref={node => {
            if (node) agentRefs.current.set(bufferId, node);
            else agentRefs.current.delete(bufferId);
          }}
          model={model}
          identifier={identifier}
          messages={messages}
          initialAssistantMessage={`Agent ${identifier} online. Running \`${model}\`. How can I assist?`}
          onMessagesChange={msgs => setAgentHistory(bufferId, msgs)}
          availableAgents={agentsList}
          enabledAgentTools={toolState.agents}
          availableCanvases={Array.from(canvases.values())}
          enabledCanvasTools={toolState.canvases}
          canSpawnCanvas={toolState.canSpawnCanvas}
          onToolsChange={tools => setAgentToolSet(identifier, tools)}
          getAgentHandle={getAgentHandle}
          onCanvasWrite={(canvasId, content, mimeType) => {
            const targetId = openCanvasBuffer(canvasId, content, mimeType);
            upsertCanvas(canvasId, content, mimeType);
            return targetId;
          }}
          onSpawnCanvas={(ownerAgentId, requestedId, initialContent, mimeType) => {
            const normalized = requestedId?.trim();
            const canvasId = normalized && normalized.length > 0
              ? normalized
              : `${ownerAgentId}-${Math.random().toString(36).slice(2, 8)}`;
            openCanvasBuffer(canvasId, initialContent, mimeType);
            upsertCanvas(canvasId, initialContent, mimeType);
            setAgentTools(prev => {
              const next = new Map(prev);
              const current = next.get(ownerAgentId) ?? { agents: new Set<string>(), canvases: new Set<string>(), canSpawnCanvas: false };
              next.set(ownerAgentId, { ...current, canvases: new Set([...current.canvases, canvasId]) });
              return next;
            });
            return canvasId;
          }}
        />
      );
    }

    if (buf.type === 'agents') {
      return <AgentsBuffer agents={agentsList} />;
    }

    if (buf.type === 'help') {
      return <HelpBuffer />;
    }

    if (buf.type === 'canvas') {
      const canvasId = buf.props.canvasId as string;
      const canvas = canvases.get(canvasId);
      if (!canvas) return null;
      return <CanvasBuffer id={canvas.id} content={canvas.content} mimeType={canvas.mimeType} updatedAt={canvas.updatedAt} />;
    }

    return null;
  };

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
            padded={buffer.type !== 'agent' && buffer.type !== 'canvas'}
            initialSize={
              buffer.type === 'agent' ? { w: 400, h: 480 }
              : buffer.type === 'agents' ? { w: 400, h: 280 }
              : buffer.type === 'help' ? { w: 520, h: 560 }
              : buffer.type === 'canvas' ? { w: 900, h: 560 }
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
