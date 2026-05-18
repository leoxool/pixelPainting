// Animation System Types

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraKeyFrame {
  time: number; // seconds
  position: Vector3;
  lookAt: Vector3;
  fov?: number; // For perspective camera
  transition?: 'ease-in-out' | 'linear' | 'bounce' | 'elastic';
}

export interface BrushKeyFrame {
  time: number;
  position: Vector3;
  rotation?: Vector3; // euler angles
  scale?: number;
  opacity?: number;
}

export interface ReferenceImage {
  id: string;
  name: string;
  imageData: string; // base64 or URL
  luminanceData?: Uint8Array; // Pre-computed luminance levels
  gridData?: number[][]; // 2D array of luminance levels
  gridSizeX: number; // Original grid size used when creating this image
  gridSizeY: number;
}

export interface AnimationClip {
  id: string;
  name: string;
  duration: number; // seconds
  referenceImageId: string;
  cameraKeyFrames: CameraKeyFrame[];
  brushKeyFrames?: Map<string, BrushKeyFrame[]>; // brush id -> keyframes
  startDelay?: number; // delay before starting
  transitionType?: 'fade' | 'cut' | 'dissolve';
}

export interface AnimationScript {
  id: string;
  name: string;
  version: string;
  clips: AnimationClip[];
  musicUrl?: string;
  totalDuration: number;
  createdAt: number;
}

// Brush instance for animation (separate from BrushPreset)
export interface AnimatedBrush {
  id: string;
  presetId: string;
  level: number; // luminance level (0-9)
  gridIndex: number; // which grid cell this brush belongs to
  // Current animated state
  position: Vector3;
  rotation: Vector3;
  scale: number;
  opacity: number;
  // Target position (final resting place)
  targetPosition: Vector3;
  // Initial scatter position (for flight animation)
  scatterPosition: Vector3;
  // Animation progress (0-1)
  progress: number;
}

// Animation stage state
export type AnimationStageStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'rendering'
  | 'completed'
  | 'error';

export interface AnimationStageState {
  status: AnimationStageStatus;
  currentTime: number; // current playback time in seconds
  totalDuration: number;
  currentClipIndex: number;
  isPlaying: boolean;
  isLooping: boolean;
  playbackRate: number;
  musicVolume: number;
  musicEnabled: boolean;
}

// Camera animation state
export interface CameraAnimationState {
  currentKeyFrame: CameraKeyFrame | null;
  nextKeyFrame: CameraKeyFrame | null;
  progress: number; // 0-1 between keyframes
  currentPosition: Vector3;
  currentLookAt: Vector3;
}

// Script command types for DSL
export type ScriptCommandType =
  | 'CAMERA_MOVE'
  | 'CAMERA_ZOOM'
  | 'BRUSH_FLIGHT'
  | 'REFERENCE_CHANGE'
  | 'MUSIC_SYNC'
  | 'TRANSITION'
  | 'WAIT'
  | 'MARKER';

// Extended command types for advanced animations
export type ExtendedCommandType =
  | ScriptCommandType
  | 'CAMERA_FOLLOW'
  | 'CAMERA_MODE'
  | 'CAMERA_ORBIT'
  | 'LIGHT_INTENSITY'
  | 'LIGHT_COLOR'
  | 'LIGHT_POSITION'
  | 'MOVE_BRUSH'
  | 'FORMATION'
  | 'SCATTER'
  | 'DOF_FOCUS'
  | 'DOF_BLUR'
  | 'VIGNETTE'
  | 'MATERIAL_OPACITY'
  | 'MATERIAL_EMISSIVE'
  // Brush animation forms
  | 'SWIRL'
  | 'AERIAL_DANCE'
  | 'ORBIT_AXIS'
  | 'BEZIER_FLIGHT'
  // Array control
  | 'WAVE'
  | 'OSCILLATE'
  | 'PULSE'
  | 'ARRAY_ROTATE'
  | 'ARRAY_SCALE'
  // Enhanced camera
  | 'ORBIT_BRUSH'
  | 'RANDOM_FOLLOW'
  | 'CAMERA_SHAKE'
  | 'CAMERA_PATH'
  // Environment
  | 'BACKGROUND_COLOR'
  | 'FOG'
  | 'SPOT_LIGHT'
  // Cinematic transitions
  | 'EXPLOSION'
  | 'IMPLOSION'
  | 'COLOR_FLASH'
  | 'STROBE'
  | 'RACK_FOCUS'
  // Single brush control
  | 'ROTATE_BRUSH'
  // Brush wandering
  | 'RANDOM_ROAM'
  // Camera orbit with random target switching
  | 'RANDOM_ORBIT_BRUSH';

export interface ExtendedCameraKeyFrame {
  time: number;
  position: Vector3;
  lookAt: Vector3;
  fov?: number;
  transition?: 'ease-in-out' | 'linear' | 'bounce' | 'elastic';
}

export type BrushFormationType = 'swirl' | 'aerial' | 'orbit' | 'bezier';
export type ArrayEffectMode = 'wave' | 'oscillate' | 'pulse' | 'rotate' | 'scale';
export type TransitionEffectType = 'explosion' | 'implosion' | 'flash' | 'strobe' | 'rackFocus';

export interface ScriptCommand {
  type: ScriptCommandType;
  time: number;
  params: Record<string, unknown>;
}

// Parsed animation script from DSL
export interface ParsedAnimationScript {
  commands: ScriptCommand[];
  duration: number;
  markers: Map<string, number>; // marker name -> time
}

// Default animation settings
export const DEFAULT_ANIMATION_SETTINGS = {
  brushFlightDuration: 3.0, // seconds for brushes to fly in
  cameraMoveDuration: 2.0, // seconds for camera transitions
  scatterRadius: 500, // how far brushes scatter initially
  defaultTransition: 'ease-in-out' as const,
  playbackRate: 1.0,
  musicVolume: 0.8,
};