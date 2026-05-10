'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { BrushPreset, BrushGroup, SortRule } from './types';
import { BrushGroupSlot } from './BrushGroupSlot';
import { PixiBrushGrid } from './PixiBrushGrid';
import { FloatingWindow } from './FloatingWindow';
import { getBrushGroups, saveBrushGroups, deleteBrushGroup as dbDeleteBrushGroup } from '@/lib/db';

// Brush metrics interfaces (same as PixiBrushGrid)
interface BrushMetrics {
  brightness: number;
  saturation: number;
  hue: number;
}

interface BrushWithMetrics extends BrushPreset {
  metrics?: BrushMetrics;
}

// Calculate brightness from RGB (luma)
function calculateBrightnessFromRgb(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Calculate hue from RGB (0-360)
function calculateHueFromRgb(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  hue *= 60;
  if (hue < 0) hue += 360;
  return hue;
}

// Calculate saturation from RGB (0-1)
function calculateSaturationFromRgb(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

// Calculate brush metrics from layer data
function calculateBrushMetricsSync(preset: BrushPreset): BrushMetrics {
  const layerData = preset.layers[0];
  if (!layerData) {
    return { brightness: 128, saturation: 0, hue: 0 };
  }

  // Create a promise-based approach but resolve synchronously using a canvas
  const img = new Image();
  img.src = layerData;

  // Since we can't load synchronously, return default and let the async version in PixiBrushGrid handle it
  // For quick selection, we'll use a simplified approach based on the color
  return { brightness: 128, saturation: 0, hue: 0 };
}

// Color range definitions
const HUE_RANGES = {
  '蓝紫': { min: 220, max: 300 },
  '红橙': { min: 0, max: 60 },
  '黄绿': { min: 60, max: 150 },
} as const;

const SATURATION_THRESHOLD = 0.25;

interface BrushGroupEditorProps {
  brushPresets: BrushPreset[];
  slots: (BrushPreset | null)[];
  onSlotChange: (index: number, preset: BrushPreset | null) => void;
  onSlotClick: (index: number) => void;
  onSaveGroup: (name: string) => void;
  onClearAll: () => void;
  brushUpdateTrigger: number;
  onLoadGroup: (group: BrushGroup) => void;
  brushGroupUpdateTrigger?: number;
  onFullscreenModeChange?: (isFullscreen: boolean) => void;
}

export function BrushGroupEditor({
  brushPresets,
  slots,
  onSlotChange,
  onSlotClick,
  onSaveGroup,
  onClearAll,
  brushUpdateTrigger,
  onLoadGroup,
  brushGroupUpdateTrigger = 0,
  onFullscreenModeChange,
}: BrushGroupEditorProps) {
  const [sortRule, setSortRule] = useState<SortRule>('time');
  const [draggedBrushId, setDraggedBrushId] = useState<string | null>(null);
  const [savedGroups, setSavedGroups] = useState<BrushGroup[]>([]);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showSlotsPanel, setShowSlotsPanel] = useState(false);
  const [presetsWithMetrics, setPresetsWithMetrics] = useState<BrushWithMetrics[]>([]);
  // Selected brush IDs for click-to-select mode
  const [selectedBrushIds, setSelectedBrushIds] = useState<string[]>([]);
  // Operation mode: 'browse' = double-click enters album, 'edit' = click selects
  const [mode, setMode] = useState<'browse' | 'edit'>('edit');
  // Focused mode for album browsing (separate from mode)
  const [isFocused, setIsFocused] = useState(false);
  const [enterFocusedTrigger, setEnterFocusedTrigger] = useState(0);
  // Fullscreen mode when in focused/album view
  const [isFullscreen, setIsFullscreen] = useState(false);
  const showSlotsPanelRef = useRef(false);
  useEffect(() => {
    showSlotsPanelRef.current = showSlotsPanel;
  }, [showSlotsPanel]);

  // Pointer-based drag state
  const [isPointerDragging, setIsPointerDragging] = useState(false);
  const pointerDragTargetSlotRef = useRef<number | null>(null);

  // Container refs for grid sizing
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(800);
  const [gridHeight, setGridHeight] = useState(600);

  // Handle presets with metrics update from PixiBrushGrid
  const handlePresetsWithMetricsChange = useCallback((metrics: BrushWithMetrics[]) => {
    setPresetsWithMetrics(metrics);
  }, []);

  // Handle brush selection (click to select)
  const handleBrushSelect = useCallback((brushId: string, isSelected: boolean) => {
    setSelectedBrushIds(prev => {
      if (isSelected) {
        return [...prev, brushId];
      } else {
        return prev.filter(id => id !== brushId);
      }
    });
  }, []);

  // Dynamic slot count based on filled slots (min 5, max based on actual)
  const filledSlots = slots.filter(s => s !== null).length;
  const effectiveSlotCount = Math.max(5, filledSlots);

  // Load brush groups from IndexedDB
  const loadGroups = useCallback(async () => {
    try {
      const groups = await getBrushGroups();
      setSavedGroups(groups);
    } catch (e) {
      console.error('Failed to load brush groups:', e);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups, brushGroupUpdateTrigger]);

  // Update grid dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (gridContainerRef.current) {
        setGridWidth(gridContainerRef.current.clientWidth);
        setGridHeight(gridContainerRef.current.clientHeight);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, presetId: string) => {
    // 检测是否是 pointer 触发的拖动（空 types）
    const isPointer = e.dataTransfer.types.length === 0;
    setIsPointerDragging(isPointer);

    setDraggedBrushId(presetId);
    if (!isPointer) {
      // 标准 drag API 才设置 dataTransfer
      e.dataTransfer.setData('text/plain', presetId);
    }
    e.dataTransfer.effectAllowed = 'copy';

    // Create 40x40 drag image element
    const preset = brushPresets.find(p => p.id === presetId);
    if (preset?.layers[0]) {
      const dragEl = document.createElement('div');
      dragEl.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: 40px;
        height: 40px;
        background-image: linear-gradient(45deg, #d4d4d4 25%, transparent 25%),
          linear-gradient(-45deg, #d4d4d4 25%, transparent 25%),
          linear-gradient(45deg, transparent 75%, #d4d4d4 75%),
          linear-gradient(-45deg, transparent 75%, #d4d4d4 75%);
        background-size: 8px 8px;
        background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
        background-color: #f5f5f5;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      `;
      const img = document.createElement('img');
      img.src = preset.layers[0];
      img.style.cssText = 'width:40px;height:40px;object-fit:contain;';
      dragEl.appendChild(img);
      document.body.appendChild(dragEl);
      e.dataTransfer.setDragImage(dragEl, 20, 20);
      // Clean up after drag starts
      requestAnimationFrame(() => document.body.removeChild(dragEl));
    }
  }, [brushPresets]);

  const handleDragEnd = useCallback(() => {
    setDraggedBrushId(null);
    setIsPointerDragging(false);
    pointerDragTargetSlotRef.current = null;
  }, []);

  // Pointer drag enter slot
  const handlePointerDragEnter = useCallback((slotIndex: number) => {
    if (isPointerDragging) {
      pointerDragTargetSlotRef.current = slotIndex;
    }
  }, [isPointerDragging]);

  // Pointer drag leave slot
  const handlePointerDragLeave = useCallback((slotIndex: number) => {
    if (pointerDragTargetSlotRef.current === slotIndex) {
      pointerDragTargetSlotRef.current = null;
    }
  }, []);

  // Pointer drop on slot
  const handlePointerDrop = useCallback((slotIndex: number) => {
    if (!isPointerDragging || !draggedBrushId) return;

    const preset = brushPresets.find(p => p.id === draggedBrushId);
    if (preset) {
      onSlotChange(slotIndex, preset);
    }
  }, [isPointerDragging, draggedBrushId, brushPresets, onSlotChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    // 优先使用 dataTransfer 中的数据，否则使用 draggedBrushId
    const brushId = e.dataTransfer.getData('text/plain') || draggedBrushId;
    if (!brushId) {
      return;
    }

    const preset = brushPresets.find(p => p.id === brushId);
    if (preset) {
      onSlotChange(slotIndex, preset);
    }
    // 只有当数据来自 dataTransfer 时才清除 draggedBrushId（标准 drag API）
    if (e.dataTransfer.types.length > 0 && Array.from(e.dataTransfer.types).includes('text/plain')) {
      setDraggedBrushId(null);
    }
  }, [draggedBrushId, brushPresets, onSlotChange]);

  const generateGroupName = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}${day}-${hours}${minutes}${seconds}`;
  };

  const handleSaveGroup = useCallback(() => {
    const name = generateGroupName();
    onSaveGroup(name);
  }, [onSaveGroup]);

  const handleDeleteGroup = useCallback(async (id: string) => {
    try {
      await dbDeleteBrushGroup(id);
      setSavedGroups(prev => prev.filter(g => g.id !== id));
    } catch (e) {
      console.error('Failed to delete brush group:', e);
    }
  }, []);

  const canSave = filledSlots >= 5;

  // Position floating window at bottom center by default
  const getDefaultPosition = () => {
    if (typeof window !== 'undefined') {
      return {
        x: (window.innerWidth - 800) / 2,
        y: window.innerHeight - 220
      };
    }
    return { x: 100, y: 400 };
  };

  const [windowPosition, setWindowPosition] = useState(getDefaultPosition);

  // Toggle slots panel with 'g' key, 'f' to toggle fullscreen/focused mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === 'g') {
        setShowSlotsPanel(prev => !prev);
      } else if (e.key.toLowerCase() === 'f') {
        if (isFullscreen || isFocused) {
          // Exit fullscreen and focused mode back to edit mode
          setIsFullscreen(false);
          setIsFocused(false);
          setMode('edit');
          onFullscreenModeChange?.(false);
        } else {
          // Enter browse mode, focused view, and fullscreen
          setMode('browse');
          setIsFullscreen(true);
          setEnterFocusedTrigger(prev => prev + 1);
          onFullscreenModeChange?.(true);
        }
      } else if (e.key === 'Escape' && isFocused) {
        // Exit focused mode but stay in browse mode
        setIsFocused(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocused, isFullscreen, onFullscreenModeChange]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Toolbar - sort buttons on left, mode toggle center, quick select + save on right */}
      {/* Hidden when in fullscreen mode */}
      {!isFullscreen && (
      <div className="flex-shrink-0 w-full flex items-center justify-between gap-2 px-4 py-2 border-b border-zinc-700 bg-zinc-800/50 z-10 flex-wrap">
        {/* Sort buttons - LEFT */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">排序:</span>
          {(['time', 'brightness', 'saturation', 'hue'] as SortRule[]).map((rule) => (
            <button
              key={rule}
              onClick={() => setSortRule(rule)}
              className={`px-2 py-1 rounded text-xs ${
                sortRule === rule
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
            >
              {rule === 'time' ? '时间' : rule === 'brightness' ? '亮度' : rule === 'saturation' ? '饱和度' : '色相'}
            </button>
          ))}
        </div>

        {/* Mode toggle - CENTER */}
        <div className="flex items-center gap-1 bg-zinc-900 rounded p-0.5">
          <button
            onClick={() => setMode('browse')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              mode === 'browse'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            浏览
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              mode === 'edit'
                ? 'bg-blue-600 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            编辑
          </button>
        </div>

        {/* Quick selection + Save buttons - RIGHT (disabled in browse mode) */}
        <div className="flex items-center gap-2">
          {/* Quick selection tags */}
          <button
            onClick={() => {
              // Select all visible brushes
              const allIds = presetsWithMetrics.map(p => p.id);
              setSelectedBrushIds(allIds);
            }}
            disabled={mode === 'browse'}
            className={`px-2 py-1 rounded text-xs ${
              mode === 'browse'
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            全选
          </button>
          <button
            onClick={() => setSelectedBrushIds([])}
            disabled={mode === 'browse'}
            className={`px-2 py-1 rounded text-xs ${
              mode === 'browse'
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            清空
          </button>
          <div className="w-px h-5 bg-zinc-600 mx-1" />
          {/* Brush group library button */}
          <button
            onClick={() => setShowLibraryModal(true)}
            disabled={mode === 'browse'}
            className={`px-2 py-1 rounded text-xs ${
              mode === 'browse'
                ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            笔刷组库
          </button>
          {/* Save to brush group library */}
          <button
            onClick={async () => {
              if (selectedBrushIds.length < 5) {
                alert(`请至少选择5个笔刷（当前已选 ${selectedBrushIds.length} 个）`);
                return;
              }
              // Sort selected brushes by brightness (ascending - darkest first)
              const selectedPresets = presetsWithMetrics
                .filter(p => selectedBrushIds.includes(p.id))
                .sort((a, b) => (a.metrics?.brightness ?? 128) - (b.metrics?.brightness ?? 128));

              // Create brush group
              const groupName = `笔刷组_${Date.now()}`;
              const group: BrushGroup = {
                id: Date.now().toString(),
                name: groupName,
                timestamp: Date.now(),
                slots: selectedPresets.map(p => p.id),
              };

              // Save to IndexedDB
              const existing = await getBrushGroups();
              await saveBrushGroups([...existing, group]);
              setSavedGroups(prev => [...prev, group]);
              setSelectedBrushIds([]);
              alert('笔刷组已保存到库中！');
            }}
            disabled={mode === 'browse' || selectedBrushIds.length < 5}
            className={`px-3 py-1 rounded text-xs font-medium ${
              mode === 'browse'
                ? 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
                : selectedBrushIds.length >= 5
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
            }`}
          >
            保存到笔刷组库 ({selectedBrushIds.length})
          </button>
        </div>
      </div>
      )}

      {/* Full page Brush Grid - takes remaining space */}
      <div
        ref={gridContainerRef}
        className="flex-1 overflow-hidden"
        style={{ width: '100%', height: '100%', minHeight: '200px' }}
      >
        <PixiBrushGrid
          presets={brushPresets}
          sortRule={sortRule}
          containerWidth={gridWidth}
          containerHeight={gridHeight}
          onPresetDragStart={handleDragStart}
          onPresetDragEnd={handleDragEnd}
          onSlotDrop={handleDrop}
          draggedBrushId={draggedBrushId}
          onDropCompleted={() => {
            setDraggedBrushId(null);
            setIsPointerDragging(false);
          }}
          onViewModeChange={(mode) => {
            if (mode === 'focused') {
              setIsFocused(true);
              if (showSlotsPanelRef.current) setShowSlotsPanel(false);
            } else {
              // When exiting focused view (via PixiBrushGrid's Escape handler), return to edit mode
              setIsFocused(false);
              setMode('edit');
            }
          }}
          onPresetsWithMetricsChange={handlePresetsWithMetricsChange}
          selectedBrushIds={selectedBrushIds}
          onBrushSelect={handleBrushSelect}
          mode={mode}
          initialViewMode={isFocused ? 'focused' : 'grid'}
          enterFocusedTrigger={enterFocusedTrigger}
        />
      </div>

      {/* Floating Slots Panel */}
      <FloatingWindow
        title="笔刷组"
        initialPosition={windowPosition}
        initialSize={{ width: 880, height: 180 }}
        isOpen={showSlotsPanel}
        onClose={() => setShowSlotsPanel(false)}
        showTitleBar={false}
      >
        <div className="p-3 flex flex-col gap-3">
          {/* Slots panel content with close button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-sm font-medium">笔刷组 ({filledSlots}/{effectiveSlotCount})</div>
              <button
                onClick={() => setShowLibraryModal(true)}
                className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300"
              >
                笔刷组库
              </button>
              <button
                onClick={onClearAll}
                disabled={filledSlots === 0}
                className={`px-3 py-1 rounded text-xs font-medium ${
                  filledSlots > 0
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
                }`}
              >
                清空
              </button>
              <button
                onClick={handleSaveGroup}
                disabled={!canSave}
                className={`px-3 py-1 rounded text-xs font-medium ${
                  canSave
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
                }`}
              >
                保存笔刷组
              </button>
            </div>
            {/* Close button */}
            <button
              onClick={() => setShowSlotsPanel(false)}
              className="p-1 hover:bg-zinc-700 rounded transition-colors"
              title="关闭"
            >
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Dynamic slots horizontally */}
          <div className="flex justify-center gap-2">
            {slots.map((preset, index) => (
              <BrushGroupSlot
                key={index}
                slotIndex={index}
                slotCount={effectiveSlotCount}
                brushPreset={preset}
                onSlotClick={onSlotClick}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                draggedBrushId={draggedBrushId}
                onPointerDragEnter={handlePointerDragEnter}
                onPointerDragLeave={handlePointerDragLeave}
                onPointerDrop={handlePointerDrop}
              />
            ))}
          </div>
        </div>
      </FloatingWindow>

      {/* Toggle Slots Panel Button - bottom right corner */}
      <button
        onClick={() => setShowSlotsPanel(!showSlotsPanel)}
        className={`absolute bottom-4 right-4 p-2 rounded-lg transition-colors z-10 ${
          showSlotsPanel ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
        }`}
        title={showSlotsPanel ? '隐藏笔刷组面板 (G)' : '显示笔刷组面板 (G)'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </button>

      {/* Brush Group Library Modal - above floating window */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setShowLibraryModal(false)}>
          <div className="bg-zinc-800 rounded-2xl w-[500px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 shrink-0">
              <h3 className="font-semibold text-sm">笔刷组库</h3>
              <button onClick={() => setShowLibraryModal(false)} className="p-1 hover:bg-zinc-700 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {savedGroups.length === 0 ? (
                <div className="text-xs text-zinc-500 text-center py-8">暂无保存的笔刷组</div>
              ) : (
                <div className="space-y-3">
                  {savedGroups.map((group) => {
                    // Get first 5 non-null slot IDs
                    const previewSlots = group.slots.filter(id => id !== null).slice(0, 5);
                    return (
                      <div
                        key={group.id}
                        className="p-3 bg-zinc-700 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-zinc-400">
                            {group.slots.filter(id => id !== null).length} 个笔刷
                          </div>
                          <button
                            onClick={() => handleDeleteGroup(group.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            删除
                          </button>
                        </div>
                        {/* Show first 5 brush thumbnails in a row */}
                        <div className="flex gap-2 justify-center">
                          {previewSlots.map((slotId, idx) => {
                            const preset = brushPresets.find(p => p.id === slotId);
                            const layerData = preset?.layers[0];
                            return (
                              <div
                                key={idx}
                                className="w-12 h-12 bg-zinc-600 rounded border border-zinc-500 overflow-hidden"
                              >
                                {layerData && (
                                  <img src={layerData} alt="" className="w-full h-full object-contain" />
                                )}
                              </div>
                            );
                          })}
                          {/* Fill empty slots if less than 5 */}
                          {Array.from({ length: 5 - previewSlots.length }).map((_, idx) => (
                            <div
                              key={`empty-${idx}`}
                              className="w-12 h-12 bg-zinc-800 rounded border border-zinc-600"
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}