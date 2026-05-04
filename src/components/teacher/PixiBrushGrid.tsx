'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Application, Container, Sprite, Graphics, Text, TextStyle, Texture, Assets } from 'pixi.js';
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

interface BrushSpriteData {
  container: Container;
  sprite: Sprite;
  border: Graphics;
  label: Text;
  preset: BrushWithMetrics;
  targetScale: number;
  currentScale: number;
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

  const minColumns = Math.max(1, Math.floor((containerWidth + GRID_SPACING) / (GRID_MAX_BRUSH_SIZE + GRID_SPACING)));
  const maxColumns = Math.min(itemCount, Math.floor((containerWidth + GRID_SPACING) / (GRID_MIN_BRUSH_SIZE + GRID_SPACING)));

  let bestColumns = maxColumns;
  let bestBrushSize = GRID_MIN_BRUSH_SIZE;

  for (let cols = maxColumns; cols >= minColumns; cols--) {
    const availableWidth = containerWidth - (cols - 1) * GRID_SPACING;
    const brushSize = Math.floor(availableWidth / cols);
    const rows = Math.ceil(itemCount / cols);
    const totalHeight = rows * brushSize + (rows - 1) * GRID_SPACING;

    if (totalHeight <= containerHeight && brushSize >= GRID_MIN_BRUSH_SIZE) {
      bestColumns = cols;
      bestBrushSize = Math.min(brushSize, GRID_MAX_BRUSH_SIZE);
      break;
    }

    if (cols === maxColumns) {
      bestBrushSize = Math.min(brushSize, GRID_MAX_BRUSH_SIZE);
    }
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
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const brushSpritesRef = useRef<BrushSpriteData[]>([]);
  const hoveredSpriteRef = useRef<BrushSpriteData | null>(null);
  const textureCacheRef = useRef<Map<string, Texture>>(new Map());
  const isActiveRef = useRef(true);
  const [presetsWithMetrics, setPresetsWithMetrics] = useState<BrushWithMetrics[]>([]);
  const [isReady, setIsReady] = useState(false);

  // Calculate metrics for all presets
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

  const sortedPresets = sortPresets(presetsWithMetrics, sortRule);
  const { columns, brushSize } = calculateGridDimensions(containerWidth, containerHeight, sortedPresets.length);

  // Initialize PixiJS Application
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    const initApp = async () => {
      const app = new Application();

      await app.init({
        width: containerWidth,
        height: containerHeight,
        backgroundColor: 0x000000,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      containerRef.current!.appendChild(app.canvas as HTMLCanvasElement);
      appRef.current = app;
      setIsReady(true);
    };

    initApp();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
      textureCacheRef.current.clear();
    };
  }, [containerWidth, containerHeight]);

  // Create or update brush sprites
  useEffect(() => {
    if (!appRef.current || !isReady) return;

    const app = appRef.current;
    let isEffectActive = true;

    // Clear existing sprites
    brushSpritesRef.current.forEach((brushData) => {
      brushData.container.destroy({ children: true });
    });
    brushSpritesRef.current = [];

    if (sortedPresets.length === 0) {
      return;
    }

    const gridContainer = new Container();
    if (!isEffectActive) {
      gridContainer.destroy({ children: true });
      return;
    }
    app.stage.addChild(gridContainer);

    const loadTexture = async (preset: BrushWithMetrics): Promise<Texture | null> => {
      const layerData = preset.layers[0];
      if (!layerData) return null;

      // Check cache first
      if (textureCacheRef.current.has(layerData)) {
        return textureCacheRef.current.get(layerData)!;
      }

      try {
        const texture = await Assets.load(layerData);
        textureCacheRef.current.set(layerData, texture);
        return texture;
      } catch {
        return null;
      }
    };

    const createBrushSprite = async (preset: BrushWithMetrics, index: number) => {
      if (!isEffectActive) return;

      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = col * (brushSize + GRID_SPACING) + brushSize / 2;
      const y = row * (brushSize + GRID_SPACING) + brushSize / 2;

      const container = new Container();
      container.x = x;
      container.y = y;
      container.eventMode = 'static';
      container.cursor = 'grab';

      // Border
      const border = new Graphics();
      border.rect(-brushSize / 2, -brushSize / 2, brushSize, brushSize);
      border.stroke({ width: 2, color: 0x52525b });
      container.addChild(border);

      // Sprite
      const texture = await loadTexture(preset);
      if (!isEffectActive) return;
      let sprite: Sprite | null = null;

      if (texture) {
        sprite = new Sprite(texture);
        const scale = Math.min(brushSize / texture.width, brushSize / texture.height);
        sprite.scale.set(scale);
        container.addChild(sprite);
      } else {
        const placeholder = new Graphics();
        placeholder.rect(-brushSize / 2, -brushSize / 2, brushSize, brushSize);
        placeholder.fill({ color: 0x27272a });
        container.addChild(placeholder);
      }

      // Label
      const labelStyle = new TextStyle({
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: Math.max(10, Math.floor(brushSize / 8)),
        fill: 0xffffff,
        wordWrap: true,
        wordWrapWidth: brushSize - 4,
        align: 'center',
      });
      const label = new Text({
        text: preset.name,
        style: labelStyle,
      });
      label.anchor.set(0.5, 1);
      label.x = 0;
      label.y = brushSize / 2 - 2;
      container.addChild(label);

      // Data binding
      const brushData: BrushSpriteData = {
        container,
        sprite: sprite!,
        border,
        label,
        preset,
        targetScale: 1,
        currentScale: 1,
      };

      // Hover events
      container.on('pointerover', () => {
        if (!isEffectActive) return;
        hoveredSpriteRef.current = brushData;
        brushData.targetScale = 1.15;
      });

      container.on('pointerout', () => {
        if (!isEffectActive) return;
        if (hoveredSpriteRef.current === brushData) {
          hoveredSpriteRef.current = null;
        }
        brushData.targetScale = 1;
      });

      // Drag events - use native DOM event from view
      container.on('pointerdown', (e) => {
        const nativeEvent = (e as unknown as { event: DragEvent }).event;
        if (nativeEvent?.dataTransfer) {
          nativeEvent.dataTransfer.effectAllowed = 'copy';
          nativeEvent.dataTransfer.setData('text/plain', preset.id);
          onPresetDragStart(nativeEvent as unknown as React.DragEvent, preset.id);
        }
      });

      container.on('pointerup', () => {
        onPresetDragEnd();
      });

      gridContainer.addChild(container);
      brushSpritesRef.current.push(brushData);
    };

    // Create all sprites
    sortedPresets.forEach((preset, index) => {
      createBrushSprite(preset, index);
    });

    // Animation ticker
    const ticker = app.ticker;
    const animate = () => {
      if (!isEffectActive) return;
      brushSpritesRef.current.forEach((brushData) => {
        if (brushData.currentScale !== brushData.targetScale) {
          const diff = brushData.targetScale - brushData.currentScale;
          const step = diff * 0.15;
          brushData.currentScale += step;

          if (Math.abs(diff) < 0.01) {
            brushData.currentScale = brushData.targetScale;
          }

          brushData.container.scale.set(brushData.currentScale);
        }
      });
    };

    // Only add ticker if app is still valid
    if (!appRef.current) {
      gridContainer.destroy({ children: true });
      return;
    }

    ticker.add(animate);

    return () => {
      isEffectActive = false;
      if (!appRef.current) return;
      try {
        ticker.remove(animate);
      } catch {
        // Ticker may already be destroyed
      }
      try {
        gridContainer.destroy({ children: true });
      } catch {
        // Container may already be destroyed
      }
    };
  }, [isReady, sortedPresets, columns, brushSize, onPresetDragStart, onPresetDragEnd]);

  // Draw dashed rectangle for dragged brush border
  const drawDashedRect = (g: Graphics, x: number, y: number, w: number, h: number, color: number) => {
    const dashSize = 4;
    const gapSize = 4;
    const half = w / 2;
    g.moveTo(-half, -half);
    g.lineTo(half, -half);
    g.moveTo(half, -half);
    g.lineTo(half, half);
    g.moveTo(half, half);
    g.lineTo(-half, half);
    g.moveTo(-half, half);
    g.lineTo(-half, -half);
    g.stroke({ width: 2, color });
  };

  // Update borders when dragging changes
  useEffect(() => {
    if (!isReady) return;

    brushSpritesRef.current.forEach((brushData) => {
      const isDragged = draggedBrushId === brushData.preset.id;
      brushData.border.clear();
      brushData.border.rect(-brushSize / 2, -brushSize / 2, brushSize, brushSize);
      if (isDragged) {
        // Draw dashed border for dragged state
        const g = new Graphics();
        const half = brushSize / 2;
        const dashSize = 4;
        const gapSize = 4;

        // Top edge
        let x = -half;
        let drawing = true;
        while (x < half) {
          if (drawing) {
            brushData.border.moveTo(x, -half);
            brushData.border.lineTo(Math.min(x + dashSize, half), -half);
          }
          x += drawing ? dashSize : gapSize;
          drawing = !drawing;
        }
        // Right edge
        let y = -half;
        drawing = true;
        while (y < half) {
          if (drawing) {
            brushData.border.moveTo(half, y);
            brushData.border.lineTo(half, Math.min(y + dashSize, half));
          }
          y += drawing ? dashSize : gapSize;
          drawing = !drawing;
        }
        // Bottom edge
        x = half;
        drawing = true;
        while (x > -half) {
          if (drawing) {
            brushData.border.moveTo(x, half);
            brushData.border.lineTo(Math.max(x - dashSize, -half), half);
          }
          x -= drawing ? dashSize : gapSize;
          drawing = !drawing;
        }
        // Left edge
        y = half;
        drawing = true;
        while (y > -half) {
          if (drawing) {
            brushData.border.moveTo(-half, y);
            brushData.border.lineTo(-half, Math.max(y - dashSize, -half));
          }
          y -= drawing ? dashSize : gapSize;
          drawing = !drawing;
        }
        brushData.border.stroke({ width: 2, color: 0x3b82f6 });
      } else if (hoveredSpriteRef.current === brushData) {
        brushData.border.stroke({ width: 2, color: 0x3b82f6 });
      } else {
        brushData.border.stroke({ width: 2, color: 0x52525b });
      }
    });
  }, [draggedBrushId, isReady, brushSize]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    onSlotDrop(e, -1);
  }, [onSlotDrop]);

  if (presets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
        暂无笔刷，请先在单个笔刷模式中创建
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-auto"
      style={{ width: containerWidth, height: containerHeight }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
}
