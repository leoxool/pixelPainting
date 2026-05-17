'use client';

import { useCallback, useMemo } from 'react';
import { ScriptCommand, ParsedAnimationScript, ReferenceImage } from './types';

// Simple animation script DSL parser
// Format:
//   # comments
//   CAMERA position: {x, y, z} lookAt: {x, y, z} time: 0-5
//   BRUSH_FLIGHT duration: 3 scatter: 500 time: 0
//   REFERENCE name: "image1" time: 0
//   MUSIC url: "./music.mp3" time: 0
//   TRANSITION type: fade duration: 1 time: 5
//   MARKER name: "chorus" time: 30
//   WAIT duration: 2 time: 10

interface ParseOptions {
  defaultTransitionDuration?: number;
  defaultBrushFlightDuration?: number;
}

export function parseAnimationScript(
  scriptText: string,
  options?: ParseOptions
): ParsedAnimationScript {
  const lines = scriptText.split('\n');
  const commands: ScriptCommand[] = [];
  const markers = new Map<string, number>();

  let duration = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Parse command
    const command = parseLine(trimmed, options);
    if (command) {
      commands.push(command);

      // Track duration
      const endTime = command.time + (command.params.duration as number || 0);
      if (endTime > duration) {
        duration = endTime;
      }

      // Track markers
      if (command.type === 'MARKER') {
        markers.set(command.params.name as string, command.time);
      }
    }
  }

  return { commands, duration, markers };
}

function parseLine(line: string, options?: ParseOptions): ScriptCommand | null {
  // CAMERA command: CAMERA position: {0, 0, 10} lookAt: {0, 0, 0} time: 0 transition: ease-in-out
  const cameraMatch = line.match(/^CAMERA\s+position:\s*\{([^}]+)\}\s+lookAt:\s*\{([^}]+)\}(\s+time:\s*([\d.]+))?(\s+transition:\s*(\w+))?/i);
  if (cameraMatch) {
    return {
      type: 'CAMERA_MOVE',
      time: parseFloat(cameraMatch[4] || '0'),
      params: {
        position: parseVector(cameraMatch[1]),
        lookAt: parseVector(cameraMatch[2]),
        transition: cameraMatch[6] || 'ease-in-out',
      },
    };
  }

  // BRUSH_FLIGHT command
  const brushMatch = line.match(/^BRUSH_FLIGHT(\s+duration:\s*([\d.]+))?(\s+scatter:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i);
  if (brushMatch) {
    return {
      type: 'BRUSH_FLIGHT',
      time: parseFloat(brushMatch[6] || '0'),
      params: {
        duration: parseFloat(brushMatch[2] || String(options?.defaultBrushFlightDuration || 3)),
        scatter: parseFloat(brushMatch[4] || '500'),
      },
    };
  }

  // REFERENCE command: REFERENCE name: "image1" time: 0
  const refMatch = line.match(/^REFERENCE\s+name:\s*"([^"]+)"(\s+time:\s*([\d.]+))?/i);
  if (refMatch) {
    return {
      type: 'REFERENCE_CHANGE',
      time: parseFloat(refMatch[3] || '0'),
      params: { name: refMatch[1] },
    };
  }

  // MUSIC command: MUSIC url: "./music.mp3" time: 0
  const musicMatch = line.match(/^MUSIC\s+url:\s*"([^"]+)"(\s+time:\s*([\d.]+))?/i);
  if (musicMatch) {
    return {
      type: 'MUSIC_SYNC',
      time: parseFloat(musicMatch[3] || '0'),
      params: { url: musicMatch[1] },
    };
  }

  // TRANSITION command: TRANSITION type: fade duration: 1 time: 5
  const transMatch = line.match(/^TRANSITION\s+type:\s*(\w+)(\s+duration:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i);
  if (transMatch) {
    return {
      type: 'TRANSITION',
      time: parseFloat(transMatch[5] || '0'),
      params: {
        type: transMatch[1],
        duration: parseFloat(transMatch[3] || String(options?.defaultTransitionDuration || 1)),
      },
    };
  }

  // MARKER command: MARKER name: "chorus" time: 30
  const markerMatch = line.match(/^MARKER\s+name:\s*"([^"]+)"(\s+time:\s*([\d.]+))?/i);
  if (markerMatch) {
    return {
      type: 'MARKER',
      time: parseFloat(markerMatch[3] || '0'),
      params: { name: markerMatch[1] },
    };
  }

  // WAIT command: WAIT duration: 2 time: 10
  const waitMatch = line.match(/^WAIT\s+duration:\s*([\d.]+)(\s+time:\s*([\d.]+))?/i);
  if (waitMatch) {
    return {
      type: 'WAIT',
      time: parseFloat(waitMatch[3] || '0'),
      params: { duration: parseFloat(waitMatch[1]) },
    };
  }

  // CAMERA_ZOOM command: CAMERA_ZOOM fov: 50 time: 0 duration: 2
  const zoomMatch = line.match(/^CAMERA_ZOOM\s+fov:\s*([\d.]+)(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i);
  if (zoomMatch) {
    return {
      type: 'CAMERA_ZOOM',
      time: parseFloat(zoomMatch[3] || '0'),
      params: {
        fov: parseFloat(zoomMatch[1]),
        duration: parseFloat(zoomMatch[5] || '2'),
      },
    };
  }

  return null;
}

function parseVector(str: string): { x: number; y: number; z: number } {
  const parts = str.split(',').map(p => parseFloat(p.trim()));
  return {
    x: parts[0] || 0,
    y: parts[1] || 0,
    z: parts[2] || 0,
  };
}

// Generate sample script
export function generateSampleScript(): string {
  return `# Animation Script for Brush Mosaic
# Format: COMMAND param: value time: seconds

# Initial camera position
CAMERA position: {0, 0, 1000} lookAt: {0, 0, 0} time: 0 transition: ease-in-out

# Brushes fly in from scattered positions
BRUSH_FLIGHT duration: 3 scatter: 800 time: 0

# Reference image 1
REFERENCE name: "reference1" time: 0

# Camera moves to bird's eye view
CAMERA position: {0, 500, 2000} lookAt: {0, 0, 0} time: 5 transition: ease-in-out

# Music starts
MUSIC url: "./music.mp3" time: 0

# Transition to next scene
TRANSITION type: fade duration: 2 time: 10

# Mark a key moment
MARKER name: "chorus" time: 30

# Camera zoom effect
CAMERA_ZOOM fov: 30 time: 35 duration: 3

# Wait for dramatic effect
WAIT duration: 2 time: 40

# Transition out
TRANSITION type: dissolve duration: 3 time: 45
`;
}

// Convert parsed script to animation clips
export function scriptToAnimationClips(
  script: ParsedAnimationScript,
  referenceImages: ReferenceImage[]
): import('./types').AnimationClip[] {
  const clips: import('./types').AnimationClip[] = [];

  // Group commands by reference changes
  let currentClip: import('./types').AnimationClip | null = null;
  let clipIndex = 0;

  script.commands.forEach((command) => {
    if (command.type === 'REFERENCE_CHANGE') {
      // Start new clip
      if (currentClip) {
        clips.push(currentClip);
      }

      const refImage = referenceImages.find(r => r.name === command.params.name as string);
      currentClip = {
        id: `clip-${clipIndex++}`,
        name: `Clip ${clipIndex}`,
        duration: 5, // Default duration, will be calculated
        referenceImageId: refImage?.id || '',
        cameraKeyFrames: [],
        startDelay: command.time,
      };
    }

    if (command.type === 'CAMERA_MOVE' && currentClip) {
      currentClip.cameraKeyFrames.push({
        time: command.time - (currentClip.startDelay || 0),
        position: (command.params.position as { x: number; y: number; z: number }),
        lookAt: (command.params.lookAt as { x: number; y: number; z: number }),
        transition: (command.params.transition as 'ease-in-out' | 'linear' | 'bounce' | 'elastic') || 'ease-in-out',
      });
    }
  });

  // Add last clip
  if (currentClip) {
    clips.push(currentClip);
  }

  return clips;
}

// Hook to use script parser
export function useScriptParser() {
  const parse = useCallback((scriptText: string, options?: ParseOptions) => {
    return parseAnimationScript(scriptText, options);
  }, []);

  const generateSample = useCallback(() => {
    return generateSampleScript();
  }, []);

  const toClips = useCallback((
    script: ParsedAnimationScript,
    referenceImages: ReferenceImage[]
  ) => {
    return scriptToAnimationClips(script, referenceImages);
  }, []);

  return { parse, generateSample, toClips };
}