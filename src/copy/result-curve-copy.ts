/**
 * The words of the curve chart on the result page (result-curve R3). One small note, the legend
 * and the axis title. No line here compares one pitch with another (R2.3).
 */
export const resultCurveCopy = Object.freeze({
  /** Read out for the chart; the floors list under it gives every level in words (R3.2). */
  label: "Both ears across the pitches",
  axisTitle: "dB from your calibration",
  leftLegend: "Left",
  rightLegend: "Right",
  earlierLegend: "Earlier visit",
  shapeNote:
    "The shape mostly follows your headphones. Read the gap between the two lines at each pitch.",
});

/** A grid label, such as "−20" with a true minus sign, or "0". */
export function curveGridLabel(levelDb: number): string {
  const rounded = Math.round(levelDb);
  return rounded < 0 ? `−${Math.abs(rounded)}` : String(rounded);
}
