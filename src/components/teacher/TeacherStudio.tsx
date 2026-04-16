'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { TeacherParticleCanvas } from './TeacherParticleCanvas';

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

export function TeacherStudio() {
  const [dataSource, setDataSource] = useState<DataSource>('webcam');
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
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
  // 摄像头拍摄
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [removeWhiteBg, setRemoveWhiteBg] = useState(false);
  const [bgRemoveStrength, setBgRemoveStrength] = useState(128); // 0-255, 默认为128
  const [imageContrast, setImageContrast] = useState(100); // 0-200, 100为默认
  const [imageBrightness, setImageBrightness] = useState(100); // 0-200, 100为默认
  const [imageSaturation, setImageSaturation] = useState(100); // 0-200, 100为默认
  const [showBrushLibrary, setShowBrushLibrary] = useState(false);
  // 用于触发WebGL渲染器更新
  const [renderTrigger, setRenderTrigger] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const brushCanvasesRef = useRef<(HTMLCanvasElement | null)[]>([]);
  const brushLayersRef = useRef<(BrushLayer | null)[]>(Array(10).fill(null));

  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const outputCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const editingBrushCanvasRef = useRef<HTMLCanvasElement>(null);
  const editingLayerIndexRef = useRef<number | null>(null);
  const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
  // 存储当前编辑笔触的原始图像数据（用于图像调整）
  const editingOriginalImageRef = useRef<ImageData | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraPreviewRef = useRef<HTMLCanvasElement>(null);

  const animationFrameRef = useRef<number | null>(null);
  const renderLoopRef = useRef<boolean>(false);
  const isWebcamActiveRef = useRef(false);

  // 笔刷库：从 localStorage 加载
  const loadBrushPresets = useCallback(() => {
    try {
      const saved = localStorage.getItem('brushPresets');
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
      localStorage.setItem('brushPresets', JSON.stringify(presets));
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
      setRenderTrigger(t => t + 1);
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
    if (showCameraCapture && cameraStream) {
      updateCameraPreview();
    }
  }, [showCameraCapture, cameraStream, removeWhiteBg, bgRemoveStrength, updateCameraPreview]);

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
          outputCtx.drawImage(layer.canvas, 0, 0, 100, 100, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
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

  // 启动摄像头拍摄
  const startCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 200, height: 200, facingMode: 'environment' }
      });
      setCameraStream(stream);
      setShowCameraCapture(true);
    } catch (err) {
      console.error('Camera error:', err);
      alert('无法访问摄像头');
    }
  };

  // 停止摄像头拍摄
  const stopCameraCapture = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setShowCameraCapture(false);
  };

  // 拍摄照片（直接绘制到编辑画布）
  const takePhoto = () => {
    if (!cameraVideoRef.current || editingBrushIndex === null) return;

    const video = cameraVideoRef.current;
    const currentIndex = editingBrushIndex;

    // 创建临时 canvas 捕获原始图像
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 100;
    tempCanvas.height = 100;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // 绘制视频帧到临时 canvas
    tempCtx.drawImage(video, 0, 0, 100, 100);

    // 存储原始图像数据（用于图像调整）
    editingOriginalImageRef.current = tempCtx.getImageData(0, 0, 100, 100);

    // 绘制到笔触 canvas (100x100)
    const brushCanvas = brushCanvasesRef.current[currentIndex];
    if (brushCanvas) {
      const brushCtx = brushCanvas.getContext('2d');
      if (brushCtx) {
        brushCtx.clearRect(0, 0, 100, 100);
        brushCtx.drawImage(tempCanvas, 0, 0, 100, 100);
        brushLayersRef.current[currentIndex] = { canvas: brushCanvas, ctx: brushCtx, isDrawing: false };
      }
    }

    // 绘制到编辑器预览 (200x200)
    const editorCanvas = editingBrushCanvasRef.current;
    if (editorCanvas) {
      const editorCtx = editorCanvas.getContext('2d');
      if (editorCtx) {
        editorCtx.clearRect(0, 0, 200, 200);
        editorCtx.drawImage(tempCanvas, 0, 0, 200, 200);
      }
    }

    // 应用图像调整
    applyImageAdjustments();

    // 关闭相机
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setShowCameraCapture(false);

    // 触发渲染更新
    setRenderTrigger(t => t + 1);
  };

  // 应用图像调整到当前编辑的笔触
  const applyImageAdjustments = useCallback(() => {
    if (editingBrushIndex === null || !editingOriginalImageRef.current) return;

    const originalData = editingOriginalImageRef.current;
    const canvas = brushCanvasesRef.current[editingBrushIndex];
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 创建可写的图像数据副本
    const imageData = new ImageData(
      new Uint8ClampedArray(originalData.data),
      originalData.width,
      originalData.height
    );
    const data = imageData.data;

    // 应用图像调整
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 1. 亮度调整 (0-200, 100为默认值)
      const brightnessFactor = imageBrightness / 100;
      r = r * brightnessFactor;
      g = g * brightnessFactor;
      b = b * brightnessFactor;

      // 2. 对比度调整 (0-200, 100为默认值)
      const contrastFactor = imageContrast / 100;
      const contrastMid = 128;
      r = contrastMid + (r - contrastMid) * contrastFactor;
      g = contrastMid + (g - contrastMid) * contrastFactor;
      b = contrastMid + (b - contrastMid) * contrastFactor;

      // 3. 饱和度调整 (0-200, 100为默认值)
      const saturationFactor = imageSaturation / 100;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + (r - gray) * saturationFactor;
      g = gray + (g - gray) * saturationFactor;
      b = gray + (b - gray) * saturationFactor;

      // 4. 白色背景去除（越白越透明）
      if (removeWhiteBg) {
        const minComponent = Math.min(r, g, b);
        if (minComponent >= bgRemoveStrength) {
          // 白色（接近255）的部分更透明，阈值附近几乎不透明
          const range = 255 - bgRemoveStrength;
          const excess = (r + g + b) / 3 - bgRemoveStrength;
          data[i + 3] = Math.max(0, Math.min(255, 255 - excess * (255 / range)));
        }
      }

      // 确保值在有效范围内
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    ctx.putImageData(imageData, 0, 0);
    brushLayersRef.current[editingBrushIndex] = { canvas, ctx, isDrawing: false };

    // 更新编辑器预览
    const editorCanvas = editingBrushCanvasRef.current;
    if (editorCanvas) {
      const editorCtx = editorCanvas.getContext('2d');
      if (editorCtx) {
        editorCtx.clearRect(0, 0, 200, 200);
        editorCtx.drawImage(canvas, 0, 0, 200, 200);
      }
    }

    // 触发渲染更新
    setRenderTrigger(t => t + 1);
  }, [editingBrushIndex, removeWhiteBg, bgRemoveStrength, imageBrightness, imageContrast, imageSaturation]);

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
        setDataSource('image');
        setSourceResolution({ width: canvasWidth, height: canvasHeight });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const openBrushEditor = (index: number) => {
    editingLayerIndexRef.current = index;
    setEditingBrushIndex(index);
    setBrushColor('#000000');
    setTimeout(() => {
      const editorCanvas = editingBrushCanvasRef.current;
      const layer = brushLayersRef.current[index];
      if (editorCanvas && layer) {
        const ctx = editorCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 200, 200);
          ctx.drawImage(layer.canvas, 0, 0, 100, 100, 0, 0, 200, 200);
        }
      }
    }, 50);
  };

  const closeBrushEditor = () => {
    const editorCanvas = editingBrushCanvasRef.current;
    const index = editingLayerIndexRef.current;
    if (editorCanvas && index !== null) {
      const layer = brushLayersRef.current[index];
      if (layer) {
        const ctx = layer.ctx;
        ctx.clearRect(0, 0, 100, 100);
        ctx.drawImage(editorCanvas, 0, 0, 200, 200, 0, 0, 100, 100);
      }
    }
    editingLayerIndexRef.current = null;
    setEditingBrushIndex(null);
    setRenderTrigger(t => t + 1);
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
    const scale = 100 / 200;
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
    const scale = 100 / 200;
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

  useEffect(() => {
    return () => { stopRenderLoop(); };
  }, [stopRenderLoop]);

  return (
    <div className="flex h-full flex-col bg-[#09090b] text-[#fafafa]">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-[#27272a] bg-[#18181b] px-4">
        <h1 className="text-sm font-bold">Teacher Studio</h1>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#27272a] px-2 py-1 text-xs">{gridSizeX}x{gridSizeY}</span>
          <span className="rounded bg-[#27272a] px-2 py-1 text-xs">{sourceAspectRatio >= 1 ? 'Landscape' : 'Portrait'}</span>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
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
                onClick={() => { stopWebcam(); setDataSource('image'); }}
                className={`rounded px-2 py-1 text-xs ${dataSource === 'image' ? 'bg-blue-600 text-white' : 'bg-[#27272a] text-[#a1a1aa] hover:bg-[#3f3f46]'}`}
              >
                图片
              </button>
            </div>
            {dataSource === 'image' && (
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-xs hover:file:bg-blue-700 mb-2 w-full"
              />
            )}
            <div className="relative w-full bg-zinc-900 rounded-lg overflow-hidden border border-zinc-700" style={{ aspectRatio: sourceAspectRatio }}>
              <canvas ref={sourceCanvasRef} className="absolute inset-0 w-full h-full object-contain" />
              <video ref={videoRef} className={`absolute inset-0 w-full h-full object-cover transition-opacity ${dataSource === 'webcam' ? 'opacity-100' : 'opacity-0'}`} playsInline muted />
            </div>
          </div>

          {/* Brush Thumbnails */}
          <div>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="flex flex-col items-center">
                  <span
                    className="text-[8px] px-1 rounded mb-0.5"
                    style={{ backgroundColor: getLevelGray(index), color: index > 5 ? '#fff' : '#000' }}
                  >
                    {index}
                  </span>
                  <canvas
                    ref={(el) => { brushCanvasesRef.current[index] = el; }}
                    onClick={() => openBrushEditor(index)}
                    className="w-6 h-6 border border-zinc-600 rounded cursor-pointer hover:border-blue-500"
                    width={100}
                    height={100}
                    style={{ backgroundColor: 'transparent' }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-2">
              <button onClick={() => setShowBrushLibrary(true)} className="flex-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
                笔刷库
              </button>
              <button onClick={resetAllBrushes} className="flex-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-xs">
                重置
              </button>
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

          {/* Background Color Setting */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-zinc-500">背景色:</span>
            <input
              type="color"
              value={canvasBackgroundColor}
              onChange={(e) => setCanvasBackgroundColor(e.target.value)}
              className="w-6 h-6 rounded border border-zinc-600 cursor-pointer"
            />
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

            {/* Content: Canvas + Camera side by side */}
            <div className="flex">
              {/* Left: Brush Canvas - Square */}
              <div className="p-4">
                <div className="w-[200px] h-[200px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900">
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
                    width={200}
                    height={200}
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                    onMouseDown={handleEditingMouseDown}
                    onMouseMove={handleEditingMouseMove}
                    onMouseUp={handleEditingMouseUp}
                    onMouseLeave={handleEditingMouseUp}
                  />
                </div>
              </div>

              {/* Middle: Image Adjustment Controls */}
              <div className="p-4 border-l border-zinc-700 w-[180px]">
                <div className="text-xs text-zinc-400 mb-3">图像调整</div>
                <div className="space-y-3">
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
                </div>
              </div>

              {/* Right: Camera Area - Shown when active */}
              {showCameraCapture && cameraStream && (
                <div className="p-4 pl-0 border-l border-zinc-700">
                  {/* Viewfinder */}
                  <div className="w-[200px] h-[200px] rounded-lg overflow-hidden border border-zinc-600 relative bg-zinc-900">
                    <video
                      ref={cameraVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                    {/* Hidden canvas for processing */}
                    <canvas ref={cameraPreviewRef} className="hidden" />
                  </div>

                  {/* Action buttons */}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={takePhoto}
                      className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium text-white"
                    >
                      拍摄
                    </button>
                    <button
                      onClick={stopCameraCapture}
                      className="flex-1 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-white"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div className="px-4 py-3 border-t border-zinc-700 flex items-center gap-3">
              {/* Brush/Eraser */}
              <div className="flex gap-1">
                <button
                  onClick={() => setBrushMode('draw')}
                  className={`px-3 py-1.5 rounded text-xs ${brushMode === 'draw' ? 'bg-blue-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                >
                  画笔
                </button>
                <button
                  onClick={() => setBrushMode('erase')}
                  className={`px-3 py-1.5 rounded text-xs ${brushMode === 'erase' ? 'bg-red-600' : 'bg-zinc-700 hover:bg-zinc-600'}`}
                >
                  橡皮
                </button>
              </div>

              {/* Size slider */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">大小</span>
                <input
                  type="range"
                  min="2"
                  max="40"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-20 h-1 bg-zinc-700 rounded appearance-none cursor-pointer"
                />
                <span className="text-xs text-zinc-500 w-4">{brushSize}</span>
              </div>

              {/* Color picker */}
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => setBrushColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border border-zinc-600"
                />
                {/* Camera button - right of color picker */}
                {!showCameraCapture && (
                  <button
                    onClick={startCameraCapture}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    拍照
                  </button>
                )}
              </div>

              {/* Clear and Confirm - right side */}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => { if (editingBrushCanvasRef.current) { const ctx = editingBrushCanvasRef.current.getContext('2d'); if (ctx) ctx.clearRect(0, 0, 200, 200); } }}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-xs"
                >
                  清空
                </button>
                <button
                  onClick={closeBrushEditor}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-xs font-medium"
                >
                  确定
                </button>
              </div>
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
    </div>
  );
}
