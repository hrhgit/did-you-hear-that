import { describe, expect, it } from "vitest";
import { createManualTimer } from "../../config/manual-timer";
import { createCaption } from "./show-caption";

/** How long a line stays, a line with a note under it, and a line that was hurried. */
const shownMs = 4200;
const withNoteShownMs = 6000;
const hurriedMs = 1300;

/** As much of an element as the caption touches. */
function fakeElement(): HTMLElement {
  return { textContent: "", dataset: {} } as unknown as HTMLElement;
}

function captionOn() {
  // The manual timer has the two calls of a window the caption makes, and its handles are numbers.
  const timer = createManualTimer();
  const line = fakeElement();
  const note = fakeElement();
  const caption = createCaption(timer as unknown as Window, line, note);
  const shown = (element: HTMLElement): boolean =>
    element.dataset.shown === "true";
  return { timer, line, note, caption, shown };
}

describe("createCaption", () => {
  it("shows a line for a few seconds, then lets it fade with its words in place", () => {
    const { timer, line, note, caption, shown } = captionOn();
    expect(shown(line)).toBe(false);
    caption.say("You caught Squeak on your left.");
    expect(line.textContent).toBe("You caught Squeak on your left.");
    expect(shown(line)).toBe(true);
    expect(shown(note)).toBe(false);
    timer.advanceBy(shownMs - 1);
    expect(shown(line)).toBe(true);
    timer.advanceBy(1);
    expect(shown(line)).toBe(false);
    // The words stay while the line fades, so a screen reader is not cut off.
    expect(line.textContent).toBe("You caught Squeak on your left.");
    expect(timer.pendingCount()).toBe(0);
  });

  it("replaces the line before it, and counts its time from the new line", () => {
    const { timer, line, caption, shown } = captionOn();
    caption.say("Scritch went by on your right.");
    timer.advanceBy(shownMs - 100);
    caption.say("You caught Tink on your left.");
    expect(line.textContent).toBe("You caught Tink on your left.");
    timer.advanceBy(shownMs - 1);
    expect(shown(line)).toBe(true);
    timer.advanceBy(1);
    expect(shown(line)).toBe(false);
    expect(timer.pendingCount()).toBe(0);
  });

  it("adds a note under the line and keeps both a little longer", () => {
    const { timer, line, note, caption, shown } = captionOn();
    caption.say("You caught Thump on your right.");
    timer.advanceBy(1000);
    caption.note("Thump has gone back to the cellar.");
    expect(note.textContent).toBe("Thump has gone back to the cellar.");
    expect(shown(line)).toBe(true);
    expect(shown(note)).toBe(true);
    timer.advanceBy(withNoteShownMs - 1);
    expect(shown(line)).toBe(true);
    expect(shown(note)).toBe(true);
    timer.advanceBy(1);
    expect(shown(line)).toBe(false);
    expect(shown(note)).toBe(false);
  });

  it("lets the note of the sound before fade when the next line is said, without cutting its words", () => {
    const { note, caption, shown } = captionOn();
    caption.say("You caught Thump on your right.");
    caption.note("Thump has gone back to the cellar.");
    caption.say("Murmur went by on your left.");
    expect(shown(note)).toBe(false);
    expect(note.textContent).toBe("Thump has gone back to the cellar.");
  });

  it("lets the lines fade soon when hurried, so they do not stand under the next one", () => {
    const { timer, line, note, caption, shown } = captionOn();
    caption.say("You caught Thump on your right.");
    caption.note("Thump has gone back to the cellar.");
    timer.advanceBy(500);
    caption.hurry();
    timer.advanceBy(hurriedMs - 1);
    expect(shown(line)).toBe(true);
    expect(shown(note)).toBe(true);
    timer.advanceBy(1);
    expect(shown(line)).toBe(false);
    expect(shown(note)).toBe(false);
    expect(timer.pendingCount()).toBe(0);
  });

  it("does nothing when hurried with no line shown", () => {
    const { timer, line, caption, shown } = captionOn();
    caption.hurry();
    expect(timer.pendingCount()).toBe(0);
    caption.say("You caught Squeak on your left.");
    timer.advanceBy(shownMs);
    expect(shown(line)).toBe(false);
    // The line has faded: a hurry now neither shows it again nor waits for anything.
    caption.hurry();
    expect(shown(line)).toBe(false);
    expect(timer.pendingCount()).toBe(0);
    // And the next line gets its whole time.
    caption.say("Scritch went by on your right.");
    timer.advanceBy(shownMs - 1);
    expect(shown(line)).toBe(true);
  });

  it("removes the lines at once for a change of screen, words and all", () => {
    const { timer, line, note, caption, shown } = captionOn();
    caption.say("You caught Thump on your right.");
    caption.note("Thump has gone back to the cellar.");
    caption.clear();
    expect(shown(line)).toBe(false);
    expect(shown(note)).toBe(false);
    expect(line.textContent).toBe("");
    expect(note.textContent).toBe("");
    expect(timer.pendingCount()).toBe(0);
    // Clearing an empty caption is harmless.
    caption.clear();
    expect(timer.pendingCount()).toBe(0);
  });
});
