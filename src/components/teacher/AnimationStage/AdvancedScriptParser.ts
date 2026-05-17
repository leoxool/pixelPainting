// Advanced Script Parser - Extended DSL for camera, lights, movement
import { ScriptCommand, ScriptCommandType, ParsedAnimationScript, Vector3 } from './types';

// Extended command types
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
  | 'MATERIAL_EMISSIVE';

export interface ExtendedScriptCommand {
  type: ExtendedCommandType;
  time: number;
  params: Record<string, unknown>;
}

export interface ExtendedParsedScript extends Omit<ParsedAnimationScript, 'commands'> {
  commands: ExtendedScriptCommand[];
}

const parseVector = (str: string): Vector3 => {
  const parts = str.split(',').map(p => parseFloat(p.trim()));
  return {
    x: parts[0] || 0,
    y: parts[1] || 0,
    z: parts[2] || 0,
  };
};

export function parseExtendedScript(scriptText: string): ExtendedParsedScript {
  const lines = scriptText.split('\n');
  const commands: ExtendedScriptCommand[] = [];
  const markers = new Map<string, number>();
  let duration = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const command = parseExtendedLine(trimmed);
    if (command) {
      commands.push(command);

      const endTime = command.time + (command.params.duration as number || 0);
      if (endTime > duration) {
        duration = endTime;
      }

      if (command.type === 'MARKER') {
        markers.set(command.params.name as string, command.time);
      }
    }
  }

  return { commands, duration, markers };
}

function parseExtendedLine(line: string): ExtendedScriptCommand | null {
  // CAMERA_FOLLOW: CAMERA_FOLLOW target: brush_50 offset: {0, 2, 5} lookAhead: 3 time: 0
  const followMatch = line.match(
    /^CAMERA_FOLLOW\s+target:\s*(\S+)\s+offset:\s*\{([^}]+)\}\s+lookAhead:\s*([\d.]+)\s+time:\s*([\d.]+)/i
  );
  if (followMatch) {
    return {
      type: 'CAMERA_FOLLOW',
      time: parseFloat(followMatch[4]),
      params: {
        target: followMatch[1],
        offset: parseVector(followMatch[2]),
        lookAhead: parseFloat(followMatch[3]),
      },
    };
  }

  // CAMERA_MODE: CAMERA_MODE mode: follow|orbit|fixed time: 0
  const modeMatch = line.match(/^CAMERA_MODE\s+mode:\s*(\w+)\s+time:\s*([\d.]+)/i);
  if (modeMatch) {
    return {
      type: 'CAMERA_MODE',
      time: parseFloat(modeMatch[2]),
      params: {
        mode: modeMatch[1],
      },
    };
  }

  // CAMERA_ORBIT: CAMERA_ORBIT radius: 1000 speed: 0.1 height: 300 time: 0
  const orbitMatch = line.match(/^CAMERA_ORBIT\s+radius:\s*([\d.]+)\s+speed:\s*([\d.]+)\s+height:\s*([\d.]+)\s+time:\s*([\d.]+)/i);
  if (orbitMatch) {
    return {
      type: 'CAMERA_ORBIT',
      time: parseFloat(orbitMatch[4]),
      params: {
        radius: parseFloat(orbitMatch[1]),
        speed: parseFloat(orbitMatch[2]),
        height: parseFloat(orbitMatch[3]),
      },
    };
  }

  // LIGHT_INTENSITY: LIGHT_INTENSITY type: ambient|point|directional value: 0.5 time: 0 duration: 2
  const intensityMatch = line.match(
    /^LIGHT_INTENSITY\s+type:\s*(\w+)\s+value:\s*([\d.]+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (intensityMatch) {
    return {
      type: 'LIGHT_INTENSITY',
      time: parseFloat(intensityMatch[3]),
      params: {
        lightType: intensityMatch[1],
        value: parseFloat(intensityMatch[2]),
        duration: parseFloat(intensityMatch[5] || '1'),
      },
    };
  }

  // LIGHT_COLOR: LIGHT_COLOR type: ambient|point|directional color: #ffffff time: 0 duration: 2
  const colorMatch = line.match(
    /^LIGHT_COLOR\s+type:\s*(\w+)\s+color:\s*(\S+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (colorMatch) {
    return {
      type: 'LIGHT_COLOR',
      time: parseFloat(colorMatch[3]),
      params: {
        lightType: colorMatch[1],
        color: colorMatch[2],
        duration: parseFloat(colorMatch[5] || '1'),
      },
    };
  }

  // LIGHT_POSITION (for point lights): LIGHT_POSITION index: 0 position: {1, 2, 3} time: 0 duration: 2
  const lightPosMatch = line.match(
    /^LIGHT_POSITION\s+index:\s*(\d+)\s+position:\s*\{([^}]+)\}\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (lightPosMatch) {
    return {
      type: 'LIGHT_POSITION',
      time: parseFloat(lightPosMatch[3]),
      params: {
        index: parseInt(lightPosMatch[1]),
        position: parseVector(lightPosMatch[2]),
        duration: parseFloat(lightPosMatch[5] || '1'),
      },
    };
  }

  // FORMATION: FORMATION type: grid|circle|line|scatter spacing: 50 time: 0 duration: 3
  // REFERENCE_FORM: FORMATION type: reference index: 0 time: 0 duration: 3 (聚合到参考图)
  const formationMatch = line.match(
    /^FORMATION\s+type:\s*(\w+)\s+spacing:\s*([\d.]+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (formationMatch) {
    const formationType = formationMatch[1].toLowerCase();
    const isReference = formationType === 'reference' || formationType === 'ref';

    if (isReference) {
      // REFERENCE_FORM: 聚合到参考图 - use index instead of spacing
      const refIndexMatch = line.match(/index:\s*(\d+)/i);
      const refIndex = refIndexMatch ? parseInt(refIndexMatch[1]) : 0;
      return {
        type: 'FORMATION',
        time: parseFloat(formationMatch[3]),
        params: {
          formationType: 'reference',
          refIndex,
          duration: parseFloat(formationMatch[5] || '3'),
        },
      };
    }

    return {
      type: 'FORMATION',
      time: parseFloat(formationMatch[3]),
      params: {
        formationType: formationMatch[1],
        spacing: parseFloat(formationMatch[2]),
        duration: parseFloat(formationMatch[5] || '3'),
      },
    };
  }

  // Also handle FORMATION type: reference without spacing (different syntax)
  const refFormationMatch = line.match(
    /^FORMATION\s+type:\s*(reference|ref)\s+index:\s*(\d+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (refFormationMatch) {
    return {
      type: 'FORMATION',
      time: parseFloat(refFormationMatch[3]),
      params: {
        formationType: 'reference',
        refIndex: parseInt(refFormationMatch[2]),
        duration: parseFloat(refFormationMatch[5] || '3'),
      },
    };
  }

  // SCATTER: SCATTER radius: 500 time: 0 duration: 1.5
  const scatterMatch = line.match(
    /^SCATTER\s+radius:\s*([\d.]+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (scatterMatch) {
    return {
      type: 'SCATTER',
      time: parseFloat(scatterMatch[2]),
      params: {
        radius: parseFloat(scatterMatch[1]),
        duration: parseFloat(scatterMatch[3] || '1.5'),
      },
    };
  }

  // DOF_FOCUS: DOF_FOCUS distance: 0.5 time: 0 duration: 1
  const dofFocusMatch = line.match(
    /^DOF_FOCUS\s+distance:\s*([\d.]+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (dofFocusMatch) {
    return {
      type: 'DOF_FOCUS',
      time: parseFloat(dofFocusMatch[2]),
      params: {
        distance: parseFloat(dofFocusMatch[1]),
        duration: parseFloat(dofFocusMatch[3] || '1'),
      },
    };
  }

  // DOF_BLUR: DOF_BLUR amount: 0.5 time: 0 duration: 1
  const dofBlurMatch = line.match(
    /^DOF_BLUR\s+amount:\s*([\d.]+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (dofBlurMatch) {
    return {
      type: 'DOF_BLUR',
      time: parseFloat(dofBlurMatch[2]),
      params: {
        amount: parseFloat(dofBlurMatch[1]),
        duration: parseFloat(dofBlurMatch[3] || '1'),
      },
    };
  }

  // VIGNETTE: VIGNETTE darkness: 1.2 offset: 1.0 time: 0 duration: 1
  const vignetteMatch = line.match(
    /^VIGNETTE\s+darkness:\s*([\d.]+)\s+offset:\s*([\d.]+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (vignetteMatch) {
    return {
      type: 'VIGNETTE',
      time: parseFloat(vignetteMatch[3]),
      params: {
        darkness: parseFloat(vignetteMatch[1]),
        offset: parseFloat(vignetteMatch[2]),
        duration: parseFloat(vignetteMatch[4] || '1'),
      },
    };
  }

  // MATERIAL_OPACITY: MATERIAL_OPACITY level: 0 opacity: 0.5 time: 0 duration: 1
  const matOpacityMatch = line.match(
    /^MATERIAL_OPACITY\s+level:\s*(\d+)\s+opacity:\s*([\d.]+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (matOpacityMatch) {
    return {
      type: 'MATERIAL_OPACITY',
      time: parseFloat(matOpacityMatch[3]),
      params: {
        level: parseInt(matOpacityMatch[1]),
        opacity: parseFloat(matOpacityMatch[2]),
        duration: parseFloat(matOpacityMatch[4] || '1'),
      },
    };
  }

  // MATERIAL_EMISSIVE: MATERIAL_EMISSIVE level: 0 intensity: 0.5 time: 0 duration: 1
  const matEmissiveMatch = line.match(
    /^MATERIAL_EMISSIVE\s+level:\s*(\d+)\s+intensity:\s*([\d.]+)\s+time:\s*([\d.]+)(\s+duration:\s*([\d.]+))?/i
  );
  if (matEmissiveMatch) {
    return {
      type: 'MATERIAL_EMISSIVE',
      time: parseFloat(matEmissiveMatch[3]),
      params: {
        level: parseInt(matEmissiveMatch[1]),
        intensity: parseFloat(matEmissiveMatch[2]),
        duration: parseFloat(matEmissiveMatch[4] || '1'),
      },
    };
  }

  // Fall back to original parser for basic commands
  return parseBasicLine(line);
}

// Original parser for backwards compatibility
function parseBasicLine(line: string): ExtendedScriptCommand | null {
  // CAMERA command
  const cameraMatch = line.match(
    /^CAMERA\s+position:\s*\{([^}]+)\}\s+lookAt:\s*\{([^}]+)\}(\s+time:\s*([\d.]+))?(\s+transition:\s*(\w+))?/i
  );
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

  // CAMERA_ZOOM
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

  // BRUSH_FLIGHT
  const brushMatch = line.match(
    /^BRUSH_FLIGHT(\s+duration:\s*([\d.]+))?(\s+scatter:\s*([\d.]+))?(\s+time:\s*([\d.]+))?(\s+direction:\s*(\w+))?/i
  );
  if (brushMatch) {
    return {
      type: 'BRUSH_FLIGHT',
      time: parseFloat(brushMatch[6] || '0'),
      params: {
        duration: parseFloat(brushMatch[2] || '3'),
        scatter: parseFloat(brushMatch[4] || '500'),
        direction: brushMatch[7] || 'left',
      },
    };
  }

  // REFERENCE
  const refMatch = line.match(/^REFERENCE\s+name:\s*"([^"]+)"(\s+time:\s*([\d.]+))?/i);
  if (refMatch) {
    return {
      type: 'REFERENCE_CHANGE',
      time: parseFloat(refMatch[3] || '0'),
      params: { name: refMatch[1] },
    };
  }

  // MUSIC
  const musicMatch = line.match(/^MUSIC\s+url:\s*"([^"]+)"(\s+time:\s*([\d.]+))?/i);
  if (musicMatch) {
    return {
      type: 'MUSIC_SYNC',
      time: parseFloat(musicMatch[3] || '0'),
      params: { url: musicMatch[1] },
    };
  }

  // TRANSITION
  const transMatch = line.match(/^TRANSITION\s+type:\s*(\w+)(\s+duration:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i);
  if (transMatch) {
    return {
      type: 'TRANSITION',
      time: parseFloat(transMatch[5] || '0'),
      params: {
        type: transMatch[1],
        duration: parseFloat(transMatch[3] || '1'),
      },
    };
  }

  // MARKER
  const markerMatch = line.match(/^MARKER\s+name:\s*"([^"]+)"(\s+time:\s*([\d.]+))?/i);
  if (markerMatch) {
    return {
      type: 'MARKER',
      time: parseFloat(markerMatch[3] || '0'),
      params: { name: markerMatch[1] },
    };
  }

  // WAIT
  const waitMatch = line.match(/^WAIT\s+duration:\s*([\d.]+)(\s+time:\s*([\d.]+))?/i);
  if (waitMatch) {
    return {
      type: 'WAIT',
      time: parseFloat(waitMatch[3] || '0'),
      params: { duration: parseFloat(waitMatch[1]) },
    };
  }

  return null;
}

// Generate sample extended script
export function generateExtendedScript(): string {
  return `# Advanced Animation Script
# Camera commands
CAMERA position: {0, 0, 1000} lookAt: {0, 0, 0} time: 0 transition: ease-in-out
CAMERA_ZOOM fov: 60 time: 0 duration: 2
CAMERA_MODE mode: follow time: 5
CAMERA_FOLLOW target: brush_50 offset: {0, 2, 5} lookAhead: 3 time: 5

# Light commands
LIGHT_INTENSITY type: ambient value: 0.3 time: 0 duration: 1
LIGHT_INTENSITY type: directional value: 0.8 time: 2 duration: 1
LIGHT_COLOR type: point color: #ffaa00 time: 3 duration: 2

# Brush movement
BRUSH_FLIGHT duration: 3 scatter: 800 time: 0 direction: left
FORMATION type: circle spacing: 50 time: 5 duration: 3
SCATTER radius: 500 time: 10 duration: 1.5

# Effects
DOF_FOCUS distance: 0.5 time: 0 duration: 1
DOF_BLUR amount: 0.3 time: 2 duration: 1
VIGNETTE darkness: 1.2 offset: 1.0 time: 0 duration: 1

# Material
MATERIAL_OPACITY level: 0 opacity: 0.5 time: 0 duration: 1
MATERIAL_EMISSIVE level: 0 intensity: 0.2 time: 5 duration: 2

# Music and sync
MUSIC url: "./music.mp3" time: 0
MARKER name: "chorus" time: 30
TRANSITION type: fade duration: 2 time: 45
`;
}

// Hook to use extended script parser
export function useAdvancedScriptParser() {
  const parse = (scriptText: string) => {
    return parseExtendedScript(scriptText);
  };

  const generateSample = () => {
    return generateExtendedScript();
  };

  return { parse, generateSample };
}
