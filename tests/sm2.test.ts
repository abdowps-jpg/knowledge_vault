/**
 * Tests for the flashcards SM-2 algorithm. Replicates the updateScheduling
 * function from server/routers/flashcards.ts so we can pin down the scheduling
 * invariants without pulling in the whole router.
 */

import { describe, expect, it } from 'vitest';

function updateScheduling(
  prev: { ease: number; interval: number; repetitions: number },
  quality: number
) {
  let { ease, interval, repetitions } = prev;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }
  ease = Math.max(1.3, ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return { ease, interval, repetitions };
}

describe('SM-2 flashcard scheduling', () => {
  const fresh = { ease: 2.5, interval: 1, repetitions: 0 };

  it('a fail resets repetitions and interval', () => {
    const r = updateScheduling({ ease: 2.5, interval: 30, repetitions: 5 }, 0);
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(1);
  });

  it('a "good" on first review yields interval 1', () => {
    const r = updateScheduling(fresh, 4);
    expect(r.repetitions).toBe(1);
    expect(r.interval).toBe(1);
  });

  it('second "good" yields interval 6', () => {
    const after1 = updateScheduling(fresh, 4);
    const after2 = updateScheduling(after1, 4);
    expect(after2.repetitions).toBe(2);
    expect(after2.interval).toBe(6);
  });

  it('third "good" multiplies interval by ease (~2.5)', () => {
    const after1 = updateScheduling(fresh, 4);
    const after2 = updateScheduling(after1, 4);
    const after3 = updateScheduling(after2, 4);
    expect(after3.repetitions).toBe(3);
    expect(after3.interval).toBeGreaterThanOrEqual(14);
    expect(after3.interval).toBeLessThanOrEqual(16);
  });

  it('ease floor is 1.3', () => {
    let state = fresh;
    for (let i = 0; i < 20; i += 1) {
      state = updateScheduling(state, 0);
    }
    expect(state.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('"easy" answer grows ease', () => {
    const r = updateScheduling(fresh, 5);
    expect(r.ease).toBeGreaterThan(2.5);
  });

  it('"hard" answer shrinks ease without reset', () => {
    const r = updateScheduling(fresh, 3);
    expect(r.ease).toBeLessThan(2.5);
    expect(r.repetitions).toBe(1);
  });
});
