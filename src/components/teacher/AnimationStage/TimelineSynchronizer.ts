// Timeline Synchronizer - Sync animations with music timecode
import { gsap } from 'gsap';

export interface TimelineMarker {
  name: string;
  time: number;
  beat?: number;  // Musical beat number
  bar?: number;  // Bar number
}

export interface SyncOptions {
  bpm?: number;
  timeSignature?: [number, number];  // [beats per bar, beat unit]
  offset?: number;  // Offset in seconds from audio start
}

export class TimelineSynchronizer {
  private markers: Map<string, number> = new Map();
  private markerList: TimelineMarker[] = [];
  private masterTimeline: gsap.core.Timeline | null = null;
  private bpm: number = 120;
  private timeSignature: [number, number] = [4, 4];
  private offset: number = 0;
  private isPlaying: boolean = false;
  private currentTime: number = 0;

  // Callbacks for timeline events
  private onMarkerCallbacks: Map<string, (marker: TimelineMarker) => void> = new Map();
  private onBeatCallbacks: ((beat: number, time: number) => void)[] = [];
  private onBarCallbacks: ((bar: number, time: number) => void)[] = [];

  constructor(options: SyncOptions = {}) {
    this.bpm = options.bpm ?? 120;
    this.timeSignature = options.timeSignature ?? [4, 4];
    this.offset = options.offset ?? 0;
  }

  // Set BPM
  setBPM(bpm: number) {
    this.bpm = bpm;
  }

  // Set time signature
  setTimeSignature(numerator: number, denominator: number) {
    this.timeSignature = [numerator, denominator];
  }

  // Set offset
  setOffset(offset: number) {
    this.offset = offset;
  }

  // Add a marker
  addMarker(name: string, time: number, beat?: number, bar?: number) {
    const marker: TimelineMarker = { name, time, beat, bar };
    this.markers.set(name, time);
    this.markerList.push(marker);
    this.markerList.sort((a, b) => a.time - b.time);
  }

  // Remove a marker
  removeMarker(name: string) {
    this.markers.delete(name);
    this.markerList = this.markerList.filter(m => m.name !== name);
  }

  // Get marker time
  getMarkerTime(name: string): number | undefined {
    return this.markers.get(name);
  }

  // Get all markers
  getMarkers(): TimelineMarker[] {
    return [...this.markerList];
  }

  // Convert beat to time
  beatToTime(beat: number): number {
    const secondsPerBeat = 60 / this.bpm;
    return this.offset + (beat - 1) * secondsPerBeat;
  }

  // Convert time to beat
  timeToBeat(time: number): number {
    const secondsPerBeat = 60 / this.bpm;
    return Math.floor((time - this.offset) / secondsPerBeat) + 1;
  }

  // Convert bar to time
  barToTime(bar: number): number {
    const secondsPerBeat = 60 / this.bpm;
    const secondsPerBar = secondsPerBeat * this.timeSignature[0];
    return this.offset + (bar - 1) * secondsPerBar;
  }

  // Convert time to bar
  timeToBar(time: number): number {
    const secondsPerBeat = 60 / this.bpm;
    const secondsPerBar = secondsPerBeat * this.timeSignature[0];
    return Math.floor((time - this.offset) / secondsPerBar) + 1;
  }

  // Get seconds per beat
  getSecondsPerBeat(): number {
    return 60 / this.bpm;
  }

  // Get seconds per bar
  getSecondsPerBar(): number {
    return (60 / this.bpm) * this.timeSignature[0];
  }

  // Set master timeline for synchronization
  setMasterTimeline(timeline: gsap.core.Timeline) {
    this.masterTimeline = timeline;
  }

  // Register callback for marker hit
  onMarker(name: string, callback: (marker: TimelineMarker) => void) {
    this.onMarkerCallbacks.set(name, callback);
  }

  // Register callback for every beat
  onBeat(callback: (beat: number, time: number) => void) {
    this.onBeatCallbacks.push(callback);
  }

  // Register callback for every bar
  onBar(callback: (bar: number, time: number) => void) {
    this.onBarCallbacks.push(callback);
  }

  // Create timeline with synced events
  createSyncedTimeline(): gsap.core.Timeline {
    const tl = gsap.timeline();

    // Add marker callbacks
    this.markerList.forEach(marker => {
      const callback = this.onMarkerCallbacks.get(marker.name);
      if (callback) {
        tl.call(() => callback(marker), [], marker.time);
      }
    });

    // Add beat callbacks (at each beat)
    const totalBeats = Math.ceil((this.markerList[this.markerList.length - 1]?.time || 0) * this.bpm / 60);
    for (let beat = 1; beat <= totalBeats; beat++) {
      const beatTime = this.beatToTime(beat);
      if (beatTime <= (this.markerList[this.markerList.length - 1]?.time || 0)) {
        tl.call(() => {
          this.onBeatCallbacks.forEach(cb => cb(beat, beatTime));
        }, [], beatTime);
      }
    }

    // Add bar callbacks (at each bar)
    const totalBars = Math.ceil(totalBeats / this.timeSignature[0]);
    for (let bar = 1; bar <= totalBars; bar++) {
      const barTime = this.barToTime(bar);
      if (barTime <= (this.markerList[this.markerList.length - 1]?.time || 0)) {
        tl.call(() => {
          this.onBarCallbacks.forEach(cb => cb(bar, barTime));
        }, [], barTime);
      }
    }

    this.masterTimeline = tl;
    return tl;
  }

  // Sync an animation to a specific beat
  syncToBeat(proxy: object, vars: gsap.TweenVars, beat: number) {
    const time = this.beatToTime(beat);
    return gsap.to(proxy, {
      ...vars,
      delay: time,
    });
  }

  // Sync an animation to a specific bar
  syncToBar(proxy: object, vars: gsap.TweenVars, bar: number) {
    const time = this.barToTime(bar);
    return gsap.to(proxy, {
      ...vars,
      delay: time,
    });
  }

  // Sync an animation to a specific marker
  syncToMarker(proxy: object, vars: gsap.TweenVars, markerName: string) {
    const time = this.markers.get(markerName);
    if (time === undefined) {
      console.warn(`Marker "${markerName}" not found`);
      return null;
    }
    return gsap.to(proxy, {
      ...vars,
      delay: time,
    });
  }

  // Start playback state
  play() {
    this.isPlaying = true;
  }

  // Pause playback state
  pause() {
    this.isPlaying = false;
  }

  // Stop playback state
  stop() {
    this.isPlaying = false;
    this.currentTime = 0;
  }

  // Seek to time
  seek(time: number) {
    this.currentTime = Math.max(0, time);
  }

  // Get current time
  getCurrentTime(): number {
    return this.currentTime;
  }

  // Get playback state
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  // Check if time is at a specific beat (within tolerance)
  isAtBeat(beat: number, tolerance: number = 0.05): boolean {
    const beatTime = this.beatToTime(beat);
    return Math.abs(this.currentTime - beatTime) <= tolerance;
  }

  // Check if time is at a specific bar (within tolerance)
  isAtBar(bar: number, tolerance: number = 0.05): boolean {
    const barTime = this.barToTime(bar);
    return Math.abs(this.currentTime - barTime) <= tolerance;
  }

  // Check if time is at a specific marker (within tolerance)
  isAtMarker(name: string, tolerance: number = 0.05): boolean {
    const markerTime = this.markers.get(name);
    if (markerTime === undefined) return false;
    return Math.abs(this.currentTime - markerTime) <= tolerance;
  }

  // Get next upcoming marker
  getNextMarker(afterTime?: number): TimelineMarker | null {
    const time = afterTime ?? this.currentTime;
    return this.markerList.find(m => m.time > time) || null;
  }

  // Get previous marker
  getPreviousMarker(beforeTime?: number): TimelineMarker | null {
    const time = beforeTime ?? this.currentTime;
    for (let i = this.markerList.length - 1; i >= 0; i--) {
      if (this.markerList[i].time < time) {
        return this.markerList[i];
      }
    }
    return null;
  }

  // Parse markers from script (simple format)
  parseMarkersFromScript(scriptLines: string[]) {
    for (const line of scriptLines) {
      const markerMatch = line.match(/^MARKER\s+name:\s*"([^"]+)"\s+time:\s*([\d.]+)/i);
      if (markerMatch) {
        const name = markerMatch[1];
        const time = parseFloat(markerMatch[2]);
        this.addMarker(name, time);
      }
    }
  }

  // Export markers to script format
  exportToScript(): string {
    return this.markerList
      .map(m => `MARKER name: "${m.name}" time: ${m.time}`)
      .join('\n');
  }

  // Dispose
  dispose() {
    this.markers.clear();
    this.markerList = [];
    this.onMarkerCallbacks.clear();
    this.onBeatCallbacks = [];
    this.onBarCallbacks = [];
    if (this.masterTimeline) {
      this.masterTimeline.kill();
      this.masterTimeline = null;
    }
  }
}
