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
  onPresetsWithMetricsChange?: (presets: BrushWithMetrics[]) => void;
  // Selection props
  selectedBrushIds: string[];
  onBrushSelect?: (brushId: string, isSelected: boolean) => void;
  // Operation mode: 'browse' = double-click enters album, 'edit' = click selects
  mode?: 'browse' | 'edit';
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
  selectionRing: Graphics;
  preset: BrushWithMetrics;
  gridX: number;
  gridY: number;
  index: number;
}

// Hue range definitions for histogram
const HUE_RANGES = {
  '红橙': { min: 0, max: 60 },      // 0-60°
  '黄绿': { min: 60, max: 150 },    // 60-150°
  '绿青': { min: 150, max: 220 },   // 150-220°
  '蓝紫': { min: 220, max: 300 },   // 220-300°
} as const;

const SATURATION_THRESHOLD = 0.15; // 低饱和度阈值，低于此值视为灰度

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
      let pixelCount = 0;

      // 用于统计各色相范围的像素数量
      const hueHistogram: Record<string, number> = {
        '红橙': 0,
        '黄绿': 0,
        '绿青': 0,
        '蓝紫': 0,
        '灰度': 0, // 饱和度很低的像素
      };
      let colorfulPixelCount = 0; // 有色彩信息的像素总数

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

        if (a > 0) {
          const alpha = a / 255;
          const blendedR = r * alpha + 255 * (1 - alpha);
          const blendedG = g * alpha + 255 * (1 - alpha);
          const blendedB = b * alpha + 255 * (1 - alpha);
          const blendedMax = Math.max(blendedR, blendedG, blendedB);
          const blendedMin = Math.min(blendedR, blendedG, blendedB);
          const blendedDelta = blendedMax - blendedMin;

          let saturation = 0;
          let hue = 0;

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

          totalSaturation += saturation;
          pixelCount++;

          // 统计色相直方图
          if (saturation >= SATURATION_THRESHOLD) {
            colorfulPixelCount++;
            // 判断该像素属于哪个色相范围
            if (hue >= HUE_RANGES['红橙'].min && hue < HUE_RANGES['红橙'].max) {
              hueHistogram['红橙']++;
            } else if (hue >= HUE_RANGES['黄绿'].min && hue < HUE_RANGES['黄绿'].max) {
              hueHistogram['黄绿']++;
            } else if (hue >= HUE_RANGES['绿青'].min && hue < HUE_RANGES['绿青'].max) {
              hueHistogram['绿青']++;
            } else if (hue >= HUE_RANGES['蓝紫'].min && hue < HUE_RANGES['蓝紫'].max) {
              hueHistogram['蓝紫']++;
            } else {
              // 其他色彩（如偏红的330-360和偏蓝的300-330）
              hueHistogram['蓝紫']++; // 归入蓝紫色范围
            }
          } else {
            hueHistogram['灰度']++;
          }
        } else {
          // 透明像素视为灰度
          hueHistogram['灰度']++;
          pixelCount++;
        }
      }

      // 计算最终色相：选择像素数量最多的色相范围的中心值
      let dominantHue = 0;
      let maxCount = 0;
      const hueCenters: Record<string, number> = {
        '红橙': 30,    // 0-60 的中心
        '黄绿': 105,   // 60-150 的中心
        '绿青': 185,   // 150-220 的中心
        '蓝紫': 260,   // 220-300 的中心
        '灰度': 0,
      };

      for (const [range, count] of Object.entries(hueHistogram)) {
        if (count > maxCount) {
          maxCount = count;
          dominantHue = hueCenters[range];
        }
      }

      resolve({
        brightness: pixelCount > 0 ? totalBrightness / pixelCount : 128,
        saturation: pixelCount > 0 ? totalSaturation / pixelCount : 0,
        hue: dominantHue,
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
      sorted.sort((a, b) => (a.metrics?.brightness ?? 128) - (b.metrics?.brightness ?? 128));
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
  onPresetsWithMetricsChange,
  selectedBrushIds = [],
  onBrushSelect,
  mode = 'edit',
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
  // 套索选择模式：鼠标按下拖动过程中，用于记录已选中的笔刷（避免重复选中）
  const lassoSelectedBrushesRef = useRef<Set<string>>(new Set());
  // 当前是否处于套索选择模式（非标准拖动）
  const isLassoSelectingRef = useRef(false);
  // 上一次套索选择时的指针位置，用于判断是否移动了足够距离
  const lassoLastXRef = useRef<number>(0);
  const lassoLastYRef = useRef<number>(0);
  // 套索线起始点（按下时的位置）
  const lassoStartXRef = useRef<number>(0);
  const lassoStartYRef = useRef<number>(0);
  // 套索线Graphics引用
  const lassoGraphicsRef = useRef<Graphics | null>(null);

  // Global pointerup handler - defined at top level so cleanup can reference it
  const handleGlobalPointerUpRef = useRef<() => void>(() => {});
  handleGlobalPointerUpRef.current = () => {
    if (draggingPresetIdRef.current) {
      pendingDragRef.current = null;
      isDraggingRef.current = false;
      draggingPresetIdRef.current = null;
      removeDragGhost();
    }
    // 结束套索选择
    if (isLassoSelectingRef.current) {
      isLassoSelectingRef.current = false;
      lassoSelectedBrushesRef.current.clear();
      // 清除套索线
      if (lassoGraphicsRef.current) {
        lassoGraphicsRef.current.clear();
      }
    }
  };

  const [presetsWithMetrics, setPresetsWithMetrics] = useState<BrushWithMetrics[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const effectVersionRef = useRef(0);
  const sortedPresetsRef = useRef<BrushWithMetrics[]>([]);
  // Keep selectedBrushIds in a ref for use in event handlers
  const selectedBrushIdsRef = useRef<string[]>(selectedBrushIds);

  // Update ref when selectedBrushIds changes
  useEffect(() => {
    selectedBrushIdsRef.current = selectedBrushIds;
  }, [selectedBrushIds]);

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
      onPresetsWithMetricsChange?.(results);
    };
    calculateAll();
  }, [presets, onPresetsWithMetricsChange]);

  const sortedPresets = sortPresets(presetsWithMetrics, sortRule);
  const { columns, brushSize } = calculateGridDimensions(availableWidth, availableHeight, sortedPresets.length);

  // Keep ref in sync with sorted presets for use in callbacks
  useEffect(() => {
    sortedPresetsRef.current = sortedPresets;
  }, [sortedPresets]);

  // When mode changes to 'edit', exit focused mode if in browse mode
  useEffect(() => {
    if (mode === 'edit' && viewMode === 'focused') {
      setViewMode('grid');
      onViewModeChange?.('grid');
    }
  }, [mode, viewMode, onViewModeChange]);

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
        // Create lasso line graphics (added to grid so it renders behind sprites)
        const lassoGraphics = new Graphics();
        grid.addChild(lassoGraphics);
        app.stage.addChild(grid);
        app.stage.addChild(album);

        gridContainerRef.current = grid;
        albumContainerRef.current = album;
        // Store lasso graphics reference
        lassoGraphicsRef.current = lassoGraphics;

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

  // Pointer move handler for dragging ghost and lasso selection
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

      // 套索选择模式：检测指针是否经过笔刷
      if (isLassoSelectingRef.current && pendingDragRef.current) {
        const dx = e.clientX - lassoLastXRef.current;
        const dy = e.clientY - lassoLastYRef.current;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 获取 canvas 位置以便将 client 坐标转换为 canvas 坐标
        const canvasRect = containerRef.current?.getBoundingClientRect();

        // 绘制套索线：从起始点到当前鼠标位置
        if (lassoGraphicsRef.current && canvasRect) {
          // 获取 PixiJS canvas 尺寸和 CSS 尺寸的比例
          const app = appRef.current;
          if (app) {
            const cssWidth = containerRef.current!.clientWidth;
            const cssHeight = containerRef.current!.clientHeight;
            const pixiWidth = app.screen.width;
            const pixiHeight = app.screen.height;
            const scaleX = pixiWidth / cssWidth;
            const scaleY = pixiHeight / cssHeight;

            const startX = (lassoStartXRef.current - canvasRect.left) * scaleX;
            const startY = (lassoStartYRef.current - canvasRect.top) * scaleY;
            const currentX = (e.clientX - canvasRect.left) * scaleX;
            const currentY = (e.clientY - canvasRect.top) * scaleY;

            lassoGraphicsRef.current.clear();
            lassoGraphicsRef.current.moveTo(startX, startY);
            lassoGraphicsRef.current.lineTo(currentX, currentY);
            lassoGraphicsRef.current.stroke({ width: 30, color: 0xff0000, alpha: 0.50 });
          }
        }

        // 只有移动超过阈值才检测碰撞
        if (distance > 8) {
          if (canvasRect) {
            const canvasX = e.clientX - canvasRect.left;
            const canvasY = e.clientY - canvasRect.top;

            // 检查所有笔刷容器是否与指针碰撞
            brushSpritesRef.current.forEach((brushData) => {
              const spriteX = brushData.gridX;
              const spriteY = brushData.gridY;
              const halfSize = brushSize / 2 + 5; // 加一点padding
              if (
                canvasX >= spriteX - halfSize &&
                canvasX <= spriteX + halfSize &&
                canvasY >= spriteY - halfSize &&
                canvasY <= spriteY + halfSize
              ) {
                lassoSelectedBrushesRef.current.add(brushData.preset.id);
                // 套索选择时鼠标掠过立即显示红环
                brushData.selectionRing.visible = true;
              } else {
                // 如果不在当前套索路径上且未被父组件选中，则隐藏
                if (!selectedBrushIdsRef.current.includes(brushData.preset.id)) {
                  brushData.selectionRing.visible = false;
                }
              }
            });
          }

          lassoLastXRef.current = e.clientX;
          lassoLastYRef.current = e.clientY;
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [createDragGhost, brushSize]);

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

  // Listen for quick selection events from BrushGroupEditor
  useEffect(() => {
    const handleQuickSelect = (e: Event) => {
      const customEvent = e as CustomEvent<{ type: string; range?: { min: number; max: number }; hueRange?: string; threshold?: number }>;
      const { type } = customEvent.detail;

      if (type === 'clear') {
        // Clear selection - for now, we just log it
        console.log('Quick select: clear');
        return;
      }

      if (type === 'hue' && customEvent.detail.range) {
        const { range } = customEvent.detail;
        // Filter presets by hue range and trigger drag selection
        const matchingPresets = presetsWithMetrics.filter(p => {
          if (!p.metrics) return false;
          const hue = p.metrics.hue;
          // Handle wrap-around for red/orange (0-60) and blue/purple (220-300)
          if (range.min > range.max) {
            // Wrapping range like 220-300 for blue/purple
            return hue >= range.min || hue <= range.max;
          }
          return hue >= range.min && hue <= range.max;
        });
        if (matchingPresets.length > 0) {
          // Start drag with the first matching preset
          const firstPreset = matchingPresets[0];
          const mockEvent = {
            dataTransfer: {
              types: [],
              setData: () => {},
              effectAllowed: 'copy',
              setDragImage: () => {},
              getData: () => '',
            },
          } as unknown as React.DragEvent;
          onPresetDragStart(mockEvent, firstPreset.id);
        }
      }

      if (type === 'saturation' && customEvent.detail.threshold !== undefined) {
        const { threshold } = customEvent.detail;
        const matchingPresets = presetsWithMetrics.filter(p => {
          if (!p.metrics) return false;
          return p.metrics.saturation < threshold;
        });
        if (matchingPresets.length > 0) {
          const firstPreset = matchingPresets[0];
          const mockEvent = {
            dataTransfer: {
              types: [],
              setData: () => {},
              effectAllowed: 'copy',
              setDragImage: () => {},
              getData: () => '',
            },
          } as unknown as React.DragEvent;
          onPresetDragStart(mockEvent, firstPreset.id);
        }
      }
    };

    window.addEventListener('brushQuickSelect', handleQuickSelect);
    return () => window.removeEventListener('brushQuickSelect', handleQuickSelect);
  }, [presetsWithMetrics, onPresetDragStart]);

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

    // Selection ring (annulus: outer radius 25, inner radius 10, red with 30% opacity)
    // Draw as a thick stroke circle - stroke centered at midpoint of inner/outer radius
    const selectionRing = new Graphics();
    const ringOuterRadius = 25;
    const ringInnerRadius = 10;
    const ringMidRadius = (ringOuterRadius + ringInnerRadius) / 2; // 17.5
    const ringThickness = ringOuterRadius - ringInnerRadius; // 15
    selectionRing.circle(0, 0, ringMidRadius);
    selectionRing.stroke({ width: ringThickness, color: 0xff0000, alpha: 0.50 });
    selectionRing.visible = false;
    container.addChild(selectionRing);

    const brushData: BrushSpriteData = {
      container,
      sprite,
      border,
      selectionRing,
      preset,
      gridX: x,
      gridY: y,
      index,
    };

    // Pointer down - start drag or selection
    container.on('pointerdown', (event) => {
      event.stopPropagation();

      // If onBrushSelect is provided AND mode is 'edit', enter selection mode
      // In 'browse' mode, we go directly to drag mode for dropping into slots
      if (onBrushSelect && mode === 'edit') {
        // 进入套索选择模式：初始化选择状态
        isLassoSelectingRef.current = true;
        lassoLastXRef.current = event.global.x;
        lassoLastYRef.current = event.global.y;
        lassoStartXRef.current = event.global.x;
        lassoStartYRef.current = event.global.y;
        // 点击立即显示红环（不必等鼠标松开）
        selectionRing.visible = true;
        lassoSelectedBrushesRef.current.add(preset.id);
        pendingDragRef.current = {
          preset,
          startX: event.global.x,
          startY: event.global.y,
        };
        return;
      }

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

    // Pointer up - end drag or selection
    container.on('pointerup', (event) => {
      event.stopPropagation();

      // Handle selection mode if onBrushSelect is provided AND mode is 'edit'
      if (onBrushSelect && mode === 'edit' && pendingDragRef.current) {
        const dx = event.global.x - pendingDragRef.current.startX;
        const dy = event.global.y - pendingDragRef.current.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If moved enough, treat as lasso selection (select all hovered brushes)
        if (distance >= 10) {
          // 只选择之前未选中的笔刷（避免重复计数）
          const brushesToSelect = Array.from(lassoSelectedBrushesRef.current).filter(
            brushId => !selectedBrushIdsRef.current.includes(brushId)
          );
          if (brushesToSelect.length > 0) {
            brushesToSelect.forEach(brushId => {
              onBrushSelect(brushId, true);
            });
          }
          isLassoSelectingRef.current = false;
          lassoSelectedBrushesRef.current.clear();
          // 清除套索线
          if (lassoGraphicsRef.current) {
            lassoGraphicsRef.current.clear();
          }
        } else {
          // 点击选择：切换单个笔刷的选中状态
          const isSelected = selectedBrushIdsRef.current.includes(preset.id);
          onBrushSelect(preset.id, !isSelected);
        }
        pendingDragRef.current = null;
        return;
      }

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

      // 只有在浏览模式下双击才会进入相册模式
      if (wasDragging && isDoubleClick && mode === 'browse') {
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
  }, [columns, brushSize, loadTexture, createDragGhost, removeDragGhost, onPresetDragStart, onPresetDragEnd, mode, onBrushSelect]);

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

  // Update selection ring visibility when selectedBrushIds changes
  useEffect(() => {
    if (!isReady) return;

    brushSpritesRef.current.forEach((brushData) => {
      const isSelected = selectedBrushIds.includes(brushData.preset.id);
      brushData.selectionRing.visible = isSelected;
    });
  }, [selectedBrushIds, isReady]);

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
