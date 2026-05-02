'use client';

// Brush layer grid for group mode - displays 10 brush layer thumbnails
interface BrushLayerGridProps {
  brushUpdateTrigger: number;
  draggedBrushId: string | null;
  onLayerClick: (index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  getLevelGray: (level: number) => string;
}

export function BrushLayerGrid({
  brushUpdateTrigger,
  draggedBrushId,
  onLayerClick,
  onDragOver,
  onDrop,
  getLevelGray,
}: BrushLayerGridProps) {
  return (
    <div className="text-center">
      <div className="text-zinc-500 text-sm mb-4">点击笔触缩略图进行编辑</div>
      {/* Large Preview of all brush layers with gray reference bars */}
      <div className="inline-flex gap-3 p-6 bg-zinc-800 rounded-lg">
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={`brush-display-${index}-${brushUpdateTrigger}`}
            className={`flex flex-col items-center cursor-pointer ${draggedBrushId ? 'drop-target' : ''}`}
            onClick={() => onLayerClick(index)}
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, index)}
          >
            {/* Gray reference bar - same width as thumbnail, 20px height, no number */}
            <div
              className="w-16 rounded mb-1"
              style={{ backgroundColor: getLevelGray(index), height: '20px' }}
            />
            {/* Display canvas copy */}
            <canvas
              id={`brush-display-canvas-${index}`}
              className={`w-16 h-16 border-2 rounded transition-colors ${
                draggedBrushId
                  ? 'border-dashed border-blue-400 bg-blue-900/30 hover:border-blue-300'
                  : 'border-zinc-600 hover:border-blue-500'
              }`}
              width={100}
              height={100}
              style={{ backgroundColor: 'transparent' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}