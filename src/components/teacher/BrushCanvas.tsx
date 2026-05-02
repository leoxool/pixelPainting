'use client';

// Brush canvas component for single brush editing mode
import { BRUSH_SIZE } from './constants';

interface BrushCanvasProps {
  cameraStatus: 'idle' | 'viewing' | 'adjusting';
  singleBrushEditorRef: React.RefObject<HTMLCanvasElement | null>;
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>;
  cameraPreviewRef: React.RefObject<HTMLCanvasElement | null>;
  adjustmentPreviewRef: React.RefObject<HTMLCanvasElement | null>;
  editingOriginalImageRef: React.RefObject<ImageData | null>;
  removeWhiteBg: boolean;
  bgRemoveStrength: number;
  imageBrightness: number;
  imageContrast: number;
  imageSaturation: number;
  onRemoveWhiteBgChange: (checked: boolean) => void;
  onBgRemoveStrengthChange: (value: number) => void;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  onSaturationChange: (value: number) => void;
  onConfirmPhoto: () => void;
  onStartCameraCapture: () => void;
  onCancelCameraCapture: () => void;
  onTakePhoto: () => void;
  onSaveToLibrary: () => void;
  onClearCanvas: () => void;
  handleEditingMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleEditingMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleEditingMouseUp: () => void;
}

export function BrushCanvas({
  cameraStatus,
  singleBrushEditorRef,
  cameraVideoRef,
  cameraPreviewRef,
  adjustmentPreviewRef,
  editingOriginalImageRef,
  removeWhiteBg,
  bgRemoveStrength,
  imageBrightness,
  imageContrast,
  imageSaturation,
  onRemoveWhiteBgChange,
  onBgRemoveStrengthChange,
  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
  onConfirmPhoto,
  onStartCameraCapture,
  onCancelCameraCapture,
  onTakePhoto,
  onSaveToLibrary,
  onClearCanvas,
  handleEditingMouseDown,
  handleEditingMouseMove,
  handleEditingMouseUp,
}: BrushCanvasProps) {
  // Render based on camera status
  if (cameraStatus === 'viewing' && cameraVideoRef.current) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-[400px] h-[400px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900">
          <video
            ref={cameraVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-contain"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onTakePhoto} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium">拍摄</button>
          <button onClick={onCancelCameraCapture} className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">取消</button>
        </div>
      </div>
    );
  }

  if (cameraStatus === 'adjusting') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-[400px] h-[400px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #808080 25%, transparent 25%),
              linear-gradient(-45deg, #808080 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #808080 75%),
              linear-gradient(-45deg, transparent 75%, #808080 75%)
            `,
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            backgroundColor: '#c0c0c0'
          }}
        >
          <canvas
            ref={adjustmentPreviewRef}
            width={400}
            height={400}
            className="absolute inset-0 w-full h-full"
          />
        </div>
        <div className="flex flex-col items-center gap-2 w-full max-w-md">
          <div className="flex items-center gap-4 w-full justify-center">
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={removeWhiteBg} onChange={(e) => { onRemoveWhiteBgChange(e.target.checked); }} className="w-3 h-3" />
              去背景
            </label>
            <span className="text-xs text-zinc-500 w-12">亮度</span>
            <input type="range" min="0" max="200" value={imageBrightness} onChange={(e) => { onBrightnessChange(Number(e.target.value)); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageBrightness}%</span>
          </div>
          {removeWhiteBg && (
            <div className="flex items-center gap-4 w-full justify-center">
              <div className="w-24" />
              <span className="text-xs text-zinc-500 w-12">强度</span>
              <input type="range" min="0" max="255" value={bgRemoveStrength} onChange={(e) => { onBgRemoveStrengthChange(Number(e.target.value)); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
              <span className="text-xs text-zinc-400 w-10">{bgRemoveStrength}</span>
            </div>
          )}
          <div className="flex items-center gap-4 w-full justify-center">
            <div className="w-16" />
            <span className="text-xs text-zinc-500 w-12">对比度</span>
            <input type="range" min="0" max="200" value={imageContrast} onChange={(e) => { onContrastChange(Number(e.target.value)); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageContrast}%</span>
          </div>
          <div className="flex items-center gap-4 w-full justify-center">
            <div className="w-16" />
            <span className="text-xs text-zinc-500 w-12">饱和度</span>
            <input type="range" min="0" max="200" value={imageSaturation} onChange={(e) => { onSaturationChange(Number(e.target.value)); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageSaturation}%</span>
          </div>
          <button onClick={onConfirmPhoto} className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">应用到画布</button>
        </div>
      </div>
    );
  }

  // Doodle mode (idle)
  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="w-[400px] h-[400px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #808080 25%, transparent 25%),
            linear-gradient(-45deg, #808080 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #808080 75%),
            linear-gradient(-45deg, transparent 75%, #808080 75%)
          `,
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          backgroundColor: '#c0c0c0'
        }}
      >
        <canvas
          id="single-editor-canvas"
          ref={singleBrushEditorRef}
          width={400}
          height={400}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onMouseDown={handleEditingMouseDown}
          onMouseMove={handleEditingMouseMove}
          onMouseUp={handleEditingMouseUp}
          onMouseLeave={handleEditingMouseUp}
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onClearCanvas} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">清除</button>
        <button onClick={onSaveToLibrary} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs">保存到画笔库</button>
      </div>
    </div>
  );
}