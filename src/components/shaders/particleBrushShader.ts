// Particle-based Brush Mosaic Shaders
// Each brush stroke is rendered as an independent instance that can overlap

export const particleVertexShader = `
  attribute float aLevel;           // Brush level (0-9)
  attribute vec2 aOffset;          // Position offset in grid (0-1 range)
  attribute float aRotation;       // Rotation angle in radians
  attribute float aSize;           // Size multiplier
  attribute float aFlip;           // Flip X (0 or 1)

  uniform sampler2D uBrushTextures[10];  // 10 brush textures
  uniform vec2 uGridSize;               // Grid dimensions
  uniform float uTextureSize;           // Brush texture size (e.g., 50)

  varying vec2 vUv;
  varying float vLevel;
  varying float vAlpha;

  void main() {
    vLevel = aLevel;
    vUv = uv;

    // Calculate instance position in world space
    // Each instance is centered at its grid cell + offset
    vec2 instancePos = aOffset * vec2(1.0, 1.0);

    // Scale the quad based on size attribute
    vec3 scaledPosition = position * aSize * uTextureSize;

    // Apply rotation around center
    float c = cos(aRotation);
    float s = sin(aRotation);
    vec2 rotated = vec2(
      scaledPosition.x * c - scaledPosition.y * s,
      scaledPosition.x * s + scaledPosition.y * c
    );

    // Apply flip
    float flipX = aFlip > 0.5 ? -1.0 : 1.0;

    // Final world position
    vec3 worldPos = vec3(rotated + instancePos * uTextureSize * uGridSize, 0.0);

    // View projection
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPos, 1.0);
  }
`;

export const particleFragmentShader = `
  precision highp float;

  uniform sampler2D uBrushTextures[10];
  uniform float uTextureSize;

  varying vec2 vUv;
  varying float vLevel;
  varying float vAlpha;

  // Sample brush texture using if-else chain
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
    int brushIdx = int(vLevel);
    vec4 brushColor = sampleBrush(brushIdx, vUv);

    // White background where brush is transparent
    vec3 baseColor = vec3(1.0);
    vec3 finalColor = mix(baseColor, brushColor.rgb, brushColor.a);

    gl_FragColor = vec4(finalColor, brushColor.a);
  }
`;
