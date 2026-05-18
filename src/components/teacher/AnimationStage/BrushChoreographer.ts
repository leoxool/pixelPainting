// BrushChoreographer - Advanced brush animation forms
import * as THREE from 'three';
import { Vector3, AnimatedBrush } from './types';

export interface SwirlConfig {
  centerX: number;
  centerY: number;
  radius: number;
  speed: number; // rotations per second
  direction?: 'cw' | 'ccw';
  waveAmplitude?: number;
  waveFrequency?: number;
}

export interface AerialDanceConfig {
  height: number;
  frequency: number;
  phase: number;
  amplitude: number;
}

export interface OrbitAxisConfig {
  axis: 'x' | 'y' | 'z';
  radius: number;
  speed: number;
  heightAmplitude?: number;
}

export interface BezierFlightConfig {
  controlPoints: Vector3[];
  duration: number;
  easing?: string;
}

export class BrushChoreographer {
  private scene: THREE.Scene;
  private time: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // SWIRL - Spiral brush animation around center
  swirlBrushes(
    brushes: AnimatedBrush[],
    config: SwirlConfig,
    deltaTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3) => void
  ): void {
    this.time += deltaTime;
    const { centerX, centerY, radius, speed, direction = 'cw', waveAmplitude = 20, waveFrequency = 2 } = config;
    const angleDirection = direction === 'cw' ? 1 : -1;

    brushes.forEach((brush, index) => {
      const baseAngle = (index / brushes.length) * Math.PI * 2 * angleDirection;
      const rotationAngle = baseAngle + this.time * speed * Math.PI * 2 * angleDirection;

      // Add wave effect
      const waveOffset = Math.sin(this.time * waveFrequency * Math.PI * 2 + index * 0.1) * waveAmplitude;

      const x = centerX + Math.cos(rotationAngle) * (radius + waveOffset);
      const y = centerY + Math.sin(rotationAngle) * (radius + waveOffset);
      const z = Math.sin(this.time * 3 + index * 0.2) * 30; // Vertical oscillation

      onUpdate(brush, { x, y, z });
    });
  }

  // AERIAL_DANCE - Brushes floating upward in wave patterns
  aerialDance(
    brushes: AnimatedBrush[],
    config: AerialDanceConfig,
    deltaTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3) => void
  ): void {
    this.time += deltaTime;
    const { height, frequency, phase, amplitude } = config;

    brushes.forEach((brush, index) => {
      const t = (index / brushes.length) + this.time * frequency;
      const waveY = Math.sin(t * Math.PI * 2 + phase) * amplitude;
      const waveX = Math.cos(t * Math.PI * 2 + phase) * amplitude * 0.5;

      const x = brush.targetPosition.x + waveX;
      const y = brush.targetPosition.y + height * Math.abs(Math.sin(this.time * Math.PI + index * 0.1)) + waveY;
      const z = Math.sin(this.time * 2 + index * 0.15) * 40;

      onUpdate(brush, { x, y, z });
    });
  }

  // ORBIT_AROUND_AXIS - Brushes orbit around an axis
  orbitAroundAxis(
    brushes: AnimatedBrush[],
    config: OrbitAxisConfig,
    deltaTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3) => void
  ): void {
    this.time += deltaTime;
    const { axis, radius, speed, heightAmplitude = 50 } = config;

    brushes.forEach((brush, index) => {
      const angle = (index / brushes.length) * Math.PI * 2 + this.time * speed * Math.PI * 2;
      const heightOffset = Math.sin(this.time * 2 + index * 0.1) * heightAmplitude;

      let x: number, y: number, z: number;

      if (axis === 'x') {
        x = brush.targetPosition.x;
        y = brush.targetPosition.y + Math.cos(angle) * radius;
        z = brush.targetPosition.z + Math.sin(angle) * radius + heightOffset;
      } else if (axis === 'y') {
        x = brush.targetPosition.x + Math.cos(angle) * radius;
        y = brush.targetPosition.y + heightOffset;
        z = brush.targetPosition.z + Math.sin(angle) * radius;
      } else {
        x = brush.targetPosition.x + Math.cos(angle) * radius;
        y = brush.targetPosition.y + Math.sin(angle) * radius + heightOffset;
        z = brush.targetPosition.z;
      }

      onUpdate(brush, { x, y, z });
    });
  }

  // FLY_ALONG_BEZIER - Brushes follow bezier curve paths
  flyAlongBezier(
    brushes: AnimatedBrush[],
    config: BezierFlightConfig,
    progress: number, // 0-1
    onUpdate: (brush: AnimatedBrush, pos: Vector3) => void
  ): void {
    const { controlPoints } = config;
    if (controlPoints.length < 2) return;

    // Catmull-Rom spline interpolation
    const getPointOnCurve = (t: number): Vector3 => {
      const n = controlPoints.length - 1;
      const segment = Math.min(Math.floor(t * n), n - 1);
      const localT = t * n - segment;

      const p0 = controlPoints[Math.max(0, segment - 1)];
      const p1 = controlPoints[segment];
      const p2 = controlPoints[Math.min(n, segment + 1)];
      const p3 = controlPoints[Math.min(n, segment + 2)];

      // Catmull-Rom interpolation
      const t2 = localT * localT;
      const t3 = t2 * localT;

      return {
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * localT + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * localT + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * localT + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      };
    };

    brushes.forEach((brush, index) => {
      // Each brush starts at different phase along path
      const brushProgress = Math.max(0, Math.min(1, progress + (index / brushes.length) * 0.3));
      const offset = Math.sin(index * 0.5) * 20; // Slight perpendicular offset

      const basePoint = getPointOnCurve(brushProgress);
      const tangent = getPointOnCurve(Math.min(1, brushProgress + 0.01));
      const dx = tangent.x - basePoint.x;
      const dy = tangent.y - basePoint.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / len * offset;
      const perpY = dx / len * offset;

      onUpdate(brush, {
        x: basePoint.x + perpX,
        y: basePoint.y + perpY,
        z: basePoint.z,
      });
    });
  }

  dispose(): void {
    // Cleanup if needed
  }
}