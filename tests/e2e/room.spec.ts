import { expect, test, type Locator, type Page } from "@playwright/test";
import type { VisitType } from "../../src/config/hearing-method-config";
import { lanternConfig } from "../../src/config/lantern-config";
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
import {
  caughtCountLine,
  chaseCopy,
  lanternLabel,
  roomCopy,
  streakLine,
} from "../../src/copy/room-copy";
import type {
  RoomSnapshot,
  VisitEvent,
} from "../../src/session/visit-flow-types";
import { visitRooms } from "../../src/session/visit-rooms";
import type { ReplaySheet } from "../../src/ui/visit/start-replay-sheet";
import { devServer } from "./dev-server";
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
// shows, the lantern, a creature that goes home, and the room at every size of screen. A visit
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

/** A quick visit by a visitor who hears every practice sound, then catches some and lets some by. */
let quick: Moments;
/** A full visit by the same visitor: five creatures, the most the room holds. */
let full: Moments;
/** A quick visit in which nothing is ever answered. */
let unanswered: Moments;
/** A quick visit by a visitor who presses at every turn, sound or none, so the lantern goes dark. */
let pressedAlways: Moments;

test.beforeAll(async () => {
  // Inside the playable range: with the calibration these visits keep, every creature's search
  // floor is −35 dB (audible-start, the playable floor).
  const listener = { kind: "thresholds", leftDb: -32, rightDb: -24 } as const;
  quick = await simulatedRoomVisit("quick", listener);
  full = await simulatedRoomVisit("full", listener);
  unanswered = await simulatedRoomVisit("quick", {
    kind: "extreme",
    name: "neverAnswers",
  });
  pressedAlways = await simulatedRoomVisit("quick", {
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
const centre = ".room-stage-centre";
/**
 * Whoever stands in plain view in a place. One that is leaving stays in the page until its place
 * is taken again, so it is left out.
 */
const standing = (page: Page, place = ""): Locator =>
  page.locator(`${place} .room-figure:not([data-leaving="true"])`);
/** Everything a doorway can show of a creature: one that stands in it, and one seen for a sound. */
const inDoorway = (page: Page, side: Side): Locator =>
  page.locator(
    `.room-door-${side} .room-figure, .room-door-${side} .room-sighting`,
  );
const card = (page: Page, id: GhostSoundId): Locator =>
  page.locator(`.creature-card[data-creature="${id}"]`);
const lantern = (page: Page): Locator => page.locator(".visit-lantern");
const litCells = (page: Page): Locator =>
  page.locator(".visit-lantern-cell[data-lit='true']");
const caption = (page: Page): Locator => page.locator(".visit-caption");
const captionNote = (page: Page): Locator =>
  page.locator(".visit-caption-note");
const mainMarkup = (page: Page): Promise<string> =>
  page.evaluate(() => document.querySelector("main")?.outerHTML ?? "");

/**
 * Marks every ring, every sighting, every light of a doorway and every light on a card that is on
 * the page now. The rings of an answered sound and the light of a card stay in the page after they
 * fade, so this is how what a later moment draws is told from what was there.
 */
async function markDrawn(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const drawn of document.querySelectorAll<HTMLElement>(
      ".room-ring, .room-sighting, .room-door-light > span, .creature-card-glint",
    )) {
      drawn.dataset.before = "true";
    }
  });
}

/** What matches `selector` and was drawn after the last `markDrawn`. */
const drawnSince = (page: Page, selector: string): Locator =>
  page.locator(`${selector}:not([data-before])`);

const opacityOf = (part: Locator): Promise<number> =>
  part.evaluate((element) => Number(getComputedStyle(element).opacity));

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
  test("calls a creature to the middle of the room for its practice sound, and shows no side", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    const rooms = visitRooms("quick");
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

    // The one that makes the sound stands in the middle of the room, which is no side.
    await expect(standing(page)).toHaveCount(1);
    const figure = standing(page, centre);
    await expect(figure).toHaveAttribute("data-creature", first);
    await expect(figure).toHaveAttribute("data-sounding", "true");
    await settle(page);
    expect(await opacityOf(figure)).toBe(1);
    const place = await boxesOf({ figure });
    const pageWidth = await page.evaluate(() => window.innerWidth);
    expect((place.figure?.x ?? 0) + (place.figure?.width ?? 0) / 2).toBeCloseTo(
      pageWidth / 2,
      0,
    );
    // Neither doorway shows anything, and no ring was drawn.
    for (const side of sides) {
      await expect(inDoorway(page, side)).toHaveCount(0);
      await expect(
        page.locator(`.room-door-${side} .room-door-light > span`),
      ).toHaveCount(0);
    }
    await expect(page.locator(".room-ring")).toHaveCount(0);

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

    // The lantern hangs unlit and unnamed, and nothing is counted beside it.
    await expect(page.locator(".visit-lantern-cell")).toHaveCount(
      lanternConfig.cellCount,
    );
    await expect(litCells(page)).toHaveCount(0);
    await expect(lantern(page)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".visit-chase-caught")).toBeHidden();
    await expect(page.locator(".visit-chase-streak")).toBeHidden();

    // The same creature's sound in the other ear is drawn as the very same page: a visitor who
    // watches the screen learns that a practice sound is playing and whose it is, never where.
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
    const drawn = await mainMarkup(page);
    await hand(page, quick.slice(again, again + 1));
    expect(await mainMarkup(page)).toBe(drawn);

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
    await expect(page.locator(".room-ring")).toHaveCount(0);
    await expect(page.locator(".room-figure-cheer")).toHaveCount(0);
    await expect(caption(page)).not.toHaveAttribute("data-shown", "true");
    await expect(page.locator(".creature-card-glint")).toHaveCount(0);

    // The answer: rings from the side that was pressed, a hop where the creature stands, its
    // name under the room and a light on its card.
    await steps.through(caughtAt);
    await expect(page.locator(`.room-rings-${side} .room-ring`)).toHaveCount(3);
    await expect(
      page.locator(`.room-rings-${otherSide(side)} .room-ring`),
    ).toHaveCount(0);
    await expect(
      page.locator(
        `${centre} .room-figure[data-creature="${roomId}"] .room-figure-cheer`,
      ),
    ).toHaveCount(1);
    expect(event.line).toBe(rollCallCaughtLine(roomId));
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(rollCallCaughtLine(roomId));
    await expect(
      card(page, roomId).locator(".creature-card-glint"),
    ).toHaveCount(1);
    // The creature itself never goes to a doorway at the roll call.
    for (const doorSide of sides) {
      await expect(inDoorway(page, doorSide)).toHaveCount(0);
    }

    // It waits where it stands for its sound in the other ear, and says nothing meanwhile.
    const waiting = nextRoom(quick, caughtAt);
    expect(practisingAt(quick, waiting)).toBe(roomId);
    await steps.through(waiting);
    await expect(standing(page, centre)).toHaveAttribute(
      "data-creature",
      roomId,
    );
    await expect(standing(page, centre)).toHaveAttribute(
      "data-sounding",
      "false",
    );
    await expect(page.locator(".visit-practice-sound")).toBeHidden();
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(roomId),
    );

    // Then the next one takes its place, and the one before fades out of sight.
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
    await expect(standing(page)).toHaveCount(1);
    await expect(standing(page, centre)).toHaveAttribute("data-creature", next);
    const leaving = page.locator(`${centre} .room-figure[data-leaving="true"]`);
    await expect(leaving).toHaveAttribute("data-creature", roomId);
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(next),
    );
    await expect(card(page, next)).toHaveAttribute("data-state", "calling");
    await expect(card(page, roomId)).toHaveAttribute("data-state", "about");
    await settle(page);
    expect(await opacityOf(leaving)).toBe(0);
    expect(await opacityOf(standing(page, centre))).toBe(1);
  });

  test("begins to count with a lit lantern, cards that count, and nobody in view", async ({
    page,
  }) => {
    await openPage(page, address);
    const rooms = visitRooms("quick");
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
    await expect(standing(page)).toHaveCount(0);
    for (const side of sides) {
      await expect(inDoorway(page, side)).toHaveCount(0);
    }

    // The lantern is lit, has a name, and the count begins beside it.
    const cellCount = snapshot.lantern?.cellCount ?? 0;
    expect(cellCount).toBe(lanternConfig.cellCount);
    await expect(
      page.getByRole("img", { name: lanternLabel(cellCount, cellCount) }),
    ).toBeVisible();
    await expect(litCells(page)).toHaveCount(cellCount);
    await expect(main(page)).not.toHaveAttribute("data-lantern", "dark");
    await expect(page.locator(".visit-lantern-dark")).toBeHidden();
    await expect(page.locator(".visit-chase-caught")).toHaveText(
      caughtCountLine(0),
    );
    await expect(page.locator(".visit-chase-streak")).toBeHidden();

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

  test("shows the creature of a caught sound in the doorway of its side, and counts it on its card", async ({
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

    // Up to the answer the doorways are empty, whatever the roll call left of its rings.
    await steps.before(caughtAt);
    for (const doorSide of sides) {
      await expect(inDoorway(page, doorSide)).toHaveCount(0);
    }
    await markDrawn(page);

    // The answer: the creature in the doorway of the sound's side, light through that doorway,
    // rings from it, and what the house says.
    await steps.through(caughtAt);
    const sighting = page.locator(`.room-door-${side} .room-sighting`);
    await expect(sighting).toHaveCount(1);
    await expect(sighting).toHaveAttribute("data-creature", roomId);
    await expect(sighting).toHaveAttribute("data-reaction", "caught");
    await expect(
      drawnSince(page, `.room-door-${side} .room-door-light > span`),
    ).toHaveAttribute("data-creature", roomId);
    await expect(
      drawnSince(page, `.room-rings-${side} .room-ring`),
    ).toHaveCount(3);
    await expect(inDoorway(page, otherSide(side))).toHaveCount(0);
    await expect(
      drawnSince(page, `.room-rings-${otherSide(side)} .room-ring`),
    ).toHaveCount(0);
    await expect(standing(page)).toHaveCount(0);
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

    // The snapshot that follows counts it: beside the lantern and on the creature's own card,
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
    await expect(page.locator(".visit-chase-caught")).toHaveText(
      caughtCountLine(counted.chase.caughtCount),
    );
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

    // Catches in a row are counted at the other side of the lantern, from the second on.
    const streakAt = find(
      quick,
      "second catch in a row",
      (moment) => (roomOf(moment)?.chase?.streak ?? 0) >= 2,
      countedAt,
    );
    await steps.through(streakAt);
    await expect(page.locator(".visit-chase-streak")).toHaveText(
      streakLine(roomAt(quick, streakAt).chase?.streak ?? 0),
    );

    // What a caught sound shows fades away again.
    await settle(page);
    for (const fading of await page.locator(".room-sighting").all()) {
      expect(await opacityOf(fading)).toBe(0);
    }
  });

  test("shows a sound that went by leaving through the doorway of its side", async ({
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
    await markDrawn(page);
    await steps.through(slippedAt);

    // Its outline, in the doorway it came from, with no light and no ring: it was not caught.
    const sighting = drawnSince(page, `.room-door-${side} .room-sighting`);
    await expect(sighting).toHaveCount(1);
    await expect(sighting).toHaveAttribute("data-creature", roomId);
    await expect(sighting).toHaveAttribute("data-reaction", "slipped");
    await expect(
      page.locator(`.room-door-${side} .room-door-light > span`),
    ).toHaveCount(0);
    await expect(page.locator(`.room-rings-${side} .room-ring`)).toHaveCount(0);
    await expect(drawnSince(page, ".room-ring")).toHaveCount(0);
    await expect(
      drawnSince(page, `.room-door-${otherSide(side)} .room-sighting`),
    ).toHaveCount(0);
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(creatureSlippedLine(roomId, side));
    // No card lights for a sound that was not caught.
    await expect(drawnSince(page, ".creature-card-glint")).toHaveCount(0);
  });

  test("says which side a sound was on when the other side was answered, and its fixed line when there was no sound", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, pressedAlways);
    const start = find(pressedAlways, "counting", counting);

    // An answer to a turn with no sound: the house says so and nothing in the room moves.
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
    const roomDrawn = await page
      .locator(".room-picture")
      .evaluate((element) => element.outerHTML);
    await steps.through(silenceAt);
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(roomCopy.noSoundLine);
    expect(
      await page
        .locator(".room-picture")
        .evaluate((element) => element.outerHTML),
    ).toBe(roomDrawn);

    // A sound answered on the other side: its creature leaves by the doorway the sound came
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
    await markDrawn(page);
    await steps.through(otherSideAt);
    const sighting = drawnSince(page, `.room-door-${side} .room-sighting`);
    await expect(sighting).toHaveCount(1);
    await expect(sighting).toHaveAttribute("data-creature", roomId);
    await expect(sighting).toHaveAttribute("data-reaction", "slipped");
    await expect(
      drawnSince(page, `.room-door-${otherSide(side)} .room-sighting`),
    ).toHaveCount(0);
    await expect(drawnSince(page, ".room-ring")).toHaveCount(0);
    await expect(caption(page)).toHaveText(creatureOtherSideLine(roomId, side));
  });

  test("says only that nothing came when a turn with no sound goes by unanswered, and draws nothing in the room", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, quick);
    const start = find(quick, "counting", counting);
    // Since the game layer of 2026-11-17 the house says that nothing came, once the turn is over,
    // so that a long silence is never left without a word. The room itself does not move.
    const silenceAt = find(
      quick,
      "unanswered turn with no sound",
      scored("nothingCame"),
      start,
    );
    expect(eventAt(quick, silenceAt, "trialScored").trial.kind).toBe("noSound");
    await steps.before(silenceAt);
    const roomDrawn = await page
      .locator(".room-picture")
      .evaluate((element) => element.outerHTML);
    await steps.through(silenceAt);
    await expect(caption(page)).toHaveAttribute("data-shown", "true");
    await expect(caption(page)).toHaveText(roomCopy.nothingCameLine);
    expect(
      await page
        .locator(".room-picture")
        .evaluate((element) => element.outerHTML),
    ).toBe(roomDrawn);
  });

  test("dims slowly when the lantern is out, says why, and comes back with the first light", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, pressedAlways);
    const start = find(pressedAlways, "counting", counting);
    const darkAt = find(
      pressedAlways,
      "dark lantern",
      (moment) => counting(moment) && roomOf(moment)?.lantern?.cells === 0,
      start,
    );
    const cellCount = roomAt(pressedAlways, darkAt).lantern?.cellCount ?? 0;
    await steps.through(darkAt);

    await expect(main(page)).toHaveAttribute("data-lantern", "dark");
    await expect(litCells(page)).toHaveCount(0);
    await expect(
      page.getByRole("img", { name: lanternLabel(0, cellCount) }),
    ).toBeVisible();
    // The line stands where the counting's lines stood, and they give it their place.
    await expect(page.locator(".visit-lantern-dark")).toBeVisible();
    await expect(page.locator(".visit-lantern-dark")).toHaveText(
      chaseCopy.lanternDarkLine,
    );
    await expect(page.locator(".visit-practice-lines")).toBeHidden();
    // The room dims, and no change of its brightness is sudden (audio-safety, rule 9).
    for (const part of [".room-picture", ".room-glow"]) {
      const fade = await fadeOf(page.locator(part));
      expect(fade.on, part).toContain("opacity");
      expect(fade.seconds, part).toBeGreaterThanOrEqual(0.2);
    }
    await settle(page);
    expect(await opacityOf(page.locator(".room-picture"))).toBeLessThan(1);
    expect(await opacityOf(page.locator(".room-picture"))).toBeGreaterThan(0.4);
    await expectNoSeriousAccessibilityProblem(page);

    // A light comes back by itself, and the room with it.
    const litAt = find(
      pressedAlways,
      "light that came back",
      (moment) => counting(moment) && (roomOf(moment)?.lantern?.cells ?? 0) > 0,
      darkAt,
    );
    const cells = roomAt(pressedAlways, litAt).lantern?.cells ?? 0;
    await steps.through(litAt);
    await expect(main(page)).not.toHaveAttribute("data-lantern", "dark");
    await expect(litCells(page)).toHaveCount(cells);
    await expect(
      page.getByRole("img", { name: lanternLabel(cells, cellCount) }),
    ).toBeVisible();
    await expect(page.locator(".visit-lantern-dark")).toBeHidden();
    await expect(page.locator(".visit-practice-lines")).toBeVisible();
    await settle(page);
    expect(await opacityOf(page.locator(".room-picture"))).toBe(1);
  });

  test("sends a creature home when its search is over, on its card and in a line of its own", async ({
    page,
  }) => {
    await openPage(page, address);
    const rooms = visitRooms("quick");
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
    const rooms = visitRooms("quick");
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
    await expect(standing(page)).toHaveCount(0);
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

  test("waits behind a pause as it was, and comes back with empty doorways", async ({
    page,
  }) => {
    await openPage(page, address);
    const steps = walk(page, quick);
    const start = find(quick, "counting", counting);
    const caughtAt = find(quick, "caught sound", scored("ripple"), start);
    const countedAt = nextRoom(quick, caughtAt);
    const counted = roomAt(quick, countedAt);
    await steps.through(countedAt);
    await expect(page.locator(".room-sighting")).toHaveCount(1);

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
    await expect(page.locator(".visit-chase-caught")).toHaveText(
      caughtCountLine(counted.chase?.caughtCount ?? 0),
    );
    // Behind a sheet the lantern is part of the picture and says nothing.
    await expect(lantern(page)).toHaveAttribute("aria-hidden", "true");
    await expectNoSeriousAccessibilityProblem(page);

    await button(page, leavingCopy.goOnButton).click();
    expect(await requests(page)).toEqual(["resume"]);

    // Back in the room: what the last sound left in a doorway is long out of sight, the lantern
    // has its name again, and the keys answer.
    await hand(page, [{ kind: "snapshot", snapshot: counted }]);
    await expect(main(page)).toHaveAttribute("data-house", "full");
    await expect(main(page)).toBeFocused();
    await expect(page.locator(".room-sighting")).toHaveCount(0);
    await expect(page.locator(".room-ring")).toHaveCount(0);
    await expect(
      page.getByRole("img", {
        name: lanternLabel(
          counted.lantern?.cells ?? 0,
          counted.lantern?.cellCount ?? 0,
        ),
      }),
    ).toBeVisible();
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
      // less motion nothing on the page moves by itself. With every motion something does: the
      // lantern sways and the creature shifts where it stands.
      await steps.through(find(quick, "practice sound", practiceSoundPlaying));
      await settle(page);
      expect(await opacityOf(standing(page, centre))).toBe(1);
      const moving = await endlessMotions(page);
      if (reducedMotion === "reduce") {
        expect(moving).toBe(0);
      } else {
        expect(moving).toBeGreaterThan(0);
      }

      // A caught sound: its creature and its rings show, and fade.
      const start = find(quick, "counting", counting);
      const caughtAt = find(quick, "caught sound", scored("ripple"), start);
      const caught = eventAt(quick, caughtAt, "trialScored");
      await steps.before(caughtAt);
      await markDrawn(page);
      await steps.through(caughtAt);
      const sighting = page.locator(
        `.room-door-${caught.trial.ear} .room-sighting[data-reaction="caught"]`,
      );
      const ring = drawnSince(
        page,
        `.room-rings-${caught.trial.ear} .room-ring`,
      ).first();
      await expect.poll(() => opacityOf(sighting)).toBeGreaterThan(0.5);
      await expect.poll(() => opacityOf(ring)).toBeGreaterThan(0.3);
      await settle(page);
      expect(await opacityOf(sighting)).toBe(0);
      expect(await opacityOf(ring)).toBe(0);

      // A sound that went by: its outline shows, and fades.
      const slippedAt = find(
        quick,
        "sound that went by",
        scored("slipped"),
        caughtAt,
      );
      const slipped = eventAt(quick, slippedAt, "trialScored");
      await steps.through(slippedAt);
      const outline = page.locator(
        `.room-door-${slipped.trial.ear} .room-sighting[data-reaction="slipped"]`,
      );
      await expect.poll(() => opacityOf(outline)).toBeGreaterThan(0.3);
      await settle(page);
      expect(await opacityOf(outline)).toBe(0);

      // The lit lantern flickers only with every motion, and every change of the room's
      // brightness stays a fade either way (audio-safety, rule 9).
      await expect(litCells(page)).not.toHaveCount(0);
      if (reducedMotion === "reduce") {
        expect(await endlessMotions(page)).toBe(0);
      } else {
        expect(await endlessMotions(page)).toBeGreaterThan(0);
      }
      for (const part of [".room-picture", ".room-glow"]) {
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
    lantern: page.locator(".room-lantern-hang"),
    "left doorway": page.locator(".room-door-left"),
    "right doorway": page.locator(".room-door-right"),
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
      const rollCall = await expectApart("at the roll call", {
        ...fixedParts(page),
        ...(cardsWait ? {} : cardsOf(page)),
        heading: page.locator(".visit-practice-heading"),
        words: page.locator(".visit-practice-lines"),
        introduction: page.locator(".room-intro"),
        "line of the sound": page.locator(".visit-practice-sound"),
        creature: standing(page, centre),
      });
      if (cardsWait) {
        for (const [name, part] of Object.entries(cardsOf(page))) {
          await expect(part, `the ${name}, at the roll call`).toBeHidden();
        }
      }
      // The creature in the middle is large enough to tell apart: the smallest the room draws
      // is 80 px, on a phone on its side.
      expect(rollCall.creature?.width ?? 0).toBeGreaterThanOrEqual(72);

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
        caught: page.locator(".visit-chase-caught"),
        "what the house says": caption(page),
        "where it went": captionNote(page),
      };
      const countingBoxes = await expectApart("while it counts", {
        ...countingParts,
        words: page.locator(".visit-practice-lines"),
        ...((after.chase?.streak ?? 0) >= 2
          ? { "in a row": page.locator(".visit-chase-streak") }
          : {}),
      });
      // The doorways keep a useful size: the smallest the room draws is 96 px by 150 px.
      for (const side of sides) {
        const door = countingBoxes[`${side} doorway`];
        expect(door?.width ?? 0, `${side} doorway`).toBeGreaterThanOrEqual(90);
        expect(door?.height ?? 0, `${side} doorway`).toBeGreaterThanOrEqual(
          140,
        );
      }

      // The same moment made as crowded as a room can get, by hand: a dark lantern with its
      // line, long counts beside it, and long counts on every card.
      if (after.lantern == null || after.chase == null) {
        throw new Error("The room does not count in this snapshot.");
      }
      const crowded: RoomSnapshot = {
        ...after,
        lantern: { ...after.lantern, cells: 0 },
        chase: { ...after.chase, caughtCount: 88, streak: 88 },
        creatures: (after.creatures ?? []).map((creature) => ({
          ...creature,
          caughtCount: 28,
        })),
      };
      await hand(page, [{ kind: "snapshot", snapshot: crowded }]);
      await expect(main(page)).toHaveAttribute("data-lantern", "dark");
      await expectApart("with a dark lantern and long counts", {
        ...countingParts,
        "line of the dark lantern": page.locator(".visit-lantern-dark"),
        "in a row": page.locator(".visit-chase-streak"),
      });
    });
  }
});
