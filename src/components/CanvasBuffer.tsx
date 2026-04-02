import { useState } from 'react';
import { Code2, Eye } from 'lucide-react';

interface CanvasBufferProps {
  id: string;
  content: string;
  mimeType: string;
  updatedAt: number;
}

export default function CanvasBuffer({ id, content, mimeType, updatedAt }: CanvasBufferProps) {
  const isHtml = mimeType.toLowerCase().includes('html');
  const hasContent = content.trim().length > 0;
  const [activeTab, setActiveTab] = useState<'preview' | 'source'>('preview');

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-1 border-b border-razzmatazz/30 text-razzmatazz/70 text-xs uppercase tracking-widest flex items-center justify-between">
        <span>{id}</span>
        <span>{new Date(updatedAt).toLocaleTimeString('en-US', { hour12: false })}</span>
      </div>

      {!hasContent ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm uppercase tracking-widest">
          Canvas is empty
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="border-b border-razzmatazz/20 px-2 py-1 flex items-center gap-2">
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-2 py-1 text-[10px] uppercase tracking-widest border cursor-pointer flex items-center gap-1 ${
                activeTab === 'preview'
                  ? 'border-razzmatazz/60 bg-razzmatazz/15 text-razzmatazz'
                  : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-razzmatazz/30'
              }`}
            >
              <Eye size={10} />
              Preview
            </button>
            <button
              onClick={() => setActiveTab('source')}
              className={`px-2 py-1 text-[10px] uppercase tracking-widest border cursor-pointer flex items-center gap-1 ${
                activeTab === 'source'
                  ? 'border-razzmatazz/60 bg-razzmatazz/15 text-razzmatazz'
                  : 'border-white/10 text-gray-500 hover:text-gray-300 hover:border-razzmatazz/30'
              }`}
            >
              <Code2 size={10} />
              Source
            </button>
          </div>

          {activeTab === 'preview' ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-3 py-1 text-xs text-razzmatazz/70 border-b border-razzmatazz/20 uppercase tracking-widest flex items-center gap-1">
                <Eye size={11} />
                Preview
              </div>
              {isHtml ? (
                <iframe
                  title={`canvas-preview-${id}`}
                  className="w-full h-full bg-white"
                  sandbox="allow-scripts"
                  srcDoc={content}
                />
              ) : (
                <pre className="flex-1 overflow-auto p-3 text-xs text-gray-300 bg-black/30 whitespace-pre-wrap break-words">
                  {content}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-3 py-1 text-xs text-razzmatazz/70 border-b border-razzmatazz/20 uppercase tracking-widest flex items-center gap-1">
                <Code2 size={11} />
                Source
              </div>
              <pre className="flex-1 overflow-auto p-3 text-xs text-gray-300 bg-black/30 whitespace-pre-wrap break-words">
                {content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
