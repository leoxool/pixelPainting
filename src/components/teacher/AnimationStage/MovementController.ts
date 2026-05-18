// Movement Controller - Single brush flight, formations, and path following
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Vector3, AnimatedBrush } from './types';

export type FormationType = 'grid' | 'circle' | 'line' | 'scatter' | 'custom';

export interface FormationConfig {
  type: FormationType;
  spacing: number;
  axis: 'x' | 'y' | 'z';
  center?: Vector3;
  radius?: number;  // For circle formation
  direction?: Vector3;  // For line formation
}

export interface PathPoint {
  position: Vector3;
  time?: number;  // Optional time marker
}

export interface MovementControllerOptions {
  dummy: THREE.Object3D;  // Shared dummy object for matrix updates
  brushSize: { x: number; y: number };
}

export class MovementController {
  private dummy: THREE.Object3D;
  private brushSize: { x: number; y: number };
  private animationRefs: gsap.core.Tween[] = [];
  private brushPositions: Map<string, Vector3> = new Map();  // Track current positions

  constructor(options: MovementControllerOptions) {
    this.dummy = options.dummy;
    this.brushSize = options.brushSize;
  }

  // Calculate formation positions for all brushes
  calculateFormation(
    brushCount: number,
    config: FormationConfig,
    gridSizeX: number,
    gridSizeY: number
  ): Vector3[] {
    const positions: Vector3[] = [];
    const center = config.center || { x: 0, y: 0, z: 0 };
    const spacing = config.spacing;

    switch (config.type) {
      case 'grid': {
        // Maintain original grid layout
        const cols = Math.ceil(Math.sqrt(brushCount));
        const rows = Math.ceil(brushCount / cols);
        const startX = center.x - (cols * spacing) / 2;
        const startY = center.y - (rows * spacing) / 2;

        for (let i = 0; i < brushCount; i++) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          positions.push({
            x: startX + col * spacing,
            y: startY + row * spacing,
            z: center.z,
          });
        }
        break;
      }

      case 'circle': {
        const radius = config.radius || 100;
        const angleStep = (2 * Math.PI) / brushCount;
        for (let i = 0; i < brushCount; i++) {
          const angle = i * angleStep;
          positions.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
            z: center.z,
          });
        }
        break;
      }

      case 'line': {
        const direction = config.direction || { x: 1, y: 0, z: 0 };
        const startX = center.x - (brushCount * spacing) / 2;
        for (let i = 0; i < brushCount; i++) {
          positions.push({
            x: center.x + direction.x * i * spacing,
            y: center.y + direction.y * i * spacing,
            z: center.z + direction.z * i * spacing,
          });
        }
        break;
      }

      case 'scatter': {
        // Random scatter within bounds
        const bounds = config.radius || 200;
        for (let i = 0; i < brushCount; i++) {
          positions.push({
            x: center.x + (Math.random() - 0.5) * bounds * 2,
            y: center.y + (Math.random() - 0.5) * bounds * 2,
            z: center.z + (Math.random() - 0.5) * bounds * 0.5,
          });
        }
        break;
      }

      case 'custom':
      default:
        // Return current positions (no change)
        for (let i = 0; i < brushCount; i++) {
          positions.push({ x: 0, y: 0, z: 0 });
        }
        break;
    }

    return positions;
  }

  // Animate single brush to target position (adds to external timeline if provided)
  animateBrushToPosition(
    brush: AnimatedBrush,
    targetPosition: Vector3,
    duration: number = 2,
    delay: number = 0,
    easing: string = 'power3.out',
    timeline?: gsap.core.Timeline,
    timelinePosition: number = 0,
    onUpdate?: (position: Vector3) => void,
    onComplete?: () => void
  ): gsap.core.Tween | null {
    const proxy = { x: brush.position.x, y: brush.position.y, z: brush.position.z };

    const tween = gsap.to(proxy, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration,
      delay,
      ease: easing,
      onUpdate: () => {
        const pos = { x: proxy.x, y: proxy.y, z: proxy.z };
        this.brushPositions.set(brush.id, pos);
        onUpdate?.(pos);
      },
      onComplete: () => {
        onComplete?.();
      },
    });

    this.animationRefs.push(tween);

    // If external timeline provided, add this tween to it at the specified position
    if (timeline) {
      timeline.add(tween, timelinePosition);
      // Remove from our internal refs since timeline owns it now
      const idx = this.animationRefs.indexOf(tween);
      if (idx > -1) this.animationRefs.splice(idx, 1);
    }

    return tween;
  }

  // Animate all brushes to formation (staggered) - optionally add to external timeline
  animateToFormation(
    brushes: AnimatedBrush[],
    targetPositions: Vector3[],
    duration: number = 3,
    staggerDelay: number = 0.0002,
    easing: string = 'power3.out',
    initialPositions?: Vector3[], // Optional starting positions
    timeline?: gsap.core.Timeline, // Optional external timeline
    timelinePosition: number = 0, // Position on external timeline
    onUpdate?: (brush: AnimatedBrush, position: Vector3) => void,
    onComplete?: () => void
  ) {
    // Kill existing animations (unless they're managed by external timeline)
    if (!timeline) {
      this.stopAll();
    }

    const totalBrushes = Math.min(brushes.length, targetPositions.length);
    console.log('[MovementController] animateToFormation called:', totalBrushes, 'brushes, duration:', duration, 'timeline:', timeline ? 'yes' : 'no');

    // Create child timeline for this animation
    const childTl = gsap.timeline({
      onComplete: () => {
        console.log('[MovementController] Formation animation complete');
        onComplete?.();
      }
    });

    brushes.forEach((brush, index) => {
      if (index >= targetPositions.length) return;

      const targetPos = targetPositions[index];
      const startPos = initialPositions?.[index] || brush.position;
      const proxy = { x: startPos.x, y: startPos.y, z: startPos.z };

      // Each brush gets its own tween with stagger
      const tween = gsap.to(proxy, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration,
        delay: index * staggerDelay,
        ease: easing,
        onUpdate: () => {
          const pos = { x: proxy.x, y: proxy.y, z: proxy.z };
          this.brushPositions.set(brush.id, pos);
          onUpdate?.(brush, pos);
        },
      });

      childTl.add(tween, 0);
      this.animationRefs.push(tween);
    });

    // If no brushes, call onComplete immediately
    if (totalBrushes === 0) {
      console.log('[MovementController] No brushes, calling onComplete immediately');
      onComplete?.();
    }

    // Add to external timeline if provided
    if (timeline) {
      timeline.add(childTl, timelinePosition);
      // Clear our refs since timeline owns them
      this.animationRefs = [];
    }
  }

  // Scatter brushes from their current positions - optionally add to external timeline
  scatterBrushes(
    brushes: AnimatedBrush[],
    radius: number = 500,
    duration: number = 1.5,
    staggerDelay: number = 0.0001,
    easing: string = 'power2.out',
    timeline?: gsap.core.Timeline,
    timelinePosition: number = 0,
    onUpdate?: (brush: AnimatedBrush, position: Vector3) => void,
    onComplete?: () => void
  ) {
    if (!timeline) {
      this.stopAll();
    }

    // Create child timeline
    const childTl = gsap.timeline({
      onComplete: () => {
        onComplete?.();
      }
    });

    brushes.forEach((brush, index) => {
      const startPos = { ...brush.position };
      const scatterPos = {
        x: startPos.x + (Math.random() - 0.5) * radius * 2,
        y: startPos.y + (Math.random() - 0.5) * radius * 2,
        z: startPos.z + (Math.random() - 0.5) * radius * 0.5,
      };

      const proxy = { x: startPos.x, y: startPos.y, z: startPos.z };

      const tween = gsap.to(proxy, {
        x: scatterPos.x,
        y: scatterPos.y,
        z: scatterPos.z,
        duration,
        delay: index * staggerDelay,
        ease: easing,
        onUpdate: () => {
          const pos = { x: proxy.x, y: proxy.y, z: proxy.z };
          this.brushPositions.set(brush.id, pos);
          onUpdate?.(brush, pos);
        },
      });

      childTl.add(tween, 0);
      this.animationRefs.push(tween);
    });

    if (timeline) {
      timeline.add(childTl, timelinePosition);
      this.animationRefs = [];
    }
  }

  // Fly brushes in from off-screen (classic brush flight animation)
  // Optionally add to external timeline
  flyInBrushes(
    brushes: AnimatedBrush[],
    direction: 'left' | 'right' | 'top' | 'bottom' | 'random' = 'left',
    duration: number = 2,
    staggerDelay: number = 0.0002,
    spreadAmount: number = 0.5,  // How much vertical spread (0-1)
    easing: string = 'power2.out',
    screenWidth: number = 800,
    screenHeight: number = 600,
    timeline?: gsap.core.Timeline,
    timelinePosition: number = 0,
    onUpdate?: (brush: AnimatedBrush, position: Vector3) => void,
    onComplete?: () => void
  ) {
    if (!timeline) {
      this.stopAll();
    }

    console.log('[MovementController] flyInBrushes called, timeline:', timeline ? 'yes' : 'no', 'position:', timelinePosition);

    // Create child timeline for this animation
    const childTl = gsap.timeline({
      onComplete: () => {
        console.log('[MovementController] flyInBrushes complete');
        onComplete?.();
      }
    });

    brushes.forEach((brush, index) => {
      // Calculate start position based on direction
      const targetPos = brush.targetPosition;
      let startX: number, startY: number, startZ: number;

      switch (direction) {
        case 'left':
          startX = -this.brushSize.x;
          startY = targetPos.y + (Math.random() - 0.5) * screenHeight * spreadAmount;
          startZ = targetPos.z + (Math.random() - 0.5) * 50;
          break;
        case 'right':
          startX = screenWidth + this.brushSize.x;
          startY = targetPos.y + (Math.random() - 0.5) * screenHeight * spreadAmount;
          startZ = targetPos.z + (Math.random() - 0.5) * 50;
          break;
        case 'top':
          startX = targetPos.x + (Math.random() - 0.5) * screenWidth * spreadAmount;
          startY = -this.brushSize.y;
          startZ = targetPos.z + (Math.random() - 0.5) * 50;
          break;
        case 'bottom':
          startX = targetPos.x + (Math.random() - 0.5) * screenWidth * spreadAmount;
          startY = screenHeight + this.brushSize.y;
          startZ = targetPos.z + (Math.random() - 0.5) * 50;
          break;
        case 'random':
          // Scatter randomly around the screen
          startX = Math.random() * screenWidth;
          startY = Math.random() * screenHeight;
          startZ = (Math.random() - 0.5) * 200;
          break;
      }

      const proxy = { x: startX, y: startY, z: startZ };

      const tween = gsap.to(proxy, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration,
        delay: index * staggerDelay,
        ease: easing,
        onUpdate: () => {
          const pos = { x: proxy.x, y: proxy.y, z: proxy.z };
          this.brushPositions.set(brush.id, pos);
          onUpdate?.(brush, pos);
        },
      });

      childTl.add(tween, 0);
      this.animationRefs.push(tween);
    });

    if (timeline) {
      timeline.add(childTl, timelinePosition);
      this.animationRefs = [];
    }
  }

  // Get current tracked position for a brush
  getBrushPosition(brushId: string): Vector3 | undefined {
    return this.brushPositions.get(brushId);
  }

  // Update tracked position (called externally when brush moves)
  updateBrushPosition(brushId: string, position: Vector3) {
    this.brushPositions.set(brushId, position);
  }

  // Get all tracked positions (for camera follow)
  getAllPositions(): Map<string, Vector3> {
    return new Map(this.brushPositions);
  }

  // Pause all animations
  pauseAll() {
    this.animationRefs.forEach(tween => tween.pause());
  }

  // Resume all animations
  resumeAll() {
    this.animationRefs.forEach(tween => tween.resume());
  }

  // Stop all animations
  stopAll() {
    this.animationRefs.forEach(tween => tween.kill());
    this.animationRefs = [];
  }

  // Dispose
  dispose() {
    this.stopAll();
    this.brushPositions.clear();
  }
}
