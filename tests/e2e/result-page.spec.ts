import { existsSync, readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { resultPageConfig } from "../../src/config/result-page-config";
import { ghostSoundIds, type GhostSoundId } from "../../src/config/sound-id";
import { comparisonCopy } from "../../src/copy/comparison-lines";
import { leavingCopy } from "../../src/copy/leaving-copy";
import { limitsStatement } from "../../src/copy/limits-statement";
import { resultPageCopy } from "../../src/copy/result-page-copy";
import { roomNames } from "../../src/copy/room-copy";
import type { VisitToSave } from "../../src/session/result-page-types";
import type {
  RoomSummary,
  VisitEarResult,
} from "../../src/session/visit-flow-types";
import type { ResultSheet } from "../../src/ui/result/start-result-sheet";
import { devServer } from "./dev-server";
import {
  expectNoHorizontalScroll,
  openPage,
  readSoundSources,
} from "./page-checks";
import { simulatedResult } from "./simulated-result";

// The result of a visit in a real browser. A visit takes minutes, so these tests do not walk one:
// a simulated visitor walks it in Node, on the fake audio backend, and the development result
// sheet draws what the visit flow gave. The result page plays no sound, and the browser runs
// muted all the same.
test.use({ launchOptions: { args: ["--mute-audio"] } });

const address = `http://localhost:${String(devServer.port)}${devServer.resultSheetPath}`;

/** The width of one wing in the units of the drawing: from the lamp to the inner face of a wall. */
const wingWidth = 168;

let quickVisit: VisitToSave;
let laterQuickVisit: VisitToSave;
let fullVisit: VisitToSave;
let silentVisit: VisitToSave;

test.beforeAll(async () => {
  // Inside the playable range: with the calibration these visits keep, every room's search floor
  // is −35 dB (audible-start, the playable floor).
  quickVisit = await simulatedResult("quick", {
    kind: "thresholds",
    leftDb: -30,
    rightDb: -20,
  });
  fullVisit = await simulatedResult("full", {
    kind: "thresholds",
    leftDb: -28,
    rightDb: -30,
  });
  laterQuickVisit = await simulatedResult(
    "quick",
    { kind: "thresholds", leftDb: -25, rightDb: -30 },
    20261127,
  );
  silentVisit = await simulatedResult("full", {
    kind: "extreme",
    name: "neverAnswers",
  });
});

async function showVisit(page: Page, visit: VisitToSave): Promise<void> {
  await page.evaluate((given) => {
    (window as unknown as { resultSheet: ResultSheet }).resultSheet.show(given);
  }, visit);
  await expect(page.locator(".result")).toBeVisible();
}

async function openSheet(page: Page, visit: VisitToSave) {
  const record = await openPage(page, address);
  await showVisit(page, visit);
  return record;
}

/** Waits until the light has spread and every fade has ended. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function expectNoSeriousAccessibilityProblem(page: Page): Promise<void> {
  await settle(page);
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

const button = (page: Page, name: string): Locator =>
  page.getByRole("button", { name, exact: true });
const floorWords = (page: Page, roomId: GhostSoundId): Locator =>
  page.locator(`.result-floor-words[data-room="${roomId}"]`);
const drawnFloor = (page: Page, roomId: GhostSoundId): Locator =>
  page.locator(`.result-section .result-floor[data-room="${roomId}"]`);
const savedVisits = (page: Page): Locator =>
  page.locator(".result-saved-visit");

/** How wide the light of a wing is drawn, in the units of the drawing. 0 for a wing with no light. */
async function lightWidth(
  page: Page,
  roomId: GhostSoundId,
  side: "left" | "right",
): Promise<number> {
  const light = drawnFloor(page, roomId).locator(
    `.result-light[data-side="${side}"]`,
  );
  if ((await light.count()) === 0) {
    return 0;
  }
  return Number(await light.getAttribute("width"));
}

/** The summary of a visit with some ears replaced, to draw states a simulated visit rarely gives. */
function withEars(
  visit: VisitToSave,
  changes: Partial<
    Record<
      GhostSoundId,
      { readonly left?: VisitEarResult; readonly right?: VisitEarResult }
    >
  >,
): VisitToSave {
  const rooms = visit.summary.rooms.map((room): RoomSummary => {
    const change = changes[room.room.roomId];
    if (change === undefined) {
      return room;
    }
    const left = change.left ?? room.left;
    const right = change.right ?? room.right;
    const bothFound = left.state === "found" && right.state === "found";
    return {
      ...room,
      left,
      right,
      rightMinusLeftDb: bothFound ? right.thresholdDb - left.thresholdDb : null,
      swappedRepeatOffered:
        bothFound && Math.abs(right.thresholdDb - left.thresholdDb) >= 15,
    };
  });
  return { visitLog: visit.visitLog, summary: { ...visit.summary, rooms } };
}

const counts = {
  presentationCount: 6,
  catchCount: 3,
  wrongSideCount: 0,
  missCount: 3,
};

test.describe("the result of a visit", () => {
  test("draws a short visit: the head, the rooms it entered from the top down, and the rooms it skipped left empty", async ({
    page,
  }) => {
    const record = await openSheet(page, quickVisit);

    await expect(
      page.getByRole("heading", { level: 1, name: resultPageCopy.heading }),
    ).toBeVisible();
    await expect(page.locator(".result-silence")).not.toBeEmpty();
    await expect(page.locator(".result-notice")).toBeHidden();

    const entered = quickVisit.summary.rooms.map((room) => room.room.roomId);
    const fromTheTop = [...ghostSoundIds]
      .reverse()
      .filter((roomId) => entered.includes(roomId));
    await expect(page.locator(".result-floor-words")).toHaveCount(
      entered.length,
    );
    await expect(page.locator(".result-floor-name")).toHaveText(
      fromTheTop.map((roomId) => roomNames[roomId]),
    );
    for (const roomId of ghostSoundIds) {
      await expect(drawnFloor(page, roomId)).toHaveAttribute(
        "data-kind",
        entered.includes(roomId) ? "entered" : "closed",
      );
    }

    // This visitor's left side caught quieter sounds than the right on every floor, so the light
    // reaches further into the left wing, and ends inside both.
    for (const room of quickVisit.summary.rooms) {
      expect(room.left.state).toBe("found");
      expect(room.right.state).toBe("found");
      const left = await lightWidth(page, room.room.roomId, "left");
      const right = await lightWidth(page, room.room.roomId, "right");
      expect(left).toBeGreaterThan(right);
      expect(right).toBeGreaterThan(0);
      expect(left).toBeLessThan(wingWidth);
      await expect(
        drawnFloor(page, room.room.roomId).locator(".result-reach"),
      ).toHaveCount(2);
      await expect(
        floorWords(page, room.room.roomId).locator(".result-wing"),
      ).toHaveCount(2);
    }

    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);
    expect(record.pageErrors).toEqual([]);
    expect(record.otherOriginRequests).toEqual([]);
    const sounds = await readSoundSources(page);
    expect(sounds.counts).toEqual({ audioContexts: 0, mediaElements: 0 });
    expect(sounds.mediaElementsInDocument).toBe(0);
  });

  test("keeps the limits statement next to the picture, in full and never folded away", async ({
    page,
  }) => {
    await openSheet(page, fullVisit);
    const limits = page.locator(".result-limits");
    await expect(
      limits.getByRole("heading", { name: limitsStatement.heading }),
    ).toBeVisible();
    await expect(limits.locator("li")).toHaveText([
      ...limitsStatement.sentences,
    ]);
    // It is plain text: nothing opens or closes it.
    await expect(limits.locator("button, details, summary, a")).toHaveCount(0);

    await settle(page);
    const figureBox = await page.locator(".result-figure").boundingBox();
    const limitsBox = await limits.boundingBox();
    if (figureBox === null || limitsBox === null) {
      throw new Error("The picture or the limits statement has no box.");
    }
    const beside = limitsBox.x >= figureBox.x + figureBox.width;
    if (beside) {
      // A wide screen: at the right of the picture, starting within its height.
      expect(limitsBox.y).toBeLessThan(figureBox.y + figureBox.height);
      expect(limitsBox.y + limitsBox.height).toBeGreaterThan(figureBox.y);
    } else {
      // A narrow screen: the first thing under the picture.
      expect(limitsBox.y).toBeGreaterThanOrEqual(
        figureBox.y + figureBox.height,
      );
      expect(limitsBox.y - (figureBox.y + figureBox.height)).toBeLessThan(80);
      const wordsBox = await page.locator(".result-words").boundingBox();
      expect(wordsBox?.y ?? 0).toBeGreaterThanOrEqual(
        limitsBox.y + limitsBox.height,
      );
    }
  });

  test("draws every state of a wing in its own way", async ({ page }) => {
    const mixed = withEars(fullVisit, {
      attic: {
        left: { ...counts, state: "betterThanFloor" },
        right: { ...counts, state: "worseThanCap" },
      },
      stairs: {
        left: { ...counts, state: "unreliable", reasons: ["trialLimit"] },
        right: { ...counts, state: "found", thresholdDb: -40 },
      },
      nursery: {
        left: { ...counts, state: "found", thresholdDb: -10 },
        right: { ...counts, state: "found", thresholdDb: -45 },
      },
    });
    await openSheet(page, mixed);
    await settle(page);

    // Caught at the quietest sound the house has: light to the far wall, with no end line.
    expect(await lightWidth(page, "attic", "left")).toBe(wingWidth);
    await expect(
      drawnFloor(page, "attic").locator('.result-reach[data-side="left"]'),
    ).toHaveCount(0);
    // Nothing caught: the wing stays dark and is not hatched.
    expect(await lightWidth(page, "attic", "right")).toBe(0);
    await expect(
      drawnFloor(page, "attic").locator('[data-side="right"]'),
    ).toHaveCount(0);
    // No level to draw: hatched, with no light.
    await expect(
      drawnFloor(page, "stairs").locator('.result-doubt[data-side="left"]'),
    ).toHaveCount(1);
    expect(await lightWidth(page, "stairs", "left")).toBe(0);
    await expect(
      floorWords(page, "stairs").locator(
        '.result-wing[data-state="unreliable"]',
      ),
    ).toHaveCount(1);
    // Two levels: the quieter one reaches further.
    expect(await lightWidth(page, "nursery", "right")).toBeGreaterThan(
      await lightWidth(page, "nursery", "left"),
    );
    // A floor with a wide difference offers the swapped repeat, and the page passes it on.
    await floorWords(page, "nursery")
      .getByRole("button", { name: resultPageCopy.swappedRepeatButton })
      .click();
    const nurseryIndex = mixed.summary.rooms.find(
      (room) => room.room.roomId === "nursery",
    )?.room.roomIndex;
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { resultSheet: ResultSheet }).resultSheet
            .requests,
      ),
    ).toEqual([`swappedRepeat:${String(nurseryIndex)}`]);

    // Nothing in the drawing joins one floor to another: every lit shape stays inside its room.
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll(".result-section .result-floor")].map(
        (floor) => {
          const box = (floor as SVGGraphicsElement).getBBox();
          return { top: box.y, bottom: box.y + box.height, height: box.height };
        },
      ),
    );
    const drawn = boxes
      .filter((box) => box.height > 0)
      .sort((a, b) => a.top - b.top);
    for (let index = 1; index < drawn.length; index += 1) {
      expect(drawn[index]?.top ?? 0).toBeGreaterThan(
        drawn[index - 1]?.bottom ?? 0,
      );
    }

    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);
  });

  test("leaves every wing dark for a visitor who caught nothing", async ({
    page,
  }) => {
    await openSheet(page, silentVisit);
    for (const room of silentVisit.summary.rooms) {
      expect(room.left.state).toBe("worseThanCap");
      expect(room.right.state).toBe("worseThanCap");
    }
    await expect(page.locator(".result-section .result-light")).toHaveCount(0);
    await expect(page.locator(".result-section .result-doubt")).toHaveCount(0);
    await expect(page.locator(".result-floor-words")).toHaveCount(5);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);
  });

  test("lays nothing over anything else, at this size and down to 360 by 640", async ({
    page,
  }) => {
    await openSheet(page, fullVisit);
    await page
      .getByLabel(resultPageCopy.headphoneNameLabel)
      .fill("W".repeat(resultPageConfig.headphoneNameMaxCharacterCount));
    await button(page, resultPageCopy.saveButton).click();
    await expect(savedVisits(page)).toHaveCount(1);

    const sizes = [page.viewportSize(), { width: 360, height: 640 }];
    for (const size of sizes) {
      if (size === null) {
        continue;
      }
      await page.setViewportSize(size);
      await settle(page);
      await expectNoHorizontalScroll(page);
      const overlaps = await page.evaluate(() => {
        const result = document.querySelector(".result");
        const parts = [...document.querySelectorAll(".result-page > *")].filter(
          (part) => !(part as HTMLElement).hidden,
        );
        const boxes = parts.map((part) => ({
          name: part.className,
          box: part.getBoundingClientRect(),
        }));
        const found: string[] = [];
        boxes.forEach((first, index) => {
          for (const second of boxes.slice(index + 1)) {
            const apart =
              first.box.right <= second.box.left + 0.5 ||
              second.box.right <= first.box.left + 0.5 ||
              first.box.bottom <= second.box.top + 0.5 ||
              second.box.bottom <= first.box.top + 0.5;
            if (!apart) {
              found.push(`${first.name} over ${second.name}`);
            }
          }
        });
        return {
          found,
          sideways:
            result === null ? 0 : result.scrollWidth - result.clientWidth,
        };
      });
      expect(overlaps.found, `at ${String(size.width)} wide`).toEqual([]);
      expect(overlaps.sideways, `at ${String(size.width)} wide`).toBe(0);
    }
  });

  test("saves a visit only when asked, renames it, shows it again, and deletes it", async ({
    page,
  }) => {
    await openSheet(page, quickVisit);
    const saveStatus = page.locator(".result-keep .result-status");
    const savedStatus = page.locator(".result-saved > .result-status");

    // Nothing is kept until the visitor asks.
    await expect(saveStatus).toHaveText(resultPageCopy.notSavedLine);
    await expect(savedVisits(page)).toHaveCount(0);
    await expect(page.locator(".result-saved-lines")).toContainText(
      resultPageCopy.noSavedVisitsLine,
    );
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);

    const name = page.getByLabel(resultPageCopy.headphoneNameLabel);
    await name.fill("The old grey pair");
    await button(page, resultPageCopy.saveButton).click();
    await expect(saveStatus).toHaveText(resultPageCopy.savedLine);
    await expect(savedVisits(page)).toHaveCount(1);
    await expect(
      savedVisits(page).locator(".result-headphones-name"),
    ).toHaveText("The old grey pair");
    expect(await page.evaluate(() => window.localStorage.length)).toBe(1);

    // Saving the same visit again under another name renames it. It is not saved twice.
    await name.fill("The new pair");
    await name.press("Enter");
    await expect(saveStatus).toHaveText(resultPageCopy.renamedLine);
    await expect(savedVisits(page)).toHaveCount(1);
    await expect(
      savedVisits(page).locator(".result-headphones-name"),
    ).toHaveText("The new pair");

    // After a reload the saved visit is still listed, and a new visit is not saved by itself.
    await page.reload();
    await showVisit(page, fullVisit);
    await expect(savedVisits(page)).toHaveCount(1);
    await expect(saveStatus).toHaveText(resultPageCopy.notSavedLine);
    await expect(page.locator(".result-floor-words")).toHaveCount(5);

    // Its picture can be shown in place of this visit's, and this visit's comes back.
    await savedVisits(page)
      .getByRole("button", { name: resultPageCopy.showButton })
      .click();
    await expect(page.locator(".result-floor-words")).toHaveCount(3);
    await expect(page.locator(".result-shown-visit")).toContainText(
      "The new pair",
    );
    await expect(page.locator(".result-keep")).toBeHidden();
    await expect(page.locator(".result-heading")).toBeFocused();
    await expectNoSeriousAccessibilityProblem(page);
    await button(page, resultPageCopy.backToThisVisitButton).click();
    await expect(page.locator(".result-floor-words")).toHaveCount(5);
    await expect(page.locator(".result-keep")).toBeVisible();

    // Deleting it removes it from this browser.
    await savedVisits(page)
      .getByRole("button", { name: /Delete/u })
      .click();
    await expect(savedVisits(page)).toHaveCount(0);
    await expect(savedStatus).toHaveText(resultPageCopy.deletedLine);
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  });

  test("draws an earlier visit with the same headphones as dashed outlines, by the name alone", async ({
    page,
  }) => {
    await openSheet(page, quickVisit);
    const name = page.getByLabel(resultPageCopy.headphoneNameLabel);
    const outlines = page.locator(".result-section .result-earlier");
    const comparison = page.locator(".result-comparison");
    await expect(page.locator(".result-name-hint")).toHaveText(
      comparisonCopy.headphoneNameHint,
    );
    await name.fill("The old grey pair");
    await button(page, resultPageCopy.saveButton).click();
    await expect(savedVisits(page)).toHaveCount(1);
    // The only saved visit is the one on the page, and a visit is never compared with itself.
    await expect(outlines).toHaveCount(0);

    await page.reload();
    await showVisit(page, laterQuickVisit);
    await settle(page);
    await expect(outlines).toHaveCount(0);
    await expect(comparison).toBeHidden();

    // The same name, whatever its letter case and spacing, brings the earlier visit's outlines.
    await name.fill("  the OLD  grey pair ");
    await expect(outlines).toHaveCount(6);
    await expect(comparison).toBeVisible();
    await expect(comparison).not.toHaveText(comparisonCopy.noEarlierVisitLine);
    for (const roomId of ["corridor", "stairs", "attic"] as const) {
      await expect(
        drawnFloor(page, roomId).locator(".result-earlier"),
      ).toHaveCount(2);
    }
    // Typing a name redraws the outlines and leaves the light where it is: it does not spread
    // again.
    await expect(page.locator(".result-section")).toHaveAttribute(
      "data-entering",
      "false",
    );
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    // Another name has no earlier visit, and the page says so.
    await name.fill("Another pair");
    await expect(outlines).toHaveCount(0);
    await expect(comparison).toHaveText(comparisonCopy.noEarlierVisitLine);

    // With no name there is nothing to say.
    await name.fill("");
    await expect(outlines).toHaveCount(0);
    await expect(comparison).toBeHidden();
  });

  test("asks before it deletes every saved visit, and keeps them when told to", async ({
    page,
  }) => {
    await openSheet(page, quickVisit);
    await button(page, resultPageCopy.saveButton).click();
    await showVisit(page, fullVisit);
    await button(page, resultPageCopy.saveButton).click();
    await expect(savedVisits(page)).toHaveCount(2);
    await expect(
      savedVisits(page).first().locator(".result-headphones-name"),
    ).toHaveText(resultPageCopy.unnamedHeadphonesLabel);

    await button(page, resultPageCopy.deleteAllButton).click();
    await expect(
      page.getByText(resultPageCopy.deleteAllQuestion),
    ).toBeVisible();
    await expect(
      button(page, resultPageCopy.deleteAllCancelButton),
    ).toBeFocused();
    await button(page, resultPageCopy.deleteAllCancelButton).click();
    await expect(savedVisits(page)).toHaveCount(2);

    await button(page, resultPageCopy.deleteAllButton).click();
    await button(page, resultPageCopy.deleteAllConfirmButton).click();
    await expect(savedVisits(page)).toHaveCount(0);
    await expect(page.locator(".result-saved > .result-status")).toHaveText(
      resultPageCopy.allDeletedLine,
    );
    await expect(page.locator(".result-keep .result-status")).toHaveText(
      resultPageCopy.notSavedLine,
    );
    await expect(button(page, resultPageCopy.deleteAllButton)).toBeHidden();
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  });

  test("saves the picture as an image file that holds the drawing", async ({
    page,
  }) => {
    await openSheet(page, fullVisit);
    await settle(page);
    const download = page.waitForEvent("download");
    await button(page, resultPageCopy.savePictureButton).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(
      /^did-you-hear-that-\d{4}-\d{2}-\d{2}\.png$/u,
    );
    const path = await file.path();
    const bytes = readFileSync(path);
    // A PNG: its signature, then the width and the height of the image.
    expect(bytes.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(1600);
    expect(bytes.readUInt32BE(20)).toBeGreaterThan(900);
    // A sheet with a drawing and text on it does not pack down to almost nothing.
    expect(bytes.length).toBeGreaterThan(40_000);
    await expect(page.locator(".result-figure .result-status")).toBeHidden();
  });

  test("spreads the light once, and only fades it for a visitor who asked for less motion", async ({
    page,
  }) => {
    await openPage(page, address);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await showVisit(page, quickVisit);
    const animations = await page.evaluate(() =>
      [...document.querySelectorAll(".result-section .result-light")].map(
        (light) => {
          const style = getComputedStyle(light);
          return `${style.animationName} ${style.animationDuration}`;
        },
      ),
    );
    expect(animations.length).toBeGreaterThan(0);
    for (const animation of animations) {
      expect(animation).toBe("result-appear 0.4s");
    }
  });

  test("leads back to the front door", async ({ page }) => {
    await openSheet(page, quickVisit);
    await button(page, leavingCopy.backButton).click();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { resultSheet: ResultSheet }).resultSheet
            .requests,
      ),
    ).toEqual(["back"]);
  });

  test("is not part of the built site", () => {
    expect(existsSync("dist/index.html")).toBe(true);
    expect(existsSync("dist/result-sheet.html")).toBe(false);
  });
});
