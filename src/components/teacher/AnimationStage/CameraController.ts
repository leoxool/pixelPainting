// Camera Controller - Perspective camera with path following and FOV animation
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Vector3, CameraKeyFrame, AnimatedBrush } from './types';

export type CameraMode = 'fixed' | 'follow' | 'orbit';

export interface CameraFollowTarget {
  brushId: string;
  offset: Vector3;  // Relative offset from target
  lookAhead: number;  // Look ahead distance
}

export interface CameraOrbitConfig {
  center: Vector3;  // Center to orbit around
  radius: number;   // Distance from center
  speed: number;    // Rotation speed (radians per second)
  height?: number;  // Height above center (default: 0)
}

export interface CameraControllerOptions {
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  mode?: CameraMode;
  followTarget?: CameraFollowTarget;
  keyFrames?: CameraKeyFrame[];
  orbitConfig?: CameraOrbitConfig;
}

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

export class CameraController {
  private camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private mode: CameraMode;
  private followTarget: CameraFollowTarget | null = null;
  private keyFrames: CameraKeyFrame[] = [];
  private animationRef: gsap.core.Timeline | null = null;
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private targetLookAt: THREE.Vector3 = new THREE.Vector3();
  private currentFov: number = 60;
  private isAnimating: boolean = false;

  // For smooth following
  private smoothPosition: THREE.Vector3 = new THREE.Vector3();
  private smoothLookAt: THREE.Vector3 = new THREE.Vector3();

  // Orbit mode
  private orbitConfig: CameraOrbitConfig | null = null;
  private orbitAngle: number = 0;  // Current angle in radians

  // Random orbit brush mode
  private isRandomOrbitMode: boolean = false;
  private randomOrbitBrushes: AnimatedBrush[] = [];
  private randomOrbitRadius: number = 200;
  private randomOrbitSpeed: number = 0.3;
  private randomOrbitHeight: number = 0;
  private randomOrbitChangeInterval: number = 2; // seconds between target switches
  private randomOrbitLastSwitch: number = 0;
  private currentOrbitBrushIndex: number = 0;

  // Orbit around cluster (bounding box center) mode
  private isOrbitArrayMode: boolean = false;
  private orbitArrayRadius: number = 800;
  private orbitArraySpeed: number = 0.15;
  private orbitArrayHeightOffset: number = 0;
  private orbitArrayAngle: number = 0;
  private orbitArrayDuration: number = 0; // 0 = indefinite
  private orbitArrayStartTime: number = 0;

  constructor(options: CameraControllerOptions) {
    this.camera = options.camera;
    this.mode = options.mode || 'fixed';
    this.followTarget = options.followTarget || null;
    this.keyFrames = options.keyFrames || [];

    // Initialize smooth position
    this.smoothPosition.copy(this.camera.position);
    this.smoothLookAt.set(0, 0, 0);

    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.currentFov = this.camera.fov;
    }
  }

  setMode(mode: CameraMode) {
    this.mode = mode;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  setFollowTarget(target: CameraFollowTarget | null) {
    this.followTarget = target;
  }

  setKeyFrames(keyFrames: CameraKeyFrame[]) {
    this.keyFrames = keyFrames;
  }

  // Set orbit configuration for orbit mode
  setOrbitConfig(config: CameraOrbitConfig) {
    this.orbitConfig = config;
    this.orbitAngle = 0;  // Reset angle
  }

  // Start/stop orbit animation
  startOrbit() {
    this.mode = 'orbit';
    this.isAnimating = true;
  }

  stopOrbit() {
    this.mode = 'fixed';
    this.isAnimating = false;
  }

  // Update camera during animation frame
  update(deltaTime: number, brushPositions?: Map<string, Vector3>) {
    if (this.mode === 'follow' && this.followTarget && brushPositions) {
      this.updateFollowMode(brushPositions, deltaTime);
    } else if (this.mode === 'orbit') {
      if (this.isOrbitArrayMode) {
        this.updateOrbitArrayMode(deltaTime, brushPositions);
      } else if (this.isRandomOrbitMode) {
        this.updateRandomOrbitMode(deltaTime, brushPositions);
      } else {
        this.updateOrbitMode(deltaTime);
      }
    }
    // Fixed mode: camera stays where GSAP positioned it
  }

  private updateRandomOrbitMode(deltaTime: number, brushPositions?: Map<string, Vector3>) {
    if (!this.isRandomOrbitMode || this.randomOrbitBrushes.length === 0) return;

    const brushes = this.randomOrbitBrushes;
    const currentBrush = brushes[this.currentOrbitBrushIndex];

    // Get current brush position
    let targetPos: Vector3;
    if (brushPositions && brushPositions.has(currentBrush.id)) {
      targetPos = brushPositions.get(currentBrush.id)!;
    } else {
      targetPos = currentBrush.targetPosition;
    }

    // Update orbit angle - complete one full orbit (2π radians) before switching
    this.orbitAngle += this.randomOrbitSpeed * deltaTime;

    // Check if completed one full orbit (2π radians ≈ 6.283)
    if (this.orbitAngle >= Math.PI * 2) {
      // Switch to a new random target
      this.currentOrbitBrushIndex = Math.floor(Math.random() * brushes.length);
      this.orbitAngle = 0; // Reset angle for new target
    }

    // Calculate camera position on true 3D orbit circle around current brush
    // Spherical orbit: theta for horizontal (XZ), phi for vertical (Y)
    const theta = this.orbitAngle; // horizontal angle
    const phi = Math.PI / 4 + Math.sin(this.orbitAngle * 0.5) * Math.PI / 6; // elevation oscillates ±30° around 45°

    const x = targetPos.x + Math.cos(theta) * Math.cos(phi) * this.randomOrbitRadius;
    const y = targetPos.y + Math.sin(phi) * this.randomOrbitRadius;
    const z = targetPos.z + Math.sin(theta) * Math.cos(phi) * this.randomOrbitRadius;

    // Smoothly interpolate camera position
    const lerpFactor = 1 - Math.pow(0.001, deltaTime);
    this.smoothPosition.x += (x - this.smoothPosition.x) * lerpFactor;
    this.smoothPosition.y += (y - this.smoothPosition.y) * lerpFactor;
    this.smoothPosition.z += (z - this.smoothPosition.z) * lerpFactor;

    // Always look at the target brush position
    this.smoothLookAt.set(targetPos.x, targetPos.y, targetPos.z);

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLookAt);
  }

  private updateOrbitArrayMode(deltaTime: number, brushPositions?: Map<string, Vector3>) {
    if (!this.isOrbitArrayMode || !brushPositions || brushPositions.size === 0) return;

    // Check duration limit
    if (this.orbitArrayDuration > 0) {
      const elapsed = performance.now() / 1000 - this.orbitArrayStartTime;
      if (elapsed >= this.orbitArrayDuration) {
        this.stopOrbitArray();
        return;
      }
    }

    // Calculate bounding box center of all brush positions
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    brushPositions.forEach((pos) => {
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
      maxZ = Math.max(maxZ, pos.z);
    });

    // Cluster center (bounding box center)
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Update orbit angle
    this.orbitArrayAngle += this.orbitArraySpeed * deltaTime;

    // Spherical coordinates for camera position around cluster center
    const theta = this.orbitArrayAngle; // horizontal angle
    const phi = Math.PI / 4 + Math.sin(this.orbitArrayAngle * 0.5) * Math.PI / 6; // elevation oscillates ±30° around 45°

    const x = centerX + Math.cos(theta) * Math.cos(phi) * this.orbitArrayRadius;
    const y = centerY + Math.sin(phi) * this.orbitArrayRadius + this.orbitArrayHeightOffset;
    const z = centerZ + Math.sin(theta) * Math.cos(phi) * this.orbitArrayRadius;

    // Smoothly interpolate camera position
    const lerpFactor = 1 - Math.pow(0.001, deltaTime);
    this.smoothPosition.x += (x - this.smoothPosition.x) * lerpFactor;
    this.smoothPosition.y += (y - this.smoothPosition.y) * lerpFactor;
    this.smoothPosition.z += (z - this.smoothPosition.z) * lerpFactor;

    // Always look at the cluster center
    this.smoothLookAt.set(centerX, centerY, centerZ);

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLookAt);
  }

  private updateFollowMode(brushPositions: Map<string, Vector3>, deltaTime: number) {
    if (!this.followTarget) return;

    const targetPos = brushPositions.get(this.followTarget.brushId);
    if (!targetPos) return;

    // Calculate desired camera position (offset from target)
    const desiredX = targetPos.x + this.followTarget.offset.x;
    const desiredY = targetPos.y + this.followTarget.offset.y;
    const desiredZ = targetPos.z + this.followTarget.offset.z;

    // Smooth interpolation
    const lerpFactor = 1 - Math.pow(0.001, deltaTime);
    this.smoothPosition.x += (desiredX - this.smoothPosition.x) * lerpFactor;
    this.smoothPosition.y += (desiredY - this.smoothPosition.y) * lerpFactor;
    this.smoothPosition.z += (desiredZ - this.smoothPosition.z) * lerpFactor;

    // Look ahead point
    const lookAheadX = targetPos.x + this.followTarget.lookAhead;
    this.smoothLookAt.x += (lookAheadX - this.smoothLookAt.x) * lerpFactor;
    this.smoothLookAt.y += (targetPos.y - this.smoothLookAt.y) * lerpFactor;
    this.smoothLookAt.z += (targetPos.z - this.smoothLookAt.z) * lerpFactor;

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLookAt);
  }

  private updateOrbitMode(deltaTime: number) {
    if (!this.orbitConfig) return;

    // Update orbit angle based on speed
    this.orbitAngle += this.orbitConfig.speed * deltaTime;

    // Calculate camera position on orbit circle
    const x = this.orbitConfig.center.x + Math.cos(this.orbitAngle) * this.orbitConfig.radius;
    const y = this.orbitConfig.center.y + (this.orbitConfig.height || 0);
    const z = this.orbitConfig.center.z + Math.sin(this.orbitAngle) * this.orbitConfig.radius;

    // Smoothly interpolate camera position
    const lerpFactor = 1 - Math.pow(0.001, deltaTime);
    this.smoothPosition.x += (x - this.smoothPosition.x) * lerpFactor;
    this.smoothPosition.y += (y - this.smoothPosition.y) * lerpFactor;
    this.smoothPosition.z += (z - this.smoothPosition.z) * lerpFactor;

    // Always look at orbit center
    this.smoothLookAt.set(
      this.orbitConfig.center.x,
      this.orbitConfig.center.y,
      this.orbitConfig.center.z
    );

    this.camera.position.copy(this.smoothPosition);
    this.camera.lookAt(this.smoothLookAt);
  }

  // Animate FOV change
  animateFov(targetFov: number, duration: number = 2, onUpdate?: () => void) {
    if (!(this.camera instanceof THREE.PerspectiveCamera)) return;

    const perspectiveCamera = this.camera;
    if (perspectiveCamera.fov === undefined) return;

    const proxy = { fov: this.currentFov };
    gsap.to(proxy, {
      fov: targetFov,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        perspectiveCamera.fov = proxy.fov;
        perspectiveCamera.updateProjectionMatrix();
        onUpdate?.();
      },
      onComplete: () => {
        this.currentFov = targetFov;
      },
    });
  }

  // Play keyframe animation
  playKeyFrames(startTime: number = 0) {
    if (this.keyFrames.length < 2) return;

    this.stop();

    const totalDuration = this.keyFrames[this.keyFrames.length - 1].time;

    const tl = gsap.timeline({
      onUpdate: () => {
        const currentTime = tl.time();
        this.updateCameraFromKeyFrames(currentTime);
      },
      onComplete: () => {
        this.isAnimating = false;
      },
    });

    // Add keyframe segments
    for (let i = 0; i < this.keyFrames.length - 1; i++) {
      const currentKF = this.keyFrames[i];
      const nextKF = this.keyFrames[i + 1];
      const segmentDuration = nextKF.time - currentKF.time;

      tl.to({}, {
        duration: segmentDuration,
      }, currentKF.time);
    }

    tl.seek(startTime);
    this.animationRef = tl;
    this.isAnimating = true;
    tl.play();
  }

  private updateCameraFromKeyFrames(currentTime: number) {
    let currentKF: CameraKeyFrame | null = null;
    let nextKF: CameraKeyFrame | null = null;

    for (let i = 0; i < this.keyFrames.length; i++) {
      if (currentTime >= this.keyFrames[i].time) {
        currentKF = this.keyFrames[i];
        nextKF = this.keyFrames[i + 1] || null;
      }
    }

    if (currentKF && nextKF) {
      const segmentDuration = nextKF.time - currentKF.time;
      const segmentProgress = segmentDuration > 0 ? (currentTime - currentKF.time) / segmentDuration : 0;
      const easingFn = easeFunctions[currentKF.transition || 'ease-in-out'];
      const easedProgress = easingFn(segmentProgress);

      // Interpolate position
      const newPosition = this.lerpVector3(currentKF.position, nextKF.position, easedProgress);
      const newLookAt = this.lerpVector3(currentKF.lookAt, nextKF.lookAt, easedProgress);

      this.camera.position.set(newPosition.x, newPosition.y, newPosition.z);
      this.camera.lookAt(newLookAt.x, newLookAt.y, newLookAt.z);

      // Interpolate FOV if both keyframes have it
      if (currentKF.fov !== undefined && nextKF.fov !== undefined && this.camera instanceof THREE.PerspectiveCamera) {
        const perspCamera = this.camera;
        const newFov = currentKF.fov + (nextKF.fov - currentKF.fov) * easedProgress;
        perspCamera.fov = newFov;
        perspCamera.updateProjectionMatrix();
      }
    }
  }

  private lerpVector3(a: Vector3, b: Vector3, t: number): Vector3 {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
  }

  // Get target position for animation (used by GSAP timeline)
  getTargetPosition(): THREE.Vector3 {
    return this.targetPosition;
  }

  // Set camera position directly (for GSAP targets)
  setPosition(x: number, y: number, z: number) {
    this.camera.position.set(x, y, z);
    this.smoothPosition.set(x, y, z);
  }

  setLookAt(x: number, y: number, z: number) {
    this.targetLookAt.set(x, y, z);
    this.smoothLookAt.set(x, y, z);
    this.camera.lookAt(x, y, z);
  }

  getCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    return this.camera;
  }

  pause() {
    this.animationRef?.pause();
  }

  resume() {
    this.animationRef?.resume();
  }

  stop() {
    if (this.animationRef) {
      this.animationRef.kill();
      this.animationRef = null;
    }
    this.isAnimating = false;
  }

  isPlaying(): boolean {
    return this.isAnimating;
  }

  // Get current state for serialization
  getState(): { position: Vector3; lookAt: Vector3; fov: number } {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      lookAt: {
        x: this.targetLookAt.x,
        y: this.targetLookAt.y,
        z: this.targetLookAt.z,
      },
      fov: this.camera instanceof THREE.PerspectiveCamera ? this.camera.fov : 60,
    };
  }

  // Orbit around a specific brush
  orbitAroundBrush(brushId: string, radius: number, speed: number, height: number = 0) {
    this.mode = 'orbit';
    this.orbitConfig = {
      center: { x: 0, y: 0, z: 0 },
      radius,
      speed,
      height,
    };
    this.isAnimating = true;
  }

  // Start random follow mode
  startRandomFollow(brushes: AnimatedBrush[], brushPositions: Map<string, Vector3>, speed: number, radius: number, height: number = 0) {
    this.mode = 'follow';
    this.isAnimating = true;
    this.followTarget = {
      brushId: brushes[0]?.id || '',
      offset: { x: 0, y: height, z: radius },
      lookAhead: 3,
    };
  }

  // Start random orbit around brushes - camera orbits around a randomly selected brush, switching targets periodically
  startRandomOrbitBrush(
    brushes: AnimatedBrush[],
    radius: number = 200,
    speed: number = 0.3,
    height: number = 0
  ) {
    if (brushes.length === 0) return;

    this.mode = 'orbit';
    this.isRandomOrbitMode = true;
    this.randomOrbitBrushes = brushes;
    this.randomOrbitRadius = radius;
    this.randomOrbitSpeed = speed;
    this.randomOrbitHeight = height;
    this.currentOrbitBrushIndex = Math.floor(Math.random() * brushes.length);
    this.orbitAngle = 0;
    this.isAnimating = true;
  }

  // Check if camera is in random orbit mode
  isInRandomOrbitMode(): boolean {
    return this.isRandomOrbitMode;
  }

  // Stop random orbit mode
  stopRandomOrbit() {
    this.isRandomOrbitMode = false;
    this.mode = 'fixed';
    this.isAnimating = false;
  }

  // Start orbit around cluster (bounding box center of all brushes)
  startOrbitAroundCluster(
    brushes: AnimatedBrush[],
    radius: number = 800,
    speed: number = 0.15,
    heightOffset: number = 0,
    duration: number = 0
  ) {
    this.mode = 'orbit';
    this.isOrbitArrayMode = true;
    this.orbitArrayRadius = radius;
    this.orbitArraySpeed = speed;
    this.orbitArrayHeightOffset = heightOffset;
    this.orbitArrayDuration = duration;
    this.orbitArrayAngle = 0;
    this.orbitArrayStartTime = performance.now() / 1000;
    this.isAnimating = true;
  }

  // Check if camera is in orbit array mode
  isInOrbitArrayMode(): boolean {
    return this.isOrbitArrayMode;
  }

  // Stop orbit array mode
  stopOrbitArray() {
    this.isOrbitArrayMode = false;
    this.mode = 'fixed';
    this.isAnimating = false;
  }

  // Camera shake effect
  shakeCamera(intensity: number, frequency: number, duration: number) {
    const startTime = performance.now();
    const originalPosition = this.camera.position.clone();
    const shakeIntensity = intensity;
    const shakeFrequency = frequency;

    const shake = () => {
      const elapsed = (performance.now() - startTime) / 1000;

      if (elapsed < duration) {
        const decay = 1 - elapsed / duration; // Fade out
        const offsetX = Math.sin(elapsed * shakeFrequency * Math.PI * 2) * shakeIntensity * decay;
        const offsetY = Math.cos(elapsed * shakeFrequency * Math.PI * 2 * 1.3) * shakeIntensity * decay;

        this.camera.position.x = originalPosition.x + offsetX;
        this.camera.position.y = originalPosition.y + offsetY;

        requestAnimationFrame(shake);
      } else {
        // Restore original position
        this.camera.position.copy(originalPosition);
      }
    };

    requestAnimationFrame(shake);
  }

  // Play extended keyframes with custom positions
  playExtendedKeyFrames(keyFrames: Array<{ time: number; position: Vector3; lookAt: Vector3; fov?: number }>) {
    this.stop();

    const totalDuration = keyFrames[keyFrames.length - 1].time;

    const tl = gsap.timeline({
      onUpdate: () => {
        const currentTime = tl.time();
        this.updateFromExtendedKeyFrames(currentTime, keyFrames);
      },
      onComplete: () => {
        this.isAnimating = false;
      },
    });

    // Add segments between keyframes
    for (let i = 0; i < keyFrames.length - 1; i++) {
      const currentKF = keyFrames[i];
      const nextKF = keyFrames[i + 1];
      const segmentDuration = nextKF.time - currentKF.time;

      tl.to({}, { duration: segmentDuration }, currentKF.time);
    }

    tl.seek(0);
    this.animationRef = tl;
    this.isAnimating = true;
    tl.play();
  }

  private updateFromExtendedKeyFrames(currentTime: number, keyFrames: Array<{ time: number; position: Vector3; lookAt: Vector3; fov?: number }>) {
    let currentKF: typeof keyFrames[0] | null = null;
    let nextKF: typeof keyFrames[0] | null = null;

    for (let i = 0; i < keyFrames.length; i++) {
      if (currentTime >= keyFrames[i].time) {
        currentKF = keyFrames[i];
        nextKF = keyFrames[i + 1] || null;
      }
    }

    if (currentKF && nextKF) {
      const segmentDuration = nextKF.time - currentKF.time;
      const segmentProgress = segmentDuration > 0 ? (currentTime - currentKF.time) / segmentDuration : 0;
      const easedProgress = this.easeInOut(segmentProgress);

      // Interpolate position
      const newPosition = this.lerpVector3(currentKF.position, nextKF.position, easedProgress);
      const newLookAt = this.lerpVector3(currentKF.lookAt, nextKF.lookAt, easedProgress);

      this.camera.position.set(newPosition.x, newPosition.y, newPosition.z);
      this.camera.lookAt(newLookAt.x, newLookAt.y, newLookAt.z);

      // Interpolate FOV if both keyframes have it
      if (currentKF.fov !== undefined && nextKF.fov !== undefined && this.camera instanceof THREE.PerspectiveCamera) {
        const perspCamera = this.camera;
        const newFov = currentKF.fov + (nextKF.fov - currentKF.fov) * easedProgress;
        perspCamera.fov = newFov;
        perspCamera.updateProjectionMatrix();
      }
    }
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}
