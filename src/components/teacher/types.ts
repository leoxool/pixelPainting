// Shared types for TeacherStudio
export type DataSource = 'webcam' | 'image';
export type BrushMode = 'draw' | 'erase';
export type TabType = 'brushEdit' | 'renderOutput';
export type CameraStatus = 'idle' | 'viewing' | 'adjusting';

export type SortRule = 'time' | 'brightness' | 'saturation' | 'hue';

export interface BrushLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  isDrawing: boolean;
}

export interface BrushPreset {
  id: string;
  name: string;
  timestamp: number;
  layers: (string | null)[];
}

export interface BrushGroup {
  id: string;
  name: string;
  timestamp: number;
  slots: (string | null)[];  // 10个笔刷preset ID，对应灰度级0-9
}

export interface GridCell {
  row: number;
  col: number;
  grayscale: number;
  level: number;
}

export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  removeWhiteBg: boolean;
  bgRemoveStrength: number;
}