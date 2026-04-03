import { describe, it, expect } from 'vitest';
import { parseConfig, buildConfigUrl } from '../src/config.js';

describe('parseConfig', () => {
  it('returns defaults with empty params', () => {
    const cfg = parseConfig('');
    expect(cfg).toEqual({
      paletteIdx: 0,
      foldDuration: 200,
      side: 0,
      density: 500,
      maxConcurrent: 2,
      waitTime: 8000,
    });
  });

  it('parses palette=ocean → paletteIdx 0', () => {
    const cfg = parseConfig('?palette=ocean');
    expect(cfg.paletteIdx).toBe(0);
  });

  it('parses palette=ember → paletteIdx 2', () => {
    const cfg = parseConfig('?palette=ember');
    expect(cfg.paletteIdx).toBe(2);
  });

  it('ignores unknown palette names', () => {
    const cfg = parseConfig('?palette=neon');
    expect(cfg.paletteIdx).toBe(0);
  });

  it('parses speed=2 → foldDuration 100', () => {
    const cfg = parseConfig('?speed=2');
    expect(cfg.foldDuration).toBe(100);
  });

  it('parses speed=0.5 → foldDuration 400', () => {
    const cfg = parseConfig('?speed=0.5');
    expect(cfg.foldDuration).toBe(400);
  });

  it('clamps speed below min (0.25)', () => {
    const cfg = parseConfig('?speed=0.01');
    expect(cfg.foldDuration).toBe(Math.round(200 / 0.25));
  });

  it('clamps speed above max (4.0)', () => {
    const cfg = parseConfig('?speed=100');
    expect(cfg.foldDuration).toBe(Math.round(200 / 4.0));
  });

  it('parses size=60 → side 60', () => {
    const cfg = parseConfig('?size=60');
    expect(cfg.side).toBe(60);
  });

  it('clamps size to min 20', () => {
    const cfg = parseConfig('?size=5');
    expect(cfg.side).toBe(20);
  });

  it('clamps size to max 200', () => {
    const cfg = parseConfig('?size=999');
    expect(cfg.side).toBe(200);
  });

  it('parses density=500', () => {
    const cfg = parseConfig('?density=500');
    expect(cfg.density).toBe(500);
  });

  it('clamps density to min 100', () => {
    const cfg = parseConfig('?density=10');
    expect(cfg.density).toBe(100);
  });

  it('parses cascades=3', () => {
    const cfg = parseConfig('?cascades=3');
    expect(cfg.maxConcurrent).toBe(3);
  });

  it('clamps cascades to max 5', () => {
    const cfg = parseConfig('?cascades=99');
    expect(cfg.maxConcurrent).toBe(5);
  });

  it('parses wait=3000', () => {
    const cfg = parseConfig('?wait=3000');
    expect(cfg.waitTime).toBe(3000);
  });

  it('clamps wait to min 500', () => {
    const cfg = parseConfig('?wait=1');
    expect(cfg.waitTime).toBe(500);
  });

  it('clamps wait to max 30000', () => {
    const cfg = parseConfig('?wait=999999');
    expect(cfg.waitTime).toBe(30000);
  });

  it('accepts URLSearchParams object', () => {
    const params = new URLSearchParams('palette=ember&speed=2');
    // speed=2 → 200/2 = 100ms fold duration
    const cfg = parseConfig(params);
    expect(cfg.paletteIdx).toBe(2);
    expect(cfg.foldDuration).toBe(100);
  });

  it('parses combined params', () => {
    const cfg = parseConfig('?palette=ocean&speed=1.5&size=80&cascades=1&wait=5000&density=2000');
    expect(cfg.paletteIdx).toBe(0);
    expect(cfg.foldDuration).toBe(Math.round(200 / 1.5));
    expect(cfg.side).toBe(80);
    expect(cfg.maxConcurrent).toBe(1);
    expect(cfg.waitTime).toBe(5000);
    expect(cfg.density).toBe(2000);
  });
});

describe('buildConfigUrl', () => {
  it('returns empty string for all-default config', () => {
    const url = buildConfigUrl({ paletteIdx: 0, foldDuration: 200, side: 0, density: 500, maxConcurrent: 2, waitTime: 8000 });
    expect(url).toBe('');
  });

  it('encodes non-default palette', () => {
    const url = buildConfigUrl({ paletteIdx: 1, foldDuration: 200, side: 0, density: 500, maxConcurrent: 2, waitTime: 8000 });
    expect(url).toContain('palette=sakura');
  });

  it('encodes speed when foldDuration is non-default', () => {
    const url = buildConfigUrl({ paletteIdx: 0, foldDuration: 100, side: 0, density: 500, maxConcurrent: 2, waitTime: 8000 });
    expect(url).toContain('speed=2');
  });

  it('round-trips config through url', () => {
    const original = { paletteIdx: 2, foldDuration: 200, side: 80, density: 500, maxConcurrent: 3, waitTime: 5000 };
    const url = buildConfigUrl(original);
    const parsed = parseConfig(url);
    expect(parsed.paletteIdx).toBe(2);
    expect(parsed.foldDuration).toBe(200);
    expect(parsed.side).toBe(80);
    expect(parsed.density).toBe(500);
    expect(parsed.maxConcurrent).toBe(3);
    expect(parsed.waitTime).toBe(5000);
  });
});
