import { Terminal, Bot, Zap, Wrench, Layout, ChevronRight } from 'lucide-react';

// ── Data ──────────────────────────────────────────────────────────────────────

interface CommandEntry {
  name: string;
  args?: string;
  desc: string;
  example?: string;
}

const COMMANDS: CommandEntry[] = [
  {
    name: 'SPAWN',
    args: '<ID> <MODEL>',
    desc: 'Spawn a new AI agent and open its buffer. ID is a short identifier you choose; MODEL is the OpenRouter model slug.',
    example: 'SPAWN alpha google/gemma-3-27b-it',
  },
  {
    name: 'AGENT',
    args: '<ID>',
    desc: 'Re-open the buffer for an already-running agent. Useful if you closed the window but the agent is still alive.',
    example: 'AGENT alpha',
  },
  {
    name: 'AGENTS',
    desc: 'Open the agent registry — a live table of every running agent, its model, and status.',
    example: 'AGENTS',
  },
  {
    name: 'KILL',
    args: '<ID>',
    desc: 'Terminate an agent and erase its chat history. This is permanent.',
    example: 'KILL alpha',
  },
  {
    name: 'CONFIG',
    args: '<PROVIDER>',
    desc: 'Open a configuration buffer to set an API key. Currently supports OPENROUTER. The key is stored in localStorage.',
    example: 'CONFIG OPENROUTER',
  },
  {
    name: 'CLEAR',
    desc: 'Close all open buffers and reset the tiling workspace. Agent histories are preserved in memory.',
    example: 'CLEAR',
  },
  {
    name: 'HELP',
    desc: 'Open this documentation buffer.',
    example: 'HELP',
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 border-b border-razzmatazz/30 pb-1 mb-3">
        <Icon size={13} className="text-razzmatazz" />
        <h2 className="text-razzmatazz text-xs font-bold uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-black/40 border border-razzmatazz/30 px-1.5 py-0.5 text-[10px] text-razzmatazz/90 font-mono">
      {children}
    </code>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HelpBuffer() {
  return (
    <div className="text-xs font-mono text-gray-300 leading-relaxed select-text overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pb-3 border-b border-razzmatazz/40">
        <Terminal size={20} className="text-razzmatazz flex-shrink-0" />
        <div>
          <p className="text-razzmatazz font-bold text-sm uppercase tracking-widest">Tetrel</p>
          <p className="text-gray-500 text-[10px]">Bloomberg Terminal for AI Agent Orchestration</p>
        </div>
      </div>

      {/* What is Tetrel */}
      <Section icon={Zap} title="Overview">
        <p className="text-gray-400 leading-relaxed mb-2">
          Tetrel is a command-line-first control centre for orchestrating multiple AI agents on complex tasks.
          Every interaction happens through the <strong className="text-white">Command Prompt</strong> at the bottom of the screen.
        </p>
        <p className="text-gray-400 leading-relaxed">
          Agents can be connected as tools — one agent can automatically call another when it needs help,
          enabling multi-step reasoning chains and specialist delegations.
        </p>
      </Section>

      {/* Getting started */}
      <Section icon={ChevronRight} title="Getting Started">
        <ol className="list-none space-y-2 text-gray-400">
          {[
            ['Set your API key', 'CONFIG OPENROUTER', 'Enter your OpenRouter key in the buffer that opens.'],
            ['Spawn an agent', 'SPAWN alpha google/gemma-3-27b-it', 'Give it a short ID and any OpenRouter model slug.'],
            ['Chat', '', 'Type in the agent\'s input box and press Enter. Supports full Markdown rendering.'],
            ['Add tools', '', 'Click the ⚙ gear icon on an agent buffer to open Agent Tools and enable peer agents as callable tools.'],
            ['Tile or float', '', 'Use the ⊞ icon on any buffer title bar to tile it into the BSP workspace, or drag it freely.'],
          ].map(([step, cmd, note], i) => (
            <li key={i} className="flex gap-2">
              <span className="text-razzmatazz font-bold flex-shrink-0">{i + 1}.</span>
              <div>
                <span className="text-white">{step}</span>
                {cmd && <> — <Kbd>{cmd}</Kbd></>}
                <br />
                <span className="text-gray-500">{note}</span>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      {/* Commands */}
      <Section icon={Terminal} title="Commands">
        <div className="flex flex-col gap-3">
          {COMMANDS.map(cmd => (
            <div key={cmd.name} className="border border-razzmatazz/15 bg-razzmatazz/5 px-3 py-2">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-razzmatazz font-bold">{cmd.name}</span>
                {cmd.args && <span className="text-razzmatazz/50">{cmd.args}</span>}
              </div>
              <p className="text-gray-400 mb-1">{cmd.desc}</p>
              {cmd.example && (
                <div className="flex items-center gap-1">
                  <ChevronRight size={9} className="text-razzmatazz/50 flex-shrink-0" />
                  <code className="text-razzmatazz/70 text-[10px]">{cmd.example}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* Keyboard shortcuts */}
      <Section icon={Zap} title="Keyboard Shortcuts">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-gray-400">
          {([
            ['Ctrl+K', 'Focus the Command Prompt from anywhere'],
            ['Enter (suggestions open)', 'Autocomplete to the highlighted command'],
            ['Tab (suggestions open)', 'Cycle through suggestions'],
            ['↑ / ↓ (suggestions open)', 'Move selection up or down'],
            ['Enter (no suggestions)', 'Execute the typed command'],
            ['Enter (agent input)', 'Send message to the agent'],
            ['Stop button / Abort', 'Cancel a streaming response mid-flight'],
          ] as [string, string][]).map(([key, desc]) => (
            <div key={key} className="contents">
              <Kbd>{key}</Kbd>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Agents & Tool calling */}
      <Section icon={Bot} title="Agents & Tool Calling">
        <p className="text-gray-400 mb-2">
          When you enable another agent as a tool (via the ⚙ settings panel), the model receives a
          function definition it can invoke by name. The agentic loop:
        </p>
        <ol className="list-none space-y-1 text-gray-400 mb-3">
          {[
            'Model decides to call a peer agent and emits a tool_call in its response.',
            'Tetrel invokes that agent\'s sendMessage imperatively with the requested text.',
            'The target agent runs its own full chat turn (including its own tools, if any).',
            'The result is injected back as a tool result message.',
            'The calling model sees the result and continues its response.',
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-razzmatazz flex-shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-gray-500">Tool calls are shown inline as amber <Kbd>Tool result · agent</Kbd> rows in the chat.</p>
      </Section>

      {/* Workspace */}
      <Section icon={Layout} title="Workspace & Buffers">
        <div className="flex flex-col gap-2 text-gray-400">
          <p>
            <span className="text-white">Floating buffers</span> — Drag by the Razzmatazz title bar to move.
            Drag the right edge, bottom edge, or bottom-right corner to resize.
          </p>
          <p>
            <span className="text-white">Tiling (BSP)</span> — Click ⊞ on a title bar to snap the buffer into the
            Binary Space Partition workspace. Even depth splits horizontally, odd depth splits vertically.
          </p>
          <p>
            <span className="text-white">Resize tiles</span> — Drag the 5 px divider between any two tiled buffers.
          </p>
          <p>
            <span className="text-white">Swap tiles</span> — Drag a tiled buffer's title bar and drop it onto another
            tile to swap their positions.
          </p>
          <p>
            <span className="text-white">Float a tile</span> — Click the Move icon on a tiled buffer's title bar to
            return it to the floating layer.
          </p>
        </div>
      </Section>

      {/* Provider */}
      <Section icon={Wrench} title="API Provider">
        <p className="text-gray-400 mb-2">
          Tetrel uses <strong className="text-white">OpenRouter</strong> to route requests to any supported model.
          Your key is stored in <Kbd>localStorage</Kbd> under <Kbd>TETREL_API_KEY_OPENROUTER</Kbd> and never leaves your browser.
        </p>
        <p className="text-gray-400">
          Models are specified as OpenRouter slugs, e.g. <Kbd>google/gemma-3-27b-it</Kbd>, <Kbd>anthropic/claude-3.5-sonnet</Kbd>,
          or <Kbd>openai/gpt-4o</Kbd>.
        </p>
      </Section>

      <p className="text-gray-700 text-[10px] text-center pb-2 pt-2 border-t border-razzmatazz/10">
        TETREL · Command-line AI orchestration
      </p>
    </div>
  );
}
