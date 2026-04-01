import { ReactNode, useState, useRef, useEffect } from 'react';
import { X, LayoutGrid } from 'lucide-react';

interface BufferProps {
  id: string;
  title: string;
  children: ReactNode;
  onClose: (id: string) => void;
  onTile: (id: string) => void;
  initialPosition: { x: number; y: number };
  zIndex: number;
  maxHeight?: string;
}

export default function Buffer({ id, title, children, onClose, onTile, initialPosition, zIndex, maxHeight }: BufferProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const el = elRef.current;
      const w = el?.offsetWidth ?? 400;
      const h = el?.offsetHeight ?? 200;
      const maxX = window.innerWidth - w;
      const maxY = window.innerHeight - h;
      setPosition({
        x: Math.max(0, Math.min(maxX, e.clientX - offsetRef.current.x)),
        y: Math.max(0, Math.min(maxY, e.clientY - offsetRef.current.y)),
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    offsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  return (
    <div
      ref={elRef}
      className={`absolute border border-razzmatazz bg-background flex flex-col !rounded-none transition-shadow duration-200 ${isDragging ? 'shadow-[24px_24px_0_0_rgba(0,0,0,0.7)]' : 'shadow-[16px_16px_0_0_rgba(0,0,0,0.8)]'
        }`}
      style={{
        width: '400px',
        maxHeight: maxHeight ?? undefined,
        top: position.y,
        left: position.x,
        zIndex
      }}
    >
      {/* Title Bar - Draggable Area */}
      <div
        className="bg-razzmatazz text-white flex justify-between items-center px-2 py-1 select-none !rounded-none cursor-move"
        onMouseDown={handleMouseDown}
      >
        <span className="font-bold text-sm tracking-wider uppercase">{title}</span>
        <div className="flex gap-2 items-center">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onTile(id)}
            className="hover:text-background transition-colors cursor-pointer"
            title="Tile window"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onClose(id)}
            className="hover:text-background transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Buffer Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
