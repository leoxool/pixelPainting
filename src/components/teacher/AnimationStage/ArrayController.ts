// ArrayController - Array-level effects for brush formations
import { Vector3, AnimatedBrush } from './types';

export interface WaveConfig {
  direction: 'x' | 'y' | 'diagonal';
  amplitude: number;
  frequency: number;
  speed: number;
}

export interface OscillateConfig {
  centerX: number;
  centerY: number;
  amplitudeX: number;
  amplitudeY: number;
  frequency: number;
  phase: number;
}

export interface PulseConfig {
  centerX: number;
  centerY: number;
  minScale: number;
  maxScale: number;
  speed: number;
}

export interface ArrayRotateConfig {
  centerX: number;
  centerY: number;
  speed: number; // degrees per second
  direction?: 'cw' | 'ccw';
}

export interface ArrayScaleConfig {
  centerX: number;
  centerY: number;
  minScale: number;
  maxScale: number;
  speed: number;
}

export class ArrayController {
  // WAVE - Sinusoidal wave undulation across array
  applyWaveUndulation(
    brushes: AnimatedBrush[],
    config: WaveConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, scale: number) => void
  ): void {
    const time = elapsedTime;
    const { direction, amplitude, frequency, speed } = config;

    brushes.forEach((brush, index) => {
      const wavePhase = (index / brushes.length) * Math.PI * 2 * frequency;
      const waveOffset = Math.sin(wavePhase + time * speed * Math.PI * 2) * amplitude;

      let x = brush.targetPosition.x;
      let y = brush.targetPosition.y;
      let z = brush.targetPosition.z;

      if (direction === 'x') {
        x += waveOffset;
      } else if (direction === 'y') {
        y += waveOffset;
      } else {
        // diagonal
        x += waveOffset * 0.7;
        y += waveOffset * 0.7;
      }

      onUpdate(brush, { x, y, z }, 1);
    });
  }

  // OSCILLATE - Brushes oscillate around center points
  oscillateBrushes(
    brushes: AnimatedBrush[],
    config: OscillateConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, scale: number) => void
  ): void {
    const time = elapsedTime;
    const { centerX, centerY, amplitudeX, amplitudeY, frequency, phase } = config;

    brushes.forEach((brush, index) => {
      const offsetX = Math.cos(time * frequency * Math.PI * 2 + phase + index * 0.1) * amplitudeX;
      const offsetY = Math.sin(time * frequency * Math.PI * 2 + phase + index * 0.1) * amplitudeY;

      onUpdate(brush, {
        x: centerX + offsetX,
        y: centerY + offsetY,
        z: brush.targetPosition.z + Math.sin(time * 3 + index * 0.2) * 10,
      }, 1);
    });
  }

  // PULSE - Rhythmic pulsing of brush scale
  pulseBrushes(
    brushes: AnimatedBrush[],
    config: PulseConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, scale: number) => void
  ): void {
    const time = elapsedTime;
    const { centerX, centerY, minScale, maxScale, speed } = config;

    brushes.forEach((brush, index) => {
      const pulsePhase = (index / brushes.length) * Math.PI; // Stagger by position
      const scaleValue = minScale + (maxScale - minScale) * Math.abs(Math.sin(time * speed * Math.PI * 2 + pulsePhase));

      const offset = (scaleValue - 1) * 20;
      const angle = (index / brushes.length) * Math.PI * 2;

      onUpdate(brush, {
        x: brush.targetPosition.x + Math.cos(angle) * offset,
        y: brush.targetPosition.y + Math.sin(angle) * offset,
        z: brush.targetPosition.z,
      }, scaleValue);
    });
  }

  // ARRAY_ROTATE - Rotate entire array around center
  rotateArray(
    brushes: AnimatedBrush[],
    config: ArrayRotateConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, scale: number) => void
  ): void {
    const time = elapsedTime;
    const { centerX, centerY, speed, direction = 'cw' } = config;
    const angleDirection = direction === 'cw' ? 1 : -1;
    const angle = time * speed * Math.PI / 180 * angleDirection;

    brushes.forEach((brush) => {
      const dx = brush.targetPosition.x - centerX;
      const dy = brush.targetPosition.y - centerY;

      const rotatedX = centerX + dx * Math.cos(angle) - dy * Math.sin(angle);
      const rotatedY = centerY + dx * Math.sin(angle) + dy * Math.cos(angle);

      onUpdate(brush, {
        x: rotatedX,
        y: rotatedY,
        z: brush.targetPosition.z,
      }, 1);
    });
  }

  // ARRAY_SCALE - Scale array from center
  scaleArray(
    brushes: AnimatedBrush[],
    config: ArrayScaleConfig,
    elapsedTime: number,
    onUpdate: (brush: AnimatedBrush, pos: Vector3, scale: number) => void
  ): void {
    const time = elapsedTime;
    const { centerX, centerY, minScale, maxScale, speed } = config;

    const scaleProgress = minScale + (maxScale - minScale) * Math.abs(Math.sin(time * speed * Math.PI));
    const currentScale = scaleProgress;

    brushes.forEach((brush) => {
      const dx = brush.targetPosition.x - centerX;
      const dy = brush.targetPosition.y - centerY;

      onUpdate(brush, {
        x: centerX + dx * currentScale,
        y: centerY + dy * currentScale,
        z: brush.targetPosition.z,
      }, 1);
    });
  }

  dispose(): void {
    // Cleanup if needed
  }
}