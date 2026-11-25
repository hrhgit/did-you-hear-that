import { expect, type Locator, type Page } from "@playwright/test";

/**
 * What the room's canvas draws, read from the record the scene keeps on `.room-scene`
 * (`src/ui/room/build-room-scene.ts`): who stands in plain view and where, the last thing a
 * scored turn drew, and counts of every drawing, ring, hop and cue. The canvas only paints, so
 * this is how a test tells what it shows.
 */

type Side = "left" | "right";
type Place = "centre" | Side;
export type SceneOutcome =
  "none" | "caught" | "slipped" | "steady" | "trick" | "whiff";

export const scene = (page: Page): Locator => page.locator(".room-scene");

/** Who the scene draws in plain view (null for nobody), where, and whether it is sounding. */
export async function expectFeatured(
  page: Page,
  id: string | null,
  place?: Place,
  sounding?: boolean,
): Promise<void> {
  const drawn = scene(page);
  await expect(drawn).toHaveAttribute("data-featured", id ?? "none");
  if (id === null) {
    await expect(drawn).toHaveAttribute("data-featured-place", "none");
    return;
  }
  if (place !== undefined) {
    await expect(drawn).toHaveAttribute("data-featured-place", place);
  }
  if (sounding !== undefined) {
    await expect(drawn).toHaveAttribute("data-sounding", String(sounding));
  }
}

/** How many of a thing the scene has drawn since the page began. */
export const countOf = (
  page: Page,
  what: "drawings" | "rings" | "cheers" | "cues",
): Promise<number> =>
  scene(page).evaluate(
    (element, name) => Number((element as HTMLElement).dataset[name] ?? "0"),
    what,
  );

/** The last thing a scored turn drew: what, on which side and whose creature (null for none). */
export async function expectDrawn(
  page: Page,
  outcome: SceneOutcome,
  side: Side | null = null,
  creature: string | null = null,
): Promise<void> {
  const drawn = scene(page);
  await expect(drawn).toHaveAttribute("data-outcome", outcome);
  await expect(drawn).toHaveAttribute("data-outcome-side", side ?? "none");
  await expect(drawn).toHaveAttribute(
    "data-outcome-creature",
    creature ?? "none",
  );
}

/** The side the last rings went out from, or null when none are left in the yard. */
export const expectRingsFrom = (page: Page, side: Side | null): Promise<void> =>
  expect(scene(page)).toHaveAttribute("data-rings-side", side ?? "none");
