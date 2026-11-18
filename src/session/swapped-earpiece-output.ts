import type { AudioOutput } from "../audio/output/create-audio-output";
import { earpieceOnEar } from "./earpiece-on-ear";

/**
 * The output shell as the room runner of a swapped repeat sees it (swapped-repeat design.md, D3):
 * `play` sends each request for an ear to the earpiece on that ear, by `earpieceOnEar("swapped")`,
 * and gives the shell's outcome unchanged. Every other method is the shell's own. Frozen.
 */
export function swappedEarpieceOutput(output: AudioOutput): AudioOutput {
  const earpieces = earpieceOnEar("swapped");
  return Object.freeze({
    state: output.state,
    activate: output.activate,
    stopAll: output.stopAll,
    onStop: output.onStop,
    onUnsupported: output.onUnsupported,
    sampleRateHz: output.sampleRateHz,
    beginCalibration: output.beginCalibration,
    playCalibrationRepeat: output.playCalibrationRepeat,
    keepCalibration: output.keepCalibration,
    rangeReport: output.rangeReport,
    playHeadphoneCheck: output.playHeadphoneCheck,
    beginRoom: output.beginRoom,
    play: (request) => output.play({ ...request, ear: earpieces[request.ear] }),
    fadeOutSound: output.fadeOutSound,
    clampLog: output.clampLog,
    timestampPair: output.timestampPair,
  } satisfies AudioOutput);
}
