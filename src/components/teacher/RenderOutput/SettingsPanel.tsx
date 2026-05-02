'use client';

// Settings panel for render output tab
interface SettingsPanelProps {
  gridSamplingSize: number;
  sizeJitter: number;
  rotationJitter: number;
  enableFlip: boolean;
  enableMergeOptimization: boolean;
  canvasBackgroundColor: string;
  onGridSamplingSizeChange: (size: number) => void;
  onSizeJitterChange: (size: number) => void;
  onRotationJitterChange: (rotation: number) => void;
  onEnableFlipChange: (enabled: boolean) => void;
  onEnableMergeOptimizationChange: (enabled: boolean) => void;
  onCanvasBackgroundColorChange: (color: string) => void;
}

export function SettingsPanel({
  gridSamplingSize,
  sizeJitter,
  rotationJitter,
  enableFlip,
  enableMergeOptimization,
  canvasBackgroundColor,
  onGridSamplingSizeChange,
  onSizeJitterChange,
  onRotationJitterChange,
  onEnableFlipChange,
  onEnableMergeOptimizationChange,
  onCanvasBackgroundColorChange,
}: SettingsPanelProps) {
  return (
    <div className="mt-4 space-y-4">
      <h3 className="text-xs font-semibold text-zinc-300">采样精度</h3>
      <div className="mb-4">
        <label className="text-xs text-zinc-400 flex justify-between">
          <span>网格采样</span>
          <span>{gridSamplingSize}px</span>
        </label>
        <input
          type="range"
          min="5"
          max="30"
          step="1"
          value={gridSamplingSize}
          onChange={(e) => onGridSamplingSizeChange(Number(e.target.value))}
          className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
        />
        <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
          <span>精细</span>
          <span>粗糙</span>
        </div>
      </div>

      <h3 className="text-xs font-semibold text-zinc-300">笔触效果</h3>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-zinc-400 flex justify-between">
            <span>大小抖动</span>
            <span>{sizeJitter}</span>
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={sizeJitter}
            onChange={(e) => onSizeJitterChange(Number(e.target.value))}
            className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 flex justify-between">
            <span>旋转抖动</span>
            <span>{Math.round(rotationJitter)}°</span>
          </label>
          <input
            type="range"
            min="0"
            max="90"
            step="1"
            value={rotationJitter}
            onChange={(e) => onRotationJitterChange(Number(e.target.value))}
            className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={enableFlip}
            onChange={(e) => onEnableFlipChange(e.target.checked)}
            className="w-3 h-3 rounded border-zinc-600"
          />
          <span>随机翻转</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={enableMergeOptimization}
            onChange={(e) => onEnableMergeOptimizationChange(e.target.checked)}
            className="w-3 h-3 rounded border-zinc-600"
          />
          <span>笔触合并优化</span>
        </label>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-700">
          <span className="text-xs text-zinc-400">背景色</span>
          <input
            type="color"
            value={canvasBackgroundColor}
            onChange={(e) => onCanvasBackgroundColorChange(e.target.value)}
            className="w-6 h-6 rounded border border-zinc-600 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}