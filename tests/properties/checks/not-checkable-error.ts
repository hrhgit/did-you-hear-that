/**
 * Thrown by a check when a run does not report what the check needs, for example a trial without
 * a level. The property CLI records such a check as not checkable for that search instead of as
 * not holding (R16.5, D23).
 */
export class NotCheckableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotCheckableError";
  }
}
