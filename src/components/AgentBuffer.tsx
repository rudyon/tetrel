import { useState, useRef, useEffect, forwardRef, useImperativeHandle, type KeyboardEvent } from 'react';
import { Send, Bot, User, AlertTriangle, Loader, Link as LinkIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AgentBufferProps {
  model: string;
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
  isLinkedTarget?: boolean;
  onMessageComplete?: (content: string) => void;
}

export interface AgentBufferHandle {
  sendMessage: (msg: string) => Promise<void>;
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const AgentBuffer = forwardRef<AgentBufferHandle, AgentBufferProps>(({ model, messages, onMessagesChange, isLinkedTarget, onMessageComplete }, ref) => {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep a ref to the latest messages for use inside async callbacks
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useImperativeHandle(ref, () => ({
    sendMessage: async (msg: string) => {
      await sendImpl(msg);
    }
  }));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => sendImpl(input);

  const sendImpl = async (textToSubmit: string) => {
    const trimmed = textToSubmit.trim();
    if (!trimmed || streaming) return;

    if (textToSubmit === input) {
      setInput('');
    }

    const apiKey = localStorage.getItem('TETREL_API_KEY_OPENROUTER');
    if (!apiKey) {
      setError('No OpenRouter API key found. Run CONFIG OPENROUTER to set one.');
      return;
    }

    setError(null);
    const userMsg: Message = { role: 'user', content: trimmed, timestamp: Date.now() };
    const nextMessages = [...messagesRef.current, userMsg];
    onMessagesChange(nextMessages);
    setStreaming(true);

    // Seed the assistant reply slot
    const assistantTimestamp = Date.now();
    const withPlaceholder = [...nextMessages, { role: 'assistant' as const, content: '', timestamp: assistantTimestamp }];
    onMessagesChange(withPlaceholder);

    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = '';

    try {
      const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://tetrel.tech',
          'X-Title': 'Tetrel',
        },
        body: JSON.stringify({
          model: model.toLowerCase(),
          stream: true,
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status} ${response.statusText}: ${text}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              // Update the last message (the assistant placeholder) in place
              const current = messagesRef.current;
              const updated = [...current];
              const last = updated[updated.length - 1];
              if (last.role === 'assistant' && last.timestamp === assistantTimestamp) {
                updated[updated.length - 1] = { ...last, content: accumulated };
                onMessagesChange(updated);
              }
            }
          } catch {
            // malformed SSE line, skip
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled — leave whatever was accumulated
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        // Remove the empty assistant placeholder if nothing was streamed
        const current = messagesRef.current;
        const last = current[current.length - 1];
        if (last.role === 'assistant' && last.timestamp === assistantTimestamp && !last.content) {
          onMessagesChange(current.slice(0, -1));
        }
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      if (accumulated && onMessageComplete) {
        onMessageComplete(accumulated);
      }
    }
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Model badge */}
      <div className="px-3 py-1 border-b border-razzmatazz/30 text-razzmatazz/60 text-xs uppercase tracking-widest select-none flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{model}</span>
          {isLinkedTarget && <LinkIcon size={12} className="text-cyan-400" />}
        </div>
        {streaming && (
          <span className="flex items-center gap-1 text-razzmatazz/80">
            <Loader size={10} className="animate-spin" />
            <span>streaming</span>
          </span>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-900/20 border-b border-red-500/30 text-red-400 text-xs">
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 px-3 py-3">
        {messages.map((msg, i) => (
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
                className={`px-3 py-2 text-sm leading-relaxed !rounded-none border ${msg.role === 'assistant'
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
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!isLinkedTarget ? (
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
      ) : (
        <div className="border-t border-cyan-400/30 flex items-center gap-2 px-3 py-2 bg-cyan-900/10">
          <LinkIcon size={14} className="text-cyan-400" />
          <span className="text-cyan-400/80 text-xs uppercase tracking-widest">Linked input Mode</span>
        </div>
      )}
    </div>
  );
});

export default AgentBuffer;
