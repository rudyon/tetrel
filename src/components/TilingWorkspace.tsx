import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Move } from 'lucide-react';
import type { BSPNode, BSPPath } from '../utils/bsp';

const HANDLE_SIZE = 5;
const MIN_RATIO = 0.1;
const MAX_RATIO = 0.9;

interface Rect { x: number; y: number; w: number; h: number }

interface LeafBoundsEntry { bufferId: string; bounds: Rect }

interface ResizeDrag {
  path: BSPPath;
  dir: 'h' | 'v';
  startMouse: number;
  startRatio: number;
  nodeSize: number;
}

interface TilingWorkspaceProps {
  tree: BSPNode;
  getTitle: (bufferId: string) => string;
  renderContent: (bufferId: string) => ReactNode;
  onRatioChange: (path: BSPPath, ratio: number) => void;
  onSwap: (sourceId: string, targetId: string) => void;
  onFloat: (bufferId: string) => void;
  onClose: (bufferId: string) => void;
}

export default function TilingWorkspace({
  tree,
  getTitle,
  renderContent,
  onRatioChange,
  onSwap,
  onFloat,
  onClose,
}: TilingWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Resize drag — stored in a ref so mousemove handler always sees current value
  const resizeDragRef = useRef<ResizeDrag | null>(null);
  const [isResizing, setIsResizing] = useState<'h' | 'v' | null>(null);

  // Tile drag-to-swap
  const [tileDragSource, setTileDragSource] = useState<string | null>(null);
  const [tileDragTarget, setTileDragTarget] = useState<string | null>(null);

  // Populated during render so mousemove can do hit-testing
  const leafBoundsRef = useRef<LeafBoundsEntry[]>([]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const getRelPos = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Resize drag
    if (resizeDragRef.current) {
      const { dir, startMouse, startRatio, nodeSize, path } = resizeDragRef.current;
      const pos = dir === 'h' ? e.clientX : e.clientY;
      const delta = pos - startMouse;
      const newRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, startRatio + delta / nodeSize));
      onRatioChange(path, newRatio);
      return;
    }

    // Tile drag — hit-test which leaf is under cursor
    if (tileDragSource) {
      const rel = getRelPos(e.clientX, e.clientY);
      const hit = leafBoundsRef.current.find(
        lb =>
          rel.x >= lb.bounds.x &&
          rel.x <= lb.bounds.x + lb.bounds.w &&
          rel.y >= lb.bounds.y &&
          rel.y <= lb.bounds.y + lb.bounds.h,
      );
      setTileDragTarget(hit && hit.bufferId !== tileDragSource ? hit.bufferId : null);
    }
  };

  const handleMouseUp = () => {
    if (resizeDragRef.current) {
      resizeDragRef.current = null;
      setIsResizing(null);
      return;
    }
    if (tileDragSource && tileDragTarget) {
      onSwap(tileDragSource, tileDragTarget);
    }
    setTileDragSource(null);
    setTileDragTarget(null);
  };

  // Reset leaf bounds before each render pass
  leafBoundsRef.current = [];

  // Accumulate flat element list — avoids fragment key issues
  const elements: ReactNode[] = [];

  const renderNode = (node: BSPNode, bounds: Rect, path: BSPPath) => {
    if (node.type === 'leaf') {
      const { bufferId } = node;
      leafBoundsRef.current.push({ bufferId, bounds });
      const isSrc = tileDragSource === bufferId;
      const isTgt = tileDragTarget === bufferId;

      elements.push(
        <div
          key={`tile-${bufferId}`}
          className={`absolute flex flex-col border border-razzmatazz bg-background !rounded-none transition-opacity duration-100 overflow-hidden ${isSrc ? 'opacity-40' : 'opacity-100'}`}
          style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
        >
          {/* Drag-target highlight overlay */}
          {isTgt && (
            <div className="absolute inset-0 bg-razzmatazz/20 border-2 border-razzmatazz z-10 pointer-events-none" />
          )}

          {/* Title bar */}
          <div
            className="bg-razzmatazz text-white flex justify-between items-center px-2 py-1 select-none !rounded-none flex-shrink-0"
            style={{ cursor: tileDragSource ? (isSrc ? 'grabbing' : 'default') : 'grab' }}
            onMouseDown={e => {
              e.stopPropagation();
              setTileDragSource(bufferId);
            }}
          >
            <span className="font-bold text-sm tracking-wider uppercase truncate pr-2">
              {getTitle(bufferId)}
            </span>
            <div className="flex gap-2 items-center flex-shrink-0">
              {/* Float button */}
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => onFloat(bufferId)}
                className="hover:text-background transition-colors cursor-pointer"
                title="Float window"
              >
                <Move size={13} />
              </button>
              {/* Close button */}
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => onClose(bufferId)}
                className="hover:text-background transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden min-h-0">
            {renderContent(bufferId)}
          </div>
        </div>,
      );
      return;
    }

    // Split node — recurse
    const { dir, ratio, a, b } = node;
    let aBounds: Rect, bBounds: Rect, hBounds: Rect;

    if (dir === 'h') {
      const aW = Math.floor(bounds.w * ratio - HANDLE_SIZE / 2);
      const bX = bounds.x + aW + HANDLE_SIZE;
      const bW = bounds.w - aW - HANDLE_SIZE;
      aBounds = { x: bounds.x, y: bounds.y, w: aW, h: bounds.h };
      bBounds = { x: bX, y: bounds.y, w: bW, h: bounds.h };
      hBounds = { x: bounds.x + aW, y: bounds.y, w: HANDLE_SIZE, h: bounds.h };
    } else {
      const aH = Math.floor(bounds.h * ratio - HANDLE_SIZE / 2);
      const bY = bounds.y + aH + HANDLE_SIZE;
      const bH = bounds.h - aH - HANDLE_SIZE;
      aBounds = { x: bounds.x, y: bounds.y, w: bounds.w, h: aH };
      bBounds = { x: bounds.x, y: bY, w: bounds.w, h: bH };
      hBounds = { x: bounds.x, y: bounds.y + aH, w: bounds.w, h: HANDLE_SIZE };
    }

    // Resize handle
    elements.push(
      <div
        key={`handle-${path.join('.')}`}
        className={`absolute z-20 transition-colors ${dir === 'h' ? 'cursor-col-resize hover:bg-razzmatazz/50' : 'cursor-row-resize hover:bg-razzmatazz/50'} bg-background`}
        style={{ left: hBounds.x, top: hBounds.y, width: hBounds.w, height: hBounds.h }}
        onMouseDown={e => {
          e.stopPropagation();
          resizeDragRef.current = {
            path,
            dir,
            startMouse: dir === 'h' ? e.clientX : e.clientY,
            startRatio: ratio,
            nodeSize: dir === 'h' ? bounds.w : bounds.h,
          };
          setIsResizing(dir);
        }}
      />,
    );

    renderNode(a, aBounds, [...path, 'a']);
    renderNode(b, bBounds, [...path, 'b']);
  };

  const rootBounds: Rect = { x: 0, y: 0, w: containerSize.w, h: containerSize.h };
  if (containerSize.w > 0) {
    renderNode(tree, rootBounds, []);
  }

  const workspaceCursor =
    isResizing === 'h' ? 'col-resize' : isResizing === 'v' ? 'row-resize' : tileDragSource ? 'grabbing' : 'default';

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ cursor: workspaceCursor }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {elements}
    </div>
  );
}
