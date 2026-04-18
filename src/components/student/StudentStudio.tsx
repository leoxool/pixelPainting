'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type BrushMode = 'draw' | 'erase';

interface BrushLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  isDrawing: boolean;
}

interface BrushPreset {
  id: string;
  name: string;
  timestamp: number;
  layers: (string | null)[];
  submitted?: boolean;
}

interface StudentStudioProps {
  roomId: string;
  userId: string;
}

// Component to sync display canvases with actual brush canvases
function SyncDisplayCanvases({ trigger, brushLayers }: { trigger: number; brushLayers: (BrushLayer | null)[] }) {
  useEffect(() => {
    for (let i = 0; i < 10; i++) {
      const displayCanvas = document.getElementById(`brush-display-canvas-${i}`) as HTMLCanvasElement;
      const layer = brushLayers[i];
      if (displayCanvas && layer?.canvas) {
        const ctx = displayCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 100, 100);
          ctx.drawImage(layer.canvas, 0, 0);
        }
      }
    }
  }, [trigger, brushLayers]);
  return null;
}

export function StudentStudio({ roomId, userId }: StudentStudioProps) {
  const [brushSize, setBrushSize] = useState(10);
  const [brushMode, setBrushMode] = useState<BrushMode>('draw');
  const [editingBrushIndex, setEditingBrushIndex] = useState<number | null>(null);
  const [brushColor, setBrushColor] = useState('#000000');
  // 笔刷库
  const [brushPresets, setBrushPresets] = useState<BrushPreset[]>([]);
  const [currentPresetName, setCurrentPresetName] = useState('未命名');
  // 摄像头相关状态
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  // 拍摄状态：'idle' | 'viewing' | 'adjusting'
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'viewing' | 'adjusting'>('idle');
  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [bgRemoveStrength, setBgRemoveStrength] = useState(128);
  const [imageContrast, setImageContrast] = useState(100);
  const [imageBrightness, setImageBrightness] = useState(100);
  const [imageSaturation, setImageSaturation] = useState(100);
  const [showBrushLibrary, setShowBrushLibrary] = useState(false);
  // 用于触发笔刷缩略图更新
  const [brushUpdateTrigger, setBrushUpdateTrigger] = useState(0);
  // 提交状态
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = createClient();

  const brushCanvasesRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const brushLayersRef = useRef<(BrushLayer | null)[]>(Array(10).fill(null));

  const editingBrushCanvasRef = useRef<HTMLCanvasElement>(null);
  const editingLayerIndexRef = useRef<number | null>(null);
  const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
  const editingOriginalImageRef = useRef<ImageData | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraPreviewRef = useRef<HTMLCanvasElement>(null);
  const editingSnapshotRef = useRef<ImageData | null>(null);

  // 笔刷库：从 localStorage 加载
  const loadBrushPresets = useCallback(() => {
    try {
      const saved = localStorage.getItem('studentBrushPresets');
      if (saved) {
        setBrushPresets(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load brush presets:', e);
    }
  }, []);

  // 保存笔刷库到 localStorage
  const saveBrushPresets = useCallback((presets: BrushPreset[]) => {
    try {
      localStorage.setItem('studentBrushPresets', JSON.stringify(presets));
      setBrushPresets(presets);
    } catch (e) {
      console.error('Failed to save brush presets:', e);
    }
  }, []);

  // 保存当前笔刷套图为预设
  const saveCurrentBrushAsPreset = useCallback((name: string) => {
    if (brushPresets.length >= 10) {
      alert('笔刷库已满（10套），请先删除一套再保存');
      return;
    }
    const layers: (string | null)[] = [];
    for (let i = 0; i < 10; i++) {
      const layer = brushLayersRef.current[i];
      if (layer?.canvas) {
        layers.push(layer.canvas.toDataURL('image/png'));
      } else {
        layers.push(null);
      }
    }
    const newPreset: BrushPreset = {
      id: Date.now().toString(),
      name,
      timestamp: Date.now(),
      layers,
    };
    const updated = [...brushPresets, newPreset];
    saveBrushPresets(updated);
    setCurrentPresetName(name);
  }, [brushPresets, saveBrushPresets]);

  // 加载预设到当前画布
  const loadPresetToCanvas = useCallback((preset: BrushPreset) => {
    const loadPromises = preset.layers.map((dataUrl, index) => {
      return new Promise<void>((resolve) => {
        if (!dataUrl) {
          const canvas = brushCanvasesRef.current[index];
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, 100, 100);
          }
          brushLayersRef.current[index] = null;
          resolve();
          return;
        }
        const img = new Image();
        img.onload = () => {
          const canvas = brushCanvasesRef.current[index];
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, 100, 100);
              ctx.drawImage(img, 0, 0, 100, 100);
              brushLayersRef.current[index] = { canvas, ctx, isDrawing: false };
            }
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = dataUrl;
      });
    });
    Promise.all(loadPromises).then(() => {
      setBrushUpdateTrigger(t => t + 1);
      setCurrentPresetName(preset.name);
    });
  }, []);

  // 删除预设
  const deletePreset = useCallback((id: string) => {
    const updated = brushPresets.filter(p => p.id !== id);
    saveBrushPresets(updated);
  }, [brushPresets, saveBrushPresets]);

  // 初始化笔触图层 (透明背景)
  const initBrushLayer = useCallback((index: number) => {
    const canvas = brushCanvasesRef.current[index];
    if (!canvas) return;
    if (brushLayersRef.current[index] && brushLayersRef.current[index].canvas === canvas) return;
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 100, 100);
      brushLayersRef.current[index] = { canvas, ctx, isDrawing: false };
    }
  }, []);

  // 初始化
  useEffect(() => {
    brushCanvasesRef.current.forEach((_, index) => {
      initBrushLayer(index);
    });
  }, [initBrushLayer]);

  // 加载笔刷库
  useEffect(() => {
    loadBrushPresets();
  }, [loadBrushPresets]);

  // 更新摄像头 video ref
  useEffect(() => {
    if (cameraVideoRef.current && cameraStream) {
      cameraVideoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // 更新摄像头预览
  const updateCameraPreview = useCallback(() => {
    if (!cameraStream || !cameraVideoRef.current || !cameraPreviewRef.current) return;

    const video = cameraVideoRef.current;
    const previewCanvas = cameraPreviewRef.current;
    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    previewCanvas.width = 200;
    previewCanvas.height = 200;
    ctx.drawImage(video, 0, 0, 200, 200);

    if (removeWhiteBg) {
      const imageData = ctx.getImageData(0, 0, 200, 200);
      const data = imageData.data;
      const threshold = bgRemoveStrength;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r >= threshold && g >= threshold && b >= threshold) {
          const avg = (r + g + b) / 3;
          const alpha = Math.min(255, Math.max(0, (avg - threshold) * 16));
          data[i + 3] = alpha;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }, [cameraStream, removeWhiteBg, bgRemoveStrength]);

  useEffect(() => {
    if (cameraStatus === 'viewing' && cameraStream) {
      updateCameraPreview();
    }
  }, [cameraStatus, cameraStream, removeWhiteBg, bgRemoveStrength, updateCameraPreview]);

  const getLevelGray = (level: number): string => {
    const gray = Math.floor(level * 25.5);
    return `rgb(${gray}, ${gray}, ${gray})`;
  };

  // 启动摄像头拍摄
  const startCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 200, height: 200, facingMode: 'environment' }
      });
      setCameraStream(stream);
      setCameraStatus('viewing');
    } catch (err) {
      console.error('Camera error:', err);
      alert('无法访问摄像头');
    }
  };

  // 取消摄像头拍摄
  const cancelCameraCapture = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraStatus('idle');
    editingOriginalImageRef.current = null;
  };

  // 拍摄照片（捕获后进入调整状态）
  const takePhoto = () => {
    if (!cameraVideoRef.current || editingBrushIndex === null) return;

    const video = cameraVideoRef.current;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 100;
    tempCanvas.height = 100;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    tempCtx.drawImage(video, 0, 0, 100, 100);
    editingOriginalImageRef.current = tempCtx.getImageData(0, 0, 100, 100);

    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }

    setCameraStatus('adjusting');
    applyImageAdjustments();
  };

  // 确认拍摄结果
  const confirmPhoto = () => {
    if (editingBrushIndex === null || !editingOriginalImageRef.current) return;

    const canvas = brushCanvasesRef.current[editingBrushIndex];
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
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
      r = r * brightnessFactor;
      g = g * brightnessFactor;
      b = b * brightnessFactor;

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

    ctx.putImageData(imageData, 0, 0);
    brushLayersRef.current[editingBrushIndex] = { canvas, ctx, isDrawing: false };

    const editorCanvas = editingBrushCanvasRef.current;
    if (editorCanvas) {
      const editorCtx = editorCanvas.getContext('2d');
      if (editorCtx) {
        editorCtx.clearRect(0, 0, 400, 400);
        editorCtx.drawImage(canvas, 0, 0, 400, 400);
      }
    }

    setRemoveWhiteBg(false);
    setBgRemoveStrength(128);
    setImageBrightness(100);
    setImageContrast(100);
    setImageSaturation(100);

    setCameraStatus('idle');
    editingOriginalImageRef.current = null;

    setBrushUpdateTrigger(t => t + 1);
  };

  // 应用图像调整
  const applyImageAdjustments = useCallback(() => {
    if (editingBrushIndex === null || !editingOriginalImageRef.current) return;

    const originalData = editingOriginalImageRef.current;
    const canvas = brushCanvasesRef.current[editingBrushIndex];
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
      r = r * brightnessFactor;
      g = g * brightnessFactor;
      b = b * brightnessFactor;

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

    ctx.putImageData(imageData, 0, 0);
    brushLayersRef.current[editingBrushIndex] = { canvas, ctx, isDrawing: false };

    const editorCanvas = editingBrushCanvasRef.current;
    if (editorCanvas) {
      const editorCtx = editorCanvas.getContext('2d');
      if (editorCtx) {
        editorCtx.clearRect(0, 0, 400, 400);
        editorCtx.drawImage(canvas, 0, 0, 400, 400);
      }
    }
  }, [editingBrushIndex, removeWhiteBg, bgRemoveStrength, imageBrightness, imageContrast, imageSaturation]);

  const openBrushEditor = (index: number) => {
    editingLayerIndexRef.current = index;
    setEditingBrushIndex(index);
    setBrushColor('#000000');

    const layer = brushLayersRef.current[index];
    if (layer) {
      editingSnapshotRef.current = layer.ctx.getImageData(0, 0, 100, 100);
    } else {
      editingSnapshotRef.current = null;
    }

    setTimeout(() => {
      const editorCanvas = editingBrushCanvasRef.current;
      const layer = brushLayersRef.current[index];
      if (editorCanvas && layer) {
        const ctx = editorCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 400, 400);
          ctx.drawImage(layer.canvas, 0, 0, 100, 100, 0, 0, 400, 400);
        }
      }
    }, 50);
  };

  const closeBrushEditor = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraStatus('idle');

    const index = editingLayerIndexRef.current;
    if (index !== null && editingSnapshotRef.current) {
      const layer = brushLayersRef.current[index];
      if (layer) {
        layer.ctx.putImageData(editingSnapshotRef.current, 0, 0);
      }
    }
    editingSnapshotRef.current = null;
    editingOriginalImageRef.current = null;

    setRemoveWhiteBg(false);
    setBgRemoveStrength(128);
    setImageBrightness(100);
    setImageContrast(100);
    setImageSaturation(100);

    editingLayerIndexRef.current = null;
    setEditingBrushIndex(null);
    setBrushUpdateTrigger(t => t + 1);
  };

  const saveBrushEditor = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraStatus('idle');

    const editorCanvas = editingBrushCanvasRef.current;
    const index = editingLayerIndexRef.current;
    if (editorCanvas && index !== null) {
      const layer = brushLayersRef.current[index];
      if (layer) {
        layer.ctx.clearRect(0, 0, 100, 100);
        layer.ctx.drawImage(editorCanvas, 0, 0, 100, 100);
      }
    }
    editingSnapshotRef.current = null;
    editingOriginalImageRef.current = null;

    setRemoveWhiteBg(false);
    setBgRemoveStrength(128);
    setImageBrightness(100);
    setImageContrast(100);
    setImageSaturation(100);

    editingLayerIndexRef.current = null;
    setEditingBrushIndex(null);
    setBrushUpdateTrigger(t => t + 1);
  };

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const handleEditingMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const editorCanvas = editingBrushCanvasRef.current;
    const index = editingLayerIndexRef.current;
    if (!editorCanvas || index === null) return;
    const layer = brushLayersRef.current[index];
    if (!layer) return;
    layer.isDrawing = true;
    const { x, y } = getCanvasCoords(e, editorCanvas);
    const scale = 100 / 400;
    const editorCtx = editorCanvas.getContext('2d');
    lastDrawPosRef.current = { x, y };

    const draw = (ctx: CanvasRenderingContext2D, px: number, py: number, lastX?: number, lastY?: number) => {
      if (brushMode === 'draw') {
        ctx.fillStyle = brushColor;
        ctx.beginPath();
        if (lastX !== undefined && lastY !== undefined) {
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        ctx.arc(px, py, brushSize, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        if (lastX !== undefined && lastY !== undefined) {
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        ctx.arc(px, py, brushSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    if (editorCtx) draw(editorCtx, x, y);
    draw(layer.ctx, x * scale, y * scale);
  };

  const handleEditingMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const editorCanvas = editingBrushCanvasRef.current;
    const index = editingLayerIndexRef.current;
    if (!editorCanvas || index === null) return;
    const layer = brushLayersRef.current[index];
    if (!layer || !layer.isDrawing) return;
    const { x, y } = getCanvasCoords(e, editorCanvas);
    const scale = 100 / 400;
    const editorCtx = editorCanvas.getContext('2d');
    const lastPos = lastDrawPosRef.current;

    const draw = (ctx: CanvasRenderingContext2D, px: number, py: number, lastX?: number, lastY?: number) => {
      if (brushMode === 'draw') {
        ctx.fillStyle = brushColor;
        ctx.beginPath();
        if (lastX !== undefined && lastY !== undefined) {
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(px, py);
          ctx.strokeStyle = brushColor;
          ctx.lineWidth = brushSize * 2;
          ctx.stroke();
        }
        ctx.arc(px, py, brushSize, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        if (lastX !== undefined && lastY !== undefined) {
          ctx.moveTo(lastX, lastY);
          ctx.lineTo(px, py);
          ctx.lineWidth = brushSize * 2;
          ctx.stroke();
        }
        ctx.arc(px, py, brushSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    if (editorCtx) draw(editorCtx, x, y, lastPos?.x, lastPos?.y);
    draw(layer.ctx, x * scale, y * scale, lastPos ? lastPos.x * scale : undefined, lastPos ? lastPos.y * scale : undefined);
    lastDrawPosRef.current = { x, y };
  };

  const handleEditingMouseUp = () => {
    const index = editingLayerIndexRef.current;
    if (index !== null) {
      const layer = brushLayersRef.current[index];
      if (layer) layer.isDrawing = false;
    }
    lastDrawPosRef.current = null;
  };

  const resetAllBrushes = () => {
    brushLayersRef.current.forEach((layer) => {
      if (layer) layer.ctx.clearRect(0, 0, 100, 100);
    });
    setBrushUpdateTrigger(t => t + 1);
  };

  // 提交作品（从预设提交）
  const submitArtwork = async (preset: BrushPreset) => {
    setIsSubmitting(true);

    try {
      // 创建 1000x100 的笔刷条带图
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot create canvas context');

      await Promise.all(preset.layers.map((layerData, i) => {
        return new Promise<void>((resolve) => {
          if (layerData) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              ctx.drawImage(img, i * 100, 0, 100, 100);
              resolve();
            };
            img.onerror = () => {
              ctx.fillStyle = '#808080';
              ctx.fillRect(i * 100, 0, 100, 100);
              resolve();
            };
            img.src = layerData;
          } else {
            ctx.fillStyle = '#808080';
            ctx.fillRect(i * 100, 0, 100, 100);
            resolve();
          }
        });
      }));

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to create blob'));
        }, 'image/png', 1.0);
      });

      const fileName = `${userId}/${roomId}/${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName);

      // 保存到 assets 表
      const { error: dbError } = await supabase
        .from('assets')
        .insert({
          room_id: roomId,
          student_id: userId,
          texture_url: urlData.publicUrl,
        });

      if (dbError) throw dbError;

      // 标记预设为已提交
      const updatedPresets = brushPresets.map(p =>
        p.id === preset.id ? { ...p, submitted: true } : p
      );
      saveBrushPresets(updatedPresets);

      alert('作品提交成功！');
    } catch (err) {
      console.error('Submit error:', err);
      alert('提交失败，请重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272a] bg-[#18181b]">
        <h1 className="text-lg font-bold text-[#fafafa]">笔刷编辑</h1>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div className="text-center flex-shrink-0">
          <div className="text-zinc-500 text-sm mb-4">点击笔触缩略图进行编辑</div>
          {/* Large Preview of all brush layers with gray reference bars */}
          <div className="inline-flex gap-3 p-6 bg-zinc-800 rounded-lg">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`brush-display-${index}-${brushUpdateTrigger}`}
                className="flex flex-col items-center cursor-pointer"
                onClick={() => openBrushEditor(index)}
              >
                {/* Gray reference bar */}
                <div
                  className="w-16 rounded mb-1"
                  style={{ backgroundColor: getLevelGray(index), height: '20px' }}
                />
                {/* Display canvas copy */}
                <canvas
                  id={`brush-display-canvas-${index}`}
                  className="w-16 h-16 border border-zinc-600 rounded hover:border-blue-500"
                  width={100}
                  height={100}
                  style={{ backgroundColor: 'transparent' }}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => setShowBrushLibrary(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs"
            >
              笔刷库
            </button>
            <button onClick={resetAllBrushes} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
              重置
            </button>
          </div>
        </div>
      </div>

      {/* Brush Edit Modal */}
      {editingBrushIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={closeBrushEditor}>
          <div className="bg-zinc-800 rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
              <h3 className="font-semibold text-sm">笔触 - Level {editingBrushIndex}</h3>
              <button onClick={closeBrushEditor} className="p-1 hover:bg-zinc-700 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Content: Canvas + Function Area */}
            <div className="flex">
              {/* Left: Brush Canvas */}
              <div className="p-4 flex items-center justify-center" style={{ width: '440px', height: '440px' }}>
                <div className="w-[400px] h-[400px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900">
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
                {/* Tab Toggle Buttons */}
                <div className="flex border-b border-zinc-600 mb-3">
                  <button
                    onClick={() => {
                      if (cameraStatus !== 'idle') {
                        cancelCameraCapture();
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
                        startCameraCapture();
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

                {/* 涂鸦状态 */}
                {cameraStatus === 'idle' && (
                  <div className="space-y-3 flex-1">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setBrushMode('draw')}
                        className={`flex-1 px-2 py-1.5 rounded text-xs ${brushMode === 'draw' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                      >
                        画笔
                      </button>
                      <button
                        onClick={() => setBrushMode('erase')}
                        className={`flex-1 px-2 py-1.5 rounded text-xs ${brushMode === 'erase' ? 'bg-red-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                      >
                        橡皮
                      </button>
                    </div>

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
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer"
                      />
                    </div>

                    <div>
                      <span className="text-xs text-zinc-400 block mb-2">取色色盘</span>
                      <div className="grid grid-cols-5 gap-1">
                        {['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#808080', '#c0c0c0', '#8b4513', '#ff6347', '#32cd32', '#4169e1', '#daa520', '#ff1493', '#00ced1', '#9370db', '#f0e68c', '#90ee90'].map((color) => (
                          <button
                            key={color}
                            onClick={() => setBrushColor(color)}
                            className={`w-7 h-7 rounded border-2 ${brushColor === color ? 'border-white' : 'border-transparent'} hover:scale-110 transition-transform`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">取色</span>
                      <input
                        type="color"
                        value={brushColor}
                        onChange={(e) => setBrushColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-zinc-600"
                      />
                    </div>

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
                        onClick={takePhoto}
                        className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium text-white"
                      >
                        拍摄
                      </button>
                      <button
                        onClick={cancelCameraCapture}
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

                    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={removeWhiteBg}
                        onChange={(e) => { setRemoveWhiteBg(e.target.checked); applyImageAdjustments(); }}
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
                          onChange={(e) => { setBgRemoveStrength(Number(e.target.value)); applyImageAdjustments(); }}
                          className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                        />
                      </div>
                    )}

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
                        onChange={(e) => { setImageBrightness(Number(e.target.value)); applyImageAdjustments(); }}
                        className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                      />
                    </div>

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
                        onChange={(e) => { setImageContrast(Number(e.target.value)); applyImageAdjustments(); }}
                        className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                      />
                    </div>

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
                        onChange={(e) => { setImageSaturation(Number(e.target.value)); applyImageAdjustments(); }}
                        className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                      />
                    </div>

                    <button
                      onClick={confirmPhoto}
                      className="w-full mt-auto px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium text-white"
                    >
                      确定
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-zinc-700 flex items-center justify-end gap-2">
              <button
                onClick={closeBrushEditor}
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
              >
                取消
              </button>
              <button
                onClick={saveBrushEditor}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brush Library Modal */}
      {showBrushLibrary && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setShowBrushLibrary(false)}>
          <div className="bg-zinc-800 rounded-2xl overflow-hidden w-[400px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
              <h3 className="font-semibold text-sm">笔刷库</h3>
              <button onClick={() => setShowBrushLibrary(false)} className="p-1 hover:bg-zinc-700 rounded">
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
                    onChange={(e) => setCurrentPresetName(e.target.value)}
                    className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-xs text-white"
                  />
                  <button
                    onClick={() => {
                      if (currentPresetName.trim()) {
                        saveCurrentBrushAsPreset(currentPresetName.trim());
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
                  {brushPresets.map((preset) => {
                    // 每个笔刷槽必须有像素内容（dataURL > 100字节表示有实质性像素）
                    const allLayersFilled = preset.layers.every(layer => layer !== null && layer.length > 100);
                    return (
                      <div key={preset.id} className="p-3 bg-zinc-700 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{preset.name}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                loadPresetToCanvas(preset);
                                setShowBrushLibrary(false);
                              }}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => {
                                if (!allLayersFilled) {
                                  alert('请编辑完整笔刷');
                                  return;
                                }
                                submitArtwork(preset);
                              }}
                              disabled={isSubmitting || !!preset.submitted}
                              className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs disabled:opacity-50 disabled:bg-green-800"
                            >
                              {preset.submitted ? '已提交' : '提交给教师'}
                            </button>
                            <button
                              onClick={() => deletePreset(preset.id)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
                            >
                              删除
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {preset.layers.map((dataUrl, idx) => (
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Brush Canvases */}
      <div className="hidden">
        {Array.from({ length: 10 }).map((_, index) => (
          <canvas
            key={`persistent-brush-${index}`}
            ref={(el) => { brushCanvasesRef.current[index] = el; }}
            width={100}
            height={100}
          />
        ))}
      </div>

      {/* Sync display canvases */}
      <SyncDisplayCanvases trigger={brushUpdateTrigger} brushLayers={brushLayersRef.current} />
    </div>
  );
}
