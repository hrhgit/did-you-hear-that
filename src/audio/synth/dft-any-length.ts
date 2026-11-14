import type { FftDirection } from "./fft";
import { fftInPlace } from "./fft";

/**
 * Discrete Fourier transform of any length, in place, with the same conventions as `fftInPlace`:
 * no scaling forward, division by N inverse. A power-of-two length goes straight to `fftInPlace`.
 * Any other length uses Bluestein's algorithm, which turns the transform into a convolution
 * computed with three power-of-two FFTs (D36).
 *
 * Throws a `RangeError` when the arrays are empty or differ in length.
 */
export function dftAnyLength(
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
  if (length < 1) {
    throw new RangeError("The transform length must be at least 1, but got 0.");
  }
  if ((length & (length - 1)) === 0) {
    fftInPlace(real, imag, direction);
    return;
  }

  // Chirp w[m] = e^(sign i π m² / N). m² is reduced modulo 2N, which leaves the chirp unchanged
  // and keeps the angle small, so it stays accurate for long buffers.
  const sign = direction === "forward" ? -1 : 1;
  const chirpReal = new Float64Array(length);
  const chirpImag = new Float64Array(length);
  for (let m = 0; m < length; m += 1) {
    const angle = (sign * Math.PI * ((m * m) % (2 * length))) / length;
    chirpReal[m] = Math.cos(angle);
    chirpImag[m] = Math.sin(angle);
  }

  let convolutionLength = 1;
  while (convolutionLength < 2 * length - 1) {
    convolutionLength *= 2;
  }
  // a[n] = x[n] w[n], zero-padded.
  const aReal = new Float64Array(convolutionLength);
  const aImag = new Float64Array(convolutionLength);
  for (let n = 0; n < length; n += 1) {
    aReal[n] = real[n] * chirpReal[n] - imag[n] * chirpImag[n];
    aImag[n] = real[n] * chirpImag[n] + imag[n] * chirpReal[n];
  }
  // b[m] = conj(w[m]) for m from −(N − 1) to N − 1, wrapped around.
  const bReal = new Float64Array(convolutionLength);
  const bImag = new Float64Array(convolutionLength);
  bReal[0] = chirpReal[0];
  bImag[0] = -chirpImag[0];
  for (let m = 1; m < length; m += 1) {
    bReal[m] = chirpReal[m];
    bImag[m] = -chirpImag[m];
    bReal[convolutionLength - m] = chirpReal[m];
    bImag[convolutionLength - m] = -chirpImag[m];
  }

  fftInPlace(aReal, aImag, "forward");
  fftInPlace(bReal, bImag, "forward");
  for (let k = 0; k < convolutionLength; k += 1) {
    const productReal = aReal[k] * bReal[k] - aImag[k] * bImag[k];
    const productImag = aReal[k] * bImag[k] + aImag[k] * bReal[k];
    aReal[k] = productReal;
    aImag[k] = productImag;
  }
  fftInPlace(aReal, aImag, "inverse");

  // X[k] = w[k] (a ⊛ b)[k], divided by N for the inverse.
  const scale = direction === "inverse" ? 1 / length : 1;
  for (let k = 0; k < length; k += 1) {
    real[k] = (aReal[k] * chirpReal[k] - aImag[k] * chirpImag[k]) * scale;
    imag[k] = (aReal[k] * chirpImag[k] + aImag[k] * chirpReal[k]) * scale;
  }
}
