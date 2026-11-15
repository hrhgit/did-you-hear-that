import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { calibrationCopy } from "../../src/copy/calibration-copy";
import { frontDoorCopy } from "../../src/copy/front-door-copy";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { leavingCopy } from "../../src/copy/leaving-copy";
import {
  roomCopy,
  roomNames,
  roomProgressLine,
} from "../../src/copy/room-copy";
import { rulesCopy } from "../../src/copy/rules-copy";
import { siteTitle } from "../../src/copy/site-title";
import { visitCopy } from "../../src/copy/visit-copy";
import { expectNoHorizontalScroll, openPage } from "./page-checks";
import { previewServers } from "./preview-servers";

// A visit in a real browser, from the front door into the first room and out again (brief 05).
// The browser is muted: these tests check what the page shows and that its controls work, not
// what anything sounds like. Each test gets a new page, so every visit here ends with it.
test.use({ launchOptions: { args: ["--mute-audio"] } });

const server = previewServers[0];
if (server === undefined) {
  throw new Error("There is no preview server to test against.");
}
const address = `http://localhost:${String(server.port)}${server.basePath}`;

const { calibrationSettingMinDb, calibrationSettingKeepMinDb } =
  audioOutputConfig;

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name });
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const answerButton = (page: Page, side: "left" | "right") =>
  page.getByRole("button", { name: roomCopy.answers[side].hint });
// The name of a way in is its words and its note, so it is found by its words alone.
const quickVisit = (page: Page) =>
  page.getByRole("button", { name: frontDoorCopy.choices.quick.button });

async function expectNoSeriousAccessibilityProblem(page: Page): Promise<void> {
  // Whatever is fading in or out is checked once it has arrived or gone.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")})`,
    ),
  ).toEqual([]);
}

/** Chooses the short visit, matches the hiss up to the lowest setting that can be kept. */
async function calibrate(page: Page): Promise<void> {
  await quickVisit(page).click();
  await expect(heading(page, visitCopy.calibrationHeading)).toBeVisible();
  await button(page, calibrationCopy.startButton).click();
  const louder = button(page, calibrationCopy.louderButton);
  await expect(louder).toBeVisible();
  for (
    let press = 0;
    press < calibrationSettingKeepMinDb - calibrationSettingMinDb;
    press += 1
  ) {
    await louder.click();
  }
  // The hiss rises a few decibels from one repeat to the next, so it takes a few repeats to
  // reach the setting asked for. Until then the house does not keep the setting.
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
async function playCheck(page: Page): Promise<void> {
  await expect(async () => {
    await button(page, headphoneCheckCopy.playButton).click();
    await expect(button(page, headphoneCheckCopy.answers.left)).toBeEnabled({
      timeout: 400,
    });
  }).toPass({ timeout: 15_000 });
}

async function checkHeadphones(page: Page): Promise<void> {
  await playCheck(page);
  await button(page, headphoneCheckCopy.answers.left).click();
  await expect(
    page.getByText(headphoneCheckCopy.judgementLines.correct),
  ).toBeVisible();
  await button(page, visitCopy.goOnButton).click();
  await expect(heading(page, rulesCopy.heading)).toBeVisible();
}

async function enterFirstRoom(page: Page): Promise<void> {
  await calibrate(page);
  await checkHeadphones(page);
  await button(page, rulesCopy.enterButton).click();
  await expect(page.getByText(roomProgressLine(1, 3))).toBeVisible();
  await expect(button(page, roomCopy.pauseButton)).toBeVisible();
}

test.describe(`a visit at ${address}`, () => {
  test.describe.configure({ timeout: 120_000 });

  test("walks from the front door through calibration, the headphone check and the rules into the first room", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await expect(heading(page, siteTitle)).toBeVisible();

    await calibrate(page);
    await expect(page.getByText(calibrationCopy.keptLine)).toBeVisible();
    await expect(button(page, roomCopy.stopButton)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    // A wrong answer keeps the visitor at the check, with what to do about it.
    await playCheck(page);
    await button(page, headphoneCheckCopy.answers.right).click();
    await expect(
      page.getByText(headphoneCheckCopy.judgementLines.swapped),
    ).toBeVisible();
    await expect(button(page, visitCopy.goOnButton)).toBeHidden();

    await checkHeadphones(page);
    for (const sentence of rulesCopy.sentences) {
      await expect(page.getByText(sentence)).toBeVisible();
    }
    await expect(page.getByText(rulesCopy.keyboardLine)).toBeVisible();
    await expect(page.getByText(rulesCopy.touchLine)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    await button(page, rulesCopy.enterButton).click();
    await expect(page.locator(".visit-room-name")).toHaveText(
      roomNames.corridor,
    );
    await expect(page.getByText(roomProgressLine(1, 3))).toBeVisible();
    await expect(answerButton(page, "left")).toBeVisible();
    await expect(answerButton(page, "right")).toBeVisible();
    await expect(page.getByRole("heading")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    expect(record, "requests to other origins and uncaught errors").toEqual({
      otherOriginRequests: [],
      pageErrors: [],
    });
  });

  test("answers by keyboard or by touch, and the house says something once an answer has been taken", async ({
    page,
    isMobile,
  }) => {
    const record = await openPage(page, address);
    await enterFirstRoom(page);

    // The test cannot know when a sound comes or from which side, and neither can the page
    // before an answer. It answers left and right in turn until the house speaks: a catch gives
    // the line about the sound, an answer to silence gives the line about no sound.
    const caption = page.locator(".visit-caption");
    await expect(caption).toHaveText("");
    const size = page.viewportSize();
    if (size === null) {
      throw new Error("The page has no viewport.");
    }
    let presses = 0;
    await expect(async () => {
      const left = presses % 2 === 0;
      presses += 1;
      if (isMobile) {
        await page.touchscreen.tap(
          size.width * (left ? 0.25 : 0.75),
          size.height * 0.6,
        );
      } else {
        await page.keyboard.press(left ? "ArrowLeft" : "ArrowRight");
      }
      await expect(caption).toHaveAttribute("data-shown", "true", {
        timeout: 350,
      });
    }).toPass({ timeout: 90_000, intervals: [50] });

    const line = (await caption.textContent()) ?? "";
    expect(
      line === roomCopy.noSoundLine ||
        line.startsWith("You caught it on your "),
      `the house said: ${line}`,
    ).toBe(true);
    expect(record.pageErrors).toEqual([]);
  });

  test("pauses and goes on, then stops, leaves and comes back to the front door", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await enterFirstRoom(page);

    await button(page, roomCopy.pauseButton).click();
    await expect(heading(page, leavingCopy.pauseHeading)).toBeVisible();
    await expect(page.getByText(leavingCopy.pauseLines.visitor)).toBeVisible();
    await expect(answerButton(page, "left")).toBeHidden();
    await expect(button(page, roomCopy.stopButton)).toBeVisible();
    await expectNoSeriousAccessibilityProblem(page);

    await button(page, leavingCopy.goOnButton).click();
    await expect(heading(page, leavingCopy.pauseHeading)).toBeHidden();
    await expect(button(page, roomCopy.pauseButton)).toBeVisible();
    await expect(page.getByText(roomProgressLine(1, 3))).toBeVisible();

    await button(page, roomCopy.stopButton).click();
    await expect(heading(page, leavingCopy.exitHeading)).toBeVisible();
    await expect(page.getByText(leavingCopy.exitLines.visitor)).toBeVisible();
    await expect(button(page, roomCopy.stopButton)).toBeHidden();
    await expectNoSeriousAccessibilityProblem(page);

    await button(page, leavingCopy.backButton).click();
    await expect(heading(page, siteTitle)).toBeVisible();
    await expect(quickVisit(page)).toBeVisible();
    expect(record, "requests to other origins and uncaught errors").toEqual({
      otherOriginRequests: [],
      pageErrors: [],
    });
  });

  test("stops from the calibration screen with one press", async ({ page }) => {
    await openPage(page, address);
    await quickVisit(page).click();
    await expect(heading(page, visitCopy.calibrationHeading)).toBeVisible();
    await button(page, calibrationCopy.startButton).click();
    await expect(button(page, calibrationCopy.louderButton)).toBeVisible();

    await button(page, roomCopy.stopButton).click();
    await expect(heading(page, leavingCopy.exitHeading)).toBeVisible();
    await expect(button(page, calibrationCopy.louderButton)).toBeHidden();
  });
});
