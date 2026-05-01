'use client';

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { TeacherParticleCanvas } from './TeacherParticleCanvas';
import { getBrushPresets as dbGetBrushPresets, saveBrushPresets as dbSaveBrushPresets, deleteBrushPreset as dbDeleteBrushPreset } from '@/lib/db';
import JSZip from 'jszip';

type DataSource = 'webcam' | 'image';
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
  // 每层笔触的 base64 图像数据
  layers: (string | null)[];
}

interface GridCell {
  row: number;
  col: number;
  grayscale: number;
  level: number;
}

const SOURCE_WIDTH = 400;
const SOURCE_HEIGHT = 400;
const BRUSH_SIZE = 200;

type TabType = 'brushEdit' | 'renderOutput';

// Component to sync display canvases with actual brush canvases
function SyncDisplayCanvases({ trigger, brushLayers }: { trigger: number; brushLayers: (BrushLayer | null)[] }) {
  useEffect(() => {
    for (let i = 0; i < 10; i++) {
      const displayCanvas = document.getElementById(`brush-display-canvas-${i}`) as HTMLCanvasElement;
      const layer = brushLayers[i];
      if (displayCanvas && layer?.canvas) {
        const ctx = displayCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
          ctx.drawImage(layer.canvas, 0, 0);
        }
      }
    }
  }, [trigger, brushLayers]);
  return null;
}

// Component to sync source display canvas with actual source canvas
function SyncSourceDisplay({ trigger, sourceImageData }: { trigger: number; sourceImageData: ImageData | null }) {
  useEffect(() => {
    if (!sourceImageData) return;
    const displayCanvas = document.getElementById('source-display-canvas') as HTMLCanvasElement;
    if (displayCanvas) {
      const ctx = displayCanvas.getContext('2d');
      if (ctx) {
        displayCanvas.width = sourceImageData.width;
        displayCanvas.height = sourceImageData.height;
        ctx.putImageData(sourceImageData, 0, 0);
      }
    }
  }, [trigger, sourceImageData]);
  return null;
}

export const TeacherStudio = forwardRef(function TeacherStudio(_props: Record<string, unknown>, ref: React.Ref<{ importBrushStrip: (imageUrl: string) => Promise<void> }>) {
  const [activeTab, setActiveTab] = useState<TabType>('brushEdit');
  const [dataSource, setDataSource] = useState<DataSource>('webcam');
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [brushMode, setBrushMode] = useState<BrushMode>('draw');
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingBrushIndex, setEditingBrushIndex] = useState<number | null>(null);
  const [brushColor, setBrushColor] = useState('#000000');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [sourceAspectRatio, setSourceAspectRatio] = useState(1);
  // 输出区网格数量根据输入源分辨率计算：每samplingSize个像素一个网格
  const [sourceResolution, setSourceResolution] = useState({ width: SOURCE_WIDTH, height: SOURCE_HEIGHT });
  const [gridSamplingSize, setGridSamplingSize] = useState(10);
  const gridSizeX = Math.round(sourceResolution.width / gridSamplingSize);
  const gridSizeY = Math.round(sourceResolution.height / gridSamplingSize);
  // 笔触抖动参数
  const [sizeJitter, setSizeJitter] = useState(0);
  const [rotationJitter, setRotationJitter] = useState(0);
  const [enableFlip, setEnableFlip] = useState(false);
  const [enableMergeOptimization, setEnableMergeOptimization] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState('#ffffff');
  // 笔刷库
  const [brushPresets, setBrushPresets] = useState<BrushPreset[]>([]);
  const [currentPresetName, setCurrentPresetName] = useState('未命名');
  // 摄像头相关状态在 cameraStatus 中统一管理
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  // 拍摄状态：'idle' | 'viewing' | 'adjusting'
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'viewing' | 'adjusting'>('idle');
  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [bgRemoveStrength, setBgRemoveStrength] = useState(128); // 0-255, 默认为128
  const [imageContrast, setImageContrast] = useState(100); // 0-200, 100为默认
  const [imageBrightness, setImageBrightness] = useState(100); // 0-200, 100为默认
  const [imageSaturation, setImageSaturation] = useState(100); // 0-200, 100为默认
  // Refs to track latest adjustment values (to avoid stale closure issues)
  const removeWhiteBgRef = useRef(false);
  const bgRemoveStrengthRef = useRef(128);
  const imageContrastRef = useRef(100);
  const imageBrightnessRef = useRef(100);
  const imageSaturationRef = useRef(100);
  const [showBrushLibrary, setShowBrushLibrary] = useState(false);
  // 笔刷编辑模式切换: 'single'=单个笔刷编辑, 'group'=笔刷组编辑
  const [brushEditMode, setBrushEditMode] = useState<'single' | 'group'>('single');
  // 单个笔刷编辑相关状态
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
  // 拖拽相关状态
  const [draggedBrushId, setDraggedBrushId] = useState<string | null>(null);
  // 用于触发WebGL渲染器更新
  const [renderTrigger, setRenderTrigger] = useState(0);
  // 用于触发笔刷缩略图更新
  const [brushUpdateTrigger, setBrushUpdateTrigger] = useState(0);
  // 待应用的笔刷图像数据（从调整预览复制到编辑器）
  const [pendingBrushImageData, setPendingBrushImageData] = useState<ImageData | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const brushImportInputRef = useRef<HTMLInputElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const sourceCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const brushCanvasesRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const brushLayersRef = useRef<(BrushLayer | null)[]>(Array(10).fill(null));

  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const outputCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const editingBrushCanvasRef = useRef<HTMLCanvasElement>(null);
  const editingLayerIndexRef = useRef<number | null>(null);
  const singleBrushEditorRef = useRef<HTMLCanvasElement>(null);
  const isSingleBrushDrawingRef = useRef(false);
  const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
  // 存储当前编辑笔触的原始图像数据（用于图像调整）
  const editingOriginalImageRef = useRef<ImageData | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraPreviewRef = useRef<HTMLCanvasElement>(null);
  // 调整预览画布 ref
  const adjustmentPreviewRef = useRef<HTMLCanvasElement>(null);
  // 保存编辑前的画布快照，用于取消时恢复
  const editingSnapshotRef = useRef<ImageData | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const renderLoopRef = useRef<boolean>(false);
  const isWebcamActiveRef = useRef(false);
  // 存储源图像数据用于持久化
  const sourceImageDataRef = useRef<ImageData | null>(null);
  const [sourceUpdateTrigger, setSourceUpdateTrigger] = useState(0);

  // 笔刷库：从 IndexedDB 加载
  const loadBrushPresets = useCallback(async () => {
    try {
      const presets = await dbGetBrushPresets();
      setBrushPresets(presets);
    } catch (e) {
      console.error('Failed to load brush presets:', e);
    }
  }, []);

  // 保存笔刷库到 IndexedDB
  const saveBrushPresets = useCallback(async (presets: BrushPreset[]) => {
    try {
      await dbSaveBrushPresets(presets);
      setBrushPresets(presets);
    } catch (e) {
      console.error('Failed to save brush presets:', e);
    }
  }, []);

  // 保存当前笔刷套图为预设
  const saveCurrentBrushAsPreset = useCallback((name: string) => {
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
          // 清空该层
          const canvas = brushCanvasesRef.current[index];
          if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
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
              ctx.clearRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
              ctx.drawImage(img, 0, 0, BRUSH_SIZE, BRUSH_SIZE);
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
      setRenderTrigger(t => t + 1);
      setBrushUpdateTrigger(t => t + 1);
      setCurrentPresetName(preset.name);
    });
  }, []);

  // 删除预设
  const deletePreset = useCallback((id: string) => {
    const updated = brushPresets.filter(p => p.id !== id);
    saveBrushPresets(updated);
  }, [brushPresets, saveBrushPresets]);

  // 从条带图导入笔刷（1000x100 切割成 10 个 100x100）
  const importBrushStrip = useCallback(async (imageUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = 1000;
        stripCanvas.height = 100;
        const stripCtx = stripCanvas.getContext('2d');
        if (!stripCtx) {
          reject(new Error('Cannot create strip canvas context'));
          return;
        }
        stripCtx.drawImage(img, 0, 0, 1000, 100);

        const layers: (string | null)[] = [];
        for (let i = 0; i < 10; i++) {
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = 100;
          sliceCanvas.height = 100;
          const sliceCtx = sliceCanvas.getContext('2d');
          if (sliceCtx) {
            sliceCtx.drawImage(stripCanvas, i * 100, 0, 100, 100, 0, 0, 100, 100);
            layers.push(sliceCanvas.toDataURL('image/png'));
          } else {
            layers.push(null);
          }
        }

        const preset: BrushPreset = {
          id: `imported-${Date.now()}`,
          name: `Imported ${new Date().toLocaleString()}`,
          timestamp: Date.now(),
          layers,
        };

        loadPresetToCanvas(preset);
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });
  }, [loadPresetToCanvas]);

  // 初始化笔触图层 (透明背景)
  const initBrushLayer = useCallback((index: number) => {
    const canvas = brushCanvasesRef.current[index];
    if (!canvas) return;
    // Skip if already initialized with content
    if (brushLayersRef.current[index] && brushLayersRef.current[index].canvas === canvas) return;
    canvas.width = BRUSH_SIZE;
    canvas.height = BRUSH_SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
      brushLayersRef.current[index] = { canvas, ctx, isDrawing: false };
    }
  }, []);

  // 初始化
  useEffect(() => {
    if (sourceCanvasRef.current) {
      sourceCanvasRef.current.width = SOURCE_WIDTH;
      sourceCanvasRef.current.height = SOURCE_HEIGHT;
      const ctx = sourceCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
        sourceCtxRef.current = ctx;
      }
    }

    if (outputCanvasRef.current) {
      outputCanvasRef.current.width = SOURCE_WIDTH;
      outputCanvasRef.current.height = SOURCE_HEIGHT;
      const ctx = outputCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
        outputCtxRef.current = ctx;
      }
    }

    setSourceResolution({ width: SOURCE_WIDTH, height: SOURCE_HEIGHT });
    setIsInitialized(true);
  }, []);

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

  // 更新摄像头预览（带去背景效果）- 提前声明以便在 useEffect 中使用
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

  // 更新摄像头预览
  useEffect(() => {
    if (cameraStatus === 'viewing' && cameraStream) {
      updateCameraPreview();
    }
  }, [cameraStatus, cameraStream, removeWhiteBg, bgRemoveStrength, updateCameraPreview]);

  // Sync adjustment refs with state (to avoid stale closure issues in applyImageAdjustments)
  useEffect(() => { removeWhiteBgRef.current = removeWhiteBg; }, [removeWhiteBg]);
  useEffect(() => { bgRemoveStrengthRef.current = bgRemoveStrength; }, [bgRemoveStrength]);
  useEffect(() => { imageContrastRef.current = imageContrast; }, [imageContrast]);
  useEffect(() => { imageBrightnessRef.current = imageBrightness; }, [imageBrightness]);
  useEffect(() => { imageSaturationRef.current = imageSaturation; }, [imageSaturation]);

  // When entering adjusting mode, apply image adjustments
  useEffect(() => {
    if (cameraStatus === 'adjusting' && editingOriginalImageRef.current) {
      // Use setTimeout to ensure the canvas is rendered in DOM first
      const timer = setTimeout(() => {
        applyImageAdjustments();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [cameraStatus]);

  // 当有待应用的笔刷图像数据时，复制到编辑器画布
  useEffect(() => {
    if (cameraStatus === 'idle' && pendingBrushImageData) {
      const targetCanvas = singleBrushEditorRef.current;
      if (targetCanvas) {
        const targetCtx = targetCanvas.getContext('2d');
        if (targetCtx) {
          targetCtx.putImageData(pendingBrushImageData, 0, 0);
        }
      }
      setPendingBrushImageData(null);
      setRenderTrigger(t => t + 1);
      setBrushUpdateTrigger(t => t + 1);
    }
  }, [cameraStatus, pendingBrushImageData]);

  const getLevelGray = (level: number): string => {
    const gray = Math.floor(level * 25.5);
    return `rgb(${gray}, ${gray}, ${gray})`;
  };

  const mapGrayscaleToLevel = useCallback((grayscale: number): number => {
    const clamped = Math.max(0, Math.min(255, grayscale));
    return Math.min(9, Math.max(0, Math.floor((clamped / 255) * 10)));
  }, []);

  const extractGridData = useCallback((): GridCell[][] => {
    const sourceCanvas = sourceCanvasRef.current;
    const sourceCtx = sourceCtxRef.current;
    if (!sourceCanvas || !sourceCtx) return [];

    const grid: GridCell[][] = [];

    const canvasWidth = sourceCanvas.width;
    const canvasHeight = sourceCanvas.height;

    // 计算图片在实际canvas中的绘制区域
    let drawX = 0, drawY = 0, drawWidth = canvasWidth, drawHeight = canvasHeight;
    if (sourceAspectRatio >= 1) {
      drawHeight = canvasWidth / sourceAspectRatio;
      drawY = (canvasHeight - drawHeight) / 2;
    } else {
      drawWidth = canvasHeight * sourceAspectRatio;
      drawX = (canvasWidth - drawWidth) / 2;
    }

    const cellWidth = drawWidth / gridSizeX;
    const cellHeight = drawHeight / gridSizeY;

    const imageData = sourceCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    for (let row = 0; row < gridSizeY; row++) {
      grid[row] = [];
      for (let col = 0; col < gridSizeX; col++) {
        const startX = Math.floor(drawX + col * cellWidth);
        const startY = Math.floor(drawY + row * cellHeight);
        const endX = Math.floor(drawX + (col + 1) * cellWidth);
        const endY = Math.floor(drawY + (row + 1) * cellHeight);

        let totalGrayscale = 0;
        let pixelCount = 0;

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
              const idx = (y * canvasWidth + x) * 4;
              totalGrayscale += data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
              pixelCount++;
            }
          }
        }

        const avgGrayscale = pixelCount > 0 ? totalGrayscale / pixelCount : 128;
        grid[row][col] = { row, col, grayscale: avgGrayscale, level: mapGrayscaleToLevel(avgGrayscale) };
      }
    }
    return grid;
  }, [mapGrayscaleToLevel, sourceAspectRatio, gridSizeX, gridSizeY]);

  const renderArt = useCallback(() => {
    const outputCanvas = outputCanvasRef.current;
    const outputCtx = outputCtxRef.current;
    if (!outputCanvas || !outputCtx) return;
    if (brushLayersRef.current.filter(l => l !== null).length === 0) return;

    // 根据宽高比设置输出尺寸
    const canvasWidth = sourceCanvasRef.current?.width || SOURCE_WIDTH;
    const canvasHeight = sourceCanvasRef.current?.height || SOURCE_HEIGHT;
    let outputWidth, outputHeight;
    if (sourceAspectRatio >= 1) {
      outputWidth = canvasWidth;
      outputHeight = canvasWidth / sourceAspectRatio;
    } else {
      outputWidth = canvasHeight * sourceAspectRatio;
      outputHeight = canvasHeight;
    }

    outputCanvas.width = Math.round(outputWidth);
    outputCanvas.height = Math.round(outputHeight);
    const cellWidth = outputWidth / gridSizeX;
    const cellHeight = outputHeight / gridSizeY;

    outputCtx.fillStyle = '#ffffff';
    outputCtx.fillRect(0, 0, outputWidth, outputHeight);

    const grid = extractGridData();
    if (grid.length === 0) return;

    for (let row = 0; row < gridSizeY; row++) {
      for (let col = 0; col < gridSizeX; col++) {
        const layer = brushLayersRef.current[grid[row][col].level];
        if (layer) {
          outputCtx.drawImage(layer.canvas, 0, 0, BRUSH_SIZE, BRUSH_SIZE, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
        }
      }
    }
  }, [extractGridData, sourceAspectRatio, gridSizeX, gridSizeY]);

  useEffect(() => {
    if (isInitialized) {
      setRenderTrigger(t => t + 1);
    }
  }, [sourceAspectRatio, isInitialized, gridSizeX, gridSizeY]);

  const startRenderLoop = useCallback(() => {
    renderLoopRef.current = true;
    const loop = () => {
      if (!renderLoopRef.current) return;
      const video = videoRef.current;
      const sourceCanvas = sourceCanvasRef.current;
      const sourceCtx = sourceCtxRef.current;
      if (video && sourceCanvas && sourceCtx && isWebcamActiveRef.current) {
        sourceCtx.drawImage(video, 0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
      }
      // Trigger WebGL texture update
      setRenderTrigger(t => t + 1);
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    animationFrameRef.current = requestAnimationFrame(loop);
  }, []);

  const stopRenderLoop = useCallback(() => {
    renderLoopRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    isWebcamActiveRef.current = false;
  }, []);

  useEffect(() => {
    isWebcamActiveRef.current = isWebcamActive;
  }, [isWebcamActive]);

  const startWebcam = async () => {
    try {
      setSourceAspectRatio(1);
      setSourceResolution({ width: SOURCE_WIDTH, height: SOURCE_HEIGHT });

      // Reset sourceCanvas dimensions to 400x400 for webcam
      if (sourceCanvasRef.current) {
        sourceCanvasRef.current.width = SOURCE_WIDTH;
        sourceCanvasRef.current.height = SOURCE_HEIGHT;
        const ctx = sourceCanvasRef.current.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#808080';
          ctx.fillRect(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
          sourceCtxRef.current = ctx;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: SOURCE_WIDTH, height: SOURCE_HEIGHT } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsWebcamActive(true);
          startRenderLoop();
        };
      }
    } catch (err) {
      console.error('Webcam error:', err);
      alert('无法访问摄像头');
    }
  };

  const stopWebcam = () => {
    stopRenderLoop();
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
    }
    setIsWebcamActive(false);
  };

  // 拍摄状态：'idle' | 'viewing' | 'adjusting' (已在前面声明)

  // 启动摄像头拍摄
  const startCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 800, height: 800, facingMode: 'environment' }
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

  // 停止摄像头拍摄
  const stopCameraCapture = () => {
    cancelCameraCapture();
  };

  // 拍摄照片（捕获后进入调整状态）
  const takePhoto = () => {
    if (!cameraVideoRef.current) return;

    const video = cameraVideoRef.current;

    // 确保视频维度已加载（等待下一帧）
    const captureFrame = () => {
      // 创建临时 canvas 捕获原始图像
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = BRUSH_SIZE;
      tempCanvas.height = BRUSH_SIZE;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      // 使用视频的实际宽高，如果还未加载则使用默认值
      const srcW = video.videoWidth || 800;
      const srcH = video.videoHeight || 800;

      // 绘制视频帧到临时 canvas（将摄像头画面缩放到 BRUSH_SIZE）
      tempCtx.drawImage(video, 0, 0, srcW, srcH, 0, 0, BRUSH_SIZE, BRUSH_SIZE);

      // 存储原始图像数据（用于图像调整）
      editingOriginalImageRef.current = tempCtx.getImageData(0, 0, BRUSH_SIZE, BRUSH_SIZE);

      // 停止相机预览（保持stream以便再次拍摄）
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        setCameraStream(null);
      }

      // 进入调整状态
      setCameraStatus('adjusting');

      // 直接调用 applyImageAdjustments 确保预览立即更新
      requestAnimationFrame(() => {
        applyImageAdjustments();
      });

      // 触发渲染更新
      setRenderTrigger(t => t + 1);
    };

    // 如果视频维度还未准备好，等待一下再捕获
    const captureWhenReady = () => {
      if (video.readyState >= 2) {
        // Video has frames, ready to capture
        requestAnimationFrame(captureFrame);
      } else {
        // Wait for video to be ready
        setTimeout(captureWhenReady, 50);
      }
    };
    captureWhenReady();
  };

  // 确认拍摄结果，从预览画布复制到编辑画布并返回涂鸦状态
  const confirmPhoto = () => {
    const previewCanvas = adjustmentPreviewRef.current;

    if (!previewCanvas) {
      console.warn('confirmPhoto: preview canvas not ready');
      return;
    }

    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) return;

    // 获取预览画布的图像数据
    const previewImageData = previewCtx.getImageData(0, 0, 400, 400);

    // 存储待复制的图像数据
    setPendingBrushImageData(previewImageData);

    // 重置图像调整参数
    setRemoveWhiteBg(false);
    setBgRemoveStrength(128);
    setImageBrightness(100);
    setImageContrast(100);
    setImageSaturation(100);

    // 返回涂鸦状态（doodle画布会重新显示）
    setCameraStatus('idle');
    editingOriginalImageRef.current = null;
  };

  // 应用图像调整到调整预览画布
  const applyImageAdjustments = useCallback(() => {
    if (!editingOriginalImageRef.current) return;

    const previewCanvas = adjustmentPreviewRef.current;
    if (!previewCanvas) return;

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    // 创建可写的图像数据副本
    const originalData = editingOriginalImageRef.current;
    const imageData = new ImageData(
      new Uint8ClampedArray(originalData.data),
      originalData.width,
      originalData.height
    );
    const data = imageData.data;

    // Read latest values from refs to avoid stale closure issues
    const currentRemoveWhiteBg = removeWhiteBgRef.current;
    const currentBgRemoveStrength = bgRemoveStrengthRef.current;
    const currentBrightness = imageBrightnessRef.current;
    const currentContrast = imageContrastRef.current;
    const currentSaturation = imageSaturationRef.current;

    // 应用图像调整
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 1. 亮度调整 (0-200, 100为默认值)
      const brightnessFactor = currentBrightness / 100;
      r = r * brightnessFactor;
      g = g * brightnessFactor;
      b = b * brightnessFactor;

      // 2. 对比度调整 (0-200, 100为默认值)
      const contrastFactor = currentContrast / 100;
      const contrastMid = 128;
      r = contrastMid + (r - contrastMid) * contrastFactor;
      g = contrastMid + (g - contrastMid) * contrastFactor;
      b = contrastMid + (b - contrastMid) * contrastFactor;

      // 3. 饱和度调整 (0-200, 100为默认值)
      const saturationFactor = currentSaturation / 100;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + (r - gray) * saturationFactor;
      g = gray + (g - gray) * saturationFactor;
      b = gray + (b - gray) * saturationFactor;

      // 4. 白色背景去除（越白越透明）
      if (currentRemoveWhiteBg) {
        const minComponent = Math.min(r, g, b);
        if (minComponent >= currentBgRemoveStrength) {
          const range = 255 - currentBgRemoveStrength;
          const excess = (r + g + b) / 3 - currentBgRemoveStrength;
          data[i + 3] = Math.max(0, Math.min(255, 255 - excess * (255 / range)));
        }
      }

      // 确保值在有效范围内
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    // 绘制到预览画布
    ctx.clearRect(0, 0, 400, 400);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = BRUSH_SIZE;
    tempCanvas.height = BRUSH_SIZE;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, 400, 400);
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopRenderLoop();
    setIsWebcamActive(false);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = sourceCanvasRef.current;
        const ctx = sourceCtxRef.current;
        if (!canvas || !ctx) return;

        // 如果图片最长边超过 1500 像素，等比例缩放
        const MAX_SIZE = 1500;
        const maxDim = Math.max(img.width, img.height);
        let scaledWidth = img.width;
        let scaledHeight = img.height;
        if (maxDim > MAX_SIZE) {
          const scale = MAX_SIZE / maxDim;
          scaledWidth = Math.round(img.width * scale);
          scaledHeight = Math.round(img.height * scale);
        }

        const aspectRatio = scaledWidth / scaledHeight;
        setSourceAspectRatio(aspectRatio);

        // 按图片比例设置 canvas 尺寸
        let canvasWidth, canvasHeight;
        if (aspectRatio >= 1) {
          canvasWidth = SOURCE_WIDTH;
          canvasHeight = Math.round(SOURCE_WIDTH / aspectRatio);
        } else {
          canvasHeight = SOURCE_HEIGHT;
          canvasWidth = Math.round(SOURCE_HEIGHT * aspectRatio);
        }

        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // 将原图缩放绘制到 canvas（读取完整原图，缩放到 canvas 尺寸）
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvasWidth, canvasHeight);

        // 存储图像数据用于持久化
        sourceImageDataRef.current = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

        setDataSource('image');
        setSourceResolution({ width: canvasWidth, height: canvasHeight });
        setSourceUpdateTrigger(t => t + 1);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // 处理导入笔刷图片（100x100，正方形裁剪，支持多选）
  const handleBrushImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validFiles = Array.from(files).filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext === 'jpg' || ext === 'jpeg' || ext === 'png';
    });

    if (validFiles.length === 0) {
      alert('请选择 JPG 或 PNG 格式的图片');
      return;
    }

    const processFile = (file: File, index: number): Promise<BrushPreset> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2;
            const sy = (img.height - size) / 2;

            const canvas = document.createElement('canvas');
            canvas.width = BRUSH_SIZE;
            canvas.height = BRUSH_SIZE;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve({
                id: `${Date.now()}-${index}`,
                name: `笔刷 ${Date.now()}-${index}`,
                timestamp: Date.now(),
                layers: ['', null, null, null, null, null, null, null, null, null],
              });
              return;
            }

            ctx.drawImage(img, sx, sy, size, size, 0, 0, BRUSH_SIZE, BRUSH_SIZE);
            const dataUrl = canvas.toDataURL('image/png');

            resolve({
              id: `${Date.now()}-${index}`,
              name: `笔刷 ${Date.now()}-${index}`,
              timestamp: Date.now(),
              layers: [dataUrl, null, null, null, null, null, null, null, null, null],
            });
          };
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
    };

    Promise.all(validFiles.map((f, i) => processFile(f, i))).then((newPresets) => {
      const updated = [...brushPresets, ...newPresets];
      saveBrushPresets(updated);
    });

    e.target.value = '';
  };

  const openBrushEditor = (index: number) => {
    editingLayerIndexRef.current = index;
    setEditingBrushIndex(index);
    setBrushColor('#000000');

    // 保存编辑前的快照
    const layer = brushLayersRef.current[index];
    if (layer) {
      editingSnapshotRef.current = layer.ctx.getImageData(0, 0, BRUSH_SIZE, BRUSH_SIZE);
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
          ctx.drawImage(layer.canvas, 0, 0, BRUSH_SIZE, BRUSH_SIZE, 0, 0, 400, 400);
        }
      }
    }, 50);
  };

  const closeBrushEditor = () => {
    // 停止摄像头
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraStatus('idle');

    // 取消编辑，恢复原始快照
    const index = editingLayerIndexRef.current;
    if (index !== null && editingSnapshotRef.current) {
      const layer = brushLayersRef.current[index];
      if (layer) {
        layer.ctx.putImageData(editingSnapshotRef.current, 0, 0);
      }
    }
    editingSnapshotRef.current = null;
    editingOriginalImageRef.current = null;

    // 重置图像调整参数
    setRemoveWhiteBg(false);
    setBgRemoveStrength(128);
    setImageBrightness(100);
    setImageContrast(100);
    setImageSaturation(100);

    editingLayerIndexRef.current = null;
    setEditingBrushIndex(null);
    setRenderTrigger(t => t + 1);
    setBrushUpdateTrigger(t => t + 1);
  };

  const saveBrushEditor = () => {
    // 停止摄像头
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraStatus('idle');

    // 保存编辑结果：从编辑画布复制到笔触画布
    const editorCanvas = editingBrushCanvasRef.current;
    const index = editingLayerIndexRef.current;
    if (editorCanvas && index !== null) {
      const layer = brushLayersRef.current[index];
      if (layer) {
        // 400x400 -> 100x100
        layer.ctx.clearRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
        layer.ctx.drawImage(editorCanvas, 0, 0, BRUSH_SIZE, BRUSH_SIZE);
      }
    }
    editingSnapshotRef.current = null;
    editingOriginalImageRef.current = null;

    // 重置图像调整参数
    setRemoveWhiteBg(false);
    setBgRemoveStrength(128);
    setImageBrightness(100);
    setImageContrast(100);
    setImageSaturation(100);

    editingLayerIndexRef.current = null;
    setEditingBrushIndex(null);
    setRenderTrigger(t => t + 1);
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
    // Check which editor is active: single brush mode or group brush mode
    const singleCanvas = singleBrushEditorRef.current;
    const groupCanvas = editingBrushCanvasRef.current;
    const editorCanvas = singleCanvas || groupCanvas;

    if (!editorCanvas) return;

    // For single brush mode (singleCanvas is set but no layer index)
    if (singleCanvas && !groupCanvas) {
      isSingleBrushDrawingRef.current = true;
      const ctx = editorCanvas.getContext('2d');
      if (!ctx) return;
      const { x, y } = getCanvasCoords(e, editorCanvas);
      lastDrawPosRef.current = { x, y };
      // Set opacity
      ctx.globalAlpha = brushOpacity / 100;
      // Draw a dot at click position
      if (brushMode === 'draw') {
        ctx.fillStyle = brushColor;
        ctx.beginPath();
        ctx.arc(x, y, brushSize, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, brushSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      return;
    }

    const index = editingLayerIndexRef.current;
    if (index === null) return;
    const layer = brushLayersRef.current[index];
    if (!layer) return;
    layer.isDrawing = true;
    const { x, y } = getCanvasCoords(e, editorCanvas);
    const scale = 100 / 400;
    const editorCtx = editorCanvas.getContext('2d');
    lastDrawPosRef.current = { x, y };

    const draw = (ctx: CanvasRenderingContext2D, px: number, py: number, lastX?: number, lastY?: number) => {
      ctx.globalAlpha = brushOpacity / 100;
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
      ctx.globalAlpha = 1;
    };

    if (editorCtx) draw(editorCtx, x, y);
    draw(layer.ctx, x * scale, y * scale);
  };

  const handleEditingMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Check which editor is active
    const singleCanvas = singleBrushEditorRef.current;
    const groupCanvas = editingBrushCanvasRef.current;
    const editorCanvas = singleCanvas || groupCanvas;

    if (!editorCanvas) return;

    // For single brush mode - only draw if mouse is pressed
    if (singleCanvas && !groupCanvas) {
      if (!isSingleBrushDrawingRef.current) return;
      const ctx = editorCanvas.getContext('2d');
      if (!ctx) return;
      ctx.globalAlpha = brushOpacity / 100;
      const { x, y } = getCanvasCoords(e, editorCanvas);
      const lastPos = lastDrawPosRef.current;
      if (brushMode === 'draw') {
        ctx.fillStyle = brushColor;
        ctx.beginPath();
        if (lastPos) {
          ctx.moveTo(lastPos.x, lastPos.y);
          ctx.lineTo(x, y);
          ctx.strokeStyle = brushColor;
          ctx.lineWidth = brushSize * 2;
          ctx.stroke();
        }
        ctx.arc(x, y, brushSize, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        if (lastPos) {
          ctx.moveTo(lastPos.x, lastPos.y);
          ctx.lineTo(x, y);
          ctx.lineWidth = brushSize * 2;
          ctx.stroke();
        }
        ctx.arc(x, y, brushSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
      lastDrawPosRef.current = { x, y };
      return;
    }

    const index = editingLayerIndexRef.current;
    if (!editorCanvas || index === null) return;
    const layer = brushLayersRef.current[index];
    if (!layer || !layer.isDrawing) return;
    const { x, y } = getCanvasCoords(e, editorCanvas);
    const scale = 100 / 200;
    const editorCtx = editorCanvas.getContext('2d');
    const lastPos = lastDrawPosRef.current;

    const draw = (ctx: CanvasRenderingContext2D, px: number, py: number, lastX?: number, lastY?: number) => {
      ctx.globalAlpha = brushOpacity / 100;
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
      ctx.globalAlpha = 1;
    };

    if (editorCtx) draw(editorCtx, x, y, lastPos?.x, lastPos?.y);
    draw(layer.ctx, x * scale, y * scale, lastPos ? lastPos.x * scale : undefined, lastPos ? lastPos.y * scale : undefined);
    lastDrawPosRef.current = { x, y };
  };

  const handleEditingMouseUp = () => {
    // Reset single brush drawing flag
    isSingleBrushDrawingRef.current = false;
    // For group brush mode, reset layer drawing flag
    const index = editingLayerIndexRef.current;
    if (index !== null) {
      const layer = brushLayersRef.current[index];
      if (layer) layer.isDrawing = false;
    }
    lastDrawPosRef.current = null;
  };

  // ============== Drag and Drop Handlers ==============
  const handleDragStart = (e: React.DragEvent, brushId: string) => {
    setDraggedBrushId(brushId);
    e.dataTransfer.setData('text/plain', brushId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    const brushId = e.dataTransfer.getData('text/plain') || draggedBrushId;
    if (!brushId) return;

    // Find the brush preset by ID
    const preset = brushPresets.find(p => p.id === brushId);
    if (!preset || !preset.layers[slotIndex]) return;

    // Load the brush layer image into the slot
    const dataUrl = preset.layers[slotIndex];
    const canvas = brushCanvasesRef.current[slotIndex];
    if (!canvas || !dataUrl) return;

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
        ctx.drawImage(img, 0, 0, BRUSH_SIZE, BRUSH_SIZE);
        brushLayersRef.current[slotIndex] = { canvas, ctx, isDrawing: false };
        setRenderTrigger(t => t + 1);
        setBrushUpdateTrigger(t => t + 1);
      }
    };
    img.src = dataUrl;
    setDraggedBrushId(null);
  };

  const handleDragEnd = () => {
    setDraggedBrushId(null);
  };

  const resetAllBrushes = () => {
    brushLayersRef.current.forEach((layer) => {
      if (layer) layer.ctx.clearRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
    });
    setRenderTrigger(t => t + 1);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => ({
      scale: Math.min(5, Math.max(0.1, prev.scale * delta)),
      x: prev.x,
      y: prev.y
    }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      }));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const resetTransform = () => {
    setTransform({ scale: 1, x: 0, y: 0 });
  };

  // 加载图片URL到源画布（用于应用学生提交的条带图）
  const loadSourceImage = useCallback((imageUrl: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      stopRenderLoop();
      setIsWebcamActive(false);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = sourceCanvasRef.current;
        const ctx = sourceCtxRef.current;
        if (!canvas || !ctx) {
          reject(new Error('Canvas not available'));
          return;
        }

        // 1000x100 条带图，缩放到 400x400
        const canvasWidth = SOURCE_WIDTH;
        const canvasHeight = SOURCE_HEIGHT;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvasWidth, canvasHeight);
        sourceImageDataRef.current = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

        setDataSource('image');
        setSourceAspectRatio(1);
        setSourceResolution({ width: canvasWidth, height: canvasHeight });
        setSourceUpdateTrigger(t => t + 1);
        setActiveTab('renderOutput');
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageUrl;
    });
  }, [stopRenderLoop]);

  // Expose methods to parent components via ref
  useImperativeHandle(ref, () => ({
    importBrushStrip,
    loadSourceImage,
  }), [importBrushStrip, loadSourceImage]);

  useEffect(() => {
    return () => { stopRenderLoop(); };
  }, [stopRenderLoop]);

  return (
    <div className="flex h-full flex-col bg-[#09090b] text-[#fafafa]">
      {/* Hidden brush import file input */}
      <input
        ref={brushImportInputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        onChange={handleBrushImport}
        className="hidden"
      />
      {/* Tab Navigation */}
      <div className="flex border-b border-[#27272a] bg-[#18181b]">
        <button
          onClick={() => { setActiveTab('brushEdit'); setBrushUpdateTrigger(t => t + 1); }}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'brushEdit'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          笔刷编辑
        </button>
        <button
          onClick={() => { setActiveTab('renderOutput'); setSourceUpdateTrigger(t => t + 1); }}
          className={`px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'renderOutput'
              ? 'text-white border-b-2 border-blue-500'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          渲染输出
        </button>
        {/* Mode Switcher - shown only in brushEdit tab */}
        {activeTab === 'brushEdit' && (
          <div className="flex items-center ml-auto mr-4">
            <div className="flex bg-zinc-800 rounded-lg p-1">
              <button
                onClick={() => setBrushEditMode('single')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  brushEditMode === 'single'
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                单个笔刷
              </button>
              <button
                onClick={() => setBrushEditMode('group')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  brushEditMode === 'group'
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                笔刷组
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'brushEdit' ? (
        /* Brush Edit Tab */
        <div className="flex flex-1 overflow-hidden">
          {brushEditMode === 'single' ? (
            /* Single Brush Edit Mode - library on left, editor on right */
            <>
              {/* Left: Single Brush Library - 6 per row, thumbnails only */}
              <div className="w-64 bg-zinc-800 p-3 flex flex-col h-full border-r border-zinc-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">笔刷库</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        brushImportInputRef.current?.click();
                      }}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                    >
                      导入
                    </button>
                    <button
                      onClick={async () => {
                        const zip = new JSZip();
                        brushPresets.forEach((preset, index) => {
                          const layer = preset.layers[0];
                          if (layer) {
                            // Convert base64 to binary
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
                      }}
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
                          onMouseEnter={() => setHoveredPresetId(preset.id)}
                          onMouseLeave={() => setHoveredPresetId(null)}
                          onClick={() => {
                            // Load first layer into editor canvas
                            const firstLayer = preset.layers[0];
                            if (firstLayer) {
                              const img = new Image();
                              img.onload = () => {
                                const canvas = singleBrushEditorRef.current;
                                if (canvas) {
                                  const ctx = canvas.getContext('2d');
                                  if (ctx) {
                                    ctx.clearRect(0, 0, 400, 400);
                                    ctx.drawImage(img, 0, 0, 400, 400);
                                  }
                                }
                              };
                              img.src = firstLayer;
                            }
                          }}
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
                                deletePreset(preset.id);
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

              {/* Right: Single Brush Editor */}
              <div className="flex-1 flex flex-col p-6">
                {/* Tab Toggle - 涂鸦/拍摄 buttons - upper left */}
                <div className="flex border-b border-zinc-600 mb-4 w-fit">
                  <button
                    onClick={() => {
                      if (cameraStatus !== 'idle') cancelCameraCapture();
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

                {/* Canvas area - switches between doodle canvas and camera preview */}
                <div className="flex items-center gap-0">
                  {/* Left Toolbar - Photoshop style, 10px from tab left edge */}
                  {cameraStatus === 'idle' && (
                    <div className="ml-[10px] flex flex-col items-center gap-1 py-0">
                      {/* Brush/Eraser toggles */}
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => setBrushMode('draw')}
                          className={`px-1 py-1 rounded text-xs ${brushMode === 'draw' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                        >
                          画笔
                        </button>
                        <button
                          onClick={() => setBrushMode('erase')}
                          className={`px-1 py-1 rounded text-xs ${brushMode === 'erase' ? 'bg-red-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                        >
                          橡皮
                        </button>
                      </div>

                      {/* Size slider - vertical slide (up/down) */}
                      <div className="flex flex-col items-center gap-6 py-8">
                       
                        <input
                          type="range"
                          min="2"
                          max="40"
                          value={brushSize}
                          onChange={(e) => setBrushSize(Number(e.target.value))}
                          className="w-15 h-4 bg-zinc-700 rounded appearance-none cursor-pointer -rotate-90"
                        />
                        <span className="text-xs text-zinc-400">{brushSize}px</span>
                      </div>

                      {/* Opacity slider - vertical slide (up/down) */}
                      <div className="flex flex-col items-center gap-6">
                        
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={brushOpacity}
                          onChange={(e) => setBrushOpacity(Number(e.target.value))}
                          className="w-15 h-4 bg-zinc-700 rounded appearance-none cursor-pointer -rotate-90"
                        />
                        <span className="text-xs text-zinc-400">{brushOpacity}%</span>
                      </div>

                      {/* Color palette - vertical arrangement */}
                      <div className="flex flex-col items-center gap-2 py-4">
                        <input
                          ref={colorInputRef}
                          type="color"
                          value={brushColor}
                          onChange={(e) => setBrushColor(e.target.value)}
                          className="w-10 h-10 border border-zinc-500 cursor-pointer"
                          title="选择颜色"
                        />
                        <div className="grid grid-cols-2 gap-1">
                          {['#2c2c2c', '#744242', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#808080', '#c0c0c0'].map((color) => (
                            <button
                              key={color}
                              onClick={() => setBrushColor(color)}
                              className={`w-5 h-5 rounded border-2 ${brushColor === color ? 'border-white' : 'border-transparent'} hover:scale-110 transition-transform`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Canvas centered with remaining space */}
                  <div className="flex-1 flex justify-center">
                    <div className="flex flex-col items-center gap-4">
                    {/* Doodle Canvas - hidden when camera is active */}
                    {cameraStatus === 'idle' && (
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
                    )}

                    {/* Clear and Save buttons - below canvas */}
                    {cameraStatus === 'idle' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const canvas = singleBrushEditorRef.current;
                            if (canvas) {
                              const ctx = canvas.getContext('2d');
                              if (ctx) ctx.clearRect(0, 0, 400, 400);
                            }
                          }}
                          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
                        >
                          清除
                        </button>
                        <button
                          onClick={() => {
                            const canvas = singleBrushEditorRef.current;
                            if (canvas) {
                              const tempCanvas = document.createElement('canvas');
                              tempCanvas.width = BRUSH_SIZE;
                              tempCanvas.height = BRUSH_SIZE;
                              const tempCtx = tempCanvas.getContext('2d');
                              if (tempCtx) {
                                tempCtx.drawImage(canvas, 0, 0, 400, 400, 0, 0, BRUSH_SIZE, BRUSH_SIZE);
                                const dataUrl = tempCanvas.toDataURL('image/png');
                                const newPreset: BrushPreset = {
                                  id: Date.now().toString(),
                                  name: `笔刷 ${Date.now()}`,
                                  timestamp: Date.now(),
                                  layers: [dataUrl, null, null, null, null, null, null, null, null, null],
                                };
                                const updated = [...brushPresets, newPreset];
                                saveBrushPresets(updated);
                                alert('已保存到笔刷库！');
                              }
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs"
                        >
                          保存到画笔库
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                  {/* Camera View - shown when camera is active */}
                  {cameraStatus === 'viewing' && cameraStream && (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-[400px] h-[400px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900">
                        <video
                          ref={cameraVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="absolute inset-0 w-full h-full object-contain"
                        />
                        <canvas ref={cameraPreviewRef} className="hidden" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={takePhoto} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium">拍摄</button>
                        <button onClick={cancelCameraCapture} className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm">取消</button>
                      </div>
                    </div>
                  )}

                  {/* Image Adjustments - after photo taken */}
                  {cameraStatus === 'adjusting' && (
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
                          ref={adjustmentPreviewRef}
                          width={400}
                          height={400}
                          className="absolute inset-0 w-full h-full"
                        />
                      </div>
                      {/* Adjustment controls */}
                      <div className="flex flex-col items-center gap-2 w-full max-w-md">
                        <div className="flex items-center gap-4 w-full justify-center">
                          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                            <input type="checkbox" checked={removeWhiteBg} onChange={(e) => { setRemoveWhiteBg(e.target.checked); applyImageAdjustments(); }} className="w-3 h-3" />
                            去背景
                          </label>
                          <span className="text-xs text-zinc-500 w-12">亮度</span>
                          <input type="range" min="0" max="200" value={imageBrightness} onChange={(e) => { setImageBrightness(Number(e.target.value)); applyImageAdjustments(); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
                          <span className="text-xs text-zinc-400 w-10">{imageBrightness}%</span>
                        </div>
                        {removeWhiteBg && (
                          <div className="flex items-center gap-4 w-full justify-center">
                            <div className="w-24" />
                            <span className="text-xs text-zinc-500 w-12">强度</span>
                            <input type="range" min="0" max="255" value={bgRemoveStrength} onChange={(e) => { setBgRemoveStrength(Number(e.target.value)); applyImageAdjustments(); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
                            <span className="text-xs text-zinc-400 w-10">{bgRemoveStrength}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-4 w-full justify-center">
                          <div className="w-16" />
                          <span className="text-xs text-zinc-500 w-12">对比度</span>
                          <input type="range" min="0" max="200" value={imageContrast} onChange={(e) => { setImageContrast(Number(e.target.value)); applyImageAdjustments(); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
                          <span className="text-xs text-zinc-400 w-10">{imageContrast}%</span>
                        </div>
                        <div className="flex items-center gap-4 w-full justify-center">
                          <div className="w-16" />
                          <span className="text-xs text-zinc-500 w-12">饱和度</span>
                          <input type="range" min="0" max="200" value={imageSaturation} onChange={(e) => { setImageSaturation(Number(e.target.value)); applyImageAdjustments(); }} className="w-24 h-1 bg-zinc-700 rounded cursor-pointer" />
                          <span className="text-xs text-zinc-400 w-10">{imageSaturation}%</span>
                        </div>
                        <button onClick={confirmPhoto} className="mt-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium">应用到画布</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Group Brush Edit Mode (Default) */
            <div className="text-center">
              <div className="text-zinc-500 text-sm mb-4">点击笔触缩略图进行编辑</div>
              {/* Large Preview of all brush layers with gray reference bars */}
              <div className="inline-flex gap-3 p-6 bg-zinc-800 rounded-lg">
                {Array.from({ length: 10 }).map((_, index) => (
                  <div
                    key={`brush-display-${index}-${brushUpdateTrigger}`}
                    className={`flex flex-col items-center cursor-pointer ${draggedBrushId ? 'drop-target' : ''}`}
                    onClick={() => openBrushEditor(index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                  >
                    {/* Gray reference bar - same width as thumbnail, 20px height, no number */}
                    <div
                      className="w-16 rounded mb-1"
                      style={{ backgroundColor: getLevelGray(index), height: '20px' }}
                    />
                    {/* Display canvas copy */}
                    <canvas
                      id={`brush-display-canvas-${index}`}
                      className={`w-16 h-16 border-2 rounded transition-colors ${
                        draggedBrushId
                          ? 'border-dashed border-blue-400 bg-blue-900/30 hover:border-blue-300'
                          : 'border-zinc-600 hover:border-blue-500'
                      }`}
                      width={100}
                      height={100}
                      style={{ backgroundColor: 'transparent' }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <button onClick={resetAllBrushes} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
                  重置
                </button>
                <button onClick={() => setShowBrushLibrary(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs">
                  笔刷库
                </button>
                <button onClick={() => setActiveTab('renderOutput')} className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
                  切换到渲染输出
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Render Output Tab */
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Data Source */}
          <div className="flex w-64 flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-[#27272a] bg-[#18181b] p-3">
            {/* Data Source */}
            <div>
              <div className="mb-2 flex gap-1">
                <button
                  onClick={() => { setDataSource('webcam'); startWebcam(); }}
                  disabled={isWebcamActive}
                  className={`rounded px-2 py-1 text-xs ${dataSource === 'webcam' && isWebcamActive ? 'bg-green-600 text-white' : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'}`}
                >
                  摄像头
                </button>
                <button
                  onClick={() => { stopWebcam(); setDataSource('image'); imageInputRef.current?.click(); }}
                  className={`rounded px-2 py-1 text-xs ${dataSource === 'image' ? 'bg-blue-600 text-white' : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'}`}
                >
                  载入参考图
                </button>
              </div>
              {/* Hidden file input */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="relative w-full bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" style={{ aspectRatio: sourceAspectRatio }}>
                <canvas id="source-display-canvas" className="absolute inset-0 w-full h-full object-contain" />
                <video ref={videoRef} className={`absolute inset-0 w-full h-full object-cover transition-opacity ${dataSource === 'webcam' ? 'opacity-100' : 'opacity-0'}`} playsInline muted />
              </div>
            </div>

            {/* Brush Library Button */}
            <button
              onClick={() => setShowBrushLibrary(true)}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
              </svg>
              笔刷库
            </button>

            {/* Settings Panel */}
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
                  onChange={(e) => setGridSamplingSize(Number(e.target.value))}
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
                    onChange={(e) => setSizeJitter(Number(e.target.value))}
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
                    onChange={(e) => setRotationJitter(Number(e.target.value))}
                    className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableFlip}
                    onChange={(e) => setEnableFlip(e.target.checked)}
                    className="w-3 h-3 rounded border-zinc-600"
                  />
                  <span>随机翻转</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableMergeOptimization}
                    onChange={(e) => setEnableMergeOptimization(e.target.checked)}
                    className="w-3 h-3 rounded border-zinc-600"
                  />
                  <span>笔触合并优化</span>
                </label>

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-700">
                  <span className="text-xs text-zinc-400">背景色</span>
                  <input
                    type="color"
                    value={canvasBackgroundColor}
                    onChange={(e) => setCanvasBackgroundColor(e.target.value)}
                    className="w-6 h-6 rounded border border-zinc-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Output */}
          <div className="flex-1 flex flex-col p-3">
            {/* Output status + fullscreen */}
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-zinc-500">
                {isWebcamActive ? '实时' : '静止'} · {sourceAspectRatio >= 1 ? '横版' : '竖版'}
              </span>
              {!isFullscreen && (
                <button
                  onClick={() => { setIsFullscreen(true); resetTransform(); }}
                  className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                  </svg>
                  全屏
                </button>
              )}
            </div>

            {/* Output Canvas Container - WebGL */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden">
              {/* Canvas wrapper with transform */}
              <div
                className={`rounded-lg overflow-hidden ${isFullscreen ? 'fixed inset-0 z-40 flex items-center justify-center' : 'max-w-[600px] w-full h-auto bg-white'}`}
                style={isFullscreen ? { cursor: isPanning ? 'grabbing' : 'grab', backgroundColor: '#ececec' } : { aspectRatio: sourceAspectRatio }}
              >
                <div
                  style={{
                    transform: isFullscreen ? `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` : 'none',
                    transformOrigin: 'center center',
                    transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                  }}
                >
                  <TeacherParticleCanvas
                    sourceWidth={sourceResolution.width}
                    sourceHeight={sourceResolution.height}
                    gridSizeX={gridSizeX}
                    gridSizeY={gridSizeY}
                    brushLayers={brushLayersRef.current}
                    sourceCanvas={sourceCanvasRef.current}
                    sizeJitter={sizeJitter}
                    rotationJitter={rotationJitter}
                    enableFlip={enableFlip}
                    enableMergeOptimization={enableMergeOptimization}
                    backgroundColor={canvasBackgroundColor}
                    isFullscreen={isFullscreen}
                    transform={transform}
                    onTransformChange={setTransform}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    updateTrigger={renderTrigger}
                  />
                </div>
              </div>

              {/* Zoom indicator in fullscreen */}
              {isFullscreen && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 bg-zinc-800/80 rounded-lg text-sm">
                  滚轮缩放 | 拖拽平移 | 当前缩放: {Math.round(transform.scale * 100)}%
                </div>
              )}

              {/* Floating Settings Panel in fullscreen */}
              {isFullscreen && (
                <div className="fixed top-4 left-4 z-50">
                  <button
                    onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                    className="p-3 bg-zinc-800/80 hover:bg-zinc-700 rounded-lg text-white transition-colors"
                    title="设置"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                  </button>

                  {/* Expandable Settings Panel */}
                  {showSettingsPanel && (
                    <div className="mt-2 w-72 bg-zinc-800/95 backdrop-blur rounded-lg p-4 shadow-xl border border-zinc-700">
                      <h3 className="text-sm font-semibold mb-3 text-zinc-300">采样精度</h3>
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
                          onChange={(e) => setGridSamplingSize(Number(e.target.value))}
                          className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                          <span>精细</span>
                          <span>粗糙</span>
                        </div>
                      </div>

                      <h3 className="text-sm font-semibold mb-3 text-zinc-300">笔触效果</h3>
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
                            onChange={(e) => setSizeJitter(Number(e.target.value))}
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
                            onChange={(e) => setRotationJitter(Number(e.target.value))}
                            className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableFlip}
                            onChange={(e) => setEnableFlip(e.target.checked)}
                            className="w-3 h-3 rounded border-zinc-600"
                          />
                          <span>随机翻转</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={enableMergeOptimization}
                            onChange={(e) => setEnableMergeOptimization(e.target.checked)}
                            className="w-3 h-3 rounded border-zinc-600"
                          />
                          <span>笔触合并优化</span>
                        </label>

                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-zinc-700">
                          <span className="text-xs text-zinc-400">背景色</span>
                          <input
                            type="color"
                            value={canvasBackgroundColor}
                            onChange={(e) => setCanvasBackgroundColor(e.target.value)}
                            className="w-6 h-6 rounded border border-zinc-600 cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fullscreen controls - top right, OUTSIDE the canvas container */}
            {isFullscreen && (
              <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
                <button
                  onClick={resetTransform}
                  className="px-3 py-2 bg-zinc-800/80 hover:bg-zinc-700 rounded-lg text-sm"
                >
                  重置
                </button>
                <button
                  onClick={() => { setIsFullscreen(false); resetTransform(); }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                  退出
                </button>
              </div>
            )}

            {/* Action buttons - below canvas */}
            {!isFullscreen && (
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={renderArt} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-xs">
                  刷新
                </button>
                <button onClick={() => {
                  const link = document.createElement('a');
                  link.download = 'mosaic-art.png';
                  link.href = outputCanvasRef.current?.toDataURL() || '';
                  link.click();
                }} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-xs">
                  下载
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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

                {/* 涂鸦状态: 画笔工具 */}
                {cameraStatus === 'idle' && (
                  <div className="space-y-3 flex-1">
                    {/* Brush/Eraser */}
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
                        onChange={(e) => setBrushSize(Number(e.target.value))}
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
                        onChange={(e) => setBrushOpacity(Number(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer"
                      />
                    </div>

                    {/* Color Palette - 2 rows */}
                    <div>
                      <span className="text-xs text-zinc-400 block mb-2">取色色盘</span>
                      <div className="grid grid-cols-5 gap-1">
                        {['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#808080', '#c0c0c0'].map((color) => (
                          <button
                            key={color}
                            onClick={() => setBrushColor(color)}
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
                        onChange={(e) => setBrushColor(e.target.value)}
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

                    {/* 去背景 */}
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
                        onChange={(e) => { setImageBrightness(Number(e.target.value)); applyImageAdjustments(); }}
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
                        onChange={(e) => { setImageContrast(Number(e.target.value)); applyImageAdjustments(); }}
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
                        onChange={(e) => { setImageSaturation(Number(e.target.value)); applyImageAdjustments(); }}
                        className="w-full h-1 bg-zinc-700 rounded appearance-none cursor-pointer mt-1"
                      />
                    </div>

                    {/* 确认按钮 */}
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

            {/* Footer: Save/Cancel buttons */}
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
                  {brushPresets.map((preset) => (
                    <div
                      key={preset.id}
                      className="p-3 bg-zinc-700 rounded-lg cursor-grab active:cursor-grabbing hover:bg-zinc-600 transition-colors"
                      draggable
                      onDragStart={(e) => handleDragStart(e, preset.id)}
                      onDragEnd={handleDragEnd}
                    >
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
                            应用
                          </button>
                          <button
                            onClick={() => deletePreset(preset.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                      {/* Preview thumbnails */}
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
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Persistent Brush Canvases - Always rendered, never unmounted */}
      <div className="hidden">
        {Array.from({ length: 10 }).map((_, index) => (
          <canvas
            key={`persistent-brush-${index}`}
            ref={(el) => { brushCanvasesRef.current[index] = el; }}
            width={100}
            height={100}
          />
        ))}
        {/* Persistent Source Canvas */}
        <canvas
          ref={(el) => { sourceCanvasRef.current = el; if (el && sourceCtxRef.current === null) { sourceCtxRef.current = el.getContext('2d'); } }}
          width={SOURCE_WIDTH}
          height={SOURCE_HEIGHT}
        />
      </div>

      {/* Sync display canvases with actual brush canvases */}
      <SyncDisplayCanvases trigger={brushUpdateTrigger} brushLayers={brushLayersRef.current} />

      {/* Sync source display canvas */}
      <SyncSourceDisplay trigger={sourceUpdateTrigger} sourceImageData={sourceImageDataRef.current} />
    </div>
  );
});