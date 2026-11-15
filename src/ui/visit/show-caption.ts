/** How long a line stays under the drawing before it fades. */
const captionShownMs = 4200;

/** The line under the drawing: what the house says about a sound that has been answered. */
export interface Caption {
  /** Shows a line, replacing the one before it, and lets it fade after a few seconds. */
  say(line: string): void;
  /** Removes the line at once, for a change of screen. */
  clear(): void;
}

/**
 * Creates the caption on an element that announces itself politely. The text stays in the
 * element while it fades, so a screen reader is not cut off.
 */
export function createCaption(view: Window, element: HTMLElement): Caption {
  let hide: number | null = null;
  const cancel = (): void => {
    if (hide !== null) {
      view.clearTimeout(hide);
      hide = null;
    }
  };
  return {
    say(line) {
      cancel();
      element.textContent = line;
      element.dataset.shown = "true";
      hide = view.setTimeout(() => {
        delete element.dataset.shown;
        hide = null;
      }, captionShownMs);
    },
    clear() {
      cancel();
      delete element.dataset.shown;
      element.textContent = "";
    },
  };
}
