import { Bot } from 'lucide-react';

interface Agent {
  identifier: string;
  model: string;
}

interface AgentsBufferProps {
  agents: Agent[];
}

export default function AgentsBuffer({ agents }: AgentsBufferProps) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-600 text-sm uppercase tracking-widest">
        <Bot size={20} />
        <span>No agents running</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Table header */}
      <div className="grid grid-cols-2 border-b border-razzmatazz/50 px-3 py-1">
        <span className="text-razzmatazz text-xs font-bold uppercase tracking-widest">Identifier</span>
        <span className="text-razzmatazz text-xs font-bold uppercase tracking-widest">Model</span>
      </div>

      {/* Rows */}
      {agents.map((agent) => (
        <div
          key={agent.identifier}
          className="grid grid-cols-2 border-b border-white/5 px-3 py-2 hover:bg-razzmatazz/5 transition-colors"
        >
          <div className="flex items-center gap-2">
            {/* Live indicator */}
            <span className="w-1.5 h-1.5 bg-green-400 inline-block animate-pulse flex-shrink-0" />
            <span className="text-white text-sm font-bold uppercase">{agent.identifier}</span>
          </div>
          <span className="text-gray-400 text-sm uppercase">{agent.model}</span>
        </div>
      ))}

      <div className="px-3 pt-2 pb-1 text-gray-600 text-xs uppercase">
        {agents.length} agent{agents.length !== 1 ? 's' : ''} running
      </div>
    </div>
  );
}
