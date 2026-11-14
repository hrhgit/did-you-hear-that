/**
 * What the calibration screen says (design.md, "What the visitor is told"). Starting text, to be
 * reviewed by the project owner. No line advises raising the system volume (D9, Q2).
 */
export const calibrationCopy = Object.freeze({
  /** Shown when calibration opens. */
  openLine:
    "Rub your hands together next to one ear. Move the control until the hiss sounds as loud as your hands. The hiss starts very quietly.",
  /** Shown while the setting is at the top of the control (R16.7). */
  atTopLine:
    "This is as loud as the hiss goes. If your hands are still louder, keep this setting.",
  /** Shown when a setting below the Keep_Minimum cannot be kept (R16.6, D10). */
  systemVolumeHighLine:
    "Your system volume is set very high. Turn it down, then match the hiss again.",
  /** Shown once a calibration is kept (R16.8, audio-safety rule 8). */
  keptLine:
    "Leave your system volume where it is now. The house keeps every sound below its limit only if you do not turn the volume up.",
  startButton: "Start calibrating",
  quieterButton: "Quieter",
  louderButton: "Louder",
  keepButton: "Keep this setting",
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
  return `At this setting, ${count} of the ${total} ${rooms} cannot get as loud as the house would like. The house will stop at the loudest it can play there. Do not turn the volume up to change this.`;
}
