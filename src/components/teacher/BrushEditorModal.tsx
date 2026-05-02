'use client';

// Brush editor modal for editing individual brush layers
import { useEffect } from 'react';
const BRUSH_SIZE = 200;
type BrushMode = 'draw' | 'erase';
type CameraStatus = 'idle' | 'viewing' | 'adjusting';
interface BrushLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  isDrawing: boolean;
}

const COLORS = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#808080', '#c0c0c0'];

interface BrushEditorModalProps {
  editingBrushIndex: number;
  editingBrushCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  editingLayerIndexRef: React.RefObject<number | null>;
  editingOriginalImageRef: React.RefObject<ImageData | null>;
  editingSnapshotRef: React.RefObject<ImageData | null>;
  cameraStream: MediaStream | null;
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>;
  cameraPreviewRef: React.RefObject<HTMLCanvasElement | null>;
  adjustmentPreviewRef: React.RefObject<HTMLCanvasElement | null>;
  cameraStatus: CameraStatus;
  brushMode: BrushMode;
  brushSize: number;
  brushOpacity: number;
  brushColor: string;
  removeWhiteBg: boolean;
  bgRemoveStrength: number;
  imageBrightness: number;
  imageContrast: number;
  imageSaturation: number;
  colorInputRef: React.RefObject<HTMLInputElement | null>;
  brushLayersRef: React.RefObject<(BrushLayer | null)[]>;
  onBrushModeChange: (mode: BrushMode) => void;
  onBrushSizeChange: (size: number) => void;
  onBrushOpacityChange: (opacity: number) => void;
  onBrushColorChange: (color: string) => void;
  onRemoveWhiteBgChange: (checked: boolean) => void;
  onBgRemoveStrengthChange: (value: number) => void;
  onBrightnessChange: (value: number) => void;
  onContrastChange: (value: number) => void;
  onSaturationChange: (value: number) => void;
  onStartCameraCapture: () => void;
  onCancelCameraCapture: () => void;
  onTakePhoto: () => void;
  onConfirmPhoto: () => void;
  onClose: () => void;
  onSave: () => void;
  handleEditingMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleEditingMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleEditingMouseUp: () => void;
}

export function BrushEditorModal({
  editingBrushIndex,
  editingBrushCanvasRef,
  editingLayerIndexRef,
  editingOriginalImageRef,
  editingSnapshotRef,
  cameraStream,
  cameraVideoRef,
  cameraPreviewRef,
  adjustmentPreviewRef,
  cameraStatus,
  brushMode,
  brushSize,
  brushOpacity,
  brushColor,
  removeWhiteBg,
  bgRemoveStrength,
  imageBrightness,
  imageContrast,
  imageSaturation,
  colorInputRef,
  brushLayersRef,
  onBrushModeChange,
  onBrushSizeChange,
  onBrushOpacityChange,
  onBrushColorChange,
  onRemoveWhiteBgChange,
  onBgRemoveStrengthChange,
  onBrightnessChange,
  onContrastChange,
  onSaturationChange,
  onStartCameraCapture,
  onCancelCameraCapture,
  onTakePhoto,
  onConfirmPhoto,
  onClose,
  onSave,
  handleEditingMouseDown,
  handleEditingMouseMove,
  handleEditingMouseUp,
}: BrushEditorModalProps) {
  // Apply image adjustments when values change
  useEffect(() => {
    if (cameraStatus !== 'adjusting' || !editingOriginalImageRef.current || !adjustmentPreviewRef.current) return;

    const previewCanvas = adjustmentPreviewRef.current;
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const originalData = editingOriginalImageRef.current;
    const imageData = new ImageData(
      new Uint8ClampedArray(originalData.data),
      originalData.width,
      originalData.height
    );
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const brightnessFactor = imageBrightness / 100;
      r *= brightnessFactor;
      g *= brightnessFactor;
      b *= brightnessFactor;

      const contrastFactor = imageContrast / 100;
      const contrastMid = 128;
      r = contrastMid + (r - contrastMid) * contrastFactor;
      g = contrastMid + (g - contrastMid) * contrastFactor;
      b = contrastMid + (b - contrastMid) * contrastFactor;

      const saturationFactor = imageSaturation / 100;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + (r - gray) * saturationFactor;
      g = gray + (g - gray) * saturationFactor;
      b = gray + (b - gray) * saturationFactor;

      if (removeWhiteBg) {
        const minComponent = Math.min(r, g, b);
        if (minComponent >= bgRemoveStrength) {
          const range = 255 - bgRemoveStrength;
          const excess = (r + g + b) / 3 - bgRemoveStrength;
          data[i + 3] = Math.max(0, Math.min(255, 255 - excess * (255 / range)));
        }
      }

      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    ctx.clearRect(0, 0, 400, 400);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = BRUSH_SIZE;
    tempCanvas.height = BRUSH_SIZE;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, 400, 400);
    }
  }, [imageBrightness, imageContrast, imageSaturation, removeWhiteBg, bgRemoveStrength, cameraStatus]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div className="bg-zinc-800 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h3 className="font-semibold text-sm">笔触 - Level {editingBrushIndex}</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-700 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Content: Canvas + Function Area */}
        <div className="flex">
          {/* Left: Brush Canvas - Larger and centered */}
          <div className="p-4 flex items-center justify-center" style={{ width: '440px', height: '440px' }}>
            <div className="w-[400px] h-[400px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900">
              {/* Checkerboard pattern for transparency */}
              <div
                className="absolute inset-0"
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
              />
              <canvas
                ref={editingBrushCanvasRef}
                width={400}
                height={400}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                onMouseDown={handleEditingMouseDown}
                onMouseMove={handleEditingMouseMove}
                onMouseUp={handleEditingMouseUp}
                onMouseLeave={handleEditingMouseUp}
              />
            </div>
          </div>

          {/* Right: Function Area */}
          <div className="p-4 pl-0 border-l border-zinc-700 w-[200px] flex flex-col">
            {/* Tab Toggle Buttons - Tab style */}
            <div className="flex border-b border-zinc-600 mb-3">
              <button
                onClick={() => {
                  if (cameraStatus !== 'idle') {
                    onCancelCameraCapture();
                  }
                }}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  cameraStatus === 'idle'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                涂鸦
              </button>
              <button
                onClick={() => {
                  if (cameraStatus === 'idle') {
                    onStartCameraCapture();
                  }
                }}
                className={`px-4 py-2 text-xs font-medium transition-colors ${
                  cameraStatus !== 'idle'
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                拍摄
              </button>
            </div>

            {/* 涂鸦状态: 画笔工具 */}
            {cameraStatus === 'idle' && (
              <div className="space-y-3 flex-1">
                {/* Brush/Eraser */}
                <div className="flex gap-1">
                  <button
                    onClick={() => onBrushModeChange('draw')}
                    className={`flex-1 px-2 py-1.5 rounded text-xs ${brushMode === 'draw' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                  >
                    画笔
                  </button>
                  <button
                    onClick={() => onBrushModeChange('erase')}
                    className={`flex-1 px-2 py-1.5 rounded text-xs ${brushMode === 'erase' ? 'bg-red-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                  >
                    橡皮
                  </button>
                </div>

                {/* Size slider */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>笔刷大小</span>
                    <span>{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="40"
                    value={brushSize}
                    onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                    className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer"
                  />
                </div>

                {/* Opacity slider */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>透明度</span>
                    <span>{brushOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    value={brushOpacity}
                    onChange={(e) => onBrushOpacityChange(Number(e.target.value))}
                    className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer"
                  />
                </div>

                {/* Color Palette - 2 rows */}
                <div>
                  <span className="text-xs text-zinc-400 block mb-2">取色色盘</span>
                  <div className="grid grid-cols-5 gap-1">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => onBrushColorChange(color)}
                        className={`w-7 h-7 rounded border-2 ${brushColor === color ? 'border-white' : 'border-transparent'} hover:scale-110 transition-transform`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {/* Color preview - direct color input replaces preview */}
                <div className="flex items-center gap-2">
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={brushColor}
                    onChange={(e) => onBrushColorChange(e.target.value)}
                    className="w-10 h-10 rounded border-2 border-zinc-400 cursor-pointer"
                    title="选择颜色"
                  />
                </div>

                {/* Clear button */}
                <button
                  onClick={() => {
                    if (editingBrushCanvasRef.current) {
                      const ctx = editingBrushCanvasRef.current.getContext('2d');
                      if (ctx) ctx.clearRect(0, 0, 400, 400);
                    }
                  }}
                  className="w-full px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
                >
                  清除画面
                </button>
              </div>
            )}

            {/* 拍摄状态 - 取景器 */}
            {cameraStatus === 'viewing' && cameraStream && (
              <div className="flex-1 flex flex-col">
                <div className="w-[180px] h-[180px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900 mb-3">
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                  <canvas ref={cameraPreviewRef} className="hidden" />
                </div>
                <div className="flex gap-2 mt-auto">
                  <button
                    onClick={onTakePhoto}
                    className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium text-white"
                  >
                    拍摄
                  </button>
                  <button
                    onClick={onCancelCameraCapture}
                    className="flex-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-white"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* 拍摄状态 - 图像调整 */}
            {cameraStatus === 'adjusting' && (
              <div className="space-y-3 flex-1">
                <div className="text-xs text-zinc-400 mb-2">图像调整</div>

                {/* 去背景 */}
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeWhiteBg}
                    onChange={(e) => { onRemoveWhiteBgChange(e.target.checked); }}
                    className="w-3 h-3 rounded border-zinc-500"
                  />
                  <span>去背景</span>
                </label>
                {removeWhiteBg && (
                  <div className="pl-5">
                    <span className="text-xs text-zinc-500">阈值: {bgRemoveStrength}</span>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={bgRemoveStrength}
                      onChange={(e) => { onBgRemoveStrengthChange(Number(e.target.value)); }}
                      className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                    />
                  </div>
                )}

                {/* 亮度 */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>亮度</span>
                    <span>{imageBrightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={imageBrightness}
                    onChange={(e) => { onBrightnessChange(Number(e.target.value)); }}
                    className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                  />
                </div>

                {/* 对比度 */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>对比度</span>
                    <span>{imageContrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={imageContrast}
                    onChange={(e) => { onContrastChange(Number(e.target.value)); }}
                    className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                  />
                </div>

                {/* 饱和度 */}
                <div>
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>饱和度</span>
                    <span>{imageSaturation}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={imageSaturation}
                    onChange={(e) => { onSaturationChange(Number(e.target.value)); }}
                    className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                  />
                </div>

                {/* 确认按钮 */}
                <button
                  onClick={onConfirmPhoto}
                  className="w-full mt-auto px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium text-white"
                >
                  确定
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer: Save/Cancel buttons */}
        <div className="px-4 py-3 border-t border-zinc-700 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}