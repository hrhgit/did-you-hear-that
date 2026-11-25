import { expect, type Page } from "@playwright/test";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import type { GhostSoundId } from "../../src/config/sound-id";
import { calibrationCopy } from "../../src/copy/calibration-copy";
import {
  creatureIntroLine,
  oneRoomCopy,
  rollCallCaughtLine,
  rollCallCopy,
} from "../../src/copy/creature-copy";
import { frontDoorCopy } from "../../src/copy/front-door-copy";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { roomCopy } from "../../src/copy/room-copy";
import { rulesCopy } from "../../src/copy/rules-copy";
import { visitCopy } from "../../src/copy/visit-copy";

// The steps from the front door into the one room, shared by the tests that walk a visit on the
// public page.

const { calibrationSettingKeepMinDb } = audioOutputConfig;

export const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name });
export const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
// The name of a way in is its words and its note, so it is found by its words alone.
export const quickVisit = (page: Page) =>
  page.getByRole("button", { name: frontDoorCopy.choices.full.button });

const escaped = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The calibration heading, whichever sound the browser could play: the music, or the hiss where
 * this browser cannot decode the music.
 */
export const calibrationHeading = (page: Page) =>
  page.getByRole("heading", {
    level: 1,
    name: new RegExp(
      `^(${escaped(calibrationCopy.heading)}|${escaped(calibrationCopy.hiss.heading)})$`,
    ),
  });

/** The calibration control, which is named by the heading of its sheet. */
export const calibrationSlider = (page: Page) => page.getByRole("slider");

/** Chooses the short visit and drags the control to the lowest setting that can be kept. */
export async function calibrate(page: Page): Promise<void> {
  await quickVisit(page).click();
  await expect(calibrationHeading(page)).toBeVisible();
  await button(page, calibrationCopy.startButton).click();
  const slider = calibrationSlider(page);
  await expect(slider).toBeVisible();
  await slider.fill(String(calibrationSettingKeepMinDb));
  // The sound follows the control a little at a time, so it takes some seconds to reach the
  // setting asked for. Until then the house does not keep the setting.
  await expect(async () => {
    await button(page, calibrationCopy.keepButton).click();
    await expect(heading(page, visitCopy.headphoneCheckHeading)).toBeVisible({
      timeout: 400,
    });
  }).toPass({ timeout: 30_000 });
}

/**
 * Plays the check hiss. The house refuses a play while a sound before it is still ending, and
 * asks for another press, so this presses until the answers can be given.
 */
export async function playCheck(page: Page): Promise<void> {
  await expect(async () => {
    await button(page, headphoneCheckCopy.playButton).click();
    await expect(button(page, headphoneCheckCopy.answers.left)).toBeEnabled({
      timeout: 400,
    });
  }).toPass({ timeout: 15_000 });
}

export async function checkHeadphones(page: Page): Promise<void> {
  await playCheck(page);
  await button(page, headphoneCheckCopy.answers.left).click();
  await expect(
    page.getByText(headphoneCheckCopy.judgementLines.correct),
  ).toBeVisible();
  await button(page, visitCopy.goOnButton).click();
  await expect(heading(page, rulesCopy.heading)).toBeVisible();
}

/** The picture of the one room, by the name it has for a visitor who cannot see it. */
export const roomPicture = (page: Page) =>
  page.getByRole("img", { name: oneRoomCopy.sceneLabel });

/** The heading over the roll call. It is plain text, so that the room has no heading of its own. */
export const rollCallHeading = (page: Page) =>
  page.locator(".visit-practice-heading");

/** The creatures' cards along the foot of the room, in visit order. */
export const creatureCards = (page: Page) =>
  page
    .getByRole("list", { name: oneRoomCopy.shelfLabel })
    .getByRole("listitem");

/**
 * Walks from the front door into the one room. It opens with the roll call, where each creature
 * makes its sound and nothing counts yet.
 */
export async function enterRoom(page: Page): Promise<void> {
  await calibrate(page);
  await checkHeadphones(page);
  await button(page, rulesCopy.enterButton).click();
  await expect(roomPicture(page)).toBeVisible();
  await expect(rollCallHeading(page)).toHaveText(rollCallCopy.heading);
  await expect(button(page, roomCopy.pauseButton)).toBeVisible();
}

/** A side of the room: the answer a visitor gives. */
export type Side = "left" | "right";

/**
 * Gives one answer: the side's arrow key, or, by touch, a finger on that half of the screen at
 * the height of the doorways.
 */
export async function answerSide(
  page: Page,
  side: Side,
  byTouch: boolean,
): Promise<void> {
  if (!byTouch) {
    await page.keyboard.press(side === "left" ? "ArrowLeft" : "ArrowRight");
    return;
  }
  const size = page.viewportSize();
  if (size === null) {
    throw new Error("The page has no viewport.");
  }
  await page.touchscreen.tap(
    size.width * (side === "left" ? 0.25 : 0.75),
    size.height * 0.6,
  );
}

/** One turn of the roll call: whose practice sound it is, and the side it plays on. */
export interface RollCallTurn {
  readonly roomId: GhostSoundId;
  readonly side: Side;
}

/**
 * Every turn of the roll call of these creatures, in its order: each one in visit order, its left
 * side and then its right (one-room design.md, "The roll call").
 */
export function rollCallTurns(
  roomIds: readonly GhostSoundId[],
): RollCallTurn[] {
  return roomIds.flatMap((roomId) => [
    { roomId, side: "left" as const },
    { roomId, side: "right" as const },
  ]);
}

/**
 * Answers these turns of the roll call, each on the side it plays on. The page says who is making
 * a practice sound and that it is playing, and never its side: the side is known here only from
 * the order of the roll call. The house ignores an answer that comes before a practice sound can
 * be answered, so the side is pressed until the house has taken the answer and said who it was.
 */
export async function answerRollCall(
  page: Page,
  turns: readonly RollCallTurn[],
  byTouch: boolean,
): Promise<void> {
  const soundLine = page.locator(".visit-practice-sound");
  for (const { roomId, side } of turns) {
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(roomId),
      { timeout: 20_000 },
    );
    await expect(soundLine).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      await answerSide(page, side, byTouch);
      await expect(soundLine).toBeHidden({ timeout: 300 });
    }).toPass({ timeout: 10_000, intervals: [50] });
    await expect(page.locator(".visit-caption")).toHaveText(
      rollCallCaughtLine(roomId),
    );
  }
}
