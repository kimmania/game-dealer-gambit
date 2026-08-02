import { describe, it, expect } from 'vitest';
import { mulberry32, shuffled } from '../src/engine/rng';

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('differs across seeds and stays in [0,1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(a()).not.toBe(b());
  });
  it('shuffle is a permutation', () => {
    const arr = Array.from({ length: 26 }, (_, i) => i);
    const out = shuffled(arr, mulberry32(7));
    expect(out.slice().sort((x, y) => x - y)).toEqual(arr);
  });
});
