// Post Processing - Depth of Field and visual effects
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { gsap } from 'gsap';

// Custom DOF-like blur shader for background
const BackgroundBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    focusDistance: { value: 0.5 },
    focalLength: { value: 50 },
    fStop: { value: 2.8 },
    blurAmount: { value: 0.5 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float blurAmount;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Simple radial blur based on distance from center
      vec2 center = vec2(0.5, 0.5);
      float dist = distance(vUv, center);

      // More blur at edges
      float blur = smoothstep(0.0, 0.7, dist) * blurAmount;

      // Sample neighboring pixels for blur effect
      vec4 sum = color;
      float samples = 8.0;
      for(float i = 0.0; i < 8.0; i++) {
        float angle = i * 0.785398; // PI/4
        vec2 offset = vec2(cos(angle), sin(angle)) * blur * 0.02;
        sum += texture2D(tDiffuse, vUv + offset);
      }
      color = sum / (samples + 1.0);

      gl_FragColor = color;
    }
  `,
};

// Vignette shader
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    darkness: { value: 1.2 },
    offset: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float darkness;
    uniform float offset;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      color.rgb *= smoothstep(0.0, 1.0, vignette * darkness);
      gl_FragColor = color;
    }
  `,
};

export interface PostProcessingOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  enabled?: boolean;
  dofEnabled?: boolean;
  vignetteEnabled?: boolean;
}

export class PostProcessing {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bokehPass: BokehPass | null = null;
  private blurPass: ShaderPass | null = null;
  private vignettePass: ShaderPass | null = null;
  private enabled: boolean = true;
  private dofEnabled: boolean = false;
  private vignetteEnabled: boolean = false;
  private focusTarget: THREE.Vector3 = new THREE.Vector3();
  private focalLength: number = 50;
  private fStop: number = 2.8;

  constructor(options: PostProcessingOptions) {
    this.composer = new EffectComposer(options.renderer);
    this.renderPass = new RenderPass(options.scene, options.camera);
    this.composer.addPass(this.renderPass);

    // Background blur (simpler DOF-like effect)
    this.blurPass = new ShaderPass(BackgroundBlurShader);
    this.blurPass.uniforms.resolution.value.set(
      options.renderer.domElement.width,
      options.renderer.domElement.height
    );
    this.blurPass.enabled = false;
    this.composer.addPass(this.blurPass);

    // Vignette
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.enabled = false;
    this.composer.addPass(this.vignettePass);

    this.enabled = options.enabled ?? true;
    this.dofEnabled = options.dofEnabled ?? false;
    this.vignetteEnabled = options.vignetteEnabled ?? false;
  }

  // Enable/disable DOF effect
  setDOFEnabled(enabled: boolean) {
    this.dofEnabled = enabled;
    if (this.blurPass) {
      this.blurPass.enabled = enabled;
    }
  }

  // Enable/disable vignette
  setVignetteEnabled(enabled: boolean) {
    this.vignetteEnabled = enabled;
    if (this.vignettePass) {
      this.vignettePass.enabled = enabled;
    }
  }

  // Set focus distance (0-1 normalized)
  setFocusDistance(distance: number) {
    if (this.blurPass) {
      this.blurPass.uniforms.focusDistance.value = distance;
    }
    if (this.bokehPass) {
      // BokehPass uses focus distance in world units
      (this.bokehPass.uniforms as Record<string, { value: unknown }>).focus.value = distance * 1000;
    }
  }

  // Animate focus distance
  animateFocusDistance(targetDistance: number, duration: number = 1, easing: string = 'power2.inOut') {
    const proxy = { distance: this.blurPass?.uniforms.focusDistance.value || 0.5 };
    gsap.to(proxy, {
      distance: targetDistance,
      duration,
      ease: easing,
      onUpdate: () => {
        this.setFocusDistance(proxy.distance);
      },
    });
  }

  // Focus on specific world position
  focusOnPosition(position: THREE.Vector3, camera: THREE.Camera, duration: number = 1) {
    // Calculate distance from camera to focus point
    const distance = camera.position.distanceTo(position);
    const normalizedDistance = Math.min(distance / 1000, 1); // Normalize to 0-1
    this.animateFocusDistance(normalizedDistance, duration);
    this.focusTarget.copy(position);
  }

  // Set blur intensity (0-1)
  setBlurAmount(amount: number) {
    if (this.blurPass) {
      this.blurPass.uniforms.blurAmount.value = amount;
    }
  }

  // Animate blur amount
  animateBlurAmount(targetAmount: number, duration: number = 1, easing: string = 'power2.inOut') {
    const proxy = { amount: this.blurPass?.uniforms.blurAmount.value || 0 };
    gsap.to(proxy, {
      amount: targetAmount,
      duration,
      ease: easing,
      onUpdate: () => {
        this.setBlurAmount(proxy.amount);
      },
    });
  }

  // Set vignette parameters
  setVignette(darkness: number, offset: number = 1.0) {
    if (this.vignettePass) {
      this.vignettePass.uniforms.darkness.value = darkness;
      this.vignettePass.uniforms.offset.value = offset;
    }
  }

  // Animate vignette
  animateVignette(darkness: number, offset: number = 1.0, duration: number = 1, easing: string = 'power2.inOut') {
    if (!this.vignettePass) return;

    const proxy = {
      darkness: this.vignettePass.uniforms.darkness.value,
      offset: this.vignettePass.uniforms.offset.value,
    };

    gsap.to(proxy, {
      darkness,
      offset,
      duration,
      ease: easing,
      onUpdate: () => {
        this.setVignette(proxy.darkness, proxy.offset);
      },
    });
  }

  // Rack focus - smooth focus pull from one distance to another
  rackFocus(startDistance: number, endDistance: number, duration: number = 1) {
    const proxy = { distance: startDistance };

    gsap.to(proxy, {
      distance: endDistance,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.setFocusDistance(proxy.distance);
      },
    });
  }

  // Update composer size (call on resize)
  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
    if (this.blurPass) {
      this.blurPass.uniforms.resolution.value.set(width, height);
    }
  }

  // Update camera reference
  setCamera(camera: THREE.Camera) {
    this.renderPass.camera = camera;
    if (this.bokehPass) {
      this.bokehPass.camera = camera;
    }
  }

  // Render with post-processing
  render() {
    if (!this.enabled) return;
    this.composer.render();
  }

  // Render without post-processing (for normal rendering)
  renderNormal() {
    // Just render normally without composer
  }

  // Enable/disable entire post-processing
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  // Dispose
  dispose() {
    this.composer.dispose();
    if (this.bokehPass) {
      this.bokehPass.dispose();
    }
    if (this.blurPass) {
      this.blurPass.dispose();
    }
    if (this.vignettePass) {
      this.vignettePass.dispose();
    }
  }
}
