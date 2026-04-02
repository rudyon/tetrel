import {
  useState,
  useRef,
  useEffect,
  forwardRef,
  useImperativeHandle,
  type KeyboardEvent,
} from 'react';
import {
  Send,
  Bot,
  User,
  AlertTriangle,
  Loader,
  Settings,
  X,
  Wrench,
  CheckSquare,
  Square,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  /** Only set when role === 'tool', identifies which tool call this responds to */
  tool_call_id?: string;
  /** Display label for tool messages */
  tool_name?: string;
}

interface AgentRecord {
  identifier: string;
  model: string;
}

interface AgentBufferProps {
  model: string;
  identifier: string;
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
  /** All other live agents (for tool configuration) */
  availableAgents: AgentRecord[];
  /** Which agent identifiers this agent can call as tools */
  enabledTools: Set<string>;
  onToolsChange: (tools: Set<string>) => void;
  /** Imperative handles to other agents so we can call them */
  getAgentHandle: (identifier: string) => AgentBufferHandle | null;
}

export interface AgentBufferHandle {
  sendMessage: (msg: string) => Promise<string>;
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ── OpenRouter tool schema ────────────────────────────────────────────────────

function buildTools(enabledTools: Set<string>, available: AgentRecord[]) {
  return available
    .filter(a => enabledTools.has(a.identifier))
    .map(a => ({
      type: 'function' as const,
      function: {
        name: `agent_${a.identifier}`,
        description: `Send a message to agent "${a.identifier}" (model: ${a.model}) and get its response.`,
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to send to this agent.',
            },
          },
          required: ['message'],
        },
      },
    }));
}

// ── Streaming helper ──────────────────────────────────────────────────────────

interface ToolCallAccum {
  id: string;
  name: string;
  args: string;
}

async function streamCompletion(
  model: string,
  apiMessages: { role: string; content: string; tool_call_id?: string; name?: string; tool_calls?: unknown[] }[],
  tools: ReturnType<typeof buildTools>,
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<{ content: string; toolCalls: ToolCallAccum[] }> {
  const apiKey = localStorage.getItem('TETREL_API_KEY_OPENROUTER');
  if (!apiKey) throw new Error('No OpenRouter API key. Run CONFIG OPENROUTER.');

  const body: Record<string, unknown> = {
    model: model.toLowerCase(),
    stream: true,
    messages: apiMessages,
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://tetrel.tech',
      'X-Title': 'Tetrel',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error('No response body');

  let content = '';
  const toolCallMap = new Map<number, ToolCallAccum>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        // Normal text content
        if (delta.content) {
          content += delta.content;
          onDelta(delta.content);
        }

        // Tool call deltas (may be chunked across SSE events)
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx: number = tc.index ?? 0;
            if (!toolCallMap.has(idx)) {
              toolCallMap.set(idx, { id: '', name: '', args: '' });
            }
            const acc = toolCallMap.get(idx)!;
            if (tc.id) acc.id += tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
          }
        }
      } catch {
        // malformed SSE, skip
      }
    }
  }

  return { content, toolCalls: Array.from(toolCallMap.values()) };
}

// ─────────────────────────────────────────────────────────────────────────────

const AgentBuffer = forwardRef<AgentBufferHandle, AgentBufferProps>(
  (
    {
      model,
      identifier,
      messages,
      onMessagesChange,
      availableAgents,
      enabledTools,
      onToolsChange,
      getAgentHandle,
    },
    ref,
  ) => {
    const [input, setInput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    // Whether the user is scrolled to (or near) the bottom
    const pinnedRef = useRef(true);

    // Keep a ref to the latest messages for use inside async callbacks
    const messagesRef = useRef(messages);
    useEffect(() => {
      messagesRef.current = messages;
    }, [messages]);

    // Close settings when clicking outside
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
          setSettingsOpen(false);
        }
      };
      if (settingsOpen) document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [settingsOpen]);

    // Expose sendMessage imperatively and return the final accumulated response
    useImperativeHandle(ref, () => ({
      sendMessage: async (msg: string) => {
        return await sendImpl(msg);
      },
    }));

    // Auto-scroll only when pinned to bottom
    useEffect(() => {
      if (pinnedRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, [messages]);

    // Track whether user is near the bottom so we know when to re-pin
    const handleScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      pinnedRef.current = distFromBottom < 100;
    };

    // When streaming starts, re-pin to bottom
    useEffect(() => {
      if (streaming) pinnedRef.current = true;
    }, [streaming]);

    const send = () => sendImpl(input);

    /**
     * Core send logic. Returns the final assistant content string.
     * Implements an agentic loop: if the model returns tool_calls,
     * we call the target agent, inject the result, and call the LLM again.
     */
    const sendImpl = async (textToSubmit: string): Promise<string> => {
      const trimmed = textToSubmit.trim();
      if (!trimmed || streaming) return '';

      if (textToSubmit === input) setInput('');

      setError(null);
      setStreaming(true);

      const userMsg: Message = {
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      const threadMessages: Message[] = [...messagesRef.current, userMsg];
      onMessagesChange(threadMessages);
      messagesRef.current = threadMessages;

      const controller = new AbortController();
      abortRef.current = controller;

      const tools = buildTools(enabledTools, availableAgents);
      let finalContent = '';

      try {
        finalContent = await agenticLoop(
          model,
          tools,
          threadMessages,
          controller.signal,
          getAgentHandle,
          (updated) => {
            onMessagesChange(updated);
            messagesRef.current = updated;
          },
          messagesRef,
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // user cancelled — keep whatever streamed
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
          // Remove empty trailing assistant placeholder
          const current = messagesRef.current;
          const last = current[current.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            const cleaned = current.slice(0, -1);
            onMessagesChange(cleaned);
            messagesRef.current = cleaned;
          }
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }

      return finalContent;
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    };

    const fmt = (ts: number) =>
      new Date(ts).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

    const toggleTool = (agentId: string) => {
      const next = new Set(enabledTools);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      onToolsChange(next);
    };

    // Agents this buffer can enable (everyone except itself)
    const otherAgents = availableAgents.filter(a => a.identifier !== identifier);

    return (
      <div className="flex flex-col h-full min-h-0 relative">
        {/* Model badge + settings toggle */}
        <div className="px-3 py-1 border-b border-razzmatazz/30 text-razzmatazz/60 text-xs uppercase tracking-widest select-none flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{model}</span>
            {enabledTools.size > 0 && (
              <span className="flex items-center gap-1 text-amber-400/80">
                <Wrench size={10} />
                <span>{enabledTools.size}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {streaming && (
              <span className="flex items-center gap-1 text-razzmatazz/80">
                <Loader size={10} className="animate-spin" />
                <span>streaming</span>
              </span>
            )}
            <button
              onClick={() => setSettingsOpen(v => !v)}
              className={`transition-colors cursor-pointer ${settingsOpen ? 'text-razzmatazz' : 'text-razzmatazz/40 hover:text-razzmatazz/80'}`}
              title="Agent settings"
            >
              <Settings size={13} />
            </button>
          </div>
        </div>

        {/* Settings dropdown panel */}
        {settingsOpen && (
          <div
            ref={settingsRef}
            className="absolute top-7 right-0 z-50 bg-background border border-razzmatazz/40 w-72 shadow-[8px_8px_0_0_rgba(0,0,0,0.8)]"
          >
            {/* Header */}
            <div className="bg-razzmatazz/20 border-b border-razzmatazz/30 px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-razzmatazz flex items-center gap-2">
                <Wrench size={11} />
                Agent Tools
              </span>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-razzmatazz/60 hover:text-razzmatazz transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>

            {/* Tool list */}
            <div className="px-3 py-2">
              <p className="text-gray-500 text-xs mb-2 leading-relaxed">
                Select agents this agent can invoke as tools. The model will call them automatically when needed.
              </p>

              {otherAgents.length === 0 ? (
                <p className="text-gray-600 text-xs italic py-1">
                  No other agents running. Spawn one first.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {otherAgents.map(a => {
                    const enabled = enabledTools.has(a.identifier);
                    return (
                      <button
                        key={a.identifier}
                        onClick={() => toggleTool(a.identifier)}
                        className={`flex items-center gap-2 px-2 py-1.5 text-xs font-mono text-left w-full transition-colors cursor-pointer border ${
                          enabled
                            ? 'border-razzmatazz/50 bg-razzmatazz/10 text-white'
                            : 'border-white/10 bg-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'
                        }`}
                      >
                        {enabled ? (
                          <CheckSquare size={12} className="text-razzmatazz flex-shrink-0" />
                        ) : (
                          <Square size={12} className="text-gray-600 flex-shrink-0" />
                        )}
                        <span className="flex-1">{a.identifier}</span>
                        <span className="text-gray-600 truncate max-w-[100px]">{a.model}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active tools summary */}
            {enabledTools.size > 0 && (
              <div className="border-t border-razzmatazz/20 px-3 py-2">
                <p className="text-amber-400/70 text-xs flex items-center gap-1">
                  <Wrench size={10} />
                  {enabledTools.size} tool{enabledTools.size > 1 ? 's' : ''} active
                </p>
              </div>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border-b border-red-500/30 text-red-400 text-xs">
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto flex flex-col gap-3 px-3 py-3 tetrel-scrollbar"
        >
          {messages.map((msg, i) => {
            if (msg.role === 'tool') {
              return (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5 border border-amber-500/20 bg-amber-900/10 text-xs font-mono">
                  <Wrench size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-amber-400/80 uppercase tracking-wider text-[10px]">
                      Tool result · {msg.tool_name ?? 'agent'}
                    </span>
                    <span className="text-gray-300 whitespace-pre-wrap break-words">{msg.content}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className="flex-shrink-0 mt-1">
                  {msg.role === 'assistant' ? (
                    <Bot size={14} className="text-razzmatazz" />
                  ) : (
                    <User size={14} className="text-gray-400" />
                  )}
                </div>
                <div className={`flex flex-col gap-0.5 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-3 py-2 text-sm leading-relaxed !rounded-none border ${
                      msg.role === 'assistant'
                        ? 'bg-razzmatazz/10 border-razzmatazz/30 text-white'
                        : 'bg-white/5 border-white/10 text-gray-200'
                    } ${msg.role === 'assistant' && !msg.content && streaming ? 'animate-pulse' : ''}`}
                  >
                    {msg.content || (streaming ? '▋' : '') ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          h1: ({ children }) => <h1 className="text-base font-bold text-razzmatazz mb-2 mt-1 uppercase tracking-wider">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold text-razzmatazz mb-1 mt-1 uppercase tracking-wider">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold text-razzmatazz/80 mb-1 mt-1">{children}</h3>,
                          code: ({ children, className }) => {
                            const isBlock = className?.includes('language-');
                            return isBlock ? (
                              <code className="block bg-black/40 border border-razzmatazz/20 px-3 py-2 my-2 text-xs text-razzmatazz/90 font-mono overflow-x-auto whitespace-pre">{children}</code>
                            ) : (
                              <code className="bg-black/40 border border-razzmatazz/20 px-1 text-xs text-razzmatazz/90 font-mono">{children}</code>
                            );
                          },
                          pre: ({ children }) => <pre className="my-2 overflow-x-auto">{children}</pre>,
                          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5 pl-2">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5 pl-2">{children}</ol>,
                          li: ({ children }) => <li className="text-sm">{children}</li>,
                          blockquote: ({ children }) => <blockquote className="border-l-2 border-razzmatazz/50 pl-3 my-2 text-gray-400 italic">{children}</blockquote>,
                          strong: ({ children }) => <strong className="font-bold text-razzmatazz/90">{children}</strong>,
                          em: ({ children }) => <em className="italic text-gray-300">{children}</em>,
                          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-razzmatazz underline hover:text-white transition-colors">{children}</a>,
                          hr: () => <hr className="border-razzmatazz/30 my-3" />,
                          table: ({ children }) => <table className="w-full text-xs border-collapse my-2">{children}</table>,
                          th: ({ children }) => <th className="border border-razzmatazz/30 px-2 py-1 text-razzmatazz font-bold uppercase text-left">{children}</th>,
                          td: ({ children }) => <td className="border border-razzmatazz/20 px-2 py-1 text-gray-300">{children}</td>,
                        }}
                      >
                        {msg.content || '▋'}
                      </ReactMarkdown>
                    ) : null}
                  </div>
                  <span className="text-gray-600 text-xs">{fmt(msg.timestamp)}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-razzmatazz/30 flex items-center gap-2 px-3 py-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? 'Waiting for response...' : 'Message agent...'}
            disabled={streaming}
            className="flex-1 bg-transparent outline-none text-white text-sm placeholder-gray-600 disabled:placeholder-gray-700 !rounded-none border-none focus:ring-0 font-mono disabled:cursor-not-allowed"
            autoComplete="off"
            spellCheck="false"
          />
          {streaming ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="text-red-400 hover:text-red-300 transition-colors cursor-pointer text-xs uppercase tracking-widest"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              className="text-razzmatazz hover:text-white transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    );
  },
);

export default AgentBuffer;

// ── Agentic loop (outside component to keep it pure) ─────────────────────────

/**
 * Runs the LLM call and handles tool calls in a loop.
 * Updates the message thread via `setThread` after every partial delta and
 * after each tool call / tool result injection.
 * Returns the final assistant text content.
 */
async function agenticLoop(
  model: string,
  tools: ReturnType<typeof buildTools>,
  initialMessages: Message[],
  signal: AbortSignal,
  getAgentHandle: (id: string) => AgentBufferHandle | null,
  setThread: (msgs: Message[]) => void,
  messagesRef: React.MutableRefObject<Message[]>,
): Promise<string> {
  let thread = [...initialMessages];
  const assistantTimestamp = Date.now();

  // Add streaming placeholder
  thread = [...thread, { role: 'assistant', content: '', timestamp: assistantTimestamp }];
  setThread(thread);
  messagesRef.current = thread;

  let finalContent = '';

  // We loop to handle multi-step tool calls
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let accumulated = '';

    const apiMessages = thread
      .filter(m => m.role !== 'assistant' || m.content.length > 0 || m === thread[thread.length - 1])
      .map(m => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.tool_call_id ?? 'unknown',
            name: m.tool_name ?? 'agent',
          };
        }
        return { role: m.role as 'user' | 'assistant', content: m.content };
      })
      // Remove the empty assistant placeholder before calling the API
      .filter((m, idx, arr) => !(m.role === 'assistant' && m.content === '' && idx === arr.length - 1));

    const { content, toolCalls } = await streamCompletion(
      model,
      apiMessages,
      tools,
      signal,
      (delta) => {
        accumulated += delta;
        // Update the last message (assistant placeholder) live
        const current = messagesRef.current;
        const updated = [...current];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === 'assistant' && updated[lastIdx].timestamp === assistantTimestamp) {
          updated[lastIdx] = { ...updated[lastIdx], content: accumulated };
        }
        setThread(updated);
        messagesRef.current = updated;
      },
    );

    // Finalise the assistant message in thread
    const current = messagesRef.current;
    const updated = [...current];
    const lastIdx = updated.length - 1;
    if (updated[lastIdx]?.role === 'assistant' && updated[lastIdx].timestamp === assistantTimestamp) {
      updated[lastIdx] = { ...updated[lastIdx], content: content || accumulated };
    }
    thread = updated;
    setThread(thread);
    messagesRef.current = thread;

    finalContent = content || accumulated;

    // No tool calls — we're done
    if (toolCalls.length === 0) break;

    // Execute each tool call sequentially
    for (const tc of toolCalls) {
      // tc.name looks like "agent_IDENTIFIER"
      const agentId = tc.name.replace(/^agent_/, '');
      let args: { message?: string } = {};
      try {
        args = JSON.parse(tc.args);
      } catch {
        args = { message: tc.args };
      }

      const messageToSend = args.message ?? tc.args;

      // Show a pending tool result in the thread
      const toolResultMsg: Message = {
        role: 'tool',
        content: `Calling ${agentId}…`,
        timestamp: Date.now(),
        tool_call_id: tc.id,
        tool_name: agentId,
      };
      thread = [...thread, toolResultMsg];
      setThread(thread);
      messagesRef.current = thread;

      // Actually call the agent
      let result = '';
      const handle = getAgentHandle(agentId);
      if (handle) {
        try {
          result = await handle.sendMessage(messageToSend);
        } catch (e) {
          result = `Error calling agent ${agentId}: ${e instanceof Error ? e.message : String(e)}`;
        }
      } else {
        result = `Agent "${agentId}" is not available.`;
      }

      // Update the tool result message with the actual result
      const updatedThread = [...messagesRef.current];
      const toolIdx = updatedThread.findLastIndex(
        m => m.role === 'tool' && m.tool_call_id === tc.id,
      );
      if (toolIdx !== -1) {
        updatedThread[toolIdx] = { ...updatedThread[toolIdx], content: result };
      }
      thread = updatedThread;
      setThread(thread);
      messagesRef.current = thread;
    }

    // Append a new assistant placeholder for the next iteration
    thread = [...thread, { role: 'assistant', content: '', timestamp: assistantTimestamp }];
    setThread(thread);
    messagesRef.current = thread;
  }

  return finalContent;
}
