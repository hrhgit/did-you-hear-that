/**
 * The labels of the listening page (design.md, "The listening page", R19). Strings that depend on
 * numbers are built by the functions below. Every level shown is labelled as relative to the
 * visitor's own calibration (R18.3).
 */
export const listeningPageCopy = Object.freeze({
  header: "Development page: listening",
  intro:
    "This page is for development. It is not part of a visit. Levels are relative to your own calibration.",
  startButton: "Start",
  calibrationHeading: "Calibration",
  headphoneCheckHeading: "Headphone check",
  soundsHeading: "Sounds",
  detailsHeading: "Details",
  levelDownButton: "One step quieter",
  levelUpButton: "One step louder",
  playLeftButton: "Play left",
  playRightButton: "Play right",
  requestedLabel: "Asked for",
  playedLabel: "Played",
  limitLabel: "Limit",
  roomTopLabel: "Loudest here",
  rangeReportLabel: "Loudest level of each room",
  clampLogLabel: "Sounds played lower than asked",
  clampLogEmpty: "No sound has been played lower than asked.",
});

/** The limits that can set a played level, as the output stage names them. */
export type ClampLimitName = "ceiling";

/** Formats decibels to one decimal place with a sign, such as "−25.0 dB" or "+5.0 dB". */
function formatDecibels(valueDb: number): string {
  if (!Number.isFinite(valueDb)) {
    throw new RangeError(
      `A value in decibels must be finite, but got ${String(valueDb)}.`,
    );
  }
  const tenths = Math.round(Math.abs(valueDb) * 10);
  const sign = tenths === 0 ? "" : valueDb < 0 ? "−" : "+";
  return `${sign}${(tenths / 10).toFixed(1)} dB`;
}

/** A Level, labelled as relative to the visitor's own calibration (R18.3). */
export function levelLabel(levelDb: number): string {
  return `${formatDecibels(levelDb)} relative to your calibration`;
}

/** What a sound's limit was, for the last sound of a row (R19.6). `null` means none applied. */
export function clampLine(limit: ClampLimitName | null): string {
  switch (limit) {
    case null:
      return "Played as asked.";
    case "ceiling":
      return "Played lower than asked: the loudest sample the house allows (ceiling).";
    default:
      throw new RangeError(
        `A limit must be ceiling or null, but got ${String(limit)}.`,
      );
  }
}

/** One entry of the Clamp_Log (R19.7). */
export function clampLogLine(entry: {
  readonly soundId: string;
  readonly earChoice: string;
  readonly purpose: string;
  readonly requestedLevelDb: number;
  readonly playedLevelDb: number;
  readonly clampLimit: ClampLimitName;
}): string {
  return `${entry.soundId}, ${entry.earChoice}, ${entry.purpose}: asked for ${formatDecibels(entry.requestedLevelDb)}, played ${levelLabel(entry.playedLevelDb)} (${entry.clampLimit}).`;
}

/** Why a sound did not play. Common reasons get a sentence; the rest show their code. */
export function playRefusedLine(reason: string): string {
  switch (reason) {
    case "busy":
      return "Not played: wait for the current sound to end.";
    case "notRunning":
      return "Not played: press Start first.";
    case "notCalibrated":
      return "Not played: keep a calibration first.";
    default:
      return `Not played (${reason}).`;
  }
}

/** The sample rate of the audio device (R19.7). */
export function sampleRateLine(sampleRateHz: number): string {
  return `Sample rate: ${String(sampleRateHz)} Hz`;
}

/** The seed of the page's random source, so any sound heard can be rendered again (R19.7). */
export function seedLine(seed: number): string {
  return `Seed: ${String(seed)}`;
}

/** The position of the calibration control. It is a setting, not a Level. */
export function calibrationSettingLine(settingDb: number): string {
  return `Calibration setting: ${formatDecibels(settingDb)} on the control`;
}

/** The RMS of any sound at the quietest level of the search, as a fraction of full scale (D7). */
export function floorRmsLine(rmsFraction: number): string {
  return `RMS at the quietest level: ${rmsFraction.toExponential(1)} of full scale`;
}
