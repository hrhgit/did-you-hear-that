import { expect, type Page } from "@playwright/test";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { calibrationCopy } from "../../src/copy/calibration-copy";
import { frontDoorCopy } from "../../src/copy/front-door-copy";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { roomCopy, roomProgressLine } from "../../src/copy/room-copy";
import { rulesCopy } from "../../src/copy/rules-copy";
import { visitCopy } from "../../src/copy/visit-copy";

// The steps from the front door into the first room, shared by the tests that walk a visit on
// the public page.

const { calibrationSettingKeepMinDb } = audioOutputConfig;

export const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name });
export const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
// The name of a way in is its words and its note, so it is found by its words alone.
export const quickVisit = (page: Page) =>
  page.getByRole("button", { name: frontDoorCopy.choices.quick.button });

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

export async function enterFirstRoom(page: Page): Promise<void> {
  await calibrate(page);
  await checkHeadphones(page);
  await button(page, rulesCopy.enterButton).click();
  await expect(page.getByText(roomProgressLine(1, 3))).toBeVisible();
  await expect(button(page, roomCopy.pauseButton)).toBeVisible();
}
