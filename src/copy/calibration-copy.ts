/**
 * What the calibration screen says (audible-start design.md, "The calibration copy"). The visitor
 * sets a piece of music to a comfortable listening volume; where the music cannot be loaded, the
 * calibration sound is a hiss, whose lines are in `hiss`. `whyLine`, `keysLine`, `loadingLine`,
 * `keptLine` and the button labels serve both sounds. Starting text, to be reviewed by the project
 * owner. No line advises raising the system volume (audio-output D9, Q2), and no line mentions
 * hands.
 */
export const calibrationCopy = Object.freeze({
  /** The heading of the calibration screen. */
  heading: "Set the music to a comfortable volume",
  /** The heading when the visitor calibrates again, after an audio device changed. */
  againHeading: "Set the music again",
  /** Shown when calibration opens: what to do. */
  openLine:
    "Move the control until the music is as loud as you would listen to music in a quiet room: clear and comfortable, not loud. Leave your system volume where you usually have it. The music starts very quietly.",
  /** Why the house asks for it. */
  whyLine:
    "This tells the house how loud is safe on these headphones at this volume, and gives your result a level to be measured from.",
  /** How the sound follows the control. */
  riseLine:
    "The music follows the control a little at a time, so it takes a few seconds to get louder.",
  /** The keys that move the control, as the visit page handles them. */
  keysLine:
    "On a keyboard, the arrow keys move the control one step. Shift with an arrow, Page Up or Page Down move it five steps. Home and End go to the ends. Enter keeps the setting.",
  /** Shown while the setting is at the top of the control (audio-output R16.7). */
  atTopLine:
    "This is as loud as the music goes here. If it still sounds too quiet, keep this setting.",
  /** Shown when a setting below the Keep_Minimum cannot be kept (audio-output R16.6, D10). */
  systemVolumeHighLine:
    "Your system volume is set very high. Turn it down, then set the music again.",
  /** Shown while the music is still loading. */
  loadingLine: "The music is on its way.",
  /** Shown once a calibration is kept (audio-output R16.8, audio-safety rule 8). */
  keptLine:
    "Leave your system volume where it is now. The house keeps every sound below its limit only if you do not turn the volume up.",
  startButton: "Start calibrating",
  quieterButton: "Quieter",
  louderButton: "Louder",
  keepButton: "Keep this setting",
  /** The lines of the hiss, the calibration sound where the music cannot be loaded. */
  hiss: Object.freeze({
    heading: "Set the hiss to a comfortable volume",
    againHeading: "Set the hiss again",
    openLine:
      "The calibration sound is a hiss. Move the control until it is as loud as you would listen to music in a quiet room: clear and comfortable, not loud. Leave your system volume where you usually have it. The hiss starts very quietly.",
    riseLine:
      "The hiss follows the control a little at a time, so it takes a few seconds to get louder.",
    atTopLine:
      "This is as loud as the hiss goes here. If it still sounds too quiet, keep this setting.",
    systemVolumeHighLine:
      "Your system volume is set very high. Turn it down, then set the hiss again.",
  }),
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
