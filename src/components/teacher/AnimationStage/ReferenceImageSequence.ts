'use client';

import { useCallback, useState, useEffect } from 'react';
import { ReferenceImage } from './types';

interface UseReferenceImagesOptions {
  maxImages?: number;
  onLoadComplete?: (images: ReferenceImage[]) => void;
}

export function useReferenceImages(options?: UseReferenceImagesOptions) {
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Calculate luminance grid data from image
  // Uses same sampling logic as TeacherParticleCanvas for consistency
  const calculateGridData = useCallback((
    imageData: string,
    gridSamplingSize: number = 5
  ): Promise<{ gridData: number[][], gridSizeX: number, gridSizeY: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Normalize image to fit within 400x400 while preserving aspect ratio
        // Same logic as TeacherStudio for consistency
        const maxDim = 400;
        let scaledWidth = img.width;
        let scaledHeight = img.height;
        if (Math.max(img.width, img.height) > maxDim) {
          const scale = maxDim / Math.max(img.width, img.height);
          scaledWidth = Math.round(img.width * scale);
          scaledHeight = Math.round(img.height * scale);
        }

        // Create canvas with dimensions matching the scaled image
        const canvas = document.createElement('canvas');
        canvas.width = scaledWidth;
        canvas.height = scaledHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot create canvas context'));
          return;
        }

        // Scale image to fit canvas (preserving aspect ratio)
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, scaledWidth, scaledHeight);

        // Get image data
        const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageDataObj.data;

        // Use scaled dimensions
        const sourceWidth = scaledWidth;
        const sourceHeight = scaledHeight;

        // Image fills canvas completely - no letterboxing
        const drawWidth = sourceWidth;
        const drawHeight = sourceHeight;
        const drawX = 0;
        const drawY = 0;

        // Calculate grid dimensions based on sampling size (same as TeacherParticleCanvas)
        const gridSizeX = Math.round(sourceWidth / gridSamplingSize);
        const gridSizeY = Math.round(sourceHeight / gridSamplingSize);

        const gridData: number[][] = [];

        // Sample using same approach as TeacherParticleCanvas
        for (let i = 0; i < gridSizeY; i++) {
          const row: number[] = [];
          for (let j = 0; j < gridSizeX; j++) {
            // Map grid cell to actual image pixel position within canvas
            const srcX = Math.floor((j / gridSizeX) * drawWidth + drawX);
            const srcY = Math.floor((i / gridSizeY) * drawHeight + drawY);
            const srcW = Math.max(1, Math.floor(drawWidth / gridSizeX));
            const srcH = Math.max(1, Math.floor(drawHeight / gridSizeY));

            let totalLuminance = 0;
            let pixelCount = 0;

            for (let dy = 0; dy < srcH; dy++) {
              for (let dx = 0; dx < srcW; dx++) {
                const px = Math.min(srcX + dx, sourceWidth - 1);
                const py = Math.min(srcY + dy, sourceHeight - 1);
                const pidx = (py * sourceWidth + px) * 4;
                const r = data[pidx];
                const g = data[pidx + 1];
                const b = data[pidx + 2];
                totalLuminance += r * 0.2126 + g * 0.7152 + b * 0.0722;
                pixelCount++;
              }
            }

            const avgLuminance = pixelCount > 0 ? totalLuminance / pixelCount : 128;
            row.push(avgLuminance);
          }
          gridData.push(row);
        }

        resolve({ gridData, gridSizeX, gridSizeY });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageData;
    });
  }, []);

  // Add a reference image
  const addImage = useCallback(async (
    imageData: string,
    name?: string,
    gridSamplingSize: number = 5
  ) => {
    setIsLoading(true);
    try {
      const { gridData, gridSizeX, gridSizeY } = await calculateGridData(imageData, gridSamplingSize);

      const newImage: ReferenceImage = {
        id: `ref-${Date.now()}`,
        name: name || `Reference ${images.length + 1}`,
        imageData,
        gridData,
        gridSizeX,
        gridSizeY,
      };

      setImages(prev => {
        const updated = [...prev, newImage];
        options?.onLoadComplete?.(updated);
        return updated;
      });

      return newImage;
    } finally {
      setIsLoading(false);
    }
  }, [calculateGridData, images.length, options]);

  // Remove a reference image
  const removeImage = useCallback((id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  }, []);

  // Reorder reference images (move from one index to another)
  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    setImages(prev => {
      const newImages = [...prev];
      const [movedItem] = newImages.splice(fromIndex, 1);
      newImages.splice(toIndex, 0, movedItem);
      return newImages;
    });
  }, []);

  // Update reference image
  const updateImage = useCallback((
    id: string,
    updates: Partial<Omit<ReferenceImage, 'id'>>
  ) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, ...updates } : img
    ));
  }, []);

  // Get current reference image
  const getCurrentImage = useCallback(() => {
    return images[currentIndex] || null;
  }, [images, currentIndex]);

  // Navigate to next/previous image
  const nextImage = useCallback(() => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, images.length]);

  const prevImage = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const goToImage = useCallback((index: number) => {
    if (index >= 0 && index < images.length) {
      setCurrentIndex(index);
    }
  }, [images.length]);

  // Get luminance data for a specific image (normalized to 0-9 for 10 brush levels)
  const getNormalizedGridData = useCallback((
    imageId: string,
    slotCount: number = 10
  ): Uint8Array | null => {
    const image = images.find(img => img.id === imageId);
    if (!image?.gridData) return null;

    const gridData = image.gridData;
    const rows = gridData.length;
    const cols = rows > 0 ? gridData[0].length : 0;

    if (rows === 0 || cols === 0) return null;

    // Find min/max luminance
    let minLum = 255;
    let maxLum = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lum = gridData[y][x];
        minLum = Math.min(minLum, lum);
        maxLum = Math.max(maxLum, lum);
      }
    }

    // Normalize to levels
    const result = new Uint8Array(rows * cols);
    const range = maxLum - minLum || 1;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const normalized = ((gridData[y][x] - minLum) / range) * (slotCount - 1);
        result[y * cols + x] = Math.round(Math.max(0, Math.min(slotCount - 1, normalized)));
      }
    }

    return result;
  }, [images]);

  // Clear all images
  const clearAll = useCallback(() => {
    setImages([]);
    setCurrentIndex(0);
  }, []);

  return {
    images,
    currentIndex,
    isLoading,
    addImage,
    removeImage,
    reorderImages,
    updateImage,
    getCurrentImage,
    nextImage,
    prevImage,
    goToImage,
    getNormalizedGridData,
    clearAll,
  };
}

// Create default reference images (sample grayscale images)
export function createDefaultReferenceImages(): ReferenceImage[] {
  // Create a simple gradient reference image
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (!ctx) return [];

  // Create a simple radial gradient
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, '#000000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const imageData = canvas.toDataURL();

  return [{
    id: 'default-gradient',
    name: 'Default Gradient',
    imageData,
    gridSizeX: size,
    gridSizeY: size,
  }];
}