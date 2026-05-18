// TransitionEffects - Cinematic transition effects
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Vector3, AnimatedBrush } from './types';

export interface ExplosionConfig {
  centerX: number;
  centerY: number;
  centerZ: number;
  speed: number;
  duration: number;
}

export interface ImplosionConfig {
  centerX: number;
  centerY: number;
  centerZ: number;
  speed: number;
  duration: number;
}

export interface ColorFlashConfig {
  color: string;
  duration: number;
  intensity: number;
}

export interface StrobeConfig {
  color: string;
  frequency: number; // flashes per second
  duration: number;
}

export interface RackFocusConfig {
  startDistance: number;
  endDistance: number;
  duration: number;
}

export class TransitionEffects {
  private scene: THREE.Scene;
  private flashOverlay: THREE.Mesh | null = null;
  private activeAnimations: gsap.core.Tween[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.createFlashOverlay();
  }

  private createFlashOverlay(): void {
    // Create a full-screen overlay for flash effects
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this.flashOverlay = new THREE.Mesh(geometry, material);
    this.flashOverlay.name = 'flashOverlay';
    this.flashOverlay.renderOrder = 999;
    // Position at camera near plane
    this.flashOverlay.position.z = 0.99;
  }

  // EXPLOSION - Brushes explode outward from center
  explodeBrushes(
    brushes: AnimatedBrush[],
    config: ExplosionConfig,
    progress: number, // 0-1
    onUpdate: (brush: AnimatedBrush, pos: Vector3) => void
  ): void {
    const { centerX, centerY, centerZ, speed } = config;
    const easedProgress = 1 - Math.pow(1 - progress, 3); // ease out

    brushes.forEach((brush, index) => {
      const dx = brush.targetPosition.x - centerX;
      const dy = brush.targetPosition.y - centerY;
      const dz = brush.targetPosition.z - centerZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

      const expansion = easedProgress * speed * progress;
      const offsetX = (dx / dist) * expansion;
      const offsetY = (dy / dist) * expansion;
      const offsetZ = (dz / dist) * expansion;

      // Add random scatter
      const randomX = (Math.random() - 0.5) * 50 * progress;
      const randomY = (Math.random() - 0.5) * 50 * progress;
      const randomZ = (Math.random() - 0.5) * 30 * progress;

      onUpdate(brush, {
        x: brush.targetPosition.x + offsetX + randomX,
        y: brush.targetPosition.y + offsetY + randomY,
        z: brush.targetPosition.z + offsetZ + randomZ,
      });
    });
  }

  // IMPLOSION - Brushes implode toward center
  implodeBrushes(
    brushes: AnimatedBrush[],
    config: ImplosionConfig,
    progress: number, // 0-1
    onUpdate: (brush: AnimatedBrush, pos: Vector3) => void
  ): void {
    const { centerX, centerY, centerZ, speed } = config;
    const easedProgress = Math.pow(progress, 2); // ease in

    brushes.forEach((brush, index) => {
      const dx = centerX - brush.targetPosition.x;
      const dy = centerY - brush.targetPosition.y;
      const dz = centerZ - brush.targetPosition.z;

      onUpdate(brush, {
        x: brush.targetPosition.x + dx * easedProgress * speed,
        y: brush.targetPosition.y + dy * easedProgress * speed,
        z: brush.targetPosition.z + dz * easedProgress * speed,
      });
    });
  }

  // COLOR_FLASH - Screen flash effect (non-blocking, GSAP-driven)
  flashColor(config: ColorFlashConfig): void {
    if (!this.flashOverlay) return;

    const { color, duration, intensity } = config;
    const material = this.flashOverlay.material as THREE.MeshBasicMaterial;

    // Kill any existing animations on this overlay
    this.activeAnimations.forEach(tween => tween.kill());
    this.activeAnimations = [];

    // Parse color string to THREE.Color
    material.color.set(color);
    material.opacity = intensity;

    // Animate opacity to 0 using GSAP
    const tween = gsap.to(material, {
      opacity: 0,
      duration: duration,
      ease: 'power2.out',
    });
    this.activeAnimations.push(tween);
  }

  // Update method for COLOR_FLASH to be called from GSAP timeline
  updateFlashColor(progress: number, config: ColorFlashConfig): void {
    if (!this.flashOverlay) return;

    const { color, intensity } = config;
    const material = this.flashOverlay.material as THREE.MeshBasicMaterial;
    material.color.set(color);
    material.opacity = intensity * (1 - progress);
  }

  // STROBE - Rapid flashing effect (non-blocking, GSAP-driven)
  strobe(config: StrobeConfig): void {
    if (!this.flashOverlay) return;

    const { color, frequency, duration } = config;
    const material = this.flashOverlay.material as THREE.MeshBasicMaterial;

    // Kill any existing animations
    this.activeAnimations.forEach(tween => tween.kill());
    this.activeAnimations = [];

    material.color.set(color);
    material.opacity = 0.8;
  }

  // Update method for STROBE to be called from GSAP timeline
  // Uses a simple on/off based on progress within each cycle
  updateStrobe(progress: number, config: StrobeConfig): void {
    if (!this.flashOverlay) return;

    const { color, frequency } = config;
    const material = this.flashOverlay.material as THREE.MeshBasicMaterial;
    material.color.set(color);

    // Calculate whether we're in an "on" or "off" phase
    // Each flash cycle has 2 phases (on + off)
    const cycleDuration = 1 / frequency;
    const halfCycle = cycleDuration / 2;
    const timeInCycle = (progress % cycleDuration);

    // Turn on in first half of cycle, off in second half
    material.opacity = timeInCycle < halfCycle ? 0.8 : 0;
  }

  // RACK_FOCUS - Smooth focus pull effect (handled by PostProcessing)
  rackFocus(
    startDistance: number,
    endDistance: number,
    duration: number,
    onUpdate: (distance: number) => void
  ): void {
    const rackProxy = { progress: 0 };

    const tween = gsap.to(rackProxy, {
      progress: 1,
      duration: duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        // Ease in-out
        const p = rackProxy.progress;
        const eased = p < 0.5
          ? 2 * p * p
          : 1 - Math.pow(-2 * p + 2, 2) / 2;

        const currentDistance = startDistance + (endDistance - startDistance) * eased;
        onUpdate(currentDistance);
      },
    });
    this.activeAnimations.push(tween);
  }

  dispose(): void {
    this.activeAnimations.forEach(tween => tween.kill());
    this.activeAnimations = [];
    if (this.flashOverlay) {
      this.flashOverlay.geometry.dispose();
      (this.flashOverlay.material as THREE.Material).dispose();
    }
  }
}