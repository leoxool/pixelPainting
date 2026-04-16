import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import { brushMosaicVertexShader, simpleBrushMosaicFragmentShader } from '@/components/shaders/brushMosaicShader';

interface BrushLayer {
  canvas: HTMLCanvasElement;
}

interface UseMosaicRendererOptions {
  gridSizeX: number;
  gridSizeY: number;
  brushLayers: (BrushLayer | null)[];
  refTextureCanvas: HTMLCanvasElement | null;
  sizeJitter: number;
  rotationJitter: number;
  enableFlip: boolean;
}

interface UseMosaicRendererReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isReady: boolean;
  updateBrushTextures: () => void;
  updateRefTexture: () => void;
  updateJitter: (size: number, rotation: number, flip: boolean) => void;
  updateGridSize: (x: number, y: number) => void;
  render: () => void;
  dispose: () => void;
}

export function useMosaicRenderer(options: UseMosaicRendererOptions): UseMosaicRendererReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const brushTexturesRef = useRef<THREE.Texture[]>([]);
  const refTextureRef = useRef<THREE.Texture | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [isReady, setIsReady] = useState(false);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create orthographic camera
    const aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
    const camera = new THREE.OrthographicCamera(-aspect / 2, aspect / 2, 0.5, -0.5, 0.1, 100);
    camera.position.z = 1;
    cameraRef.current = camera;

    // Create plane geometry
    const geometry = new THREE.PlaneGeometry(1, 1);

    // Create shader material
    const material = new THREE.ShaderMaterial({
      vertexShader: brushMosaicVertexShader,
      fragmentShader: simpleBrushMosaicFragmentShader,
      uniforms: {
        uRefTexture: { value: null },
        uBrushTextures: { value: new Array(10).fill(null) },
        uGridSize: { value: new THREE.Vector2(options.gridSizeX, options.gridSizeY) },
      },
    });
    materialRef.current = material;

    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshRef.current = mesh;

    setIsReady(true);

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      rendererRef.current.setSize(width, height);
      const aspect = width / height;
      camera.left = -aspect / 2;
      camera.right = aspect / 2;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update brush textures
  const updateBrushTextures = useCallback(() => {
    if (!materialRef.current) return;

    const textures: THREE.Texture[] = [];
    options.brushLayers.forEach((layer, index) => {
      if (layer?.canvas) {
        const tex = new THREE.CanvasTexture(layer.canvas);
        tex.needsUpdate = true;
        textures.push(tex);
        brushTexturesRef.current[index] = tex;
      } else {
        // Create a white texture for empty brushes
        const canvas = document.createElement('canvas');
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'rgba(0,0,0,0)';
          ctx.fillRect(0, 0, 100, 100);
        }
        const tex = new THREE.CanvasTexture(canvas);
        textures.push(tex);
      }
    });

    materialRef.current.uniforms.uBrushTextures.value = textures;
  }, [options.brushLayers]);

  // Update reference texture
  const updateRefTexture = useCallback(() => {
    if (!materialRef.current || !options.refTextureCanvas) return;

    const tex = new THREE.CanvasTexture(options.refTextureCanvas);
    tex.needsUpdate = true;
    refTextureRef.current = tex;
    materialRef.current.uniforms.uRefTexture.value = tex;
  }, [options.refTextureCanvas]);

  // Update jitter parameters
  const updateJitter = useCallback((size: number, rotation: number, flip: boolean) => {
    if (!materialRef.current) return;

    // Switch to full shader when jitter is enabled
    if (size > 0 || rotation > 0 || flip) {
      import('@/components/shaders/brushMosaicShader').then((module) => {
        if (materialRef.current) {
          materialRef.current.fragmentShader = module.brushMosaicFragmentShader;
          materialRef.current.uniforms.uSizeJitter.value = size;
          materialRef.current.uniforms.uRotationJitter.value = rotation;
          materialRef.current.uniforms.uEnableFlip.value = flip ? 1.0 : 0.0;
          materialRef.current.uniforms.uTime = { value: 0 };
          materialRef.current.needsUpdate = true;
        }
      });
    }
  }, []);

  // Update grid size
  const updateGridSize = useCallback((x: number, y: number) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uGridSize.value.set(x, y);
  }, []);

  // Render loop
  const render = useCallback(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    // Update time uniform for animation
    if (materialRef.current?.uniforms.uTime) {
      materialRef.current.uniforms.uTime.value = performance.now();
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, []);

  // Start render loop
  useEffect(() => {
    if (!isReady) return;

    const loop = () => {
      render();
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isReady, render]);

  // Cleanup
  const dispose = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    brushTexturesRef.current.forEach((tex) => tex.dispose());
    refTextureRef.current?.dispose();
    rendererRef.current?.dispose();
  }, []);

  // Update textures when brush layers change
  useEffect(() => {
    updateBrushTextures();
  }, [updateBrushTextures, options.brushLayers]);

  // Update ref texture when canvas changes
  useEffect(() => {
    updateRefTexture();
  }, [updateRefTexture, options.refTextureCanvas]);

  // Update grid size when it changes
  useEffect(() => {
    updateGridSize(options.gridSizeX, options.gridSizeY);
  }, [updateGridSize, options.gridSizeX, options.gridSizeY]);

  return {
    containerRef,
    isReady,
    updateBrushTextures,
    updateRefTexture,
    updateJitter,
    updateGridSize,
    render,
    dispose,
  };
}
