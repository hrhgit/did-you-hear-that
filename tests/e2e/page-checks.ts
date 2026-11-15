import { expect, type Page } from "@playwright/test";

// What the end-to-end tests of the public page share: opening the page with probes that count
// every sound source, and the colour arithmetic of WCAG 2.2.

/** What the page did while it was open, recorded from outside the page. */
export interface PageRecord {
  readonly otherOriginRequests: string[];
  readonly pageErrors: string[];
}

/** Counts kept inside the page by `installSoundProbes`. */
export interface SoundProbeCounts {
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
export async function openPage(
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
export function relativeLuminance(colour: string): number {
  const [red, green, blue] = parseOpaqueRgb(colour).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contrast ratio as defined by WCAG 2.2, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [
    relativeLuminance(first),
    relativeLuminance(second),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    widths.scrollWidth,
    `page width at a ${widths.innerWidth} pixel viewport`,
  ).toBeLessThanOrEqual(widths.innerWidth);
}

/** What the sound probes counted, and how many media elements the document holds. */
export async function readSoundSources(page: Page): Promise<{
  counts: SoundProbeCounts;
  mediaElementsInDocument: number;
}> {
  return page.evaluate(() => ({
    counts: (window as unknown as { __soundProbeCounts: SoundProbeCounts })
      .__soundProbeCounts,
    mediaElementsInDocument: document.querySelectorAll("audio, video").length,
  }));
}
