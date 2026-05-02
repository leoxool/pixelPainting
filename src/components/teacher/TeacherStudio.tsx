'use client';

import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { TeacherParticleCanvas } from './TeacherParticleCanvas';
import { Toolbar } from './Toolbar';
import { BrushLibrary } from './BrushLibrary';
import { BrushEditorModal } from './BrushEditorModal';
import { BrushLibraryPanel } from './BrushLibraryPanel';
import { BrushCanvas } from './BrushCanvas';
import { BrushLayerGrid } from './BrushLayerGrid';
import { DataSourcePanel } from './RenderOutput/DataSourcePanel';
import { RenderOutputPanel } from './RenderOutput';
import { getLevelGray, extractGridData, renderArt } from './gridUtils';
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

  // getLevelGray and mapGrayscaleToLevel are now in gridUtils.ts

  const handleRenderArt = useCallback(() => {
    renderArt({
      outputCanvasRef,
      outputCtxRef,
      sourceCanvasRef,
      sourceCtxRef,
      brushLayersRef,
      sourceAspectRatio,
      gridSizeX,
      gridSizeY,
    });
  }, [sourceAspectRatio, gridSizeX, gridSizeY]);

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
              {/* Left: Single Brush Library */}
              <BrushLibraryPanel
                brushPresets={brushPresets}
                hoveredPresetId={hoveredPresetId}
                onHoverPreset={setHoveredPresetId}
                onSelectPreset={(preset) => {
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
                onDeletePreset={deletePreset}
                onImport={() => brushImportInputRef.current?.click()}
                onExport={async () => {
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
                }}
                brushImportInputRef={brushImportInputRef}
              />

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
                    <Toolbar
                      brushMode={brushMode}
                      brushSize={brushSize}
                      brushOpacity={brushOpacity}
                      brushColor={brushColor}
                      onBrushModeChange={setBrushMode}
                      onBrushSizeChange={setBrushSize}
                      onBrushOpacityChange={setBrushOpacity}
                      onBrushColorChange={setBrushColor}
                      colorInputRef={colorInputRef}
                    />
                  )}

                  <BrushCanvas
                    cameraStatus={cameraStatus}
                    singleBrushEditorRef={singleBrushEditorRef}
                    cameraVideoRef={cameraVideoRef}
                    cameraPreviewRef={cameraPreviewRef}
                    adjustmentPreviewRef={adjustmentPreviewRef}
                    editingOriginalImageRef={editingOriginalImageRef}
                    removeWhiteBg={removeWhiteBg}
                    bgRemoveStrength={bgRemoveStrength}
                    imageBrightness={imageBrightness}
                    imageContrast={imageContrast}
                    imageSaturation={imageSaturation}
                    onRemoveWhiteBgChange={setRemoveWhiteBg}
                    onBgRemoveStrengthChange={setBgRemoveStrength}
                    onBrightnessChange={setImageBrightness}
                    onContrastChange={setImageContrast}
                    onSaturationChange={setImageSaturation}
                    onConfirmPhoto={confirmPhoto}
                    onStartCameraCapture={startCameraCapture}
                    onCancelCameraCapture={cancelCameraCapture}
                    onTakePhoto={takePhoto}
                    onSaveToLibrary={() => {
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
                    onClearCanvas={() => {
                      const canvas = singleBrushEditorRef.current;
                      if (canvas) {
                        const ctx = canvas.getContext('2d');
                        if (ctx) ctx.clearRect(0, 0, 400, 400);
                      }
                    }}
                    handleEditingMouseDown={handleEditingMouseDown}
                    handleEditingMouseMove={handleEditingMouseMove}
                    handleEditingMouseUp={handleEditingMouseUp}
                  />
                </div>
              </div>
            </>
          ) : (
            /* Group Brush Edit Mode (Default) */
            <BrushLayerGrid
              brushUpdateTrigger={brushUpdateTrigger}
              draggedBrushId={draggedBrushId}
              onLayerClick={openBrushEditor}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              getLevelGray={getLevelGray}
            />
          )}
        </div>
      ) : (
        /* Render Output Tab */
        <div className="flex flex-1 overflow-hidden">
          <DataSourcePanel
            dataSource={dataSource}
            isWebcamActive={isWebcamActive}
            sourceAspectRatio={sourceAspectRatio}
            onDataSourceChange={setDataSource}
            onStartWebcam={startWebcam}
            onStopWebcam={stopWebcam}
            onImageUpload={handleImageUpload}
            onOpenBrushLibrary={() => setShowBrushLibrary(true)}
            imageInputRef={imageInputRef}
            videoRef={videoRef}
          />

          <RenderOutputPanel
            isWebcamActive={isWebcamActive}
            sourceAspectRatio={sourceAspectRatio}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            transform={transform}
            setTransform={setTransform}
            resetTransform={resetTransform}
            isPanning={isPanning}
            sourceResolution={sourceResolution}
            gridSizeX={gridSizeX}
            gridSizeY={gridSizeY}
            brushLayers={brushLayersRef.current}
            sourceCanvas={sourceCanvasRef.current}
            sizeJitter={sizeJitter}
            rotationJitter={rotationJitter}
            enableFlip={enableFlip}
            enableMergeOptimization={enableMergeOptimization}
            canvasBackgroundColor={canvasBackgroundColor}
            gridSamplingSize={gridSamplingSize}
            setGridSamplingSize={setGridSamplingSize}
            setSizeJitter={setSizeJitter}
            setRotationJitter={setRotationJitter}
            setEnableFlip={setEnableFlip}
            setEnableMergeOptimization={setEnableMergeOptimization}
            setCanvasBackgroundColor={setCanvasBackgroundColor}
            renderTrigger={renderTrigger}
            outputCanvasRef={outputCanvasRef}
            showSettingsPanel={showSettingsPanel}
            setShowSettingsPanel={setShowSettingsPanel}
            handleMouseDown={handleMouseDown}
            handleMouseMove={handleMouseMove}
            handleMouseUp={handleMouseUp}
            renderArt={handleRenderArt}
          />
        </div>
      )}

      {/* Brush Edit Modal */}
      {editingBrushIndex !== null && (
        <BrushEditorModal
          editingBrushIndex={editingBrushIndex}
          editingBrushCanvasRef={editingBrushCanvasRef}
          editingLayerIndexRef={editingLayerIndexRef}
          editingOriginalImageRef={editingOriginalImageRef}
          editingSnapshotRef={editingSnapshotRef}
          cameraStream={cameraStream}
          cameraVideoRef={cameraVideoRef}
          cameraPreviewRef={cameraPreviewRef}
          adjustmentPreviewRef={adjustmentPreviewRef}
          cameraStatus={cameraStatus}
          brushMode={brushMode}
          brushSize={brushSize}
          brushOpacity={brushOpacity}
          brushColor={brushColor}
          removeWhiteBg={removeWhiteBg}
          bgRemoveStrength={bgRemoveStrength}
          imageBrightness={imageBrightness}
          imageContrast={imageContrast}
          imageSaturation={imageSaturation}
          colorInputRef={colorInputRef}
          brushLayersRef={brushLayersRef}
          onBrushModeChange={setBrushMode}
          onBrushSizeChange={setBrushSize}
          onBrushOpacityChange={setBrushOpacity}
          onBrushColorChange={setBrushColor}
          onRemoveWhiteBgChange={(v) => { setRemoveWhiteBg(v); applyImageAdjustments(); }}
          onBgRemoveStrengthChange={(v) => { setBgRemoveStrength(v); applyImageAdjustments(); }}
          onBrightnessChange={(v) => { setImageBrightness(v); applyImageAdjustments(); }}
          onContrastChange={(v) => { setImageContrast(v); applyImageAdjustments(); }}
          onSaturationChange={(v) => { setImageSaturation(v); applyImageAdjustments(); }}
          onStartCameraCapture={startCameraCapture}
          onCancelCameraCapture={cancelCameraCapture}
          onTakePhoto={takePhoto}
          onConfirmPhoto={confirmPhoto}
          onClose={closeBrushEditor}
          onSave={saveBrushEditor}
          handleEditingMouseDown={handleEditingMouseDown}
          handleEditingMouseMove={handleEditingMouseMove}
          handleEditingMouseUp={handleEditingMouseUp}
        />
      )}

      {/* Brush Library Modal */}
      {showBrushLibrary && (
        <BrushLibrary
          brushPresets={brushPresets}
          currentPresetName={currentPresetName}
          onPresetNameChange={setCurrentPresetName}
          onSaveCurrentAsPreset={saveCurrentBrushAsPreset}
          onLoadPreset={loadPresetToCanvas}
          onDeletePreset={deletePreset}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onClose={() => setShowBrushLibrary(false)}
        />
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