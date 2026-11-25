import { describe, expect, it } from "vitest";
import type { GhostSoundId } from "../config/sound-id";
import { resultCurve } from "./result-curve";
import type {
  PictureFloor,
  PictureWing,
  ResultPicture,
  WingState,
} from "./result-page-types";

interface WingSpec {
  readonly state: WingState;
  readonly levelDb?: number;
  readonly range?: { lowDb: number; highDb: number };
  readonly earlierDb?: number;
}

const wing = (ear: "left" | "right", spec: WingSpec): PictureWing =>
  ({
    ear,
    state: spec.state,
    ...(spec.levelDb === undefined ? {} : { levelDb: spec.levelDb }),
    ...(spec.range === undefined ? {} : { range: spec.range }),
    earlier:
      spec.earlierDb === undefined
        ? null
        : {
            state: "found",
            outlineDepthFraction: 0.5,
            levelDb: spec.earlierDb,
          },
  }) as PictureWing;

const floor = (
  roomId: GhostSoundId,
  frequencyHz: number,
  left: WingSpec,
  right: WingSpec,
): PictureFloor =>
  ({
    room: { roomIndex: 0, roomId, frequencyHz },
    pitchLabel: `${frequencyHz} Hz`,
    left: wing("left", left),
    right: wing("right", right),
  }) as PictureFloor;

const pictureOf = (floors: PictureFloor[]): ResultPicture =>
  ({ floors }) as unknown as ResultPicture;

const found = (levelDb: number, extra: Partial<WingSpec> = {}): WingSpec => ({
  state: "found",
  levelDb,
  ...extra,
});

describe("resultCurve", () => {
  it("orders the columns from the lowest pitch", () => {
    const curve = resultCurve(
      pictureOf([
        floor("attic", 4000, found(-30), found(-35)),
        floor("cellar", 250, found(-40), found(-42)),
        floor("stairs", 1000, found(-20), found(-25)),
      ]),
    );
    expect(curve?.columns.map((column) => column.frequencyHz)).toEqual([
      250, 1000, 4000,
    ]);
  });

  it("is drawn even with no level found, over a plain span", () => {
    const curve = resultCurve(
      pictureOf([
        floor(
          "cellar",
          250,
          { state: "betterThanFloor" },
          { state: "worseThanCap" },
        ),
        floor(
          "stairs",
          1000,
          { state: "unreliable" },
          { state: "betterThanFloor" },
        ),
      ]),
    );
    expect(curve.topDb).toBe(0);
    expect(curve.bottomDb).toBe(-60);
    expect(curve.gridDb.length).toBeLessThanOrEqual(4);
    expect(curve.columns.map((column) => column.left.mark)).toEqual([
      "betterThanFloor",
      "unreliable",
    ]);
  });

  it("keeps each mark, and levels only for found ears", () => {
    const curve = resultCurve(
      pictureOf([
        floor("cellar", 250, found(-40), { state: "worseThanCap" }),
        floor("stairs", 1000, { state: "unreliable" }, found(-20)),
        floor("attic", 4000, { state: "betterThanFloor" }, found(-31.4)),
      ]),
    );
    expect(
      curve?.columns.flatMap((column) => [
        [column.left.mark, column.left.levelDb],
        [column.right.mark, column.right.levelDb],
      ]),
    ).toEqual([
      ["found", -40],
      ["worseThanCap", null],
      ["unreliable", null],
      ["found", -20],
      ["betterThanFloor", null],
      ["found", -31.4],
    ]);
  });

  it("passes the range and the earlier level through, and spans them all", () => {
    const curve = resultCurve(
      pictureOf([
        floor(
          "cellar",
          250,
          found(-40, { range: { lowDb: -46.2, highDb: -36 }, earlierDb: -52 }),
          found(-38),
        ),
        floor("stairs", 1000, found(-20), found(-12)),
      ]),
    );
    expect(curve?.columns[0]?.left).toEqual({
      ear: "left",
      mark: "found",
      levelDb: -40,
      lowDb: -46.2,
      highDb: -36,
      earlierDb: -52,
    });
    expect(curve?.columns[1]?.left.lowDb).toBeNull();
    expect(curve?.hasEarlier).toBe(true);
    expect(curve?.topDb).toBe(-10);
    expect(curve?.bottomDb).toBe(-60);
  });

  it("draws at most four grid lines, from the top down", () => {
    for (const quietDb of [-15, -35, -64, -90]) {
      const curve = resultCurve(
        pictureOf([
          floor("cellar", 250, found(quietDb), found(-5)),
          floor("stairs", 1000, found(-8), found(-6)),
        ]),
      );
      const grid = curve?.gridDb ?? [];
      expect(grid.length).toBeGreaterThan(0);
      expect(grid.length).toBeLessThanOrEqual(4);
      expect(grid[0]).toBe(curve?.topDb);
      expect([...grid].sort((a, b) => b - a)).toEqual(grid);
      expect(
        (curve?.topDb ?? 0) - (curve?.bottomDb ?? 0),
      ).toBeGreaterThanOrEqual(20);
    }
  });
});
