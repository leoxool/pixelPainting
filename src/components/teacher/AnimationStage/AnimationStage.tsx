'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { useAudioManager } from './AudioManager';
import { useReferenceImages } from './ReferenceImageSequence';
import { useScriptParser } from './ScriptParser';
import { useAdvancedScriptParser } from './AdvancedScriptParser';
import { CameraController, CameraMode } from './CameraController';
import { LightSystem, LightConfig } from './LightSystem';
import { MaterialSystem } from './MaterialSystem';
import { MovementController, FormationConfig } from './MovementController';
import { PostProcessing } from './PostProcessing';
import { TimelineSynchronizer } from './TimelineSynchronizer';
import { BrushChoreographer } from './BrushChoreographer';
import { ArrayController } from './ArrayController';
import { TransitionEffects } from './TransitionEffects';
import {
  AnimatedBrush,
  AnimationStageState,
  DEFAULT_ANIMATION_SETTINGS,
  Vector3,
} from './types';

const MAX_BRUSH_LEVELS = 100; // Support up to 100 brush levels (like render output)
const LONGEST_EDGE = 80; // Longest edge will have 80 brushes

interface JitterSettings {
  sizeJitter: number;
  rotationJitter: number;
  opacityJitter: number;
  enableFlip: boolean;
}

interface BrushGroup {
  id: string;
  name: string;
  timestamp: number;
  slots: (string | null)[]; // BrushPreset IDs for levels 0-9
}

interface AdvancedAnimationSettings {
  cameraMode: CameraMode;
  followTargetId: string | null;
  followOffset: Vector3;
  lookAhead: number;
  dofEnabled: boolean;
  vignetteEnabled: boolean;
  useStandardMaterials: boolean;
  lightConfig: LightConfig[];
}

interface AnimationStageProps {
  brushGroups?: BrushGroup[];
  brushPresets?: { id: string; name: string; layers: (string | null)[] }[];
  onBrushGroupSelect?: (groupId: string) => void;
  onStateChange?: (state: AnimationStageState) => void;
  onError?: (error: Error) => void;
}

export function AnimationStage({
  brushGroups = [],
  brushPresets = [],
  onBrushGroupSelect,
  onStateChange,
  onError,
}: AnimationStageProps) {
  // Animation module's own grid size - dynamic based on reference image aspect ratio
  const [gridSizeX, setGridSizeX] = useState(LONGEST_EDGE);
  const [gridSizeY, setGridSizeY] = useState(LONGEST_EDGE);
  const [initKey, setInitKey] = useState(0); // Used to force reinit when grid size changes
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const instancedMeshesRef = useRef<THREE.InstancedMesh[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const isInitializedRef = useRef(false);
  const brushSizeRef = useRef<number>(20);
  const spacingRef = useRef<{ spacingX: number; spacingY: number }>({ spacingX: 20, spacingY: 15 });
  const brushSizeXYRef = useRef<{ x: number; y: number }>({ x: 20, y: 15 });
  const dimensionsRef = useRef<{ width: number; height: number }>({ width: 800, height: 600 });
  const offsetRef = useRef<{ offsetX: number; offsetY: number }>({ offsetX: 0, offsetY: 0 });
  const gridSizeRef = useRef<{ gridSizeX: number; gridSizeY: number }>({ gridSizeX: LONGEST_EDGE, gridSizeY: LONGEST_EDGE });
  const dummyRef = useRef<THREE.Object3D | null>(null);
  const gridCenterRef = useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });

  // New advanced animation controllers
  const cameraControllerRef = useRef<CameraController | null>(null);
  const lightSystemRef = useRef<LightSystem | null>(null);
  const materialSystemRef = useRef<MaterialSystem | null>(null);
  const movementControllerRef = useRef<MovementController | null>(null);
  const postProcessingRef = useRef<PostProcessing | null>(null);
  const timelineSyncerRef = useRef<TimelineSynchronizer | null>(null);
  const brushChoreographerRef = useRef<BrushChoreographer | null>(null);
  const arrayControllerRef = useRef<ArrayController | null>(null);
  const transitionEffectsRef = useRef<TransitionEffects | null>(null);

  // Brush positions for camera tracking
  const brushPositionsRef = useRef<Map<string, Vector3>>(new Map());

  // Preview animation refs (runs before script starts)
  const previewCleanupRef = useRef<(() => void) | null>(null);
  const previewIsRunningRef = useRef(false);

  // Shared tick proxy for roam animation
  const roamTickProxyRef = useRef<{ t: number }>({ t: 0 });

  // Track last formation reference to detect material-only changes
  const lastFormationRefIdRef = useRef<string | null>(null);

  // Advanced animation settings
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedAnimationSettings>({
    cameraMode: 'fixed',
    followTargetId: null,
    followOffset: { x: 0, y: 2, z: 5 },
    lookAhead: 3,
    dofEnabled: false,
    vignetteEnabled: false,
    useStandardMaterials: true,
    // High-key photography lighting - warm creamy tones
    lightConfig: [
      { type: 'ambient', intensity: 0.7, color: '#FFFAF0' }, // Warm ambient
      { type: 'directional', intensity: 1.0, color: '#FFFAF5', position: { x: 0, y: 10, z: 10 } }, // Soft main light
      { type: 'directional', intensity: 0.3, color: '#F0F5FF', position: { x: -5, y: 5, z: 5 } }, // Cool fill
    ],
  });

  // Animation module's own state - separate from render output
  const [brushes, setBrushes] = useState<AnimatedBrush[]>([]);
  const [stageState, setStageState] = useState<AnimationStageState>({
    status: 'idle',
    currentTime: 0,
    totalDuration: 10,
    currentClipIndex: 0,
    isPlaying: false,
    isLooping: false,
    playbackRate: DEFAULT_ANIMATION_SETTINGS.playbackRate,
    musicVolume: DEFAULT_ANIMATION_SETTINGS.musicVolume,
    musicEnabled: true,
  });

  // Animation module's own brush layers (can be loaded from presets)
  const [animationBrushLayers, setAnimationBrushLayers] = useState<(HTMLCanvasElement | null)[]>([]);
  const [brushLayersLoading, setBrushLayersLoading] = useState(false);  // Track if brush layers are still loading
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [jitterSettings, setJitterSettings] = useState<JitterSettings>({
    sizeJitter: 0,
    rotationJitter: 0,
    opacityJitter: 0,
    enableFlip: false,
  });
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showScriptPanel, setShowScriptPanel] = useState(false);
  const [animationScript, setAnimationScript] = useState<string>(`# 笔刷群动画脚本 - 三参考图轮换
# 格式: 指令 参数 time: 秒数 [duration: 秒数]

# 摄影机 - 正对原点
CAMERA position: {0, 0, 1000} lookAt: {0, 0, 0} time: 0 fov: 60

# 笔刷飞入
BRUSH_FLIGHT duration: 3 scatter: 800 time: 0 direction: left

# 参考图1 (index: 0)
FORMATION type: reference index: 0 time: 4 duration: 3

# 参考图2 (index: 1)
FORMATION type: reference index: 1 time: 9 duration: 3

# 参考图3 (index: 2)
FORMATION type: reference index: 2 time: 14 duration: 3

# 循环回参考图1
FORMATION type: reference index: 0 time: 19 duration: 3
`);

  const { images: referenceImages, addImage, removeImage, getNormalizedGridData } = useReferenceImages();
  const { parse: parseScript } = useScriptParser();
  const { parse: parseAdvancedScript } = useAdvancedScriptParser();
  const audioManager = useAudioManager({ volume: stageState.musicVolume });

  const [currentRefIndex, setCurrentRefIndex] = useState(0);
  const [gridData, setGridData] = useState<number[]>([]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Only initialize if we have valid brush layers
    const hasValidBrushLayers = animationBrushLayers.some(l => l !== null);
    if (!hasValidBrushLayers) {
      console.log('[AnimationStage] Skipping init - no brush layers');
      return;
    }

    // Check if already initialized
    if (isInitializedRef.current) {
      console.log('[AnimationStage] Skipping init - already initialized');
      return;
    }

    isInitializedRef.current = true;
    console.log('[AnimationStage] Creating scene with grid:', gridSizeX, 'x', gridSizeY);
    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    dimensionsRef.current = { width, height };
    gridSizeRef.current = { gridSizeX, gridSizeY };

    console.log('[AnimationStage] Creating simple test scene');

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    console.log('[AnimationStage] Renderer size set:', width, 'x', height);
    console.log('[AnimationStage] Canvas element:', renderer.domElement);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene - Dark background for dramatic effect
    const scene = new THREE.Scene();

    // Black background for animation mode
    const sceneBackground = 0x000000; // Pure black
    scene.background = new THREE.Color(sceneBackground);

    // Fog for seamless infinite extension (matches background)
    scene.fog = new THREE.Fog(sceneBackground, 800, 2500);

    sceneRef.current = scene;

    // Perspective Camera (advanced animation)
    const aspect = width / height;
    const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 5000);
    camera.position.set(0, 0, 1000);
    cameraRef.current = camera;

    // Calculate grid center for camera target (needs brush size/spacing calculated below)
    // Calculate grid center for camera target (needs camera reference)
    gridCenterRef.current = { x: 0, y: 0, z: 0 };
    camera.lookAt(0, 0, 0);

    console.log('[AnimationStage] Camera initialized - position:', camera.position.x, camera.position.y, camera.position.z);

    // Initialize Camera Controller
    const cameraController = new CameraController({
      camera,
      mode: advancedSettings.cameraMode,
    });
    cameraControllerRef.current = cameraController;

    // Initialize Light System - High-key lighting (bright, warm)
    const lightSystem = new LightSystem(scene);
    // High-key photography: bright, even lighting, warm tones
    lightSystem.init([
      { type: 'ambient', intensity: 0.7, color: '#FFFAF0' }, // Warm ambient
      { type: 'directional', intensity: 1.0, color: '#FFFAF5', position: { x: 0, y: 10, z: 10 } }, // Soft main light from above
      { type: 'directional', intensity: 0.3, color: '#F0F5FF', position: { x: -5, y: 5, z: 5 } }, // Cool fill from side
    ]);
    lightSystemRef.current = lightSystem;

    // Initialize Material System
    const materialSystem = new MaterialSystem();
    materialSystemRef.current = materialSystem;

    // Initialize Movement Controller
    const dummy = new THREE.Object3D();
    dummyRef.current = dummy;
    const movementController = new MovementController({
      dummy,
      brushSize: brushSizeXYRef.current,
    });
    movementControllerRef.current = movementController;

    // Initialize Post Processing
    const postProcessing = new PostProcessing({
      renderer,
      scene,
      camera,
      dofEnabled: advancedSettings.dofEnabled,
      vignetteEnabled: advancedSettings.vignetteEnabled,
    });
    postProcessingRef.current = postProcessing;

    // Initialize Timeline Synchronizer
    const timelineSyncer = new TimelineSynchronizer({ bpm: 120 });
    timelineSyncerRef.current = timelineSyncer;

    // Initialize Brush Choreographer (brush animation forms)
    const brushChoreographer = new BrushChoreographer(scene);
    brushChoreographerRef.current = brushChoreographer;

    // Initialize Array Controller (array-level effects)
    const arrayController = new ArrayController();
    arrayControllerRef.current = arrayController;

    // Initialize Transition Effects (cinematic transitions)
    const transitionEffects = new TransitionEffects(scene);
    transitionEffectsRef.current = transitionEffects;

    // Calculate brush size and spacing - brushes touch each other, grid centered
    // Calculate brush size to fit grid properly
    const brushSize = Math.min(width / gridSizeX, height / gridSizeY);
    const spacingX = brushSize;
    const spacingY = brushSize;
    const totalGridWidth = spacingX * gridSizeX;
    const totalGridHeight = spacingY * gridSizeY;
    const offsetX = (width - totalGridWidth) / 2;
    const offsetY = (height - totalGridHeight) / 2;
    brushSizeRef.current = brushSize;
    brushSizeXYRef.current = { x: brushSize, y: brushSize };
    spacingRef.current = { spacingX, spacingY };
    offsetRef.current = { offsetX, offsetY };

    // Update grid center now that offsetX, offsetY are calculated
    const gridCenterX = offsetX + totalGridWidth / 2;
    const gridCenterY = offsetY + totalGridHeight / 2;
    gridCenterRef.current = { x: gridCenterX, y: gridCenterY, z: 0 };
    camera.lookAt(gridCenterX, gridCenterY, 0);
    console.log('[AnimationStage] Grid center updated:', gridCenterX.toFixed(1), 'x', gridCenterY.toFixed(1));
    console.log('[AnimationStage] Camera lookAt target:', gridCenterX.toFixed(1), gridCenterY.toFixed(1), '0');

    // Create instanced mesh - unit size plane, scale via matrix to maintain square aspect
    const geometry = new THREE.PlaneGeometry(1, 1);
    const meshsByLevel: THREE.InstancedMesh[] = [];

    for (let level = 0; level < MAX_BRUSH_LEVELS; level++) {
      const canvas = animationBrushLayers[level];
      let texture: THREE.Texture | null = null;

      if (canvas && canvas.width > 0 && canvas.height > 0) {
        // Use actual brush canvas texture
        texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        console.log('[AnimationStage] Loaded texture for level', level, 'canvas:', canvas.width, 'x', canvas.height);
      } else {
        // No placeholder - skip this level
        console.log('[AnimationStage] Skipping level', level, '- no brush canvas');
        continue;
      }

      // Use MeshStandardMaterial for lighting support when advanced mode enabled
      const material = advancedSettings.useStandardMaterials
        ? new THREE.MeshStandardMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            metalness: 0,
            roughness: 1,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
          });

      const count = gridSizeX * gridSizeY;
      const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
      meshsByLevel.push(instancedMesh);
    }
    instancedMeshesRef.current = meshsByLevel;

    // Initialize brushes with correct positions
    const newBrushes: AnimatedBrush[] = [];

    for (let i = 0; i < gridSizeX * gridSizeY; i++) {
      const col = i % gridSizeX;
      const row = Math.floor(i / gridSizeX);
      // Centered grid with brushes touching each other
      // Flip Y so row 0 (top of image) appears at top of screen
      const x = offsetX + col * spacingX + brushSize / 2;
      const y = offsetY + (gridSizeY - 1 - row) * spacingY + brushSize / 2;
      const level = i % MAX_BRUSH_LEVELS;

      newBrushes.push({
        id: `brush-${i}`,
        presetId: '',
        level,
        gridIndex: i,
        position: { x, y, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1,
        opacity: 1,
        targetPosition: { x, y, z: 0 },
        scatterPosition: { x: -100, y, z: 0 },
        progress: 1,
      });
    }
    setBrushes(newBrushes);
    console.log('[AnimationStage] Created', newBrushes.length, 'brushes');

    // Set initial positions HIDDEN - will be revealed by preview or script animation
    const initDummy = new THREE.Object3D();
    meshsByLevel.forEach((mesh, level) => {
      for (let i = 0; i < gridSizeX * gridSizeY; i++) {
        // Hide all brushes initially - preview animation will reveal them
        initDummy.position.set(-5000, -5000, 0);
        initDummy.scale.set(0, 0, 1);
        initDummy.rotation.set(0, 0, 0);
        initDummy.updateMatrix();
        mesh.setMatrixAt(i, initDummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    });

    // Start preview animation: slow random roam with camera dolly
    // This runs until user starts a script animation
    const previewTimeline = gsap.timeline({ repeat: -1, yoyo: true });
    const previewProxy = { roamT: 0, cameraZ: 300 }; // Start at furthest (300), dolly in to 140
    let previewRoamAngle = 0;
    let previewRoamTime = 0;

    previewTimeline.to(previewProxy, {
      cameraZ: 140, // Dolly in to 140, yoyo will go back to 300
      duration: 8,
      ease: 'sine.inOut',
      onUpdate: () => {
        if (cameraRef.current && gridCenterRef.current) {
          // Camera always faces the grid center during preview
          cameraRef.current.position.set(gridCenterRef.current.x, gridCenterRef.current.y, previewProxy.cameraZ);
          cameraRef.current.lookAt(gridCenterRef.current.x, gridCenterRef.current.y, gridCenterRef.current.z);
        }
      }
    }, 0);

    // Preview: slow roam animation running continuously
    let previewAnimFrame: number;
    const runPreviewRoam = () => {
      if (!brushChoreographerRef.current || !dummyRef.current) {
        previewAnimFrame = requestAnimationFrame(runPreviewRoam);
        return;
      }
      previewRoamTime += 0.016; // ~60fps
      const roamParams = {
        speed: 0.2,
        amplitude: 300,
        rangeX: 0.5,
        rangeY: 0.4,
        rangeZ: 0.2,
        swimSpeed: 0.8,
      };
      brushChoreographerRef.current.randomRoamBrushes(
        newBrushes,
        roamParams,
        previewRoamTime,
        (brush, pos) => {
          const mesh = meshsByLevel[brush.level];
          if (mesh && dummyRef.current) {
            dummyRef.current.position.set(pos.x, pos.y, pos.z);
            dummyRef.current.scale.set(brushSize, brushSize, 1);
            dummyRef.current.updateMatrix();
            mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
          }
          brushPositionsRef.current.set(brush.id, pos);
        }
      );
      meshsByLevel.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
      previewAnimFrame = requestAnimationFrame(runPreviewRoam);
    };
    runPreviewRoam();

    // Store preview cleanup
    previewCleanupRef.current = () => {
      if (previewAnimFrame) cancelAnimationFrame(previewAnimFrame);
      previewTimeline.kill();
    };
    previewIsRunningRef.current = true;

    // Render loop with advanced animation updates
    let lastTime = performance.now();
    const animate = () => {
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        const currentTime = performance.now();
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // Update camera controller (handles follow mode, FOV animation)
        if (cameraControllerRef.current) {
          cameraControllerRef.current.update(deltaTime, brushPositionsRef.current);
        }

        // Camera follows grid center only when NOT in orbit mode and NOT in follow mode and NOT in preview
        if (cameraRef.current && gridCenterRef.current && !cameraControllerRef.current?.isInRandomOrbitMode() && !previewIsRunningRef.current) {
          const mode = cameraControllerRef.current?.getMode?.();
          if (mode !== 'follow') {
            const cam = cameraRef.current;
            const center = gridCenterRef.current;
            // Keep z position fixed, xy follows center
            cam.position.x = center.x;
            cam.position.y = center.y;
            cam.lookAt(center.x, center.y, center.z);
          }
        }

        // Render with post-processing if enabled
        if (postProcessingRef.current && postProcessingRef.current) {
          postProcessingRef.current.render();
        } else {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      // Dispose advanced controllers
      cameraControllerRef.current?.stop();
      lightSystemRef.current?.dispose();
      materialSystemRef.current?.dispose();
      movementControllerRef.current?.dispose();
      postProcessingRef.current?.dispose();
      timelineSyncerRef.current?.dispose();
      brushChoreographerRef.current?.dispose();
      arrayControllerRef.current?.dispose();
      transitionEffectsRef.current?.dispose();
      // Stop preview animation
      previewCleanupRef.current?.();
      // Reset init flag so next init can happen with new grid size
      isInitializedRef.current = false;
    };
  }, [gridSizeX, gridSizeY, animationBrushLayers, advancedSettings]);

  const play = useCallback(() => {
    console.log('[AnimationStage] Play called');
    console.log('[AnimationStage] - brushes:', brushes.length);
    console.log('[AnimationStage] - meshsByLevel:', instancedMeshesRef.current?.length);
    console.log('[AnimationStage] - referenceImages:', referenceImages.length, 'currentRefIndex:', currentRefIndex);
    console.log('[AnimationStage] - animationBrushLayers valid:', animationBrushLayers.some(l => l !== null));
    console.log('[AnimationStage] - offsetRef:', offsetRef.current);
    console.log('[AnimationStage] - brushSizeRef:', brushSizeRef.current);
    if (stageState.isPlaying) return;

    // Stop preview animation before starting script animation
    if (previewCleanupRef.current && previewIsRunningRef.current) {
      previewCleanupRef.current();
      previewIsRunningRef.current = false;
    }

    setStageState(prev => ({ ...prev, status: 'playing', isPlaying: true }));

    const meshsByLevel = instancedMeshesRef.current;
    const playDummy = dummyRef.current || new THREE.Object3D();

    // Helper to update all meshes based on current brush state
    // Use formationBrushSize to match reference grid spacing
    const updateAllMeshes = (brushList: typeof brushes) => {
      meshsByLevel.forEach((mesh, level) => {
        for (let i = 0; i < gridSizeX * gridSizeY; i++) {
          const brush = brushList[i];
          if (brush.level === level) {
            playDummy.position.set(brush.position.x, brush.position.y, brush.position.z);
            playDummy.scale.set(formationBrushSize, formationBrushSize, 1);
            playDummy.updateMatrix();
            mesh.setMatrixAt(i, playDummy.matrix);
            // Update brush positions for camera tracking
            brushPositionsRef.current.set(brush.id, brush.position);
          } else {
            playDummy.position.set(-5000, -5000, 0);
            playDummy.scale.set(0, 0, 1);
            playDummy.updateMatrix();
            mesh.setMatrixAt(i, playDummy.matrix);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
    };

    // First: update brush levels and target positions from reference image
    let brushesWithUpdatedLevels = brushes;
    let formationBrushSize = brushSizeXYRef.current.x; // default to animation brush size
    let refOffsetX = 0;
    let refOffsetY = 0;
    if (referenceImages.length > 0) {
      // Get current reference image
      const currentRef = referenceImages[currentRefIndex];

      // Calculate spacing based on canvas dimensions and REFERENCE IMAGE grid size
      const canvasWidth = dimensionsRef.current.width;
      const canvasHeight = dimensionsRef.current.height;
      const refCols = currentRef.gridSizeX;
      const refRows = currentRef.gridSizeY;
      formationBrushSize = Math.min(canvasWidth / refCols, canvasHeight / refRows);
      refOffsetX = (canvasWidth - formationBrushSize * refCols) / 2;
      refOffsetY = (canvasHeight - formationBrushSize * refRows) / 2;

      // Get normalized data using the grid dimensions (not brush index)
      const loadedLevelCount = animationBrushLayers.filter(l => l !== null).length;
      const normalizedData = getNormalizedGridData(currentRef.id, loadedLevelCount);

      if (normalizedData) {
        console.log('[AnimationStage] Updating brush levels from reference image, ref grid:', currentRef.gridSizeX, 'x', currentRef.gridSizeY, 'refDataLen:', normalizedData.length);

        brushesWithUpdatedLevels = brushes.map((brush, brushIdx) => {
          // Calculate grid position from brush's gridIndex using REFERENCE grid dimensions
          // This handles non-square references correctly
          const col = brush.gridIndex % currentRef.gridSizeX;
          const row = Math.floor(brush.gridIndex / currentRef.gridSizeX);

          // Calculate luminance index using row-major indexing (same as TeacherParticleCanvas)
          const luminanceIndex = row * currentRef.gridSizeX + col;

          // Only update brushes that fit within the reference image grid
          // Use normalizedData.length to determine actual reference data size
          if (luminanceIndex >= normalizedData.length) {
            // Hide brushes that are outside the reference image area
            return {
              ...brush,
              level: 0,
              position: { x: -5000, y: -5000, z: 0 },
              targetPosition: { x: -5000, y: -5000, z: 0 }
            };
          }

          // Calculate target position based on REFERENCE IMAGE grid size
          // Flip Y so row 0 (top of image) appears at top of screen
          const targetX = refOffsetX + col * formationBrushSize + formationBrushSize / 2;
          const targetY = refOffsetY + (currentRef.gridSizeY - 1 - row) * formationBrushSize + formationBrushSize / 2;

          const newLevel = normalizedData[luminanceIndex];

          return {
            ...brush,
            level: newLevel,
            position: { x: -5000, y: -5000, z: 0 }, // Start hidden
            targetPosition: { x: targetX, y: targetY, z: 0 }
          };
        });
        setBrushes(brushesWithUpdatedLevels);
        updateAllMeshes(brushesWithUpdatedLevels);
      }
    }

    // Immediately hide all brushes before animation starts
    meshsByLevel.forEach((mesh) => {
      for (let i = 0; i < gridSizeX * gridSizeY; i++) {
        playDummy.position.set(-5000, -5000, 0);
        playDummy.scale.set(0, 0, 1);
        playDummy.updateMatrix();
        mesh.setMatrixAt(i, playDummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });

    // Create timeline with two phases:
    // Phase 1: Scatter brushes off-screen
    // Phase 2: Fly to target positions
    const tl = gsap.timeline({
      onUpdate: () => setStageState(prev => ({ ...prev, currentTime: tl.time() })),
      onComplete: () => {
        setStageState(prev => ({ ...prev, status: 'completed', isPlaying: false }));
        if (referenceImages.length > 1) {
          setCurrentRefIndex(prev => (prev + 1) % referenceImages.length);
        }
      },
    });

    // Phase 1: Scatter - brushes fly in from off-screen left to scattered positions (0-1.5s)
    console.log('[AnimationStage] Phase 1: Scatter');
    const { width, height } = dimensionsRef.current;
    const currentRef = referenceImages[currentRefIndex];
    // Calculate actual reference brush count based on reference grid dimensions
    const refBrushCount = currentRef.gridSizeX * currentRef.gridSizeY;

    // Pre-calculate scatter positions
    const scatterPositions = brushesWithUpdatedLevels.map((brush) => {
      // Random scattered positions across the visible area
      const scatterX = Math.random() * width * 0.8 + width * 0.1;
      const scatterY = Math.random() * height * 0.8 + height * 0.1;
      return { x: scatterX, y: scatterY };
    });

    brushesWithUpdatedLevels.forEach((brush, index) => {
      // Skip brushes that are outside reference image bounds (hidden)
      if (brush.targetPosition.x === -5000 && brush.targetPosition.y === -5000) return;

      const scatterPos = scatterPositions[index];
      // Start from off-screen left (-brushSize)
      const proxy = { x: -brushSizeRef.current, y: scatterPos.y };

      tl.to(proxy, {
        x: scatterPos.x,
        y: scatterPos.y,
        duration: 1.5,
        ease: 'power2.out',
        delay: index * 0.0002,
        onUpdate: () => {
          const mesh = meshsByLevel[brush.level];
          if (mesh) {
            playDummy.position.set(proxy.x, proxy.y, 0);
            playDummy.scale.set(formationBrushSize, formationBrushSize, 1);
            playDummy.updateMatrix();
            mesh.setMatrixAt(brush.gridIndex, playDummy.matrix);
            mesh.instanceMatrix.needsUpdate = true;
          }
        },
        onComplete: () => {
          if (index === 0) console.log('[AnimationStage] Scatter complete');
        },
      }, 0);
    });

    // Phase 2: Fly to target positions to form image (1.5-4.5s)
    console.log('[AnimationStage] Phase 2: Fly to target');
    brushesWithUpdatedLevels.forEach((brush, index) => {
      // Skip brushes that are outside reference image bounds (hidden)
      if (brush.targetPosition.x === -5000 && brush.targetPosition.y === -5000) return;

      const startPos = scatterPositions[index];
      const proxy = { x: startPos.x, y: startPos.y };

      tl.to(proxy, {
        x: brush.targetPosition.x,
        y: brush.targetPosition.y,
        duration: 3,
        ease: 'power3.out',
        delay: index * 0.0002,
        onUpdate: () => {
          const mesh = meshsByLevel[brush.level];
          if (mesh) {
            playDummy.position.set(proxy.x, proxy.y, 0);
            playDummy.scale.set(formationBrushSize, formationBrushSize, 1);
            playDummy.updateMatrix();
            mesh.setMatrixAt(brush.gridIndex, playDummy.matrix);
            mesh.instanceMatrix.needsUpdate = true;
          }
        },
      }, 1.5);
    });

    // Get camera reference for all phases
    const cam = cameraRef.current;

    // Phase 0: Camera quickly zoom in close to brushes (~100 distance) at start
    console.log('[AnimationStage] Phase 0: Camera zoom close');
    if (cam) {
      tl.to(cam.position, {
        z: 100,
        duration: 0.5,
        ease: 'power2.in',
      }, 0);
    }

    // Phase 3: Camera dolly out during formation (1.5-4.5s) to show full reference image
    console.log('[AnimationStage] Phase 3: Camera dolly out');
    if (cam) {
      // Calculate camera Z position to fit full reference image in view
      const refCols = currentRef.gridSizeX;
      const refRows = currentRef.gridSizeY;
      const refWidth = refCols * formationBrushSize;
      const refHeight = refRows * formationBrushSize;
      // Target Z to see full reference with margin: based on larger dimension
      const targetZ = Math.max(refWidth, refHeight) * 1.2;

      // Camera gradually pulls back during the formation animation
      tl.to(cam.position, {
        z: targetZ,
        duration: 3,
        ease: 'power1.out',
      }, 1.5);

      // Also center the camera lookAt on the reference image
      if (cameraControllerRef.current) {
        cameraControllerRef.current.setLookAt(width / 2, height / 2, 0);
      }
    }

    timelineRef.current = tl;
    tl.play();
  }, [brushes, stageState.isPlaying, referenceImages, currentRefIndex, getNormalizedGridData, brushSizeRef, spacingRef, dimensionsRef]);

  const stop = useCallback(() => {
    timelineRef.current?.kill();
    setStageState(prev => ({ ...prev, status: 'idle', isPlaying: false, currentTime: 0 }));
  }, []);

  const pause = useCallback(() => {
    timelineRef.current?.pause();
    setStageState(prev => ({ ...prev, status: 'paused', isPlaying: false }));
  }, []);

  // ========== Advanced Animation Test Functions ==========

  const testCameraZoom = useCallback(() => {
    console.log('[Test] Camera FOV Zoom');
    if (!cameraControllerRef.current || !cameraRef.current) return;
    cameraControllerRef.current.animateFov(30, 3); // Zoom in to 30
    setTimeout(() => cameraControllerRef.current?.animateFov(90, 3), 3000); // Zoom out to 90
  }, []);

  const testCameraFollow = useCallback(() => {
    console.log('[Test] Camera Follow');
    if (!cameraControllerRef.current || brushes.length === 0) return;
    // Pick a middle brush as target
    const targetBrush = brushes[Math.floor(brushes.length / 2)];
    cameraControllerRef.current.setMode('follow');
    cameraControllerRef.current.setFollowTarget({
      brushId: targetBrush.id,
      offset: { x: 0, y: 2, z: 5 },
      lookAhead: 3,
    });
    console.log('[Test] Following brush:', targetBrush.id);
  }, [brushes]);

  const testCameraPath = useCallback(() => {
    console.log('[Test] Camera Path Keyframes');
    if (!cameraControllerRef.current) return;
    cameraControllerRef.current.setMode('fixed');
    cameraControllerRef.current.setKeyFrames([
      { time: 0, position: { x: 0, y: 0, z: 1000 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 60 },
      { time: 2, position: { x: 200, y: 100, z: 800 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 45 },
      { time: 4, position: { x: -200, y: -100, z: 800 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 45 },
      { time: 6, position: { x: 0, y: 0, z: 1000 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 60 },
    ]);
    cameraControllerRef.current.playKeyFrames(0);
  }, []);

  const testLightIntensity = useCallback(() => {
    console.log('[Test] Light Intensity Animation');
    if (!lightSystemRef.current) return;
    lightSystemRef.current.animateIntensity('ambient', 0.1, 2);
    setTimeout(() => lightSystemRef.current?.animateIntensity('ambient', 0.8, 2), 2000);
    setTimeout(() => lightSystemRef.current?.animateIntensity('directional', 0.2, 2), 4000);
    setTimeout(() => lightSystemRef.current?.animateIntensity('directional', 1.2, 2), 6000);
  }, []);

  const testLightColor = useCallback(() => {
    console.log('[Test] Light Color Animation');
    if (!lightSystemRef.current) return;
    lightSystemRef.current.animateColor('point', '#ff0000', 2); // Red
    setTimeout(() => lightSystemRef.current?.animateColor('point', '#00ff00', 2), 2000); // Green
    setTimeout(() => lightSystemRef.current?.animateColor('point', '#0000ff', 2), 4000); // Blue
    setTimeout(() => lightSystemRef.current?.animateColor('point', '#ffffff', 2), 6000); // White
  }, []);

  const testFormation = useCallback((type: 'circle' | 'line' | 'scatter') => {
    console.log('[Test] Formation:', type);
    if (!movementControllerRef.current || brushes.length === 0 || !dummyRef.current) return;
    const dummy = dummyRef.current;

    // Calculate brush size for consistent sizing
    const width = dimensionsRef.current.width;
    const height = dimensionsRef.current.height;
    const animBrushSize = Math.min(width / gridSizeX, height / gridSizeY);

    movementControllerRef.current.flyInBrushes(
      brushes,
      'left',
      2,
      0.0002,
      0.5,
      'power2.out',
      width,
      height,
      undefined, // no external timeline
      0,
      (brush: AnimatedBrush, pos: Vector3) => {
        // Update mesh position
        const mesh = instancedMeshesRef.current[brush.level];
        if (mesh) {
          dummy.position.set(pos.x, pos.y, pos.z);
          dummy.scale.set(animBrushSize, animBrushSize, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(brush.gridIndex, dummy.matrix);
          mesh.instanceMatrix.needsUpdate = true;
        }
        brushPositionsRef.current.set(brush.id, pos);
      },
      () => {
        console.log('[Test] Fly in complete, now forming:', type);
        // Now animate to formation
        const formationPositions = movementControllerRef.current!.calculateFormation(
          brushes.length,
          { type, spacing: 30, axis: 'x' },
          gridSizeX,
          gridSizeY
        );
        movementControllerRef.current!.animateToFormation(
          brushes,
          formationPositions,
          3,
          0.0002,
          'power3.out',
          undefined, // Use default starting positions
          undefined, // no external timeline
          0,
          (brush: AnimatedBrush, pos: Vector3) => {
            const mesh = instancedMeshesRef.current[brush.level];
            if (mesh) {
              dummy.position.set(pos.x, pos.y, pos.z);
              dummy.scale.set(animBrushSize, animBrushSize, 1);
              dummy.updateMatrix();
              mesh.setMatrixAt(brush.gridIndex, dummy.matrix);
              mesh.instanceMatrix.needsUpdate = true;
            }
            brushPositionsRef.current.set(brush.id, pos);
          }
        );
      }
    );
  }, [brushes, gridSizeX, gridSizeY]);

  const testDOF = useCallback(() => {
    console.log('[Test] Depth of Field');
    if (!postProcessingRef.current) return;
    postProcessingRef.current.setDOFEnabled(true);
    postProcessingRef.current.animateBlurAmount(0.5, 2);
    setTimeout(() => postProcessingRef.current?.animateFocusDistance(0.8, 2), 2000);
    setTimeout(() => postProcessingRef.current?.animateFocusDistance(0.2, 2), 4000);
    setTimeout(() => postProcessingRef.current?.animateBlurAmount(0, 2), 6000);
  }, []);

  const testVignette = useCallback(() => {
    console.log('[Test] Vignette');
    if (!postProcessingRef.current) return;
    postProcessingRef.current.setVignetteEnabled(true);
    postProcessingRef.current.animateVignette(1.5, 1.0, 1);
    setTimeout(() => postProcessingRef.current?.animateVignette(0.8, 1.5, 1), 1000);
    setTimeout(() => postProcessingRef.current?.animateVignette(1.2, 1.0, 1), 2000);
    setTimeout(() => postProcessingRef.current?.setVignetteEnabled(false), 3000);
  }, []);

  const testAdvancedScript = useCallback(() => {
    console.log('[Test] Running Advanced Script');
    if (!cameraControllerRef.current || !lightSystemRef.current || !postProcessingRef.current) return;

    const script = `# Camera Tests
CAMERA position: {900, 450, 1000} lookAt: {0, 0, 0} time: 0
CAMERA_ZOOM fov: 60 time: 0 duration: 1

# Light Tests
LIGHT_INTENSITY type: ambient value: 0.3 time: 0 duration: 1
LIGHT_INTENSITY type: directional value: 0.8 time: 2 duration: 2
LIGHT_COLOR type: point color: #ffaa00 time: 4 duration: 2

# DOF Effect
DOF_BLUR amount: 0.3 time: 2 duration: 1
DOF_FOCUS distance: 0.5 time: 4 duration: 1

# Vignette
VIGNETTE darkness: 1.3 offset: 1.0 time: 6 duration: 1

# Formation
FORMATION type: circle spacing: 30 time: 8 duration: 3
`;

    const parsed = parseAdvancedScript(script);
    console.log('[Test] Parsed commands:', parsed.commands.length);

    // Execute each command type
    parsed.commands.forEach(cmd => {
      console.log('[Test] Executing:', cmd.type, 'at time:', cmd.time);
      switch (cmd.type) {
        case 'CAMERA_MOVE':
          if (cameraControllerRef.current && cmd.params.position && cmd.params.lookAt) {
            const pos = cmd.params.position as { x: number; y: number; z: number };
            const lookAt = cmd.params.lookAt as { x: number; y: number; z: number };
            gsap.to(cameraControllerRef.current.getCamera().position, {
              x: pos.x, y: pos.y, z: pos.z,
              duration: cmd.params.duration as number || 2,
              delay: cmd.time,
              ease: 'power2.inOut',
            });
            // Also set the lookAt target
            cameraControllerRef.current.setLookAt(lookAt.x, lookAt.y, lookAt.z);
          }
          break;
        case 'CAMERA_ZOOM':
          cameraControllerRef.current?.animateFov(cmd.params.fov as number, cmd.params.duration as number || 2);
          break;
        case 'LIGHT_INTENSITY':
          lightSystemRef.current?.animateIntensity(
            cmd.params.lightType as 'ambient' | 'directional' | 'point',
            cmd.params.value as number,
            cmd.params.duration as number || 1
          );
          break;
        case 'LIGHT_COLOR':
          lightSystemRef.current?.animateColor(
            cmd.params.lightType as 'ambient' | 'directional' | 'point',
            cmd.params.color as string,
            cmd.params.duration as number || 1
          );
          break;
        case 'DOF_BLUR':
          postProcessingRef.current?.setDOFEnabled(true);
          postProcessingRef.current?.animateBlurAmount(cmd.params.amount as number, cmd.params.duration as number || 1);
          break;
        case 'DOF_FOCUS':
          postProcessingRef.current?.animateFocusDistance(cmd.params.distance as number, cmd.params.duration as number || 1);
          break;
        case 'VIGNETTE':
          postProcessingRef.current?.setVignetteEnabled(true);
          postProcessingRef.current?.animateVignette(
            cmd.params.darkness as number,
            cmd.params.offset as number,
            cmd.params.duration as number || 1
          );
          break;
      }
    });
  }, [parseAdvancedScript]);

  // Default script template
  const defaultScript = `# 笔刷群动画脚本范例
# 格式: 指令 参数 time: 秒数 [duration: 秒数]

# 初始相机位置 - 笔刷整列中心在原点
CAMERA position: {900, 450, 1000} lookAt: {0, 0, 0} time: 0 fov: 60

# 灯光渐亮
LIGHT_INTENSITY type: ambient value: 0.5 time: 0 duration: 2
LIGHT_INTENSITY type: directional value: 0.8 time: 0 duration: 2

# 笔刷飞入
BRUSH_FLIGHT duration: 3 scatter: 800 time: 0 direction: left

# 聚合成参考图1 (需要先加载参考图)
# 语法: FORMATION type: reference index: 参考图索引 time: 秒 duration: 秒
FORMATION type: reference index: 0 time: 4 duration: 3

# 相机围绕原点缓慢旋转 - 半径1000，高度300，低速度
CAMERA_ORBIT radius: 1000 speed: 0.15 height: 300 time: 4

# 继续旋转直到动画结束
CAMERA_MODE mode: orbit time: 15
`;

  // Execute animation script - main function to run script commands
  // All commands are added to a single GSAP timeline for unified play/pause/seek
  const executeScript = useCallback((scriptText: string) => {
    console.log('[AnimationStage] ========== EXECUTING SCRIPT ==========');
    console.log('[AnimationStage] Script length:', scriptText.length, 'chars');

    if (!scriptText.trim()) {
      console.warn('[AnimationStage] Empty script, skipping');
      return;
    }

    const parsed = parseAdvancedScript(scriptText);
    console.log('[AnimationStage] Parsed', parsed.commands.length, 'commands, duration:', parsed.duration, 's');
    console.log('[AnimationStage] Markers:', Array.from(parsed.markers.keys()).join(', '));
    console.log('[AnimationStage] Commands:', parsed.commands.map(c => `${c.type}@${c.time}s`).join(', '));

    // Calculate formation brush size based on animation grid for consistent sizing
    const canvasWidth = dimensionsRef.current.width;
    const canvasHeight = dimensionsRef.current.height;
    const animBrushSize = Math.min(canvasWidth / gridSizeX, canvasHeight / gridSizeY);

    // Stop any existing animations first
    timelineRef.current?.kill();

    // CRITICAL: Stop BOTH preview animation AND brush choreographer roaming before script runs
    // This prevents preview loop from overwriting script animations
    if (previewCleanupRef.current && previewIsRunningRef.current) {
      previewCleanupRef.current();
      previewIsRunningRef.current = false;
    }
    // Also stop the brush choreographer to prevent any residual roaming
    brushChoreographerRef.current?.stopAll();

    // CRITICAL: Reset all brushes to hidden position and clear state before running new script
    // This prevents contamination from previous animations (including default load animation)
    if (dummyRef.current) {
      instancedMeshesRef.current.forEach((mesh) => {
        for (let i = 0; i < gridSizeX * gridSizeY; i++) {
          dummyRef.current!.position.set(-5000, -5000, 0);
          dummyRef.current!.scale.set(0, 0, 1);
          dummyRef.current!.rotation.set(0, 0, 0);
          dummyRef.current!.updateMatrix();
          mesh.setMatrixAt(i, dummyRef.current!.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
    }
    // Clear position tracking and stop any running choreographers
    brushPositionsRef.current.clear();
    movementControllerRef.current?.stopAll();
    brushChoreographerRef.current?.stopAll(); // Double-check stop roaming

    // Create single master timeline for ALL animations
    const masterTimeline = gsap.timeline({
      onUpdate: () => {
        const t = masterTimeline.time();
        setStageState(prev => ({ ...prev, currentTime: t }));
      },
      onComplete: () => {
        setStageState(prev => ({ ...prev, status: 'completed', isPlaying: false }));
      },
    });

    // Helper to update meshes from brush positions
    const updateMeshes = (brushList: AnimatedBrush[]) => {
      if (!dummyRef.current) return;
      const dummy = dummyRef.current;
      instancedMeshesRef.current.forEach((mesh, level) => {
        for (let i = 0; i < gridSizeX * gridSizeY; i++) {
          const brush = brushList[i];
          if (brush && brush.level === level) {
            dummy.position.set(brush.position.x, brush.position.y, brush.position.z);
            dummy.scale.set(animBrushSize, animBrushSize, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(brush.gridIndex, dummy.matrix);
          } else if (brush) {
            // Hide brushes that don't match this level
            dummy.position.set(-5000, -5000, 0);
            dummy.scale.set(0, 0, 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
    };

    // Process all commands and add to master timeline
    parsed.commands.forEach((cmd, index) => {
      const cmdTime = cmd.time; // Use actual command time, not array index
      const duration = (cmd.params.duration as number) || 0;

      switch (cmd.type) {
        case 'CAMERA_MOVE': {
          if (cameraControllerRef.current && cmd.params.position && cmd.params.lookAt) {
            const pos = cmd.params.position as { x: number; y: number; z: number };
            const lookAt = cmd.params.lookAt as { x: number; y: number; z: number };
            const moveDuration = (cmd.params.duration as number) || 2;
            const transition = (cmd.params.transition as string) || 'ease-in-out';

            // Camera position animation
            masterTimeline.to(cameraControllerRef.current.getCamera().position, {
              x: pos.x, y: pos.y, z: pos.z,
              duration: moveDuration,
              ease: transition === 'linear' ? 'none' : `power2.${transition === 'ease-in-out' ? 'inOut' : 'out'}`,
            }, cmdTime);

            // LookAt target - set at end of movement
            masterTimeline.call(() => {
              cameraControllerRef.current?.setLookAt(lookAt.x, lookAt.y, lookAt.z);
            }, [], cmdTime + moveDuration - 0.01);

            // FOV animation if specified
            if (cmd.params.fov) {
              masterTimeline.to({}, {
                duration: 0.001,
                onStart: () => {
                  cameraControllerRef.current?.animateFov(cmd.params.fov as number, moveDuration);
                }
              }, cmdTime);
            }
          }
          break;
        }

        case 'CAMERA_MODE':
          masterTimeline.call(() => {
            cameraControllerRef.current?.setMode(cmd.params.mode as 'fixed' | 'follow' | 'orbit');
          }, [], cmdTime);
          break;

        case 'CAMERA_ORBIT': {
          masterTimeline.call(() => {
            cameraControllerRef.current?.setOrbitConfig({
              center: { x: 0, y: 0, z: 0 },
              radius: cmd.params.radius as number || 1000,
              speed: cmd.params.speed as number || 0.1,
              height: cmd.params.height as number || 0,
            });
            cameraControllerRef.current?.startOrbit();
          }, [], cmdTime);
          break;
        }

        case 'CAMERA_ORBIT_ARRAY': {
          masterTimeline.call(() => {
            cameraControllerRef.current?.startOrbitAroundCluster(
              brushes,
              cmd.params.radius as number || 800,
              cmd.params.speed as number || 0.15,
              cmd.params.heightOffset as number || 0,
              cmd.params.duration as number || 0
            );
          }, [], cmdTime);
          break;
        }

        case 'CAMERA_FOLLOW':
          masterTimeline.call(() => {
            let targetBrushId = cmd.params.target as string;
            // If target is "random", pick a random brush
            if (targetBrushId === 'random' && brushes.length > 0) {
              const randomIndex = Math.floor(Math.random() * brushes.length);
              targetBrushId = brushes[randomIndex].id;
            }
            cameraControllerRef.current?.setFollowTarget({
              brushId: targetBrushId,
              offset: cmd.params.offset as { x: number; y: number; z: number },
              lookAhead: cmd.params.lookAhead as number,
            });
            cameraControllerRef.current?.setMode('follow');
          }, [], cmdTime);
          break;

        case 'CAMERA_ZOOM':
          masterTimeline.call(() => {
            cameraControllerRef.current?.animateFov(
              cmd.params.fov as number,
              (cmd.params.duration as number) || 2
            );
          }, [], index);
          break;

        case 'LIGHT_INTENSITY': {
          const lightDuration = (cmd.params.duration as number) || 1;
          masterTimeline.call(() => {
            lightSystemRef.current?.animateIntensity(
              cmd.params.lightType as 'ambient' | 'directional' | 'point',
              cmd.params.value as number,
              lightDuration
            );
          }, [], index);
          break;
        }

        case 'LIGHT_COLOR': {
          const colorDuration = (cmd.params.duration as number) || 1;
          masterTimeline.call(() => {
            lightSystemRef.current?.animateColor(
              cmd.params.lightType as 'ambient' | 'directional' | 'point',
              cmd.params.color as string,
              colorDuration
            );
          }, [], index);
          break;
        }

        case 'LIGHT_POSITION': {
          const posDuration = (cmd.params.duration as number) || 1;
          masterTimeline.call(() => {
            lightSystemRef.current?.animatePointLightPosition(
              cmd.params.index as number,
              cmd.params.position as { x: number; y: number; z: number },
              posDuration
            );
          }, [], index);
          break;
        }

        case 'FORMATION': {
          console.log('[FORMATION] time:', cmdTime, 'params:', JSON.stringify(cmd.params));
          if (!movementControllerRef.current || brushes.length === 0 || !dummyRef.current) {
            console.warn('[FORMATION] skipped: movementController:', !!movementControllerRef.current, 'brushes:', brushes.length, 'dummy:', !!dummyRef.current);
            break;
          }

          const formationType = cmd.params.formationType as string;
          const formDuration = (cmd.params.duration as number) || 3;

          if (formationType === 'reference') {
            // Reference image formation - use REFERENCE IMAGE grid size
            const refIndex = (cmd.params.refIndex as number) || 0;

            if (refIndex >= referenceImages.length) {
              console.warn('[AnimationStage] FORMATION: refIndex', refIndex, 'out of range');
              break;
            }

            const currentRef = referenceImages[refIndex];
            // Use REFERENCE grid size for all calculations
            const refCols = currentRef.gridSizeX;
            const refRows = currentRef.gridSizeY;
            const refBrushCount = refCols * refRows;

            // Update tracking
            lastFormationRefIdRef.current = currentRef.id;

            // Calculate spacing based on canvas dimensions and REFERENCE grid size
            const canvasWidth = dimensionsRef.current.width;
            const canvasHeight = dimensionsRef.current.height;
            const refBrushSize = Math.min(canvasWidth / refCols, canvasHeight / refRows);
            const refOffsetX = (canvasWidth - refBrushSize * refCols) / 2;
            const refOffsetY = (canvasHeight - refBrushSize * refRows) / 2;

            // Get normalized levels for this reference
            const loadedLevelCount = animationBrushLayers.filter(l => l !== null).length;
            const normalizedData = getNormalizedGridData(referenceImages[refIndex].id, loadedLevelCount);

            if (!normalizedData) {
              console.warn('[AnimationStage] FORMATION: no normalizedData for ref', referenceImages[refIndex].id);
              break;
            }

            // Phase 1: Stop brush choreographer roaming at cmdTime (NO hiding - brushes fly from current positions)
            masterTimeline.call(() => {
              // CRITICAL: Stop brush choreographer roaming
              brushChoreographerRef.current?.stopAll();
            }, [], cmdTime);

            // Phase 2: Start animation from CURRENT positions to formation
            // Brushes fly from wherever they are (roaming position) to their target formation positions
            masterTimeline.call(() => {
              // DO NOT clear brushPositionsRef - use current (roaming) positions as starting point

              // Use REFERENCE grid size for all calculations (not animation grid)
              const refCols = currentRef.gridSizeX;
              const refRows = currentRef.gridSizeY;
              const refDataLen = refRows * refCols;
              // Use reference brush size for rendering (to match target positions)
              const formationBrushSize = refBrushSize;

              // Update brush levels from normalized data using correct row-major indexing
              const updatedBrushes = brushes.map((brush, i) => {
                const row = Math.floor(i / refCols);
                const col = i % refCols;
                const luminanceIndex = row * refCols + col;
                // Only update if within reference data bounds
                if (luminanceIndex >= refDataLen) {
                  return { ...brush, level: 0 };
                }
                const newLevel = normalizedData[luminanceIndex];
                return { ...brush, level: newLevel };
              });
              setBrushes(updatedBrushes);

              // Calculate target positions using REFERENCE grid size
              const targetPositions: Vector3[] = updatedBrushes.map((brush, i) => {
                const row = Math.floor(i / refCols);
                const col = i % refCols;
                const luminanceIndex = row * refCols + col;
                // Hide brushes outside reference bounds
                if (luminanceIndex >= refDataLen) {
                  return { x: -5000, y: -5000, z: 0 };
                }
                const targetX = refOffsetX + col * formationBrushSize + formationBrushSize / 2;
                const targetY = refOffsetY + (refRows - 1 - row) * formationBrushSize + formationBrushSize / 2;
                return { x: targetX, y: targetY, z: 0 };
              });

              // Get current positions for animation start
              const currentPositions = updatedBrushes.map(brush =>
                brushPositionsRef.current.get(brush.id) || brush.position
              );

              // Animate brushes to formation using timeline
              const staggerDelay = (cmd.params.stagger as number) || 0.0002;
              const staggerMode = (cmd.params.staggerMode as 'index' | 'spiral' | 'distance' | 'random') || 'index';
              movementControllerRef.current?.animateToFormation(
                updatedBrushes,
                targetPositions,
                formDuration,
                staggerDelay,
                'power3.out',
                currentPositions,
                masterTimeline,
                cmdTime, // Use actual command time, not command index
                (brush, pos) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    // Use formation brush size to match reference grid spacing
                    dummyRef.current.scale.set(formationBrushSize, formationBrushSize, 1);
                    dummyRef.current.rotation.set(0, 0, 0); // CRITICAL: Reset rotation during formation to eliminate RANDOM_ROAM contamination
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                  brushPositionsRef.current.set(brush.id, pos);
                },
                undefined,
                staggerMode
              );

              // Camera dolly-out: pull back during formation to show full panorama
              const cam = cameraRef.current;
              if (cam) {
                const startZ = cam.position.z;
                // Calculate distance needed to see full reference image
                const refCols = currentRef.gridSizeX;
                const refRows = currentRef.gridSizeY;
                const refBrushSize = Math.min(dimensionsRef.current.width / refCols, dimensionsRef.current.height / refRows);
                const refWidth = refCols * refBrushSize;
                const refHeight = refRows * refBrushSize;
                // Target: see the full width with some margin
                const targetZ = Math.max(refWidth, refHeight) * 1.5;
                const dollyZ = Math.max(startZ, targetZ);

                // Animate camera Z position outward during formation
                gsap.to(cam.position, {
                  z: dollyZ,
                  duration: formDuration,
                  ease: 'power2.out',
                });

                // Also update camera lookAt to center of reference image
                const lookAtX = dimensionsRef.current.width / 2;
                const lookAtY = dimensionsRef.current.height / 2;
                cameraControllerRef.current?.setLookAt(lookAtX, lookAtY, 0);
              }
            }, [], cmdTime + 0.01);

          } else {
            // Regular formation (circle, line, grid, scatter)
            masterTimeline.call(() => {
              if (!movementControllerRef.current || !dummyRef.current) return;

              // Clear brushPositionsRef to prevent stale position data
              brushPositionsRef.current.clear();

              const formationPositions = movementControllerRef.current.calculateFormation(
                brushes.length,
                {
                  type: formationType as 'grid' | 'circle' | 'line' | 'scatter',
                  spacing: (cmd.params.spacing as number) || 30,
                  axis: 'x',
                },
                gridSizeX,
                gridSizeY
              );

              movementControllerRef.current.animateToFormation(
                brushes,
                formationPositions,
                formDuration,
                0.0002,
                'power3.out',
                undefined,
                masterTimeline,
                index,
                (brush, pos) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                    dummyRef.current.rotation.set(0, 0, 0); // Reset rotation during formation
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                  brushPositionsRef.current.set(brush.id, pos);
                }
              );
            }, [], index);
          }
          break;
        }

        case 'SCATTER': {
          if (!movementControllerRef.current || brushes.length === 0 || !dummyRef.current) break;

          const scatterDuration = (cmd.params.duration as number) || 1.5;
          const scatterRadius = (cmd.params.radius as number) || 500;

          masterTimeline.call(() => {
            movementControllerRef.current?.scatterBrushes(
              brushes,
              scatterRadius,
              scatterDuration,
              0.0001,
              'power2.out',
              masterTimeline,
              index,
              (brush, pos) => {
                const mesh = instancedMeshesRef.current[brush.level];
                if (mesh && dummyRef.current) {
                  dummyRef.current.position.set(pos.x, pos.y, pos.z);
                  dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                  dummyRef.current.updateMatrix();
                  mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                  mesh.instanceMatrix.needsUpdate = true;
                }
                brushPositionsRef.current.set(brush.id, pos);
              }
            );
          }, [], index);
          break;
        }

        case 'BRUSH_FLIGHT': {
          if (!movementControllerRef.current || brushes.length === 0 || !dummyRef.current) break;

          const direction = (cmd.params.direction as 'left' | 'right' | 'top' | 'bottom' | 'random') || 'random';
          const flightDuration = (cmd.params.duration as number) || 3;
          const { width, height } = dimensionsRef.current;

          masterTimeline.call(() => {
            movementControllerRef.current?.flyInBrushes(
              brushes,
              direction,
              flightDuration,
              0.0002,
              0.5,
              'power2.out',
              width,
              height,
              masterTimeline,
              cmdTime,
              (brush, pos) => {
                const mesh = instancedMeshesRef.current[brush.level];
                if (mesh && dummyRef.current) {
                  dummyRef.current.position.set(pos.x, pos.y, pos.z);
                  dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                  dummyRef.current.updateMatrix();
                  mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                  mesh.instanceMatrix.needsUpdate = true;
                }
                brushPositionsRef.current.set(brush.id, pos);
              }
            );
          }, [], cmdTime);
          break;
        }

        case 'DOF_BLUR': {
          const blurDuration = (cmd.params.duration as number) || 1;
          const blurAmount = (cmd.params.amount as number) || 0;

          masterTimeline.call(() => {
            postProcessingRef.current?.setDOFEnabled(blurAmount > 0);
            postProcessingRef.current?.animateBlurAmount(blurAmount, blurDuration);
          }, [], index);
          break;
        }

        case 'DOF_FOCUS': {
          const focusDuration = (cmd.params.duration as number) || 1;
          const focusDistance = (cmd.params.distance as number) || 0.5;

          masterTimeline.call(() => {
            postProcessingRef.current?.animateFocusDistance(focusDistance, focusDuration);
          }, [], index);
          break;
        }

        case 'VIGNETTE': {
          const vignetteDuration = (cmd.params.duration as number) || 1;
          const darkness = (cmd.params.darkness as number) || 1;
          const offset = (cmd.params.offset as number) || 1;

          masterTimeline.call(() => {
            postProcessingRef.current?.setVignetteEnabled(true);
            postProcessingRef.current?.animateVignette(darkness, offset, vignetteDuration);
          }, [], index);
          break;
        }

        case 'SWIRL': {
          if (!brushChoreographerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const swirlDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: swirlDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!brushChoreographerRef.current || !dummyRef.current) return;

              brushChoreographerRef.current.swirlBrushes(
                brushes,
                {
                  centerX: cmd.params.centerX as number,
                  centerY: cmd.params.centerY as number,
                  radius: cmd.params.radius as number,
                  speed: cmd.params.speed as number,
                  direction: (cmd.params.direction as 'cw' | 'ccw') || 'cw',
                  waveAmplitude: 20,
                  waveFrequency: 2,
                },
                progressProxy.t * swirlDuration,
                (brush, pos) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'AERIAL_DANCE': {
          if (!brushChoreographerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const aerialDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: aerialDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!brushChoreographerRef.current || !dummyRef.current) return;

              brushChoreographerRef.current.aerialDance(
                brushes,
                {
                  height: cmd.params.height as number || 100,
                  frequency: cmd.params.frequency as number || 0.5,
                  phase: cmd.params.phase as number || 0,
                  amplitude: cmd.params.amplitude as number || 30,
                },
                progressProxy.t * aerialDuration,
                (brush, pos) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'ORBIT_AXIS': {
          if (!brushChoreographerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const orbitDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: orbitDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!brushChoreographerRef.current || !dummyRef.current) return;

              brushChoreographerRef.current.orbitAroundAxis(
                brushes,
                {
                  axis: (cmd.params.axis as 'x' | 'y' | 'z') || 'y',
                  radius: cmd.params.radius as number || 200,
                  speed: cmd.params.speed as number || 0.3,
                  heightAmplitude: cmd.params.heightAmplitude as number || 50,
                },
                progressProxy.t * orbitDuration,
                (brush, pos) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'BEZIER_FLIGHT': {
          if (!brushChoreographerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const bezierDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: bezierDuration,
            ease: 'power2.inOut',
            onUpdate: () => {
              if (!brushChoreographerRef.current || !dummyRef.current) return;

              brushChoreographerRef.current.flyAlongBezier(
                brushes,
                {
                  controlPoints: [
                    cmd.params.cp1 as Vector3,
                    cmd.params.cp2 as Vector3,
                    cmd.params.cp3 as Vector3,
                  ],
                  duration: bezierDuration,
                },
                progressProxy.t,
                (brush, pos) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'WAVE': {
          if (!arrayControllerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const waveDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: waveDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!arrayControllerRef.current || !dummyRef.current) return;

              arrayControllerRef.current.applyWaveUndulation(
                brushes,
                {
                  direction: (cmd.params.direction as 'x' | 'y' | 'diagonal') || 'y',
                  amplitude: cmd.params.amplitude as number || 50,
                  frequency: cmd.params.frequency as number || 2,
                  speed: cmd.params.speed as number || 0.5,
                },
                progressProxy.t * waveDuration,
                (brush, pos, scale) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(
                      brushSizeXYRef.current.x * scale,
                      brushSizeXYRef.current.y * scale,
                      1
                    );
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'OSCILLATE': {
          if (!arrayControllerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const oscillateDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: oscillateDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!arrayControllerRef.current || !dummyRef.current) return;

              arrayControllerRef.current.oscillateBrushes(
                brushes,
                {
                  centerX: cmd.params.centerX as number,
                  centerY: cmd.params.centerY as number,
                  amplitudeX: cmd.params.amplitudeX as number || 100,
                  amplitudeY: cmd.params.amplitudeY as number || 50,
                  frequency: cmd.params.frequency as number || 0.5,
                  phase: cmd.params.phase as number || 0,
                },
                progressProxy.t * oscillateDuration,
                (brush, pos, scale) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(
                      brushSizeXYRef.current.x * scale,
                      brushSizeXYRef.current.y * scale,
                      1
                    );
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'PULSE': {
          if (!arrayControllerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const pulseDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: pulseDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!arrayControllerRef.current || !dummyRef.current) return;

              arrayControllerRef.current.pulseBrushes(
                brushes,
                {
                  centerX: cmd.params.centerX as number,
                  centerY: cmd.params.centerY as number,
                  minScale: cmd.params.minScale as number || 0.5,
                  maxScale: cmd.params.maxScale as number || 1.5,
                  speed: cmd.params.speed as number || 1,
                },
                progressProxy.t * pulseDuration,
                (brush, pos, scale) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(
                      brushSizeXYRef.current.x * scale,
                      brushSizeXYRef.current.y * scale,
                      1
                    );
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'ARRAY_ROTATE': {
          if (!arrayControllerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const rotateDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: rotateDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!arrayControllerRef.current || !dummyRef.current) return;

              arrayControllerRef.current.rotateArray(
                brushes,
                {
                  centerX: cmd.params.centerX as number,
                  centerY: cmd.params.centerY as number,
                  speed: cmd.params.speed as number || 30,
                  direction: (cmd.params.direction as 'cw' | 'ccw') || 'cw',
                },
                progressProxy.t * rotateDuration,
                (brush, pos, scale) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(
                      brushSizeXYRef.current.x * scale,
                      brushSizeXYRef.current.y * scale,
                      1
                    );
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'ARRAY_SCALE': {
          if (!arrayControllerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const scaleDuration = (cmd.params.duration as number) || 3;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: scaleDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!arrayControllerRef.current || !dummyRef.current) return;

              arrayControllerRef.current.scaleArray(
                brushes,
                {
                  centerX: cmd.params.centerX as number,
                  centerY: cmd.params.centerY as number,
                  minScale: cmd.params.minScale as number || 0.5,
                  maxScale: cmd.params.maxScale as number || 1.5,
                  speed: cmd.params.speed as number || 0.5,
                },
                progressProxy.t * scaleDuration,
                (brush, pos, scale) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(
                      brushSizeXYRef.current.x * scale,
                      brushSizeXYRef.current.y * scale,
                      1
                    );
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, index);
          break;
        }

        case 'ORBIT_BRUSH': {
          if (!cameraControllerRef.current) break;

          masterTimeline.call(() => {
            cameraControllerRef.current?.orbitAroundBrush(
              cmd.params.brushId as string,
              cmd.params.radius as number || 200,
              cmd.params.speed as number || 0.1,
              cmd.params.height as number || 0
            );
          }, [], index);
          break;
        }

        case 'RANDOM_FOLLOW': {
          if (!cameraControllerRef.current) break;

          masterTimeline.call(() => {
            cameraControllerRef.current?.startRandomFollow(
              brushes,
              brushPositionsRef.current,
              cmd.params.speed as number || 0.5,
              cmd.params.radius as number || 300
            );
          }, [], index);
          break;
        }

        case 'RANDOM_ORBIT_BRUSH': {
          if (!cameraControllerRef.current) break;

          masterTimeline.call(() => {
            cameraControllerRef.current?.startRandomOrbitBrush(
              brushes,
              cmd.params.radius as number || 200,
              cmd.params.speed as number || 0.3,
              cmd.params.height as number || 50
            );
          }, [], index);
          break;
        }

        case 'ROTATE_BRUSH': {
          if (!brushChoreographerRef.current || brushes.length === 0 || !dummyRef.current) break;
          const rotateDuration = (cmd.params.duration as number) || 3;
          const rotateAxis = (cmd.params.axis as 'x' | 'y' | 'z') || 'z';
          const rotateSpeed = (cmd.params.speed as number) || 90; // degrees per second
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: rotateDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!brushChoreographerRef.current || !dummyRef.current) return;

              const brush = brushes[0];
              if (!brush) return;

              const result = brushChoreographerRef.current.rotateBrush(brush, {
                axis: rotateAxis,
                anglePerSecond: rotateSpeed,
                phase: 0,
              }, progressProxy.t * rotateDuration);

              const mesh = instancedMeshesRef.current[brush.level];
              if (mesh && dummyRef.current) {
                dummyRef.current.position.set(result.position.x, result.position.y, result.position.z);
                dummyRef.current.rotation.set(result.rotation.x, result.rotation.y, result.rotation.z);
                dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                dummyRef.current.updateMatrix();
                mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                mesh.instanceMatrix.needsUpdate = true;
              }
            }
          }, index);
          break;
        }

        case 'RANDOM_ROAM': {
          console.log('[RANDOM_ROAM] time:', cmdTime, 'speed:', cmd.params.speed, 'amplitude:', cmd.params.amplitude);
          if (!brushChoreographerRef.current || brushes.length === 0 || !dummyRef.current) {
            console.log('[RANDOM_ROAM] skipped: missing refs');
            break;
          }

          const roamSpeed = (cmd.params.speed as number) || 0.5;
          const roamAmplitude = (cmd.params.amplitude as number) || 100;
          const roamRangeX = (cmd.params.rangeX as number) || 1.0;
          const roamRangeY = (cmd.params.rangeY as number) || 0.7;
          const roamRangeZ = (cmd.params.rangeZ as number) || 0.3;
          const roamSwimSpeed = (cmd.params.swimSpeed as number) || 1.0;

          // Store params
          const myParams = {
            speed: roamSpeed,
            amplitude: roamAmplitude,
            rangeX: roamRangeX,
            rangeY: roamRangeY,
            rangeZ: roamRangeZ,
            swimSpeed: roamSwimSpeed,
          };

          // Create a NEW proxy for this command
          const commandProxy = { t: 0 };

          const finalCmdTime = cmd.time as number;

          // CRITICAL: If speed is 0, this is a stop command - freeze all brushes at current positions
          if (roamSpeed === 0) {
            masterTimeline.call(() => {
              brushChoreographerRef.current?.stopAll();
              // Freeze all brushes at their current positions
              brushes.forEach(brush => {
                const currentPos = brushPositionsRef.current.get(brush.id) || brush.position;
                const mesh = instancedMeshesRef.current[brush.level];
                if (mesh && dummyRef.current) {
                  dummyRef.current.position.set(currentPos.x, currentPos.y, currentPos.z);
                  dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                  dummyRef.current.rotation.set(0, 0, 0);
                  dummyRef.current.updateMatrix();
                  mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                }
              });
              instancedMeshesRef.current.forEach(mesh => { mesh.instanceMatrix.needsUpdate = true; });
            }, [], finalCmdTime);
            break;
          }

          // Resume roaming before starting new animation
          brushChoreographerRef.current?.resumeAll();

          masterTimeline.to(commandProxy, {
            t: 1,
            duration: 0.1,
            repeat: -1,
            ease: 'linear',
            onUpdate: () => {
              const currentTime = masterTimeline.time();
              if (currentTime < finalCmdTime) return;
              if (!brushChoreographerRef.current || !dummyRef.current) return;

              const elapsedTime = currentTime - finalCmdTime;

              brushChoreographerRef.current.randomRoamBrushes(
                brushes,
                myParams,
                elapsedTime,
                (brush, pos, rot) => {
                  brushPositionsRef.current.set(brush.id, pos);
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    if (rot) {
                      dummyRef.current.rotation.set(rot.x, rot.y, rot.z);
                    }
                    dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, finalCmdTime);
          break;
        }

        case 'CAMERA_SHAKE': {
          if (!cameraControllerRef.current) break;
          const shakeIntensity = cmd.params.intensity as number || 10;
          const shakeFrequency = cmd.params.frequency as number || 5;
          const shakeDuration = cmd.params.duration as number || 0.5;

          masterTimeline.call(() => {
            cameraControllerRef.current?.shakeCamera(shakeIntensity, shakeFrequency, shakeDuration);
          }, [], index);
          break;
        }

        case 'CAMERA_PATH': {
          if (!cameraControllerRef.current) break;
          const pathDuration = (cmd.params.duration as number) || 5;
          const points = cmd.params.points as Vector3[];

          masterTimeline.call(() => {
            cameraControllerRef.current?.playExtendedKeyFrames(
              points.map((p, i) => ({
                time: (i / (points.length - 1)) * pathDuration,
                position: p,
                lookAt: { x: 0, y: 0, z: 0 },
              }))
            );
          }, [], index);
          break;
        }

        case 'BACKGROUND_COLOR': {
          const bgDuration = (cmd.params.duration as number) || 2;
          const bgColor = cmd.params.color as string;

          masterTimeline.call(() => {
            lightSystemRef.current?.animateBackgroundColor(bgColor, bgDuration);
          }, [], index);
          break;
        }

        case 'FOG': {
          const fogDuration = (cmd.params.duration as number) || 2;

          masterTimeline.call(() => {
            lightSystemRef.current?.animateFog(
              cmd.params.near as number,
              cmd.params.far as number,
              cmd.params.color as string,
              fogDuration
            );
          }, [], index);
          break;
        }

        case 'SPOT_LIGHT': {
          masterTimeline.call(() => {
            lightSystemRef.current?.createSpotLight(
              cmd.params.position as Vector3,
              cmd.params.target as Vector3,
              cmd.params.intensity as number || 1,
              cmd.params.angle as number || 0.5,
              cmd.params.penumbra as number || 0.3
            );
          }, [], index);
          break;
        }

        case 'EXPLOSION': {
          if (!transitionEffectsRef.current || brushes.length === 0 || !dummyRef.current) break;
          const explosionDuration = (cmd.params.duration as number) || 1;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: explosionDuration,
            ease: 'power2.out',
            onUpdate: () => {
              if (!transitionEffectsRef.current || !dummyRef.current) return;

              transitionEffectsRef.current.explodeBrushes(
                brushes,
                {
                  centerX: cmd.params.centerX as number,
                  centerY: cmd.params.centerY as number,
                  centerZ: cmd.params.centerZ as number || 0,
                  speed: cmd.params.speed as number || 500,
                  duration: explosionDuration,
                },
                progressProxy.t,
                (brush, pos) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, cmdTime);
          break;
        }

        case 'IMPLOSION': {
          if (!transitionEffectsRef.current || brushes.length === 0 || !dummyRef.current) break;
          const implosionDuration = (cmd.params.duration as number) || 1;
          const progressProxy = { t: 0 };

          masterTimeline.to(progressProxy, {
            t: 1,
            duration: implosionDuration,
            ease: 'power2.in',
            onUpdate: () => {
              if (!transitionEffectsRef.current || !dummyRef.current) return;

              transitionEffectsRef.current.implodeBrushes(
                brushes,
                {
                  centerX: cmd.params.centerX as number,
                  centerY: cmd.params.centerY as number,
                  centerZ: cmd.params.centerZ as number || 0,
                  speed: cmd.params.speed as number || 500,
                  duration: implosionDuration,
                },
                progressProxy.t,
                (brush, pos) => {
                  const mesh = instancedMeshesRef.current[brush.level];
                  if (mesh && dummyRef.current) {
                    dummyRef.current.position.set(pos.x, pos.y, pos.z);
                    dummyRef.current.scale.set(brushSizeXYRef.current.x, brushSizeXYRef.current.y, 1);
                    dummyRef.current.updateMatrix();
                    mesh.setMatrixAt(brush.gridIndex, dummyRef.current.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                  }
                }
              );
            }
          }, cmdTime);
          break;
        }

        case 'COLOR_FLASH': {
          const flashColor = cmd.params.color as string;
          const flashDuration = cmd.params.duration as number || 0.5;
          const flashIntensity = cmd.params.intensity as number || 1;
          const progressProxy = { t: 0 };

          // Create the flash overlay at start
          masterTimeline.call(() => {
            transitionEffectsRef.current?.flashColor({
              color: flashColor,
              duration: flashDuration,
              intensity: flashIntensity,
            });
          }, [], cmdTime);

          // Also animate opacity from intensity to 0 using GSAP timeline
          masterTimeline.to(progressProxy, {
            t: 1,
            duration: flashDuration,
            ease: 'power2.out',
            onUpdate: () => {
              if (!transitionEffectsRef.current) return;
              transitionEffectsRef.current.updateFlashColor(progressProxy.t, {
                color: flashColor,
                duration: flashDuration,
                intensity: flashIntensity,
              });
            }
          }, cmdTime);
          break;
        }

        case 'STROBE': {
          const strobeColor = cmd.params.color as string;
          const strobeFrequency = cmd.params.frequency as number || 10;
          const strobeDuration = cmd.params.duration as number || 2;
          const progressProxy = { t: 0 };

          // Initialize the strobe
          masterTimeline.call(() => {
            transitionEffectsRef.current?.strobe({
              color: strobeColor,
              frequency: strobeFrequency,
              duration: strobeDuration,
            });
          }, [], cmdTime);

          // Update strobe state based on GSAP progress
          masterTimeline.to(progressProxy, {
            t: 1,
            duration: strobeDuration,
            ease: 'linear',
            onUpdate: () => {
              if (!transitionEffectsRef.current) return;
              transitionEffectsRef.current.updateStrobe(progressProxy.t, {
                color: strobeColor,
                frequency: strobeFrequency,
                duration: strobeDuration,
              });
            }
          }, cmdTime);
          break;
        }

        case 'RACK_FOCUS': {
          const rackDuration = (cmd.params.duration as number) || 1;
          const startDist = cmd.params.startDistance as number || 0.1;
          const endDist = cmd.params.endDistance as number || 1;

          masterTimeline.call(() => {
            transitionEffectsRef.current?.rackFocus(startDist, endDist, rackDuration, (distance) => {
              postProcessingRef.current?.animateFocusDistance(distance, 0.016);
            });
          }, [], cmdTime);
          break;
        }

        case 'MARKER':
          console.log(`[MARKER:${cmd.params.name}] at ${cmd.time}s`);
          break;

        case 'WAIT':
          // WAIT is handled by the timeline duration
          break;

        case 'TRANSITION':
          // Transition effects handled by time gaps
          break;
      }

      // Log command execution
      if (cmd.type !== 'MARKER') {
        console.log(`[${cmd.time}s] ${cmd.type}`, cmd.params);
      }
    });

    // Store master timeline for external control (pause/seek/stop)
    timelineRef.current = masterTimeline;

    // Start playing from time 0
    masterTimeline.play(0);

    console.log('[AnimationStage] Script execution started, referenceImages:', referenceImages.length, referenceImages.map(r => r.id));
    console.log('[AnimationStage] masterTimeline.duration():', masterTimeline.duration());
  }, [brushes, gridSizeX, gridSizeY, referenceImages, getNormalizedGridData, animationBrushLayers]);

  // Floating panel state
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState<'script' | 'settings' | 'refs'>('refs');
  const [selectedRefIds, setSelectedRefIds] = useState<Set<string>>(new Set()); // For multi-select reference images
  const [isRefMultiSelectMode, setIsRefMultiSelectMode] = useState(false);

  useEffect(() => {
    onStateChange?.(stageState);
  }, [stageState, onStateChange]);

  // When entering animation mode, expand panel and show refs tab by default
  useEffect(() => {
    setIsPanelCollapsed(false);
    setActivePanelTab('refs');
  }, []);

  // Mouse wheel controls camera zoom (push/pull)
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return;
      e.preventDefault();
      const zoomSpeed = 0.1;
      const delta = e.deltaY * zoomSpeed;
      const newZ = Math.max(50, Math.min(3000, cameraRef.current.position.z + delta));
      cameraRef.current.position.z = newZ;
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Keyboard shortcuts: b=brush group, p=reference image, space=play, collapse panel
  const [showBrushGroupModal, setShowBrushGroupModal] = useState(false);
  const [showRefImageModal, setShowRefImageModal] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          setShowBrushGroupModal(true);
          break;
        case 'p':
          e.preventDefault();
          // Open reference image selection modal
          setShowRefImageModal(true);
          setActivePanelTab('refs');
          setIsPanelCollapsed(false);
          break;
        case ' ':
          e.preventDefault();
          if (stageState.isPlaying && pause) {
            pause();
          } else if (play) {
            play();
          }
          setIsPanelCollapsed(true);
          break;
        case 'h':
          e.preventDefault();
          setIsPanelCollapsed(prev => !prev);
          break;
        case 'Escape':
          if (showRefImageModal) {
            setShowRefImageModal(false);
            setSelectedRefIds(new Set());
            setIsRefMultiSelectMode(false);
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stageState.isPlaying, play, pause]);

  return (
    <div className="w-full h-full relative bg-black">
      {/* Canvas - full screen */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Floating Control Panel */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-zinc-900/95 backdrop-blur-sm rounded-lg border border-zinc-700 px-3 py-2">
        <button
          onClick={stageState.isPlaying ? pause : play}
          disabled={stageState.status === 'loading' || animationBrushLayers.every(l => l === null)}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm disabled:opacity-50"
        >
          {stageState.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={stop}
          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-white text-sm"
        >
          ⏹
        </button>
        <div className="text-white/70 text-xs font-mono">
          {Math.floor(stageState.currentTime)}s
        </div>
        <button
          onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
          className="px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-white text-xs"
        >
          {isPanelCollapsed ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded Panel */}
      {!isPanelCollapsed && (
        <div className="absolute bottom-16 right-4 w-80 bg-zinc-900/95 backdrop-blur-sm rounded-xl border border-zinc-700 shadow-2xl overflow-hidden">
          <div className="flex border-b border-zinc-700">
            <button onClick={() => setActivePanelTab('script')} className={`flex-1 px-3 py-2 text-xs font-medium ${activePanelTab === 'script' ? 'text-orange-500 bg-zinc-800 border-b-2 border-orange-500' : 'text-zinc-400 hover:text-white'}`}>Script</button>
            <button onClick={() => setActivePanelTab('settings')} className={`flex-1 px-3 py-2 text-xs font-medium ${activePanelTab === 'settings' ? 'text-blue-500 bg-zinc-800 border-b-2 border-blue-500' : 'text-zinc-400 hover:text-white'}`}>Settings</button>
            <button onClick={() => setActivePanelTab('refs')} className={`flex-1 px-3 py-2 text-xs font-medium ${activePanelTab === 'refs' ? 'text-green-500 bg-zinc-800 border-b-2 border-green-500' : 'text-zinc-400 hover:text-white'}`}>Refs ({referenceImages.length})</button>
          </div>
          {activePanelTab === 'script' && (
            <div className="p-3">
              <div className="flex gap-2 mb-2">
                <button onClick={() => executeScript(animationScript)} disabled={brushes.length === 0 || stageState.isPlaying} className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-white text-xs disabled:opacity-50">Run</button>
                <button onClick={() => setAnimationScript('')} className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-white text-xs">Clear</button>
              </div>
              <textarea value={animationScript} onChange={(e) => setAnimationScript(e.target.value)} className="w-full h-32 bg-zinc-950 text-green-400 font-mono text-xs p-2 rounded border border-zinc-700 resize-none" spellCheck={false} />
            </div>
          )}
          {activePanelTab === 'settings' && (
            <div className="p-3">
              <select value={selectedPresetId || ''} onChange={(e) => {
                const groupId = e.target.value;
                setSelectedPresetId(groupId);
                if (groupId && brushGroups && brushPresets) {
                  const group = brushGroups.find(g => g.id === groupId);
                  if (group) {
                    setBrushLayersLoading(true);  // Mark as loading
                    const canvases: (HTMLCanvasElement | null)[] = [];
                    const maxLevels = Math.min(group.slots.length, MAX_BRUSH_LEVELS);
                    let loadedCount = 0;
                    let totalToLoad = 0;

                    // First, count how many we need to load
                    for (let level = 0; level < maxLevels; level++) {
                      const presetId = group.slots[level];
                      if (presetId) {
                        const preset = brushPresets.find(p => p.id === presetId);
                        if (preset && preset.layers[0]) {
                          totalToLoad++;
                        }
                      }
                    }

                    // If nothing to load, immediately set empty
                    if (totalToLoad === 0) {
                      setAnimationBrushLayers([]);
                      setBrushLayersLoading(false);
                      return;
                    }

                    for (let level = 0; level < maxLevels; level++) {
                      const presetId = group.slots[level];
                      if (presetId) {
                        const preset = brushPresets.find(p => p.id === presetId);
                        if (preset && preset.layers[0]) {
                          const canvas = document.createElement('canvas');
                          canvas.width = 200;
                          canvas.height = 200;
                          const ctx = canvas.getContext('2d');
                          if (ctx) {
                            const img = new Image();
                            img.src = preset.layers[0];
                            img.onload = () => {
                              ctx.drawImage(img, 0, 0, 200, 200);
                              canvases[level] = canvas;
                              loadedCount++;
                              // Only set when ALL images are loaded
                              if (loadedCount === totalToLoad) {
                                setAnimationBrushLayers(canvases);
                                setBrushLayersLoading(false);  // Loading complete
                                setInitKey(k => k + 1);
                              }
                            };
                            img.onerror = () => {
                              // On error, still count as loaded to avoid hanging
                              loadedCount++;
                              if (loadedCount === totalToLoad) {
                                setAnimationBrushLayers(canvases);
                                setBrushLayersLoading(false);
                                setInitKey(k => k + 1);
                              }
                            };
                          } else {
                            loadedCount++;  // No context, count as loaded
                          }
                        } else {
                          loadedCount++;  // No valid preset, count as loaded
                        }
                      } else {
                        loadedCount++;  // No presetId, count as loaded
                      }
                    }
                  }
                }
              }} className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1.5 border border-zinc-600 mb-2">
                <option value="">Select brush group...</option>
                {brushGroups.map(group => (<option key={group.id} value={group.id}>{group.name}</option>))}
              </select>
              <div className="text-zinc-500 text-xs">{stageState.status} | {brushes.length} brushes</div>
            </div>
          )}
          {activePanelTab === 'refs' && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-zinc-400">
                  {isRefMultiSelectMode ? `已选择 ${selectedRefIds.size} 张` : `${referenceImages.length} 张参考图`}
                </div>
                <div className="flex gap-2">
                  {isRefMultiSelectMode && selectedRefIds.size > 0 && (
                    <button
                      onClick={() => {
                        // Add selected images in order to the sequence
                        const selectedArray = Array.from(selectedRefIds);
                        const imagesToAdd = referenceImages.filter(img => selectedRefIds.has(img.id));
                        imagesToAdd.forEach(img => addImage(img.imageData, img.name));
                        setSelectedRefIds(new Set());
                        setIsRefMultiSelectMode(false);
                      }}
                      className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs text-white"
                    >
                      添加选中
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (isRefMultiSelectMode) {
                        setIsRefMultiSelectMode(false);
                        setSelectedRefIds(new Set());
                      } else {
                        setIsRefMultiSelectMode(true);
                      }
                    }}
                    className={`px-2 py-1 rounded text-xs ${isRefMultiSelectMode ? 'bg-orange-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
                  >
                    {isRefMultiSelectMode ? '取消选择' : '选择'}
                  </button>
                  <label className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs text-white cursor-pointer">
                    添加图片
                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        for (let i = 0; i < files.length; i++) {
                          const file = files[i];
                          const dataUrl = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.readAsDataURL(file);
                          });
                          await addImage(dataUrl, file.name.replace(/\.[^.]+$/, ''));
                        }
                      }
                    }} />
                  </label>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap max-h-40 overflow-y-auto">
                {referenceImages.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => {
                      if (isRefMultiSelectMode) {
                        setSelectedRefIds(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(img.id)) {
                            newSet.delete(img.id);
                          } else {
                            newSet.add(img.id);
                          }
                          return newSet;
                        });
                      }
                    }}
                    className={`w-12 h-12 rounded border overflow-hidden cursor-pointer transition-all ${isRefMultiSelectMode ? (selectedRefIds.has(img.id) ? 'border-orange-500 ring-2 ring-orange-500' : 'border-zinc-600 opacity-60') : 'border-zinc-600 hover:border-zinc-500'}`}
                  >
                    <img src={img.imageData} alt={img.name} className="w-full h-full object-cover" />
                    {isRefMultiSelectMode && selectedRefIds.has(img.id) && (
                      <div className="absolute top-0 right-0 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">✓</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Brush Group Load Modal */}
      {showBrushGroupModal && brushGroups && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 w-80 max-h-[80vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
              <h3 className="text-sm font-semibold text-white">选择笔刷组</h3>
              <button onClick={() => setShowBrushGroupModal(false)} className="text-zinc-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 max-h-80 overflow-y-auto">
              {brushGroups.length === 0 ? (
                <div className="text-zinc-500 text-sm text-center py-4">暂无可用的笔刷组</div>
              ) : (
                brushGroups.map(group => {
                  // Get first 5 non-null slot IDs for preview
                  const previewSlots = group.slots.filter(id => id !== null).slice(0, 5);
                  const totalCount = group.slots.filter(id => id !== null).length;
                  return (
                    <div
                      key={group.id}
                      className="p-3 bg-zinc-700 rounded-lg hover:bg-zinc-600 cursor-pointer transition-colors mb-2"
                      onClick={() => {
                        // Load this brush group
                        const maxLevels = Math.min(group.slots.length, MAX_BRUSH_LEVELS);
                        setBrushLayersLoading(true);
                        const canvases: (HTMLCanvasElement | null)[] = [];
                        let loadedCount = 0;
                        let totalToLoad = 0;

                        for (let level = 0; level < maxLevels; level++) {
                          const presetId = group.slots[level];
                          if (presetId) {
                            const preset = brushPresets?.find(p => p.id === presetId);
                            if (preset && preset.layers[0]) {
                              totalToLoad++;
                            }
                          }
                        }

                        if (totalToLoad === 0) {
                          setAnimationBrushLayers([]);
                          setBrushLayersLoading(false);
                          setShowBrushGroupModal(false);
                          return;
                        }

                        for (let level = 0; level < maxLevels; level++) {
                          const presetId = group.slots[level];
                          if (presetId) {
                            const preset = brushPresets?.find(p => p.id === presetId);
                            if (preset && preset.layers[0]) {
                              const canvas = document.createElement('canvas');
                              canvas.width = 200;
                              canvas.height = 200;
                              const ctx = canvas.getContext('2d');
                              if (ctx) {
                                const img = new Image();
                                img.src = preset.layers[0];
                                img.onload = () => {
                                  ctx.drawImage(img, 0, 0, 200, 200);
                                  canvases[level] = canvas;
                                  loadedCount++;
                                  if (loadedCount === totalToLoad) {
                                    setAnimationBrushLayers(canvases);
                                    setBrushLayersLoading(false);
                                    setInitKey(k => k + 1);
                                    setShowBrushGroupModal(false);
                                  }
                                };
                                img.onerror = () => {
                                  loadedCount++;
                                  if (loadedCount === totalToLoad) {
                                    setAnimationBrushLayers(canvases);
                                    setBrushLayersLoading(false);
                                    setInitKey(k => k + 1);
                                    setShowBrushGroupModal(false);
                                  }
                                };
                              }
                            }
                          }
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-zinc-400">{totalCount} 个笔刷</div>
                      </div>
                      {/* Show first 5 brush thumbnails */}
                      <div className="flex gap-2 justify-center">
                        {previewSlots.map((slotId, idx) => {
                          const preset = brushPresets?.find(p => p.id === slotId);
                          const layerData = preset?.layers[0];
                          return (
                            <div key={idx} className="w-12 h-12 bg-zinc-600 rounded border border-zinc-500 overflow-hidden">
                              {layerData && (
                                <img src={layerData} alt="" className="w-full h-full object-contain" />
                              )}
                            </div>
                          );
                        })}
                        {/* Fill empty slots */}
                        {Array.from({ length: 5 - previewSlots.length }).map((_, idx) => (
                          <div key={`empty-${idx}`} className="w-12 h-12 bg-zinc-800 rounded border border-zinc-600" />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status indicator if no brushes loaded */}
      {animationBrushLayers.every(l => l === null) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <div className="text-zinc-400 text-lg">Load a brush preset to start animation</div>
        </div>
      )}

      {/* Reference Image Selection Modal - Press P to open */}
      {showRefImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-zinc-900 rounded-xl border border-zinc-700 w-[500px] max-h-[70vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
              <div>
                <h3 className="text-sm font-semibold text-white">加载参考图</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  单击选择一张参考图 · 多选模式可添加多张（按加载顺序排列）
                </p>
              </div>
              <button
                onClick={() => {
                  setShowRefImageModal(false);
                  setSelectedRefIds(new Set());
                  setIsRefMultiSelectMode(false);
                }}
                className="text-zinc-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4">
              {/* Upload area */}
              <div className="mb-4">
                <label className="block w-full px-4 py-3 border-2 border-dashed border-zinc-600 hover:border-zinc-500 rounded-lg cursor-pointer text-center text-zinc-400 hover:text-zinc-300 transition-colors">
                  <div className="flex flex-col items-center gap-1">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-sm">点击或拖拽图片到此处上传</span>
                    <span className="text-xs text-zinc-600">支持多张图片</span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (files && files.length > 0) {
                        for (let i = 0; i < files.length; i++) {
                          const file = files[i];
                          const dataUrl = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result as string);
                            reader.readAsDataURL(file);
                          });
                          await addImage(dataUrl, file.name.replace(/\.[^.]+$/, ''));
                        }
                      }
                    }}
                  />
                </label>
              </div>

              {/* Existing reference images */}
              {referenceImages.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-500">已有参考图 ({referenceImages.length})</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (isRefMultiSelectMode) {
                            // Delete selected reference images
                            selectedRefIds.forEach(id => removeImage(id));
                            setSelectedRefIds(new Set());
                            setIsRefMultiSelectMode(false);
                            setShowRefImageModal(false);
                          } else {
                            setIsRefMultiSelectMode(true);
                          }
                        }}
                        className={`px-2 py-1 rounded text-xs ${isRefMultiSelectMode ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'}`}
                      >
                        {isRefMultiSelectMode ? `删除 (${selectedRefIds.size})` : '选择模式'}
                      </button>
                      {isRefMultiSelectMode && (
                        <button
                          onClick={() => {
                            setIsRefMultiSelectMode(false);
                            setSelectedRefIds(new Set());
                          }}
                          className="px-2 py-1 bg-zinc-700 text-zinc-300 hover:bg-zinc-600 rounded text-xs"
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 max-h-60 overflow-y-auto">
                    {referenceImages.map((img, idx) => {
                      const isSelected = selectedRefIds.has(img.id);
                      return (
                        <div
                          key={img.id}
                          onClick={() => {
                            if (isRefMultiSelectMode) {
                              setSelectedRefIds(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(img.id)) {
                                  newSet.delete(img.id);
                                } else {
                                  newSet.add(img.id);
                                }
                                return newSet;
                              });
                            } else {
                              // Single select - add immediately
                              addImage(img.imageData, img.name);
                              setShowRefImageModal(false);
                            }
                          }}
                          className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                            isSelected
                              ? 'border-orange-500 ring-2 ring-orange-500/50'
                              : 'border-zinc-600 hover:border-zinc-500'
                          }`}
                        >
                          <div className="aspect-square bg-zinc-800">
                            <img src={img.imageData} alt={img.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                            <span className="text-[10px] text-white/80 truncate block">{img.name}</span>
                          </div>
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          <div className="absolute top-1 left-1 w-4 h-4 bg-zinc-900/80 rounded-full flex items-center justify-center text-[10px] text-zinc-400">{idx + 1}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {referenceImages.length === 0 && (
                <div className="text-center py-8 text-zinc-500 text-sm">
                  暂无参考图，请上传图片
                </div>
              )}
            </div>

            {/* Footer with selection info */}
            <div className="px-4 py-3 border-t border-zinc-700 bg-zinc-800/50">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {isRefMultiSelectMode
                    ? `已选择 ${selectedRefIds.size} 张参考图`
                    : '单击选择单张 · 多选模式可添加多张'}
                </span>
                <span>按 ESC 关闭</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}