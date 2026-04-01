import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, useCallback } from 'react';
import { Terminal } from 'lucide-react';
import Buffer from './components/Buffer';
import ConfigBuffer from './components/ConfigBuffer';
import AgentBuffer, { type Message as AgentMessage } from './components/AgentBuffer';
import AgentsBuffer from './components/AgentsBuffer';
import TilingWorkspace from './components/TilingWorkspace';
import { insertBuffer, removeBuffer, swapLeaves, updateRatio, type BSPNode, type BSPPath } from './utils/bsp';

interface CommandDef {
  name: string;
  args?: string;
  desc: string;
}

const AVAILABLE_COMMANDS: CommandDef[] = [
  { name: 'SPAWN', args: '<IDENTIFIER> <MODEL>', desc: 'Spawn a new agent with a given model' },
  { name: 'AGENT', args: '<IDENTIFIER>', desc: "Open a running agent's buffer" },
  { name: 'AGENTS', desc: 'Open a buffer showing all running agents' },
  { name: 'KILL', args: '<IDENTIFIER>', desc: 'Kill a running agent' },
  { name: 'CONFIG', args: '<PROVIDER>', desc: 'Configure an API provider (e.g. OPENROUTER)' },
  { name: 'CLEAR', desc: 'Close all open buffers and clear workspace' },
  { name: 'HELP', desc: 'Show list of available commands and documentation' },
];

interface AgentRecord {
  identifier: string;
  model: string;
}

type BufferType = 'config' | 'agent' | 'agents';

type BufferData = {
  id: string;
  type: BufferType;
  title: string;
  props: Record<string, unknown>;
  initialPosition: { x: number; y: number };
};

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState('');
  const [suggestions, setSuggestions] = useState<CommandDef[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // All open buffers (floating + tiled share this registry)
  const [buffers, setBuffers] = useState<BufferData[]>([]);

  // BSP tiling state
  const [bspTree, setBspTree] = useState<BSPNode | null>(null);
  const [tiledIds, setTiledIds] = useState<Set<string>>(new Set());

  // Agent registry
  const [agents, setAgents] = useState<Map<string, AgentRecord>>(new Map());

  // Persistent chat histories keyed by buffer ID — survive remounts
  const [agentHistories, setAgentHistories] = useState<Map<string, AgentMessage[]>>(new Map());

  const getAgentHistory = (bufferId: string, identifier: string, model: string): AgentMessage[] =>
    agentHistories.get(bufferId) ?? [
      { role: 'assistant', content: `Agent ${identifier} online. Running \`${model}\`. How can I assist?`, timestamp: Date.now() },
    ];

  const setAgentHistory = (bufferId: string, msgs: AgentMessage[]) =>
    setAgentHistories(prev => new Map([...prev, [bufferId, msgs]]));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCommandChange = (val: string) => {
    const upperVal = val.toUpperCase();
    setCommand(upperVal);
    if (upperVal.trim().length > 0) {
      const baseSearch = upperVal.trim().split(' ')[0];
      setSuggestions(AVAILABLE_COMMANDS.filter(cmd => cmd.name.startsWith(baseSearch)));
      setSelectedIndex(0);
    } else {
      setSuggestions([]);
      setSelectedIndex(0);
    }
  };

  // ── Buffer helpers ──────────────────────────────────────────────────────────

  const nextPosition = (currentBuffers: BufferData[]) => ({
    x: window.innerWidth / 2 - 200 + currentBuffers.length * 20,
    y: window.innerHeight / 4 + currentBuffers.length * 20,
  });

  const addBuffer = (newBuf: BufferData) => {
    setBuffers(prev => {
      if (prev.find(b => b.id === newBuf.id)) return prev;
      return [...prev, newBuf];
    });
  };

  const removeBufferById = (id: string) => {
    setBuffers(prev => prev.filter(b => b.id !== id));
    // Also remove from tiling if present
    setTiledIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setBspTree(prev => (prev ? removeBuffer(prev, id) : null));
  };

  // ── Tiling ──────────────────────────────────────────────────────────────────

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

  // ── Command execution ────────────────────────────────────────────────────────

  const executeCommand = (cmdStr: string) => {
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
      setAgents(cur => {
        const record = cur.get(identifier);
        if (!record) return cur;
        const id = `agent-${identifier}`;
        setBuffers(prev => {
          if (prev.find(b => b.id === id)) return prev;
          return [...prev, { id, type: 'agent', title: `AGENT: ${identifier}`, props: { identifier, model: record.model }, initialPosition: nextPosition(prev) }];
        });
        return cur;
      });

    } else if (base === 'AGENTS') {
      addBuffer({ id: 'agents', type: 'agents', title: 'AGENTS', props: {}, initialPosition: nextPosition(buffers) });

    } else if (base === 'KILL') {
      const identifier = parts[1];
      if (!identifier) return;
      setAgents(prev => { const n = new Map(prev); n.delete(identifier); return n; });
      removeBufferById(`agent-${identifier}`);

    } else if (base === 'CONFIG') {
      const provider = parts[1] ?? 'OPENROUTER';
      addBuffer({ id: `config-${provider}`, type: 'config', title: `CONFIG: ${provider}`, props: { provider }, initialPosition: nextPosition(buffers) });

    } else if (base === 'CLEAR') {
      setBuffers([]);
      setBspTree(null);
      setTiledIds(new Set());
    }

    setCommand('');
    setSuggestions([]);
  };

  const handleInputKeyDown = (e: ReactKeyboardEvent) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => (p > 0 ? p - 1 : suggestions.length - 1)); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => (p < suggestions.length - 1 ? p + 1 : 0)); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        setCommand(suggestions[selectedIndex].name + ' ');
        setSuggestions([]);
        return;
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (command.trim()) executeCommand(command);
    }
  };

  // ── Render helpers ───────────────────────────────────────────────────────────

  const agentsList = Array.from(agents.values());

  const renderBufferContent = (bufferId: string) => {
    const buf = buffers.find(b => b.id === bufferId);
    if (!buf) return null;
    if (buf.type === 'config') return <ConfigBuffer provider={buf.props.provider as string} onSave={() => {}} />;
    if (buf.type === 'agent') {
      const identifier = buf.props.identifier as string;
      const model = buf.props.model as string;
      return (
        <AgentBuffer
          model={model}
          messages={getAgentHistory(bufferId, identifier, model)}
          onMessagesChange={msgs => setAgentHistory(bufferId, msgs)}
        />
      );
    }
    if (buf.type === 'agents') return <AgentsBuffer agents={agentsList} />;
    return null;
  };

  const getTitle = (bufferId: string) => buffers.find(b => b.id === bufferId)?.title ?? bufferId;

  const floatingBuffers = buffers.filter(b => !tiledIds.has(b.id));

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-white font-mono overflow-hidden !rounded-none">
      {/* Main Workspace */}
      <div className="flex-1 bg-background relative">

        {/* Tiling layer — isolated stacking context so internal z-indices never bleed above floats */}
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

        {/* Floating buffers layer (top) */}
        {floatingBuffers.map((buffer, index) => (
          <Buffer
            key={buffer.id}
            id={buffer.id}
            title={buffer.title}
            onClose={removeBufferById}
            onTile={tileBuffer}
            initialPosition={buffer.initialPosition}
            zIndex={100 + index}
            maxHeight={
              buffer.type === 'agent' ? '560px'
              : buffer.type === 'agents' ? '320px'
              : undefined
            }
          >
            {renderBufferContent(buffer.id)}
          </Buffer>
        ))}
      </div>

      {/* Command Prompt */}
      <div className="w-full bg-background border-t border-razzmatazz flex items-center !rounded-none relative z-50">

        {/* Autocomplete Dropup */}
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 w-full bg-background border-t border-razzmatazz text-sm font-mono max-h-64 overflow-y-auto">
            {suggestions.map((sugg, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={sugg.name}
                  className={`flex justify-between items-center px-4 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-razzmatazz text-background' : 'hover:bg-razzmatazz/20 text-white'}`}
                  onClick={() => { setCommand(sugg.name + ' '); setSuggestions([]); inputRef.current?.focus(); }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{sugg.name}</span>
                    {sugg.args && <span className={isSelected ? 'text-black/70' : 'text-razzmatazz/70'}>{sugg.args}</span>}
                  </div>
                  <span className={isSelected ? 'text-black/80' : 'text-gray-400'}>{sugg.desc}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Input */}
        <label className="flex flex-col w-full relative">
          <div className="flex items-center w-full px-4 py-2 cursor-text relative">
            <span className="text-razzmatazz mr-3 font-bold text-xl flex items-center justify-center gap-2 select-none">
              <Terminal size={20} className="text-razzmatazz" />
            </span>
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent outline-none focus:outline-none text-razzmatazz text-lg !rounded-none border-none placeholder-razzmatazz/40 flex-1 caret-razzmatazz relative z-10 uppercase focus:ring-0"
              placeholder="COMMAND PROMPT (CTRL+K TO FOCUS)"
              value={command}
              onChange={e => handleCommandChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck="false"
              autoComplete="off"
            />
            <div className="text-gray-600 text-xs ml-4 select-none uppercase">
              Tab to complete ↵ to run
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}
