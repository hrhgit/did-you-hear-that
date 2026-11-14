import { expect, test, type Page } from "@playwright/test";
import { houseNotOpenLine } from "../../src/copy/house-not-open-line";
import { siteTitle } from "../../src/copy/site-title";
import { previewServers } from "./preview-servers";

/** What the page did while it was open, recorded from outside the page. */
interface PageRecord {
  readonly otherOriginRequests: string[];
  readonly pageErrors: string[];
}

/** Counts kept inside the page by `installSoundProbes`. */
interface SoundProbeCounts {
  audioContexts: number;
  mediaElements: number;
}

/**
 * Runs in the page before any of its scripts. Wraps every way the page could start a sound
 * source so that each use is counted: the `AudioContext` constructors, `new Audio()`, and
 * `document.createElement` for `audio` and `video`. The wrappers still do what the originals do.
 * This function is serialised into the page, so it uses nothing from the surrounding module.
 */
function installSoundProbes(): void {
  const counts: SoundProbeCounts = { audioContexts: 0, mediaElements: 0 };
  Object.defineProperty(window, "__soundProbeCounts", { value: counts });

  const globals = window as unknown as Record<string, unknown>;
  const countConstructions = (
    name: string,
    key: keyof SoundProbeCounts,
  ): void => {
    const original = globals[name];
    if (typeof original !== "function") {
      return;
    }
    globals[name] = new Proxy(original, {
      construct(target, args, newTarget) {
        counts[key] += 1;
        return Reflect.construct(target, args, newTarget) as object;
      },
    });
  };
  countConstructions("AudioContext", "audioContexts");
  countConstructions("webkitAudioContext", "audioContexts");
  countConstructions("Audio", "mediaElements");

  const originalCreateElement = Document.prototype.createElement;
  Document.prototype.createElement = function (
    this: Document,
    tagName: string,
    options?: ElementCreationOptions,
  ): HTMLElement {
    if (/^(audio|video)$/i.test(tagName)) {
      counts.mediaElements += 1;
    }
    return originalCreateElement.call(this, tagName, options);
  } as typeof Document.prototype.createElement;
}

/** Opens the page at `address` with the sound probes installed and the listeners attached. */
async function openPlaceholder(
  page: Page,
  address: string,
): Promise<PageRecord> {
  const record: PageRecord = { otherOriginRequests: [], pageErrors: [] };
  const pageOrigin = new URL(address).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol !== "data:" && url.origin !== pageOrigin) {
      record.otherOriginRequests.push(request.url());
    }
  });
  page.on("pageerror", (error) => {
    record.pageErrors.push(error.message);
  });
  await page.addInitScript(installSoundProbes);
  await page.goto(address, { waitUntil: "load" });
  return record;
}

/** Parses a computed colour such as `rgb(11, 12, 16)` into its 0 to 255 channels. */
function parseOpaqueRgb(colour: string): [number, number, number] {
  const match =
    /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?))?\s*\)$/.exec(
      colour,
    );
  if (match === null) {
    throw new Error(`Cannot read the colour "${colour}".`);
  }
  if (match[4] !== undefined && Number(match[4]) !== 1) {
    throw new Error(`The colour "${colour}" is not opaque.`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Relative luminance as defined by WCAG 2.2, from 0 for black to 1 for white. */
function relativeLuminance(colour: string): number {
  const [red, green, blue] = parseOpaqueRgb(colour).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contrast ratio as defined by WCAG 2.2, from 1 to 21. */
function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    widths.scrollWidth,
    `page width at a ${widths.innerWidth} pixel viewport`,
  ).toBeLessThanOrEqual(widths.innerWidth);
}

for (const server of previewServers) {
  const address = `http://localhost:${server.port}${server.basePath}`;

  test.describe(`placeholder page at the ${server.name} (${address})`, () => {
    test("shows the site title as the only heading and the line, and no other text", async ({
      page,
    }) => {
      await openPlaceholder(page, address);

      await expect(
        page.getByRole("heading", { level: 1, name: siteTitle }),
      ).toBeVisible();
      await expect(page.getByText(houseNotOpenLine)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

      const visibleLines = (await page.locator("body").innerText())
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");
      expect(visibleLines).toEqual([siteTitle, houseNotOpenLine]);

      expect(await page.evaluate(() => document.title)).toBe(siteTitle);
    });

    test("has a dark background and text with enough contrast", async ({
      page,
    }) => {
      await openPlaceholder(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const colours = await page.evaluate(() => {
        const colourOf = (selector: string): string => {
          const element = document.querySelector(selector);
          if (element === null) {
            throw new Error(`No element matches ${selector}.`);
          }
          return getComputedStyle(element).color;
        };
        return {
          background: getComputedStyle(document.body).backgroundColor,
          body: colourOf("body"),
          heading: colourOf("h1"),
          line: colourOf("p"),
        };
      });

      expect(
        relativeLuminance(colours.background),
        `luminance of ${colours.background}`,
      ).toBeLessThanOrEqual(0.05);
      for (const text of [colours.body, colours.heading, colours.line]) {
        expect(
          contrastRatio(text, colours.background),
          `contrast of ${text} on ${colours.background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    test("makes no sound", async ({ page }) => {
      await openPlaceholder(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const sound = await page.evaluate(() => ({
        counts: (window as unknown as { __soundProbeCounts: SoundProbeCounts })
          .__soundProbeCounts,
        mediaElementsInDocument:
          document.querySelectorAll("audio, video").length,
      }));
      expect(sound).toEqual({
        counts: { audioContexts: 0, mediaElements: 0 },
        mediaElementsInDocument: 0,
      });
    });

    test("fits the width at the project viewport and at 360 by 640", async ({
      page,
    }) => {
      await openPlaceholder(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);

      await page.setViewportSize({ width: 360, height: 640 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });

    test("requests nothing from another origin and raises no error", async ({
      page,
    }) => {
      const record = await openPlaceholder(page, address);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(record, "requests to other origins and uncaught errors").toEqual({
        otherOriginRequests: [],
        pageErrors: [],
      });
    });
  });
}
