# Tetrel: Bloomberg Terminal for AI Agent Orchestration

## Overview
Tetrel is a high-performance, command-line-first control center designed for orchestrating multiple AI agents on complex, multi-step tasks. It draws inspiration from the **Bloomberg Terminal** aesthetic—dense, data-rich, and built for speed—to provide a professional interface for AI reasoning and agentic workflows.

## Design Philosophy
- **Aesthetic**: Dark Onyx background, Razzmatazz (`#E3256B`) primary brand color.
- **Form**: Strictly angular. No rounded corners (`rounded-none`).
- **Typography**: `Fira Code` exclusively (monospaced for precision).
- **Navigation**: Command-line first. `CTRL+K` focuses the primary Command Prompt.
- **Density**: Maximized for professional data monitoring and multi-agent visibility.

## Technical Stack
- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4 + DaisyUI (Dark Theme)
- **Icons**: Lucide React
- **Fonts**: @fontsource/fira-code

---

## Components

### 1. Command Prompt
The "Control Strip" at the bottom of the interface. It is the primary means of interacting with the orchestrator.
- **Focus**: `CTRL+K`
- **Icon**: Lucide `Terminal`
- **Color**: Razzmatazz
- **Autocomplete**: Tab to complete, Arrow Up/Down to cycle, Enter to run.
- **Performance**: Isolated component (typing does not re-render the workspace).

### 2. Buffers
Floating windows that display content. They can be dragged around the workspace, constrained to screen bounds.
- **Shadow**: Offset block-shadow in Razzmatazz style; grows on drag.
- **Title bar**: Razzmatazz background; drag handle area.
- **Buttons** (in title bar, left to right):
  - `LayoutGrid` — tile the buffer into the BSP workspace.
  - `X` — close the buffer.
- **Max heights**: `agent` buffers cap at 560px; `agents` buffers cap at 320px.

### 3. Tiling Workspace (BSP)
Buffers can be moved from the floating layer into a tiled workspace using the `LayoutGrid` button on their title bar.
- **Layout algorithm**: Binary Space Partitioning (BSP). Even depths split horizontally, odd depths split vertically.
- **Resize**: Drag the 5px handle between any two tiles to adjust the split ratio (min 10%, max 90%).
- **Rearrange**: Drag a tile's title bar and drop it onto another tile to swap their positions.
- **Float**: Click the `Move` icon on a tiled buffer's title bar to return it to the floating layer.
- **Stacking**: The tiling layer has `isolation: isolate` and `z-index: 0`, keeping it entirely beneath floating buffers (which start at `z-index: 100`).

---

## Buffer Types

### `config` — Provider Configuration
Opened via `CONFIG <PROVIDER>`. Saves an API key to `localStorage` under `TETREL_API_KEY_<PROVIDER>`.

### `agent` — Agent Chat Interface
Opened automatically on `SPAWN` or manually via `AGENT <IDENTIFIER>`.
- Full streaming chat loop using **OpenRouter API** (SSE, `stream: true`).
- **Markdown**: Rich text rendering via `react-markdown` + `remark-gfm`.
- Chat history is **persistent**: stored in `App.tsx` (`agentHistories` map keyed by buffer ID) and survives close/reopen, tile/float, and remounts.
- Supports **abort** (Stop button) mid-stream.
- Supports tool-calling to peer agents and canvases, including live pending tool-call rows and structured tool results.

### `agents` — Agent Registry Overview
Opened via `AGENTS`. A live table of all running agents: identifier, model, and a green pulse indicator.

### `canvas` — Artifact/Canvas Surface
Opened via `CANVAS <ID>`.
- Empty-state canvas that can be populated by agents via tool calls.
- Tabbed view (`Preview` / `Source`), defaulting to `Preview`.
- HTML canvases render in-browser preview with source inspection.
- Closing a canvas fully removes it from state and from agent canvas tool permissions.

---

## Commands

| Command | Arguments | Description |
|---|---|---|
| `SPAWN` | `<ID> <MODEL>` | Spawn a new agent and immediately open its buffer |
| `AGENT` | `<ID>` | Re-open a running agent's buffer |
| `CANVAS` | `<ID>` | Open (or create) a canvas buffer |
| `AGENTS` | — | Open the agent registry overview buffer |
| `KILL` | `<ID>` | Kill an agent and clear its history/buffer |
| `ULTRAKILL` | — | Kill all running agents at once |
| `CONFIG` | `<PROVIDER>` | Open the provider configuration buffer |
| `CLEAR` | — | Close all open buffers and reset the tiling workspace |
| `HELP` | — | Show available commands and documentation |

---

## Architecture

```
src/
├── App.tsx                  # Root: orchestrator state, buffer management, linking logic
├── utils/
│   └── bsp.ts               # Pure BSP tree operations (insert, remove, swap, updateRatio)
└── components/
    ├── Buffer.tsx            # Floating buffer shell (drag, clamp, shadow, tile/close buttons)
    ├── TilingWorkspace.tsx   # BSP renderer (pixel-accurate layout, resize handles, drag-to-swap)
    ├── AgentBuffer.tsx       # Streaming chat UI + tool-calling loop (agents + canvases)
    ├── AgentsBuffer.tsx      # Agent registry table
    ├── CanvasBuffer.tsx      # Canvas/artifact preview + source tabs
    ├── ConfigBuffer.tsx      # API key configuration form
    ├── HelpBuffer.tsx        # In-app command and workflow docs
    └── CommandPrompt.tsx     # Isolated, high-performance command interface
```

### State Model (App.tsx)
| State | Type | Purpose |
|---|---|---|
| `buffers` | `BufferData[]` | Master registry of all open buffers (floating + tiled) |
| `bspTree` | `BSPNode \| null` | BSP tree — only contains IDs of tiled buffers |
| `tiledIds` | `Set<string>` | Fast lookup for which buffers are currently tiled |
| `agents` | `Map<id, AgentRecord>` | Live agent registry (identifier → model) |
| `agentHistories` | `Map<id, Message[]>` | Persistent chat histories keyed by buffer ID |
| `canvases` | `Map<id, CanvasRecord>` | Canvas registry and current content/metadata |
| `agentTools` | `Map<agentId, AgentTools>` | Per-agent tool permissions (agents/canvases/spawn) |
| `agentRefs` | `useRef<Map>` | Imperative handles to AgentBuffers for automated messaging |
