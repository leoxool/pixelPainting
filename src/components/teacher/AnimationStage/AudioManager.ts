'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { Howl, Howler } from 'howler';

// Audio manager for music playback and sync
export interface AudioManagerState {
  isLoaded: boolean;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  volume: number;
  isMuted: boolean;
}

interface AudioManagerOptions {
  volume?: number;
  onTimeUpdate?: (time: number) => void;
  onLoad?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export function useAudioManager(options?: AudioManagerOptions) {
  const soundRef = useRef<Howl | null>(null);
  const [state, setState] = useState<AudioManagerState>({
    isLoaded: false,
    isPlaying: false,
    duration: 0,
    currentTime: 0,
    volume: options?.volume ?? 0.8,
    isMuted: false,
  });
  const updateIntervalRef = useRef<number | null>(null);

  const loadAudio = useCallback((src: string) => {
    // Clean up existing sound
    if (soundRef.current) {
      soundRef.current.unload();
    }

    setState(prev => ({ ...prev, isLoaded: false }));

    const sound = new Howl({
      src: [src],
      volume: state.volume,
      onload: () => {
        setState(prev => ({
          ...prev,
          isLoaded: true,
          duration: sound.duration(),
        }));
        options?.onLoad?.();
      },
      onend: () => {
        setState(prev => ({ ...prev, isPlaying: false }));
        options?.onEnd?.();
      },
      onloaderror: (_, error) => {
        console.error('Audio load error:', error);
        options?.onError?.(new Error(`Failed to load audio: ${error}`));
      },
      onplayerror: (_, error) => {
        console.error('Audio play error:', error);
        options?.onError?.(new Error(`Failed to play audio: ${error}`));
      },
    });

    soundRef.current = sound;

    // Start time update loop
    if (updateIntervalRef.current) {
      cancelAnimationFrame(updateIntervalRef.current);
    }

    const updateTime = () => {
      if (soundRef.current && soundRef.current.playing()) {
        setState(prev => ({
          ...prev,
          currentTime: soundRef.current!.seek() as number,
        }));
        options?.onTimeUpdate?.(soundRef.current!.seek() as number);
        updateIntervalRef.current = requestAnimationFrame(updateTime);
      }
    };

    sound.on('play', () => {
      setState(prev => ({ ...prev, isPlaying: true }));
      updateIntervalRef.current = requestAnimationFrame(updateTime);
    });

    sound.on('pause', () => {
      setState(prev => ({ ...prev, isPlaying: false }));
      if (updateIntervalRef.current) {
        cancelAnimationFrame(updateIntervalRef.current);
      }
    });

    sound.on('stop', () => {
      setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      if (updateIntervalRef.current) {
        cancelAnimationFrame(updateIntervalRef.current);
      }
    });
  }, [state.volume, options]);

  const play = useCallback(() => {
    if (soundRef.current) {
      soundRef.current.play();
    }
  }, []);

  const pause = useCallback(() => {
    if (soundRef.current) {
      soundRef.current.pause();
    }
  }, []);

  const stop = useCallback(() => {
    if (soundRef.current) {
      soundRef.current.stop();
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (soundRef.current) {
      soundRef.current.seek(time);
      setState(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    setState(prev => ({ ...prev, volume: clampedVolume }));
    if (soundRef.current) {
      soundRef.current.volume(clampedVolume);
    }
  }, []);

  const mute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: true }));
    if (soundRef.current) {
      soundRef.current.volume(0);
    }
  }, []);

  const unmute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: false }));
    if (soundRef.current) {
      soundRef.current.volume(state.volume);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (state.isMuted) {
      unmute();
    } else {
      mute();
    }
  }, [state.isMuted, mute, unmute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateIntervalRef.current) {
        cancelAnimationFrame(updateIntervalRef.current);
      }
      if (soundRef.current) {
        soundRef.current.unload();
      }
    };
  }, []);

  return {
    state,
    loadAudio,
    play,
    pause,
    stop,
    seek,
    setVolume,
    mute,
    unmute,
    toggleMute,
  };
}

// Hook for music sync events
export function useMusicSync(
  audioState: AudioManagerState,
  onBeat?: (time: number) => void,
  onMarker?: (marker: string, time: number) => void
) {
  const markersRef = useRef<Map<string, number>>(new Map());

  const addMarker = useCallback((name: string, time: number) => {
    markersRef.current.set(name, time);
  }, []);

  const removeMarker = useCallback((name: string) => {
    markersRef.current.delete(name);
  }, []);

  // Check for marker hits
  useEffect(() => {
    if (!audioState.isPlaying) return;

    const checkMarkers = () => {
      markersRef.current.forEach((markerTime, markerName) => {
        // Check if we're within 50ms of the marker
        if (Math.abs(audioState.currentTime - markerTime) < 0.05) {
          onMarker?.(markerName, markerTime);
        }
      });
    };

    const interval = setInterval(checkMarkers, 16); // ~60fps check rate
    return () => clearInterval(interval);
  }, [audioState.isPlaying, audioState.currentTime, onMarker]);

  return { addMarker, removeMarker, markers: markersRef.current };
}

// BPM-based beat sync
export function useBpmSync(bpm: number, onBeat?: (beatNumber: number, time: number) => void) {
  const beatInterval = 60 / bpm; // seconds per beat
  const beatCountRef = useRef(0);

  const reset = useCallback(() => {
    beatCountRef.current = 0;
  }, []);

  const syncToTime = useCallback((currentTime: number) => {
    const beatNumber = Math.floor(currentTime / beatInterval);
    if (beatNumber !== beatCountRef.current) {
      beatCountRef.current = beatNumber;
      onBeat?.(beatNumber, currentTime);
    }
  }, [beatInterval, onBeat]);

  return { reset, syncToTime, beatInterval };
}