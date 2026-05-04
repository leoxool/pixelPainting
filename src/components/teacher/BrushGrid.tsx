'use client';

import { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import { BrushPreset, SortRule } from './types';
import { GRID_MIN_BRUSH_SIZE, GRID_MAX_BRUSH_SIZE, GRID_SPACING } from './constants';

interface BrushGridProps {
  presets: BrushPreset[];
  sortRule: SortRule;
  containerWidth: number;
  containerHeight: number;
  onPresetDragStart: (e: React.DragEvent, presetId: string) => void;
  onPresetDragEnd: () => void;
  onSlotDrop: (e: React.DragEvent, slotIndex: number) => void;
  draggedBrushId: string | null;
}

interface BrushMetrics {
  brightness: number;
  saturation: number;
  hue: number;
}

interface BrushWithMetrics extends BrushPreset {
  metrics?: BrushMetrics;
}

function calculateBrushMetrics(preset: BrushPreset): Promise<BrushMetrics> {
  const layerData = preset.layers[0];
  if (!layerData) {
    return Promise.resolve({ brightness: 128, saturation: 0, hue: 0 });
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 50;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ brightness: 128, saturation: 0, hue: 0 });
        return;
      }
      ctx.drawImage(img, 0, 0, 50, 50);
      const imageData = ctx.getImageData(0, 0, 50, 50);
      const data = imageData.data;

      let totalBrightness = 0;
      let totalSaturation = 0;
      let totalHue = 0;
      let pixelCount = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        totalBrightness += brightness;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let saturation = 0;
        let hue = 0;
        if (delta > 0) {
          saturation = delta / max;
          if (max === r) {
            hue = ((g - b) / delta) % 6;
          } else if (max === g) {
            hue = (b - r) / delta + 2;
          } else {
            hue = (r - g) / delta + 4;
          }
          hue *= 60;
          if (hue < 0) hue += 360;
        }

        totalSaturation += saturation;
        totalHue += hue;
        pixelCount++;
      }

      resolve({
        brightness: pixelCount > 0 ? totalBrightness / pixelCount : 128,
        saturation: pixelCount > 0 ? totalSaturation / pixelCount : 0,
        hue: pixelCount > 0 ? totalHue / pixelCount : 0,
      });
    };
    img.onerror = () => {
      resolve({ brightness: 128, saturation: 0, hue: 0 });
    };
    img.src = layerData;
  });
}

function sortPresets(presets: BrushWithMetrics[], rule: SortRule): BrushWithMetrics[] {
  const sorted = [...presets];

  switch (rule) {
    case 'time':
      sorted.sort((a, b) => b.timestamp - a.timestamp);
      break;
    case 'brightness':
      sorted.sort((a, b) => (b.metrics?.brightness ?? 128) - (a.metrics?.brightness ?? 128));
      break;
    case 'saturation':
      sorted.sort((a, b) => (b.metrics?.saturation ?? 0) - (a.metrics?.saturation ?? 0));
      break;
    case 'hue':
      sorted.sort((a, b) => (b.metrics?.hue ?? 0) - (a.metrics?.hue ?? 0));
      break;
  }

  return sorted;
}

function calculateGridDimensions(
  containerWidth: number,
  containerHeight: number,
  itemCount: number
): { columns: number; rows: number; brushSize: number } {
  if (itemCount === 0) {
    return { columns: 1, rows: 0, brushSize: GRID_MIN_BRUSH_SIZE };
  }

  // Maximum columns that fit within container width at minimum brush size
  const maxColumnsBasedOnWidth = Math.floor((containerWidth + GRID_SPACING) / (GRID_MIN_BRUSH_SIZE + GRID_SPACING));
  const maxColumns = Math.min(itemCount, Math.max(1, maxColumnsBasedOnWidth));

  // Try to find columns that fit within container height
  let bestColumns = maxColumns;
  let bestBrushSize = GRID_MIN_BRUSH_SIZE;
  let foundFit = false;

  // Start from most columns (smallest brushes) and work up
  for (let cols = maxColumns; cols >= 1; cols--) {
    const availableWidth = containerWidth - (cols - 1) * GRID_SPACING;
    const brushSize = Math.floor(availableWidth / cols);
    const rows = Math.ceil(itemCount / cols);
    const totalHeight = rows * brushSize + (rows - 1) * GRID_SPACING;

    // Check if this fits within container height
    if (totalHeight <= containerHeight && brushSize >= GRID_MIN_BRUSH_SIZE) {
      bestColumns = cols;
      bestBrushSize = Math.min(brushSize, GRID_MAX_BRUSH_SIZE);
      foundFit = true;
      break;
    }
  }

  // If no fit found, use maximum columns and allow overflow
  if (!foundFit) {
    bestColumns = maxColumns;
    const availableWidth = containerWidth - (bestColumns - 1) * GRID_SPACING;
    bestBrushSize = Math.floor(availableWidth / bestColumns);
    // Ensure at least minimum size
    bestBrushSize = Math.max(bestBrushSize, GRID_MIN_BRUSH_SIZE);
  }

  const rows = Math.ceil(itemCount / bestColumns);
  return { columns: bestColumns, rows, brushSize: bestBrushSize };
}

export function BrushGrid({
  presets,
  sortRule,
  containerWidth,
  containerHeight,
  onPresetDragStart,
  onPresetDragEnd,
  onSlotDrop,
  draggedBrushId,
}: BrushGridProps) {
  const [presetsWithMetrics, setPresetsWithMetrics] = useState<BrushWithMetrics[]>([]);

  useEffect(() => {
    const calculateAll = async () => {
      const results = await Promise.all(
        presets.map(async (preset) => {
          const metrics = await calculateBrushMetrics(preset);
          return { ...preset, metrics };
        })
      );
      setPresetsWithMetrics(results);
    };
    calculateAll();
  }, [presets]);

  const sortedPresets = useMemo(
    () => sortPresets(presetsWithMetrics, sortRule),
    [presetsWithMetrics, sortRule]
  );

  const { columns, brushSize } = useMemo(
    () => calculateGridDimensions(containerWidth, containerHeight, sortedPresets.length),
    [containerWidth, containerHeight, sortedPresets.length]
  );

  const handleDragStart = useCallback((e: React.DragEvent, presetId: string) => {
    onPresetDragStart(e, presetId);
  }, [onPresetDragStart]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  if (presets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        暂无笔刷，请先在单个笔刷模式中创建
      </div>
    );
  }

  return (
    <div
      className="overflow-auto p-4"
      style={{ width: containerWidth, height: containerHeight }}
      onDragOver={handleDragOver}
      onDrop={(e) => onSlotDrop(e, -1)}
    >
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns}, ${brushSize}px)`,
        }}
      >
        {sortedPresets.map((preset) => (
          <div
            key={preset.id}
            className={`relative rounded border-2 cursor-grab active:cursor-grabbing border-zinc-600`}
            style={{ width: brushSize, height: brushSize }}
            draggable
            onDragStart={(e) => handleDragStart(e, preset.id)}
            onDragEnd={onPresetDragEnd}
          >
            {preset.layers[0] ? (
              <img
                src={preset.layers[0]}
                alt={preset.name}
                className="w-full h-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-zinc-700" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
