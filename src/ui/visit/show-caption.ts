/** How long a line stays under the room before it fades. */
const captionShownMs = 4200;

/** How long the two lines stay once a note stands under the first: there is more to read. */
const captionWithNoteShownMs = 6000;

/** How long the lines stay once the one they are about has begun to leave the room. */
const captionHurriedMs = 1300;

/** How a line under the room is set: about a catch, about a sound that got away, or plain. */
export type CaptionTone = "catch" | "miss";

/** The lines under the room: what the house says about a sound that has been answered. */
export interface Caption {
  /**
   * Shows a line, replacing the one before it, and lets it fade after a few seconds. A `tone`
   * marks what the house says about a catch or a sound that got away (the game layer, 2026-11-17).
   */
  say(line: string, tone?: CaptionTone): void;
  /**
   * Adds a second line under the first, for something that follows from the sound just answered,
   * and keeps both a little longer.
   */
  note(line: string): void;
  /**
   * Lets the lines fade soon: the one they are about is leaving, and they must not stand under
   * the next one. Does nothing when no line is shown.
   */
  hurry(): void;
  /** Removes the lines at once, for a change of screen. */
  clear(): void;
}

/**
 * Creates the caption on two elements that announce themselves politely: the line and the note
 * under it. The text stays in an element while it fades, so a screen reader is not cut off.
 */
export function createCaption(
  view: Window,
  element: HTMLElement,
  noteElement: HTMLElement,
): Caption {
  let hide: number | null = null;
  const cancel = (): void => {
    if (hide !== null) {
      view.clearTimeout(hide);
      hide = null;
    }
  };
  const hideAfter = (shownMs: number): void => {
    cancel();
    hide = view.setTimeout(() => {
      delete element.dataset.shown;
      delete noteElement.dataset.shown;
      hide = null;
    }, shownMs);
  };
  return {
    say(line, tone) {
      element.textContent = line;
      element.dataset.shown = "true";
      if (tone === undefined) {
        delete element.dataset.tone;
      } else {
        element.dataset.tone = tone;
      }
      // The note of the sound before fades with its words in place. It is not cut off.
      delete noteElement.dataset.shown;
      hideAfter(captionShownMs);
    },
    note(line) {
      noteElement.textContent = line;
      noteElement.dataset.shown = "true";
      hideAfter(captionWithNoteShownMs);
    },
    hurry() {
      if (hide !== null) {
        hideAfter(captionHurriedMs);
      }
    },
    clear() {
      cancel();
      delete element.dataset.shown;
      delete noteElement.dataset.shown;
      element.textContent = "";
      noteElement.textContent = "";
    },
  };
}
