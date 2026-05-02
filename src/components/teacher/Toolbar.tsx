'use client';

// Toolbar component for single brush editor (Photoshop style)
type BrushMode = 'draw' | 'erase';

const COLORS = ['#2c2c2c', '#744242', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#808080', '#c0c0c0'];

interface ToolbarProps {
  brushMode: BrushMode;
  brushSize: number;
  brushOpacity: number;
  brushColor: string;
  onBrushModeChange: (mode: BrushMode) => void;
  onBrushSizeChange: (size: number) => void;
  onBrushOpacityChange: (opacity: number) => void;
  onBrushColorChange: (color: string) => void;
  colorInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function Toolbar({
  brushMode,
  brushSize,
  brushOpacity,
  brushColor,
  onBrushModeChange,
  onBrushSizeChange,
  onBrushOpacityChange,
  onBrushColorChange,
  colorInputRef,
}: ToolbarProps) {
  return (
    <div className="ml-[10px] flex flex-col items-center gap-1 py-0">
      {/* Brush/Eraser toggles */}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => onBrushModeChange('draw')}
          className={`px-1 py-1 rounded text-xs ${brushMode === 'draw' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
        >
          画笔
        </button>
        <button
          onClick={() => onBrushModeChange('erase')}
          className={`px-1 py-1 rounded text-xs ${brushMode === 'erase' ? 'bg-red-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
        >
          橡皮
        </button>
      </div>

      {/* Size slider - vertical slide (up/down) */}
      <div className="flex flex-col items-center gap-6 py-8">
        <input
          type="range"
          min="2"
          max="40"
          value={brushSize}
          onChange={(e) => onBrushSizeChange(Number(e.target.value))}
          className="w-15 h-4 bg-zinc-700 rounded appearance-none cursor-pointer -rotate-90"
        />
        <span className="text-xs text-zinc-400">{brushSize}px</span>
      </div>

      {/* Opacity slider - vertical slide (up/down) */}
      <div className="flex flex-col items-center gap-6">
        <input
          type="range"
          min="10"
          max="100"
          value={brushOpacity}
          onChange={(e) => onBrushOpacityChange(Number(e.target.value))}
          className="w-15 h-4 bg-zinc-700 rounded appearance-none cursor-pointer -rotate-90"
        />
        <span className="text-xs text-zinc-400">{brushOpacity}%</span>
      </div>

      {/* Color palette - vertical arrangement */}
      <div className="flex flex-col items-center gap-2 py-4">
        <input
          ref={colorInputRef}
          type="color"
          value={brushColor}
          onChange={(e) => onBrushColorChange(e.target.value)}
          className="w-10 h-10 border border-zinc-500 cursor-pointer"
          title="选择颜色"
        />
        <div className="grid grid-cols-2 gap-1">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onBrushColorChange(color)}
              className={`w-5 h-5 rounded border-2 ${brushColor === color ? 'border-white' : 'border-transparent'} hover:scale-110 transition-transform`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}