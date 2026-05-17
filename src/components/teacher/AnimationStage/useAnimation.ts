'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import {
  AnimatedBrush,
  CameraKeyFrame,
  AnimationStageState,
  CameraAnimationState,
  Vector3,
  DEFAULT_ANIMATION_SETTINGS,
} from './types';

// Helper to interpolate between vectors
const lerpVector3 = (a: Vector3, b: Vector3, t: number): Vector3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

// Easing functions
const easeFunctions: Record<string, (t: number) => number> = {
  'linear': (t: number) => t,
  'ease-in-out': (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  'bounce': (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  'elastic': (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
  },
};

interface CameraControllerProps {
  camera: THREE.Camera;
  keyFrames: CameraKeyFrame[];
  onProgress?: (progress: number) => void;
  onComplete?: () => void;
}

export function useCameraController({ camera, keyFrames, onProgress, onComplete }: CameraControllerProps) {
  const animationRef = useRef<gsap.core.Timeline | null>(null);
  const stateRef = useRef<CameraAnimationState>({
    currentKeyFrame: null,
    nextKeyFrame: null,
    progress: 0,
    currentPosition: { x: 0, y: 0, z: 10 },
    currentLookAt: { x: 0, y: 0, z: 0 },
  });

  const play = useCallback((startTime: number = 0) => {
    if (keyFrames.length < 2) return;

    // Cancel any existing animation
    if (animationRef.current) {
      animationRef.current.kill();
    }

    const totalDuration = keyFrames[keyFrames.length - 1].time;

    // Create timeline for camera animation
    const tl = gsap.timeline({
      onUpdate: () => {
        const currentTime = tl.time();

        // Find current and next keyframe
        let currentKF: CameraKeyFrame | null = null;
        let nextKF: CameraKeyFrame | null = null;

        for (let i = 0; i < keyFrames.length; i++) {
          if (currentTime >= keyFrames[i].time) {
            currentKF = keyFrames[i];
            nextKF = keyFrames[i + 1] || null;
          }
        }

        if (currentKF && nextKF) {
          const segmentDuration = nextKF.time - currentKF.time;
          const segmentProgress = segmentDuration > 0 ? (currentTime - currentKF.time) / segmentDuration : 0;
          const easedProgress = easeFunctions[currentKF.transition || 'ease-in-out'](segmentProgress);

          // Interpolate position
          const newPosition = lerpVector3(currentKF.position, nextKF.position, easedProgress);
          const newLookAt = lerpVector3(currentKF.lookAt, nextKF.lookAt, easedProgress);

          // Update camera
          camera.position.set(newPosition.x, newPosition.y, newPosition.z);
          camera.lookAt(newLookAt.x, newLookAt.y, newLookAt.z);

          stateRef.current = {
            currentKeyFrame: currentKF,
            nextKeyFrame: nextKF,
            progress: easedProgress,
            currentPosition: newPosition,
            currentLookAt: newLookAt,
          };

          onProgress?.(totalDuration > 0 ? currentTime / totalDuration : 0);
        }
      },
      onComplete: () => {
        onComplete?.();
      },
    });

    // Add keyframe markers
    keyFrames.forEach((kf, index) => {
      tl.to({}, {
        duration: index === 0 ? kf.time : kf.time - keyFrames[index - 1].time,
      }, index === 0 ? 0 : keyFrames[index - 1].time);
    });

    // Seek to start time
    tl.seek(startTime);

    animationRef.current = tl;
  }, [camera, keyFrames, onProgress, onComplete]);

  const pause = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.resume();
    }
  }, []);

  const stop = useCallback(() => {
    if (animationRef.current) {
      animationRef.current.kill();
      animationRef.current = null;
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (animationRef.current) {
      animationRef.current.seek(time);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        animationRef.current.kill();
      }
    };
  }, []);

  return { play, pause, resume, stop, seek, state: stateRef.current };
}

interface BrushAnimatorProps {
  onUpdate?: (brushes: AnimatedBrush[]) => void;
}

export function useBrushAnimator({ onUpdate }: BrushAnimatorProps) {
  const animationRef = useRef<gsap.core.Tween[]>([]);
  const brushesRef = useRef<AnimatedBrush[]>([]);
  const progressRef = useRef<Map<string, number>>(new Map());

  const updateBrushes = useCallback((newBrushes: AnimatedBrush[]) => {
    brushesRef.current = newBrushes;
    onUpdate?.(newBrushes);
  }, [onUpdate]);

  const animateFlight = useCallback((
    brushes: AnimatedBrush[],
    duration: number = DEFAULT_ANIMATION_SETTINGS.brushFlightDuration,
    scatterRadius: number = DEFAULT_ANIMATION_SETTINGS.scatterRadius,
    onComplete?: () => void
  ) => {
    // Kill any existing animations
    animationRef.current.forEach(t => t.kill());
    animationRef.current = [];
    progressRef.current.clear();

    brushesRef.current = brushes;

    // Create a simple tween for each brush using a proxy object
    const proxyObjects = brushes.map((brush, index) => {
      const proxy = { t: 0 };
      progressRef.current.set(brush.id, 0);

      const tween = gsap.to(proxy, {
        t: 1,
        duration: duration,
        ease: 'power2.out',
        delay: index * 0.002,
        onUpdate: () => {
          const progress = proxy.t;
          progressRef.current.set(brush.id, progress);

          // Calculate interpolated position
          const newBrushes = brushesRef.current.map(b => {
            if (b.id !== brush.id) return b;

            // Start from scatter position, end at target
            const scatterPos: Vector3 = {
              x: b.targetPosition.x + (Math.random() - 0.5) * scatterRadius * 2,
              y: b.targetPosition.y + (Math.random() - 0.5) * scatterRadius * 2,
              z: b.targetPosition.z + (Math.random() - 0.5) * scatterRadius,
            };

            return {
              ...b,
              position: {
                x: scatterPos.x + (b.targetPosition.x - scatterPos.x) * progress,
                y: scatterPos.y + (b.targetPosition.y - scatterPos.y) * progress,
                z: scatterPos.z + (b.targetPosition.z - scatterPos.z) * progress,
              },
              progress,
            };
          });

          onUpdate?.(newBrushes);
        },
        onComplete: index === 0 ? onComplete : undefined,
      });

      animationRef.current.push(tween);
      return proxy;
    });
  }, [onUpdate]);

  const animateFormation = useCallback((
    brushes: AnimatedBrush[],
    _targetGridData: number[][],
    gridSizeX: number,
    gridSizeY: number,
    brushSize: number,
    duration: number = DEFAULT_ANIMATION_SETTINGS.brushFlightDuration,
    onUpdate?: (brushes: AnimatedBrush[]) => void,
    onComplete?: () => void
  ) => {
    // Kill any existing animations
    animationRef.current.forEach(t => t.kill());
    animationRef.current = [];
    progressRef.current.clear();

    brushesRef.current = brushes;

    // Create proxy objects for each brush
    const proxyObjects = brushes.map((brush, index) => {
      const proxy = { t: 0 };
      progressRef.current.set(brush.id, 0);

      const gridY = Math.floor(index / gridSizeX);
      const gridX = index % gridSizeX;
      const startPos: Vector3 = {
        x: brush.position.x,
        y: brush.position.y,
        z: brush.position.z,
      };
      const endPos: Vector3 = {
        x: gridX * brushSize + brushSize / 2,
        y: (gridSizeY - gridY - 1) * brushSize + brushSize / 2,
        z: 0,
      };

      const tween = gsap.to(proxy, {
        t: 1,
        duration: duration,
        ease: 'power3.out',
        delay: Math.random() * 0.5,
        onUpdate: () => {
          const t = proxy.t;
          progressRef.current.set(brush.id, t);

          const newBrushes = brushesRef.current.map((b, i) => {
            if (i !== index) return b;
            return {
              ...b,
              position: {
                x: startPos.x + (endPos.x - startPos.x) * t,
                y: startPos.y + (endPos.y - startPos.y) * t,
                z: startPos.z + (endPos.z - startPos.z) * t,
              },
              progress: t,
            };
          });

          onUpdate?.(newBrushes);
        },
        onComplete: index === 0 ? onComplete : undefined,
      });

      animationRef.current.push(tween);
      return proxy;
    });
  }, []);

  const scatter = useCallback((
    brushes: AnimatedBrush[],
    radius: number = DEFAULT_ANIMATION_SETTINGS.scatterRadius,
    duration: number = 1.0,
    onComplete?: () => void
  ) => {
    // Kill any existing animations
    animationRef.current.forEach(t => t.kill());
    animationRef.current = [];
    progressRef.current.clear();

    brushesRef.current = brushes;

    const proxyObjects = brushes.map((brush, index) => {
      const proxy = { t: 0 };
      progressRef.current.set(brush.id, 0);

      const startPos: Vector3 = { ...brush.position };
      const scatterPos: Vector3 = {
        x: brush.targetPosition.x + (Math.random() - 0.5) * radius * 2,
        y: brush.targetPosition.y + (Math.random() - 0.5) * radius * 2,
        z: brush.targetPosition.z + (Math.random() - 0.5) * radius,
      };

      const tween = gsap.to(proxy, {
        t: 1,
        duration: duration,
        ease: 'power2.out',
        delay: Math.random() * 0.3,
        onUpdate: () => {
          const t = proxy.t;
          progressRef.current.set(brush.id, t);

          const newBrushes = brushesRef.current.map((b, i) => {
            if (i !== index) return b;
            return {
              ...b,
              position: {
                x: startPos.x + (scatterPos.x - startPos.x) * t,
                y: startPos.y + (scatterPos.y - startPos.y) * t,
                z: startPos.z + (scatterPos.z - startPos.z) * t,
              },
              progress: t,
            };
          });

          onUpdate?.(newBrushes);
        },
        onComplete: index === 0 ? onComplete : undefined,
      });

      animationRef.current.push(tween);
      return proxy;
    });
  }, []);

  const pause = useCallback(() => {
    animationRef.current.forEach(t => t.pause());
  }, []);

  const resume = useCallback(() => {
    animationRef.current.forEach(t => t.resume());
  }, []);

  const stop = useCallback(() => {
    animationRef.current.forEach(t => t.kill());
    animationRef.current = [];
    progressRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      animationRef.current.forEach(t => t.kill());
    };
  }, []);

  return { animateFlight, animateFormation, scatter, pause, resume, stop, updateBrushes };
}

// Hook to manage animation state
export function useAnimationState(initialState?: Partial<AnimationStageState>) {
  const [state, setState] = useState<AnimationStageState>({
    status: 'idle',
    currentTime: 0,
    totalDuration: 0,
    currentClipIndex: 0,
    isPlaying: false,
    isLooping: false,
    playbackRate: DEFAULT_ANIMATION_SETTINGS.playbackRate,
    musicVolume: DEFAULT_ANIMATION_SETTINGS.musicVolume,
    musicEnabled: true,
    ...initialState,
  });

  const updateState = useCallback((updates: Partial<AnimationStageState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true, status: 'playing' }));
  }, []);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false, status: 'paused' }));
  }, []);

  const stop = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false, status: 'idle', currentTime: 0 }));
  }, []);

  const seek = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: Math.max(0, Math.min(time, prev.totalDuration)) }));
  }, []);

  return { state, updateState, play, pause, stop, seek };
}