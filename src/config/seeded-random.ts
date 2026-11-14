/** A replayable source of random numbers. Every random choice in the product draws from one. */
export interface RandomSource {
  /** The seed the source was created with. Copy it into a regression test to replay a run. */
  readonly seed: number;
  /** A number in [0, 1). */
  next(): number;
}

const largestSeed = 0xffffffff;
const twoToThe32 = 0x100000000;
const warmUpOutputCount = 12;

/**
 * Creates a random source from a seed, which must be an integer from 0 to 2^32 - 1.
 *
 * The algorithm is sfc32. Its four 32-bit state words come from four outputs of splitmix32 run
 * on the seed, and the first 12 sfc32 outputs are thrown away to mix the state. All state lives
 * in this closure, so sources never share state.
 */
export function createSeededRandom(seed: number): RandomSource {
  if (!Number.isInteger(seed) || seed < 0 || seed > largestSeed) {
    throw new RangeError(
      `A seed must be an integer from 0 to ${largestSeed}, but got ${String(seed)}.`,
    );
  }

  let splitmixState = seed | 0;
  const nextSplitmix32 = (): number => {
    splitmixState = (splitmixState + 0x9e3779b9) | 0;
    let z = Math.imul(splitmixState ^ (splitmixState >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };

  let a = nextSplitmix32() | 0;
  let b = nextSplitmix32() | 0;
  let c = nextSplitmix32() | 0;
  let d = nextSplitmix32() | 0;

  const nextSfc32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };

  for (let index = 0; index < warmUpOutputCount; index += 1) {
    nextSfc32();
  }

  return Object.freeze({
    seed,
    next: (): number => nextSfc32() / twoToThe32,
  });
}
