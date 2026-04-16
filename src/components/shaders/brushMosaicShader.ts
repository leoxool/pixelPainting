// Brush Mosaic Vertex Shader
import * as THREE from 'three';

export const brushMosaicVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Brush Mosaic Fragment Shader
// Features:
// - Luminance-based brush selection (0-9 levels)
// - Size jitter: each brush stroke in a cell varies in size
// - Rotation jitter: each brush stroke in a cell varies in rotation
// - Random flip
export const brushMosaicFragmentShader = `
  precision highp float;

  uniform sampler2D uRefTexture;        // Reference image (webcam/image)
  uniform sampler2D uBrushTextures[10];  // 10 brush layer textures
  uniform vec2 uGridSize;               // Grid dimensions (e.g., 20x20)
  uniform float uSizeJitter;            // Size jitter amount (0.0 - 1.0)
  uniform float uRotationJitter;        // Rotation jitter in degrees (0.0 - 90.0)
  uniform float uEnableFlip;            // Enable random flip (0.0 or 1.0)

  varying vec2 vUv;

  // Hash function for deterministic randomness
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // 2D rotation matrix
  mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  // Sample brush texture using if-else chain (GLSL requires constant index)
  vec4 sampleBrush(int idx, vec2 uv) {
    if (idx == 0) return texture2D(uBrushTextures[0], uv);
    if (idx == 1) return texture2D(uBrushTextures[1], uv);
    if (idx == 2) return texture2D(uBrushTextures[2], uv);
    if (idx == 3) return texture2D(uBrushTextures[3], uv);
    if (idx == 4) return texture2D(uBrushTextures[4], uv);
    if (idx == 5) return texture2D(uBrushTextures[5], uv);
    if (idx == 6) return texture2D(uBrushTextures[6], uv);
    if (idx == 7) return texture2D(uBrushTextures[7], uv);
    if (idx == 8) return texture2D(uBrushTextures[8], uv);
    return texture2D(uBrushTextures[9], uv);
  }

  void main() {
    // Calculate which grid cell we're in
    vec2 gridCell = floor(vUv * uGridSize);
    vec2 gridUV = fract(vUv * uGridSize);

    // Random values based ONLY on cell position (deterministic, not time-varying)
    float randSize = hash(gridCell);
    float randRot = hash(gridCell + vec2(37.3, 91.7));
    float randFlip = hash(gridCell + vec2(53.1, 17.9));

    // Random size factor: 1.0 = normal, smaller = smaller brush stroke
    // jitter=0 means no variation, jitter=1 means maximum variation (50%-150% size)
    float sizeFactor = 1.0 - uSizeJitter * 0.5 + randSize * uSizeJitter;

    // Random rotation angle: -maxRotation to +maxRotation
    float maxRotation = uRotationJitter * 3.14159 / 180.0; // Convert degrees to radians
    float rotAngle = (randRot - 0.5) * 2.0 * maxRotation;

    // Random flip (only if enabled)
    vec2 sampleUV = gridUV;
    if (uEnableFlip > 0.5 && randFlip > 0.5) {
      sampleUV.x = 1.0 - sampleUV.x;
    }

    // Apply rotation and size to the sample position within the cell
    // Center the UV
    vec2 centered = sampleUV - 0.5;
    // Apply rotation
    centered = rotate2d(rotAngle) * centered;
    // Apply size scaling
    centered = centered / max(0.1, sizeFactor);
    // Move back
    vec2 jitteredUV = centered + 0.5;

    // Sample reference texture to get luminance
    vec4 refColor = texture2D(uRefTexture, vUv);
    float luminance = dot(refColor.rgb, vec3(0.2126, 0.7152, 0.0722));

    // Map luminance to brush index (0-9)
    float brushFloat = luminance * 9.999; // 0.0 - 9.999 -> 0-9
    int brushIdx = int(clamp(brushFloat, 0.0, 9.0));

    // Sample the brush texture
    vec4 brushColor = sampleBrush(brushIdx, jitteredUV);

    // Use the brush alpha as mask
    float alpha = brushColor.a;

    // If brush is transparent, use white background
    vec3 baseColor = vec3(1.0);
    vec3 finalColor = mix(baseColor, brushColor.rgb, alpha);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Simpler shader without jitter for initial testing
export const simpleBrushMosaicFragmentShader = `
  precision highp float;

  uniform sampler2D uRefTexture;      // Reference texture (source canvas)
  uniform sampler2D uBrushTextures[10];
  uniform vec2 uGridSize;            // Grid dimensions (e.g., 20x20)
  uniform vec2 uSourceSize;          // Source image actual dimensions

  varying vec2 vUv;

  // Sample brush texture using if-else chain (GLSL requires constant index)
  vec4 sampleBrush(int idx, vec2 uv) {
    if (idx == 0) return texture2D(uBrushTextures[0], uv);
    if (idx == 1) return texture2D(uBrushTextures[1], uv);
    if (idx == 2) return texture2D(uBrushTextures[2], uv);
    if (idx == 3) return texture2D(uBrushTextures[3], uv);
    if (idx == 4) return texture2D(uBrushTextures[4], uv);
    if (idx == 5) return texture2D(uBrushTextures[5], uv);
    if (idx == 6) return texture2D(uBrushTextures[6], uv);
    if (idx == 7) return texture2D(uBrushTextures[7], uv);
    if (idx == 8) return texture2D(uBrushTextures[8], uv);
    return texture2D(uBrushTextures[9], uv);
  }

  void main() {
    // vUv is 0-1 over the output canvas
    // Calculate which grid cell we're in
    vec2 gridCell = floor(vUv * uGridSize);
    vec2 gridUV = fract(vUv * uGridSize);

    // Calculate UV in source image for luminance sampling
    // The source canvas might be larger than the grid, so we need to scale
    vec2 sourceUV = vUv; // Simple 1:1 mapping
    vec4 refColor = texture2D(uRefTexture, sourceUV);
    float luminance = dot(refColor.rgb, vec3(0.2126, 0.7152, 0.0722));

    // Map to brush index (0-9)
    int brushIdx = int(clamp(luminance * 9.999, 0.0, 9.0));

    // Sample brush texture using gridUV
    vec4 brushColor = sampleBrush(brushIdx, gridUV);

    // Mix with white background
    vec3 baseColor = vec3(1.0);
    vec3 finalColor = mix(baseColor, brushColor.rgb, brushColor.a);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
