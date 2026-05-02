// Grid and rendering utility functions for TeacherStudio
import { GridCell } from './types';
import { SOURCE_WIDTH, SOURCE_HEIGHT, BRUSH_SIZE } from './constants';

/**
 * Convert level (0-9) to gray color string
 */
export function getLevelGray(level: number): string {
  const gray = Math.floor(level * 25.5);
  return `rgb(${gray}, ${gray}, ${gray})`;
}

/**
 * Convert grayscale value (0-255) to level (0-9)
 */
export function mapGrayscaleToLevel(grayscale: number): number {
  const clamped = Math.max(0, Math.min(255, grayscale));
  return Math.min(9, Math.max(0, Math.floor((clamped / 255) * 10)));
}

interface ExtractGridDataParams {
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sourceCtxRef: React.RefObject<CanvasRenderingContext2D | null>;
  sourceAspectRatio: number;
  gridSizeX: number;
  gridSizeY: number;
}

/**
 * Extract grid data from source canvas for mosaic rendering
 */
export function extractGridData({
  sourceCanvasRef,
  sourceCtxRef,
  sourceAspectRatio,
  gridSizeX,
  gridSizeY,
}: ExtractGridDataParams): GridCell[][] {
  const sourceCanvas = sourceCanvasRef.current;
  const sourceCtx = sourceCtxRef.current;
  if (!sourceCanvas || !sourceCtx) return [];

  const grid: GridCell[][] = [];

  const canvasWidth = sourceCanvas.width;
  const canvasHeight = sourceCanvas.height;

  // 计算图片在实际canvas中的绘制区域
  let drawX = 0, drawY = 0, drawWidth = canvasWidth, drawHeight = canvasHeight;
  if (sourceAspectRatio >= 1) {
    drawHeight = canvasWidth / sourceAspectRatio;
    drawY = (canvasHeight - drawHeight) / 2;
  } else {
    drawWidth = canvasHeight * sourceAspectRatio;
    drawX = (canvasWidth - drawWidth) / 2;
  }

  const cellWidth = drawWidth / gridSizeX;
  const cellHeight = drawHeight / gridSizeY;

  const imageData = sourceCtx.getImageData(0, 0, canvasWidth, canvasHeight);
  const data = imageData.data;

  for (let row = 0; row < gridSizeY; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSizeX; col++) {
      const startX = Math.floor(drawX + col * cellWidth);
      const startY = Math.floor(drawY + row * cellHeight);
      const endX = Math.floor(drawX + (col + 1) * cellWidth);
      const endY = Math.floor(drawY + (row + 1) * cellHeight);

      let totalGrayscale = 0;
      let pixelCount = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
            const idx = (y * canvasWidth + x) * 4;
            totalGrayscale += data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
            pixelCount++;
          }
        }
      }

      const avgGrayscale = pixelCount > 0 ? totalGrayscale / pixelCount : 128;
      grid[row][col] = { row, col, grayscale: avgGrayscale, level: mapGrayscaleToLevel(avgGrayscale) };
    }
  }
  return grid;
}

interface RenderArtParams {
  outputCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  outputCtxRef: React.RefObject<CanvasRenderingContext2D | null>;
  sourceCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  sourceCtxRef: React.RefObject<CanvasRenderingContext2D | null>;
  brushLayersRef: React.RefObject<(BrushLayer | null)[]>;
  sourceAspectRatio: number;
  gridSizeX: number;
  gridSizeY: number;
}

interface BrushLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  isDrawing: boolean;
}

/**
 * Render mosaic art to output canvas
 */
export function renderArt({
  outputCanvasRef,
  outputCtxRef,
  sourceCanvasRef,
  sourceCtxRef,
  brushLayersRef,
  sourceAspectRatio,
  gridSizeX,
  gridSizeY,
}: RenderArtParams): void {
  const outputCanvas = outputCanvasRef.current;
  const outputCtx = outputCtxRef.current;
  if (!outputCanvas || !outputCtx) return;
  if (brushLayersRef.current.filter(l => l !== null).length === 0) return;

  // 根据宽高比设置输出尺寸
  const canvasWidth = sourceCanvasRef.current?.width || SOURCE_WIDTH;
  const canvasHeight = sourceCanvasRef.current?.height || SOURCE_HEIGHT;
  let outputWidth, outputHeight;
  if (sourceAspectRatio >= 1) {
    outputWidth = canvasWidth;
    outputHeight = canvasWidth / sourceAspectRatio;
  } else {
    outputWidth = canvasHeight * sourceAspectRatio;
    outputHeight = canvasHeight;
  }

  outputCanvas.width = Math.round(outputWidth);
  outputCanvas.height = Math.round(outputHeight);
  const cellWidth = outputWidth / gridSizeX;
  const cellHeight = outputHeight / gridSizeY;

  outputCtx.fillStyle = '#ffffff';
  outputCtx.fillRect(0, 0, outputWidth, outputHeight);

  const grid = extractGridData({
    sourceCanvasRef: sourceCanvasRef,
    sourceCtxRef: sourceCtxRef,
    sourceAspectRatio,
    gridSizeX,
    gridSizeY,
  });
  if (grid.length === 0) return;

  for (let row = 0; row < gridSizeY; row++) {
    for (let col = 0; col < gridSizeX; col++) {
      const layer = brushLayersRef.current[grid[row][col].level];
      if (layer) {
        outputCtx.drawImage(layer.canvas, 0, 0, BRUSH_SIZE, BRUSH_SIZE, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
      }
    }
  }
}