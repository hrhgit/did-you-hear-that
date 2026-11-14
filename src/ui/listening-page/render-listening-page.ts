import type { RandomSource } from "../../config/seeded-random";
import type { SoundId } from "../../config/sound-id";
import { soundIds } from "../../config/sound-id";
import type { Timer } from "../../config/timer";
import { calibrationCopy } from "../../copy/calibration-copy";
import { headphoneCheckCopy } from "../../copy/headphone-check-copy";
import {
  calibrationSettingLine,
  clampLine,
  clampLogLine,
  floorRmsLine,
  levelLabel,
  listeningPageCopy,
  playRefusedLine,
  sampleRateLine,
  seedLine,
} from "../../copy/listening-page-copy";
import { outputStateCopy } from "../../copy/output-state-copy";
import type {
  Ear,
  HeadphoneCheckAnswer,
  ListeningPageSession,
  ListeningPageSnapshot,
  RowPlay,
} from "../../session/listening-page-session";
import { createListeningPageSession } from "../../session/listening-page-session";

export interface ListeningPageOptions {
  readonly random: RandomSource;
  readonly seed: number;
  readonly timer: Timer;
}

/** Finds an element that `listen.html` holds before any script runs. */
function partOf(doc: Document, name: string): HTMLElement {
  const element = doc.querySelector<HTMLElement>(`[data-part="${name}"]`);
  if (element === null) {
    throw new Error(`The page has no element for "${name}".`);
  }
  return element;
}

/**
 * Draws the listening page (design.md, "The listening page", R19) and wires its controls to the
 * listening page session. The stop button is already in the page; this gives it its label and its
 * handler first, before anything that could make a sound exists (R14.8). Every string comes from
 * `src/copy`. Every element is made once, and each snapshot only changes text, `hidden` and
 * `disabled`, so a control never moves away from under a press.
 */
export function renderListeningPage(
  doc: Document,
  browserWindow: Window & typeof globalThis,
  options: ListeningPageOptions,
): ListeningPageSession {
  const stopButton = partOf(doc, "stop-button");
  const stopLine = partOf(doc, "stop-line");
  const startAgainButton = partOf(doc, "start-again-button");
  const header = partOf(doc, "header");
  const main = doc.querySelector("main");
  if (main === null) {
    throw new Error("The page has no <main> element to render into.");
  }

  const session = createListeningPageSession({
    window: browserWindow,
    timer: options.timer,
    random: options.random,
  });

  // 2. Stop: labelled and wired before anything else is drawn.
  stopButton.textContent = outputStateCopy.stopButton;
  stopButton.addEventListener("click", () => {
    session.stopAll();
  });
  startAgainButton.textContent = outputStateCopy.startAgainButton;
  startAgainButton.addEventListener("click", () => {
    // No await before start: the shell's backend calls stay inside the click (D23).
    void session.start();
  });

  const make = <Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag,
    text: string | null = null,
    part: string | null = null,
  ): HTMLElementTagNameMap[Tag] => {
    const element = doc.createElement(tag);
    if (text !== null) {
      element.textContent = text;
    }
    if (part !== null) {
      element.dataset.part = part;
    }
    return element;
  };
  const button = (
    text: string,
    part: string,
    onPress: () => void,
  ): HTMLButtonElement => {
    const element = make("button", text, part);
    element.type = "button";
    element.addEventListener("click", onPress);
    return element;
  };
  const section = (heading: string, part: string): HTMLElement => {
    const element = make("section", null, part);
    element.append(make("h2", heading));
    return element;
  };
  /** A `<dl>` whose values are set later. Labels come from the copy. */
  const definitions = (
    labels: readonly string[],
  ): { list: HTMLDListElement; values: HTMLElement[] } => {
    const list = make("dl");
    const values = labels.map((label) => {
      const value = make("dd");
      list.append(make("dt", label), value);
      return value;
    });
    return { list, values };
  };

  // 1. Header.
  doc.title = listeningPageCopy.header;
  header.replaceChildren(
    make("h1", listeningPageCopy.header),
    make("p", listeningPageCopy.intro),
  );

  // 3. Start.
  const startSection = make("section", null, "start");
  const startButton = button(
    listeningPageCopy.startButton,
    "start-button",
    () => {
      // No await before start: the shell's backend calls stay inside the click (D23).
      void session.start();
    },
  );
  const sampleRateText = make("p", null, "sample-rate");
  const startLine = make("p", null, "start-line");
  startSection.append(startButton, sampleRateText, startLine);

  // 4. Calibration.
  const calibrationSection = section(
    listeningPageCopy.calibrationHeading,
    "calibration",
  );
  const calibrationLine = make("p", null, "calibration-line");
  const calibrationStart = button(
    calibrationCopy.startButton,
    "calibration-start",
    () => session.startCalibration(),
  );
  const quieter = button(calibrationCopy.quieterButton, "quieter", () =>
    session.quieter(),
  );
  const louder = button(calibrationCopy.louderButton, "louder", () =>
    session.louder(),
  );
  const playedSetting = make("p", null, "played-setting");
  const keep = button(calibrationCopy.keepButton, "keep", () =>
    session.keepCalibration(),
  );
  const calibrationRefusal = make("p", null, "calibration-refusal");
  const roomsLine = make("p", null, "rooms-line");
  const calibrationControls = make("div");
  calibrationControls.className = "controls";
  calibrationControls.append(calibrationStart, quieter, louder, keep);
  calibrationSection.append(
    calibrationLine,
    calibrationControls,
    playedSetting,
    calibrationRefusal,
    roomsLine,
  );

  // 5. Headphone check.
  const checkSection = section(
    listeningPageCopy.headphoneCheckHeading,
    "headphone-check",
  );
  const checkPlay = button(headphoneCheckCopy.playButton, "check-play", () =>
    session.playHeadphoneCheck(),
  );
  const checkAnswers = make("div");
  checkAnswers.className = "controls";
  const answers: readonly HeadphoneCheckAnswer[] = [
    "left",
    "right",
    "bothSides",
    "nothingHeard",
  ];
  for (const answer of answers) {
    checkAnswers.append(
      button(headphoneCheckCopy.answers[answer], `answer-${answer}`, () =>
        session.answerHeadphoneCheck(answer),
      ),
    );
  }
  const checkRefusal = make("p", null, "check-refusal");
  const checkAnswerLine = make("p", null, "check-answer-line");
  checkSection.append(
    checkPlay,
    checkRefusal,
    make("p", headphoneCheckCopy.question),
    checkAnswers,
    checkAnswerLine,
  );

  // 6. Sounds.
  const soundsSection = section(listeningPageCopy.soundsHeading, "sounds");
  interface RowElements {
    readonly level: HTMLElement;
    readonly down: HTMLButtonElement;
    readonly up: HTMLButtonElement;
    readonly playLeft: HTMLButtonElement;
    readonly playRight: HTMLButtonElement;
    readonly values: HTMLElement[];
  }
  const rowElements = new Map<SoundId, RowElements>();
  for (const soundId of soundIds) {
    const row = make("div", null, `row-${soundId}`);
    row.className = "sound-row";
    const play = (ear: Ear) => () => session.play(soundId, ear);
    const level = make("p", null, "level");
    const down = button(listeningPageCopy.levelDownButton, "level-down", () =>
      session.levelDown(soundId),
    );
    const up = button(listeningPageCopy.levelUpButton, "level-up", () =>
      session.levelUp(soundId),
    );
    const playLeft = button(
      listeningPageCopy.playLeftButton,
      "play-left",
      play("left"),
    );
    const playRight = button(
      listeningPageCopy.playRightButton,
      "play-right",
      play("right"),
    );
    const controls = make("div");
    controls.className = "controls";
    controls.append(down, up, playLeft, playRight);
    const { list, values } = definitions([
      listeningPageCopy.roomTopLabel,
      listeningPageCopy.requestedLabel,
      listeningPageCopy.playedLabel,
      listeningPageCopy.limitLabel,
    ]);
    row.append(make("h3", soundId), level, controls, list);
    soundsSection.append(row);
    rowElements.set(soundId, { level, down, up, playLeft, playRight, values });
  }

  // 7. Details.
  const detailsSection = section(listeningPageCopy.detailsHeading, "details");
  const seedText = make("p", seedLine(options.seed), "seed");
  const detailsSampleRate = make("p", null, "details-sample-rate");
  const detailsSetting = make("p", null, "details-setting");
  const rangeHeading = make("h3", listeningPageCopy.rangeReportLabel);
  const rangeList = make("dl", null, "range-report");
  const floorRms = make("p", null, "floor-rms");
  const clampHeading = make("h3", listeningPageCopy.clampLogLabel);
  const clampList = make("ul", null, "clamp-log");
  detailsSection.append(
    seedText,
    detailsSampleRate,
    detailsSetting,
    rangeHeading,
    rangeList,
    floorRms,
    clampHeading,
    clampList,
  );

  main.replaceChildren(
    startSection,
    calibrationSection,
    checkSection,
    soundsSection,
    detailsSection,
  );

  const show = (element: HTMLElement, text: string | null): void => {
    element.textContent = text ?? "";
    element.hidden = text === null;
  };

  const lastPlayValues = (
    lastPlay: RowPlay | null,
  ): [string, string, string] => {
    if (lastPlay === null) {
      return ["", "", ""];
    }
    const { outcome } = lastPlay;
    if (outcome.kind === "refused") {
      return ["", playRefusedLine(outcome.reason), ""];
    }
    return [
      levelLabel(outcome.requestedLevelDb),
      levelLabel(outcome.playedLevelDb),
      clampLine(outcome.clampLimit),
    ];
  };

  const draw = (snapshot: ListeningPageSnapshot): void => {
    const { outputState, calibration } = snapshot;
    const running = outputState.kind === "running";
    const started =
      outputState.kind !== "inactive" && outputState.kind !== "unsupported";
    const kept = snapshot.rangeReport !== null;

    // Stop bar.
    show(stopLine, outputState.kind === "stopped" ? snapshot.stateLine : null);
    startAgainButton.hidden = outputState.kind !== "stopped";

    // Start.
    startButton.hidden = outputState.kind !== "inactive";
    show(
      sampleRateText,
      snapshot.sampleRateHz === null
        ? null
        : sampleRateLine(snapshot.sampleRateHz),
    );
    show(
      startLine,
      outputState.kind === "unsupported"
        ? snapshot.stateLine
        : snapshot.activationRefused
          ? playRefusedLine("noGesture")
          : null,
    );

    // Calibration.
    calibrationSection.hidden = !started;
    show(calibrationLine, calibration.line);
    calibrationStart.disabled = !running;
    quieter.disabled = !running || !calibration.playing;
    louder.disabled = !running || !calibration.playing;
    keep.disabled =
      !calibration.playing || calibration.playedSettingDb === null;
    show(
      playedSetting,
      calibration.playedSettingDb === null
        ? null
        : calibrationSettingLine(calibration.playedSettingDb),
    );
    show(
      calibrationRefusal,
      calibration.repeatRefusal === null
        ? null
        : playRefusedLine(calibration.repeatRefusal),
    );
    show(roomsLine, snapshot.roomsLine);

    // Headphone check.
    checkSection.hidden = !kept;
    checkPlay.disabled = !running;
    const checkOutcome = snapshot.headphoneCheck.lastPlay;
    show(
      checkRefusal,
      checkOutcome !== null && checkOutcome.kind === "refused"
        ? playRefusedLine(checkOutcome.reason)
        : null,
    );
    show(checkAnswerLine, snapshot.headphoneCheck.answerLine);

    // Sounds.
    soundsSection.hidden = !kept;
    for (const row of snapshot.rows) {
      const elements = rowElements.get(row.soundId);
      if (elements === undefined) {
        continue;
      }
      elements.level.textContent = levelLabel(row.levelDb);
      elements.down.disabled = row.levelDb <= row.lowestLevelDb;
      elements.up.disabled = row.levelDb >= row.highestLevelDb;
      elements.playLeft.disabled = !running;
      elements.playRight.disabled = !running;
      const [requested, played, limit] = lastPlayValues(row.lastPlay);
      const values = [levelLabel(row.roomTopLevelDb), requested, played, limit];
      values.forEach((text, index) => {
        const value = elements.values[index];
        if (value !== undefined) {
          value.textContent = text;
        }
      });
    }

    // Details.
    show(
      detailsSampleRate,
      snapshot.sampleRateHz === null
        ? null
        : sampleRateLine(snapshot.sampleRateHz),
    );
    const report = snapshot.rangeReport;
    show(
      detailsSetting,
      report === null
        ? null
        : calibrationSettingLine(report.calibrationSettingDb),
    );
    rangeHeading.hidden = report === null;
    rangeList.replaceChildren(
      ...(report === null
        ? []
        : soundIds.flatMap((soundId) => [
            make("dt", soundId),
            make(
              "dd",
              `${levelLabel(report.rooms[soundId].topLevelDb)} (${report.rooms[soundId].setBy})`,
            ),
          ])),
    );
    show(
      floorRms,
      report === null ? null : floorRmsLine(report.floorRmsFraction),
    );
    clampList.replaceChildren(
      ...(snapshot.clampLog.length === 0
        ? [make("li", listeningPageCopy.clampLogEmpty)]
        : snapshot.clampLog.map((entry) => make("li", clampLogLine(entry)))),
    );
  };

  session.subscribe(draw);
  draw(session.snapshot());
  return session;
}
