'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { BrushPreset, BrushGroup, SortRule } from './types';
import { BrushGroupSlot } from './BrushGroupSlot';
import { BrushGrid } from './BrushGrid';
import { getBrushGroups, saveBrushGroups, deleteBrushGroup as dbDeleteBrushGroup } from '@/lib/db';

interface BrushGroupEditorProps {
  brushPresets: BrushPreset[];
  slots: (BrushPreset | null)[];
  onSlotChange: (index: number, preset: BrushPreset | null) => void;
  onSlotClick: (index: number) => void;
  onSaveGroup: (name: string) => void;
  brushUpdateTrigger: number;
  onLoadGroup: (group: BrushGroup) => void;
  brushGroupUpdateTrigger?: number;
}

export function BrushGroupEditor({
  brushPresets,
  slots,
  onSlotChange,
  onSlotClick,
  onSaveGroup,
  brushUpdateTrigger,
  onLoadGroup,
  brushGroupUpdateTrigger = 0,
}: BrushGroupEditorProps) {
  const [sortRule, setSortRule] = useState<SortRule>('time');
  const [draggedBrushId, setDraggedBrushId] = useState<string | null>(null);
  const [savedGroups, setSavedGroups] = useState<BrushGroup[]>([]);
  const [showLibraryModal, setShowLibraryModal] = useState(false);

  // Container refs for grid sizing
  const bottomContainerRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(600);
  const [gridHeight, setGridHeight] = useState(300);

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
      if (bottomContainerRef.current) {
        setGridWidth(bottomContainerRef.current.clientWidth);
        setGridHeight(bottomContainerRef.current.clientHeight);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, presetId: string) => {
    setDraggedBrushId(presetId);
    e.dataTransfer.setData('text/plain', presetId);
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedBrushId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    const brushId = e.dataTransfer.getData('text/plain') || draggedBrushId;
    if (!brushId) return;

    const preset = brushPresets.find(p => p.id === brushId);
    if (preset) {
      onSlotChange(slotIndex, preset);
    }
    setDraggedBrushId(null);
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

  const filledSlots = slots.filter(s => s !== null).length;
  const canSave = filledSlots === 10;

  return (
    <div className="flex flex-col h-full">
      {/* Top: Brush Group Slots */}
      <div className="flex-shrink-0 p-4 bg-zinc-800/50 border-b border-zinc-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="text-sm font-medium">笔刷组 ({filledSlots}/10)</div>
            <button
              onClick={() => setShowLibraryModal(true)}
              className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs text-zinc-300"
            >
              笔刷组库
            </button>
          </div>
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
        {/* 10 slots horizontally */}
        <div className="flex justify-center gap-2">
          {slots.map((preset, index) => (
            <BrushGroupSlot
              key={index}
              slotIndex={index}
              brushPreset={preset}
              onSlotClick={onSlotClick}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              draggedBrushId={draggedBrushId}
            />
          ))}
        </div>
      </div>

      {/* Bottom: Brush Grid */}
      <div ref={bottomContainerRef} className="flex-1 overflow-hidden">
        {/* Sort controls */}
        <div className="flex items-center gap-2 p-2 border-b border-zinc-700">
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
        <BrushGrid
          presets={brushPresets}
          sortRule={sortRule}
          containerWidth={gridWidth}
          containerHeight={gridHeight - 40}
          onPresetDragStart={handleDragStart}
          onPresetDragEnd={handleDragEnd}
          onSlotDrop={handleDrop}
          draggedBrushId={draggedBrushId}
        />
      </div>

      {/* Brush Group Library Modal */}
      {showLibraryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setShowLibraryModal(false)}>
          <div className="bg-zinc-800 rounded-2xl w-[400px] max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                <div className="space-y-2">
                  {savedGroups.map((group) => (
                    <div
                      key={group.id}
                      className="p-3 bg-zinc-700 rounded-lg hover:bg-zinc-600 cursor-pointer"
                      onClick={() => {
                        onLoadGroup(group);
                        setShowLibraryModal(false);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{group.name}</div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(group.id);
                          }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          删除
                        </button>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {group.slots.map((slotId, i) => {
                          const preset = brushPresets.find(p => p.id === slotId);
                          const layerData = preset?.layers[0];
                          return (
                            <div
                              key={i}
                              className="w-6 h-6 bg-zinc-600 rounded border border-zinc-500 overflow-hidden"
                            >
                              {layerData && (
                                <img src={layerData} alt="" className="w-full h-full object-contain" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}