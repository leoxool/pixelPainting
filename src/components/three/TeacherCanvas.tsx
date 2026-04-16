'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface StudentAsset {
  id: string;
  texture_url: string;
  student_id: string;
}

interface TeacherCanvasProps {
  assets: StudentAsset[];
  gridWidth: number;
  gridHeight: number;
  sourceType: 'webcam' | 'image';
  imageUrl?: string;
  adoptedTextureUrl?: string | null;
}

// Simpler shader using a single combined atlas
const mosaicVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Each student gets a row in the atlas, 10 columns per row (for luminance segments)
const mosaicFragmentShader = `
  uniform sampler2D uRefTexture;
  uniform sampler2D uAtlas;
  uniform int uStudentCount;
  uniform vec2 uGridSize;
  uniform float uTime;
  uniform bool uAdopted;

  varying vec2 vUv;

  float getLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    // If a texture has been adopted, display it directly without mosaic
    if (uAdopted) {
      gl_FragColor = texture2D(uRefTexture, vUv);
      return;
    }

    // Original mosaic logic
    // Sample reference texture at current UV
    vec4 refColor = texture2D(uRefTexture, vUv);

    // Calculate luminance of reference pixel
    float luminance = getLuminance(refColor.rgb);

    // Map luminance to segment index (0-9)
    float segmentIndex = floor(luminance * 10.0);
    segmentIndex = clamp(segmentIndex, 0.0, 9.0);

    // Determine which student to use based on position
    vec2 gridPos = floor(vUv * uGridSize);
    int studentIndex = int(mod(gridPos.x + gridPos.y, float(max(1, uStudentCount))));

    // Calculate local UV within the grid cell
    vec2 gridUV = fract(vUv * uGridSize);

    // Atlas layout: students are rows, each row has 10 segments
    // UV.y = (studentIndex / uStudentCount) + (gridUV.y / uStudentCount)
    float studentRow = float(studentIndex);
    float rowHeight = 1.0 / max(1.0, float(uStudentCount));

    vec2 atlasUV = vec2(
      (segmentIndex * 0.1) + (gridUV.x * 0.1),
      (studentRow * rowHeight) + (gridUV.y * rowHeight)
    );

    // Sample from atlas
    vec4 atlasColor = texture2D(uAtlas, atlasUV);

    // If no students, use reference color
    if (uStudentCount == 0) {
      gl_FragColor = refColor;
    } else {
      gl_FragColor = vec4(atlasColor.rgb, 1.0);
    }
  }
`;

function MosaicMesh({
  studentCount,
  gridWidth,
  gridHeight,
  refTexture,
  atlasTexture,
  isAdopted,
}: {
  studentCount: number;
  gridWidth: number;
  gridHeight: number;
  refTexture: THREE.Texture | null;
  atlasTexture: THREE.Texture | null;
  isAdopted: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  // Shader uniforms
  const uniforms = useMemo(
    () => ({
      uRefTexture: new THREE.Uniform(refTexture),
      uAtlas: new THREE.Uniform<THREE.Texture | null>(atlasTexture),
      uStudentCount: new THREE.Uniform(studentCount),
      uGridSize: new THREE.Uniform(new THREE.Vector2(gridWidth, gridHeight)),
      uTime: new THREE.Uniform(0),
      uAdopted: new THREE.Uniform(false),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Update uniforms when props change
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uRefTexture.value = refTexture;
      materialRef.current.uniforms.uAtlas.value = atlasTexture;
      materialRef.current.uniforms.uStudentCount.value = studentCount;
      materialRef.current.uniforms.uGridSize.value.set(gridWidth, gridHeight);
      materialRef.current.uniforms.uAdopted.value = isAdopted;
    }
  }, [refTexture, atlasTexture, studentCount, gridWidth, gridHeight, isAdopted]);

  // Update time uniform
  useFrame(({ clock }) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[size.width / 100, size.height / 100]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={mosaicVertexShader}
        fragmentShader={mosaicFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}

function createPlaceholderTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 1000, 0);
    for (let i = 0; i <= 10; i++) {
      const shade = Math.floor((i / 10) * 255);
      gradient.addColorStop(i / 10, `rgb(${shade}, ${shade}, ${shade})`);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 100);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function createCombinedAtlas(assets: StudentAsset[]): THREE.Texture | null {
  if (assets.length === 0) return null;

  const segmentWidth = 100;
  const segmentHeight = 100;
  const atlasWidth = segmentWidth * 10; // 10 segments per row
  const atlasHeight = segmentHeight * Math.min(assets.length, 50);

  const canvas = document.createElement('canvas');
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fill with gray placeholder
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, atlasWidth, atlasHeight);

  // We'll load images into the atlas using a promise-based approach
  // For now, return a placeholder
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;

  return texture;
}

export function TeacherCanvas({
  assets,
  gridWidth,
  gridHeight,
  sourceType,
  imageUrl,
  adoptedTextureUrl,
}: TeacherCanvasProps) {
  const [refTexture, setRefTexture] = useState<THREE.Texture | null>(null);
  const [atlasTexture, setAtlasTexture] = useState<THREE.Texture | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdopted, setIsAdopted] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Initialize reference texture
  useEffect(() => {
    // If adopted texture is set, load it instead of webcam/image
    if (adoptedTextureUrl) {
      setIsAdopted(true);
      const loader = new THREE.TextureLoader();
      loader.crossOrigin = 'anonymous';
      loader.load(adoptedTextureUrl, (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        setRefTexture(texture);
        setIsLoading(false);
      }, undefined, (err) => {
        console.error('Adopted texture load error:', err);
        setRefTexture(createPlaceholderTexture());
        setIsAdopted(false);
        setIsLoading(false);
      });
      return;
    }

    setIsAdopted(false);

    if (sourceType === 'webcam') {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;

      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          video.srcObject = stream;
          video.onloadedmetadata = () => {
            video.play();
            const texture = new THREE.VideoTexture(video);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            setRefTexture(texture);
            setIsLoading(false);
          };
        })
        .catch((err) => {
          console.error('Webcam error:', err);
          setRefTexture(createPlaceholderTexture());
          setIsLoading(false);
        });

      videoRef.current = video;

      return () => {
        if (video.srcObject) {
          (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
        }
      };
    } else if (sourceType === 'image' && imageUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(imageUrl, (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        setRefTexture(texture);
        setIsLoading(false);
      });
    } else {
      setRefTexture(createPlaceholderTexture());
      setIsLoading(false);
    }
  }, [sourceType, imageUrl, adoptedTextureUrl]);

  // Load student assets into atlas
  useEffect(() => {
    if (assets.length === 0) {
      setAtlasTexture(createPlaceholderTexture());
      return;
    }

    const loadAssets = async () => {
      const segmentWidth = 100;
      const segmentHeight = 100;
      const atlasWidth = segmentWidth * 10;
      const atlasHeight = segmentHeight * Math.min(assets.length, 50);

      const canvas = document.createElement('canvas');
      canvas.width = atlasWidth;
      canvas.height = atlasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Fill with dark gray placeholder
      ctx.fillStyle = '#404040';
      ctx.fillRect(0, 0, atlasWidth, atlasHeight);

      // Load each student's texture into a row
      const loadPromises = assets.slice(0, 50).map((asset, rowIndex) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.drawImage(img, 0, rowIndex * segmentHeight, atlasWidth, segmentHeight);
            resolve();
          };
          img.onerror = () => {
            // Draw a gradient as fallback for this row
            const gradient = ctx.createLinearGradient(0, rowIndex * segmentHeight, atlasWidth, rowIndex * segmentHeight);
            const shade = Math.floor((rowIndex / assets.length) * 255);
            gradient.addColorStop(0, `rgb(${shade * 0.3}, ${shade * 0.3}, ${shade * 0.3})`);
            gradient.addColorStop(1, `rgb(${shade}, ${shade}, ${shade})`);
            ctx.fillStyle = gradient;
            ctx.fillRect(0, rowIndex * segmentHeight, atlasWidth, segmentHeight);
            resolve();
          };
          img.src = asset.texture_url;
        });
      });

      await Promise.all(loadPromises);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      setAtlasTexture(texture);
    };

    loadAssets();
  }, [assets]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <span className="text-zinc-500">Initializing camera...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <Canvas
        gl={{ preserveDrawingBuffer: true }}
        style={{ background: 'white' }}
      >
        <MosaicMesh
          studentCount={assets.length}
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          refTexture={refTexture}
          atlasTexture={atlasTexture}
          isAdopted={isAdopted}
        />
      </Canvas>
    </div>
  );
}
