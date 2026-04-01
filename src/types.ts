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
  /**
   * When a new cascade redirects a mid-fold triangle, the desired target
   * color is stored here instead of overwriting newColor (which would corrupt
   * the in-progress animation). When the fold completes, if pendingColor is
   * set, a new fold is immediately started from newColor → pendingColor.
   */
  pendingColor: string | null;
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
  /** Flat typed buffer: [x0,y0,x1,y1,x2,y2, ...] per triangle (stride 6). */
  triCoords: Float32Array;
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
