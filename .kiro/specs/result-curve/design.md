# Design: result curve

## Model

`src/session/result-curve.ts`, `resultCurve(picture: ResultPicture): ResultCurve | null`. A pure function of the picture the page already builds, so it needs nothing new from the log.

```ts
interface CurvePoint {
  readonly ear: Ear;
  readonly roomId: GhostSoundId;
  readonly pitchLabel: string;
  readonly mark: "found" | "betterThanFloor" | "worseThanCap" | "unreliable";
  /** dB relative to the calibration, for `found` only. */
  readonly levelDb: number | null;
  readonly lowDb: number | null;
  readonly highDb: number | null;
  readonly earlierDb: number | null;
}
interface ResultCurve {
  readonly columns: readonly { roomId; pitchLabel; frequencyHz; left: CurvePoint; right: CurvePoint }[]; // low pitch first
  readonly topDb: number;     // the loudest level drawn, rounded up to 10
  readonly bottomDb: number;  // the quietest level drawn, rounded down to 10
  readonly gridDb: readonly number[]; // at most four, every 10 dB
}
```

Null when fewer than two columns have a found ear on either side (R1.7). Since the redesign below the chart is the result's only picture, so it is always drawn: with no level found, its sky spans 0 to −60 dB and holds only the edge and hollow marks.

The range comes from the fine-level-estimate fields when present; otherwise null.

As built (2026-11-25): the picture had no level in dB, only a depth on the floor's own scale, so `PictureWing` and `EarlierWing` gained an optional `levelDb`, set for a found ear only. `CurvePoint` keeps `ear`, `mark`, `levelDb`, `lowDb`, `highDb` and `earlierDb`; the room and pitch label sit on the column. `ResultCurve` also says `hasEarlier`, which shows the earlier legend. The grid steps are 10, 20, 30 or 40 dB, the smallest that gives at most four lines, and the chart is at least 20 dB tall. Marks for `betterThanFloor`, `worseThanCap` and unreliable sit just outside the scale, so that they never read as a level on it.

## Drawing

`src/ui/result/draw-result-curve.ts` draws an inline SVG with a `viewBox` and `width: 100%`:

- columns evenly spaced; under each, the creature badge's colour dot and the pitch label;
- the vertical scale: top = `topDb` (louder), bottom = `bottomDb` (quieter), so "deeper is quieter" as in the house, which is the opposite of a clinical chart's orientation (R2.2);
- grid lines at `gridDb`, labelled "−20" etc. in small text at the left, with "dB from your calibration" once as the axis title;
- left ear: `--color-ear-left` (or the project's left colour), solid line, round markers; right ear: right colour, dashed line, square markers (R1.5);
- range: a vertical whisker, 40% opacity;
- earlier visit: both curves at 30% opacity, dotted, drawn first;
- non-found marks: a small arrow at the bottom edge for `betterThanFloor`, at the top edge for `worseThanCap`, a hollow marker at the top for `unreliable`; they break the line.

Legend: one line, "● Left ■ Right", in small text, built from the copy.

## Words (`src/copy/result-curve-copy.ts`)

- `axisTitle`: "dB from your calibration"
- `leftLegend`, `rightLegend`: "Left", "Right"
- `shapeNote`: "The shape mostly follows your headphones. Read the gap between the two lines at each pitch."
- `earlierLegend`: "Earlier visit"
- the text alternative reuses `PictureFloor.description`.

## Place on the page

In `create-result-view.ts`, a `figure.result-curve` after the house figure and before the floor rows, redrawn in `drawAll` from the shown picture; hidden when the model is null.

## Checks

- `src/session/result-curve.test.ts`: column order, null rule, marks, range and earlier pass-through, grid at most four lines.
- `src/copy/result-curve-copy.test.ts`: banned terms.
- Browser: the dev result sheet, desktop and 375 px; no sideways scroll.

## Open questions

1. Whether the saved image should carry the chart.

## Redesign, 2026-11-25: the yard chart

The owner asked, translated from Chinese, for one new picture that joins the curve with the game and looks good, and set aside the earlier rules on the house picture. The house of lanes and light is to give way to this chart once the owner has seen it.

The scene is the painted night of the room (`src/ui/room/art/yard.webp`), 3 : 2, with its horizon at 78% of its height:

- **The sky is the chart.** Pitches run left to right from the lowest, evenly spaced between the trees. Levels run down the sky: the top is the loudest drawn, and the deeper a point sinks towards the ground, the quieter the sound that was caught. Up to four faint mist lines carry the grid, labelled in small text at the left; "dB from your calibration" once at the top left.
- **The creatures stand on the ground**, one under each column, painted as the room paints them, with the pitch label in small text at their feet. They name the column; nothing else does.
- **The left ear is a will-o'-wisp**: a warm, round, glowing orb, joined by a solid glowing line. **The right ear is a lantern**: a cool, square light, joined by a dashed glowing line. Colour, shape and line all differ.
- **The range** is a soft glow, taller where the estimate is less sure.
- **Past either end**: a point quieter than the house can play rests at the bottom of the sky with a small chevron pointing down; one not caught at the loudest sits at the top with a chevron pointing up; an unreliable one is a hollow, faded mark at the top. Each breaks its line.
- **The earlier visit** is a faint dotted trail with faded marks, drawn first.
- **A column the result focus picks out** gets a soft moonbeam down to its creature; so does the one whose words the visitor points at or tabs to, while the others dim.
- **The key** (left, right, and the earlier visit when there is one) is drawn in the top right corner beside the sky, so a saved image carries it. Under the picture: only the one small note.

Phone: at 343 px wide the scene is about 230 px tall. The saved image is this scene, without the moonbeams, with the painted yard carried inside the SVG as a data address.

Steps: (1) the scene drawn in place of the plain chart, beside the house, for the owner to look at; (2) once approved, the house, its light and its key go, the focus and the saved image move to the scene, and the tests follow. Both done on 2026-11-25. The earlier-visit lines say "faint lines" in place of "faint outlines".
