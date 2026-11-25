import { expect, test, type Page } from "@playwright/test";
import { rhythmConfig } from "../../src/config/rhythm-config";
import { visitFlowConfig } from "../../src/config/visit-flow-config";
import { referenceVolumeCopy } from "../../src/copy/calibration-copy";
import {
  creatureCardLabel,
  creatureCaughtCountLine,
  creatureCopy,
  creatureIntroLine,
  rollCallCaughtLine,
  rollCallCopy,
  stillAboutLine,
} from "../../src/copy/creature-copy";
import { headphoneCheckCopy } from "../../src/copy/headphone-check-copy";
import { leavingCopy } from "../../src/copy/leaving-copy";
import { practiceCopy } from "../../src/copy/practice-copy";
import { resultPageCopy } from "../../src/copy/result-page-copy";
import { roomCopy } from "../../src/copy/room-copy";
import { rhythmCopy, rhythmHudLabel } from "../../src/copy/rhythm-copy";
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
import { expectDrawn, expectFeatured, scene } from "./scene-record";
import {
  answerRollCall,
  answerSide,
  button,
  checkHeadphones,
  creatureCards,
  enterHouse,
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

/** The creatures of the visit, in visit order. */
const creatures = visitRooms("full").map((room) => room.roomId);
const firstCreature = creatures[0];
const lastCreature = creatures[creatures.length - 1];
if (firstCreature === undefined || lastCreature === undefined) {
  throw new Error("The visit has no creature.");
}

const score = (page: Page) => page.locator(".rhythm-score");

test.describe(`a visit at ${address}`, () => {
  test.describe.configure({ timeout: 120_000 });

  test("walks from the front door through the headphone check and the rules into the one room", async ({
    page,
    hasTouch,
  }) => {
    const record = await openPage(page, address);
    await expect(heading(page, siteTitle)).toBeVisible();

    await enterHouse(page);
    await expect(page.getByText(referenceVolumeCopy.keptLine)).toBeVisible();
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
    // The keys are drawn as key caps, and their line is read out. The touch line is shown only
    // where there is a touch screen.
    await expect(page.locator(".visit-halves")).toBeVisible();
    await expect(page.getByText(rulesCopy.keyboardLine)).toBeAttached();
    await expect(page.getByText(rulesCopy.touchLine)).toBeVisible({
      visible: hasTouch,
    });
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAccessibilityProblem(page);

    // The one room, with every creature of the visit in it. It opens with the roll call: the
    // first creature stands in plain view, and nothing has been drawn for a turn.
    await button(page, rulesCopy.enterButton).click();
    await expect(roomPicture(page)).toBeVisible();
    await expect(rollCallHeading(page)).toHaveText(rollCallCopy.heading);
    await expect(page.locator(".visit-practice-lines p")).toHaveText([
      ...rollCallCopy.lines,
    ]);
    await expect(page.locator(".room-intro")).toHaveText(
      creatureIntroLine(firstCreature),
    );
    await expectFeatured(page, firstCreature);
    await expectDrawn(page, "none");
    await expect(scene(page)).toHaveAttribute("data-rings", "0");

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

    // No order of rooms is shown, and nothing is scored until it counts: a warm-up.
    await expect(page.locator(".visit-room")).toBeHidden();
    await expect(score(page)).toBeHidden();
    await expect(page.locator(".rhythm-warm-up")).toHaveText(
      rhythmCopy.warmUpWord,
    );
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

  test("answers the roll call by keyboard or touch and starts counting automatically", async ({
    page,
    isMobile,
  }) => {
    type ThemeTrace = { starts: boolean[]; stops: boolean[] };
    type ThemeTraceWindow = Window & { themeTrace: ThemeTrace };
    await page.addInitScript((roomTimeLimitMs) => {
      // Let the real room finish in this test without waiting five minutes.
      const browser: Window = window;
      const setTimeout = browser.setTimeout.bind(browser);
      browser.setTimeout = (handler, delay, ...args: unknown[]) =>
        setTimeout(handler, delay === roomTimeLimitMs ? 1_800 : delay, ...args);

      const trace: ThemeTrace = { starts: [], stops: [] };
      (window as unknown as ThemeTraceWindow).themeTrace = trace;
      const sources = new WeakSet<AudioBufferSourceNode>();
      let themeLength: number | undefined;
      const start = AudioBufferSourceNode.prototype.start;
      const stop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start = function (...args) {
        // The first loop starts on the headphone check screen, before the room's beat.
        if (this.loop) {
          themeLength ??= this.buffer?.length;
        }
        if (themeLength !== undefined && this.buffer?.length === themeLength) {
          sources.add(this);
          trace.starts.push(this.loop);
        }
        return start.apply(this, args);
      };
      AudioBufferSourceNode.prototype.stop = function (...args) {
        if (sources.has(this)) {
          trace.stops.push(this.loop);
        }
        return stop.apply(this, args);
      };
    }, visitFlowConfig.roomTimeLimitMs);
    const record = await openPage(page, address);
    const themeTrace = () =>
      page.evaluate(() => (window as unknown as ThemeTraceWindow).themeTrace);
    await enterHouse(page);
    await expect.poll(themeTrace).toEqual({ starts: [true], stops: [] });
    await checkHeadphones(page);
    await button(page, rulesCopy.enterButton).click();
    await expect(rollCallHeading(page)).toBeVisible();

    // The page never shows the side of a sound before its answer, so this test does not use
    // one. It gives the same answer again and again until the house speaks, first on the left
    // and then on the right. At the roll call the house speaks only for a practice sound that is
    // answered on its own side: an answer with no sound playing changes nothing, and an answer on
    // the other side only makes the sound come once more.
    const caption = page.locator(".visit-caption");
    await expect(caption).toHaveText("");
    await expect(scene(page)).toHaveAttribute("data-rings", "0");
    for (const side of ["left", "right"] as const) {
      await expect(async () => {
        await answerSide(page, side, isMobile);
        await expect(scene(page)).toHaveAttribute("data-rings-side", side, {
          timeout: 350,
        });
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
        await expect(scene(page)).toHaveAttribute("data-rings", "1");
        // The one that made the sound hops where it stands, in the middle of the room.
        await expect(scene(page)).toHaveAttribute("data-cheers", "1");
      }
    }
    // Nothing of the roll call counts: nothing is scored yet.
    await expect(score(page)).toBeHidden();
    await answerRollCall(page, rollCallTurns(creatures.slice(1)), isMobile);
    await expect(score(page)).toBeVisible();
    await expect(rollCallHeading(page)).toBeHidden();

    await expect(heading(page, resultPageCopy.heading)).toBeVisible();
    await expect
      .poll(themeTrace)
      .toEqual({ starts: [true, false], stops: [true] });
    await button(page, leavingCopy.backButton).click();
    await expect(heading(page, siteTitle)).toBeVisible();
    await expect.poll(themeTrace).toEqual({
      starts: [true, false],
      stops: [true, false],
    });
    expect(record.pageErrors).toEqual([]);
  });

  test("starts counting automatically when the last roll call sound was missed", async ({
    page,
    isMobile,
  }) => {
    test.setTimeout(240_000);
    const record = await openPage(page, address);
    await enterRoom(page);

    // Every creature is answered on both sides, except the last one on its right side.
    const turns = rollCallTurns(creatures);
    await answerRollCall(page, turns.slice(0, -1), isMobile);
    await expectFeatured(page, lastCreature);

    // That sound comes once more and is still not caught. Without another press the roll call
    // gives way to the score and Jack's flame.
    const notice = heading(page, rollCallCopy.heading);
    await expect(score(page)).toBeVisible({ timeout: 60_000 });
    await expect(notice).toBeHidden();
    await expect(button(page, practiceCopy.tryAgainLabel)).toBeHidden();
    await expect(button(page, practiceCopy.goOnLabel)).toBeHidden();
    await expect(page.locator(".visit-practice")).toBeHidden();
    await expectFeatured(page, null);

    // With the counting comes the score, from nothing, and Jack's flame, full (the rhythm game).
    const { flameMax } = rhythmConfig;
    await expect(
      page.getByRole("group", {
        name: rhythmHudLabel(0, 0, flameMax, flameMax),
      }),
    ).toBeVisible();
    await expect(page.locator(".rhythm-warm-up")).toBeHidden();
    await expect(page.locator(".rhythm-combo-count")).toHaveText("0");
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

  test("stops from the headphone check with one press", async ({ page }) => {
    await openPage(page, address);
    await enterHouse(page);

    await button(page, roomCopy.stopButton).click();
    await expect(heading(page, leavingCopy.exitHeading)).toBeVisible();
    await expect(button(page, headphoneCheckCopy.playButton)).toBeHidden();
  });

  test("plays the old reference as an opening theme and stops it for the headphone check", async ({
    page,
  }) => {
    type AudioTraceWindow = Window & { audioTrace: string[] };
    await page.addInitScript(() => {
      const trace: string[] = [];
      (window as unknown as AudioTraceWindow).audioTrace = trace;
      const start = AudioBufferSourceNode.prototype.start;
      const stop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start = function (...args) {
        trace.push(this.loop ? "theme started" : "check started");
        return start.apply(this, args);
      };
      AudioBufferSourceNode.prototype.stop = function (...args) {
        if (this.loop) {
          trace.push("theme stopped");
        }
        return stop.apply(this, args);
      };
    });
    await openPage(page, address);
    const audioTrace = () =>
      page.evaluate(() => (window as unknown as AudioTraceWindow).audioTrace);
    expect(await audioTrace()).toEqual([]);

    await enterHouse(page);
    await expect(page.locator(".visit-sheet-calibration")).toHaveCount(0);
    await expect.poll(audioTrace).toEqual(["theme started"]);

    await playCheck(page);
    expect(await audioTrace()).toEqual([
      "theme started",
      "theme stopped",
      "check started",
    ]);
  });

  test("can check headphones when the theme file is unavailable", async ({
    page,
  }) => {
    await page.route("**/calibration-waltz.m4a", (route) => route.abort());
    await page.goto(address);
    await enterHouse(page);
    await checkHeadphones(page);
  });

  test("runs just the headphone check again after the audio device changes", async ({
    page,
  }) => {
    await openPage(page, address);
    await enterRoom(page);

    await page.evaluate(() =>
      navigator.mediaDevices.dispatchEvent(new Event("devicechange")),
    );
    await expect(heading(page, leavingCopy.pauseHeading)).toBeVisible();
    await button(page, leavingCopy.goOnButton).click();
    await expect(heading(page, visitCopy.headphoneCheckHeading)).toBeVisible();
    await playCheck(page);
    await button(page, headphoneCheckCopy.answers.left).click();
    await button(page, visitCopy.goOnButton).click();
    await expect(rollCallHeading(page)).toHaveText(rollCallCopy.heading);
  });
});
