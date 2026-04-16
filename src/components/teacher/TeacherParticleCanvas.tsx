'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';

interface BrushLayer {
  canvas: HTMLCanvasElement;
}

const BRUSH_TEXTURE_SIZE = 100;

export function TeacherParticleCanvas({
  sourceWidth,
  sourceHeight,
  gridSizeX,
  gridSizeY,
  brushLayers,
  sourceCanvas,
  sizeJitter,
  rotationJitter,
  enableFlip,
  enableMergeOptimization,
  backgroundColor,
  isFullscreen,
  transform,
  onTransformChange,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  updateTrigger = 0,
}: {
  sourceWidth: number;
  sourceHeight: number;
  gridSizeX: number;
  gridSizeY: number;
  brushLayers: (BrushLayer | null)[];
  sourceCanvas: HTMLCanvasElement | null;
  sizeJitter: number;
  rotationJitter: number;
  enableFlip: boolean;
  enableMergeOptimization: boolean;
  backgroundColor?: string;
  isFullscreen: boolean;
  transform: { scale: number; x: number; y: number };
  onTransformChange: (transform: { scale: number; x: number; y: number }) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseUp?: () => void;
  updateTrigger?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const texturesRef = useRef<THREE.Texture[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const [displaySize, setDisplaySize] = useState({ width: 400, height: 400 });

  // Cache luminance data to avoid recalculation
  const luminanceCacheRef = useRef<Uint8Array | null>(null);

  const outputWidth = gridSizeX * BRUSH_TEXTURE_SIZE;
  const outputHeight = gridSizeY * BRUSH_TEXTURE_SIZE;

  // Simple hash for randomness
  const hash = (x: number, y: number, seed: number = 0): number => {
    return ((Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453) % 1 + 1) % 1;
  };

  // Measure container size
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDisplaySize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Initialize scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(outputWidth, outputHeight);
    renderer.setClearColor(0xffffff, 1);

    // Set CSS size to match container
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    // Clean up old renderer if exists
    if (rendererRef.current && containerRef.current.contains(rendererRef.current.domElement)) {
      containerRef.current.removeChild(rendererRef.current.domElement);
      rendererRef.current.dispose();
    }
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create scene
    if (!sceneRef.current) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      sceneRef.current = scene;
    }

    // Create or update camera
    const camera = new THREE.OrthographicCamera(
      0, outputWidth, outputHeight, 0, 0.1, 1000
    );
    camera.position.z = 10;
    cameraRef.current = camera;

    // Render loop
    const loop = () => {
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [outputWidth, outputHeight]);

  // Update scene background color when changed
  useEffect(() => {
    if (sceneRef.current && backgroundColor) {
      sceneRef.current.background = new THREE.Color(backgroundColor);
    }
  }, [backgroundColor]);

  // Create meshes only when grid size or source changes
  useEffect(() => {
    if (!sceneRef.current || !sourceCanvas) {
      return;
    }

    // Clear luminance cache when grid or source changes
    luminanceCacheRef.current = null;

    // Clean up old meshes
    meshesRef.current.forEach((mesh) => {
      sceneRef.current?.remove(mesh);
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
    });
    meshesRef.current = [];

    // Clean up old textures
    texturesRef.current.forEach((tex) => tex.dispose());
    texturesRef.current = [];

    // Get source image data
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const data = imageData.data;

    // Calculate image draw area within the canvas (same logic as TeacherStudio)
    // This accounts for how the image is centered on a gray background when aspect ratio differs
    const sourceAspectRatio = sourceWidth / sourceHeight;
    let drawWidth, drawHeight;
    if (sourceAspectRatio >= 1) {
      drawHeight = sourceCanvas.height;
      drawWidth = sourceCanvas.height * sourceAspectRatio;
    } else {
      drawWidth = sourceCanvas.width;
      drawHeight = sourceCanvas.width / sourceAspectRatio;
    }
    const drawX = (sourceCanvas.width - drawWidth) / 2;
    const drawY = (sourceCanvas.height - drawHeight) / 2;

    // Pre-calculate luminance for each grid cell
    const luminanceData = new Uint8Array(gridSizeX * gridSizeY);
    for (let i = 0; i < gridSizeY; i++) {
      for (let j = 0; j < gridSizeX; j++) {
        const idx = i * gridSizeX + j;

        // Map grid cell to actual image pixel position within canvas
        const srcX = Math.floor((j / gridSizeX) * drawWidth + drawX);
        const srcY = Math.floor((i / gridSizeY) * drawHeight + drawY);
        const srcW = Math.max(1, Math.floor(drawWidth / gridSizeX));
        const srcH = Math.max(1, Math.floor(drawHeight / gridSizeY));

        let totalLuminance = 0;
        let pixelCount = 0;

        for (let dy = 0; dy < srcH; dy++) {
          for (let dx = 0; dx < srcW; dx++) {
            const px = Math.min(srcX + dx, sourceCanvas.width - 1);
            const py = Math.min(srcY + dy, sourceCanvas.height - 1);
            const pidx = (py * sourceCanvas.width + px) * 4;
            const r = data[pidx];
            const g = data[pidx + 1];
            const b = data[pidx + 2];
            totalLuminance += r * 0.2126 + g * 0.7152 + b * 0.0722;
            pixelCount++;
          }
        }

        const avgLuminance = pixelCount > 0 ? totalLuminance / pixelCount : 128;
        const level = Math.min(9, Math.max(0, Math.floor((avgLuminance / 255) * 10)));
        luminanceData[idx] = level;
      }
    }
    luminanceCacheRef.current = luminanceData;

    // Check if merging can be enabled (requires no jitter or flip)
    const canMerge = enableMergeOptimization && sizeJitter === 0 && rotationJitter === 0 && !enableFlip;

    // Track merged cell info for jitter updates
    // Each entry: { isMerged, mergedSize (1 or 2), baseJ, baseI }
    const cellMeta: Array<{ isMerged: boolean; mergedSize: number; baseJ: number; baseI: number }> = [];

    let meshCount = 0;
    const logMeshCount = (label: string, count: number) => {
      console.log(`[TeacherParticleCanvas] ${label}: ${count} meshes`);
    };

    if (canMerge) {
      // Merged 2x2 block iteration
      const blockCountY = Math.floor(gridSizeY / 2);
      const blockCountX = Math.floor(gridSizeX / 2);

      for (let bi = 0; bi < blockCountY; bi++) {
        for (let bj = 0; bj < blockCountX; bj++) {
          // Get levels for 2x2 block
          const i0 = bi * 2;
          const j0 = bj * 2;
          const level00 = luminanceData[i0 * gridSizeX + j0];
          const level01 = luminanceData[(i0 + 1) * gridSizeX + j0];
          const level10 = luminanceData[i0 * gridSizeX + j0 + 1];
          const level11 = luminanceData[(i0 + 1) * gridSizeX + j0 + 1];

          const allSame = level00 === level01 && level01 === level10 && level10 === level11;

          if (allSame) {
            // Create merged 2x2 mesh
            const level = level00;
            const layer = brushLayers[level];
            let texture: THREE.Texture;
            if (layer?.canvas) {
              const tex = new THREE.CanvasTexture(layer.canvas);
              tex.minFilter = THREE.LinearFilter;
              tex.magFilter = THREE.LinearFilter;
              texture = tex;
            } else {
              const canvas = document.createElement('canvas');
              canvas.width = BRUSH_TEXTURE_SIZE;
              canvas.height = BRUSH_TEXTURE_SIZE;
              const tctx = canvas.getContext('2d');
              if (tctx) {
                tctx.fillStyle = level < 5 ? '#000000' : '#ffffff';
                tctx.fillRect(0, 0, BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
              }
              texture = new THREE.CanvasTexture(canvas);
            }
            texturesRef.current.push(texture);

            const mergedSize = BRUSH_TEXTURE_SIZE * 2;
            const geometry = new THREE.PlaneGeometry(mergedSize, mergedSize);
            const material = new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              opacity: 1.0,
            });
            const mesh = new THREE.Mesh(geometry, material);

            // Position at center of 2x2 block
            const x = (j0 + 1) * BRUSH_TEXTURE_SIZE;
            const y = (gridSizeY - (i0 + 1)) * BRUSH_TEXTURE_SIZE;
            mesh.position.set(x, y, 0);

            sceneRef.current.add(mesh);
            meshesRef.current.push(mesh);
            meshCount++;

            // Mark all 4 cells as belonging to this merged mesh
            cellMeta[i0 * gridSizeX + j0] = { isMerged: true, mergedSize: 2, baseJ: j0, baseI: i0 };
            cellMeta[(i0 + 1) * gridSizeX + j0] = { isMerged: true, mergedSize: 2, baseJ: j0, baseI: i0 };
            cellMeta[i0 * gridSizeX + j0 + 1] = { isMerged: true, mergedSize: 2, baseJ: j0, baseI: i0 };
            cellMeta[(i0 + 1) * gridSizeX + j0 + 1] = { isMerged: true, mergedSize: 2, baseJ: j0, baseI: i0 };
          } else {
            // Create 4 individual meshes
            const positions = [
              [i0, j0, level00],
              [i0 + 1, j0, level01],
              [i0, j0 + 1, level10],
              [i0 + 1, j0 + 1, level11],
            ];
            for (const [i, j, level] of positions) {
              const idx = i * gridSizeX + j;
              const layer = brushLayers[level];
              let texture: THREE.Texture;
              if (layer?.canvas) {
                const tex = new THREE.CanvasTexture(layer.canvas);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                texture = tex;
              } else {
                const canvas = document.createElement('canvas');
                canvas.width = BRUSH_TEXTURE_SIZE;
                canvas.height = BRUSH_TEXTURE_SIZE;
                const tctx = canvas.getContext('2d');
                if (tctx) {
                  tctx.fillStyle = level < 5 ? '#000000' : '#ffffff';
                  tctx.fillRect(0, 0, BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
                }
                texture = new THREE.CanvasTexture(canvas);
              }
              texturesRef.current.push(texture);

              const geometry = new THREE.PlaneGeometry(BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
              const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 1.0,
              });
              const mesh = new THREE.Mesh(geometry, material);

              const x = j * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
              const y = (gridSizeY - i - 1) * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
              mesh.position.set(x, y, 0);

              sceneRef.current.add(mesh);
              meshesRef.current.push(mesh);
              meshCount++;

              cellMeta[idx] = { isMerged: false, mergedSize: 1, baseJ: j, baseI: i };
            }
          }
        }
      }

      // Handle right boundary (odd gridSizeX)
      if (gridSizeX % 2 === 1) {
        const j = gridSizeX - 1;
        for (let i = 0; i < gridSizeY; i++) {
          const idx = i * gridSizeX + j;
          const level = luminanceData[idx];
          const layer = brushLayers[level];
          let texture: THREE.Texture;
          if (layer?.canvas) {
            const tex = new THREE.CanvasTexture(layer.canvas);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            texture = tex;
          } else {
            const canvas = document.createElement('canvas');
            canvas.width = BRUSH_TEXTURE_SIZE;
            canvas.height = BRUSH_TEXTURE_SIZE;
            const tctx = canvas.getContext('2d');
            if (tctx) {
              tctx.fillStyle = level < 5 ? '#000000' : '#ffffff';
              tctx.fillRect(0, 0, BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
            }
            texture = new THREE.CanvasTexture(canvas);
          }
          texturesRef.current.push(texture);

          const geometry = new THREE.PlaneGeometry(BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0,
          });
          const mesh = new THREE.Mesh(geometry, material);

          const x = j * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
          const y = (gridSizeY - i - 1) * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
          mesh.position.set(x, y, 0);

          sceneRef.current.add(mesh);
          meshesRef.current.push(mesh);
          meshCount++;

          cellMeta[idx] = { isMerged: false, mergedSize: 1, baseJ: j, baseI: i };
        }
      }

      // Handle bottom boundary (odd gridSizeY)
      if (gridSizeY % 2 === 1) {
        const i = gridSizeY - 1;
        const blockCountX = Math.floor(gridSizeX / 2);
        for (let bj = 0; bj < blockCountX; bj++) {
          const j0 = bj * 2;
          // Scan 2x1 pair
          const level00 = luminanceData[i * gridSizeX + j0];
          const level10 = luminanceData[i * gridSizeX + j0 + 1];
          if (level00 === level10) {
            // Create merged 2x1 mesh
            const level = level00;
            const layer = brushLayers[level];
            let texture: THREE.Texture;
            if (layer?.canvas) {
              const tex = new THREE.CanvasTexture(layer.canvas);
              tex.minFilter = THREE.LinearFilter;
              tex.magFilter = THREE.LinearFilter;
              texture = tex;
            } else {
              const canvas = document.createElement('canvas');
              canvas.width = BRUSH_TEXTURE_SIZE;
              canvas.height = BRUSH_TEXTURE_SIZE;
              const tctx = canvas.getContext('2d');
              if (tctx) {
                tctx.fillStyle = level < 5 ? '#000000' : '#ffffff';
                tctx.fillRect(0, 0, BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
              }
              texture = new THREE.CanvasTexture(canvas);
            }
            texturesRef.current.push(texture);

            const mergedSize = BRUSH_TEXTURE_SIZE * 2;
            const geometry = new THREE.PlaneGeometry(mergedSize, BRUSH_TEXTURE_SIZE);
            const material = new THREE.MeshBasicMaterial({
              map: texture,
              transparent: true,
              opacity: 1.0,
            });
            const mesh = new THREE.Mesh(geometry, material);

            const x = (j0 + 1) * BRUSH_TEXTURE_SIZE;
            const y = (gridSizeY - i - 1) * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
            mesh.position.set(x, y, 0);

            sceneRef.current.add(mesh);
            meshesRef.current.push(mesh);
            meshCount++;

            cellMeta[i * gridSizeX + j0] = { isMerged: true, mergedSize: 2, baseJ: j0, baseI: i };
            cellMeta[i * gridSizeX + j0 + 1] = { isMerged: true, mergedSize: 2, baseJ: j0, baseI: i };
          } else {
            // Two separate meshes
            for (const [jj, lvl] of [[j0, level00], [j0 + 1, level10]] as const) {
              const idx = i * gridSizeX + jj;
              const layer = brushLayers[lvl];
              let texture: THREE.Texture;
              if (layer?.canvas) {
                const tex = new THREE.CanvasTexture(layer.canvas);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                texture = tex;
              } else {
                const canvas = document.createElement('canvas');
                canvas.width = BRUSH_TEXTURE_SIZE;
                canvas.height = BRUSH_TEXTURE_SIZE;
                const tctx = canvas.getContext('2d');
                if (tctx) {
                  tctx.fillStyle = lvl < 5 ? '#000000' : '#ffffff';
                  tctx.fillRect(0, 0, BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
                }
                texture = new THREE.CanvasTexture(canvas);
              }
              texturesRef.current.push(texture);

              const geometry = new THREE.PlaneGeometry(BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
              const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 1.0,
              });
              const mesh = new THREE.Mesh(geometry, material);

              const x = jj * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
              const y = (gridSizeY - i - 1) * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
              mesh.position.set(x, y, 0);

              sceneRef.current.add(mesh);
              meshesRef.current.push(mesh);
              meshCount++;

              cellMeta[idx] = { isMerged: false, mergedSize: 1, baseJ: jj, baseI: i };
            }
          }
        }
        // Handle right boundary if both odd
        if (gridSizeX % 2 === 1) {
          const j = gridSizeX - 1;
          const idx = i * gridSizeX + j;
          const level = luminanceData[idx];
          const layer = brushLayers[level];
          let texture: THREE.Texture;
          if (layer?.canvas) {
            const tex = new THREE.CanvasTexture(layer.canvas);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            texture = tex;
          } else {
            const canvas = document.createElement('canvas');
            canvas.width = BRUSH_TEXTURE_SIZE;
            canvas.height = BRUSH_TEXTURE_SIZE;
            const tctx = canvas.getContext('2d');
            if (tctx) {
              tctx.fillStyle = level < 5 ? '#000000' : '#ffffff';
              tctx.fillRect(0, 0, BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
            }
            texture = new THREE.CanvasTexture(canvas);
          }
          texturesRef.current.push(texture);

          const geometry = new THREE.PlaneGeometry(BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0,
          });
          const mesh = new THREE.Mesh(geometry, material);

          const x = j * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
          const y = (gridSizeY - i - 1) * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
          mesh.position.set(x, y, 0);

          sceneRef.current.add(mesh);
          meshesRef.current.push(mesh);
          meshCount++;

          cellMeta[idx] = { isMerged: false, mergedSize: 1, baseJ: j, baseI: i };
        }
      }

      logMeshCount('After merge optimization', meshCount);
    } else {
      // Original: no merging when jitter or flip is enabled
      for (let i = 0; i < gridSizeY; i++) {
        for (let j = 0; j < gridSizeX; j++) {
          const idx = i * gridSizeX + j;
          const level = luminanceData[idx];

          // Get brush texture
          const layer = brushLayers[level];
          let texture: THREE.Texture;
          if (layer?.canvas) {
            const tex = new THREE.CanvasTexture(layer.canvas);
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            texturesRef.current[idx] = tex;
            texture = tex;
          } else {
            // Placeholder - black for dark levels, white for light
            const canvas = document.createElement('canvas');
            canvas.width = BRUSH_TEXTURE_SIZE;
            canvas.height = BRUSH_TEXTURE_SIZE;
            const tctx = canvas.getContext('2d');
            if (tctx) {
              tctx.fillStyle = level < 5 ? '#000000' : '#ffffff';
              tctx.fillRect(0, 0, BRUSH_TEXTURE_SIZE, BRUSH_TEXTURE_SIZE);
            }
            const tex = new THREE.CanvasTexture(canvas);
            texturesRef.current[idx] = tex;
            texture = tex;
          }

          // Calculate size with jitter (sizeJitter is 0-100, factor is 0.25-4.0)
          const k = sizeJitter / 100; // 0-1
          const randSize = hash(j, i, 1);
          const sizeFactor = 1.0 - k * 0.75 + randSize * k * 3.75;
          const size = BRUSH_TEXTURE_SIZE * sizeFactor;

          // Calculate rotation with jitter
          const randRot = hash(j, i, 2);
          const maxRot = (rotationJitter * Math.PI) / 180;
          const rotation = (randRot - 0.5) * 2 * maxRot;

          // Calculate flip
          const randFlip = hash(j, i, 3);
          const flip = enableFlip && randFlip > 0.5;

          // Create mesh
          const geometry = new THREE.PlaneGeometry(size, size);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0,
          });
          const mesh = new THREE.Mesh(geometry, material);

          // Position at grid cell center
          const x = j * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
          const y = (gridSizeY - i - 1) * BRUSH_TEXTURE_SIZE + BRUSH_TEXTURE_SIZE / 2;
          mesh.position.set(x, y, 0);
          mesh.rotation.z = rotation;
          if (flip) {
            mesh.scale.x = -1;
          }

          sceneRef.current.add(mesh);
          meshesRef.current.push(mesh);
          meshCount++;

          cellMeta[idx] = { isMerged: false, mergedSize: 1, baseJ: j, baseI: i };
        }
      }
      logMeshCount('Without merge (jitter/flip enabled)', meshCount);
    }

    // Store cellMeta for jitter updates
    (meshesRef.current as unknown as { cellMeta: typeof cellMeta }).cellMeta = cellMeta;
  }, [sourceCanvas, gridSizeX, gridSizeY, brushLayers, sizeJitter, rotationJitter, enableFlip, updateTrigger]);

  // Update jitter properties without recreating meshes
  useEffect(() => {
    if (!sceneRef.current || meshesRef.current.length === 0) return;

    // With merging enabled, cellMeta is attached to meshesRef.current
    const cellMeta: Array<{ isMerged: boolean; mergedSize: number; baseJ: number; baseI: number }> = (meshesRef.current as unknown as { cellMeta: typeof cellMeta }).cellMeta;

    if (cellMeta) {
      // Merged mesh mode: cellMeta exists when canMerge=true (i.e., jitter/flip disabled)
      // When jitter/flip is enabled, meshes are rebuilt without cellMeta (non-merged)
      // So this branch only runs when jitter is 0, but we handle it generically
      const visitedMergedBlocks = new Set<number>();

      for (let meshIdx = 0; meshIdx < meshesRef.current.length; meshIdx++) {
        const mesh = meshesRef.current[meshIdx];
        const meta = cellMeta[meshIdx];
        if (!meta) continue;

        if (meta.isMerged) {
          const blockKey = meta.baseJ * 10000 + meta.baseI;
          if (visitedMergedBlocks.has(blockKey)) continue;
          visitedMergedBlocks.add(blockKey);

          // Update merged mesh: calculate size for the base position
          const k = sizeJitter / 100;
          const randSize = hash(meta.baseJ, meta.baseI, 1);
          const sizeFactor = 1.0 - k * 0.75 + randSize * k * 3.75;
          const size = BRUSH_TEXTURE_SIZE * meta.mergedSize * sizeFactor;

          const randRot = hash(meta.baseJ, meta.baseI, 2);
          const maxRot = (rotationJitter * Math.PI) / 180;
          const rotation = (randRot - 0.5) * 2 * maxRot;

          const randFlip = hash(meta.baseJ, meta.baseI, 3);
          const flip = enableFlip && randFlip > 0.5;

          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(size, size);
          mesh.rotation.z = rotation;
          mesh.scale.x = flip ? -1 : 1;
        } else {
          // Single cell mesh - use baseJ from meta (j is not in scope here)
          const k = sizeJitter / 100;
          const randSize = hash(meta.baseJ, meta.baseI, 1);
          const sizeFactor = 1.0 - k * 0.75 + randSize * k * 3.75;
          const size = BRUSH_TEXTURE_SIZE * sizeFactor;

          const randRot = hash(meta.baseJ, meta.baseI, 2);
          const maxRot = (rotationJitter * Math.PI) / 180;
          const rotation = (randRot - 0.5) * 2 * maxRot;

          const randFlip = hash(meta.baseJ, meta.baseI, 3);
          const flip = enableFlip && randFlip > 0.5;

          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(size, size);
          mesh.rotation.z = rotation;
          mesh.scale.x = flip ? -1 : 1;
        }
      }
    } else {
      // Original logic for non-merged mode
      const k = sizeJitter / 100; // 0-1

      for (let i = 0; i < gridSizeY; i++) {
        for (let j = 0; j < gridSizeX; j++) {
          const idx = i * gridSizeX + j;
          const mesh = meshesRef.current[idx];
          if (!mesh) continue;

          // Calculate new size with jitter
          const randSize = hash(j, i, 1);
          const sizeFactor = 1.0 - k * 0.75 + randSize * k * 3.75;
          const size = BRUSH_TEXTURE_SIZE * sizeFactor;

          // Calculate new rotation
          const randRot = hash(j, i, 2);
          const maxRot = (rotationJitter * Math.PI) / 180;
          const rotation = (randRot - 0.5) * 2 * maxRot;

          // Calculate flip
          const randFlip = hash(j, i, 3);
          const flip = enableFlip && randFlip > 0.5;

          // Update existing mesh properties
          mesh.geometry.dispose();
          mesh.geometry = new THREE.PlaneGeometry(size, size);
          mesh.rotation.z = rotation;
          mesh.scale.x = flip ? -1 : 1;
        }
      }
    }
  }, [sizeJitter, rotationJitter, enableFlip, gridSizeX, gridSizeY]);

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && isFullscreen) {
      onMouseDown?.(e);
    }
  }, [isFullscreen, onMouseDown]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isFullscreen) {
      onMouseMove?.(e);
    }
  }, [isFullscreen, onMouseMove]);

  const handleMouseUp = useCallback(() => {
    if (isFullscreen) {
      onMouseUp?.();
    }
  }, [isFullscreen, onMouseUp]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!isFullscreen) return;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(5, Math.max(0.1, transform.scale * delta));
    onTransformChange({ ...transform, scale: newScale });
  }, [isFullscreen, transform, onTransformChange]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden"
      style={{
        transform: isFullscreen ? `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` : 'none',
        transformOrigin: 'left top',
        transition: 'transform 0.1s ease-out',
        cursor: isFullscreen ? 'grab' : 'default',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    />
  );
}
