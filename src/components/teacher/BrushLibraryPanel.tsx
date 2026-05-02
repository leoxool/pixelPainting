'use client';

// Brush library sidebar for single brush mode
import JSZip from 'jszip';

interface BrushPreset {
  id: string;
  name: string;
  timestamp: number;
  layers: (string | null)[];
}

interface BrushLibraryPanelProps {
  brushPresets: BrushPreset[];
  hoveredPresetId: string | null;
  onHoverPreset: (id: string | null) => void;
  onSelectPreset: (preset: BrushPreset) => void;
  onDeletePreset: (id: string) => void;
  onImport: () => void;
  onExport: () => void;
  brushImportInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function BrushLibraryPanel({
  brushPresets,
  hoveredPresetId,
  onHoverPreset,
  onSelectPreset,
  onDeletePreset,
  onImport,
  onExport,
  brushImportInputRef,
}: BrushLibraryPanelProps) {
  return (
    <div className="w-64 bg-zinc-800 p-3 flex flex-col h-full border-r border-zinc-700">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">笔刷库</h3>
        <div className="flex gap-1">
          <button
            onClick={onImport}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
          >
            导入
          </button>
          <button
            onClick={onExport}
            className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs"
          >
            导出
          </button>
        </div>
      </div>
      {/* Brush grid - 5 per row */}
      <div className="flex-1 overflow-y-auto pt-1 pr-1.5">
        <div className="grid grid-cols-5 gap-2">
          {brushPresets.length === 0 ? (
            <div className="col-span-5 text-xs text-zinc-500 text-center py-8">暂无笔刷</div>
          ) : (
            brushPresets.map((preset) => (
              <div
                key={preset.id}
                className="relative w-10 h-10 cursor-pointer group"
                onMouseEnter={() => onHoverPreset(preset.id)}
                onMouseLeave={() => onHoverPreset(null)}
                onClick={() => onSelectPreset(preset)}
              >
                <div className="w-full h-full bg-zinc-700 rounded border border-zinc-600 transition-colors group-hover:border-blue-500">
                  {preset.layers[0] && (
                    <img src={preset.layers[0]} alt="" className="w-full h-full object-contain" />
                  )}
                </div>
                {hoveredPresetId === preset.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePreset(preset.id);
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 hover:bg-red-500 rounded-full flex items-center justify-center shadow-md z-10"
                  >
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Export handler helper
export async function exportBrushesAsZip(brushPresets: BrushPreset[]): Promise<void> {
  const zip = new JSZip();
  brushPresets.forEach((preset, index) => {
    const layer = preset.layers[0];
    if (layer) {
      const base64Data = layer.replace(/^data:image\/\w+;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      zip.file(`brush_${index + 1}.png`, bytes);
    }
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brushes-${Date.now()}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}