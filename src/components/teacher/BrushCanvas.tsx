'use client';

// Brush canvas component for single brush editing mode
import { BRUSH_SIZE } from './constants';
import { useEffect, useRef, useState } from 'react';

// Flash animation styles
const flashAnimation = `
@keyframes flash {
  0% { opacity: 0; }
  20% { opacity: 1; }
  100% { opacity: 0; }
}
.animate-flash {
  animation: flash 150ms ease-out;
}
`;

interface BrushCanvasProps {
  cameraStatus: 'idle' | 'viewing' | 'adjusting';
  singleBrushEditorRef: React.RefObject<HTMLCanvasElement | null>;
  cameraVideoRef: React.RefObject<HTMLVideoElement | null>;
  cameraPreviewRef: React.RefObject<HTMLCanvasElement | null>;
  cameraStream: MediaStream | null;
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
  onApplyAdjustments: () => void;
  onConfirmPhoto: () => void;
  onStartCameraCapture: () => void;
  onCancelCameraCapture: () => void;
  onTakePhoto: () => void;
  onCaptureAndSave: () => void;
  onCaptureAndDoodle: () => void;
  onSaveToLibrary: () => void;
  onSaveToBrushLibrary: () => void;
  onCancelEdit: () => void;
  onClearCanvas: () => void;
  flashTrigger?: number;
  handleEditingMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleEditingMouseMove: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleEditingMouseUp: () => void;
}

export function BrushCanvas({
  cameraStatus,
  singleBrushEditorRef,
  cameraVideoRef,
  cameraPreviewRef,
  cameraStream,
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
  onApplyAdjustments,
  onConfirmPhoto,
  onStartCameraCapture,
  onCancelCameraCapture,
  onTakePhoto,
  onCaptureAndSave,
  onCaptureAndDoodle,
  onSaveToLibrary,
  onSaveToBrushLibrary,
  onCancelEdit,
  onClearCanvas,
  handleEditingMouseDown,
  handleEditingMouseMove,
  handleEditingMouseUp,
  flashTrigger,
}: BrushCanvasProps) {
  // Flash effect state
  const [showFlash, setShowFlash] = useState(false);

  // Trigger flash animation when flashTrigger changes
  useEffect(() => {
    if (flashTrigger && flashTrigger > 0) {
      setShowFlash(true);
      const timer = setTimeout(() => setShowFlash(false), 150);
      return () => clearTimeout(timer);
    }
  }, [flashTrigger]);
  // Continuous render loop for viewing mode preview with adjustments
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (cameraStatus !== 'viewing') {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const video = cameraVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // When stream changes, ensure video is properly connected
    if (cameraStream && video.srcObject !== cameraStream) {
      video.srcObject = cameraStream;
      video.play().catch(() => {}); // Ensure video is playing
    }

    const render = () => {
      if (cameraStatus !== 'viewing') return;

      // Check if video is ready and has dimensions
      if (video.readyState >= 2 && video.videoWidth > 0) {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, 200, 200);

        // Get image data and apply adjustments
        const imageData = ctx.getImageData(0, 0, 200, 200);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          let r = data[i];
          let g = data[i + 1];
          let b = data[i + 2];

          // Apply brightness
          const brightnessFactor = imageBrightness / 100;
          r *= brightnessFactor;
          g *= brightnessFactor;
          b *= brightnessFactor;

          // Apply contrast
          const contrastFactor = imageContrast / 100;
          const contrastMid = 128;
          r = contrastMid + (r - contrastMid) * contrastFactor;
          g = contrastMid + (g - contrastMid) * contrastFactor;
          b = contrastMid + (b - contrastMid) * contrastFactor;

          // Apply saturation
          const saturationFactor = imageSaturation / 100;
          const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = gray + (r - gray) * saturationFactor;
          g = gray + (g - gray) * saturationFactor;
          b = gray + (b - gray) * saturationFactor;

          // Apply bg removal
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

        ctx.putImageData(imageData, 0, 0);
      } else if (video.readyState === 0 || video.videoWidth === 0) {
        // Video not ready yet, try to play and wait
        video.play().catch(() => {});
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    // Initial video setup
    if (cameraStream) {
      video.srcObject = cameraStream;
      video.play().catch(() => {});
    }

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [cameraStatus, cameraStream, imageBrightness, imageContrast, imageSaturation, removeWhiteBg, bgRemoveStrength]);

  // Render based on camera status
  if (cameraStatus === 'viewing') {
    return (
      <>
        <style>{flashAnimation}</style>
        <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-4">
        {/* Video preview with adjustments - rendered to canvas for real-time preview */}
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
          {/* Hidden video element for capturing frames */}
          <video
            ref={cameraVideoRef}
            autoPlay
            playsInline
            muted
            className="hidden"
          />
          {/* Visible canvas with real-time adjustments */}
          <canvas
            ref={previewCanvasRef}
            width={200}
            height={200}
            className="absolute inset-0 w-full h-full"
          />
          {/* Hidden preview canvas for capture */}
          <canvas ref={cameraPreviewRef} className="hidden" width={200} height={200} />
          {/* Flash effect overlay */}
          {showFlash && (
            <div
              className="absolute inset-0 bg-white animate-flash pointer-events-none"
              style={{ animationDuration: '150ms' }}
            />
          )}
        </div>
        {/* Adjustment sliders */}
        <div className="flex flex-col items-center gap-2 w-full max-w-md">
          <div className="flex items-center gap-4 w-full justify-center">
            <span className="text-xs text-zinc-500 w-12">亮度</span>
            <input type="range" min="0" max="200" value={imageBrightness} onChange={(e) => { onBrightnessChange(Number(e.target.value)); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageBrightness}%</span>
          </div>
          <div className="flex items-center gap-4 w-full justify-center">
            <span className="text-xs text-zinc-500 w-12">对比度</span>
            <input type="range" min="0" max="200" value={imageContrast} onChange={(e) => { onContrastChange(Number(e.target.value)); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageContrast}%</span>
          </div>
          <div className="flex items-center gap-4 w-full justify-center">
            <span className="text-xs text-zinc-500 w-12">饱和度</span>
            <input type="range" min="0" max="200" value={imageSaturation} onChange={(e) => { onSaturationChange(Number(e.target.value)); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageSaturation}%</span>
          </div>
          <div className="flex items-center gap-4 w-full justify-center">
            <span className="text-xs text-zinc-500 w-12">去背景</span>
            <input type="range" min="0" max="256" value={bgRemoveStrength} onChange={(e) => { onBgRemoveStrengthChange(Number(e.target.value)); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{bgRemoveStrength}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={onCaptureAndSave} className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium">拍摄并保存</button>
            <button onClick={onCaptureAndDoodle} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">拍照并涂鸦</button>
            <button onClick={onCancelCameraCapture} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">取消</button>
          </div>
        </div>
      </div>
      </div>
    </>
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
            <span className="text-xs text-zinc-500 w-12">亮度</span>
            <input type="range" min="0" max="200" value={imageBrightness} onChange={(e) => { onBrightnessChange(Number(e.target.value)); onApplyAdjustments(); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageBrightness}%</span>
          </div>
          <div className="flex items-center gap-4 w-full justify-center">
            <span className="text-xs text-zinc-500 w-12">对比度</span>
            <input type="range" min="0" max="200" value={imageContrast} onChange={(e) => { onContrastChange(Number(e.target.value)); onApplyAdjustments(); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageContrast}%</span>
          </div>
          <div className="flex items-center gap-4 w-full justify-center">
            <span className="text-xs text-zinc-500 w-12">饱和度</span>
            <input type="range" min="0" max="200" value={imageSaturation} onChange={(e) => { onSaturationChange(Number(e.target.value)); onApplyAdjustments(); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{imageSaturation}%</span>
          </div>
          <div className="flex items-center gap-4 w-full justify-center">
            <span className="text-xs text-zinc-500 w-12">去背景</span>
            <input type="range" min="0" max="256" value={bgRemoveStrength} onChange={(e) => { onBgRemoveStrengthChange(Number(e.target.value)); onApplyAdjustments(); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
            <span className="text-xs text-zinc-400 w-10">{bgRemoveStrength}</span>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={onConfirmPhoto} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">应用到画布</button>
            <button onClick={onSaveToBrushLibrary} className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium">保存到笔刷库</button>
          </div>
        </div>
      </div>
    );
  }

  // Doodle mode (idle)
  return (
    <>
      <style>{flashAnimation}</style>
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
        {/* Flash effect overlay */}
        {showFlash && (
          <div
            className="absolute inset-0 bg-white animate-flash pointer-events-none"
            style={{ animationDuration: '150ms' }}
          />
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onClearCanvas} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">清除</button>
        <button onClick={onSaveToLibrary} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs">保存到笔刷库</button>
        <button onClick={onCancelEdit} className="px-4 py-2 bg-zinc-600 hover:bg-zinc-500 rounded text-xs">取消</button>
      </div>
    </div>
    </>
  );
}