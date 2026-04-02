import { type ReactNode, useState, useRef, useEffect, useCallback, memo } from 'react';
import { X, LayoutGrid } from 'lucide-react';

interface BufferProps {
  id: string;
  title: string;
  children: ReactNode;
  onClose: (id: string) => void;
  onTile: (id: string) => void;
  initialPosition: { x: number; y: number };
  zIndex: number;
  /** Optional initial dimensions. Defaults to 400×480. */
  initialSize?: { w: number; h: number };
  /** Hard minimum height enforced during resize (px). */
  minHeight?: number;
  /** If true, wraps content in a padded scrollable div (for non-agent buffers). */
  padded?: boolean;
}

type ResizeDir = 'e' | 's' | 'se';

const MIN_W = 280;
const MIN_H = 160;

function Buffer({
  id, title, children, onClose, onTile, initialPosition, zIndex,
  initialSize = { w: 400, h: 480 },
  minHeight,
  padded = false,
}: BufferProps) {
  const [pos, setPos] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeDir, setResizeDir] = useState<ResizeDir | null>(null);

  const elRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ mx: 0, my: 0, w: 0, h: 0, x: 0, y: 0 });

  const effectiveMinH = minHeight ?? MIN_H;

  // ── Drag ─────────────────────────────────────────────────────────────────────

  const onDragMouseMove = useCallback((e: MouseEvent) => {
    const el = elRef.current;
    const w = el?.offsetWidth ?? size.w;
    const h = el?.offsetHeight ?? size.h;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - w, e.clientX - dragOffsetRef.current.x)),
      y: Math.max(0, Math.min(window.innerHeight - h, e.clientY - dragOffsetRef.current.y)),
    });
  }, [size.w, size.h]);

  const onDragMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (!isDragging) return;
    window.addEventListener('mousemove', onDragMouseMove);
    window.addEventListener('mouseup', onDragMouseUp);
    return () => {
      window.removeEventListener('mousemove', onDragMouseMove);
      window.removeEventListener('mouseup', onDragMouseUp);
    };
  }, [isDragging, onDragMouseMove, onDragMouseUp]);

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragOffsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
  };

  // ── Resize ────────────────────────────────────────────────────────────────────

  const onResizeMouseMove = useCallback((e: MouseEvent) => {
    if (!resizeDir) return;
    const { mx, my, w, h } = resizeStartRef.current;
    const dx = e.clientX - mx;
    const dy = e.clientY - my;
    setSize(prev => ({
      w: resizeDir === 's' ? prev.w : Math.max(MIN_W, w + dx),
      h: resizeDir === 'e' ? prev.h : Math.max(effectiveMinH, h + dy),
    }));
  }, [resizeDir, effectiveMinH]);

  const onResizeMouseUp = useCallback(() => setResizeDir(null), []);

  useEffect(() => {
    if (!resizeDir) return;
    window.addEventListener('mousemove', onResizeMouseMove);
    window.addEventListener('mouseup', onResizeMouseUp);
    return () => {
      window.removeEventListener('mousemove', onResizeMouseMove);
      window.removeEventListener('mouseup', onResizeMouseUp);
    };
  }, [resizeDir, onResizeMouseMove, onResizeMouseUp]);

  const startResize = (dir: ResizeDir) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeDir(dir);
    resizeStartRef.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h, x: pos.x, y: pos.y };
  };

  const isActive = isDragging || !!resizeDir;

  // Cursor override while any interaction is live
  useEffect(() => {
    if (isDragging) document.body.style.cursor = 'move';
    else if (resizeDir === 'e') document.body.style.cursor = 'ew-resize';
    else if (resizeDir === 's') document.body.style.cursor = 'ns-resize';
    else if (resizeDir === 'se') document.body.style.cursor = 'nwse-resize';
    else document.body.style.cursor = '';
    return () => { document.body.style.cursor = ''; };
  }, [isDragging, resizeDir]);

  return (
    <div
      ref={elRef}
      className={`absolute border border-razzmatazz bg-background flex flex-col !rounded-none transition-shadow duration-200 overflow-hidden ${
        isActive ? 'shadow-[24px_24px_0_0_rgba(0,0,0,0.7)] select-none' : 'shadow-[16px_16px_0_0_rgba(0,0,0,0.8)]'
      }`}
      style={{ width: size.w, height: size.h, top: pos.y, left: pos.x, zIndex }}
    >
      {/* Title Bar */}
      <div
        className="bg-razzmatazz text-white flex justify-between items-center px-2 py-1 select-none !rounded-none cursor-move flex-shrink-0"
        onMouseDown={handleTitleMouseDown}
      >
        <span className="font-bold text-sm tracking-wider uppercase truncate">{title}</span>
        <div className="flex gap-2 items-center flex-shrink-0">
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onTile(id)}
            className="hover:text-background transition-colors cursor-pointer"
            title="Tile window"
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onClose(id)}
            className="hover:text-background transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Buffer Content — fills remaining space, scrolls internally */}
      <div className="flex-1 overflow-hidden min-h-0">
        {padded ? (
          <div className="h-full overflow-y-auto p-4">{children}</div>
        ) : children}
      </div>

      {/* ── Resize handles ──────────────────────────────────────────────────── */}

      {/* Right edge */}
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-ew-resize hover:bg-razzmatazz/30 transition-colors"
        onMouseDown={startResize('e')}
      />
      {/* Bottom edge */}
      <div
        className="absolute bottom-0 left-0 h-1.5 w-full cursor-ns-resize hover:bg-razzmatazz/30 transition-colors"
        onMouseDown={startResize('s')}
      />
      {/* Bottom-right corner */}
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-10"
        onMouseDown={startResize('se')}
        title="Drag to resize"
      >
        {/* Visual corner pip */}
        <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-0.5 right-0.5 opacity-40">
          <line x1="10" y1="2" x2="2" y2="10" stroke="#E3256B" strokeWidth="1" />
          <line x1="10" y1="6" x2="6" y2="10" stroke="#E3256B" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

export default memo(Buffer);
