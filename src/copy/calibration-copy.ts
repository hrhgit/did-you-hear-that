/**
 * What the calibration screen says (audible-start design.md, "The calibration copy"). The visitor
 * sets a piece of music to a comfortable listening volume; where the music cannot be loaded, the
 * calibration sound is a hiss, whose lines are in `hiss`. `keysLine`, `loadingLine`, `keptLine`
 * and the button labels serve both sounds. The screen says what to do in one short line and
 * leaves the rest to the control (the owner asked for less text on 2026-11-24). No line advises
 * raising the system volume (audio-output D9, Q2), and no line mentions hands.
 */
export const calibrationCopy = Object.freeze({
  /** The heading of the calibration screen. */
  heading: "Set the music to a comfortable volume",
  /** The heading when the visitor calibrates again, after an audio device changed. */
  againHeading: "Set the music again",
  /** Shown when calibration opens: what to do. */
  openLine:
    "As loud as you would play music in a quiet room. Leave your system volume alone.",
  /** The keys that move the control, as the visit page handles them. */
  keysLine: "Arrow keys move the control. Enter keeps the setting.",
  /** Shown while the setting is at the top of the control (audio-output R16.7). */
  atTopLine:
    "This is as loud as the music goes here. If it still sounds too quiet, keep this setting.",
  /** Shown when a setting below the Keep_Minimum cannot be kept (audio-output R16.6, D10). */
  systemVolumeHighLine:
    "Your system volume is set very high. Turn it down, then set the music again.",
  /** Shown while the music is still loading. */
  loadingLine: "The music is on its way.",
  /** Shown once a calibration is kept (audio-output R16.8, audio-safety rule 8). */
  keptLine: "From here on, do not turn the volume up.",
  startButton: "Start calibrating",
  quieterButton: "Quieter",
  louderButton: "Louder",
  keepButton: "Keep this setting",
  /** The lines of the hiss, the calibration sound where the music cannot be loaded. */
  hiss: Object.freeze({
    heading: "Set the hiss to a comfortable volume",
    againHeading: "Set the hiss again",
    openLine:
      "Set this hiss as loud as you would play music in a quiet room. Leave your system volume alone.",
    atTopLine:
      "This is as loud as the hiss goes here. If it still sounds too quiet, keep this setting.",
    systemVolumeHighLine:
      "Your system volume is set very high. Turn it down, then set the hiss again.",
  }),
});

/** The public visit plays a fixed reference. The visitor sets the device volume. */
export const referenceVolumeCopy = Object.freeze({
  heading: "Set a comfortable volume",
  againHeading: "Set your volume again",
  openLine: "Use your device’s volume controls to make the music comfortable.",
  hissLine: "Use your device’s volume controls to make the hiss comfortable.",
  startButton: "Play reference sound",
  keepButton: "Continue",
  keptLine: "Keep your system volume unchanged during the test.",
});

/**
 * The line shown after a calibration is kept when `count` of the visit's `total` rooms cannot
 * reach the anchor cap at this setting (R16.9, D9). With a count of 0 it says every room can.
 * Throws a `RangeError` unless both are whole numbers with 0 ≤ count ≤ total and total ≥ 1.
 */
export function roomsShortLine(count: number, total: number): string {
  if (
    !Number.isInteger(count) ||
    !Number.isInteger(total) ||
    total < 1 ||
    count < 0 ||
    count > total
  ) {
    throw new RangeError(
      `The rooms line needs whole numbers with 0 ≤ count ≤ total and total ≥ 1, but got ${String(count)} of ${String(total)}.`,
    );
  }
  if (count === 0) {
    return "At this setting, every room can get as loud as the house would like.";
  }
  const rooms = total === 1 ? "room" : "rooms";
  return `At this setting, ${count} of the ${total} ${rooms} cannot get as loud as the house would like. Do not turn the volume up.`;
}
