// Light System - Manages ambient, directional, and point lights with animation
import * as THREE from 'three';
import { gsap } from 'gsap';
import { Vector3 } from './types';

export type LightType = 'ambient' | 'directional' | 'point';

export interface LightKeyFrame {
  time: number;
  intensity: number;
  color?: string;
  position?: Vector3;
  transition?: 'ease-in-out' | 'linear' | 'bounce' | 'elastic';
}

export interface LightConfig {
  type: LightType;
  intensity?: number;
  color?: string;
  position?: Vector3;
  castShadow?: boolean;
}

export class LightSystem {
  private scene: THREE.Scene;
  private ambientLight: THREE.AmbientLight | null = null;
  private directionalLight: THREE.DirectionalLight | null = null;
  private pointLights: THREE.PointLight[] = [];
  private animationRefs: Map<string, gsap.core.Tween | gsap.core.Timeline> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Initialize lights based on configuration
  init(configs: LightConfig[]) {
    // Clear existing lights
    this.dispose();

    for (const config of configs) {
      switch (config.type) {
        case 'ambient':
          this.ambientLight = new THREE.AmbientLight(
            config.color ? new THREE.Color(config.color) : 0xffffff,
            config.intensity ?? 0.3
          );
          this.scene.add(this.ambientLight);
          break;

        case 'directional':
          this.directionalLight = new THREE.DirectionalLight(
            config.color ? new THREE.Color(config.color) : 0xffffff,
            config.intensity ?? 0.8
          );
          if (config.position) {
            this.directionalLight.position.set(
              config.position.x,
              config.position.y,
              config.position.z
            );
          } else {
            this.directionalLight.position.set(5, 5, 5);
          }
          if (config.castShadow) {
            this.directionalLight.castShadow = true;
            this.directionalLight.shadow.mapSize.width = 1024;
            this.directionalLight.shadow.mapSize.height = 1024;
          }
          this.scene.add(this.directionalLight);
          break;

        case 'point':
          const pointLight = new THREE.PointLight(
            config.color ? new THREE.Color(config.color) : 0xffffff,
            config.intensity ?? 0.5
          );
          if (config.position) {
            pointLight.position.set(
              config.position.x,
              config.position.y,
              config.position.z
            );
          } else {
            pointLight.position.set(0, 5, 0);
          }
          pointLight.castShadow = config.castShadow ?? false;
          this.pointLights.push(pointLight);
          this.scene.add(pointLight);
          break;
      }
    }
  }

  // Animate light intensity - optionally add to external timeline
  animateIntensity(type: LightType, targetIntensity: number, duration: number = 1, delay: number = 0, timeline?: gsap.core.Timeline, timelinePosition: number = 0) {
    const light = this.getLightByType(type);
    if (!light) return;

    const proxy = { intensity: light.intensity };
    const tween = gsap.to(proxy, {
      intensity: targetIntensity,
      duration,
      delay,
      ease: 'power2.inOut',
      onUpdate: () => {
        light.intensity = proxy.intensity;
      },
    });

    this.animationRefs.set(`intensity-${type}`, tween);

    // Add to external timeline if provided
    if (timeline) {
      timeline.add(tween, timelinePosition);
      this.animationRefs.delete(`intensity-${type}`);
    }
  }

  // Animate light color - optionally add to external timeline
  animateColor(type: LightType, targetColor: string, duration: number = 1, delay: number = 0, timeline?: gsap.core.Timeline, timelinePosition: number = 0) {
    const light = this.getLightByType(type);
    if (!light || !('color' in light)) return;

    const target = new THREE.Color(targetColor);
    const proxy = {
      r: (light as THREE.AmbientLight | THREE.DirectionalLight | THREE.PointLight).color.r,
      g: (light as THREE.AmbientLight | THREE.DirectionalLight | THREE.PointLight).color.g,
      b: (light as THREE.AmbientLight | THREE.DirectionalLight | THREE.PointLight).color.b,
    };

    const tween = gsap.to(proxy, {
      r: target.r,
      g: target.g,
      b: target.b,
      duration,
      delay,
      ease: 'power2.inOut',
      onUpdate: () => {
        (light as THREE.AmbientLight | THREE.DirectionalLight | THREE.PointLight).color.setRGB(
          proxy.r, proxy.g, proxy.b
        );
      },
    });

    this.animationRefs.set(`color-${type}`, tween);

    if (timeline) {
      timeline.add(tween, timelinePosition);
      this.animationRefs.delete(`color-${type}`);
    }
  }

  // Animate point light position - optionally add to external timeline
  animatePointLightPosition(index: number, targetPosition: Vector3, duration: number = 1, delay: number = 0, timeline?: gsap.core.Timeline, timelinePosition: number = 0) {
    const light = this.pointLights[index];
    if (!light) return;

    const proxy = { x: light.position.x, y: light.position.y, z: light.position.z };
    const tween = gsap.to(proxy, {
      x: targetPosition.x,
      y: targetPosition.y,
      z: targetPosition.z,
      duration,
      delay,
      ease: 'power2.inOut',
      onUpdate: () => {
        light.position.set(proxy.x, proxy.y, proxy.z);
      },
    });

    const key = `position-point-${index}`;
    this.animationRefs.set(key, tween);

    if (timeline) {
      timeline.add(tween, timelinePosition);
      this.animationRefs.delete(key);
    }
  }

  // Animate using keyframes
  playKeyFrames(keyFrames: LightKeyFrame[], lightType: LightType = 'ambient') {
    if (keyFrames.length < 2) return;

    const light = this.getLightByType(lightType) as THREE.AmbientLight | THREE.DirectionalLight | THREE.PointLight | null;
    if (!light) return;

    this.stopAnimation(`keyframes-${lightType}`);

    const tl = gsap.timeline({
      onUpdate: () => {
        const currentTime = tl.time();
        this.updateLightFromKeyFrames(light, keyFrames, currentTime);
      },
    });

    // Add segments between keyframes
    for (let i = 0; i < keyFrames.length - 1; i++) {
      const kf = keyFrames[i];
      const nextKF = keyFrames[i + 1];
      const segmentDuration = nextKF.time - kf.time;

      // Use a proxy to animate intensity
      const intensityProxy = { intensity: kf.intensity };
      tl.to(intensityProxy, {
        intensity: nextKF.intensity,
        duration: segmentDuration,
        ease: kf.transition || 'ease-in-out',
        onUpdate: () => {
          light.intensity = intensityProxy.intensity;
        },
      }, kf.time);

      // Animate color if specified
      if (kf.color && nextKF.color) {
        const startColor = new THREE.Color(kf.color);
        const endColor = new THREE.Color(nextKF.color);
        const colorProxy = { r: startColor.r, g: startColor.g, b: startColor.b };

        tl.to(colorProxy, {
          r: endColor.r,
          g: endColor.g,
          b: endColor.b,
          duration: segmentDuration,
          ease: kf.transition || 'ease-in-out',
          onUpdate: () => {
            if ('color' in light) {
              (light as THREE.AmbientLight | THREE.DirectionalLight | THREE.PointLight).color.setRGB(
                colorProxy.r, colorProxy.g, colorProxy.b
              );
            }
          },
        }, kf.time);
      }
    }

    this.animationRefs.set(`keyframes-${lightType}`, tl);
    tl.play();
  }

  private updateLightFromKeyFrames(
    light: THREE.AmbientLight | THREE.DirectionalLight | THREE.PointLight,
    keyFrames: LightKeyFrame[],
    currentTime: number
  ) {
    let currentKF: LightKeyFrame | null = null;
    let nextKF: LightKeyFrame | null = null;

    for (let i = 0; i < keyFrames.length; i++) {
      if (currentTime >= keyFrames[i].time) {
        currentKF = keyFrames[i];
        nextKF = keyFrames[i + 1] || null;
      }
    }

    if (currentKF && nextKF) {
      const segmentDuration = nextKF.time - currentKF.time;
      const segmentProgress = segmentDuration > 0 ? (currentTime - currentKF.time) / segmentDuration : 0;
      const easedProgress = this.applyEasing(segmentProgress, currentKF.transition || 'ease-in-out');

      light.intensity = currentKF.intensity + (nextKF.intensity - currentKF.intensity) * easedProgress;

      if (currentKF.color && nextKF.color && 'color' in light) {
        const startColor = new THREE.Color(currentKF.color);
        const endColor = new THREE.Color(nextKF.color);
        (light as THREE.AmbientLight | THREE.DirectionalLight | THREE.PointLight).color.lerpColors(
          startColor, endColor, easedProgress
        );
      }
    }
  }

  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'linear': return t;
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'bounce':
        const n1 = 7.5625, d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
      case 'elastic':
        if (t === 0 || t === 1) return t;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
      default: return t;
    }
  }

  private getLightByType(type: LightType): THREE.Light | null {
    switch (type) {
      case 'ambient': return this.ambientLight;
      case 'directional': return this.directionalLight;
      case 'point': return this.pointLights[0] || null;
      default: return null;
    }
  }

  // Stop specific animation
  stopAnimation(key: string) {
    const anim = this.animationRefs.get(key);
    if (anim) {
      anim.kill();
      this.animationRefs.delete(key);
    }
  }

  // Stop all animations
  stopAll() {
    this.animationRefs.forEach(anim => anim.kill());
    this.animationRefs.clear();
  }

  // Dispose all lights
  dispose() {
    this.stopAll();

    if (this.ambientLight) {
      this.scene.remove(this.ambientLight);
      this.ambientLight = null;
    }

    if (this.directionalLight) {
      this.scene.remove(this.directionalLight);
      this.directionalLight = null;
    }

    this.pointLights.forEach(light => {
      this.scene.remove(light);
    });
    this.pointLights = [];
  }

  // Getters for accessing lights
  getAmbientLight(): THREE.AmbientLight | null {
    return this.ambientLight;
  }

  getDirectionalLight(): THREE.DirectionalLight | null {
    return this.directionalLight;
  }

  getPointLights(): THREE.PointLight[] {
    return this.pointLights;
  }
}
