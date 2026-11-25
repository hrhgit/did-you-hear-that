import { ghostSoundIds } from "../../config/sound-id";
import { calibrationCopy } from "../../copy/calibration-copy";
import { creatureCopy, oneRoomCopy } from "../../copy/creature-copy";
import { frontDoorCopy } from "../../copy/front-door-copy";
import { headphoneCheckCopy } from "../../copy/headphone-check-copy";
import { leavingCopy } from "../../copy/leaving-copy";
import { replayCopy } from "../../copy/replay-copy";
import { roomCopy } from "../../copy/room-copy";
import { rulesCopy } from "../../copy/rules-copy";
import { resultPageCopy } from "../../copy/result-page-copy";
import { siteTitle } from "../../copy/site-title";
import { swappedRepeatCopy } from "../../copy/swapped-repeat-copy";
import { visitCopy } from "../../copy/visit-copy";
import { rhythmCopy } from "../../copy/rhythm-copy";
import { buildRoomScene, type RoomScene } from "../room/build-room-scene";
import { drawCreature } from "../room/creature-art";
import { buildCreatureShelf, type CreatureShelf } from "../room/creature-shelf";
import { drawSwappedHeadphones } from "./draw-swapped-headphones";

/** A sheet of text laid over the faint room. Only one is shown at a time. */
export interface Sheet {
  readonly element: HTMLElement;
  /** The sheet's heading, which takes the focus when the sheet appears. */
  readonly heading: HTMLElement;
}

/** The two answers of the headphone check that are not a side. */
export type CheckAnswer = "left" | "right" | "bothSides" | "nothingHeard";

/**
 * Every element of the visit, made once. Drawing a snapshot only changes text, `hidden` and
 * `disabled`, so no control ever moves away from under a press.
 */
export interface VisitPage {
  readonly root: HTMLElement;
  /** The picture of the one room, with the lantern that hangs in it. */
  readonly scene: RoomScene;
  /** The cards of the creatures, along the foot of the room. */
  readonly shelf: CreatureShelf;
  readonly stopButton: HTMLButtonElement;
  readonly pauseButton: HTMLButtonElement;
  readonly room: HTMLElement;
  readonly roomName: HTMLElement;
  readonly roomProgress: HTMLElement;
  readonly answerButtons: Readonly<Record<"left" | "right", HTMLButtonElement>>;
  readonly caption: HTMLElement;
  /** A second line under the caption, for a creature that has gone home. */
  readonly captionNote: HTMLElement;
  /** The rest between two rooms: a line and a button, where the caption is. */
  readonly rest: HTMLElement;
  readonly restLine: HTMLElement;
  readonly restButton: HTMLButtonElement;
  readonly frontDoor: Sheet & {
    readonly choiceButtons: Readonly<
      Record<"full" | "replay", HTMLButtonElement>
    >;
    readonly statusLine: HTMLElement;
  };
  readonly calibration: Sheet & {
    /** Holds one paragraph for each line to read before using the control. */
    readonly introLines: HTMLElement;
    /** The control and the buttons at its two ends. */
    readonly dial: HTMLElement;
    /**
     * A drawn line with a lit part and a mark on it: how far the sound has got between the two
     * ends. Set by `--visit-setting`, from 0 to 1.
     */
    readonly meter: HTMLElement;
    /** The slider over the drawn line. Its thumb is where the visitor has put the control. */
    readonly range: HTMLInputElement;
    readonly keysLine: HTMLElement;
    readonly statusLine: HTMLElement;
    readonly startButton: HTMLButtonElement;
    readonly quieterButton: HTMLButtonElement;
    readonly louderButton: HTMLButtonElement;
    readonly keepButton: HTMLButtonElement;
  };
  readonly headphoneCheck: Sheet & {
    readonly keptLine: HTMLElement;
    readonly roomsLine: HTMLElement;
    readonly playButton: HTMLButtonElement;
    readonly question: HTMLElement;
    readonly answerList: HTMLElement;
    readonly answerButtons: Readonly<Record<CheckAnswer, HTMLButtonElement>>;
    readonly judgementLine: HTMLElement;
    readonly goOnButton: HTMLButtonElement;
  };
  readonly rules: Sheet & { readonly enterButton: HTMLButtonElement };
  readonly notice: Sheet & {
    readonly line: HTMLElement;
    /** Holds one paragraph for each line said after the first. */
    readonly moreLines: HTMLElement;
    readonly statusLine: HTMLElement;
    readonly button: HTMLButtonElement;
    readonly secondButton: HTMLButtonElement;
  };
  /** The replay of missed sounds, before its sounds and after them. */
  readonly replay: Sheet & {
    /** Holds one paragraph for each line the house says. */
    readonly lines: HTMLElement;
    readonly counts: HTMLElement;
    readonly countLines: Readonly<Record<"left" | "right", HTMLElement>>;
    readonly selectionLine: HTMLElement;
    readonly statusLine: HTMLElement;
    readonly startButton: HTMLButtonElement;
    readonly proceedButton: HTMLButtonElement;
  };
  /**
   * The swapped repeat of one floor outside its room: how to swap, the check of the swap, the way
   * into the room and, afterwards, both runs side by side. Its words come with each snapshot.
   */
  readonly swap: Sheet & {
    /** The floor that is visited again: its name, its pitch and what its first run found. */
    readonly floorName: HTMLElement;
    readonly floorPitch: HTMLElement;
    readonly floorDifference: HTMLElement;
    /** The sketch of the headphones the other way round. Only its `data-state` changes. */
    readonly sketch: SVGElement;
    /** Holds one paragraph for each line the house says. */
    readonly lines: HTMLElement;
    /** Holds both runs of the room side by side, once the repeat has run to its end. */
    readonly comparison: HTMLElement;
    readonly turnBackLine: HTMLElement;
    /** Said when a check found the headphones the way they were. Stands above the lit button. */
    readonly againLine: HTMLElement;
    readonly primaryButton: HTMLButtonElement;
    readonly question: HTMLElement;
    readonly answerList: HTMLElement;
    readonly answerButtons: Readonly<Record<CheckAnswer, HTMLButtonElement>>;
    /** What the last press came to. Stands under the buttons it is about, so none of them moves. */
    readonly statusLine: HTMLElement;
    readonly backButton: HTMLButtonElement;
  };
  /** The roll call and the counting: words under the lantern, in the room, which stays in full view. */
  readonly practice: {
    readonly element: HTMLElement;
    readonly heading: HTMLElement;
    /** Holds one paragraph for each line. */
    readonly lines: HTMLElement;
    /** Who is making its sound at the roll call. Never said once it counts. */
    readonly introLine: HTMLElement;
    /** Said while a practice sound plays. */
    readonly soundLine: HTMLElement;
  };
  /** The replay while its sounds play: words under the room, which stays in full view. */
  readonly replaying: {
    readonly element: HTMLElement;
    /** What is said of the sound that is playing. Its first sentence stands out. */
    readonly sound: HTMLElement;
    readonly soundLead: HTMLElement;
    readonly soundRest: HTMLElement;
    readonly countLines: Readonly<Record<"left" | "right", HTMLElement>>;
    readonly selectionLine: HTMLElement;
    readonly skipButton: HTMLButtonElement;
  };
}

type Children = readonly (Node | string)[];

/** Builds the visit's elements inside `main` and returns handles to the ones that change. */
export function buildVisitPage(doc: Document, main: HTMLElement): VisitPage {
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
  const button = (
    label: string,
    extraClass = "",
    note?: string,
  ): HTMLButtonElement => {
    const element = make("button", `visit-button ${extraClass}`.trim(), [
      label,
    ]);
    element.type = "button";
    if (note !== undefined) {
      element.append(make("span", "visit-button-note", [note]));
    }
    return element;
  };
  // An answer of a headphone check: a tile with a small drawing of the headphones over its word.
  // The drawing comes from `visit.css`, so the button holds its word alone and can be set as text.
  const choiceTile = (
    label: string,
    answer: CheckAnswer,
  ): HTMLButtonElement => {
    const element = button(label, "visit-tile");
    element.dataset.answer = answer;
    return element;
  };
  const heading = (text: string): HTMLHeadingElement => {
    const element = make("h1", "", [text]);
    element.tabIndex = -1;
    return element;
  };
  const sheet = (
    name: string,
    title: HTMLElement,
    children: Children,
  ): HTMLElement => {
    const element = make("section", `visit-sheet visit-sheet-${name}`, [
      make("div", "visit-sheet-body", [title, ...children]),
    ]);
    element.hidden = true;
    return element;
  };
  const controls = (items: Children, extraClass = ""): HTMLElement =>
    make("div", `visit-controls ${extraClass}`.trim(), items);
  // The steps before the room, drawn over a sheet's heading: those done are lit, the one at hand
  // glows. Each sheet always stands at the same step, so the row never changes once made.
  const steps = (current: number): HTMLElement => {
    const list = make(
      "ol",
      "visit-steps",
      visitCopy.steps.map((name, index) => {
        const item = make("li", "visit-step", [
          make("span", "visit-step-dot"),
          make("span", "visit-step-name", [name]),
        ]);
        item.dataset.state =
          index < current ? "done" : index === current ? "now" : "later";
        if (index === current) {
          item.setAttribute("aria-current", "step");
        }
        return item;
      }),
    );
    list.setAttribute("aria-label", visitCopy.stepsLabel);
    return list;
  };
  // Puts the row of steps at the top of a sheet, over its heading.
  const withSteps = (element: HTMLElement, current: number): HTMLElement => {
    element.firstElementChild?.prepend(steps(current));
    element.dataset.step = String(current);
    return element;
  };

  // The bar: stop at the left, the room at the right.
  const stopButton = button(roomCopy.stopButton, "visit-stop");
  stopButton.dataset.icon = "stop";
  stopButton.hidden = true;
  const roomName = make("span", "visit-room-name");
  const roomProgress = make("span", "visit-room-progress");
  const room = make("p", "visit-room", [roomName, roomProgress]);
  room.hidden = true;
  const pauseButton = button(roomCopy.pauseButton, "visit-stop");
  pauseButton.dataset.icon = "pause";
  pauseButton.hidden = true;
  const bar = make("div", "visit-bar", [stopButton, pauseButton, room]);

  // The room and the cards of who is in it.
  const scene = buildRoomScene(doc, {
    sceneLabel: oneRoomCopy.sceneLabel,
    comboWord: rhythmCopy.comboWord,
    scoreWord: rhythmCopy.scoreWord,
    warmUpWord: rhythmCopy.warmUpWord,
    judgementWords: rhythmCopy.judgementWords,
    kickAtNothingWord: rhythmCopy.kickAtNothingWord,
  });
  const shelf = buildCreatureShelf(doc, {
    label: oneRoomCopy.shelfLabel,
    sideMarks: oneRoomCopy.sideMarks,
  });

  // The answers.
  const answer = (side: "left" | "right"): HTMLButtonElement => {
    const element = make("button", `visit-answer visit-answer-${side}`, [
      make("span", "visit-answer-hint", [
        roomCopy.answers[side].hint,
        make("span", "visit-answer-keys", [roomCopy.answerKeys[side]]),
      ]),
    ]);
    element.type = "button";
    // The name of the button is the word a visitor sees on it, so that someone who speaks to
    // their device can ask for it by that word. The longer sentence describes it.
    element.setAttribute("aria-description", roomCopy.answers[side].name);
    element.hidden = true;
    return element;
  };
  const answerButtons = { left: answer("left"), right: answer("right") };

  const caption = make("p", "visit-caption");
  caption.setAttribute("role", "status");
  caption.setAttribute("aria-live", "polite");
  // A second line, for the one time something more happened than a sound: a creature went home.
  const captionNote = make("p", "visit-caption-note");
  captionNote.setAttribute("role", "status");
  captionNote.setAttribute("aria-live", "polite");
  const captionBlock = make("div", "visit-caption-block", [
    caption,
    captionNote,
  ]);

  const restLine = make("p", "visit-rest-line visit-voice");
  const restButton = button(roomCopy.goOnButton, "visit-button-lit");
  const rest = make("div", "visit-rest", [restLine, restButton]);
  rest.hidden = true;

  // The front door.
  const choiceButtons = {
    full: button(
      frontDoorCopy.choices.full.button,
      "visit-button-lit",
      frontDoorCopy.choices.full.note,
    ),
    replay: button(
      frontDoorCopy.choices.replay.button,
      "",
      frontDoorCopy.choices.replay.note,
    ),
  };
  // The replay has its own spec. Until it is built its door stays shut, but can still be read.
  choiceButtons.replay.setAttribute("aria-disabled", "true");
  choiceButtons.full.dataset.icon = "door";
  choiceButtons.replay.dataset.icon = "lock";
  const choices = controls(
    Object.values(choiceButtons),
    "visit-controls-stacked",
  );
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", frontDoorCopy.choicesLabel);
  const frontDoorHeading = heading(siteTitle);
  const status = (): HTMLElement => {
    const element = make("p", "visit-status visit-quiet");
    element.setAttribute("role", "status");
    return element;
  };
  const frontDoorStatus = status();
  // The five creatures, each on a card shaped like a doorway, the way the room's cards are.
  const roster = make(
    "ul",
    "visit-roster",
    ghostSoundIds.map((id) => {
      const card = make("li", "visit-roster-card", [
        make("span", "visit-roster-portrait", [drawCreature(doc, id)]),
        make("span", "visit-roster-name", [creatureCopy[id].name]),
      ]);
      card.dataset.creature = id;
      return card;
    }),
  );
  roster.setAttribute("aria-label", frontDoorCopy.rosterLabel);
  const headphonesMark = make("span", "visit-headphones-mark");
  headphonesMark.setAttribute("aria-hidden", "true");
  const frontDoor = sheet("front", frontDoorHeading, [
    make("p", "visit-lead visit-front-lead", [
      headphonesMark,
      frontDoorCopy.headphonesLine,
    ]),
    make("p", "visit-voice visit-quiet visit-front-about", [
      frontDoorCopy.aboutLine,
    ]),
    roster,
    choices,
    frontDoorStatus,
    make("p", "visit-quiet visit-front-privacy", [frontDoorCopy.privacyLine]),
  ]);
  frontDoorHeading.before(make("p", "visit-eyebrow", [frontDoorCopy.eyebrow]));

  // Calibration: a control that can be dragged, quieter and louder at its two ends, and a button
  // to keep the setting.
  const calibrationHeading = heading(visitCopy.calibrationHeading);
  calibrationHeading.id = "visit-calibration-heading";
  const introLines = make("div", "visit-calibration-lines", [
    make("p", "", [calibrationCopy.openLine]),
  ]);
  const statusLine = status();
  const range = make("input", "visit-meter-range");
  range.type = "range";
  range.setAttribute("aria-labelledby", calibrationHeading.id);
  const meter = make("div", "visit-meter", [
    make("span", "visit-meter-line"),
    make("span", "visit-meter-fill"),
    make("span", "visit-meter-mark"),
    range,
  ]);
  const startButton = button(calibrationCopy.startButton, "visit-button-lit");
  startButton.dataset.icon = "play";
  const quieterButton = button(calibrationCopy.quieterButton);
  quieterButton.dataset.icon = "quieter";
  const louderButton = button(calibrationCopy.louderButton);
  louderButton.dataset.icon = "louder";
  const keepButton = button(calibrationCopy.keepButton, "visit-button-lit");
  keepButton.dataset.icon = "keep";
  const dial = make("div", "visit-dial", [
    meter,
    make("div", "visit-dial-ends", [quieterButton, louderButton]),
  ]);
  dial.hidden = true;
  const keysLine = make("p", "visit-keys-line visit-quiet");
  keysLine.hidden = true;
  const calibration = withSteps(
    sheet("calibration", calibrationHeading, [
      introLines,
      dial,
      keysLine,
      controls([startButton, keepButton]),
      statusLine,
    ]),
    0,
  );

  // The headphone check.
  const checkHeading = heading(visitCopy.headphoneCheckHeading);
  const keptLine = make("p", "", [calibrationCopy.keptLine]);
  const roomsLine = make("p", "visit-quiet");
  const playButton = button(headphoneCheckCopy.playButton, "visit-button-lit");
  playButton.dataset.icon = "play";
  const question = make("p", "visit-voice", [headphoneCheckCopy.question]);
  const checkAnswers: Record<CheckAnswer, HTMLButtonElement> = {
    left: choiceTile(headphoneCheckCopy.answers.left, "left"),
    right: choiceTile(headphoneCheckCopy.answers.right, "right"),
    bothSides: choiceTile(headphoneCheckCopy.answers.bothSides, "bothSides"),
    nothingHeard: choiceTile(
      headphoneCheckCopy.answers.nothingHeard,
      "nothingHeard",
    ),
  };
  const answerList = controls(Object.values(checkAnswers), "visit-tiles");
  answerList.setAttribute("role", "group");
  answerList.setAttribute("aria-label", headphoneCheckCopy.question);
  const judgementLine = make("p", "visit-status");
  judgementLine.setAttribute("role", "status");
  const checkGoOnButton = button(visitCopy.goOnButton, "visit-button-lit");
  const headphoneCheck = withSteps(
    sheet("check", checkHeading, [
      keptLine,
      roomsLine,
      controls([playButton]),
      question,
      answerList,
      judgementLine,
      controls([checkGoOnButton]),
    ]),
    1,
  );

  // The rules.
  const rulesHeading = heading(rulesCopy.heading);
  const enterButton = button(rulesCopy.enterButton, "visit-button-lit");
  enterButton.dataset.icon = "door";
  // How to answer: the two halves of the screen, each with its keys drawn as key caps. The caps
  // are a picture of the keyboard line under them, so only the line is read out.
  const half = (side: "left" | "right"): HTMLElement => {
    const caps = make(
      "span",
      "visit-keycaps",
      rulesCopy.keyCaps[side].map((key) => make("kbd", "visit-keycap", [key])),
    );
    caps.setAttribute("aria-hidden", "true");
    const element = make("div", `visit-half visit-half-${side}`, [
      make("span", "visit-half-word", [roomCopy.answers[side].hint]),
      caps,
    ]);
    element.setAttribute("aria-hidden", "true");
    return element;
  };
  const rules = withSteps(
    sheet("rules", rulesHeading, [
      make(
        "ol",
        "visit-rules",
        rulesCopy.sentences.map((sentence, index) => {
          const item = make("li", "visit-rule", [sentence]);
          item.dataset.rule = String(index + 1);
          return item;
        }),
      ),
      make("section", "visit-answer-guide", [
        make("h2", "visit-answer-guide-heading", [rulesCopy.answerHeading]),
        make("div", "visit-halves", [half("left"), half("right")]),
        make("p", "visit-quiet", [rulesCopy.keyboardLine]),
        make("p", "visit-quiet", [rulesCopy.touchLine]),
      ]),
      controls([enterButton]),
    ]),
    2,
  );

  // One sheet for everything else the house has to say: paused, stopped, ended, cannot play.
  const noticeHeading = heading(leavingCopy.pauseHeading);
  const noticeLine = make("p", "visit-voice");
  const noticeMoreLines = make("div", "visit-notice-lines");
  const noticeStatus = status();
  const noticeButton = button(leavingCopy.goOnButton, "visit-button-lit");
  // The second choice of a notice is the quieter one: the lit button is the way on.
  const noticeSecondButton = button("", "visit-button-quiet");
  noticeSecondButton.hidden = true;
  const notice = sheet("notice", noticeHeading, [
    noticeLine,
    noticeMoreLines,
    controls([noticeButton, noticeSecondButton]),
    noticeStatus,
  ]);

  // The roll call and the counting. Their words come with each snapshot, so they start empty.
  const practiceHeading = make("p", "visit-practice-heading");
  const practiceLines = make("div", "visit-practice-lines");
  const introLine = make("p", "room-intro");
  introLine.setAttribute("role", "status");
  introLine.setAttribute("aria-live", "polite");
  introLine.hidden = true;
  const practiceSound = make("p", "visit-practice-sound");
  practiceSound.setAttribute("role", "status");
  practiceSound.setAttribute("aria-live", "polite");

  const practice = make("div", "visit-practice", [
    practiceHeading,
    make("div", "visit-practice-words", [practiceLines]),
    introLine,
    practiceSound,
  ]);
  practice.hidden = true;

  // The replay of missed sounds. Its words come with each snapshot, so they start empty.
  const replayHeading = heading(replayCopy.heading);
  const replayLines = make("div", "visit-replay-lines");
  const sheetCounts = {
    left: make("p", "visit-voice"),
    right: make("p", "visit-voice"),
  };
  const replayCounts = make("div", "visit-replay-sheet-counts", [
    sheetCounts.left,
    sheetCounts.right,
  ]);
  const replaySelection = make("p", "visit-quiet");
  const replayStatus = status();
  const replayStartButton = button(replayCopy.startButton, "visit-button-lit");
  const replayProceedButton = button(replayCopy.skipButton);
  const replay = sheet("replay", replayHeading, [
    replayLines,
    replaySelection,
    replayCounts,
    controls([replayStartButton, replayProceedButton]),
    replayStatus,
  ]);

  // The swapped repeat. Its words come with each snapshot too.
  const swapHeading = heading("");
  const swapFloorName = make("span", "visit-swap-floor-name");
  const swapFloorPitch = make("span", "visit-swap-floor-pitch");
  const swapFloorDifference = make("span", "visit-swap-floor-difference");
  const swapSketch = drawSwappedHeadphones(doc, {
    marks: swappedRepeatCopy.earpieceMarks,
    earLabels: {
      left: resultPageCopy.leftLabel,
      right: resultPageCopy.rightLabel,
    },
  });
  const swapLines = make("div", "visit-swap-lines");
  const swapComparison = make("div", "visit-swap-comparison");
  swapComparison.hidden = true;
  const swapTurnBackLine = make("p", "visit-swap-turn-back");
  swapTurnBackLine.hidden = true;
  const swapAgainLine = make("p", "visit-swap-again");
  swapAgainLine.setAttribute("role", "status");
  swapAgainLine.hidden = true;
  const swapStatus = make("p", "visit-status");
  swapStatus.setAttribute("role", "status");
  const swapPrimaryButton = button("", "visit-button-lit");
  const swapPrimary = controls([swapPrimaryButton]);
  const swapQuestion = make("p", "visit-voice");
  swapQuestion.id = "visit-swap-question";
  const swapAnswers: Record<CheckAnswer, HTMLButtonElement> = {
    left: choiceTile("", "left"),
    right: choiceTile("", "right"),
    bothSides: choiceTile("", "bothSides"),
    nothingHeard: choiceTile("", "nothingHeard"),
  };
  const swapAnswerList = controls(Object.values(swapAnswers), "visit-tiles");
  swapAnswerList.setAttribute("role", "group");
  swapAnswerList.setAttribute("aria-labelledby", swapQuestion.id);
  const swapBackButton = button("");
  const swap = sheet("swap", swapHeading, [
    make("p", "visit-swap-floor", [
      swapFloorName,
      swapFloorPitch,
      swapFloorDifference,
    ]),
    swapSketch,
    swapLines,
    swapComparison,
    swapTurnBackLine,
    swapAgainLine,
    swapPrimary,
    swapQuestion,
    swapAnswerList,
    swapStatus,
    controls([swapBackButton], "visit-swap-leave"),
  ]);

  const soundLead = make("span", "visit-replay-sound-lead");
  const soundRest = make("span", "visit-replay-sound-rest");
  // The space keeps the two sentences apart for anything that reads the text and not the layout.
  const replayingSound = make("p", "visit-replay-sound", [
    soundLead,
    " ",
    soundRest,
  ]);
  const replayingCounts = {
    left: make("p", "visit-replay-count visit-replay-count-left"),
    right: make("p", "visit-replay-count visit-replay-count-right"),
  };
  const replayingSelection = make("p", "visit-replay-note");
  const replaySkipButton = button(replayCopy.skipRestButton);
  const replaying = make("div", "visit-replay", [
    replayingSound,
    replayingCounts.left,
    replayingCounts.right,
    make("div", "visit-replay-foot", [replayingSelection, replaySkipButton]),
  ]);
  replaying.hidden = true;

  main.classList.add("visit");
  // The room starts faint, behind the front door. Set before anything is drawn, so that the
  // page never opens on a bright room that then fades.
  main.dataset.house = "faint";
  main.tabIndex = -1;
  main.replaceChildren(
    scene.element,
    // The bar comes first, so that the first press of Tab in a room lands on the stop control.
    bar,
    answerButtons.left,
    answerButtons.right,
    practice,
    captionBlock,
    rest,
    shelf.element,
    replaying,
    frontDoor,
    calibration,
    headphoneCheck,
    rules,
    notice,
    replay,
    swap,
  );

  return {
    root: main,
    scene,
    shelf,
    stopButton,
    pauseButton,
    room,
    roomName,
    roomProgress,
    answerButtons,
    caption,
    captionNote,
    rest,
    restLine,
    restButton,
    frontDoor: {
      element: frontDoor,
      heading: frontDoorHeading,
      choiceButtons,
      statusLine: frontDoorStatus,
    },
    calibration: {
      element: calibration,
      heading: calibrationHeading,
      introLines,
      dial,
      meter,
      range,
      keysLine,
      statusLine,
      startButton,
      quieterButton,
      louderButton,
      keepButton,
    },
    headphoneCheck: {
      element: headphoneCheck,
      heading: checkHeading,
      keptLine,
      roomsLine,
      playButton,
      question,
      answerList,
      answerButtons: checkAnswers,
      judgementLine,
      goOnButton: checkGoOnButton,
    },
    rules: { element: rules, heading: rulesHeading, enterButton },
    notice: {
      element: notice,
      heading: noticeHeading,
      line: noticeLine,
      moreLines: noticeMoreLines,
      statusLine: noticeStatus,
      button: noticeButton,
      secondButton: noticeSecondButton,
    },
    practice: {
      element: practice,
      heading: practiceHeading,
      lines: practiceLines,
      introLine,
      soundLine: practiceSound,
    },
    replay: {
      element: replay,
      heading: replayHeading,
      lines: replayLines,
      counts: replayCounts,
      countLines: sheetCounts,
      selectionLine: replaySelection,
      statusLine: replayStatus,
      startButton: replayStartButton,
      proceedButton: replayProceedButton,
    },
    swap: {
      element: swap,
      heading: swapHeading,
      floorName: swapFloorName,
      floorPitch: swapFloorPitch,
      floorDifference: swapFloorDifference,
      sketch: swapSketch,
      lines: swapLines,
      comparison: swapComparison,
      turnBackLine: swapTurnBackLine,
      againLine: swapAgainLine,
      primaryButton: swapPrimaryButton,
      question: swapQuestion,
      answerList: swapAnswerList,
      answerButtons: swapAnswers,
      statusLine: swapStatus,
      backButton: swapBackButton,
    },
    replaying: {
      element: replaying,
      sound: replayingSound,
      soundLead,
      soundRest,
      countLines: replayingCounts,
      selectionLine: replayingSelection,
      skipButton: replaySkipButton,
    },
  };
}
