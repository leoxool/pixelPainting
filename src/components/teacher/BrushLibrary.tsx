'use client';

// Brush library modal component

interface BrushPreset {
  id: string;
  name: string;
  timestamp: number;
  layers: (string | null)[];
}

interface BrushLibraryProps {
  brushPresets: BrushPreset[];
  currentPresetName: string;
  onPresetNameChange: (name: string) => void;
  onSaveCurrentAsPreset: (name: string) => void;
  onLoadPreset: (preset: BrushPreset) => void;
  onDeletePreset: (id: string) => void;
  onDragStart: (e: React.DragEvent, brushId: string) => void;
  onDragEnd: () => void;
  onClose: () => void;
}

export function BrushLibrary({
  brushPresets,
  currentPresetName,
  onPresetNameChange,
  onSaveCurrentAsPreset,
  onLoadPreset,
  onDeletePreset,
  onDragStart,
  onDragEnd,
  onClose,
}: BrushLibraryProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div className="bg-zinc-800 rounded-2xl overflow-hidden w-[400px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h3 className="font-semibold text-sm">笔刷库</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-700 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          {/* Save current brushes */}
          <div className="mb-4 p-3 bg-zinc-700 rounded-lg">
            <p className="text-xs text-zinc-400 mb-2">保存当前笔刷套图为预设</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="预设名称..."
                value={currentPresetName}
                onChange={(e) => onPresetNameChange(e.target.value)}
                className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-white"
              />
              <button
                onClick={() => {
                  if (currentPresetName.trim()) {
                    onSaveCurrentAsPreset(currentPresetName.trim());
                  }
                }}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
              >
                保存
              </button>
            </div>
          </div>

          {/* Preset list */}
          {brushPresets.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-4">暂无保存的笔刷预设</p>
          ) : (
            <div className="space-y-3">
              {brushPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="p-3 bg-zinc-700 rounded-lg cursor-grab active:cursor-grabbing hover:bg-zinc-600 transition-colors"
                  draggable
                  onDragStart={(e) => onDragStart(e, preset.id)}
                  onDragEnd={onDragEnd}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{preset.name}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onLoadPreset(preset);
                          onClose();
                        }}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                      >
                        应用
                      </button>
                      <button
                        onClick={() => onDeletePreset(preset.id)}
                        className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  {/* Preview thumbnails */}
                  <div className="flex gap-1">
                    {preset.layers.map((dataUrl: string | null, idx: number) => (
                      <div
                        key={idx}
                        className="w-6 h-6 bg-zinc-800 rounded border border-zinc-600 overflow-hidden"
                      >
                        {dataUrl && (
                          <img
                            src={dataUrl}
                            alt={`Level ${idx}`}
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}