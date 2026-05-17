// Material System - MeshStandardMaterial with animated properties
import * as THREE from 'three';
import { gsap } from 'gsap';

export interface MaterialAnimationTarget {
  opacity?: number;
  color?: string;
  emissiveIntensity?: number;
  metalness?: number;
  roughness?: number;
}

export class MaterialSystem {
  private materials: Map<THREE.Mesh, THREE.Material> = new Map();
  private originalMaterials: Map<THREE.Mesh, THREE.Material> = new Map();
  private animationRefs: Map<THREE.Mesh, gsap.core.Tween> = new Map();

  // Create a MeshStandardMaterial suitable for lighting
  createStandardMaterial(options: {
    color?: string | number;
    map?: THREE.Texture;
    transparent?: boolean;
    opacity?: number;
    emissive?: string | number;
    emissiveIntensity?: number;
    metalness?: number;
    roughness?: number;
  } = {}): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: options.color ?? 0xffffff,
      map: options.map,
      transparent: options.transparent ?? true,
      opacity: options.opacity ?? 1,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      metalness: options.metalness ?? 0,
      roughness: options.roughness ?? 1,
    });
    return material;
  }

  // Apply material to mesh (storing original for restoration)
  applyMaterial(mesh: THREE.Mesh, material: THREE.Material) {
    // Store original material
    this.originalMaterials.set(mesh, mesh.material as THREE.Material);
    this.materials.set(mesh, material);
    mesh.material = material;
  }

  // Restore original material
  restoreMaterial(mesh: THREE.Mesh) {
    const original = this.originalMaterials.get(mesh);
    if (original) {
      mesh.material = original;
      this.materials.delete(mesh);
      this.originalMaterials.delete(mesh);
    }
  }

  // Animate material property on a mesh
  animateMaterial(
    mesh: THREE.Mesh,
    target: MaterialAnimationTarget,
    duration: number = 1,
    delay: number = 0,
    easing: string = 'power2.inOut'
  ) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!material || !(material instanceof THREE.MeshStandardMaterial)) return;

    // Stop existing animation for this mesh
    this.stopAnimation(mesh);

    const proxy: Record<string, number> = {};

    if (target.opacity !== undefined) {
      proxy.opacity = material.opacity;
    }
    if (target.emissiveIntensity !== undefined) {
      proxy.emissiveIntensity = material.emissiveIntensity;
    }
    if (target.metalness !== undefined) {
      proxy.metalness = material.metalness;
    }
    if (target.roughness !== undefined) {
      proxy.roughness = material.roughness;
    }

    const tween = gsap.to(proxy, {
      ...target,
      duration,
      delay,
      ease: easing,
      onUpdate: () => {
        if (target.opacity !== undefined) {
          material.opacity = proxy.opacity;
        }
        if (target.color !== undefined) {
          material.color.set(target.color);
        }
        if (target.emissiveIntensity !== undefined) {
          material.emissiveIntensity = proxy.emissiveIntensity;
        }
        if (target.metalness !== undefined) {
          material.metalness = proxy.metalness;
        }
        if (target.roughness !== undefined) {
          material.roughness = proxy.roughness;
        }
        material.needsUpdate = true;
      },
    });

    this.animationRefs.set(mesh, tween);
  }

  // Animate material property on all meshes using a specific material
  animateAllWithMaterial(
    material: THREE.Material,
    target: MaterialAnimationTarget,
    duration: number = 1,
    delay: number = 0,
    easing: string = 'power2.inOut'
  ) {
    this.materials.forEach((mat, mesh) => {
      if (mat === material) {
        this.animateMaterial(mesh, target, duration, delay, easing);
      }
    });
  }

  // Animate opacity over time (useful for fade effects)
  animateOpacity(
    mesh: THREE.Mesh,
    targetOpacity: number,
    duration: number = 1,
    delay: number = 0,
    easing: string = 'power2.inOut'
  ) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!material) return;

    this.stopAnimation(mesh);

    const proxy = { opacity: material.opacity };
    const tween = gsap.to(proxy, {
      opacity: targetOpacity,
      duration,
      delay,
      ease: easing,
      onUpdate: () => {
        material.opacity = proxy.opacity;
        material.needsUpdate = true;
      },
    });

    this.animationRefs.set(mesh, tween);
  }

  // Animate emissive glow pulse
  animateEmissivePulse(
    mesh: THREE.Mesh,
    intensity: number,
    duration: number = 1,
    delay: number = 0,
    easing: string = 'power2.inOut'
  ) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!material) return;

    this.stopAnimation(mesh);

    const proxy = { emissiveIntensity: material.emissiveIntensity };
    const tween = gsap.to(proxy, {
      emissiveIntensity: intensity,
      duration,
      delay,
      ease: easing,
      yoyo: true,
      repeat: -1,
      onUpdate: () => {
        material.emissiveIntensity = proxy.emissiveIntensity;
        material.needsUpdate = true;
      },
    });

    this.animationRefs.set(mesh, tween);
  }

  // Stop animation for specific mesh
  stopAnimation(mesh: THREE.Mesh) {
    const tween = this.animationRefs.get(mesh);
    if (tween) {
      tween.kill();
      this.animationRefs.delete(mesh);
    }
  }

  // Stop all animations
  stopAll() {
    this.animationRefs.forEach(tween => tween.kill());
    this.animationRefs.clear();
  }

  // Dispose all managed materials
  dispose() {
    this.stopAll();
    this.materials.forEach((material) => {
      material.dispose();
    });
    this.materials.clear();
    this.originalMaterials.clear();
  }

  // Update all instanced mesh materials (for brush animations)
  updateInstancedMeshMaterial(
    instancedMesh: THREE.InstancedMesh,
    level: number,
    targetOpacity: number,
    duration: number = 1,
    easing: string = 'power2.inOut'
  ) {
    // For instanced meshes, we animate the material's opacity
    const material = instancedMesh.material as THREE.MeshStandardMaterial;
    if (!material || !(material instanceof THREE.MeshStandardMaterial)) return;

    this.stopAnimation(instancedMesh);

    const proxy = { opacity: material.opacity };
    const tween = gsap.to(proxy, {
      opacity: targetOpacity,
      duration,
      ease: easing,
      onUpdate: () => {
        material.opacity = proxy.opacity;
        material.needsUpdate = true;
      },
    });

    this.animationRefs.set(instancedMesh, tween);
  }
}
