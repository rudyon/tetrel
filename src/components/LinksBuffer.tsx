import { memo } from 'react';
import { Unlink, Link } from 'lucide-react';

interface LinksBufferProps {
  links: Map<string, string>; // target -> source
  onUnlink: (targetId: string) => void;
}

function LinksBuffer({ links, onUnlink }: LinksBufferProps) {
  const entries = Array.from(links.entries());

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-cyan-700 text-sm uppercase tracking-widest">
        <Link size={20} />
        <span>No active links</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 border-b border-cyan-400/50 px-3 py-2 items-center bg-cyan-900/10">
        <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest text-right">Source</span>
        <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest text-center">Direction</span>
        <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest">Target</span>
        <span className="text-cyan-400 text-xs font-bold uppercase tracking-widest text-center">Action</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {entries.map(([target, source]) => (
          <div
            key={target}
            className="grid grid-cols-[1fr_auto_1fr_auto] gap-4 border-b border-white/5 px-3 py-2 hover:bg-cyan-400/5 transition-colors items-center"
          >
            <span className="text-white text-sm font-bold uppercase text-right">{source}</span>
            <div className="flex items-center justify-center text-cyan-600">
              <Link size={14} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-cyan-400 inline-block animate-pulse flex-shrink-0" />
              <span className="text-white text-sm font-bold uppercase">{target}</span>
            </div>
            <button
              onClick={() => onUnlink(target)}
              className="text-red-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center p-1"
              title="Unlink"
            >
              <Unlink size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="px-3 pt-2 pb-1 text-cyan-600/60 text-xs uppercase border-t border-cyan-400/20">
        {entries.length} active link{entries.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

export default memo(LinksBuffer);
