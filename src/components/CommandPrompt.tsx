import { useRef, useState, useEffect, memo, type KeyboardEvent } from 'react';
import { Terminal } from 'lucide-react';

interface CommandDef {
  name: string;
  args?: string;
  desc: string;
}

const AVAILABLE_COMMANDS: CommandDef[] = [
  { name: 'SPAWN', args: '<IDENTIFIER> <MODEL>', desc: 'Spawn a new agent with a given model' },
  { name: 'AGENT', args: '<IDENTIFIER>', desc: "Open a running agent's buffer" },
  { name: 'CANVAS', args: '<ID>', desc: 'Open or create a canvas buffer' },
  { name: 'AGENTS', desc: 'Open a buffer showing all running agents' },
  { name: 'KILL', args: '<IDENTIFIER>', desc: 'Kill a running agent' },
  { name: 'ULTRAKILL', desc: 'Kill all running agents' },
  { name: 'CONFIG', args: '<PROVIDER>', desc: 'Configure an API provider (e.g. OPENROUTER)' },
  { name: 'CLEAR', desc: 'Close all open buffers and clear workspace' },
  { name: 'HELP', desc: 'Show list of available commands and documentation' },
];

interface CommandPromptProps {
  onExecute: (cmd: string) => void;
}

function CommandPrompt({ onExecute }: CommandPromptProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [command, setCommand] = useState('');
  const [suggestions, setSuggestions] = useState<CommandDef[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keep a stable ref to onExecute so we never need to re-register the keydown listener
  const onExecuteRef = useRef(onExecute);
  useEffect(() => { onExecuteRef.current = onExecute; }, [onExecute]);

  // CTRL+K global focus
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleChange = (val: string) => {
    const upper = val.toUpperCase();
    setCommand(upper);
    const trimmed = upper.trim();
    // Only suggest while the user is typing the command name itself (no spaces / args yet)
    if (trimmed && !trimmed.includes(' ')) {
      setSuggestions(AVAILABLE_COMMANDS.filter(c => c.name.startsWith(trimmed)));
      setSelectedIndex(0);
    } else {
      setSuggestions([]);
      setSelectedIndex(0);
    }
  };

  const submit = (cmd: string) => {
    if (cmd.trim()) onExecuteRef.current(cmd.trim());
    setCommand('');
    setSuggestions([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(p => (p > 0 ? p - 1 : suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(p => (p < suggestions.length - 1 ? p + 1 : 0));
        return;
      }
      // Tab cycles to next suggestion
      if (e.key === 'Tab') {
        e.preventDefault();
        setSelectedIndex(p => (p < suggestions.length - 1 ? p + 1 : 0));
        return;
      }
      // Enter autocompletes the highlighted suggestion without running it
      if (e.key === 'Enter') {
        e.preventDefault();
        setCommand(suggestions[selectedIndex].name + ' ');
        setSuggestions([]);
        return;
      }
    }
    // Enter with no suggestions → execute
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(command);
    }
  };

  return (
    <div className="w-full bg-background border-t border-razzmatazz flex items-center !rounded-none relative z-50">
      {/* Autocomplete dropup */}
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 w-full bg-background border-t border-razzmatazz text-sm font-mono max-h-64 overflow-y-auto">
          {suggestions.map((sugg, i) => {
            const isSelected = i === selectedIndex;
            return (
              <div
                key={sugg.name}
                className={`flex justify-between items-center px-4 py-2 cursor-pointer transition-colors ${
                  isSelected ? 'bg-razzmatazz text-background' : 'hover:bg-razzmatazz/20 text-white'
                }`}
                onClick={() => {
                  setCommand(sugg.name + ' ');
                  setSuggestions([]);
                  inputRef.current?.focus();
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold">{sugg.name}</span>
                  {sugg.args && (
                    <span className={isSelected ? 'text-black/70' : 'text-razzmatazz/70'}>{sugg.args}</span>
                  )}
                </div>
                <span className={isSelected ? 'text-black/80' : 'text-gray-400'}>{sugg.desc}</span>
              </div>
            );
          })}
        </div>
      )}

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
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck="false"
            autoComplete="off"
          />
          <div className="text-gray-600 text-xs ml-4 select-none uppercase">
            ↵ autocomplete · Tab cycle · ↵ run
          </div>
        </div>
      </label>
    </div>
  );
}

// Memo: re-renders only when onExecute identity changes (which is rare after App stabilization)
export default memo(CommandPrompt);
