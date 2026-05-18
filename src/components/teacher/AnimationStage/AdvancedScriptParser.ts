// Advanced Script Parser - Extended DSL for camera, lights, movement
import { ScriptCommand, ScriptCommandType, ParsedAnimationScript, Vector3, ExtendedCommandType } from './types';

export type { ExtendedCommandType };

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

  // SWIRL: SWIRL centerX: 500 centerY: 400 radius: 300 speed: 0.5 direction: cw time: 0 duration: 3
  const swirlMatch = line.match(
    /^SWIRL\s+centerX:\s*([\d.]+)\s+centerY:\s*([\d.]+)\s+radius:\s*([\d.]+)\s+speed:\s*([\d.]+)(\s+direction:\s*(\w+))?(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (swirlMatch) {
    return {
      type: 'SWIRL',
      time: parseFloat(swirlMatch[8] || '0'),
      params: {
        centerX: parseFloat(swirlMatch[1]),
        centerY: parseFloat(swirlMatch[2]),
        radius: parseFloat(swirlMatch[3]),
        speed: parseFloat(swirlMatch[4]),
        direction: swirlMatch[6] || 'cw',
        duration: parseFloat(swirlMatch[10] || '3'),
      },
    };
  }

  // AERIAL_DANCE: AERIAL_DANCE height: 100 frequency: 0.5 phase: 0 amplitude: 30 time: 0 duration: 3
  const aerialMatch = line.match(
    /^AERIAL_DANCE\s+height:\s*([\d.]+)\s+frequency:\s*([\d.]+)\s+phase:\s*([\d.]+)(\s+amplitude:\s*([\d.]+))?(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (aerialMatch) {
    return {
      type: 'AERIAL_DANCE',
      time: parseFloat(aerialMatch[7] || '0'),
      params: {
        height: parseFloat(aerialMatch[1]),
        frequency: parseFloat(aerialMatch[2]),
        phase: parseFloat(aerialMatch[3]),
        amplitude: parseFloat(aerialMatch[5] || '30'),
        duration: parseFloat(aerialMatch[9] || '3'),
      },
    };
  }

  // ORBIT_AXIS: ORBIT_AXIS axis: y radius: 200 speed: 0.3 heightAmplitude: 50 time: 0 duration: 3
  const orbitAxisMatch = line.match(
    /^ORBIT_AXIS\s+axis:\s*(\w+)\s+radius:\s*([\d.]+)\s+speed:\s*([\d.]+)(\s+heightAmplitude:\s*([\d.]+))?(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (orbitAxisMatch) {
    return {
      type: 'ORBIT_AXIS',
      time: parseFloat(orbitAxisMatch[7] || '0'),
      params: {
        axis: orbitAxisMatch[1],
        radius: parseFloat(orbitAxisMatch[2]),
        speed: parseFloat(orbitAxisMatch[3]),
        heightAmplitude: parseFloat(orbitAxisMatch[5] || '50'),
        duration: parseFloat(orbitAxisMatch[9] || '3'),
      },
    };
  }

  // BEZIER_FLIGHT: BEZIER_FLIGHT cp1: {0,0,0} cp2: {500,500,100} cp3: {1000,0,0} time: 0 duration: 3
  const bezierMatch = line.match(
    /^BEZIER_FLIGHT\s+cp1:\s*\{([^}]+)\}\s+cp2:\s*\{([^}]+)\}\s+cp3:\s*\{([^}]+)\}(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (bezierMatch) {
    return {
      type: 'BEZIER_FLIGHT',
      time: parseFloat(bezierMatch[5] || '0'),
      params: {
        cp1: parseVector(bezierMatch[1]),
        cp2: parseVector(bezierMatch[2]),
        cp3: parseVector(bezierMatch[3]),
        duration: parseFloat(bezierMatch[7] || '3'),
      },
    };
  }

  // WAVE: WAVE direction: y amplitude: 50 frequency: 2 speed: 0.5 time: 0 duration: 3
  const waveMatch = line.match(
    /^WAVE\s+direction:\s*(\w+)\s+amplitude:\s*([\d.]+)\s+frequency:\s*([\d.]+)(\s+speed:\s*([\d.]+))?(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (waveMatch) {
    return {
      type: 'WAVE',
      time: parseFloat(waveMatch[7] || '0'),
      params: {
        direction: waveMatch[1],
        amplitude: parseFloat(waveMatch[2]),
        frequency: parseFloat(waveMatch[3]),
        speed: parseFloat(waveMatch[5] || '0.5'),
        duration: parseFloat(waveMatch[9] || '3'),
      },
    };
  }

  // OSCILLATE: OSCILLATE centerX: 500 centerY: 400 amplitudeX: 100 amplitudeY: 50 frequency: 0.5 phase: 0 time: 0 duration: 3
  const oscillateMatch = line.match(
    /^OSCILLATE\s+centerX:\s*([\d.]+)\s+centerY:\s*([\d.]+)\s+amplitudeX:\s*([\d.]+)\s+amplitudeY:\s*([\d.]+)\s+frequency:\s*([\d.]+)(\s+phase:\s*([\d.]+))?(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (oscillateMatch) {
    return {
      type: 'OSCILLATE',
      time: parseFloat(oscillateMatch[8] || '0'),
      params: {
        centerX: parseFloat(oscillateMatch[1]),
        centerY: parseFloat(oscillateMatch[2]),
        amplitudeX: parseFloat(oscillateMatch[3]),
        amplitudeY: parseFloat(oscillateMatch[4]),
        frequency: parseFloat(oscillateMatch[5]),
        phase: parseFloat(oscillateMatch[7] || '0'),
        duration: parseFloat(oscillateMatch[10] || '3'),
      },
    };
  }

  // PULSE: PULSE centerX: 500 centerY: 400 minScale: 0.5 maxScale: 1.5 speed: 1 time: 0 duration: 3
  const pulseMatch = line.match(
    /^PULSE\s+centerX:\s*([\d.]+)\s+centerY:\s*([\d.]+)\s+minScale:\s*([\d.]+)\s+maxScale:\s*([\d.]+)\s+speed:\s*([\d.]+)(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (pulseMatch) {
    return {
      type: 'PULSE',
      time: parseFloat(pulseMatch[7] || '0'),
      params: {
        centerX: parseFloat(pulseMatch[1]),
        centerY: parseFloat(pulseMatch[2]),
        minScale: parseFloat(pulseMatch[3]),
        maxScale: parseFloat(pulseMatch[4]),
        speed: parseFloat(pulseMatch[5]),
        duration: parseFloat(pulseMatch[9] || '3'),
      },
    };
  }

  // ARRAY_ROTATE: ARRAY_ROTATE centerX: 500 centerY: 400 speed: 30 direction: cw time: 0 duration: 3
  const arrayRotateMatch = line.match(
    /^ARRAY_ROTATE\s+centerX:\s*([\d.]+)\s+centerY:\s*([\d.]+)\s+speed:\s*([\d.]+)(\s+direction:\s*(\w+))?(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (arrayRotateMatch) {
    return {
      type: 'ARRAY_ROTATE',
      time: parseFloat(arrayRotateMatch[7] || '0'),
      params: {
        centerX: parseFloat(arrayRotateMatch[1]),
        centerY: parseFloat(arrayRotateMatch[2]),
        speed: parseFloat(arrayRotateMatch[3]),
        direction: arrayRotateMatch[5] || 'cw',
        duration: parseFloat(arrayRotateMatch[9] || '3'),
      },
    };
  }

  // ARRAY_SCALE: ARRAY_SCALE centerX: 500 centerY: 400 minScale: 0.5 maxScale: 1.5 speed: 0.5 time: 0 duration: 3
  const arrayScaleMatch = line.match(
    /^ARRAY_SCALE\s+centerX:\s*([\d.]+)\s+centerY:\s*([\d.]+)\s+minScale:\s*([\d.]+)\s+maxScale:\s*([\d.]+)\s+speed:\s*([\d.]+)(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (arrayScaleMatch) {
    return {
      type: 'ARRAY_SCALE',
      time: parseFloat(arrayScaleMatch[7] || '0'),
      params: {
        centerX: parseFloat(arrayScaleMatch[1]),
        centerY: parseFloat(arrayScaleMatch[2]),
        minScale: parseFloat(arrayScaleMatch[3]),
        maxScale: parseFloat(arrayScaleMatch[4]),
        speed: parseFloat(arrayScaleMatch[5]),
        duration: parseFloat(arrayScaleMatch[9] || '3'),
      },
    };
  }

  // ORBIT_BRUSH: ORBIT_BRUSH brushId: brush_50 radius: 200 speed: 0.1 height: 50 time: 0
  const orbitBrushMatch = line.match(
    /^ORBIT_BRUSH\s+brushId:\s*(\S+)\s+radius:\s*([\d.]+)\s+speed:\s*([\d.]+)(\s+height:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i
  );
  if (orbitBrushMatch) {
    return {
      type: 'ORBIT_BRUSH',
      time: parseFloat(orbitBrushMatch[7] || '0'),
      params: {
        brushId: orbitBrushMatch[1],
        radius: parseFloat(orbitBrushMatch[2]),
        speed: parseFloat(orbitBrushMatch[3]),
        height: parseFloat(orbitBrushMatch[5] || '0'),
      },
    };
  }

  // RANDOM_FOLLOW: RANDOM_FOLLOW speed: 0.5 radius: 300 time: 0 duration: 5
  const randomFollowMatch = line.match(
    /^RANDOM_FOLLOW\s+speed:\s*([\d.]+)(\s+radius:\s*([\d.]+))?(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (randomFollowMatch) {
    return {
      type: 'RANDOM_FOLLOW',
      time: parseFloat(randomFollowMatch[5] || '0'),
      params: {
        speed: parseFloat(randomFollowMatch[1]),
        radius: parseFloat(randomFollowMatch[3] || '300'),
        duration: parseFloat(randomFollowMatch[7] || '5'),
      },
    };
  }

  // CAMERA_SHAKE: CAMERA_SHAKE intensity: 10 frequency: 5 duration: 0.5 time: 0
  const cameraShakeMatch = line.match(
    /^CAMERA_SHAKE\s+intensity:\s*([\d.]+)\s+frequency:\s*([\d.]+)(\s+duration:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i
  );
  if (cameraShakeMatch) {
    return {
      type: 'CAMERA_SHAKE',
      time: parseFloat(cameraShakeMatch[6] || '0'),
      params: {
        intensity: parseFloat(cameraShakeMatch[1]),
        frequency: parseFloat(cameraShakeMatch[2]),
        duration: parseFloat(cameraShakeMatch[4] || '0.5'),
      },
    };
  }

  // CAMERA_PATH: CAMERA_PATH points: [{0,0,1000},{500,500,800},{1000,0,1000}] time: 0 duration: 5
  const cameraPathMatch = line.match(
    /^CAMERA_PATH\s+points:\s*\[([^\]]+)\](\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (cameraPathMatch) {
    const pointsStr = cameraPathMatch[1];
    const points: Vector3[] = [];
    const pointMatches = pointsStr.match(/\{([^}]+)\}/g);
    if (pointMatches) {
      pointMatches.forEach(pm => {
        const inner = pm.slice(1, -1);
        points.push(parseVector(inner));
      });
    }
    return {
      type: 'CAMERA_PATH',
      time: parseFloat(cameraPathMatch[3] || '0'),
      params: {
        points,
        duration: parseFloat(cameraPathMatch[5] || '5'),
      },
    };
  }

  // BACKGROUND_COLOR: BACKGROUND_COLOR color: #1a1a2e time: 0 duration: 2
  const bgColorMatch = line.match(
    /^BACKGROUND_COLOR\s+color:\s*(\S+)(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (bgColorMatch) {
    return {
      type: 'BACKGROUND_COLOR',
      time: parseFloat(bgColorMatch[3] || '0'),
      params: {
        color: bgColorMatch[1],
        duration: parseFloat(bgColorMatch[5] || '2'),
      },
    };
  }

  // FOG: FOG near: 100 far: 1000 color: #1a1a2e time: 0 duration: 2
  const fogMatch = line.match(
    /^FOG\s+near:\s*([\d.]+)\s+far:\s*([\d.]+)\s+color:\s*(\S+)(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (fogMatch) {
    return {
      type: 'FOG',
      time: parseFloat(fogMatch[5] || '0'),
      params: {
        near: parseFloat(fogMatch[1]),
        far: parseFloat(fogMatch[2]),
        color: fogMatch[3],
        duration: parseFloat(fogMatch[7] || '2'),
      },
    };
  }

  // SPOT_LIGHT: SPOT_LIGHT position: {500,500,500} target: {0,0,0} intensity: 1 angle: 0.5 penumbra: 0.3 time: 0
  const spotLightMatch = line.match(
    /^SPOT_LIGHT\s+position:\s*\{([^}]+)\}\s+target:\s*\{([^}]+)\}\s+intensity:\s*([\d.]+)(\s+angle:\s*([\d.]+))?(\s+penumbra:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i
  );
  if (spotLightMatch) {
    return {
      type: 'SPOT_LIGHT',
      time: parseFloat(spotLightMatch[8] || '0'),
      params: {
        position: parseVector(spotLightMatch[1]),
        target: parseVector(spotLightMatch[2]),
        intensity: parseFloat(spotLightMatch[3]),
        angle: parseFloat(spotLightMatch[5] || '0.5'),
        penumbra: parseFloat(spotLightMatch[7] || '0.3'),
      },
    };
  }

  // EXPLOSION: EXPLOSION centerX: 500 centerY: 400 speed: 500 time: 0 duration: 1
  const explosionMatch = line.match(
    /^EXPLOSION\s+centerX:\s*([\d.]+)\s+centerY:\s*([\d.]+)(\s+centerZ:\s*([\d.]+))?\s+speed:\s*([\d.]+)(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (explosionMatch) {
    return {
      type: 'EXPLOSION',
      time: parseFloat(explosionMatch[7] || '0'),
      params: {
        centerX: parseFloat(explosionMatch[1]),
        centerY: parseFloat(explosionMatch[2]),
        centerZ: parseFloat(explosionMatch[4] || '0'),
        speed: parseFloat(explosionMatch[5]),
        duration: parseFloat(explosionMatch[9] || '1'),
      },
    };
  }

  // IMPLOSION: IMPLOSION centerX: 500 centerY: 400 speed: 500 time: 0 duration: 1
  const implosionMatch = line.match(
    /^IMPLOSION\s+centerX:\s*([\d.]+)\s+centerY:\s*([\d.]+)(\s+centerZ:\s*([\d.]+))?\s+speed:\s*([\d.]+)(\s+time:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?/i
  );
  if (implosionMatch) {
    return {
      type: 'IMPLOSION',
      time: parseFloat(implosionMatch[7] || '0'),
      params: {
        centerX: parseFloat(implosionMatch[1]),
        centerY: parseFloat(implosionMatch[2]),
        centerZ: parseFloat(implosionMatch[4] || '0'),
        speed: parseFloat(implosionMatch[5]),
        duration: parseFloat(implosionMatch[9] || '1'),
      },
    };
  }

  // COLOR_FLASH: COLOR_FLASH color: #ffffff duration: 0.5 intensity: 0.8 time: 0
  const colorFlashMatch = line.match(
    /^COLOR_FLASH\s+color:\s*(\S+)\s+duration:\s*([\d.]+)(\s+intensity:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i
  );
  if (colorFlashMatch) {
    return {
      type: 'COLOR_FLASH',
      time: parseFloat(colorFlashMatch[6] || '0'),
      params: {
        color: colorFlashMatch[1],
        duration: parseFloat(colorFlashMatch[2]),
        intensity: parseFloat(colorFlashMatch[4] || '1'),
      },
    };
  }

  // STROBE: STROBE color: #ffffff frequency: 10 duration: 2 time: 0
  const strobeMatch = line.match(
    /^STROBE\s+color:\s*(\S+)\s+frequency:\s*([\d.]+)(\s+duration:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i
  );
  if (strobeMatch) {
    return {
      type: 'STROBE',
      time: parseFloat(strobeMatch[6] || '0'),
      params: {
        color: strobeMatch[1],
        frequency: parseFloat(strobeMatch[2]),
        duration: parseFloat(strobeMatch[4] || '2'),
      },
    };
  }

  // RACK_FOCUS: RACK_FOCUS startDistance: 0.1 endDistance: 1 duration: 1 time: 0
  const rackFocusMatch = line.match(
    /^RACK_FOCUS\s+startDistance:\s*([\d.]+)\s+endDistance:\s*([\d.]+)(\s+duration:\s*([\d.]+))?(\s+time:\s*([\d.]+))?/i
  );
  if (rackFocusMatch) {
    return {
      type: 'RACK_FOCUS',
      time: parseFloat(rackFocusMatch[6] || '0'),
      params: {
        startDistance: parseFloat(rackFocusMatch[1]),
        endDistance: parseFloat(rackFocusMatch[2]),
        duration: parseFloat(rackFocusMatch[4] || '1'),
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

  // RANDOM_ROAM: RANDOM_ROAM speed: 0.4 amplitude: 150 [changeInterval: 2] [rotationSpeed: 1.5] [duration: 5] time: 0
  const roamMatch = line.match(/^RANDOM_ROAM\s+speed:\s*([\d.]+)\s+amplitude:\s*([\d.]+)(\s+changeInterval:\s*([\d.]+))?(\s+rotationSpeed:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?\s+time:\s*([\d.]+)/i);
  if (roamMatch) {
    return {
      type: 'RANDOM_ROAM',
      time: parseFloat(roamMatch[9] || '0'),
      params: {
        speed: parseFloat(roamMatch[1]),
        amplitude: parseFloat(roamMatch[2]),
        changeInterval: parseFloat(roamMatch[4] || '2'),
        rotationSpeed: parseFloat(roamMatch[6] || '1'),
        duration: parseFloat(roamMatch[8] || '5'),
      },
    };
  }

  // ROTATE_BRUSH: ROTATE_BRUSH axis: x|y|z speed: 90 [duration: 3] time: 0
  const rotateMatch = line.match(/^ROTATE_BRUSH\s+axis:\s*(\w+)\s+speed:\s*([\d.]+)(\s+duration:\s*([\d.]+))?\s+time:\s*([\d.]+)/i);
  if (rotateMatch) {
    return {
      type: 'ROTATE_BRUSH',
      time: parseFloat(rotateMatch[5] || '0'),
      params: {
        axis: rotateMatch[1],
        speed: parseFloat(rotateMatch[2]),
        duration: parseFloat(rotateMatch[4] || '3'),
      },
    };
  }

  // RANDOM_ORBIT_BRUSH: RANDOM_ORBIT_BRUSH radius: 200 speed: 0.3 [height: 50] [duration: 5] time: 0
  // speed: radians per second, completes one orbit (2π) in 2π/speed seconds
  const randomOrbitMatch = line.match(/^RANDOM_ORBIT_BRUSH\s+radius:\s*([\d.]+)\s+speed:\s*([\d.]+)(\s+height:\s*([\d.]+))?(\s+duration:\s*([\d.]+))?\s+time:\s*([\d.]+)/i);
  if (randomOrbitMatch) {
    return {
      type: 'RANDOM_ORBIT_BRUSH',
      time: parseFloat(randomOrbitMatch[7] || '0'),
      params: {
        radius: parseFloat(randomOrbitMatch[1]),
        speed: parseFloat(randomOrbitMatch[2]),
        height: parseFloat(randomOrbitMatch[4] || '50'),
        duration: parseFloat(randomOrbitMatch[6] || '5'),
      },
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
