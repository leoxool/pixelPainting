'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { brushMosaicVertexShader, simpleBrushMosaicFragmentShader, brushMosaicFragmentShader } from '@/components/shaders/brushMosaicShader';

interface BrushLayer {
  canvas: HTMLCanvasElement;
}

// 笔触纹理尺寸 (每个笔触是100x100像素)
const BRUSH_TEXTURE_SIZE = 100;

interface TeacherCanvas3DProps {
  // 显示区域的宽高(用于CSS渲染)
  displayWidth: number;
  displayHeight: number;
  // 输入源图像的实际尺寸
  sourceWidth: number;
  sourceHeight: number;
  // 网格尺寸(由输入源尺寸/5计算得出)
  gridSizeX: number;
  gridSizeY: number;
  brushLayers: (BrushLayer | null)[];
  sourceCanvas: HTMLCanvasElement | null;
  aspectRatio: number;
  sizeJitter: number;
  rotationJitter: number;
  enableFlip: boolean;
  isFullscreen: boolean;
  transform: { scale: number; x: number; y: number };
  onTransformChange: (transform: { scale: number; x: number; y: number }) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseUp?: () => void;
  // Force re-render when data changes
  updateTrigger?: number;
}

export function TeacherCanvas3D({
  displayWidth,
  displayHeight,
  sourceWidth,
  sourceHeight,
  gridSizeX,
  gridSizeY,
  brushLayers,
  sourceCanvas,
  aspectRatio,
  sizeJitter,
  rotationJitter,
  enableFlip,
  isFullscreen,
  transform,
  onTransformChange,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  updateTrigger = 0,
}: TeacherCanvas3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const brushTexturesRef = useRef<THREE.Texture[]>([]);
  const refTextureRef = useRef<THREE.Texture | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  // 计算输出画布尺寸: 网格数量 × 笔触纹理尺寸
  // 例如: 20x20网格, 每个笔触100x100 → 输出2000x2000像素
  const outputWidth = gridSizeX * BRUSH_TEXTURE_SIZE;
  const outputHeight = gridSizeY * BRUSH_TEXTURE_SIZE;

  // Initialize Three.js
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(outputWidth, outputHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create orthographic camera for the output canvas
    const camera = new THREE.OrthographicCamera(-outputWidth / 2, outputWidth / 2, outputHeight / 2, -outputHeight / 2, 0.1, 100);
    camera.position.z = 1;
    cameraRef.current = camera;

    // Create plane geometry matching output size
    const geometry = new THREE.PlaneGeometry(outputWidth, outputHeight);

    // Initialize with simple shader
    const material = new THREE.ShaderMaterial({
      vertexShader: brushMosaicVertexShader,
      fragmentShader: simpleBrushMosaicFragmentShader,
      uniforms: {
        uRefTexture: { value: null },
        uBrushTextures: { value: new Array(10).fill(null) },
        uGridSize: { value: new THREE.Vector2(gridSizeX, gridSizeY) },
        uSourceSize: { value: new THREE.Vector2(sourceWidth, sourceHeight) },
      },
    });
    materialRef.current = material;

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    isInitializedRef.current = true;

    // Render loop
    const loop = () => {
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      brushTexturesRef.current.forEach((tex) => tex.dispose());
      refTextureRef.current?.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      isInitializedRef.current = false;
    };
  }, []);

  // Update dimensions when grid size changes
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || !meshRef.current || !materialRef.current) return;

    // Resize renderer
    rendererRef.current.setSize(outputWidth, outputHeight);

    // Update camera bounds
    cameraRef.current.left = -outputWidth / 2;
    cameraRef.current.right = outputWidth / 2;
    cameraRef.current.top = outputHeight / 2;
    cameraRef.current.bottom = -outputHeight / 2;
    cameraRef.current.updateProjectionMatrix();

    // Update plane geometry
    meshRef.current.geometry.dispose();
    meshRef.current.geometry = new THREE.PlaneGeometry(outputWidth, outputHeight);

    // Update uniforms
    materialRef.current.uniforms.uGridSize.value.set(gridSizeX, gridSizeY);
    materialRef.current.uniforms.uSourceSize.value.set(sourceWidth, sourceHeight);
  }, [gridSizeX, gridSizeY, sourceWidth, sourceHeight, outputWidth, outputHeight]);

  // Update grid size
  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uGridSize.value.set(gridSizeX, gridSizeY);
  }, [gridSizeX, gridSizeY]);

  // Update brush textures
  useEffect(() => {
    if (!materialRef.current) return;

    brushTexturesRef.current.forEach((tex) => tex.dispose());
    brushTexturesRef.current = [];

    // Create white placeholder textures
    const placeholderCanvas = document.createElement('canvas');
    placeholderCanvas.width = 100;
    placeholderCanvas.height = 100;
    const placeholderCtx = placeholderCanvas.getContext('2d');
    if (placeholderCtx) {
      placeholderCtx.fillStyle = 'rgba(0,0,0,1)';
      placeholderCtx.fillRect(0, 0, 100, 100);
    }
    const placeholderTex = new THREE.CanvasTexture(placeholderCanvas);

    const textures: THREE.Texture[] = [];
    for (let i = 0; i < 10; i++) {
      const layer = brushLayers[i];
      if (layer?.canvas) {
        const tex = new THREE.CanvasTexture(layer.canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        textures.push(tex);
        brushTexturesRef.current.push(tex);
      } else {
        // Use placeholder texture
        textures.push(placeholderTex);
      }
    }

    materialRef.current.uniforms.uBrushTextures.value = textures;
  }, [brushLayers, updateTrigger]);

  // Update reference texture
  useEffect(() => {
    if (!materialRef.current || !sourceCanvas) return;

    if (refTextureRef.current) {
      refTextureRef.current.dispose();
    }

    const tex = new THREE.CanvasTexture(sourceCanvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    refTextureRef.current = tex;
    materialRef.current.uniforms.uRefTexture.value = tex;
  }, [sourceCanvas, updateTrigger]);

  // Update jitter and switch to full shader if needed
  useEffect(() => {
    if (!materialRef.current) return;

    const needsFullShader = sizeJitter > 0 || rotationJitter > 0 || enableFlip;

    if (needsFullShader) {
      materialRef.current.fragmentShader = brushMosaicFragmentShader;
      materialRef.current.uniforms.uSizeJitter = { value: sizeJitter };
      materialRef.current.uniforms.uRotationJitter = { value: rotationJitter };
      materialRef.current.uniforms.uEnableFlip = { value: enableFlip ? 1.0 : 0.0 };
      materialRef.current.uniforms.uSourceSize = { value: new THREE.Vector2(sourceWidth, sourceHeight) };
    } else {
      materialRef.current.fragmentShader = simpleBrushMosaicFragmentShader;
    }
    materialRef.current.needsUpdate = true;
  }, [sizeJitter, rotationJitter, enableFlip]);

  // Handle mouse events for pan
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

  // Handle wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!isFullscreen) return;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(5, Math.max(0.1, transform.scale * delta));
    onTransformChange({ ...transform, scale: newScale });
  }, [isFullscreen, transform, onTransformChange]);

  // Apply transform to canvas element
  const canvasStyle = isFullscreen ? {
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
    transformOrigin: 'center center',
    transition: 'transform 0.1s ease-out',
    cursor: 'grab',
  } : {};

  if (!isFullscreen) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ ...canvasStyle }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        ...canvasStyle,
        cursor: 'grab',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    />
  );
}
