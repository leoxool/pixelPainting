'use client';

// Component to sync source display canvas with actual source canvas
import { useEffect } from 'react';

interface SyncSourceDisplayProps {
  trigger: number;
  sourceImageData: ImageData | null;
}

export function SyncSourceDisplay({ trigger, sourceImageData }: SyncSourceDisplayProps) {
  useEffect(() => {
    if (!sourceImageData) return;
    const displayCanvas = document.getElementById('source-display-canvas') as HTMLCanvasElement;
    if (displayCanvas) {
      const ctx = displayCanvas.getContext('2d');
      if (ctx) {
        displayCanvas.width = sourceImageData.width;
        displayCanvas.height = sourceImageData.height;
        ctx.putImageData(sourceImageData, 0, 0);
      }
    }
  }, [trigger, sourceImageData]);
  return null;
}