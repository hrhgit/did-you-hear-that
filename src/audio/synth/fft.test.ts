import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../config/seeded-random";
import { fftInPlace } from "./fft";

interface Complex {
  readonly real: Float64Array;
  readonly imag: Float64Array;
}

/** The forward DFT by its definition, with angles reduced modulo N for accuracy. */
function directDft(signal: Complex): Complex {
  const length = signal.real.length;
  const real = new Float64Array(length);
  const imag = new Float64Array(length);
  for (let k = 0; k < length; k += 1) {
    let sumReal = 0;
    let sumImag = 0;
    for (let n = 0; n < length; n += 1) {
      const angle = (-2 * Math.PI * ((k * n) % length)) / length;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      sumReal += signal.real[n] * c - signal.imag[n] * s;
      sumImag += signal.real[n] * s + signal.imag[n] * c;
    }
    real[k] = sumReal;
    imag[k] = sumImag;
  }
  return { real, imag };
}

function energy(signal: Complex): number {
  let sum = 0;
  for (let n = 0; n < signal.real.length; n += 1) {
    sum += signal.real[n] ** 2 + signal.imag[n] ** 2;
  }
  return sum;
}

/**
 * The energy of the difference of two spectra, divided by N so that it is on the scale of the
 * signal's energy (Parseval). The FFT agrees with the DFT when this is at most 1e-9 of the
 * signal's energy (R11.5, D31).
 */
function spectrumErrorEnergy(a: Complex, b: Complex): number {
  let sum = 0;
  for (let k = 0; k < a.real.length; k += 1) {
    sum += (a.real[k] - b.real[k]) ** 2 + (a.imag[k] - b.imag[k]) ** 2;
  }
  return sum / a.real.length;
}

function randomSignal(length: number, seed: number): Complex {
  const random = createSeededRandom(seed);
  const real = new Float64Array(length);
  const imag = new Float64Array(length);
  for (let n = 0; n < length; n += 1) {
    real[n] = 2 * random.next() - 1;
    imag[n] = 2 * random.next() - 1;
  }
  return { real, imag };
}

function copy(signal: Complex): Complex {
  return { real: signal.real.slice(), imag: signal.imag.slice() };
}

function transformed(
  signal: Complex,
  direction: "forward" | "inverse",
): Complex {
  const result = copy(signal);
  fftInPlace(result.real, result.imag, direction);
  return result;
}

const lengths = [1, 2, 8, 1024];

describe("fftInPlace", () => {
  for (const length of lengths) {
    it(`agrees with a direct DFT for length ${length}`, () => {
      const signal = randomSignal(length, length);
      const error = spectrumErrorEnergy(
        transformed(signal, "forward"),
        directDft(signal),
      );
      expect(error).toBeLessThanOrEqual(1e-9 * energy(signal));
    });

    it(`gives the input back after forward then inverse for length ${length}`, () => {
      const signal = randomSignal(length, 100 + length);
      const back = transformed(transformed(signal, "forward"), "inverse");
      expect(spectrumErrorEnergy(back, signal) * length).toBeLessThanOrEqual(
        1e-9 * energy(signal),
      );
    });

    it(`keeps Parseval's relation for length ${length}`, () => {
      const signal = randomSignal(length, 200 + length);
      const spectrumEnergy = energy(transformed(signal, "forward")) / length;
      expect(Math.abs(spectrumEnergy - energy(signal))).toBeLessThanOrEqual(
        1e-9 * energy(signal),
      );
    });
  }

  it("agrees with a direct DFT on a real cosine and on an impulse", () => {
    const length = 8;
    const cosine: Complex = {
      real: Float64Array.from({ length }, (_, n) =>
        Math.cos((2 * Math.PI * 3 * n) / length),
      ),
      imag: new Float64Array(length),
    };
    const impulse: Complex = {
      real: Float64Array.from({ length }, (_, n) => (n === 2 ? 1 : 0)),
      imag: new Float64Array(length),
    };
    for (const signal of [cosine, impulse]) {
      expect(
        spectrumErrorEnergy(transformed(signal, "forward"), directDft(signal)),
      ).toBeLessThanOrEqual(1e-9 * energy(signal));
    }
  });

  it("throws a RangeError for a length that is not a power of two", () => {
    for (const length of [0, 3, 6, 1000]) {
      expect(() =>
        fftInPlace(
          new Float64Array(length),
          new Float64Array(length),
          "forward",
        ),
      ).toThrow(RangeError);
    }
  });

  it("throws a RangeError for arrays of unequal length", () => {
    expect(() =>
      fftInPlace(new Float64Array(8), new Float64Array(4), "forward"),
    ).toThrow(RangeError);
  });
});
