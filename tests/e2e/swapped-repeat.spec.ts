import { expect, test, type Locator, type Page } from "@playwright/test";
import { lanternConfig } from "../../src/config/lantern-config";
import { oneRoomCopy } from "../../src/copy/creature-copy";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { leavingCopy } from "../../src/copy/leaving-copy";
import { roomCopy } from "../../src/copy/room-copy";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import type {
  SwappedRepeatComparison,
  SwappedTrialScoredEvent,
  VisitSnapshot,
} from "../../src/session/visit-flow-types";
import type { ReplaySheet } from "../../src/ui/visit/start-replay-sheet";
import { devServer } from "./dev-server";
import {
  expectNoHorizontalScroll,
  expectNoSeriousAccessibilityProblem,
  openPage,
  readSoundSources,
} from "./page-checks";
import {
  followsEarComparison,
  followsEarpieceComparison,
  swappedRepeatMoments as moments,
  unclearComparison,
} from "./swapped-repeat-fixtures";

// The swapped repeat of one floor in a real browser: the sheet that asks for the swap, the check,
// the room and the two runs side by side. A visit reaches it only after every room and the
// picture, so these tests do not walk one. The development replay sheet draws each moment from a
// snapshot written out by hand in `swapped-repeat-fixtures.ts`. That sheet has no visit flow and
// no sound at all, and the browser runs muted all the same. Nothing here checks what the visit
// flow does or what a sound is like.
test.use({ launchOptions: { args: ["--mute-audio"] } });

const address = `http://localhost:${String(devServer.port)}${devServer.replaySheetPath}`;

type SheetWindow = Window & { replaySheet: ReplaySheet };

async function show(page: Page, snapshot: VisitSnapshot): Promise<void> {
  await page.evaluate((given) => {
    (window as unknown as SheetWindow).replaySheet.show(given);
  }, snapshot);
}

const requests = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as SheetWindow).replaySheet.requests);

const button = (page: Page, name: string): Locator =>
  page.getByRole("button", { name, exact: true });
const sheet = (page: Page): Locator => page.locator(".visit-sheet-swap");
const stopButton = (page: Page): Locator =>
  button(page, swappedRepeatCopy.stopButton);
const backButton = (page: Page): Locator =>
  button(page, swappedRepeatCopy.backButton);
const sketch = (page: Page): Locator => sheet(page).locator(".swap-sketch");
const answers = (page: Page): Locator =>
  sheet(page).getByRole("group", { name: swappedRepeatCopy.question });
const statusLine = (page: Page): Locator =>
  sheet(page).locator("p.visit-status");

/** How long the way back ignores presses after the two runs appear, and a little more. */
const guardMs = 800;

/** What every sheet of the repeat shows: its heading, the floor, the stop control, the way back. */
async function expectFrame(page: Page): Promise<void> {
  await expect(sheet(page)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: swappedRepeatCopy.heading, level: 1 }),
  ).toBeVisible();
  await expect(sheet(page).locator(".visit-swap-floor")).toContainText(
    "Stairs",
  );
  await expect(sheet(page).locator(".visit-swap-floor")).toContainText("4 kHz");
  await expect(sheet(page).locator(".visit-swap-floor")).toContainText(
    "20 dB quieter on the left",
  );
  await expect(stopButton(page)).toBeVisible();
  await expect(backButton(page)).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-house", "faint");
}

async function expectComparison(
  page: Page,
  comparison: SwappedRepeatComparison,
): Promise<void> {
  const block = sheet(page).locator(".repeat-comparison");
  await expect(block).toHaveCount(1);
  await expect(
    block.getByRole("heading", { name: comparison.heading, level: 2 }),
  ).toBeVisible();
  // The drawing is one image, named by the heading and described by the words under it.
  const figure = block.getByRole("img", { name: comparison.heading });
  await expect(figure).toBeVisible();
  await expect(figure.locator("svg")).toHaveAttribute(
    "data-outcome",
    comparison.outcome,
  );
  const outcome = block.locator(".repeat-outcome");
  await expect(outcome).toHaveAttribute("data-outcome", comparison.outcome);
  await expect(outcome).toContainText(comparison.outcomeLabel);
  for (const line of comparison.outcomeLines) {
    await expect(outcome).toContainText(line);
  }
  const runs = block.locator(".repeat-run-words");
  await expect(runs).toHaveCount(2);
  for (const [index, run] of comparison.runs.entries()) {
    const words = runs.nth(index);
    await expect(words).toHaveAttribute("data-arrangement", run.arrangement);
    await expect(words).toContainText(run.label);
    await expect(words).toContainText(run.differenceLabel);
    for (const wing of [run.left, run.right]) {
      await expect(words).toContainText(wing.earpieceLabel);
      await expect(words).toContainText(wing.line);
      if (wing.reasonLine !== null) {
        await expect(words).toContainText(wing.reasonLine);
      }
    }
  }
}

test.describe("the swapped repeat of a floor", () => {
  test("asks for the swap before any sound, and says it again when the check found none", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await show(page, moments.instruction);

    await expectFrame(page);
    await expect(sheet(page).locator(".visit-swap-lines p")).toHaveText([
      ...swappedRepeatCopy.instructionLines,
    ]);
    await expect(sketch(page)).toBeVisible();
    await expect(sketch(page)).toHaveAttribute("data-state", "asked");
    await expect(sketch(page)).toHaveAttribute("aria-hidden", "true");
    await expect(sheet(page).locator(".visit-swap-again")).toBeHidden();
    await expect(answers(page)).toBeHidden();
    await expect(sheet(page).locator(".repeat-comparison")).toHaveCount(0);
    await expect(page.locator(".visit-answer")).toHaveCount(2);
    for (const half of await page.locator(".visit-answer").all()) {
      await expect(half).toBeHidden();
    }
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    await button(page, swappedRepeatCopy.confirmButton).click();
    await stopButton(page).click();
    await backButton(page).click();
    expect(await requests(page)).toEqual(["confirmSwap", "stop", "proceed"]);

    // After a check that found the headphones as they were, the same sheet says so.
    await show(page, moments.check);
    await show(page, moments.instructionAgain);
    const again = sheet(page).locator(".visit-swap-again");
    await expect(again).toBeVisible();
    await expect(again).toHaveText(swappedRepeatCopy.againLine);
    await expect(again).toHaveAttribute("role", "status");
    await expect(button(page, swappedRepeatCopy.confirmButton)).toBeFocused();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    // The page has no sound of its own: the flow alone would start one, and there is none here.
    const sources = await readSoundSources(page);
    expect(sources.counts).toEqual({ audioContexts: 0, mediaElements: 0 });
    expect(sources.mediaElementsInDocument).toBe(0);
    expect(record.pageErrors).toEqual([]);
    expect(record.otherOriginRequests).toEqual([]);
  });

  test("checks the swap: one press plays, and an answer counts only after a check has played", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await show(page, moments.instruction);
    await show(page, moments.check);

    await expectFrame(page);
    await expect(button(page, swappedRepeatCopy.playCheckButton)).toBeFocused();
    await expect(answers(page)).toBeVisible();
    const answerNames = Object.values(headphoneCheckCopy.answers);
    for (const name of answerNames) {
      await expect(answers(page).getByRole("button", { name })).toBeDisabled();
    }
    await expect(statusLine(page)).toHaveText("");
    await expect(sheet(page).locator(".visit-swap-lines p")).toHaveCount(0);

    await button(page, swappedRepeatCopy.playCheckButton).click();
    expect(await requests(page)).toEqual(["playSwapCheck"]);

    // The flow says that a check has played. Now each answer is taken, by the keyboard too.
    await show(page, moments.checkAwaiting);
    for (const name of answerNames) {
      await expect(answers(page).getByRole("button", { name })).toBeEnabled();
    }
    const bothSides = answers(page).getByRole("button", {
      name: headphoneCheckCopy.answers.bothSides,
    });
    await bothSides.focus();
    await page.keyboard.press("Enter");
    expect(await requests(page)).toEqual([
      "playSwapCheck",
      "answerSwapCheck:bothSides",
    ]);

    // The answer kept the visitor in the check: the line says why, and the focus is on the one
    // button that can be pressed.
    await show(page, moments.checkBothSides);
    await expect(statusLine(page)).toHaveText(
      swappedRepeatCopy.judgementLines.bothSides,
    );
    await expect(statusLine(page)).toHaveAttribute("role", "status");
    await expect(bothSides).toBeDisabled();
    await expect(button(page, swappedRepeatCopy.playCheckButton)).toBeFocused();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    // A check that could not play, and a check that was cut short, are said in the same place.
    await show(page, moments.checkRefused);
    await expect(statusLine(page)).toHaveText(
      swappedRepeatCopy.playRefusedLine,
    );
    await show(page, moments.checkCut);
    await expect(statusLine(page)).toHaveText(swappedRepeatCopy.cutLine);
    await expectNoHorizontalScroll(page);

    expect(record.pageErrors).toEqual([]);
    expect(record.otherOriginRequests).toEqual([]);
  });

  test("leads into the room, which is lit, answered and paused like the one room of the visit", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await show(page, moments.checkAwaiting);
    await show(page, moments.ready);

    await expectFrame(page);
    await expect(sketch(page)).toHaveAttribute("data-state", "swapped");
    await expect(sheet(page).locator(".visit-swap-lines p").first()).toHaveText(
      swappedRepeatCopy.judgementLines.confirmed,
    );
    await expect(answers(page)).toBeHidden();
    await expect(button(page, swappedRepeatCopy.startButton)).toBeFocused();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);
    await button(page, swappedRepeatCopy.startButton).click();
    expect(await requests(page)).toEqual(["startSwappedRoom"]);

    // Inside the room the sheet is gone and the room is in full view. The bar names the floor
    // and its pitch. Nothing counts lights here, so the lantern burns with every light and has
    // no name of its own, and the room has no cards along its foot. Nobody is in a doorway.
    await show(page, moments.room);
    await expect(sheet(page)).toBeHidden();
    await expect(page.locator("main")).toHaveAttribute("data-house", "full");
    await expect(
      page.getByRole("img", { name: oneRoomCopy.sceneLabel }),
    ).toBeVisible();
    await expect(page.locator(".visit-room-name")).toHaveText("Stairs");
    await expect(page.locator(".visit-room-progress")).toHaveText("4 kHz");
    await expect(
      page.locator(".visit-lantern-cell[data-lit='true']"),
    ).toHaveCount(lanternConfig.cellCount);
    await expect(page.locator(".visit-lantern")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await expect(page.locator("main")).toHaveAttribute("data-shelf", "none");
    await expect(
      page.getByRole("list", { name: oneRoomCopy.shelfLabel }),
    ).toBeHidden();
    await expect(page.locator(".room-figure, .room-sighting")).toHaveCount(0);
    await expect(page.locator(".room-ring")).toHaveCount(0);
    await expect(stopButton(page)).toBeVisible();
    await expect(button(page, swappedRepeatCopy.pauseButton)).toBeVisible();
    for (const half of await page.locator(".visit-answer").all()) {
      await expect(half).toBeVisible();
    }
    await expect(page.locator(".visit-answer-left")).toContainText(
      roomCopy.answers.left.hint,
    );
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    // A scored trial of the repeat brings its own words. Nothing is said before one is scored.
    await expect(page.locator(".visit-caption")).toHaveText("");
    const caught = {
      kind: "swappedTrialScored",
      room: moments.room.room,
      runNumber: 1,
      trial: { kind: "sound", ear: "left", earpiece: "right" },
      reaction: "ripple",
      line: "You caught it on your left, through the right earpiece.",
    } as unknown as SwappedTrialScoredEvent;
    await page.evaluate((given) => {
      (window as unknown as SheetWindow).replaySheet.event(given);
    }, caught);
    await expect(page.locator(".visit-caption")).toHaveText(
      "You caught it on your left, through the right earpiece.",
    );
    // The creature of the floor shows in the doorway of the ear that heard it, with rings, and
    // nothing shows at the other side.
    const sighting = page.locator(".room-door-left .room-sighting");
    await expect(sighting).toHaveCount(1);
    await expect(sighting).toHaveAttribute("data-creature", "stairs");
    await expect(sighting).toHaveAttribute("data-reaction", "caught");
    await expect(page.locator(".room-rings-left .room-ring")).toHaveCount(3);
    await expect(page.locator(".room-door-right .room-sighting")).toHaveCount(
      0,
    );
    await expect(page.locator(".room-rings-right .room-ring")).toHaveCount(0);

    await button(page, swappedRepeatCopy.pauseButton).click();
    await stopButton(page).click();
    expect(await requests(page)).toEqual(["startSwappedRoom", "pause", "stop"]);

    // Paused, the room says so in the repeat's own words and offers the way on.
    await show(page, moments.roomPaused);
    await expect(
      page.getByRole("heading", { name: leavingCopy.pauseHeading }),
    ).toBeFocused();
    await expect(page.locator(".visit-sheet-notice")).toContainText(
      swappedRepeatCopy.pauseLines.visitor,
    );
    for (const half of await page.locator(".visit-answer").all()) {
      await expect(half).toBeHidden();
    }
    await expect(stopButton(page)).toBeVisible();
    await button(page, swappedRepeatCopy.resumeButton).click();
    expect((await requests(page)).at(-1)).toBe("resume");
    await expectNoSeriousAccessibilityProblem(page);

    expect(record.pageErrors).toEqual([]);
    expect(record.otherOriginRequests).toEqual([]);
  });

  test("sets both runs side by side, and takes no press that was meant as an answer", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await show(page, moments.room);

    // The sheet appears and its way back is pressed in the same instant.
    await page.evaluate((given) => {
      (window as unknown as SheetWindow).replaySheet.show(given);
      for (const pressed of document.querySelectorAll<HTMLButtonElement>(
        ".visit-sheet-swap button",
      )) {
        pressed.click();
      }
    }, moments.finishedFollowsEar);
    expect(await requests(page)).toEqual([]);

    await expectFrame(page);
    await expect(
      page.getByRole("heading", { name: swappedRepeatCopy.heading, level: 1 }),
    ).toBeFocused();
    await expect(sketch(page)).toBeHidden();
    await expect(answers(page)).toBeHidden();
    await expect(sheet(page).locator(".visit-swap-lines p")).toHaveText([
      swappedRepeatCopy.endLines.finished,
    ]);
    await expectComparison(page, followsEarComparison);
    const turnBack = sheet(page).locator(".visit-swap-turn-back");
    await expect(turnBack).toHaveText(swappedRepeatCopy.turnBackLine);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    await page.waitForTimeout(guardMs);
    await backButton(page).click();
    expect(await requests(page)).toEqual(["proceed"]);

    // The other two outcomes are drawn from the same parts.
    await show(page, moments.finishedFollowsEarpiece);
    await expectComparison(page, followsEarpieceComparison);
    await expectNoHorizontalScroll(page);
    await show(page, moments.finishedUnclear);
    await expectComparison(page, unclearComparison);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    expect(record.pageErrors).toEqual([]);
    expect(record.otherOriginRequests).toEqual([]);
  });

  test("says so when the room was stopped or cannot be visited again, with only the way back", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await show(page, moments.room);
    await show(page, moments.finishedDeviceChanged);

    await expectFrame(page);
    await expect(sheet(page).locator(".visit-swap-lines p")).toHaveText([
      swappedRepeatCopy.endLines.deviceChanged,
    ]);
    await expect(sheet(page).locator(".repeat-comparison")).toHaveCount(0);
    await expect(sheet(page).locator(".visit-swap-turn-back")).toHaveText(
      swappedRepeatCopy.turnBackLine,
    );
    await expect(sketch(page)).toBeHidden();
    await expectNoSeriousAccessibilityProblem(page);

    await show(page, moments.unavailable);
    await expectFrame(page);
    await expect(sheet(page).locator(".visit-swap-lines p")).toHaveText([
      swappedRepeatCopy.unavailableLines.calibrationGone,
    ]);
    await expect(sketch(page)).toBeHidden();
    await expect(answers(page)).toBeHidden();
    await expect(sheet(page).locator(".visit-swap-turn-back")).toBeHidden();
    await expect(sheet(page).getByRole("button")).toHaveCount(1);
    await backButton(page).click();
    expect(await requests(page)).toEqual(["proceed"]);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    const sources = await readSoundSources(page);
    expect(sources.counts).toEqual({ audioContexts: 0, mediaElements: 0 });
    expect(record.pageErrors).toEqual([]);
    expect(record.otherOriginRequests).toEqual([]);
  });
});
