'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { simpleMosaicFragmentShader } from '@/components/shaders/mosaicShader';

interface MosaicRendererProps {
  refTexture: THREE.Texture | null;
  assets: Array<{
    id: string;
    texture_url: string;
    student_id: string;
  }>;
  gridWidth: number;
  gridHeight: number;
}

export function MosaicRenderer({
  refTexture,
  assets,
  gridWidth,
  gridHeight,
}: MosaicRendererProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  // Create atlas textures from asset URLs
  const atlasTextures = useMemo(() => {
    const textures: THREE.Texture[] = [];

    assets.forEach((asset) => {
      const loader = new THREE.TextureLoader();
      const texture = loader.load(asset.texture_url);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      textures.push(texture);
    });

    // If no assets, create a placeholder
    if (textures.length === 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Create a gradient placeholder
        const gradient = ctx.createLinearGradient(0, 0, 1000, 0);
        for (let i = 0; i <= 10; i++) {
          const shade = Math.floor((i / 10) * 255);
          gradient.addColorStop(i / 10, `rgb(${shade}, ${shade}, ${shade})`);
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1000, 100);
      }
      const placeholderTexture = new THREE.CanvasTexture(canvas);
      placeholderTexture.minFilter = THREE.NearestFilter;
      placeholderTexture.magFilter = THREE.NearestFilter;
      textures.push(placeholderTexture);
    }

    return textures;
  }, [assets]);

  // Shader uniforms
  const uniforms = useMemo(
    () => ({
      uRefTexture: new THREE.Uniform(refTexture),
      uAtlasTexture: new THREE.Uniform(atlasTextures[0]),
      uGridSize: new THREE.Uniform(new THREE.Vector2(gridWidth, gridHeight)),
      uAtlasColumns: new THREE.Uniform(10.0),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refTexture, atlasTextures, gridWidth, gridHeight]
  );

  // Update uniforms when textures change
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.uRefTexture.value = refTexture;
      materialRef.current.uniforms.uAtlasTexture.value = atlasTextures[0];
      materialRef.current.uniforms.uGridSize.value.set(gridWidth, gridHeight);
    }
  }, [refTexture, atlasTextures, gridWidth, gridHeight]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[size.width / 100, size.height / 100]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={simpleMosaicFragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
}
