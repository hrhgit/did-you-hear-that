import { leavingCopy } from "../../copy/leaving-copy";
import { resultPageCopy } from "../../copy/result-page-copy";
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
import { drawResultSection } from "./draw-result-section";
import { savePictureAsImage } from "./save-picture";

/** The seed of the pencil that draws the result, so the house looks the same every time. */
const resultDrawingSeed = 1887;

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
  /** Shows the result of the visit that has just ended. */
  show(visit: VisitToSave): void;
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
  const noticeHeading = make("h2", "result-notice-heading");
  const noticeLine = make("p", "visit-voice");
  const notice = make("div", "result-notice", [noticeHeading, noticeLine]);
  const head = make("header", "result-head", [
    heading,
    make("p", "result-meta", [dateLabel, visitTypeLabel]),
    shownVisit,
    falseAlarmLine,
    notice,
  ]);

  // The picture, and the control that saves it as an image.
  const drawing = make("div", "result-drawing");
  drawing.setAttribute("role", "img");
  const savePictureButton = button(resultPageCopy.savePictureButton);
  const pictureStatus = status();
  const figure = make("div", "result-figure", [
    drawing,
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
  const keep = make("section", "result-keep", [
    nameLabel,
    nameInput,
    nameHint,
    make("div", "result-controls", [saveButton]),
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
      figure,
      limits,
      make("div", "result-words", [floorList, comparisonLine]),
      keep,
      saved,
      make("div", "result-controls result-leave", [backButton]),
    ]),
  ]);
  element.hidden = true;

  // What is on the page now.
  let live: VisitToSave | null = null;
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

  const wingWords = (label: string, wing: PictureWing): HTMLElement => {
    const words = make("div", "result-wing", [
      make("span", "result-wing-side", [label]),
      make("p", "visit-voice", [wing.line]),
    ]);
    words.dataset.state = wing.state;
    if (wing.reasonLine !== null) {
      words.append(make("p", "visit-quiet", [wing.reasonLine]));
    }
    return words;
  };

  const floorWords = (floor: PictureFloor): HTMLElement => {
    const item = make("li", "result-floor-words", [
      make("h3", "result-floor-heading", [
        make("span", "result-floor-name", [floor.roomName]),
        make("span", "result-floor-pitch", [floor.pitchLabel]),
      ]),
      make("div", "result-wings", [
        wingWords(resultPageCopy.leftLabel, floor.left),
        wingWords(resultPageCopy.rightLabel, floor.right),
      ]),
      make("p", "result-difference", [
        make("span", "result-difference-heading", [
          resultPageCopy.differenceHeading,
        ]),
        make("span", "result-difference-label", [floor.differenceLabel]),
      ]),
    ]);
    item.dataset.room = floor.room.roomId;
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
    return item;
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
    heading.textContent = picture.heading;
    drawing.setAttribute("aria-label", picture.heading);
    dateLabel.textContent = picture.dateLabel;
    visitTypeLabel.textContent = picture.visitTypeLabel;
    falseAlarmLine.textContent = picture.falseAlarmLine;
    notice.hidden = picture.visitNotice === null;
    if (picture.visitNotice !== null) {
      noticeHeading.textContent = picture.visitNotice.heading;
      noticeLine.textContent = picture.visitNotice.line;
    }
    limitsHeading.textContent = picture.limitsStatement.heading;
    limitsList.replaceChildren(
      ...picture.limitsStatement.sentences.map((sentence) =>
        make("li", "", [sentence]),
      ),
    );
    floorList.replaceChildren(...[...picture.floors].reverse().map(floorWords));

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
    show(visit) {
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
      liveSavedId = null;
      shownSaved = null;
      shownPicture = null;
      drawnKey = null;
      element.hidden = true;
      drawing.replaceChildren();
    },
  };
}
