import type { CalibrationAnchor, VisitLog } from "./visit-flow-types";

/**
 * How the anchor of a visit's calibration was set (audible-start design.md, "Saved visits from
 * before, and the earlier visit"; R11.2): its `anchor`, or `hands` for a calibration recorded
 * before the audible-start spec, which has none. Null when the log has no calibration of that
 * index. A pure function.
 */
export function anchorKindOf(
  log: Pick<VisitLog, "calibrations">,
  calibrationIndex: number,
): CalibrationAnchor | null {
  const calibration = log.calibrations.find(
    (entry) => entry.calibrationIndex === calibrationIndex,
  );
  if (calibration === undefined) {
    return null;
  }
  return calibration.anchor ?? "hands";
}

/**
 * The anchor kind of a floor: that of the calibration of the room's last finished attempt, the
 * one its result comes from. Null when the room has no finished attempt or its calibration is
 * not in the log. A pure function.
 */
export function floorAnchorKind(
  log: Pick<VisitLog, "calibrations" | "roomAttempts">,
  roomIndex: number,
): CalibrationAnchor | null {
  const finished = log.roomAttempts.filter(
    (attempt) =>
      attempt.roomIndex === roomIndex && attempt.ending === "finished",
  );
  const last = finished.at(-1);
  return last === undefined ? null : anchorKindOf(log, last.calibrationIndex);
}

/**
 * Whether two floors, or two visits, may be compared: their anchors were set the same way
 * (D26). False when either kind is unknown. A pure function.
 */
export function sameAnchorKind(
  first: CalibrationAnchor | null,
  second: CalibrationAnchor | null,
): boolean {
  return first !== null && first === second;
}
