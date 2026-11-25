import { hearingMethodConfig } from "../../config/hearing-method-config";
import type { GhostSoundId } from "../../config/sound-id";
import { leavingCopy } from "../../copy/leaving-copy";
import {
  focusFloorLabel,
  pictureKeyCopy,
  resultFocusCopy,
} from "../../copy/result-focus-copy";
import { differenceLabel } from "../../copy/result-lines";
import {
  chaseScoreCopy,
  longestRowLine,
  resultPageCopy,
  roomCaughtLine,
  totalCaughtLine,
} from "../../copy/result-page-copy";
import { roomNames } from "../../copy/room-copy";
import { chaseScoreOf } from "../../session/chase-score";
import {
  resultFocus,
  type FocusPointKind,
  type ResultFocus,
} from "../../session/result-focus";
import { swappedRepeatCopy } from "../../copy/swapped-repeat-copy";
import type {
  FindEarlierVisit,
  PictureFloor,
  PictureWing,
  ResultPicture,
  ResultPictureOf,
  SavedVisit,
  SavedVisitList,
  VisitArchive,
  VisitToSave,
} from "../../session/result-page-types";
import { drawCreatureSvg } from "../room/creature-svg";
import { drawResultSection } from "./draw-result-section";
import { attachResultYard } from "./result-yard";
import { savePictureAsImage } from "./save-picture";
import { repeatComparisonBlock } from "./show-repeat-comparison";

/** The seed of the pencil that draws the result, so the house looks the same every time. */
const resultDrawingSeed = 1887;

/** How long a floor's words glow after the focus card took the visitor to them. */
const calledGlowMs = 1800;

/** The marks of the drawing, in the order the key under it lists them. */
type PictureMark = "light" | "creature" | "dark" | "hatched" | "earlier";

const pictureMarks: readonly PictureMark[] = [
  "light",
  "creature",
  "dark",
  "hatched",
  "earlier",
];

/** What the result view is given. Everything that reads or keeps a visit comes in from outside. */
export interface ResultViewOptions {
  readonly doc: Document;
  readonly view: Window & typeof globalThis;
  readonly archive: VisitArchive;
  readonly pictureOf: ResultPictureOf;
  /** Finds the earlier visit to draw as outlines, or null while comparison is not built. */
  readonly findEarlier: FindEarlierVisit | null;
  /** The two lines about comparison, or null while comparison is not built. */
  readonly comparisonCopy: {
    readonly headphoneNameHint: string;
    readonly noEarlierVisitLine: string;
  } | null;
  /** The longest name the field takes. */
  readonly headphoneNameMaxCharacterCount: number;
  /** A floor's offer of the swapped repeat was taken. */
  onSwappedRepeat(roomIndex: number): void;
  /** The visitor leaves the result for the front door. */
  onBack(): void;
}

/** The result of a visit on the page. */
export interface ResultView {
  /** The whole result. Hidden until `show` is called. */
  readonly element: HTMLElement;
  /** The heading, which takes the focus when the result appears. */
  readonly heading: HTMLElement;
  /**
   * Shows the result of the visit that has just ended. After a swapped repeat the visit comes
   * again, with the repeat in it and a line that asks to turn the headphones back.
   */
  show(visit: VisitToSave, turnBackLine?: string | null): void;
  /** Hides the result and forgets the visit. Nothing of it is kept unless it was saved. */
  clear(): void;
}

type Children = readonly (Node | string)[];

export function createResultView(options: ResultViewOptions): ResultView {
  const { doc, view, archive, pictureOf, findEarlier, comparisonCopy } =
    options;

  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    children: Children = [],
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    if (className !== "") {
      element.className = className;
    }
    element.append(...children);
    return element;
  };
  const button = (label: string, extraClass = ""): HTMLButtonElement => {
    const element = make("button", `visit-button ${extraClass}`.trim(), [
      label,
    ]);
    element.type = "button";
    return element;
  };
  const status = (): HTMLElement => {
    const element = make("p", "result-status");
    element.setAttribute("role", "status");
    return element;
  };
  const setLine = (element: HTMLElement, line: string | null): void => {
    element.textContent = line ?? "";
    element.hidden = line === null;
  };

  // The head: what the picture is, of which visit, and what the house says about silence.
  const heading = make("h1", "result-heading");
  heading.tabIndex = -1;
  const dateLabel = make("span", "result-date");
  const visitTypeLabel = make("span", "result-visit-type");
  const shownHeadphones = make("span", "result-headphones-name");
  const shownHeadphonesLine = make("p", "result-headphones", [
    make("span", "result-headphones-label", [resultPageCopy.headphonesLabel]),
    shownHeadphones,
  ]);
  const backToThisVisitButton = button(resultPageCopy.backToThisVisitButton);
  const shownVisit = make("div", "result-shown-visit", [
    shownHeadphonesLine,
    backToThisVisitButton,
  ]);
  const falseAlarmLine = make("p", "result-silence visit-voice");
  // After a swapped repeat: the headphones may still be the other way round.
  const turnBack = make("p", "result-turn-back");
  turnBack.setAttribute("role", "status");
  turnBack.hidden = true;
  const head = make("header", "result-head", [
    heading,
    make("p", "result-meta", [dateLabel, visitTypeLabel]),
    turnBack,
    shownVisit,
    falseAlarmLine,
  ]);

  // What stands out: the one thing the page puts first, and what to do next. When the whole
  // visit is unreliable it holds the visit notice.
  const focusHeading = make("h2", "result-focus-heading");
  focusHeading.id = "result-focus-heading";
  const focusLine = make("p", "result-focus-line");
  const focusPoints = make("ul", "result-focus-points");
  const focus = make("section", "result-focus", [
    make("p", "result-focus-eyebrow", [resultFocusCopy.eyebrow]),
    focusHeading,
    focusLine,
    focusPoints,
  ]);
  focus.setAttribute("aria-labelledby", focusHeading.id);

  // The score of the chase: the game's side of the visit, from the same log as the picture. It
  // counts catches only, never levels.
  const scoreTiles = make("div", "result-score-tiles");
  const scoreRooms = make("ul", "result-score-rooms");
  const score = make("section", "result-score", [
    make("h2", "result-score-heading", [chaseScoreCopy.heading]),
    scoreTiles,
    scoreRooms,
  ]);

  // The picture, and the control that saves it as an image.
  const drawing = make("div", "result-drawing");
  drawing.setAttribute("role", "img");
  // What each mark of the drawing means: only the marks the picture holds.
  const pictureKey = make("ul", "result-key");
  pictureKey.setAttribute("aria-label", pictureKeyCopy.label);
  const savePictureButton = button(resultPageCopy.savePictureButton);
  const pictureStatus = status();
  // The picture stands in the yard of the room the visit was played in.
  const frame = make("div", "result-frame", [drawing]);
  const repaintYard = attachResultYard(doc, frame, drawing);
  const figure = make("div", "result-figure", [
    frame,
    pictureKey,
    make("div", "result-figure-controls", [savePictureButton, pictureStatus]),
  ]);

  // What the picture can and cannot tell. Always next to the picture, never behind a control.
  const limitsHeading = make("h2", "result-limits-heading");
  const limitsList = make("ul", "result-limits-list");
  const limits = make("aside", "result-limits", [limitsHeading, limitsList]);

  // Each floor in words, from the top of the house down, as the picture shows them.
  const floorList = make("ol", "result-floors");
  floorList.id = "result-floors";
  drawing.setAttribute("aria-describedby", floorList.id);
  // The Floor_Line once, under the list, when every floor has the same one.
  const sharedFloorLine = make(
    "p",
    "visit-quiet result-floor-line result-floors-line",
  );
  sharedFloorLine.hidden = true;
  const comparisonLine = make("p", "result-comparison visit-quiet");

  // Keeping the visit.
  const nameInput = make("input", "result-name-input");
  nameInput.type = "text";
  nameInput.id = "result-headphone-name";
  nameInput.maxLength = options.headphoneNameMaxCharacterCount;
  nameInput.autocomplete = "off";
  nameInput.spellcheck = false;
  nameInput.enterKeyHint = "done";
  const nameLabel = make("label", "result-name-label", [
    resultPageCopy.headphoneNameLabel,
  ]);
  nameLabel.htmlFor = nameInput.id;
  const nameHint = make("p", "result-name-hint visit-quiet");
  nameHint.id = "result-headphone-name-hint";
  if (comparisonCopy !== null) {
    nameHint.textContent = comparisonCopy.headphoneNameHint;
    nameInput.setAttribute("aria-describedby", nameHint.id);
  } else {
    nameHint.hidden = true;
  }
  const saveButton = button(resultPageCopy.saveButton, "visit-button-lit");
  const saveStatus = status();
  // Shown while the saved copy of this visit lacks a room that was visited again since.
  const savedCopyLacks = make("p", "result-keep-lacks", [
    swappedRepeatCopy.savedCopyLacksLine,
  ]);
  savedCopyLacks.id = "result-keep-lacks";
  savedCopyLacks.hidden = true;
  const keep = make("section", "result-keep", [
    nameLabel,
    make("div", "result-keep-row", [
      nameInput,
      make("div", "result-controls", [saveButton]),
    ]),
    nameHint,
    savedCopyLacks,
    saveStatus,
  ]);

  // The visits saved in this browser.
  const savedHeading = make("h2", "result-saved-heading", [
    resultPageCopy.savedVisitsHeading,
  ]);
  savedHeading.tabIndex = -1;
  const savedLines = make("div", "result-saved-lines");
  const savedList = make("ul", "result-saved-list");
  const savedStatus = status();
  const deleteAllButton = button(resultPageCopy.deleteAllButton);
  const deleteAllConfirmButton = button(resultPageCopy.deleteAllConfirmButton);
  const deleteAllCancelButton = button(
    resultPageCopy.deleteAllCancelButton,
    "visit-button-lit",
  );
  const deleteAllQuestion = make("div", "result-delete-all-question", [
    make("p", "", [resultPageCopy.deleteAllQuestion]),
    make("div", "result-controls", [
      deleteAllCancelButton,
      deleteAllConfirmButton,
    ]),
  ]);
  deleteAllQuestion.setAttribute("role", "group");
  deleteAllQuestion.setAttribute("aria-label", resultPageCopy.deleteAllButton);
  deleteAllQuestion.hidden = true;
  const saved = make("section", "result-saved", [
    savedHeading,
    savedLines,
    savedList,
    savedStatus,
    make("div", "result-controls", [deleteAllButton]),
    deleteAllQuestion,
  ]);

  const backButton = button(leavingCopy.backButton);
  // One column on a narrow screen. On a wide one the picture stands at the left and stays in
  // sight while everything else scrolls past it.
  const element = make("section", "result", [
    make("div", "result-page", [
      head,
      focus,
      figure,
      limits,
      score,
      make("div", "result-words", [floorList, sharedFloorLine, comparisonLine]),
      keep,
      saved,
      make("div", "result-controls result-leave", [backButton]),
    ]),
  ]);
  element.hidden = true;

  // What is on the page now.
  let live: VisitToSave | null = null;
  /** The line that asks to turn the headphones back, while the live visit is the one shown. */
  let liveTurnBackLine: string | null = null;
  /** The id the live visit was saved under, once it has been saved. */
  let liveSavedId: string | null = null;
  /** The saved visit whose picture is shown in place of the live one, or null. */
  let shownSaved: SavedVisit | null = null;
  let shownPicture: ResultPicture | null = null;
  /** What the drawing on the page was made from, so that it is redrawn only when that changes. */
  let drawnKey: string | null = null;

  /** Everything of a picture that the drawing shows. */
  const drawingKeyOf = (picture: ResultPicture): string =>
    JSON.stringify(
      picture.floors.map((floor) => [
        floor.room.roomId,
        ...[floor.left, floor.right].map((wing) => [
          wing.state,
          wing.lightDepthFraction,
          wing.earlier?.outlineDepthFraction ?? null,
        ]),
      ]),
    );

  const pictureNow = (list: SavedVisitList): ResultPicture | null => {
    if (shownSaved !== null) {
      return pictureOf({
        kind: "saved",
        savedVisit: shownSaved,
        earlierVisit:
          findEarlier?.(
            list,
            shownSaved.headphoneName ?? "",
            shownSaved.savedVisitId,
          ) ?? null,
      });
    }
    if (live !== null) {
      return pictureOf({
        kind: "live",
        visit: live,
        localDate: archive.today(),
        earlierVisit: findEarlier?.(list, nameInput.value, liveSavedId) ?? null,
      });
    }
    return null;
  };

  /** Words that are read out but not shown, beside a shown form that is not read out. */
  const spoken = (line: string): HTMLElement =>
    make("span", "result-spoken", [line]);
  const shownOnly = <T extends HTMLElement>(element: T): T => {
    element.setAttribute("aria-hidden", "true");
    return element;
  };

  /** A room's creature, small, in a round frame of its colour. */
  const creatureBadge = (
    roomId: GhostSoundId,
    className: string,
  ): HTMLElement => {
    const badge = make("span", `result-badge ${className}`, [
      drawCreatureSvg(doc, roomId, "awake"),
    ]);
    badge.dataset.creature = roomId;
    badge.setAttribute("aria-hidden", "true");
    return badge;
  };

  const wingWords = (
    side: "left" | "right",
    label: string,
    wing: PictureWing,
  ): HTMLElement => {
    // The level large and its note small. Read out, it is the wing's line in full.
    const words = make("div", "result-wing", [
      make("span", "result-wing-side", [label]),
      shownOnly(make("p", "result-wing-value", [wing.valueLabel])),
      shownOnly(make("p", "result-wing-note", [wing.valueNote])),
      make("p", "result-wing-line", [spoken(wing.line)]),
    ]);
    words.dataset.state = wing.state;
    words.dataset.side = side;
    if (wing.reasonLine !== null) {
      words.append(
        make("p", "visit-quiet result-wing-reason", [wing.reasonLine]),
      );
    }
    return words;
  };

  /** The floors' words on the page now, by room, for the focus card to lead to. */
  const floorItems = new Map<GhostSoundId, HTMLElement>();
  let calledTimer: number | null = null;

  /** Lights one floor of the drawing and dims the others, or lights them all again for null. */
  const pickFloor = (roomId: GhostSoundId | null): void => {
    const section = drawing.querySelector("svg");
    if (section === null) {
      return;
    }
    section.setAttribute("data-picking", roomId === null ? "false" : "true");
    for (const floor of section.querySelectorAll(".result-floor")) {
      floor.setAttribute(
        "data-picked",
        floor.getAttribute("data-room") === roomId ? "true" : "false",
      );
    }
  };
  const picksFloor = (element: HTMLElement, roomId: GhostSoundId): void => {
    element.addEventListener("pointerenter", () => {
      pickFloor(roomId);
    });
    element.addEventListener("pointerleave", () => {
      pickFloor(null);
    });
    element.addEventListener("focusin", () => {
      pickFloor(roomId);
    });
    element.addEventListener("focusout", () => {
      pickFloor(null);
    });
  };

  /** Takes the visitor to a floor's words, which glow for a moment. */
  const callFloor = (roomId: GhostSoundId): void => {
    const item = floorItems.get(roomId);
    if (item === undefined) {
      return;
    }
    const still = view.matchMedia("(prefers-reduced-motion: reduce)").matches;
    item.scrollIntoView({
      block: "center",
      behavior: still ? "auto" : "smooth",
    });
    item.focus({ preventScroll: true });
    for (const other of floorItems.values()) {
      other.removeAttribute("data-called");
    }
    item.setAttribute("data-called", "true");
    if (calledTimer !== null) {
      view.clearTimeout(calledTimer);
    }
    calledTimer = view.setTimeout(() => {
      item.removeAttribute("data-called");
      calledTimer = null;
    }, calledGlowMs);
  };

  /**
   * One floor in words. `standsOutFor` is why the focus card names it, or null. `ownFloorLine`
   * is false when the list says the Floor_Line once for every floor.
   */
  const floorWords = (
    floor: PictureFloor,
    standsOutFor: FocusPointKind | null,
    ownFloorLine: boolean,
  ): HTMLElement => {
    const roomId = floor.room.roomId;
    // The difference of the two sides: shown as it is when they are apart, with its heading when
    // they are level, and only read out when there is none.
    const difference = make("p", "result-difference", [
      make("span", "result-difference-heading", [
        resultPageCopy.differenceHeading,
      ]),
      make("span", "result-difference-label", [floor.differenceLabel]),
    ]);
    difference.dataset.kind =
      floor.rightMinusLeftDb === null
        ? "none"
        : floor.differenceLabel === differenceLabel(0)
          ? "level"
          : "apart";
    const item = make("li", "result-floor-words", [
      make("div", "result-floor-top", [
        creatureBadge(roomId, "result-floor-badge"),
        make("h3", "result-floor-heading", [
          make("span", "result-floor-name", [floor.roomName]),
          make("span", "result-floor-pitch", [floor.pitchLabel]),
        ]),
      ]),
      difference,
      make("div", "result-wings", [
        wingWords("left", resultPageCopy.leftLabel, floor.left),
        wingWords("right", resultPageCopy.rightLabel, floor.right),
      ]),
    ]);
    if (ownFloorLine && floor.playableFloorLine !== null) {
      item.append(
        make("p", "visit-quiet result-floor-line", [floor.playableFloorLine]),
      );
    }
    item.dataset.room = roomId;
    item.dataset.creature = roomId;
    item.dataset.standsOut = standsOutFor ?? "none";
    item.id = `result-floor-${roomId}`;
    item.tabIndex = -1;
    picksFloor(item, roomId);
    const offer = floor.swappedRepeat;
    if (offer !== null) {
      const swapButton = button(offer.buttonLabel);
      swapButton.addEventListener("click", () => {
        options.onSwappedRepeat(offer.roomIndex);
      });
      item.append(
        make("div", "result-swap", [
          make("p", "", [offer.line]),
          make("div", "result-controls", [swapButton]),
        ]),
      );
    }
    if (floor.repeat !== null) {
      // The floor was visited again with the headphones swapped: both runs, side by side.
      item.append(
        repeatComparisonBlock(doc, floor.repeat, {
          idPrefix: `result-repeat-${String(floor.repeat.roomIndex)}`,
          headingLevel: 4,
        }),
      );
    }
    return item;
  };

  /** The focus of the result on the page now, or null when nothing is shown. */
  const focusOf = (picture: ResultPicture): ResultFocus | null => {
    if (shownSaved !== null) {
      return resultFocus({
        picture,
        summary: shownSaved.summary,
        floorDb: shownSaved.floorDb,
        swappedRepeatDifferenceDb: shownSaved.swappedRepeatDifferenceDb,
        canStillSave: false,
      });
    }
    if (live !== null) {
      return resultFocus({
        picture,
        summary: live.summary,
        floorDb: hearingMethodConfig.floorDb,
        swappedRepeatDifferenceDb:
          hearingMethodConfig.swappedRepeatDifferenceDb,
        canStillSave: liveSavedId === null,
      });
    }
    return null;
  };

  const drawFocus = (focusNow: ResultFocus | null): void => {
    focus.hidden = focusNow === null;
    if (focusNow === null) {
      return;
    }
    focus.dataset.kind = focusNow.kind;
    focusHeading.textContent = focusNow.heading;
    focusLine.textContent = focusNow.line;
    focusPoints.hidden = focusNow.points.length === 0;
    focusPoints.replaceChildren(
      ...focusNow.points.map((point) => {
        const go = make("button", "result-focus-floor", [
          creatureBadge(point.roomId, "result-focus-badge"),
          make("span", "result-focus-floor-label", [
            focusFloorLabel(point.roomName, point.pitchLabel),
          ]),
        ]);
        go.type = "button";
        go.setAttribute("aria-controls", `result-floor-${point.roomId}`);
        go.addEventListener("click", () => {
          callFloor(point.roomId);
        });
        picksFloor(go, point.roomId);
        const entry = make("li", "result-focus-point", [
          go,
          make("p", "result-focus-point-line", [point.line]),
        ]);
        entry.dataset.kind = point.kind;
        entry.dataset.creature = point.roomId;
        return entry;
      }),
    );
  };

  /** The marks a picture holds. */
  const marksOf = (picture: ResultPicture): ReadonlySet<PictureMark> => {
    const marks = new Set<PictureMark>();
    for (const floor of picture.floors) {
      for (const wing of [floor.left, floor.right]) {
        if (wing.lightDepthFraction === null) {
          marks.add("hatched");
        } else if (wing.lightDepthFraction > 0) {
          marks.add("light");
          marks.add("creature");
        }
        if (wing.state === "worseThanCap") {
          marks.add("dark");
        }
        if ((wing.earlier?.outlineDepthFraction ?? 0) > 0) {
          marks.add("earlier");
        }
      }
    }
    return marks;
  };

  const drawKey = (picture: ResultPicture): void => {
    const marks = marksOf(picture);
    // The creature in the key is the first one the drawing shows, from the top of the house.
    const firstLit = [...picture.floors]
      .reverse()
      .find((floor) =>
        [floor.left, floor.right].some(
          (wing) => (wing.lightDepthFraction ?? 0) > 0,
        ),
      )?.room.roomId;
    pictureKey.replaceChildren(
      ...pictureMarks
        .filter((mark) => marks.has(mark))
        .map((mark) => {
          const swatch =
            mark === "creature" && firstLit !== undefined
              ? creatureBadge(firstLit, "result-key-swatch")
              : shownOnly(make("span", "result-key-swatch"));
          const item = make("li", "result-key-item", [
            swatch,
            make("span", "", [pictureKeyCopy[mark]]),
          ]);
          item.dataset.mark = mark;
          return item;
        }),
    );
    pictureKey.hidden = marks.size === 0;
  };

  /** Draws the picture and the line about the earlier visit. Called on every change of the name. */
  const drawPicture = (list: SavedVisitList, entering: boolean): void => {
    const picture = pictureNow(list);
    shownPicture = picture;
    if (picture === null) {
      drawing.replaceChildren();
      drawnKey = null;
      return;
    }
    const key = drawingKeyOf(picture);
    if (entering || key !== drawnKey) {
      drawnKey = key;
      drawing.replaceChildren(
        drawResultSection(doc, picture, {
          seed: resultDrawingSeed,
          wingLabels: {
            left: resultPageCopy.leftLabel,
            right: resultPageCopy.rightLabel,
          },
          entering,
        }),
      );
      repaintYard();
    }
    const typedSomething = shownSaved === null && nameInput.value.trim() !== "";
    setLine(
      comparisonLine,
      picture.comparison?.line ??
        (typedSomething && findEarlier !== null && comparisonCopy !== null
          ? comparisonCopy.noEarlierVisitLine
          : null),
    );
  };

  const drawSavedList = (list: SavedVisitList): void => {
    savedLines.replaceChildren(
      ...list.lines.map((line) => make("p", "visit-quiet", [line])),
    );
    savedList.replaceChildren(
      ...list.visits.map((listing) => {
        const { visit } = listing;
        const isShown = shownSaved?.savedVisitId === visit.savedVisitId;
        const showButton = button(resultPageCopy.showButton);
        showButton.disabled = isShown;
        showButton.addEventListener("click", () => {
          shownSaved = visit;
          drawAll(true);
          element.scrollTo({ top: 0 });
          heading.focus({ preventScroll: true });
        });
        const deleteButton = button(resultPageCopy.deleteButton);
        deleteButton.setAttribute("aria-label", listing.deleteLabel);
        deleteButton.addEventListener("click", () => {
          const outcome = archive.deleteVisit(visit.savedVisitId);
          if (outcome.deleted) {
            if (isShown) {
              shownSaved = null;
            }
            if (liveSavedId === visit.savedVisitId) {
              liveSavedId = null;
              setLine(saveStatus, resultPageCopy.notSavedLine);
            }
          }
          // If the picture on the page was this visit's, another picture takes its place.
          drawAll(outcome.deleted && isShown);
          setLine(savedStatus, outcome.line);
          savedHeading.focus({ preventScroll: true });
        });
        const name = make(
          "span",
          visit.headphoneName === null
            ? "result-headphones-name visit-quiet"
            : "result-headphones-name",
          [visit.headphoneName ?? resultPageCopy.unnamedHeadphonesLabel],
        );
        const item = make("li", "result-saved-visit", [
          make("p", "result-saved-when", [
            make("span", "result-date", [listing.dateLabel]),
            make("span", "result-visit-type", [listing.visitTypeLabel]),
          ]),
          make("p", "result-headphones", [
            make("span", "result-headphones-label", [
              resultPageCopy.headphonesLabel,
            ]),
            name,
          ]),
          make("div", "result-controls", [showButton, deleteButton]),
        ]);
        if (isShown) {
          item.setAttribute("aria-current", "true");
        }
        return item;
      }),
    );
    savedList.hidden = list.visits.length === 0;
    deleteAllButton.hidden = !list.canDeleteAll;
    if (!list.canDeleteAll) {
      deleteAllQuestion.hidden = true;
    }
  };

  /** Draws everything from what the archive holds now. */
  function drawAll(entering: boolean): void {
    const list = archive.list();
    // A shown visit that is no longer saved gives way to the live one.
    if (shownSaved !== null) {
      const id = shownSaved.savedVisitId;
      shownSaved =
        list.visits.find((listing) => listing.visit.savedVisitId === id)
          ?.visit ?? null;
    }
    drawPicture(list, entering);
    const picture = shownPicture;
    if (picture === null) {
      return;
    }
    const focusNow = focusOf(picture);
    drawFocus(focusNow);
    drawKey(picture);
    heading.textContent = picture.heading;
    drawing.setAttribute("aria-label", picture.heading);
    dateLabel.textContent = picture.dateLabel;
    visitTypeLabel.textContent = picture.visitTypeLabel;
    falseAlarmLine.textContent = picture.falseAlarmLine;
    const shownLog = shownSaved?.visitLog ?? live?.visitLog ?? null;
    score.hidden = shownLog === null;
    if (shownLog !== null) {
      const chase = chaseScoreOf(shownLog);
      // A count large and its label small. Read out, it is the count's line in full.
      const tile = (count: number, label: string, line: string): HTMLElement =>
        make("p", "result-score-tile", [
          shownOnly(make("span", "result-score-number", [String(count)])),
          shownOnly(make("span", "result-score-label", [label])),
          spoken(line),
        ]);
      scoreTiles.replaceChildren(
        tile(
          chase.caughtCount,
          chaseScoreCopy.caughtLabel,
          totalCaughtLine(chase.caughtCount),
        ),
        tile(
          chase.longestRow,
          chaseScoreCopy.rowLabel,
          longestRowLine(chase.longestRow),
        ),
      );
      scoreRooms.replaceChildren(
        ...chase.rooms.map((room) =>
          make("li", "result-score-room", [
            creatureBadge(room.roomId, "result-score-badge"),
            make("span", "", [
              roomCaughtLine(roomNames[room.roomId], room.caughtCount),
            ]),
          ]),
        ),
      );
    }
    limitsHeading.textContent = picture.limitsStatement.heading;
    limitsList.replaceChildren(
      ...picture.limitsStatement.sentences.map((sentence) =>
        make("li", "", [sentence]),
      ),
    );
    const standingOut = new Map(
      focusNow?.points.map((point) => [point.roomId, point.kind] as const) ??
        [],
    );
    floorItems.clear();
    const firstFloorLine = picture.floors[0]?.playableFloorLine ?? null;
    const sameFloorLine =
      picture.floors.length > 1 &&
      firstFloorLine !== null &&
      picture.floors.every(
        (floor) => floor.playableFloorLine === firstFloorLine,
      );
    setLine(sharedFloorLine, sameFloorLine ? firstFloorLine : null);
    floorList.replaceChildren(
      ...[...picture.floors].reverse().map((floor) => {
        const item = floorWords(
          floor,
          standingOut.get(floor.room.roomId) ?? null,
          !sameFloorLine,
        );
        floorItems.set(floor.room.roomId, item);
        return item;
      }),
    );

    shownVisit.hidden = shownSaved === null;
    if (shownSaved !== null) {
      shownHeadphones.textContent =
        shownSaved.headphoneName ?? resultPageCopy.unnamedHeadphonesLabel;
      shownHeadphones.classList.toggle(
        "visit-quiet",
        shownSaved.headphoneName === null,
      );
    }
    backToThisVisitButton.hidden = live === null;
    // Only the visit that has just ended can be saved or named.
    keep.hidden = shownSaved !== null || live === null;
    setLine(turnBack, shownSaved === null ? liveTurnBackLine : null);
    const lacks =
      live !== null &&
      shownSaved === null &&
      archive.savedCopyLacksRepeats(live);
    savedCopyLacks.hidden = !lacks;
    if (lacks) {
      saveButton.setAttribute("aria-describedby", savedCopyLacks.id);
    } else {
      saveButton.removeAttribute("aria-describedby");
    }
    drawSavedList(list);
  }

  const save = (): void => {
    if (live === null || shownSaved !== null) {
      return;
    }
    const outcome = archive.save(live, nameInput.value);
    if (outcome.saved) {
      liveSavedId = outcome.savedVisit.savedVisitId;
    }
    drawAll(false);
    setLine(saveStatus, outcome.line);
    setLine(savedStatus, null);
  };

  nameInput.addEventListener("input", () => {
    drawPicture(archive.list(), false);
  });
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    }
  });
  saveButton.addEventListener("click", save);
  backToThisVisitButton.addEventListener("click", () => {
    shownSaved = null;
    drawAll(true);
    element.scrollTo({ top: 0 });
    heading.focus({ preventScroll: true });
  });
  deleteAllButton.addEventListener("click", () => {
    deleteAllQuestion.hidden = false;
    deleteAllButton.hidden = true;
    deleteAllCancelButton.focus({ preventScroll: true });
  });
  deleteAllCancelButton.addEventListener("click", () => {
    deleteAllQuestion.hidden = true;
    deleteAllButton.hidden = false;
    deleteAllButton.focus({ preventScroll: true });
  });
  deleteAllConfirmButton.addEventListener("click", () => {
    const outcome = archive.deleteAll();
    deleteAllQuestion.hidden = true;
    const pictureGoes = outcome.deleted && shownSaved !== null;
    if (outcome.deleted) {
      shownSaved = null;
      if (liveSavedId !== null) {
        liveSavedId = null;
        setLine(saveStatus, resultPageCopy.notSavedLine);
      }
    }
    drawAll(pictureGoes);
    setLine(savedStatus, outcome.line);
    savedHeading.focus({ preventScroll: true });
  });
  savePictureButton.addEventListener("click", () => {
    const picture = shownPicture;
    const section = drawing.querySelector("svg");
    if (picture === null || section === null) {
      return;
    }
    const typedName = nameInput.value.trim();
    const headphoneName =
      shownSaved !== null
        ? shownSaved.headphoneName
        : typedName === ""
          ? null
          : typedName;
    setLine(pictureStatus, null);
    void savePictureAsImage({
      doc,
      view,
      section,
      picture,
      headphones:
        headphoneName === null
          ? null
          : { label: resultPageCopy.headphonesLabel, name: headphoneName },
    }).then((savedAsImage) => {
      setLine(
        pictureStatus,
        savedAsImage ? null : resultPageCopy.pictureNotSavedLine,
      );
    });
  });
  backButton.addEventListener("click", () => {
    options.onBack();
  });

  return {
    element,
    heading,
    show(visit, turnBackLine = null) {
      liveTurnBackLine = turnBackLine;
      if (live?.visitLog !== visit.visitLog) {
        // A new visit: nothing of the last one stays on the page.
        liveSavedId = null;
        shownSaved = null;
        nameInput.value = "";
        setLine(saveStatus, resultPageCopy.notSavedLine);
        setLine(savedStatus, null);
        setLine(pictureStatus, null);
        deleteAllQuestion.hidden = true;
      }
      const appearing =
        element.hidden !== false || live?.visitLog !== visit.visitLog;
      live = visit;
      element.hidden = false;
      drawAll(appearing);
      if (appearing) {
        element.scrollTo({ top: 0 });
      }
    },
    clear() {
      if (live === null && element.hidden !== false) {
        return;
      }
      nameInput.value = "";
      live = null;
      liveTurnBackLine = null;
      liveSavedId = null;
      shownSaved = null;
      shownPicture = null;
      drawnKey = null;
      element.hidden = true;
      drawing.replaceChildren();
      floorItems.clear();
      if (calledTimer !== null) {
        view.clearTimeout(calledTimer);
        calledTimer = null;
      }
    },
  };
}
