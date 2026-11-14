export type FftDirection = "forward" | "inverse";

/**
 * Discrete Fourier transform of a complex signal, in place, by the iterative radix-2 algorithm.
 * `real` and `imag` hold the signal on entry and its transform on return.
 *
 * The forward transform is `X[k] = sum over n of x[n] e^(-2 pi i k n / N)`, with no scaling. The
 * inverse uses `e^(+2 pi i k n / N)` and divides by N, so forward then inverse gives the input
 * back (D31). Shared by the synthesis and the measurement (D13).
 *
 * Throws a `RangeError` when the length is not a power of two or the arrays differ in length.
 */
export function fftInPlace(
  real: Float64Array,
  imag: Float64Array,
  direction: FftDirection,
): void {
  const length = real.length;
  if (imag.length !== length) {
    throw new RangeError(
      `The real and imaginary arrays must have equal lengths, but got ${length} and ${imag.length}.`,
    );
  }
  if (length < 1 || (length & (length - 1)) !== 0) {
    throw new RangeError(
      `The FFT length must be a power of two, but got ${length}.`,
    );
  }
  if (length === 1) {
    return;
  }

  // Bit-reversal permutation.
  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;
    while ((reversed & bit) !== 0) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed |= bit;
    if (index < reversed) {
      const swapReal = real[index];
      real[index] = real[reversed];
      real[reversed] = swapReal;
      const swapImag = imag[index];
      imag[index] = imag[reversed];
      imag[reversed] = swapImag;
    }
  }

  // Twiddle factors e^(sign 2 pi i m / N) for m below N / 2, each computed directly.
  const sign = direction === "forward" ? -1 : 1;
  const halfLength = length >> 1;
  const twiddleReal = new Float64Array(halfLength);
  const twiddleImag = new Float64Array(halfLength);
  for (let m = 0; m < halfLength; m += 1) {
    const angle = (sign * 2 * Math.PI * m) / length;
    twiddleReal[m] = Math.cos(angle);
    twiddleImag[m] = Math.sin(angle);
  }

  for (let size = 2; size <= length; size <<= 1) {
    const halfSize = size >> 1;
    const twiddleStep = length / size;
    for (let start = 0; start < length; start += size) {
      for (let offset = 0; offset < halfSize; offset += 1) {
        const wReal = twiddleReal[offset * twiddleStep];
        const wImag = twiddleImag[offset * twiddleStep];
        const even = start + offset;
        const odd = even + halfSize;
        const oddReal = real[odd] * wReal - imag[odd] * wImag;
        const oddImag = real[odd] * wImag + imag[odd] * wReal;
        real[odd] = real[even] - oddReal;
        imag[odd] = imag[even] - oddImag;
        real[even] += oddReal;
        imag[even] += oddImag;
      }
    }
  }

  if (direction === "inverse") {
    for (let index = 0; index < length; index += 1) {
      real[index] /= length;
      imag[index] /= length;
    }
  }
}
