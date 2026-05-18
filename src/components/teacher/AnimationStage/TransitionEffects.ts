// TransitionEffects - Cinematic transition effects
import * as THREE from 'three';
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
  private time: number = 0;
  private flashOverlay: THREE.Mesh | null = null;

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

  // COLOR_FLASH - Screen flash effect
  flashColor(config: ColorFlashConfig, onComplete?: () => void): void {
    if (!this.flashOverlay) return;

    const { color, duration, intensity } = config;
    const material = this.flashOverlay.material as THREE.MeshBasicMaterial;

    // Parse color string to THREE.Color
    material.color.set(color);
    material.opacity = intensity;

    // Animate opacity to 0
    const startTime = performance.now();
    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const remaining = 1 - elapsed / duration;

      if (remaining > 0) {
        material.opacity = intensity * remaining;
        requestAnimationFrame(animate);
      } else {
        material.opacity = 0;
        onComplete?.();
      }
    };
    animate();
  }

  // STROBE - Rapid flashing effect
  strobe(config: StrobeConfig, onComplete?: () => void): void {
    if (!this.flashOverlay) return;

    const { color, frequency, duration } = config;
    const material = this.flashOverlay.material as THREE.MeshBasicMaterial;
    material.color.set(color);

    const interval = 1000 / frequency / 2; // on/off per flash
    let remaining = duration * 1000;
    let isOn = false;

    const strobeInterval = setInterval(() => {
      isOn = !isOn;
      material.opacity = isOn ? 0.8 : 0;
      remaining -= interval * 2;

      if (remaining <= 0) {
        clearInterval(strobeInterval);
        material.opacity = 0;
        onComplete?.();
      }
    }, interval);
  }

  // RACK_FOCUS - Smooth focus pull effect (handled by PostProcessing)
  rackFocus(
    startDistance: number,
    endDistance: number,
    duration: number,
    onUpdate: (distance: number) => void
  ): void {
    const startTime = performance.now();

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;
      const progress = Math.min(1, elapsed / duration);

      // Ease in-out
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const currentDistance = startDistance + (endDistance - startDistance) * eased;
      onUpdate(currentDistance);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  dispose(): void {
    if (this.flashOverlay) {
      this.flashOverlay.geometry.dispose();
      (this.flashOverlay.material as THREE.Material).dispose();
    }
  }
}