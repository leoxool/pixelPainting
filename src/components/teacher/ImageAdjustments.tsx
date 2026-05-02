'use client';

// Image adjustment controls component
const BRUSH_SIZE = 200;

interface ImageAdjustmentsProps {
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
  onConfirm: () => void;
  previewRef: React.RefObject<HTMLCanvasElement | null>;
  editingOriginalImageRef: React.RefObject<ImageData | null>;
}

export function ImageAdjustments({
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
  onConfirm,
  previewRef,
  editingOriginalImageRef,
}: ImageAdjustmentsProps) {
  const applyImageAdjustments = () => {
    if (!editingOriginalImageRef.current || !previewRef.current) return;

    const previewCanvas = previewRef.current;
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

      // 1. Brightness (0-200, 100 default)
      const brightnessFactor = imageBrightness / 100;
      r *= brightnessFactor;
      g *= brightnessFactor;
      b *= brightnessFactor;

      // 2. Contrast (0-200, 100 default)
      const contrastFactor = imageContrast / 100;
      const contrastMid = 128;
      r = contrastMid + (r - contrastMid) * contrastFactor;
      g = contrastMid + (g - contrastMid) * contrastFactor;
      b = contrastMid + (b - contrastMid) * contrastFactor;

      // 3. Saturation (0-200, 100 default)
      const saturationFactor = imageSaturation / 100;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + (r - gray) * saturationFactor;
      g = gray + (g - gray) * saturationFactor;
      b = gray + (b - gray) * saturationFactor;

      // 4. White background removal
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
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Preview canvas with adjustments applied */}
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
          ref={previewRef}
          width={400}
          height={400}
          className="absolute inset-0 w-full h-full"
        />
      </div>
      {/* Adjustment controls */}
      <div className="flex flex-col items-center gap-2 w-full max-w-md">
        <div className="flex items-center gap-4 w-full justify-center">
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={removeWhiteBg}
              onChange={(e) => { onRemoveWhiteBgChange(e.target.checked); applyImageAdjustments(); }}
              className="w-3 h-3"
            />
            去背景
          </label>
          <span className="text-xs text-zinc-500 w-12">亮度</span>
          <input
            type="range"
            min="0"
            max="200"
            value={imageBrightness}
            onChange={(e) => { onBrightnessChange(Number(e.target.value)); applyImageAdjustments(); }}
            className="w-24 h-1 bg-zinc-700 rounded cursor-pointer"
          />
          <span className="text-xs text-zinc-400 w-10">{imageBrightness}%</span>
        </div>
        {removeWhiteBg && (
          <div className="flex items-center gap-4 w-full justify-center">
            <div className="w-24" />
            <span className="text-xs text-zinc-500 w-12">强度</span>
            <input
              type="range"
              min="0"
              max="255"
              value={bgRemoveStrength}
              onChange={(e) => { onBgRemoveStrengthChange(Number(e.target.value)); applyImageAdjustments(); }}
              className="w-24 h-1 bg-zinc-700 rounded cursor-pointer"
            />
            <span className="text-xs text-zinc-400 w-10">{bgRemoveStrength}</span>
          </div>
        )}
        <div className="flex items-center gap-4 w-full justify-center">
          <div className="w-16" />
          <span className="text-xs text-zinc-500 w-12">对比度</span>
          <input
            type="range"
            min="0"
            max="200"
            value={imageContrast}
            onChange={(e) => { onContrastChange(Number(e.target.value)); applyImageAdjustments(); }}
            className="w-24 h-1 bg-zinc-700 rounded cursor-pointer"
          />
          <span className="text-xs text-zinc-400 w-10">{imageContrast}%</span>
        </div>
        <div className="flex items-center gap-4 w-full justify-center">
          <div className="w-16" />
          <span className="text-xs text-zinc-500 w-12">饱和度</span>
          <input
            type="range"
            min="0"
            max="200"
            value={imageSaturation}
            onChange={(e) => { onSaturationChange(Number(e.target.value)); applyImageAdjustments(); }}
            className="w-24 h-1 bg-zinc-700 rounded cursor-pointer"
          />
          <span className="text-xs text-zinc-400 w-10">{imageSaturation}%</span>
        </div>
        <button
          onClick={onConfirm}
          className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
        >
          应用到画布
        </button>
      </div>
    </div>
  );
}