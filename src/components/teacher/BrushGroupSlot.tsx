'use client';

import { BrushPreset } from './types';
import { getLevelGray } from './gridUtils';

interface BrushGroupSlotProps {
  slotIndex: number;
  slotCount: number;
  brushPreset: BrushPreset | null;
  onSlotClick: (index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  draggedBrushId: string | null;
  // 新增：pointer-based 拖动支持
  onPointerDragEnter?: (slotIndex: number) => void;
  onPointerDragLeave?: (slotIndex: number) => void;
  onPointerDrop?: (slotIndex: number) => void;
}

export function BrushGroupSlot({
  slotIndex,
  slotCount,
  brushPreset,
  onSlotClick,
  onDragOver,
  onDrop,
  draggedBrushId,
  onPointerDragEnter,
  onPointerDragLeave,
  onPointerDrop,
}: BrushGroupSlotProps) {
  const levelGray = getLevelGray(slotIndex, slotCount);
  const layerData = brushPreset?.layers[0] || null;

  return (
    <div
      className="flex flex-col items-center cursor-pointer"
      onClick={() => onSlotClick(slotIndex)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, slotIndex)}
      onPointerEnter={() => {
        // 通知父组件有 pointer 拖动进入
        if (draggedBrushId && onPointerDragEnter) {
          onPointerDragEnter(slotIndex);
        }
      }}
      onPointerLeave={() => {
        // 通知父组件有 pointer 拖动离开
        if (draggedBrushId && onPointerDragLeave) {
          onPointerDragLeave(slotIndex);
        }
      }}
      onPointerUp={() => {
        // 通知父组件在 pointer 拖动模式下完成放置
        if (draggedBrushId && onPointerDrop) {
          onPointerDrop(slotIndex);
        }
      }}
    >
      {/* Gray reference bar */}
      <div
        className="w-[77px] rounded mb-1"
        style={{ backgroundColor: levelGray, height: '24px' }}
      />
      {/* Canvas thumbnail */}
      <div
        className={`relative w-[77px] h-[77px] border-2 rounded transition-colors overflow-hidden ${
          draggedBrushId
            ? 'border-dashed border-blue-400 bg-blue-900/30 hover:border-blue-300'
            : 'border-zinc-600 hover:border-blue-500'
        }`}
      >
        {layerData ? (
          <>
            {/* Checkerboard pattern for transparency */}
            <div
              className="absolute inset-0 rounded"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #d4d4d4 25%, transparent 25%),
                  linear-gradient(-45deg, #d4d4d4 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #d4d4d4 75%),
                  linear-gradient(-45deg, transparent 75%, #d4d4d4 75%)
                `,
                backgroundSize: '8px 8px',
                backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                backgroundColor: '#f5f5f5',
              }}
            />
            <img
              src={layerData}
              alt={`Slot ${slotIndex}`}
              className="relative w-full h-full object-contain"
              draggable={false}
            />
          </>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center text-zinc-500">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}