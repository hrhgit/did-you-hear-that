# Requirements: result curve

## Introduction

On 2026-11-25 the project owner reversed in part the decision on result-page Q2 (2026-11-15, made on the owner's behalf), which kept anything that joins one floor to another out of the result. The owner asked, translated from Chinese, for a curve across the pitches, on these conditions:

- the left and the right curve are always drawn together;
- a small note says that the shape comes mostly from the headphones;
- nothing makes it look like a clinical chart: no clinical scale, no band of expected values.

What the chart invites reading is what `product.md` allows: the gap between left and right at one pitch, and the change against an earlier visit with the same headphones. The fine-level-estimate spec gives each found ear a range; the chart draws it.

Out of scope: the house picture, which keeps its own condition (no axis on its measuring line, nothing joining floors); the saved image, which stays as it is for now (open question).

## Glossary

- **Curve_Chart**: the chart on the result page, beside the house picture, with one point per pitch for each ear.
- **Point**: one found ear at one pitch, at its level relative to the visitor's calibration.

## R1 What the chart draws

1. THE Curve_Chart SHALL draw the pitches of the visit left to right from the lowest, evenly spaced, each named by its pitch label and its creature.
2. THE Curve_Chart SHALL draw the levels as "dB quieter than your calibration", deeper meaning quieter, as the house's light does, with at most four labelled grid lines.
3. FOR each ear, THE Curve_Chart SHALL draw a Point at each found pitch and join neighbouring found Points with a line. A pitch that is not found SHALL break the line, and SHALL be marked in its own way: `betterThanFloor` at the bottom edge, `worseThanCap` at the top edge, unreliable as a hollow mark at the top.
4. WHERE a found ear has a range, THE Curve_Chart SHALL draw it as a faint band or whisker around its Point.
5. THE two ears SHALL be told apart by colour and by marker shape and line style, so that neither colour nor shape alone carries it.
6. WHERE the result has an earlier visit to compare with, THE Curve_Chart SHALL draw its two curves faintly, dashed, behind this visit's.
7. THE Curve_Chart SHALL draw neither curve when fewer than two pitches have a found ear on either side, and SHALL then be hidden.

## R2 What the chart never does

1. THE Curve_Chart SHALL NOT draw a band, line or label of expected or typical values, or any scale other than the visitor's own calibration.
2. THE Curve_Chart SHALL NOT be laid out as a clinical chart: pitch on the horizontal axis with levels on a decibel hearing scale growing downward with worse hearing.
3. No text of the chart SHALL compare one pitch with another.
4. THE Curve_Chart SHALL never draw one ear's curve without the other's chart area: both ears always share one chart.

## R3 Words

1. THE Curve_Chart SHALL carry, in small text under it, one note: that the shape comes mostly from the headphones, and that the gap between the two lines at a pitch is what can be read.
2. THE Curve_Chart SHALL have a text alternative that lists, for each pitch, the two levels in words, reusing the floor lines.
3. Every string comes from `src/copy/` and passes `npm run check:copy`.

## R4 Layout

1. THE Curve_Chart SHALL fit at 375 px wide with no sideways scroll, and stay compact: about 160 px tall on a phone.
2. THE Curve_Chart SHALL sit next to the house picture, before the floor rows.
