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

export interface RotateBrushConfig {
  axis: 'x' | 'y' | 'z';
  anglePerSecond: number; // rotation speed in degrees per second
  phase?: number; // initial phase offset for each brush
}

export interface RandomRoamConfig {
  speed: number; // movement speed
  amplitude: number; // base amplitude for all axes
  rotationSpeed?: number; // rotation speed multiplier (default 1.0)
  rangeX?: number; // X axis range multiplier (default 1.0)
  rangeY?: number; // Y axis range multiplier (default 0.7)
  rangeZ?: number; // Z axis range multiplier (default 0.3)
  swimSpeed?: number; // swimming oscillation speed multiplier (default 1.0)
}

export class BrushChoreographer {
  private scene: THREE.Scene;
  private stopped: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // SWIRL - Spiral brush animation around center
  swirlBrushes(
    brushes: AnimatedBrush[],
    config: SwirlConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, rot?: Vector3) => void
  ): void {
    const time = elapsedTime;
    const { centerX, centerY, radius, speed, direction = 'cw', waveAmplitude = 20, waveFrequency = 2 } = config;
    const angleDirection = direction === 'cw' ? 1 : -1;

    brushes.forEach((brush, index) => {
      const baseAngle = (index / brushes.length) * Math.PI * 2 * angleDirection;
      const rotationAngle = baseAngle + time * speed * Math.PI * 2 * angleDirection;

      // Add wave effect
      const waveOffset = Math.sin(time * waveFrequency * Math.PI * 2 + index * 0.1) * waveAmplitude;

      const x = centerX + Math.cos(rotationAngle) * (radius + waveOffset);
      const y = centerY + Math.sin(rotationAngle) * (radius + waveOffset);
      const z = Math.sin(time * 3 + index * 0.2) * 30; // Vertical oscillation

      onUpdate(brush, { x, y, z });
    });
  }

  // AERIAL_DANCE - Brushes floating upward in wave patterns
  aerialDance(
    brushes: AnimatedBrush[],
    config: AerialDanceConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, rot?: Vector3) => void
  ): void {
    const time = elapsedTime;
    const { height, frequency, phase, amplitude } = config;

    brushes.forEach((brush, index) => {
      const t = (index / brushes.length) + time * frequency;
      const waveY = Math.sin(t * Math.PI * 2 + phase) * amplitude;
      const waveX = Math.cos(t * Math.PI * 2 + phase) * amplitude * 0.5;

      const x = brush.targetPosition.x + waveX;
      const y = brush.targetPosition.y + height * Math.abs(Math.sin(time * Math.PI + index * 0.1)) + waveY;
      const z = Math.sin(time * 2 + index * 0.15) * 40;

      onUpdate(brush, { x, y, z });
    });
  }

  // ORBIT_AROUND_AXIS - Brushes orbit around an axis
  orbitAroundAxis(
    brushes: AnimatedBrush[],
    config: OrbitAxisConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, rot?: Vector3) => void
  ): void {
    const time = elapsedTime;
    const { axis, radius, speed, heightAmplitude = 50 } = config;

    brushes.forEach((brush, index) => {
      const angle = (index / brushes.length) * Math.PI * 2 + time * speed * Math.PI * 2;
      const heightOffset = Math.sin(time * 2 + index * 0.1) * heightAmplitude;

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
    onUpdate: (brush: AnimatedBrush, pos: Vector3, rot?: Vector3) => void
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

  // ROTATE_BRUSH - Individual brush rotation around specified axis
  rotateBrush(
    brush: AnimatedBrush,
    config: RotateBrushConfig,
    elapsedTime: number
  ): { position: Vector3; rotation: Vector3 } {
    const { axis, anglePerSecond, phase = 0 } = config;
    const angleDeg = elapsedTime * anglePerSecond + phase + (brush.gridIndex * 15); // stagger by gridIndex

    const rotation: Vector3 = { x: 0, y: 0, z: 0 };
    rotation[axis] = angleDeg * Math.PI / 180; // convert to radians

    return {
      position: brush.targetPosition,
      rotation,
    };
  }

  // RANDOM_ROAM - All brushes wander randomly (each has its own direction)
  // Each brush has completely independent motion parameters for natural random walk
  randomRoamBrushes(
    brushes: AnimatedBrush[],
    config: RandomRoamConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, rot?: Vector3) => void
  ): void {
    // If stopped, do nothing (allows freeze effect)
    if (this.stopped) return;

    const { speed, amplitude } = config;

    brushes.forEach((brush, index) => {
      // Use both index and id for unique per-brush randomness
      const idHash = brush.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const seed = (index * 1000 + idHash) / 10000;

      // Simple prng for stable per-brush random values
      const nextRandom = (n: number) => {
        const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };

      // Generate unique parameters for this brush
      const r1 = nextRandom(index * 7.1);
      const r2 = nextRandom(index * 13.7);
      const r3 = nextRandom(index * 23.3);
      const r4 = nextRandom(index * 37.1);
      const r5 = nextRandom(index * 53.7);
      const r6 = nextRandom(index * 79.3);
      const r7 = nextRandom(index * 97.3);
      const r8 = nextRandom(index * 127.1);

      // Independent frequencies for each axis
      const freqX = 0.3 + r1 * 1.4;
      const freqY = 0.3 + r2 * 1.4;
      const freqZ = 0.3 + r3 * 1.4;

      // Independent speed per axis
      const spdX = speed * (0.2 + r4 * 1.6);
      const spdY = speed * (0.2 + r5 * 1.6);
      const spdZ = speed * (0.2 + r6 * 1.6);

      // Unique phases for each axis
      const phaseX = r1 * Math.PI * 2;
      const phaseY = r2 * Math.PI * 2;
      const phaseZ = r3 * Math.PI * 2;
      const phaseRotX = r7 * Math.PI * 2;
      const phaseRotY = r8 * Math.PI * 2;
      const phaseRotZ = (r1 + r2) * Math.PI * 2;

      const rangeX = config.rangeX ?? 1.0;
      const rangeY = config.rangeY ?? 0.7;
      const rangeZ = config.rangeZ ?? 0.3;

      // Each brush moves independently on each axis
      const offsetX = Math.cos(elapsedTime * spdX * freqX + phaseX) * amplitude * rangeX;
      const offsetY = Math.sin(elapsedTime * spdY * freqY + phaseY) * amplitude * rangeY;
      const offsetZ = Math.sin(elapsedTime * spdZ * freqZ + phaseZ) * amplitude * rangeZ;

      const x = brush.targetPosition.x + offsetX;
      const y = brush.targetPosition.y + offsetY;
      const z = brush.targetPosition.z + offsetZ;

      // Velocity for heading
      const velX = -Math.sin(elapsedTime * spdX * freqX + phaseX) * spdX * freqX * amplitude * rangeX;
      const velY = Math.cos(elapsedTime * spdY * freqY + phaseY) * spdY * freqY * amplitude * rangeY;
      const velZ = Math.cos(elapsedTime * spdZ * freqZ + phaseZ) * spdZ * freqZ * amplitude * rangeZ;

      const speedMagnitude = Math.sqrt(velX * velX + velY * velY + velZ * velZ);
      const nvelX = speedMagnitude > 0.001 ? velX / speedMagnitude : 0;
      const nvelY = speedMagnitude > 0.001 ? velY / speedMagnitude : 0;
      const nvelZ = speedMagnitude > 0.001 ? velZ / speedMagnitude : 0;

      // Heading from velocity direction
      const yawAngle = Math.atan2(nvelX, nvelY);
      const lenXY = Math.sqrt(nvelX * nvelX + nvelY * nvelY);
      const pitchAngle = Math.atan2(-nvelZ, lenXY);

      // Swimming oscillation - unique rhythm per brush
      const swimSpeed = config.swimSpeed ?? 1.0;
      const swimPhase = elapsedTime * 2 * swimSpeed + phaseX;
      const pitchPhase = elapsedTime * 1.5 * swimSpeed + phaseRotX;

      const swimOscillation = Math.sin(swimPhase) * 0.2;
      const pitchOscillation = Math.sin(pitchPhase) * 0.1;
      const rollOscillation = Math.cos(swimPhase * 0.6 + phaseRotY) * 0.05;

      const rotX = pitchAngle + pitchOscillation;
      const rotY = Math.sin(elapsedTime * 0.3 + phaseRotY) * 0.1;
      const rotZ = yawAngle + swimOscillation + rollOscillation;

      onUpdate(brush, { x, y, z }, { x: rotX, y: rotY, z: rotZ });
    });
  }

  // Stop all brush animations - sets flag that roaming callbacks check
  stopAll(): void {
    this.stopped = true;
  }

  // Resume all brush animations - clears stop flag
  resumeAll(): void {
    this.stopped = false;
  }

  dispose(): void {
    // Cleanup if needed
  }
}