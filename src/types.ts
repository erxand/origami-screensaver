/**
 * Shared TypeScript interfaces for origami-screensaver.
 */

export interface Triangle {
  row: number;
  col: number;
  points: [number, number][];
  cx: number;
  cy: number;
  up: boolean;
}

export type AnimStateKind = 'IDLE' | 'FOLDING' | 'DONE';

export interface AnimState {
  state: AnimStateKind;
  progress: number;
  startTime: number;
  duration: number;
  oldColor: string | null;
  newColor: string | null;
  foldEdgeIdx: number;
}

export interface RenderAnimState {
  progress: number;
  oldColor: string;
  newColor: string;
  foldEdgeIdx: number;
}

export interface GridResult {
  triangles: Triangle[];
  cols: number;
  rows: number;
  triHeight: number;
  triSide: number;
}

export interface CascadeEntry {
  index: number;
  startTime: number;
  parentIdx: number;
}

export interface BfsEntry {
  index: number;
  distance: number;
  parentIdx: number;
}

export interface ParsedConfig {
  paletteIdx: number;
  foldDuration: number;
  side: number;
  density: number;
  maxConcurrent: number;
  waitTime: number;
}

export interface ScreensaverOptions {
  side?: number;
  density?: number;
  cascadeDelay?: number;
  paletteIdx?: number;
  foldDuration?: number;
  waitTime?: number;
  maxConcurrent?: number;
}

export interface ControlsOptions {
  palettes?: string[];
  paletteIdx?: number;
}

export interface ScreensaverInstance {
  start(): void;
  stop(): void;
  resize(): void;
  switchPalette(): void;
  setParam(key: string, value: number): void;
  getParam(key: string): number | undefined;
  getFPS(): number;
  getPaletteIdx(): number;
}
