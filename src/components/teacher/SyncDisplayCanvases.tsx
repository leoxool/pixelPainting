'use client';

// Component to sync display canvases with actual brush canvases
import { useEffect } from 'react';

// Types inlined to avoid module resolution issues
interface BrushLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  isDrawing: boolean;
}

const BRUSH_SIZE = 200;

interface SyncDisplayCanvasesProps {
  trigger: number;
  brushLayers: (BrushLayer | null)[];
}

export function SyncDisplayCanvases({ trigger, brushLayers }: SyncDisplayCanvasesProps) {
  useEffect(() => {
    for (let i = 0; i < 10; i++) {
      const displayCanvas = document.getElementById(`brush-display-canvas-${i}`) as HTMLCanvasElement;
      const layer = brushLayers[i];
      if (displayCanvas && layer?.canvas) {
        const ctx = displayCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, BRUSH_SIZE, BRUSH_SIZE);
          ctx.drawImage(layer.canvas, 0, 0);
        }
      }
    }
  }, [trigger, brushLayers]);
  return null;
}