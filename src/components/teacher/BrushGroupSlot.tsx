'use client';

import { BrushPreset } from './types';
import { getLevelGray } from './gridUtils';

interface BrushGroupSlotProps {
  slotIndex: number;
  brushPreset: BrushPreset | null;
  onSlotClick: (index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  draggedBrushId: string | null;
}

export function BrushGroupSlot({
  slotIndex,
  brushPreset,
  onSlotClick,
  onDragOver,
  onDrop,
  draggedBrushId,
}: BrushGroupSlotProps) {
  const levelGray = getLevelGray(slotIndex);
  const layerData = brushPreset?.layers[0] || null;

  return (
    <div
      className="flex flex-col items-center cursor-pointer"
      onClick={() => onSlotClick(slotIndex)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, slotIndex)}
    >
      {/* Gray reference bar */}
      <div
        className="w-[77px] rounded mb-1"
        style={{ backgroundColor: levelGray, height: '24px' }}
      />
      {/* Canvas thumbnail */}
      <div
        className={`w-[77px] h-[77px] border-2 rounded transition-colors ${
          draggedBrushId
            ? 'border-dashed border-blue-400 bg-blue-900/30 hover:border-blue-300'
            : 'border-zinc-600 hover:border-blue-500'
        }`}
        style={{ backgroundColor: 'transparent' }}
      >
        {layerData ? (
          <img
            src={layerData}
            alt={`Slot ${slotIndex}`}
            className="w-full h-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-500">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}