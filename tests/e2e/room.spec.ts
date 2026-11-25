import { expect, test, type Locator, type Page } from "@playwright/test";
import type { VisitType } from "../../src/config/hearing-method-config";
import { rhythmConfig } from "../../src/config/rhythm-config";
import type { GhostSoundId } from "../../src/config/sound-id";
import {
  creatureCardLabel,
  creatureCaughtCountLine,
  creatureCaughtLine,
  creatureCopy,
  creatureGoneLine,
  creatureIntroLine,
  creatureOtherSideLine,
  creatureSlippedLine,
  oneRoomCopy,
  rollCallCaughtLine,
  rollCallCopy,
  rollCallNotHeardLines,
  stillAboutLine,
} from "../../src/copy/creature-copy";
import { leavingCopy } from "../../src/copy/leaving-copy";
import { practiceCopy } from "../../src/copy/practice-copy";
import { roomCopy } from "../../src/copy/room-copy";
import {
  relitLine,
  rhythmCopy,
  rhythmHudLabel,
} from "../../src/copy/rhythm-copy";
import type {
  RoomSnapshot,
  VisitEvent,
} from "../../src/session/visit-flow-types";
import { visitRooms } from "../../src/session/visit-rooms";
import type { ReplaySheet } from "../../src/ui/visit/start-replay-sheet";
import { devServer } from "./dev-server";
import {
  countOf,
  expectDrawn,
  expectFeatured,
  expectRingsFrom,
  scene,
} from "./scene-record";
import {
  expectNoHorizontalScroll,
  expectNoSeriousAccessibilityProblem,
  openPage,
  overlappingBoxes,
  readSoundSources,
  settle,
  type Box,
} from "./page-checks";
import { simulatedRoomVisit, type RoomMoment } from "./simulated-room";

// The one room of a visit in a real browser: the roll call, the counting, what a scored sound
// shows, the score of the rhythm game, a creature that goes home, and the room at every size of screen. A visit
// takes minutes and its turns are drawn by lot, so these tests do not walk one. A simulated
// visitor walks it in Node, on the fake audio backend, and the development replay sheet draws the
// moments that visit gave, in the order a visitor's page is handed them. That sheet has no sound
// at all, and the browser runs muted all the same. Nothing here checks what a sound is like.
// `visit.spec.ts` walks the real page into the room; the flow behind it is checked in
// `tests/properties`.
test.use({ launchOptions: { args: ["--mute-audio"] } });

const address = `http://localhost:${String(devServer.port)}${devServer.replaySheetPath}`;

type Moments = readonly RoomMoment[];
type Side = "left" | "right";
type SheetWindow = Window & { replaySheet: ReplaySheet };

const sides: readonly Side[] = ["left", "right"];
const otherSide = (side: Side): Side => (side === "left" ? "right" : "left");

/** A visit by a visitor who hears every practice sound, then catches some and lets some by. */
let quick: Moments;
/** A full visit by the same visitor: five creatures, the most the room holds. */
let full: Moments;
/** A visit in which nothing is ever answered. */
let unanswered: Moments;
/** A visit by a visitor who presses at every turn, sound or none, so Jack's flame dims. */
let pressedAlways: Moments;

test.beforeAll(async () => {
  // Inside the playable range: with the calibration these visits keep, every creature's search
  // floor is −35 dB (audible-start, the playable floor).
  const listener = { kind: "thresholds", leftDb: -32, rightDb: -24 } as const;
  quick = await simulatedRoomVisit("full", listener);
  full = await simulatedRoomVisit("full", listener);
  unanswered = await simulatedRoomVisit("full", {
    kind: "extreme",
    name: "neverAnswers",
  });
  pressedAlways = await simulatedRoomVisit("full", {
    kind: "extreme",
    name: "alwaysAnswers",
  });
});

// ─── The moments of a simulated visit ────────────────────────────────────────────────────

/** The index of the first moment from `from` on that passes `test`. Throws when there is none. */
function find(
  moments: Moments,
  what: string,
  test: (moment: RoomMoment, index: number) => boolean,
  from = 0,
): number {
  for (let index = Math.max(0, from); index < moments.length; index += 1) {
    const moment = moments[index];
    if (moment !== undefined && test(moment, index)) {
      return index;
    }
  }
  throw new Error(`The simulated visit has no ${what}.`);
}

/** The snapshot of the room in a moment, or null for any other moment. */
function roomOf(moment: RoomMoment | undefined): RoomSnapshot | null {
  return moment?.kind === "snapshot" && moment.snapshot.stage === "room"
    ? moment.snapshot
    : null;
}

function roomAt(moments: Moments, index: number): RoomSnapshot {
  const room = roomOf(moments[index]);
  if (room === null) {
    throw new Error(`Moment ${String(index)} is not a snapshot of the room.`);
  }
  return room;
}

function eventAt<Kind extends VisitEvent["kind"]>(
  moments: Moments,
  index: number,
  kind: Kind,
): Extract<VisitEvent, { kind: Kind }> {
  const moment = moments[index];
  if (moment?.kind !== "event" || moment.event.kind !== kind) {
    throw new Error(`Moment ${String(index)} is not a ${kind} event.`);
  }
  return moment.event as Extract<VisitEvent, { kind: Kind }>;
}

/** The index of the first snapshot of the room from `from` on. */
const nextRoom = (moments: Moments, from: number): number =>
  find(
    moments,
    "later snapshot of the room",
    (moment) => roomOf(moment) !== null,
    from,
  );

/** The index of the last snapshot of the room before `index`. */
function roomBefore(moments: Moments, index: number): number {
  for (let at = index - 1; at >= 0; at -= 1) {
    if (roomOf(moments[at]) !== null) {
      return at;
    }
  }
  throw new Error(`No snapshot of the room comes before ${String(index)}.`);
}

/** A snapshot of the roll call while a practice sound plays. */
const practiceSoundPlaying = (moment: RoomMoment): boolean => {
  const practice = roomOf(moment)?.practice;
  return practice?.phase === "practice" && practice.soundPlaying;
};

/** A snapshot of the room once it counts, with no pause over it. */
const counting = (moment: RoomMoment): boolean => {
  const room = roomOf(moment);
  return room?.practice?.phase === "counting" && room.pause === null;
};

const practiceScored = (moment: RoomMoment): boolean =>
  moment.kind === "event" && moment.event.kind === "practiceSoundScored";

/** A scored trial with this reaction. */
const scored =
  (reaction: string) =>
  (moment: RoomMoment): boolean =>
    moment.kind === "event" &&
    moment.event.kind === "trialScored" &&
    moment.event.reaction === reaction;

/** The creature whose practice sound plays or waits in a snapshot of the roll call. */
function practisingAt(moments: Moments, index: number): GhostSoundId {
  const id = roomAt(moments, index).practice?.practising?.roomId;
  if (id === undefined) {
    throw new Error(`Nobody is practising at moment ${String(index)}.`);
  }
  return id;
}

// ─── The page ────────────────────────────────────────────────────────────────────────────

/** Hands the page these moments in their order, in one go, as a visit flow would. */
async function hand(page: Page, batch: Moments): Promise<void> {
  await page.evaluate(
    (list) => {
      const { replaySheet } = window as unknown as SheetWindow;
      for (const moment of list) {
        if (moment.kind === "snapshot") {
          replaySheet.show(moment.snapshot);
        } else {
          replaySheet.event(moment.event);
        }
      }
    },
    [...batch],
  );
}

/** Hands a page the moments of one visit, a stretch at a time, and never one twice. */
function walk(page: Page, moments: Moments) {
  let given = 0;
  const stretch = async (end: number): Promise<void> => {
    if (end < given) {
      throw new Error(`Moment ${String(end)} was handed over already.`);
    }
    await hand(page, moments.slice(given, end));
    given = end;
  };
  return {
    /** Every moment not handed over yet that comes before the one at `index`. */
    before: (index: number): Promise<void> => stretch(index),
    /** Every moment not handed over yet, up to and including the one at `index`. */
    through: (index: number): Promise<void> => stretch(index + 1),
  };
}

const requests = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as SheetWindow).replaySheet.requests);

const main = (page: Page): Locator => page.locator("main");
const button = (page: Page, name: string): Locator =>
  page.getByRole("button", { name, exact: true });
const picture = (page: Page): Locator =>
  page.getByRole("img", { name: oneRoomCopy.sceneLabel });
const card = (page: Page, id: GhostSoundId): Locator =>
  page.locator(`.creature-card[data-creature="${id}"]`);
const hud = (page: Page): Locator => page.locator(".rhythm-hud");
const comboCount = (page: Page): Locator => page.locator(".rhythm-combo-count");
/** The box of the score by its name, which says the whole standing of the game. */
const hudNamed = (page: Page, snapshot: RoomSnapshot): Locator => {
  const rhythm = snapshot.rhythm;
  if (rhythm == null) {
    throw new Error("The room keeps no score in this snapshot.");
  }
  return page.getByRole("group", {
    name: rhythmHudLabel(
      rhythm.score,
      rhythm.combo,
      rhythm.flame,
      rhythm.flameMax,
    ),
  });
};
const caption = (page: Page): Locator => page.locator(".visit-caption");
const captionNote = (page: Page): Locator =>
  page.locator(".visit-caption-note");
/**
 * Marks every light on a card that is on the page now. The light of a card stays in the page after
 * it fades, so this is how what a later moment draws is told from what was there.
 */
async function markDrawn(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const drawn of document.querySelectorAll<HTMLElement>(
      ".creature-card-glint",
    )) {
      drawn.dataset.before = "true";
    }
  });
}

/** What matches `selector` and was drawn after the last `markDrawn`. */
const drawnSince = (page: Page, selector: string): Locator =>
  page.locator(`${selector}:not([data-before])`);

/** What an element's transitions are on, and how long the shortest of them takes, in seconds. */
const fadeOf = (part: Locator): Promise<{ on: string; seconds: number }> =>
  part.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      on: style.transitionProperty,
      seconds: Math.min(
        ...style.transitionDuration
          .split(",")
          .map((duration) => Number.parseFloat(duration)),
      ),
    };
  });

/** How many motions on the page never end: a sway, a flicker, a creature shifting where it stands. */
const endlessMotions = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations === Infinity,
        ).length,
  );

/** Where each named part is on the page. Each must be there exactly once, and in view. */
async function boxesOf(
  parts: Readonly<Record<string, Locator>>,
): Promise<Record<string, Box>> {
  const boxes: Record<string, Box> = {};
  for (const [name, part] of Object.entries(parts)) {
    await expect(part, `the ${name}`).toHaveCount(1);
    await expect(part, `the ${name}`).toBeVisible();
    boxes[name] = await part.evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    });
  }
  return boxes;
}

test.describe("the one room", () => {
  test("shows a creature on the side of its practice sound while it plays, and names no side in words", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    const rooms = visitRooms("full");
    const playing = find(quick, "practice sound", practiceSoundPlaying);
    const first = practisingAt(quick, playing);
    const { practice } = roomAt(quick, playing);
    await walk(page, quick).through(playing);

    // The room is in full view, with the words of the roll call under its lantern.
    await expect(main(page)).toHaveAttribute("data-house", "full");
    await expect(main(page)).toHaveAttribute("data-roll-call", "true");
    await expect(main(page)).toHaveAttribute("data-shelf", "shown");
    await expect(picture(page)).toBeVisible();
    await expect(page.locator(".visit-practice-heading")).toHaveText(
      rollCallCopy.heading,
    );
    await expect(page.locator(".visit-practice-lines p")).toHaveText([
      ...rollCallCopy.lines,
    ]);
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(first),
    );
    // A practice sound counts for nothing, so the page may say that one is playing.
    expect(practice?.soundPlayingLine ?? "").not.toBe("");
    await expect(page.locator(".visit-practice-sound")).toHaveText(
      practice?.soundPlayingLine ?? "",
    );
    // The bar has no room to name: there is one room and no order of rooms.
    await expect(page.locator(".visit-room")).toBeHidden();
    await expect(button(page, roomCopy.stopButton)).toBeVisible();
    await expect(button(page, roomCopy.pauseButton)).toBeVisible();
    for (const answer of await page.locator(".visit-answer").all()) {
      await expect(answer).toBeVisible();
    }

    // Practice counts for nothing, so while its sound plays the one that makes it stands on the
    // side the sound comes from (product.md, "Experience rules"). Nothing was drawn for a turn,
    // and no ring went out.
    const ear = practice?.soundEar;
    if (ear == null) {
      throw new Error("A practice sound that plays has a side.");
    }
    await expectFeatured(page, first, ear, true);
    await expectDrawn(page, "none");
    await expect(scene(page)).toHaveAttribute("data-rings", "0");

    // Every creature of the visit has its card, and the card of the one that is sounding says so.
    await expect(page.locator(".creature-card")).toHaveCount(rooms.length);
    for (const { roomId } of rooms) {
      await expect(card(page, roomId)).toHaveAttribute(
        "data-state",
        roomId === first ? "calling" : "about",
      );
      await expect(
        card(page, roomId).getByRole("img", {
          name: creatureIntroLine(roomId),
          exact: true,
        }),
      ).toBeVisible();
      await expect(card(page, roomId).locator(".creature-name")).toHaveText(
        creatureCopy[roomId].name,
      );
      // Nothing counts yet, so no card counts anything.
      await expect(card(page, roomId).locator(".creature-status")).toHaveText(
        "",
      );
    }

    // Nothing is scored at the roll call: a warm-up, with no score, combo or flame.
    await expect(page.locator(".rhythm-warm-up")).toHaveText(
      rhythmCopy.warmUpWord,
    );
    await expect(page.locator(".rhythm-score")).toBeHidden();
    await expect(page.locator(".rhythm-combo")).toBeHidden();
    await expect(page.locator(".rhythm-flame")).toBeHidden();

    // The same creature's sound in the other ear stands it on the other side, and the words of
    // the page stay the same: they never name a side.
    const firstScored = find(quick, "scored practice sound", practiceScored);
    const again = find(
      quick,
      "second practice sound",
      practiceSoundPlaying,
      firstScored,
    );
    const secondScored = find(
      quick,
      "second scored practice sound",
      practiceScored,
      again,
    );
    expect(practisingAt(quick, again)).toBe(first);
    expect(eventAt(quick, secondScored, "practiceSoundScored").trial.ear).toBe(
      otherSide(eventAt(quick, firstScored, "practiceSoundScored").trial.ear),
    );
    const words = await page.locator(".visit-practice").innerText();
    await hand(page, quick.slice(again, again + 1));
    expect(roomAt(quick, again).practice?.soundEar).toBe(otherSide(ear));
    await expectFeatured(page, first, otherSide(ear), true);
    expect(await page.locator(".visit-practice").innerText()).toBe(words);

    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);
    // The page has no sound of its own: the flow alone would start one, and there is none here.
    const sources = await readSoundSources(page);
    expect(sources.counts).toEqual({ audioContexts: 0, mediaElements: 0 });
    expect(sources.mediaElementsInDocument).toBe(0);
    expect(record.pageErrors).toEqual([]);
    expect(record.otherOriginRequests).toEqual([]);
  });

  test("answers a caught practice sound with rings from the side that was answered, a hop and the creature's name", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, quick);
    const caughtAt = find(
      quick,
      "caught practice sound",
      (moment) =>
        moment.kind === "event" &&
        moment.event.kind === "practiceSoundScored" &&
        moment.event.reaction === "ripple",
    );
    const event = eventAt(quick, caughtAt, "practiceSoundScored");
    const { roomId } = event.room;
    const side = event.trial.ear;

    // Until the answer, nothing.
    await steps.before(caughtAt);
    await expect(scene(page)).toHaveAttribute("data-rings", "0");
    await expect(scene(page)).toHaveAttribute("data-cheers", "0");
    await expect(caption(page)).not.toHaveAttribute("data-shown", "true");
    await expect(page.locator(".creature-card-glint")).toHaveCount(0);

    // The answer: rings from the side that was pressed, a hop where the creature stands, its
    // name under the room and a light on its card.
    await steps.through(caughtAt);
    await expect(scene(page)).toHaveAttribute("data-rings", "1");
    await expectRingsFrom(page, side);
    await expectFeatured(page, roomId);
    await expect(scene(page)).toHaveAttribute("data-cheers", "1");
    expect(event.line).toBe(rollCallCaughtLine(roomId));
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(rollCallCaughtLine(roomId));
    await expect(
      card(page, roomId).locator(".creature-card-glint"),
    ).toHaveCount(1);
    // The creature itself never goes to a side at the roll call.
    await expectDrawn(page, "none");

    // It waits where it stands for its sound in the other ear, and says nothing meanwhile.
    const waiting = nextRoom(quick, caughtAt);
    expect(practisingAt(quick, waiting)).toBe(roomId);
    await steps.through(waiting);
    await expectFeatured(page, roomId, "centre", false);
    await expect(page.locator(".visit-practice-sound")).toBeHidden();
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(roomId),
    );

    // Then the next one takes its place, and the one before fades out of sight on the canvas.
    const handOver = find(
      quick,
      "second creature at the roll call",
      (moment) => {
        const practice = roomOf(moment)?.practice;
        const id = practice?.practising?.roomId;
        return (
          practice?.phase === "practice" && id !== undefined && id !== roomId
        );
      },
      waiting,
    );
    const next = practisingAt(quick, handOver);
    await steps.through(handOver);
    await expectFeatured(page, next, "centre");
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(next),
    );
    await expect(card(page, next)).toHaveAttribute("data-state", "calling");
    await expect(card(page, roomId)).toHaveAttribute("data-state", "about");
  });

  test("begins to count with Jack's flame full, cards that count, and nobody in view", async ({
    page,
  }) => {
    await openPage(page, address);
    const rooms = visitRooms("full");
    const start = find(quick, "counting", counting);
    const snapshot = roomAt(quick, start);
    await walk(page, quick).through(start);

    // The words change to those of the counting, in the same place.
    await expect(page.locator(".visit-practice-heading")).toBeHidden();
    await expect(page.locator(".visit-practice-lines p")).toHaveText([
      ...rollCallCopy.countingLines,
    ]);
    await expect(page.locator(".room-intro")).toBeHidden();
    await expect(page.locator(".visit-practice-sound")).toBeHidden();
    await expect(main(page)).not.toHaveAttribute("data-roll-call", "true");

    // Nobody stands in view from here on: who makes a counted sound is shown only once it is
    // answered or has gone by.
    await expectFeatured(page, null);
    await expectDrawn(page, "none");

    // The score begins from nothing, with Jack's flame full, and the box of it has a name.
    expect(snapshot.rhythm).toMatchObject({
      score: 0,
      combo: 0,
      flame: rhythmConfig.flameMax,
    });
    await expect(hudNamed(page, snapshot)).toBeVisible();
    await expect(comboCount(page)).toHaveText("0");
    await expect(page.locator(".rhythm-warm-up")).toBeHidden();
    await expect(page.locator(".rhythm-relit")).toBeHidden();

    // The bar says how many are still about, and each card counts its own creature.
    await expect(page.locator(".visit-room-name")).toHaveText(
      stillAboutLine(rooms.length),
    );
    await expect(page.locator(".visit-room-progress")).toHaveText("");
    await expect(
      page.getByRole("list", { name: oneRoomCopy.shelfLabel }),
    ).toBeVisible();
    for (const { roomId } of rooms) {
      await expect(card(page, roomId)).toHaveAttribute("data-state", "about");
      await expect(card(page, roomId).locator(".creature-status")).toHaveText(
        creatureCaughtCountLine(0),
      );
      await expect(
        card(page, roomId).getByRole("img", {
          name: creatureCardLabel(roomId, "about", 0, {
            left: null,
            right: null,
          }),
          exact: true,
        }),
      ).toBeVisible();
      for (const side of sides) {
        await expect(
          card(page, roomId).locator(`.creature-bar-${side}`),
        ).toHaveAttribute("data-caught", "false");
      }
    }
    for (const answer of await page.locator(".visit-answer").all()) {
      await expect(answer).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);
  });

  test("kicks the creature of a caught sound away on its side, and counts it on its card", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, quick);
    const start = find(quick, "counting", counting);
    const caughtAt = find(quick, "caught sound", scored("ripple"), start);
    const event = eventAt(quick, caughtAt, "trialScored");
    if (event.trial.kind !== "sound") {
      throw new Error("A caught trial is a sound.");
    }
    const { roomId } = event.room;
    const side = event.trial.ear;

    // Up to the answer nothing of this sound is drawn.
    await steps.before(caughtAt);
    const drawingsBefore = await countOf(page, "drawings");
    const ringsBefore = await countOf(page, "rings");
    await markDrawn(page);

    // The answer: the creature kicked away on the sound's side, rings from it, and what the
    // house says.
    await steps.through(caughtAt);
    await expectDrawn(page, "caught", side, roomId);
    expect(await countOf(page, "drawings")).toBe(drawingsBefore + 1);
    expect(await countOf(page, "rings")).toBe(ringsBefore + 1);
    await expectRingsFrom(page, side);
    await expectFeatured(page, null);
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(
      creatureCaughtLine(
        roomId,
        side,
        event.room.frequencyHz,
        event.trial.playedLevelDb,
      ),
    );
    // Its card lights afresh: the light of its practice sound was there before.
    await expect(
      card(page, roomId).locator(".creature-card-glint"),
    ).toHaveCount(1);
    await expect(
      drawnSince(
        page,
        `.creature-card[data-creature="${roomId}"] .creature-card-glint`,
      ),
    ).toHaveCount(1);

    // The snapshot that follows counts it: in the combo and on the creature's own card,
    // with a bar for the quietest catch on that side.
    const countedAt = nextRoom(quick, caughtAt);
    const counted = roomAt(quick, countedAt);
    const creature = counted.creatures?.find(
      ({ room }) => room.roomId === roomId,
    );
    if (creature === undefined || counted.chase == null) {
      throw new Error("The snapshot after a catch has no count of it.");
    }
    await steps.through(countedAt);
    expect(creature.caughtCount).toBe(1);
    await expect(comboCount(page)).toHaveText(
      String(counted.rhythm?.combo ?? 0),
    );
    await expect(hudNamed(page, counted)).toBeVisible();
    await expect(card(page, roomId).locator(".creature-status")).toHaveText(
      creatureCaughtCountLine(1),
    );
    await expect(
      card(page, roomId).getByRole("img", {
        name: creatureCardLabel(roomId, "about", 1, creature.deepestCaughtDb),
        exact: true,
      }),
    ).toBeVisible();
    const caughtLevelDb = creature.deepestCaughtDb[side];
    if (caughtLevelDb === null) {
      throw new Error("The card has no quietest catch on the side of it.");
    }
    for (const barSide of sides) {
      await expect(
        card(page, roomId).locator(`.creature-bar-${barSide}`),
      ).toHaveAttribute(
        "data-caught",
        creature.deepestCaughtDb[barSide] === null ? "false" : "true",
      );
    }
    // The bar is as deep as the catch is quiet, between the loudest and the quietest sound this
    // creature makes.
    const depth = await card(page, roomId)
      .locator(`.creature-bar-${side}`)
      .evaluate((bar) =>
        Number((bar as HTMLElement).style.getPropertyValue("--creature-depth")),
      );
    expect(depth).toBeCloseTo(
      (creature.topLevelDb - caughtLevelDb) /
        (creature.topLevelDb - creature.floorLevelDb),
      6,
    );
    expect(depth).toBeGreaterThanOrEqual(0);
    expect(depth).toBeLessThanOrEqual(1);
    // No other card moved.
    for (const other of counted.creatures ?? []) {
      if (other.room.roomId !== roomId) {
        await expect(
          card(page, other.room.roomId).locator(".creature-status"),
        ).toHaveText(creatureCaughtCountLine(other.caughtCount));
      }
    }

    // Turns in a row are counted in the combo, which glows once it runs high.
    const comboAt = find(
      quick,
      "combo of two",
      (moment) => (roomOf(moment)?.rhythm?.combo ?? 0) >= 2,
      countedAt,
    );
    await steps.through(comboAt);
    await expect(comboCount(page)).toHaveText(
      String(roomAt(quick, comboAt).rhythm?.combo ?? 0),
    );
    await expect(page.locator(".rhythm-combo")).not.toHaveAttribute(
      "data-combo",
      "none",
    );
  });

  test("lets a sound that went by bite Jack from its side", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, quick);
    const start = find(quick, "counting", counting);
    const slippedAt = find(
      quick,
      "sound that went by",
      scored("slipped"),
      start,
    );
    const event = eventAt(quick, slippedAt, "trialScored");
    if (event.trial.kind !== "sound") {
      throw new Error("A trial that went by is a sound.");
    }
    const { roomId } = event.room;
    const side = event.trial.ear;

    await steps.before(slippedAt);
    const ringsBefore = await countOf(page, "rings");
    await markDrawn(page);
    await steps.through(slippedAt);

    // Its creature, from the side it came from, reaches Jack, with no ring: it was not caught.
    await expectDrawn(page, "slipped", side, roomId);
    expect(await countOf(page, "rings")).toBe(ringsBefore);
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(creatureSlippedLine(roomId, side));
    // No card lights for a sound that was not caught.
    await expect(drawnSince(page, ".creature-card-glint")).toHaveCount(0);
  });

  test("says which side a sound was on when the other side was answered, and its fixed line when there was no sound to kick", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, pressedAlways);
    const start = find(pressedAlways, "counting", counting);

    // An answer to a turn with no sound: the house says so, and the kick meets only smoke.
    const silenceAt = find(
      pressedAlways,
      "answer to a turn with no sound",
      scored("noSoundLine"),
      start,
    );
    expect(eventAt(pressedAlways, silenceAt, "trialScored").trial.kind).toBe(
      "noSound",
    );
    await steps.before(silenceAt);
    const ringsBefore = await countOf(page, "rings");
    await steps.through(silenceAt);
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(roomCopy.noSoundLine);
    await expect(scene(page)).toHaveAttribute("data-outcome", "trick");
    await expect(scene(page)).toHaveAttribute("data-outcome-creature", "none");
    expect(await countOf(page, "rings")).toBe(ringsBefore);

    // A sound answered on the other side: its creature bites Jack from the side the sound came
    // from, and the house names that side.
    const otherSideAt = find(
      pressedAlways,
      "sound answered on the other side",
      scored("otherSide"),
      silenceAt,
    );
    const event = eventAt(pressedAlways, otherSideAt, "trialScored");
    if (event.trial.kind !== "sound") {
      throw new Error("A trial answered on the other side is a sound.");
    }
    const { roomId } = event.room;
    const side = event.trial.ear;
    await steps.before(otherSideAt);
    const ringsBeforeBite = await countOf(page, "rings");
    await steps.through(otherSideAt);
    await expectDrawn(page, "slipped", side, roomId);
    expect(await countOf(page, "rings")).toBe(ringsBeforeBite);
    await expect(caption(page)).toHaveText(creatureOtherSideLine(roomId, side));
  });

  test("says only that nothing came when a turn with no sound goes by unanswered, and lets its shadows go", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, quick);
    const start = find(quick, "counting", counting);
    // Since the game layer of 2026-11-17 the house says that nothing came, once the turn is over,
    // so that a long silence is never left without a word. In the yard both shadows go, alike.
    const silenceAt = find(
      quick,
      "unanswered turn with no sound",
      scored("nothingCame"),
      start,
    );
    expect(eventAt(quick, silenceAt, "trialScored").trial.kind).toBe("noSound");
    await steps.before(silenceAt);
    const ringsBefore = await countOf(page, "rings");
    await steps.through(silenceAt);
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(roomCopy.nothingCameLine);
    await expectDrawn(page, "steady");
    expect(await countOf(page, "rings")).toBe(ringsBefore);
  });

  test("dims Jack's flame as the creatures reach him, and names it for every visitor", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, pressedAlways);
    const start = find(pressedAlways, "counting", counting);
    const dimAt = find(
      pressedAlways,
      "a flame below full",
      (moment) =>
        counting(moment) &&
        (roomOf(moment)?.rhythm?.flame ?? rhythmConfig.flameMax) <
          rhythmConfig.flameMax,
      start,
    );
    const dimmed = roomAt(pressedAlways, dimAt);
    await steps.through(dimAt);
    await expect(hudNamed(page, dimmed)).toBeVisible();
    const flame = await page
      .locator(".rhythm-flame-fill")
      .evaluate((bar) =>
        Number((bar as HTMLElement).style.getPropertyValue("--flame")),
      );
    expect(flame).toBeCloseTo(
      Math.round(dimmed.rhythm?.flame ?? 0) / rhythmConfig.flameMax,
      6,
    );
    expect(flame).toBeLessThan(1);
    // A candle that went out is lit again, and the box says so.
    const relitAt = pressedAlways.findIndex(
      (moment, index) =>
        index > dimAt &&
        counting(moment) &&
        (roomOf(moment)?.rhythm?.relights ?? 0) > 0,
    );
    if (relitAt >= 0) {
      await steps.through(relitAt);
      await expect(page.locator(".rhythm-relit")).toHaveText(
        relitLine(roomAt(pressedAlways, relitAt).rhythm?.relights ?? 0) ?? "",
      );
    }
    await expectNoSeriousAccessibilityProblem(page);
  });

  test("sends a creature home when its search is over, on its card and in a line of its own", async ({
    page,
  }) => {
    await openPage(page, address);
    const rooms = visitRooms("full");
    const steps = walk(page, quick);
    const goneAt = find(
      quick,
      "search that ended",
      (moment) =>
        moment.kind === "event" && moment.event.kind === "roomFinished",
    );
    const { roomId } = eventAt(quick, goneAt, "roomFinished").room;

    await steps.before(goneAt);
    await expect(card(page, roomId)).toHaveAttribute("data-state", "about");
    await expect(page.locator(".visit-room-name")).toHaveText(
      stillAboutLine(rooms.length),
    );
    const lastLine = await caption(page).textContent();

    // The line about its last sound stays, and a second line under it says where it went.
    await steps.through(goneAt);
    await expect(captionNote(page)).toHaveAttribute("data-shown", "true");
    await expect(captionNote(page)).toHaveText(creatureGoneLine(roomId));
    await expect(caption(page)).toHaveText(lastLine ?? "");

    // The snapshot that follows puts it to sleep on its card and counts one fewer about.
    const afterAt = nextRoom(quick, goneAt);
    const creature = roomAt(quick, afterAt).creatures?.find(
      ({ room }) => room.roomId === roomId,
    );
    if (creature === undefined) {
      throw new Error("The snapshot after a search ended has no such card.");
    }
    expect(creature.state).toBe("gone");
    await steps.through(afterAt);
    await expect(card(page, roomId)).toHaveAttribute("data-state", "gone");
    await expect(card(page, roomId).locator(".creature-status")).toHaveText(
      oneRoomCopy.goneLabel,
    );
    await expect(
      card(page, roomId).getByRole("img", {
        name: creatureCardLabel(
          roomId,
          "gone",
          creature.caughtCount,
          creature.deepestCaughtDb,
        ),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".visit-room-name")).toHaveText(
      stillAboutLine(rooms.length - 1),
    );
    // The others are still about, and the room still takes answers.
    for (const { roomId: other } of rooms) {
      if (other !== roomId) {
        await expect(card(page, other)).toHaveAttribute("data-state", "about");
      }
    }
    for (const answer of await page.locator(".visit-answer").all()) {
      await expect(answer).toBeVisible();
    }
    await expectNoSeriousAccessibilityProblem(page);
  });

  test("offers to try again or to go on when no practice sound was caught", async ({
    page,
  }) => {
    await openPage(page, address);
    const rooms = visitRooms("full");
    const noticeAt = find(
      unanswered,
      "roll call that was not heard",
      (moment) => roomOf(moment)?.pause?.reason === "practiceNotHeard",
    );
    await walk(page, unanswered).through(noticeAt);

    // The notice names every creature, on either side, and says what each choice does.
    const lines = rollCallNotHeardLines(
      rooms.flatMap(({ roomId }) => sides.map((side) => ({ roomId, side }))),
    );
    expect(roomAt(unanswered, noticeAt).practice?.notHeardLines).toEqual(lines);
    const notice = page.locator(".visit-sheet-notice");
    await expect(notice).toBeVisible();
    await expect(
      page.getByRole("heading", { name: rollCallCopy.heading }),
    ).toBeFocused();
    for (const line of lines) {
      await expect(notice.getByText(line, { exact: true })).toBeVisible();
    }
    for (const { roomId } of rooms) {
      expect(lines[0]).toContain(`${creatureCopy[roomId].name} on either side`);
    }
    await expect(button(page, practiceCopy.tryAgainLabel)).toBeVisible();
    await expect(button(page, practiceCopy.goOnLabel)).toBeVisible();

    // The room waits behind it, only just there: nobody stands in it and it takes no answer.
    await expect(main(page)).toHaveAttribute("data-house", "faint");
    await expectFeatured(page, null);
    for (const answer of await page.locator(".visit-answer").all()) {
      await expect(answer).toBeHidden();
    }
    await expect(button(page, roomCopy.pauseButton)).toBeHidden();
    await expect(button(page, roomCopy.stopButton)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    await button(page, practiceCopy.tryAgainLabel).click();
    expect(await requests(page)).toEqual(["resume"]);
  });

  test("waits behind a pause as it was, and comes back with an empty yard", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, quick);
    const start = find(quick, "counting", counting);
    const caughtAt = find(quick, "caught sound", scored("ripple"), start);
    const countedAt = nextRoom(quick, caughtAt);
    const counted = roomAt(quick, countedAt);
    await steps.through(countedAt);
    await expect(scene(page)).toHaveAttribute("data-outcome", "caught");

    // A pause: a notice over the room, which keeps its cards and its count behind it.
    const paused: RoomSnapshot = { ...counted, pause: { reason: "visitor" } };
    await hand(page, [{ kind: "snapshot", snapshot: paused }]);
    await expect(
      page.getByRole("heading", { name: leavingCopy.pauseHeading }),
    ).toBeFocused();
    await expect(page.locator(".visit-sheet-notice")).toContainText(
      leavingCopy.pauseLines.visitor,
    );
    await expect(main(page)).toHaveAttribute("data-house", "faint");
    for (const answer of await page.locator(".visit-answer").all()) {
      await expect(answer).toBeHidden();
    }
    await expect(button(page, roomCopy.pauseButton)).toBeHidden();
    await expect(page.locator(".creature-card")).toHaveCount(
      counted.creatures?.length ?? 0,
    );
    // Behind a sheet the score is put away.
    await expect(hud(page)).toBeHidden();
    await expectNoSeriousAccessibilityProblem(page);

    await button(page, leavingCopy.goOnButton).click();
    expect(await requests(page)).toEqual(["resume"]);

    // Back in the room: what the last sound left in the yard is long out of sight, the score
    // has its name again, and the keys answer.
    await hand(page, [{ kind: "snapshot", snapshot: counted }]);
    await expect(main(page)).toHaveAttribute("data-house", "full");
    await expect(main(page)).toBeFocused();
    await expectDrawn(page, "none");
    await expectRingsFrom(page, null);
    await expect(hudNamed(page, counted)).toBeVisible();
    for (const answer of await page.locator(".visit-answer").all()) {
      await expect(answer).toBeVisible();
    }
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const motion =
      reducedMotion === "reduce" ? "with less motion" : "with every motion";
    test(`shows who is sounding, what was caught and what went by, ${motion}`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await openPage(page, address);
      const steps = walk(page, quick);

      // The roll call: the creature in the middle of the room is there to see either way. With
      // less motion nothing on the page moves by itself, the yard included. With every motion the
      // yard does.
      const playing = find(quick, "practice sound", practiceSoundPlaying);
      await steps.through(playing);
      await settle(page);
      await expectFeatured(page, practisingAt(quick, playing));
      const yardMotion = reducedMotion === "reduce" ? "still" : "moving";
      await expect(scene(page)).toHaveAttribute("data-motion", yardMotion);
      if (reducedMotion === "reduce") {
        expect(await endlessMotions(page)).toBe(0);
      }

      // A caught sound: its creature is kicked away on its side.
      const start = find(quick, "counting", counting);
      const caughtAt = find(quick, "caught sound", scored("ripple"), start);
      const caught = eventAt(quick, caughtAt, "trialScored");
      await steps.through(caughtAt);
      await expectDrawn(page, "caught", caught.trial.ear, caught.room.roomId);

      // A sound that went by: its creature bites Jack from its side.
      const slippedAt = find(
        quick,
        "sound that went by",
        scored("slipped"),
        caughtAt,
      );
      const slipped = eventAt(quick, slippedAt, "trialScored");
      await steps.through(slippedAt);
      await expectDrawn(
        page,
        "slipped",
        slipped.trial.ear,
        slipped.room.roomId,
      );

      // The yard moves only with every motion, and every change of the room's brightness stays
      // a fade either way (audio-safety, rule 9).
      await expect(hud(page)).toBeVisible();
      await expect(scene(page)).toHaveAttribute("data-motion", yardMotion);
      if (reducedMotion === "reduce") {
        expect(await endlessMotions(page)).toBe(0);
      }
      for (const part of [".room-picture", ".room-scene"]) {
        const fade = await fadeOf(page.locator(part));
        expect(fade.on, part).toContain("opacity");
        expect(fade.seconds, part).toBeGreaterThanOrEqual(0.2);
      }
    });
  }

  // ─── The room at every size of screen ──────────────────────────────────────────────────

  /** A creature of this visit with the longest introduction. */
  function longestIntroduction(visitType: VisitType): GhostSoundId {
    const [longest] = visitRooms(visitType)
      .map(({ roomId }) => roomId)
      .sort(
        (a, b) => creatureIntroLine(b).length - creatureIntroLine(a).length,
      );
    if (longest === undefined) {
      throw new Error("The visit has no creature.");
    }
    return longest;
  }

  /** The parts of the room that are there in every state of it. */
  const fixedParts = (page: Page): Record<string, Locator> => ({
    stop: button(page, roomCopy.stopButton),
    pause: button(page, roomCopy.pauseButton),
    "left answer": page.locator(".visit-answer-left .visit-answer-hint"),
    "right answer": page.locator(".visit-answer-right .visit-answer-hint"),
  });

  /** The card of every creature of the longest visit. */
  const cardsOf = (page: Page): Record<string, Locator> =>
    Object.fromEntries(
      visitRooms("full").map(({ roomId }) => [
        `card of ${creatureCopy[roomId].name}`,
        card(page, roomId),
      ]),
    );

  /**
   * On a phone on its side the cards wait until the counting begins: the page is not tall enough
   * for them and for everything the roll call says (`src/ui/room/room.css`). At every other size
   * they are there from the start.
   */
  const cardsWaitThroughRollCall = (size: {
    width: number;
    height: number;
  }): boolean => size.width > size.height && size.height <= 520;

  /** The words on the cards that are cut off at an edge of their card. None should be. */
  const clippedCardWords = (page: Page): Promise<string[]> =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          ".creature-name, .creature-status",
        ),
      ]
        .filter(
          (words) =>
            words.getClientRects().length > 0 &&
            words.scrollWidth > words.clientWidth,
        )
        .map((words) => words.textContent ?? ""),
    );

  for (const size of [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
    { width: 640, height: 360 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1280, height: 800 },
  ]) {
    const sizeName = `${String(size.width)} by ${String(size.height)}`;
    test(`keeps everything in the room apart and on the page at ${sizeName}`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(size);
      // Measured with the page at rest. The lantern sways and the creatures shift where they
      // stand, so with every motion each box would depend on the instant it was read at. Less
      // motion changes no size and no place: it only stops what moves by itself.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openPage(page, address);

      /** Nothing lies over anything else, and everything is on the page. */
      const expectApart = async (
        state: string,
        parts: Record<string, Locator>,
      ): Promise<Record<string, Box>> => {
        await settle(page);
        const boxes = await boxesOf(parts);
        expect(overlappingBoxes(boxes), state).toEqual([]);
        for (const [name, box] of Object.entries(boxes)) {
          const where = `the ${name}, ${state}`;
          expect(box.x, where).toBeGreaterThanOrEqual(-0.5);
          expect(box.y, where).toBeGreaterThanOrEqual(-0.5);
          expect(box.x + box.width, where).toBeLessThanOrEqual(
            size.width + 0.5,
          );
          expect(box.y + box.height, where).toBeLessThanOrEqual(
            size.height + 0.5,
          );
        }
        expect(await clippedCardWords(page), state).toEqual([]);
        await expectNoHorizontalScroll(page);
        return boxes;
      };

      // The roll call of a full visit, with the creature whose introduction is the longest.
      const longest = longestIntroduction("full");
      const playing = find(
        full,
        "practice sound of the creature with the longest introduction",
        (moment) =>
          practiceSoundPlaying(moment) &&
          roomOf(moment)?.practice?.practising?.roomId === longest,
      );
      await hand(page, full.slice(0, playing + 1));
      const cardsWait = cardsWaitThroughRollCall(size);
      await expectApart("at the roll call", {
        ...fixedParts(page),
        ...(cardsWait ? {} : cardsOf(page)),
        heading: page.locator(".visit-practice-heading"),
        words: page.locator(".visit-practice-lines"),
        introduction: page.locator(".room-intro"),
        "line of the sound": page.locator(".visit-practice-sound"),
        "warm-up": page.locator(".rhythm-warm-up"),
      });
      if (cardsWait) {
        for (const [name, part] of Object.entries(cardsOf(page))) {
          await expect(part, `the ${name}, at the roll call`).toBeHidden();
        }
      }
      // The yard keeps a useful size: the whole width of the page, and tall enough to see Jack
      // and the creatures on a phone on its side.
      const yard = await boxesOf({ yard: page.locator(".room-picture") });
      expect(yard.yard?.width ?? 0).toBeGreaterThanOrEqual(size.width - 1);
      expect(yard.yard?.height ?? 0).toBeGreaterThanOrEqual(150);

      // The counting, just after a search ended on a catch: the line about the catch, the line
      // about the creature going home, and the counts beside the lantern.
      const goneAt = find(
        full,
        "search that ended on a catch",
        (moment, index) =>
          moment.kind === "event" &&
          moment.event.kind === "roomFinished" &&
          scored("ripple")(full[index - 1] ?? moment),
      );
      const afterAt = nextRoom(full, goneAt);
      const after = roomAt(full, afterAt);
      await hand(page, [...full.slice(roomBefore(full, goneAt), afterAt + 1)]);
      await expect(caption(page)).toHaveAttribute("data-shown", "true");
      await expect(captionNote(page)).toHaveAttribute("data-shown", "true");
      // The cards are there at every size once it counts.
      const countingParts = {
        ...fixedParts(page),
        ...cardsOf(page),
        "bar's words": page.locator(".visit-room"),
        combo: page.locator(".rhythm-combo"),
        score: page.locator(".rhythm-score"),
        "what the house says": caption(page),
        "where it went": captionNote(page),
      };
      await expectApart("while it counts", {
        ...countingParts,
        words: page.locator(".visit-practice-lines"),
        flame: page.locator(".rhythm-flame"),
      });

      // The same moment made as crowded as a room can get, by hand: a candle lit again many
      // times, a long score and combo, and long counts on every card.
      if (after.rhythm == null || after.chase == null) {
        throw new Error("The room does not count in this snapshot.");
      }
      const crowded: RoomSnapshot = {
        ...after,
        rhythm: {
          ...after.rhythm,
          score: 9_999_999,
          combo: 888,
          maxCombo: 888,
          flame: 0,
          relights: 88,
        },
        chase: { ...after.chase, caughtCount: 88, streak: 88 },
        creatures: (after.creatures ?? []).map((creature) => ({
          ...creature,
          caughtCount: 28,
        })),
      };
      await hand(page, [{ kind: "snapshot", snapshot: crowded }]);
      await expectApart("with a long score and long counts", {
        ...countingParts,
        "line of the relit candle": page.locator(".rhythm-relit"),
      });
    });
  }
});
