import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { resultPageCopy } from "../../src/copy/result-page-copy";
import { swappedRepeatCopy } from "../../src/copy/swapped-repeat-copy";
import { resultPicture } from "../../src/session/result-picture";
import type { VisitToSave } from "../../src/session/result-page-types";
import type { SwappedRepeatComparison } from "../../src/session/visit-flow-types";
import type { ResultSheet } from "../../src/ui/result/start-result-sheet";
import { devServer } from "./dev-server";
import { expectNoHorizontalScroll, openPage } from "./page-checks";
import {
  simulatedRepeatedResult,
  type SimulatedRepeatedResult,
} from "./simulated-result";

// The result after a swapped repeat, in a real browser. A simulated visitor walks a whole visit in
// Node, on the fake audio backend, then repeats one floor with the headphones swapped, answers the
// check and the room through what it wears, and goes back to the result. The development result
// sheet draws what the visit flow gave then. No sound is played, and the browser runs muted all
// the same.
test.use({ launchOptions: { args: ["--mute-audio"] } });

const address = `http://localhost:${String(devServer.port)}${devServer.resultSheetPath}`;

/** A visitor whose right ear needs louder sounds than the left, with even headphones. */
let earVisit: SimulatedRepeatedResult;
/** A visitor with even ears, whose right earpiece plays 25 dB quieter than the left. */
let earpieceVisit: SimulatedRepeatedResult;

test.beforeAll(async () => {
  earVisit = await simulatedRepeatedResult(
    "quick",
    { kind: "thresholds", leftDb: -45, rightDb: -20 },
    { floor: { kind: "firstOffered" }, swaps: true, imbalanceDb: 0 },
  );
  earpieceVisit = await simulatedRepeatedResult(
    "quick",
    { kind: "thresholds", leftDb: -30, rightDb: -30 },
    { floor: { kind: "lastOffered" }, swaps: true, imbalanceDb: 25 },
  );
});

type SheetWindow = Window & { resultSheet: ResultSheet };

async function show(
  page: Page,
  visit: VisitToSave,
  turnBackLine: string | null,
): Promise<void> {
  await page.evaluate(
    ([given, line]) => {
      (window as unknown as SheetWindow).resultSheet.show(given, line);
    },
    [visit, turnBackLine] as const,
  );
  await expect(page.locator(".result")).toBeVisible();
}

type RepeatWindow = SheetWindow & { repeatedVisit: Required<VisitToSave> };

/**
 * Hands a visit with its repeats to the page once. The archive knows a visit it has saved by its
 * log object, and the visit flow keeps that one object from the result through the repeat and back,
 * so the page must be shown the visit before and after the repeat with the same log object, not
 * with two copies of it.
 */
async function handOver(
  page: Page,
  visit: Required<VisitToSave>,
): Promise<void> {
  await page.evaluate((given) => {
    (window as unknown as RepeatWindow).repeatedVisit = given;
  }, visit);
}

/** Shows the visit handed over, as it was before its repeats or as it is after them. */
async function showHandedOver(
  page: Page,
  when: "beforeRepeat" | "afterRepeat",
  turnBackLine: string | null,
): Promise<void> {
  await page.evaluate(
    ([moment, line]) => {
      const view = window as unknown as RepeatWindow;
      const visit = view.repeatedVisit;
      view.resultSheet.show(
        moment === "afterRepeat"
          ? visit
          : { visitLog: visit.visitLog, summary: visit.summary },
        line,
      );
    },
    [when, turnBackLine] as const,
  );
  await expect(page.locator(".result")).toBeVisible();
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
const offers = (page: Page): Locator =>
  page
    .locator(".result-floors")
    .getByRole("button", { name: resultPageCopy.swappedRepeatButton });

/** What the session says of the repeat beside its floor, as the result picture gives it. */
function repeatOf(result: SimulatedRepeatedResult): SwappedRepeatComparison {
  const picture = resultPicture({
    kind: "live",
    visit: result.visit,
    localDate: "2026-11-20",
    earlierVisit: null,
  });
  const repeated = picture.floors.filter((floor) => floor.repeat !== null);
  expect(repeated).toHaveLength(1);
  const comparison = repeated[0]?.repeat;
  if (comparison === undefined || comparison === null) {
    throw new Error("The picture draws no swapped repeat.");
  }
  return comparison;
}

/** The floors that offer the repeat in a visit's summary. */
const offeredCount = (visit: VisitToSave): number =>
  visit.summary.rooms.filter((room) => room.swappedRepeatOffered).length;

/** Checks the block of a repeat beside its floor, against what the session gives. */
async function expectRepeatBeside(
  page: Page,
  comparison: SwappedRepeatComparison,
): Promise<void> {
  const floorWords = page.locator(".result-floor-words").filter({
    has: page.locator(
      `.repeat-comparison[data-room="${String(comparison.roomIndex)}"]`,
    ),
  });
  await expect(floorWords).toHaveCount(1);
  const block = floorWords.locator(".repeat-comparison");
  await expect(
    block.getByRole("heading", { name: comparison.heading, level: 4 }),
  ).toBeVisible();
  await expect(
    block.getByRole("img", { name: comparison.heading }),
  ).toBeVisible();
  await expect(block.locator(".repeat-outcome")).toHaveAttribute(
    "data-outcome",
    comparison.outcome,
  );
  await expect(block.locator(".repeat-outcome-label")).toHaveText(
    comparison.outcomeLabel,
  );
  for (const line of comparison.outcomeLines) {
    await expect(block.locator(".repeat-outcome")).toContainText(line);
  }
  for (const run of comparison.runs) {
    await expect(block.locator(".repeat-runs")).toContainText(run.label);
    await expect(block.locator(".repeat-runs")).toContainText(
      run.differenceLabel,
    );
  }
  // The floor visited again no longer offers it.
  await expect(floorWords.locator(".result-swap")).toHaveCount(0);
}

test.describe("the result after a swapped repeat", () => {
  test("draws the repeat beside its floor when the same ear needed the louder sound both times", async ({
    page,
  }) => {
    const comparison = repeatOf(earVisit);
    expect(comparison.outcome).toBe("followsEar");
    expect(earVisit.turnBackLine).toBe(swappedRepeatCopy.turnBackLine);
    const record = await openPage(page, address);
    await show(page, earVisit.visit, earVisit.turnBackLine);

    await expect(
      page
        .getByRole("status")
        .filter({ hasText: swappedRepeatCopy.turnBackLine }),
    ).toBeVisible();
    await expectRepeatBeside(page, comparison);
    await expect(offers(page)).toHaveCount(offeredCount(earVisit.visit) - 1);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);
    expect(record.pageErrors).toEqual([]);
  });

  test("draws the repeat beside its floor when the same earpiece needed the louder sound", async ({
    page,
  }) => {
    const comparison = repeatOf(earpieceVisit);
    expect(comparison.outcome).toBe("followsEarpiece");
    const record = await openPage(page, address);
    await show(page, earpieceVisit.visit, earpieceVisit.turnBackLine);

    await expectRepeatBeside(page, comparison);
    await expect(offers(page)).toHaveCount(
      offeredCount(earpieceVisit.visit) - 1,
    );
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);
    expect(record.pageErrors).toEqual([]);
  });

  test("says when the saved copy lacks the repeat, saves it again, and shows it from the saved copy", async ({
    page,
  }) => {
    const comparison = repeatOf(earVisit);
    const record = await openPage(page, address);
    const lacks = page.getByText(swappedRepeatCopy.savedCopyLacksLine, {
      exact: true,
    });
    const savedVisits = page.locator(".result-saved-visit");

    // The visit as it was before the repeat, saved.
    await handOver(page, earVisit.visit);
    await showHandedOver(page, "beforeRepeat", null);
    await expect(page.locator(".repeat-comparison")).toHaveCount(0);
    await button(page, resultPageCopy.saveButton).click();
    await expect(savedVisits).toHaveCount(1);
    await expect(lacks).toBeHidden();

    // Back from the repeat: the saved copy lacks it until the visit is saved again.
    await showHandedOver(page, "afterRepeat", earVisit.turnBackLine);
    await expect(lacks).toBeVisible();
    await expect(
      button(page, resultPageCopy.saveButton),
    ).toHaveAccessibleDescription(swappedRepeatCopy.savedCopyLacksLine);
    await button(page, resultPageCopy.saveButton).click();
    await expect(lacks).toBeHidden();
    await expect(savedVisits).toHaveCount(1);

    // The saved copy keeps the repeat after the page is opened again.
    await page.reload();
    await handOver(page, earVisit.visit);
    await showHandedOver(page, "beforeRepeat", null);
    await expect(page.locator(".repeat-comparison")).toHaveCount(0);
    await savedVisits
      .first()
      .getByRole("button", { name: resultPageCopy.showButton })
      .click();
    await expectRepeatBeside(page, comparison);
    // A saved visit is only looked at: the line about turning back belongs to the visit just ended.
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: swappedRepeatCopy.turnBackLine }),
    ).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    expect(record.pageErrors).toEqual([]);
  });
});
