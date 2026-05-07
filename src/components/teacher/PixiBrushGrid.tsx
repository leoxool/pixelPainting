'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Application, Container, Sprite, Graphics, Texture, Assets, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { BrushPreset, SortRule } from './types';
import { GRID_MIN_BRUSH_SIZE, GRID_MAX_BRUSH_SIZE, GRID_SPACING } from './constants';

export type ViewMode = 'grid' | 'focused';

interface BrushGridProps {
  presets: BrushPreset[];
  sortRule: SortRule;
  containerWidth: number;
  containerHeight: number;
  onPresetDragStart: (e: React.DragEvent, presetId: string) => void;
  onPresetDragEnd: () => void;
  onSlotDrop: (e: React.DragEvent, slotIndex: number) => void;
  draggedBrushId: string | null;
  onDropCompleted?: () => void;
  onViewModeChange?: (viewMode: ViewMode) => void;
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
  sprite: Sprite | null;
  border: Graphics;
  preset: BrushWithMetrics;
  gridX: number;
  gridY: number;
  index: number;
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
        const a = data[i + 3];

        let brightness: number;
        if (a === 0) {
          brightness = 255;
        } else {
          const alpha = a / 255;
          const blendedR = r * alpha + 255 * (1 - alpha);
          const blendedG = g * alpha + 255 * (1 - alpha);
          const blendedB = b * alpha + 255 * (1 - alpha);
          brightness = 0.2126 * blendedR + 0.7152 * blendedG + 0.0722 * blendedB;
        }
        totalBrightness += brightness;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let saturation = 0;
        let hue = 0;
        if (a > 0) {
          const alpha = a / 255;
          const blendedR = r * alpha + 255 * (1 - alpha);
          const blendedG = g * alpha + 255 * (1 - alpha);
          const blendedB = b * alpha + 255 * (1 - alpha);
          const blendedMax = Math.max(blendedR, blendedG, blendedB);
          const blendedMin = Math.min(blendedR, blendedG, blendedB);
          const blendedDelta = blendedMax - blendedMin;

          if (blendedDelta > 0) {
            saturation = blendedDelta / blendedMax;
            if (blendedMax === blendedR) {
              hue = ((blendedG - blendedB) / blendedDelta) % 6;
            } else if (blendedMax === blendedG) {
              hue = (blendedB - blendedR) / blendedDelta + 2;
            } else {
              hue = (blendedR - blendedG) / blendedDelta + 4;
            }
            hue *= 60;
            if (hue < 0) hue += 360;
          }
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

  const maxColumnsBasedOnWidth = Math.floor((containerWidth + GRID_SPACING) / (GRID_MIN_BRUSH_SIZE + GRID_SPACING));
  const maxColumns = Math.min(itemCount, Math.max(1, maxColumnsBasedOnWidth));

  let bestColumns = maxColumns;
  let bestBrushSize = GRID_MIN_BRUSH_SIZE;
  let foundFit = false;

  for (let cols = maxColumns; cols >= 1; cols--) {
    const availableWidth = containerWidth - (cols - 1) * GRID_SPACING;
    const brushSize = Math.floor(availableWidth / cols);
    const rows = Math.ceil(itemCount / cols);
    const totalHeight = rows * brushSize + (rows - 1) * GRID_SPACING;

    if (totalHeight <= containerHeight && brushSize >= GRID_MIN_BRUSH_SIZE) {
      bestColumns = cols;
      bestBrushSize = Math.min(brushSize, GRID_MAX_BRUSH_SIZE);
      foundFit = true;
      break;
    }
  }

  if (!foundFit) {
    bestColumns = maxColumns;
    const availableWidth = containerWidth - (bestColumns - 1) * GRID_SPACING;
    bestBrushSize = Math.floor(availableWidth / bestColumns);
    bestBrushSize = Math.max(bestBrushSize, GRID_MIN_BRUSH_SIZE);
  }

  const rows = Math.ceil(itemCount / bestColumns);
  return { columns: bestColumns, rows, brushSize: bestBrushSize };
}

// Props destructuring
export function PixiBrushGrid({
  presets,
  sortRule,
  containerWidth,
  containerHeight,
  onPresetDragStart,
  onPresetDragEnd,
  onSlotDrop,
  draggedBrushId,
  onDropCompleted,
  onViewModeChange,
}: BrushGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const brushSpritesRef = useRef<Map<string, BrushSpriteData>>(new Map());
  const textureCacheRef = useRef<Map<string, Texture>>(new Map());
  const gridContainerRef = useRef<Container | null>(null);
  const albumContainerRef = useRef<Container | null>(null);
  const draggingPresetIdRef = useRef<string | null>(null);
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const lastClickTimeRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  // 延迟 ghost 创建：等待鼠标移动超过阈值才显示 ghost
  const pendingDragRef = useRef<{ preset: BrushWithMetrics; startX: number; startY: number } | null>(null);

  // Global pointerup handler - defined at top level so cleanup can reference it
  const handleGlobalPointerUpRef = useRef<() => void>(() => {});
  handleGlobalPointerUpRef.current = () => {
    if (draggingPresetIdRef.current) {
      pendingDragRef.current = null;
      isDraggingRef.current = false;
      draggingPresetIdRef.current = null;
      removeDragGhost();
    }
  };

  const [presetsWithMetrics, setPresetsWithMetrics] = useState<BrushWithMetrics[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const effectVersionRef = useRef(0);
  const sortedPresetsRef = useRef<BrushWithMetrics[]>([]);

  const PADDING = 52;
  const availableWidth = Math.max(containerWidth - PADDING * 2, 100);
  const availableHeight = Math.max(containerHeight - PADDING * 2, 100);

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
  const { columns, brushSize } = calculateGridDimensions(availableWidth, availableHeight, sortedPresets.length);

  // Keep ref in sync with sorted presets for use in callbacks
  useEffect(() => {
    sortedPresetsRef.current = sortedPresets;
  }, [sortedPresets]);

  // Load texture helper
  const loadTexture = useCallback(async (preset: BrushWithMetrics): Promise<Texture | null> => {
    const layerData = preset.layers[0];
    if (!layerData) return null;

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
  }, []);

  // Create ghost element for dragging
  const createDragGhost = useCallback((preset: BrushWithMetrics, x: number, y: number) => {
    const layerData = preset.layers[0];
    if (!layerData) return;

    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position: fixed;
      left: ${x - 30}px;
      top: ${y - 30}px;
      width: 60px;
      height: 60px;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.9;
      border-radius: 8px;
      overflow: hidden;
      background-image: linear-gradient(45deg, #d4d4d4 25%, transparent 25%),
        linear-gradient(-45deg, #d4d4d4 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #d4d4d4 75%),
        linear-gradient(-45deg, transparent 75%, #d4d4d4 75%);
      background-size: 8px 8px;
      background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
      background-color: #f5f5f5;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    `;
    const img = document.createElement('img');
    img.src = layerData;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    ghost.appendChild(img);
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
  }, []);

  // Remove ghost element
  const removeDragGhost = useCallback(() => {
    if (dragGhostRef.current) {
      document.body.removeChild(dragGhostRef.current);
      dragGhostRef.current = null;
    }
  }, []);

  // Initialize PixiJS Application
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;

    effectVersionRef.current += 1;
    const currentVersion = effectVersionRef.current;

    let isMounted = true;

    const initApp = async () => {
      try {
        const width = containerRef.current!.clientWidth || 800;
        const height = containerRef.current!.clientHeight || 600;

        const app = new Application();

        await app.init({
          width,
          height,
          backgroundColor: 0xf5f5f5,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        if (!isMounted || effectVersionRef.current !== currentVersion) {
          app.destroy(true);
          return;
        }
        if (!containerRef.current) {
          app.destroy(true);
          return;
        }

        const canvas = app.canvas as HTMLCanvasElement;
        canvas.style.cursor = 'grab';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        containerRef.current.appendChild(canvas);
        appRef.current = app;

        // Create containers for grid and album views
        const grid = new Container();
        const album = new Container();
        app.stage.addChild(grid);
        app.stage.addChild(album);

        gridContainerRef.current = grid;
        albumContainerRef.current = album;

        // Global pointerup to end drag (on document level to catch events outside canvas)
        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.on('pointerup', handleGlobalPointerUpRef.current);

        // Also listen on document to catch pointerup outside canvas (e.g., on floating window)
        document.addEventListener('pointerup', handleGlobalPointerUpRef.current);

        setIsReady(true);
      } catch (error) {
        console.error('Failed to initialize PixiJS:', error);
      }
    };

    initApp();

    return () => {
      isMounted = false;
      removeDragGhost();
      document.removeEventListener('pointerup', handleGlobalPointerUpRef.current);
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
      textureCacheRef.current.clear();
      brushSpritesRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPresetDragEnd, removeDragGhost]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || !appRef.current) return;

    const observer = new ResizeObserver(() => {
      if (containerRef.current && appRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) {
          appRef.current.renderer.resize(w, h);
          appRef.current.stage.hitArea = appRef.current.screen;
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isReady]);

  // Pointer move handler for dragging ghost
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      // 检查是否有待创建的 ghost
      if (pendingDragRef.current && isDraggingRef.current && !dragGhostRef.current) {
        const dx = e.clientX - pendingDragRef.current.startX;
        const dy = e.clientY - pendingDragRef.current.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 只有移动超过 5px 才显示 ghost
        if (distance > 5) {
          createDragGhost(pendingDragRef.current.preset, e.clientX, e.clientY);
          pendingDragRef.current = null;
        }
        return;
      }

      // 拖动状态下更新 ghost 位置
      if (dragGhostRef.current && isDraggingRef.current) {
        dragGhostRef.current.style.left = `${e.clientX - 30}px`;
        dragGhostRef.current.style.top = `${e.clientY - 30}px`;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [createDragGhost]);

  // Keyboard navigation for focused view
  useEffect(() => {
    if (viewMode !== 'focused') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(sortedPresets.length - 1, prev + 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setViewMode('grid');
        onViewModeChange?.('grid');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, sortedPresets.length]);

  // Create brush sprite for grid view
  const createBrushSprite = useCallback(async (
    preset: BrushWithMetrics,
    index: number,
    gridContainer: Container
  ) => {
    // Guard: don't add sprites if app was destroyed or version changed
    if (!appRef.current || !gridContainer.parent) return;

    const currentVersion = effectVersionRef.current;

    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * (brushSize + GRID_SPACING) + brushSize / 2 + PADDING;
    const y = row * (brushSize + GRID_SPACING) + brushSize / 2 + PADDING;

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

    // Check version again after async operation
    if (effectVersionRef.current !== currentVersion) return;

    let sprite: Sprite | null = null;

    if (texture) {
      sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      const scale = Math.min(brushSize / texture.width, brushSize / texture.height);
      sprite.scale.set(scale);
      container.addChild(sprite);
    } else {
      const placeholder = new Graphics();
      placeholder.rect(-brushSize / 2, -brushSize / 2, brushSize, brushSize);
      placeholder.fill({ color: 0x27272a });
      container.addChild(placeholder);
    }

    const brushData: BrushSpriteData = {
      container,
      sprite,
      border,
      preset,
      gridX: x,
      gridY: y,
      index,
    };

    // Pointer down - start drag (but don't show ghost until movement)
    container.on('pointerdown', (event) => {
      event.stopPropagation();
      // 先清除之前的拖动状态，防止残留
      if (draggingPresetIdRef.current) {
        isDraggingRef.current = false;
        draggingPresetIdRef.current = null;
        removeDragGhost();
      }
      // 设置为拖动状态但暂不创建 ghost
      isDraggingRef.current = true;
      draggingPresetIdRef.current = preset.id;
      container.cursor = 'grabbing';

      // 保存待处理的拖动信息，等待移动时创建 ghost
      pendingDragRef.current = {
        preset,
        startX: event.global.x,
        startY: event.global.y,
      };

      // Create mock drag event with empty types so drop knows this is a pointer drag
      const mockEvent = {
        dataTransfer: {
          types: [], // 空数组表示来自 pointer 事件，不是标准 drag API
          setData: () => {},
          effectAllowed: 'copy',
          setDragImage: () => {},
          getData: () => '',
        },
      } as unknown as React.DragEvent;
      onPresetDragStart(mockEvent, preset.id);
    });

    // Pointer up - end drag
    container.on('pointerup', (event) => {
      event.stopPropagation();
      if (!isDraggingRef.current) return;

      const now = Date.now();
      const isDoubleClick = now - lastClickTimeRef.current < 300;
      lastClickTimeRef.current = now;

      // 清除待处理的拖动
      pendingDragRef.current = null;

      // 清除拖动状态（无论是否匹配当前笔刷）
      const wasDragging = draggingPresetIdRef.current !== null;
      draggingPresetIdRef.current = null;
      isDraggingRef.current = false;
      container.cursor = 'default';
      removeDragGhost();
      onPresetDragEnd();

      // 通知父组件放置完成（用于清除 ghost 等）
      if (wasDragging) {
        onDropCompleted?.();
      }

      // 只有在拖动到有效目标时才触发双击检查
      if (wasDragging && isDoubleClick) {
        // Find the current index of this preset in sortedPresets
        const currentIndex = sortedPresetsRef.current.findIndex(p => p.id === preset.id);
        setSelectedIndex(currentIndex >= 0 ? currentIndex : index);
        setViewMode('focused');
        onViewModeChange?.('focused');
      }
    });

    // Pointer over - disabled during dragging
    container.on('pointerover', () => {
      if (isDraggingRef.current) {
        container.cursor = 'grabbing';
      }
    });

    // Pointer out - disabled during dragging
    container.on('pointerout', () => {
      if (!isDraggingRef.current) {
        container.cursor = 'grab';
      }
    });

    gridContainer.addChild(container);
    brushSpritesRef.current.set(preset.id, brushData);
  }, [columns, brushSize, loadTexture, createDragGhost, removeDragGhost, onPresetDragStart, onPresetDragEnd]);

  // Build grid view - only when presets change (not when sort order changes)
  useEffect(() => {
    if (!appRef.current || !isReady || !gridContainerRef.current || viewMode !== 'grid') return;

    const gridContainer = gridContainerRef.current;
    gridContainer.removeChildren();
    gridContainer.visible = true;
    if (albumContainerRef.current) {
      albumContainerRef.current.visible = false;
    }
    brushSpritesRef.current.clear();

    if (sortedPresets.length === 0) return;

    // Create all sprites and wait for them to complete
    const createAllSprites = async () => {
      for (let i = 0; i < sortedPresets.length; i++) {
        await createBrushSprite(sortedPresets[i], i, gridContainer);
      }
    };

    createAllSprites().catch(console.error);
  }, [isReady, presets.length, columns, brushSize, viewMode, createBrushSprite]);

  // Animate sort changes with gsap
  useEffect(() => {
    if (!isReady) return;

    const existingBrushes = brushSpritesRef.current;
    if (existingBrushes.size === 0) return;

    if (viewMode === 'focused') {
      // In focused mode, animate back to grid positions on exit
      sortedPresets.forEach((preset, newIndex) => {
        const brushData = existingBrushes.get(preset.id);
        if (!brushData) return;

        const col = newIndex % columns;
        const row = Math.floor(newIndex / columns);
        const newX = col * (brushSize + GRID_SPACING) + brushSize / 2 + PADDING;
        const newY = row * (brushSize + GRID_SPACING) + brushSize / 2 + PADDING;

        gsap.to(brushData.container, {
          x: newX,
          y: newY,
          duration: 0.4,
          ease: 'power2.inOut',
        });

        gsap.to(brushData.container.scale, {
          x: 1,
          y: 1,
          duration: 0.4,
          ease: 'power2.inOut',
        });

        brushData.gridX = newX;
        brushData.gridY = newY;
      });
      return;
    }

    // Grid mode: animate to sorted positions
    sortedPresets.forEach((preset, newIndex) => {
      const brushData = existingBrushes.get(preset.id);
      if (!brushData) return;

      const col = newIndex % columns;
      const row = Math.floor(newIndex / columns);
      const newX = col * (brushSize + GRID_SPACING) + brushSize / 2 + PADDING;
      const newY = row * (brushSize + GRID_SPACING) + brushSize / 2 + PADDING;

      gsap.to(brushData.container, {
        x: newX,
        y: newY,
        alpha: 1,
        duration: 0.3,
        ease: 'power2.out',
      });

      // Update stored position
      brushData.gridX = newX;
      brushData.gridY = newY;
    });
  }, [sortRule, isReady, viewMode, sortedPresets, columns, brushSize]);

  // Focused mode rendering - all objects scale 5.5x with pivots tracking focused object
  useEffect(() => {
    if (!appRef.current || !isReady || viewMode !== 'focused') return;

    const gridContainer = gridContainerRef.current!;
    const grid = gridContainerRef.current!;
    const album = albumContainerRef.current!;
    grid.visible = true;
    album.visible = false;

    if (sortedPresets.length === 0) return;

    const focusedPreset = sortedPresets[selectedIndex];
    if (!focusedPreset) return;

    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;
    const SCALE = 5.5;

    // In focused mode:
    // - All objects scale to 5.5x
    // - All objects' pivot (position) tracks the center of the focused object
    // - Objects maintain their relative arrangement around the focus point

    sortedPresets.forEach((preset, i) => {
      const brushData = brushSpritesRef.current.get(preset.id);
      if (!brushData) return;

      // Calculate relative offset from focused brush's grid position
      const focusedCol = selectedIndex % columns;
      const focusedRow = Math.floor(selectedIndex / columns);
      const focusedX = focusedCol * (brushSize + GRID_SPACING) + brushSize / 2 + PADDING;
      const focusedY = focusedRow * (brushSize + GRID_SPACING) + brushSize / 2 + PADDING;

      const col = i % columns;
      const row = Math.floor(i / columns);

      // Relative position in grid coordinates
      const relCol = col - focusedCol;
      const relRow = row - focusedRow;

      // Calculate target position centered on focused object
      // Objects pivot around the focused object's center
      const targetX = centerX + relCol * (brushSize + GRID_SPACING) * SCALE;
      const targetY = centerY + relRow * (brushSize + GRID_SPACING) * SCALE;

      // Animate position to track focused object
      gsap.to(brushData.container, {
        x: targetX,
        y: targetY,
        duration: 0.4,
        ease: 'power2.inOut',
      });

      // Animate scale to 5.5x for all objects
      gsap.to(brushData.container.scale, {
        x: SCALE,
        y: SCALE,
        duration: 0.4,
        ease: 'power2.inOut',
      });

      // Animate alpha: focused brush = 1.0, others = 0.1
      const targetAlpha = i === selectedIndex ? 1 : 0.1;
      gsap.to(brushData.container, {
        alpha: targetAlpha,
        duration: 0.3,
        ease: 'power2.out',
      });
    });
  }, [isReady, viewMode, selectedIndex, sortedPresets, containerWidth, containerHeight, brushSize, columns]);

  // Update borders when dragging changes
  useEffect(() => {
    if (!isReady) return;

    brushSpritesRef.current.forEach((brushData) => {
      const isDragged = draggedBrushId === brushData.preset.id;
      brushData.border.clear();
      brushData.border.rect(-brushSize / 2, -brushSize / 2, brushSize, brushSize);
      if (isDragged) {
        brushData.border.stroke({ width: 3, color: 0x3b82f6 });
        brushData.border.rect(-brushSize / 2 - 2, -brushSize / 2 - 2, brushSize + 4, brushSize + 4);
        brushData.border.stroke({ width: 1, color: 0x60a5fa });
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
      className="overflow-hidden w-full h-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    />
  );
}
