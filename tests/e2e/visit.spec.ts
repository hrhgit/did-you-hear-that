import { expect, test, type Page } from "@playwright/test";
import { audioOutputConfig } from "../../src/config/audio-output-config";
import { lanternConfig } from "../../src/config/lantern-config";
import { calibrationCopy } from "../../src/copy/calibration-copy";
import {
  creatureCardLabel,
  creatureCaughtCountLine,
  creatureCopy,
  creatureIntroLine,
  rollCallCaughtLine,
  rollCallCopy,
  rollCallNotHeardLines,
  stillAboutLine,
} from "../../src/copy/creature-copy";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { leavingCopy } from "../../src/copy/leaving-copy";
import { practiceCopy } from "../../src/copy/practice-copy";
import {
  caughtCountLine,
  lanternLabel,
  roomCopy,
} from "../../src/copy/room-copy";
import { rulesCopy } from "../../src/copy/rules-copy";
import { siteTitle } from "../../src/copy/site-title";
import { visitCopy } from "../../src/copy/visit-copy";
import { visitRooms } from "../../src/session/visit-rooms";
import {
  expectNoHorizontalScroll,
  expectNoSeriousAccessibilityProblem,
  openPage,
} from "./page-checks";
import { previewServers } from "./preview-servers";
import {
  answerRollCall,
  answerSide,
  button,
  calibrate,
  calibrationHeading,
  calibrationSlider,
  checkHeadphones,
  creatureCards,
  enterRoom,
  heading,
  playCheck,
  quickVisit,
  rollCallHeading,
  rollCallTurns,
  roomPicture,
} from "./visit-steps";

// A visit in a real browser, from the front door into the one room and out again (brief 05;
// one-room spec). The browser is muted: these tests check what the page shows and that its
// controls work, not what anything sounds like. Each test gets a new page, so every visit here
// ends with it.
test.use({ launchOptions: { args: ["--mute-audio"] } });

const server = previewServers[0];
if (server === undefined) {
  throw new Error("There is no preview server to test against.");
}
const address = `http://localhost:${String(server.port)}${server.basePath}`;

// A room's answer button. Its name begins with the side's word, which the headphone check's
// answer buttons share, so it is found by its own class.
const answerButton = (page: Page, side: "left" | "right") =>
  page.locator(`.visit-answer-${side}`);

/** The creatures of the short visit, in visit order. */
const creatures = visitRooms("quick").map((room) => room.roomId);
const firstCreature = creatures[0];
const lastCreature = creatures[creatures.length - 1];
if (firstCreature === undefined || lastCreature === undefined) {
  throw new Error("The short visit has no creature.");
}

/** Whoever stands in the room in plain view: a creature that is leaving is still in the page. */
const standing = (page: Page, place: string) =>
  page.locator(`${place} .room-figure:not([data-leaving="true"])`);
const rings = (page: Page, side: "left" | "right") =>
  page.locator(`.room-rings-${side} .room-ring`);
const litLanternCells = (page: Page) =>
  page.locator(".visit-lantern-cell[data-lit='true']");

test.describe(`a visit at ${address}`, () => {
  test.describe.configure({ timeout: 120_000 });

  test("walks from the front door through calibration, the headphone check and the rules into the one room", async ({
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

    // The one room, with every creature of the visit in it. It opens with the roll call: the
    // first creature stands in the middle of the room, which tells no side, and nobody stands in
    // a doorway.
    await button(page, rulesCopy.enterButton).click();
    await expect(roomPicture(page)).toBeVisible();
    await expect(rollCallHeading(page)).toHaveText(rollCallCopy.heading);
    await expect(page.locator(".visit-practice-lines p")).toHaveText([
      ...rollCallCopy.lines,
    ]);
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(firstCreature),
    );
    await expect(standing(page, ".room-stage-centre")).toHaveCount(1);
    await expect(standing(page, ".room-stage-centre")).toHaveAttribute(
      "data-creature",
      firstCreature,
    );
    await expect(
      page.locator(".room-door .room-figure, .room-door .room-sighting"),
    ).toHaveCount(0);
    await expect(page.locator(".room-ring")).toHaveCount(0);

    // Each creature has a card along the foot of the room, which says who it is.
    const cards = creatureCards(page);
    await expect(cards).toHaveCount(creatures.length);
    for (const [index, id] of creatures.entries()) {
      const card = cards.nth(index);
      await expect(
        card.getByRole("img", { name: creatureIntroLine(id), exact: true }),
      ).toBeVisible();
      await expect(card.locator(".creature-name")).toHaveText(
        creatureCopy[id].name,
      );
      await expect(card).toHaveAttribute(
        "data-state",
        id === firstCreature ? "calling" : "about",
      );
    }

    // No order of rooms is shown, and the lantern waits unlit until it counts.
    await expect(page.locator(".visit-room")).toBeHidden();
    await expect(page.locator(".visit-lantern-cell")).toHaveCount(
      lanternConfig.cellCount,
    );
    await expect(litLanternCells(page)).toHaveCount(0);
    await expect(page.locator(".visit-chase-caught")).toBeHidden();
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

  test("answers by keyboard or by touch, and the house says who it was once a practice sound is caught", async ({
    page,
    isMobile,
  }) => {
    const record = await openPage(page, address);
    await enterRoom(page);

    // The page never shows the side of a sound before its answer, so this test does not use
    // one. It gives the same answer again and again until the house speaks, first on the left
    // and then on the right. At the roll call the house speaks only for a practice sound that is
    // answered on its own side: an answer with no sound playing changes nothing, and an answer on
    // the other side only makes the sound come once more.
    const caption = page.locator(".visit-caption");
    await expect(caption).toHaveText("");
    await expect(page.locator(".room-ring")).toHaveCount(0);
    for (const side of ["left", "right"] as const) {
      await expect(async () => {
        await answerSide(page, side, isMobile);
        await expect(rings(page, side)).toHaveCount(3, { timeout: 350 });
      }).toPass({ timeout: 60_000, intervals: [50] });

      // The house says who it was, its card is marked, and the rings go out from the side that
      // was answered and from no other.
      await expect(caption).toHaveAttribute("data-shown", "true");
      const line = (await caption.textContent()) ?? "";
      const caught = creatures.find((id) => line === rollCallCaughtLine(id));
      expect(caught, `the house said: ${line}`).toBeDefined();
      await expect(
        page.locator(
          `.creature-card[data-creature="${caught ?? ""}"] .creature-card-glint`,
        ),
      ).toHaveCount(1);
      if (side === "left") {
        await expect(rings(page, "right")).toHaveCount(0);
        // The one that made the sound hops where it stands, in the middle of the room.
        await expect(
          page.locator(".room-stage-centre .room-figure-cheer"),
        ).toHaveCount(1);
      }
    }
    // Nothing of the roll call counts: the lantern is still unlit and nothing has been counted.
    await expect(litLanternCells(page)).toHaveCount(0);
    await expect(page.locator(".visit-chase-caught")).toBeHidden();
    expect(record.pageErrors).toEqual([]);
  });

  test("calls the roll before it counts, and offers to try again or go on when a sound was not caught", async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(240_000);
    const record = await openPage(page, address);
    await enterRoom(page);

    // Every creature is answered on both sides, except the last one on its right side.
    const turns = rollCallTurns(creatures);
    await answerRollCall(page, turns.slice(0, -1), isMobile);
    await expect(standing(page, ".room-stage-centre")).toHaveAttribute(
      "data-creature",
      lastCreature,
    );

    // That sound comes once more, a little louder, and is still not caught. The house then
    // says who was not caught and on which side, and nothing more plays until the visitor chooses.
    const notice = heading(page, rollCallCopy.heading);
    const lines = rollCallNotHeardLines([
      { roomId: lastCreature, side: "right" },
    ]);
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice).toBeFocused();
    for (const line of lines) {
      await expect(page.getByText(line, { exact: true })).toBeVisible();
    }
    await expect(answerButton(page, "left")).toBeHidden();
    await expect(button(page, practiceCopy.tryAgainLabel)).toBeVisible();
    await expect(button(page, practiceCopy.goOnLabel)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    // Trying again plays that one sound again and no other, and asks again when it is not caught.
    await button(page, practiceCopy.tryAgainLabel).click();
    await expect(notice).toBeHidden();
    await expect(rollCallHeading(page)).toHaveText(rollCallCopy.heading);
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(lastCreature),
    );
    await expect(standing(page, ".room-stage-centre")).toHaveAttribute(
      "data-creature",
      lastCreature,
    );
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(lines[0] ?? "", { exact: true })).toBeVisible();

    // Going on starts the counting. Nobody stands in plain view any more, the heading of the
    // roll call is gone, and the words say only that it now counts.
    await button(page, practiceCopy.goOnLabel).click();
    await expect(notice).toBeHidden();
    await expect(rollCallHeading(page)).toBeHidden();
    await expect(page.locator(".visit-practice-lines p")).toHaveText([
      ...rollCallCopy.countingLines,
    ]);
    await expect(page.locator(".room-intro")).toBeHidden();
    await expect(page.locator(".visit-practice-sound")).toBeHidden();
    await expect(standing(page, ".room-scene")).toHaveCount(0);

    // With the counting comes the lantern, full, and the count of the chase (game layer).
    const { cellCount } = lanternConfig;
    await expect(
      page.getByRole("img", { name: lanternLabel(cellCount, cellCount) }),
    ).toBeVisible();
    await expect(litLanternCells(page)).toHaveCount(cellCount);
    await expect(page.locator(".visit-chase-caught")).toHaveText(
      caughtCountLine(0),
    );
    // The bar says how many are still about, and each card what was caught of its creature.
    await expect(page.locator(".visit-room-name")).toHaveText(
      stillAboutLine(creatures.length),
    );
    const cards = creatureCards(page);
    await expect(cards).toHaveCount(creatures.length);
    for (const [index, id] of creatures.entries()) {
      const card = cards.nth(index);
      await expect(card).toHaveAttribute("data-state", "about");
      await expect(card.locator(".creature-status")).toHaveText(
        creatureCaughtCountLine(0),
      );
      await expect(
        card.getByRole("img", {
          name: creatureCardLabel(id, "about", 0, { left: null, right: null }),
          exact: true,
        }),
      ).toBeVisible();
    }
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

  test("pauses and goes on, then stops, leaves and comes back to the front door", async ({
    page,
  }) => {
    const record = await openPage(page, address);
    await enterRoom(page);

    await button(page, roomCopy.pauseButton).click();
    await expect(heading(page, leavingCopy.pauseHeading)).toBeVisible();
    await expect(page.getByText(leavingCopy.pauseLines.visitor)).toBeVisible();
    await expect(answerButton(page, "left")).toBeHidden();
    await expect(button(page, roomCopy.stopButton)).toBeVisible();
    await expectNoSeriousAccessibilityProblem(page);

    await button(page, leavingCopy.goOnButton).click();
    await expect(heading(page, leavingCopy.pauseHeading)).toBeHidden();
    await expect(button(page, roomCopy.pauseButton)).toBeVisible();
    // The roll call goes on where it was: the same creature, in the middle of the room.
    await expect(rollCallHeading(page)).toHaveText(rollCallCopy.heading);
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(firstCreature),
    );
    await expect(answerButton(page, "left")).toBeVisible();

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
    await expect(calibrationHeading(page)).toBeVisible();
    await button(page, calibrationCopy.startButton).click();
    await expect(calibrationSlider(page)).toBeVisible();

    await button(page, roomCopy.stopButton).click();
    await expect(heading(page, leavingCopy.exitHeading)).toBeVisible();
    await expect(calibrationSlider(page)).toBeHidden();
  });

  test("moves the calibration control by the keys the sheet names", async ({
    page,
    isMobile,
  }) => {
    test.skip(
      isMobile,
      "A phone has no keys, and the keys line is not shown there.",
    );
    const { calibrationSettingMinDb, calibrationSettingStepDb } =
      audioOutputConfig;
    await openPage(page, address);
    await quickVisit(page).click();
    await button(page, calibrationCopy.startButton).click();
    const slider = calibrationSlider(page);
    // The control takes the focus once the sound starts, and the keys line appears under it.
    await expect(slider).toBeFocused();
    await expect(page.getByText(calibrationCopy.keysLine)).toBeVisible();
    await expect(slider).toHaveValue(String(calibrationSettingMinDb));

    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue(
      String(calibrationSettingMinDb + calibrationSettingStepDb),
    );
    await page.keyboard.press("Shift+ArrowRight");
    await expect(slider).toHaveValue(
      String(calibrationSettingMinDb + 6 * calibrationSettingStepDb),
    );
    await page.keyboard.press("PageDown");
    await expect(slider).toHaveValue(
      String(calibrationSettingMinDb + calibrationSettingStepDb),
    );
    // The keys work with the focus on a button too.
    await button(page, calibrationCopy.quieterButton).focus();
    await page.keyboard.press("ArrowRight");
    await expect(slider).toHaveValue(
      String(calibrationSettingMinDb + 2 * calibrationSettingStepDb),
    );
    await page.keyboard.press("Home");
    await expect(slider).toHaveValue(String(calibrationSettingMinDb));

    await button(page, roomCopy.stopButton).click();
  });
});
