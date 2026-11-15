import type { VisitType } from "../config/hearing-method-config";
import type { ResultPageConfig } from "../config/result-page-config";
import { resultPageConfig } from "../config/result-page-config";
import { siteTitle } from "./site-title";

// Dates, visit types, the saved image, and the lines for saving and deleting (result-page
// design.md, "`src/copy/saved-visit-lines.ts`"). Dates are read from their "YYYY-MM-DD" text and
// written with English month names, without Date and without the browser's language, so the text
// is the same on every machine (D30). Visit types are named by their number of rooms, not by
// minutes (D22). No function takes or gives the visitor's name for the headphones (D11).

/** Why a save did not happen. The session's `SaveRefusal` is checked to equal it. */
export type SaveRefusalName =
  | "robotMode"
  | "unavailable"
  | "unreadable"
  | "refused"
  | "full"
  | "tooMany"
  | "nameTooLong";

/** Why a delete did not happen. The session's `DeleteRefusal` is checked to equal it. */
export type DeleteRefusalName =
  "robotMode" | "unavailable" | "unreadable" | "refused" | "notFound";

const monthNames: readonly string[] = Object.freeze([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]);

const visitTypeNames: Readonly<Record<VisitType, string>> = Object.freeze({
  quick: "Short visit",
  full: "Long visit",
});

const saveRefusedLines: Readonly<
  Record<Exclude<SaveRefusalName, "tooMany" | "nameTooLong">, string>
> = Object.freeze({
  robotMode: "Robot mode keeps nothing in this browser.",
  unavailable:
    "This browser does not let the house save visits. The picture stays here until you leave the page.",
  unreadable:
    "The visits already saved in this browser could not be read. Delete them all, then save again.",
  refused:
    "This browser would not save the visit. The picture stays here until you leave the page.",
  full: "This browser has no room left to save the visit. Delete a saved visit, then save again.",
});

const deleteRefusedLines: Readonly<Record<DeleteRefusalName, string>> =
  Object.freeze({
    robotMode: "Robot mode keeps nothing in this browser.",
    unavailable:
      "This browser does not let the house delete saved visits just now.",
    unreadable:
      "The saved visits could not be read, so one cannot be deleted on its own. Delete them all instead.",
    refused: "This browser would not delete the visit just now. Try again.",
    notFound: "That visit is no longer saved in this browser.",
  });

interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Reads a "YYYY-MM-DD" calendar date, or throws a `RangeError`. */
function calendarDate(localDate: string): CalendarDate {
  const match =
    typeof localDate === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
      : null;
  if (match !== null) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (
      month >= 1 &&
      month <= monthNames.length &&
      day >= 1 &&
      day <= daysInMonth(year, month)
    ) {
      return { year, month, day };
    }
  }
  throw new RangeError(
    `A date must be a calendar date written YYYY-MM-DD, but got ${JSON.stringify(localDate)}.`,
  );
}

function requireVisitType(visitType: VisitType): void {
  if (!Object.hasOwn(visitTypeNames, visitType)) {
    throw new RangeError(`Unknown visit type ${String(visitType)}.`);
  }
}

function requireRoomCount(roomCount: number): void {
  if (!Number.isInteger(roomCount) || roomCount < 1) {
    throw new RangeError(
      `A visit must have a whole number of rooms of 1 or more, but got ${String(roomCount)}.`,
    );
  }
}

function requirePositiveCount(count: number, name: string): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(
      `${name} must be a whole number of 1 or more, but got ${String(count)}.`,
    );
  }
}

/** Such as "20 November 2026", with no leading zero on the day. */
export function visitDateLabel(localDate: string): string {
  const { year, month, day } = calendarDate(localDate);
  return `${String(day)} ${monthNames[month - 1]} ${String(year)}`;
}

/** Such as "Short visit, 3 rooms" or "Long visit, 1 room". */
export function visitTypeLabel(
  visitType: VisitType,
  roomCount: number,
): string {
  requireVisitType(visitType);
  requireRoomCount(roomCount);
  return `${visitTypeNames[visitType]}, ${String(roomCount)} ${roomCount === 1 ? "room" : "rooms"}`;
}

/** The caption of the saved image. */
export function imageCaption(
  localDate: string,
  visitType: VisitType,
  roomCount: number,
): string {
  return `${siteTitle} A first listen on ${visitDateLabel(localDate)}. ${visitTypeLabel(visitType, roomCount)}.`;
}

/** The file name of the saved image, without its extension. */
export function imageFileBaseName(localDate: string): string {
  calendarDate(localDate);
  return `did-you-hear-that-${localDate}`;
}

/** The accessible name of the delete control of one saved visit. */
export function deleteVisitLabel(
  localDate: string,
  visitType: VisitType,
  roomCount: number,
): string {
  const typeLabel = visitTypeLabel(visitType, roomCount);
  return `Delete the visit of ${visitDateLabel(localDate)}, ${typeLabel[0].toLowerCase()}${typeLabel.slice(1)}`;
}

/** Why a save did not happen, in one line. The two limits come from `resultPageConfig` unless given. */
export function saveRefusedLine(
  reason: SaveRefusalName,
  settings: Pick<
    ResultPageConfig,
    "savedVisitsMaxCount" | "headphoneNameMaxCharacterCount"
  > = resultPageConfig,
): string {
  switch (reason) {
    case "tooMany":
      requirePositiveCount(
        settings.savedVisitsMaxCount,
        "The most saved visits",
      );
      return `${String(settings.savedVisitsMaxCount)} visits are saved, as many as the house keeps. Delete one, then save again.`;
    case "nameTooLong":
      requirePositiveCount(
        settings.headphoneNameMaxCharacterCount,
        "The longest name",
      );
      return `The name can have up to ${String(settings.headphoneNameMaxCharacterCount)} characters.`;
    default:
      if (!Object.hasOwn(saveRefusedLines, reason)) {
        throw new RangeError(`Unknown save refusal ${String(reason)}.`);
      }
      return saveRefusedLines[reason];
  }
}

/** Why a delete did not happen, in one line. */
export function deleteRefusedLine(reason: DeleteRefusalName): string {
  if (!Object.hasOwn(deleteRefusedLines, reason)) {
    throw new RangeError(`Unknown delete refusal ${String(reason)}.`);
  }
  return deleteRefusedLines[reason];
}

/** The line for saved visits that could not be read. `count` is a whole number of 1 or more. */
export function unreadableEntriesLine(count: number): string {
  requirePositiveCount(count, "An unreadable count");
  return count === 1
    ? "1 saved visit could not be read and is not shown. Deleting all saved visits removes it."
    : `${String(count)} saved visits could not be read and are not shown. Deleting all saved visits removes them.`;
}
