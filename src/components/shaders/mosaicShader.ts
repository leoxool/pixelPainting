// Mosaic Fragment Shader
// Maps luminance of reference texture to student texture segments

export const mosaicVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const mosaicFragmentShader = `
  uniform sampler2D uRefTexture;        // Reference image (webcam/image)
  uniform sampler2D uStudentTextures[50]; // Array of student texture strips (max 50 students)
  uniform int uStudentCount;            // Number of active students
  uniform vec2 uGridSize;              // Grid dimensions (e.g., 150x100)
  uniform float uTime;

  varying vec2 vUv;

  // Calculate relative luminance (ITU BT.709)
  float getLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    // Sample reference texture at current UV
    vec4 refColor = texture2D(uRefTexture, vUv);

    // Calculate luminance of reference pixel
    float luminance = getLuminance(refColor.rgb);

    // Map luminance to 0.0 - 1.0 range for texture selection
    float textureIndex = luminance;

    // Determine which of the 10 segments to use (0-9)
    // Each segment represents a brightness level
    float segmentIndex = floor(textureIndex * 10.0);
    segmentIndex = clamp(segmentIndex, 0.0, 9.0);

    // Calculate UV within the selected segment
    // Each texture strip is 1000x100, divided into 10 segments of 100x100
    float segmentWidth = 1.0 / 10.0;
    float segmentStart = segmentIndex * segmentWidth;

    // Determine which student to use based on position
    // This creates a mosaic effect by distributing students across the grid
    int studentIndex = int(mod(floor(vUv.x * uGridSize.x) + floor(vUv.y * uGridSize.y), float(uStudentCount)));

    // Calculate local UV within the grid cell
    vec2 gridUV = fract(vUv * uGridSize);

    // Sample from the selected student's texture strip
    // Use the grid UV to sample within the chosen segment
    vec2 sampleUV = vec2(
      segmentStart + gridUV.x * segmentWidth,
      gridUV.y
    );

    // Get the student's texture
    vec4 studentColor = vec4(0.0);

    // Use luminance-based selection within the student's strip
    // The strip has 10 segments from dark to light
    float studentLuminance = getLuminance(texture2D(uStudentTextures[studentIndex], sampleUV).rgb);
    float studentSegment = floor(studentLuminance * 10.0);
    studentSegment = clamp(studentSegment, 0.0, 9.0);

    vec2 studentSampleUV = vec2(
      (studentSegment * segmentWidth) + (gridUV.x * segmentWidth),
      gridUV.y
    );

    studentColor = texture2D(uStudentTextures[studentIndex], studentSampleUV);

    // Output the original RGB color from student's art (no grayscale conversion)
    gl_FragColor = vec4(studentColor.rgb, 1.0);
  }
`;

// Simpler shader for testing - uses a single texture atlas
export const simpleMosaicFragmentShader = `
  uniform sampler2D uRefTexture;
  uniform sampler2D uAtlasTexture;
  uniform vec2 uGridSize;
  uniform float uAtlasColumns;

  varying vec2 vUv;

  float getLuminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    // Sample reference texture
    vec4 refColor = texture2D(uRefTexture, vUv);
    float luminance = getLuminance(refColor.rgb);

    // Map luminance to texture segment (0-9)
    float segmentIndex = floor(luminance * 10.0);
    segmentIndex = clamp(segmentIndex, 0.0, 9.0);

    // Calculate grid cell position
    vec2 gridUV = fract(vUv * uGridSize);

    // Calculate segment UV in atlas
    // Atlas is organized as 10 segments horizontally
    float segmentWidth = 1.0 / 10.0;
    vec2 atlasUV = vec2(
      (segmentIndex * segmentWidth) + (gridUV.x * segmentWidth),
      gridUV.y
    );

    // Sample from atlas
    vec4 atlasColor = texture2D(uAtlasTexture, atlasUV);

    gl_FragColor = vec4(atlasColor.rgb, 1.0);
  }
`;
