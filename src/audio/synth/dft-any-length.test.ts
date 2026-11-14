import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../config/seeded-random";
import { dftAnyLength } from "./dft-any-length";

interface Complex {
  readonly real: Float64Array;
  readonly imag: Float64Array;
}

/** The DFT by its definition, with angles reduced modulo N for accuracy. */
function directDft(signal: Complex, direction: "forward" | "inverse"): Complex {
  const length = signal.real.length;
  const sign = direction === "forward" ? -1 : 1;
  const scale = direction === "inverse" ? 1 / length : 1;
  const real = new Float64Array(length);
  const imag = new Float64Array(length);
  for (let k = 0; k < length; k += 1) {
    let sumReal = 0;
    let sumImag = 0;
    for (let n = 0; n < length; n += 1) {
      const angle = (sign * 2 * Math.PI * ((k * n) % length)) / length;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      sumReal += signal.real[n] * c - signal.imag[n] * s;
      sumImag += signal.real[n] * s + signal.imag[n] * c;
    }
    real[k] = sumReal * scale;
    imag[k] = sumImag * scale;
  }
  return { real, imag };
}

function randomSignal(length: number, seed: number): Complex {
  const random = createSeededRandom(seed);
  return {
    real: Float64Array.from({ length }, () => 2 * random.next() - 1),
    imag: Float64Array.from({ length }, () => 2 * random.next() - 1),
  };
}

function energy(signal: Complex): number {
  let sum = 0;
  for (let n = 0; n < signal.real.length; n += 1) {
    sum += signal.real[n] ** 2 + signal.imag[n] ** 2;
  }
  return sum;
}

function differenceEnergy(a: Complex, b: Complex): number {
  return energy({
    real: a.real.map((value, index) => value - b.real[index]),
    imag: a.imag.map((value, index) => value - b.imag[index]),
  });
}

describe("dftAnyLength", () => {
  for (const length of [1, 2, 3, 5, 12, 100, 1000, 1024, 1323]) {
    for (const direction of ["forward", "inverse"] as const) {
      it(`agrees with a direct DFT, ${direction}, for length ${length}`, () => {
        const signal = randomSignal(length, length);
        const result = { real: signal.real.slice(), imag: signal.imag.slice() };
        dftAnyLength(result.real, result.imag, direction);
        const expected = directDft(signal, direction);
        // Compared on the scale of the signal's energy (Parseval), as for fftInPlace.
        const scale = direction === "forward" ? 1 / length : length;
        expect(differenceEnergy(result, expected) * scale).toBeLessThanOrEqual(
          1e-9 * energy(signal),
        );
      });
    }
  }

  it("gives the input back after forward then inverse for a long odd length", () => {
    const signal = randomSignal(66151, 3);
    const result = { real: signal.real.slice(), imag: signal.imag.slice() };
    dftAnyLength(result.real, result.imag, "forward");
    dftAnyLength(result.real, result.imag, "inverse");
    expect(differenceEnergy(result, signal)).toBeLessThanOrEqual(
      1e-9 * energy(signal),
    );
  });

  it("throws a RangeError for empty or unequal arrays", () => {
    expect(() =>
      dftAnyLength(new Float64Array(0), new Float64Array(0), "forward"),
    ).toThrow(RangeError);
    expect(() =>
      dftAnyLength(new Float64Array(3), new Float64Array(4), "forward"),
    ).toThrow(RangeError);
  });
});
