import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { frontDoorCopy } from "../../src/copy/front-door-copy";
import { siteTitle } from "../../src/copy/site-title";
import {
  contrastRatio,
  expectNoHorizontalScroll,
  openPage,
  readSoundSources,
  relativeLuminance,
} from "./page-checks";
import { previewServers } from "./preview-servers";

// The front door of the house, as the built site serves it (brief 05). Nothing here presses a
// control that starts a sound.

for (const server of previewServers) {
  const address = `http://localhost:${server.port}${server.basePath}`;

  test.describe(`front door at the ${server.name} (${address})`, () => {
    test("shows the title, the headphones line, two ways in and the privacy line", async ({
      page,
    }) => {
      await openPage(page, address);

      await expect(
        page.getByRole("heading", { level: 1, name: siteTitle }),
      ).toBeVisible();
      await expect(page.getByRole("heading")).toHaveCount(1);
      await expect(page.getByText(frontDoorCopy.headphonesLine)).toBeVisible();
      await expect(page.getByText(frontDoorCopy.privacyLine)).toBeVisible();

      const ways = page.getByRole("group", {
        name: frontDoorCopy.choicesLabel,
      });
      await expect(ways.getByRole("button")).toHaveCount(2);
      for (const choice of Object.values(frontDoorCopy.choices)) {
        await expect(
          ways.getByRole("button", { name: choice.button }),
        ).toBeVisible();
      }
      expect(await page.evaluate(() => document.title)).toBe(siteTitle);
    });

    test("keeps the replay door shut until it is built", async ({ page }) => {
      await openPage(page, address);
      const replay = page.getByRole("button", {
        name: frontDoorCopy.choices.replay.button,
      });
      await expect(replay).toBeDisabled();
      await replay.click({ force: true });
      await expect(
        page.getByRole("heading", { level: 1, name: siteTitle }),
      ).toBeVisible();
    });

    test("has a dark background and text with enough contrast", async ({
      page,
    }) => {
      await openPage(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const colours = await page.evaluate(() => {
        const texts = [
          ...document.querySelectorAll(
            ".visit-sheet-front h1, .visit-sheet-front p, .visit-sheet-front button, .visit-sheet-front .visit-button-note",
          ),
        ].filter((element) => element.textContent.trim() !== "");
        return {
          background: getComputedStyle(document.body).backgroundColor,
          texts: texts.map((element) => getComputedStyle(element).color),
        };
      });

      expect(
        relativeLuminance(colours.background),
        `luminance of ${colours.background}`,
      ).toBeLessThanOrEqual(0.05);
      expect(colours.texts.length).toBeGreaterThanOrEqual(8);
      for (const text of colours.texts) {
        expect(
          contrastRatio(text, colours.background),
          `contrast of ${text} on ${colours.background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    test("makes no sound source before a press", async ({ page }) => {
      await openPage(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Long enough for the drawing and the moving layer to have started.
      await page.waitForTimeout(500);

      expect(await readSoundSources(page)).toEqual({
        counts: { audioContexts: 0, mediaElements: 0 },
        mediaElementsInDocument: 0,
      });
    });

    test("fits the width at the project viewport and at 360 by 640, and every way in can be reached", async ({
      page,
    }) => {
      await openPage(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);

      await page.setViewportSize({ width: 360, height: 640 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
      for (const choice of Object.values(frontDoorCopy.choices)) {
        const button = page.getByRole("button", { name: choice.button });
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport({ ratio: 1 });
      }
    });

    test("can be walked with the Tab key, with a visible focus", async ({
      page,
    }) => {
      await openPage(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.keyboard.press("Tab");
      const quick = page.getByRole("button", {
        name: frontDoorCopy.choices.full.button,
      });
      await expect(quick).toBeFocused();
      const outline = await quick.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      );
      expect(outline).not.toBe("none");
    });

    test("has no serious accessibility problem", async ({ page }) => {
      await openPage(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (violation) =>
          violation.impact === "serious" || violation.impact === "critical",
      );
      expect(
        serious.map((violation) => `${violation.id}: ${violation.help}`),
      ).toEqual([]);
    });

    test("requests nothing from another origin and raises no error", async ({
      page,
    }) => {
      const record = await openPage(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(record, "requests to other origins and uncaught errors").toEqual({
        otherOriginRequests: [],
        pageErrors: [],
      });
    });
  });
}
