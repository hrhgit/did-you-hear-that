import { resultPageCopy } from "../../copy/result-page-copy";
import type {
  SwappedRepeatComparison,
  SwappedRepeatComparisonRun,
} from "../../session/visit-flow-types";
import { drawRepeatComparison } from "./draw-repeat-comparison";

/** The seed of the pencil that draws a comparison, so it looks the same every time. */
const comparisonDrawingSeed = 4099;

/** What a comparison's block needs besides the comparison. */
export interface RepeatComparisonBlockOptions {
  /** Set in front of every id inside the block. Two blocks on one page must not share it. */
  readonly idPrefix: string;
  /** The level of the block's heading, under the heading of what holds it. */
  readonly headingLevel: 2 | 4;
}

/**
 * A floor's first run and its swapped repeat side by side, as one block: a heading, the drawing,
 * what the two runs come to, and each run in words. Every word comes with the comparison. The
 * same block stands at the end of the repeat and beside the floor on the result. Its styles are
 * in `repeat-comparison.css`, which needs no other style sheet of the result.
 */
export function repeatComparisonBlock(
  doc: Document,
  comparison: SwappedRepeatComparison,
  options: RepeatComparisonBlockOptions,
): HTMLElement {
  const make = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    children: readonly (Node | string)[] = [],
  ): HTMLElementTagNameMap[K] => {
    const element = doc.createElement(tag);
    if (className !== "") {
      element.className = className;
    }
    element.append(...children);
    return element;
  };

  const heading = make(
    options.headingLevel === 2 ? "h2" : "h4",
    "repeat-heading",
    [comparison.heading],
  );
  heading.id = `${options.idPrefix}-heading`;

  const figure = make("div", "repeat-figure", [
    drawRepeatComparison(doc, comparison, {
      seed: comparisonDrawingSeed,
      idPrefix: options.idPrefix,
      earLabels: {
        left: resultPageCopy.leftLabel,
        right: resultPageCopy.rightLabel,
      },
    }),
  ]);
  figure.setAttribute("role", "img");
  figure.setAttribute("aria-labelledby", heading.id);

  const outcome = make("div", "repeat-outcome", [
    make("p", "repeat-outcome-label", [comparison.outcomeLabel]),
    ...comparison.outcomeLines.map((line) => make("p", "visit-voice", [line])),
  ]);
  outcome.dataset.outcome = comparison.outcome;

  const runWords = (run: SwappedRepeatComparisonRun): HTMLElement => {
    const item = make("li", "repeat-run-words", [
      make("p", "repeat-run-name", [
        make("span", "", [run.label]),
        make("span", "repeat-run-difference", [run.differenceLabel]),
      ]),
      make(
        "div",
        "repeat-wings",
        ([run.left, run.right] as const).map((wing) => {
          const words = make("div", "repeat-wing", [
            make("span", "repeat-wing-side", [
              wing.ear === "left"
                ? resultPageCopy.leftLabel
                : resultPageCopy.rightLabel,
              make("span", "repeat-wing-earpiece", [wing.earpieceLabel]),
            ]),
            make("p", "visit-voice", [wing.line]),
          ]);
          words.dataset.state = wing.state;
          if (wing.reasonLine !== null) {
            words.append(make("p", "visit-quiet", [wing.reasonLine]));
          }
          return words;
        }),
      ),
    ]);
    item.dataset.arrangement = run.arrangement;
    return item;
  };

  // Everything the drawing shows stands under it in words, for a visitor who cannot see it.
  const words = make("div", "repeat-words", [
    outcome,
    make("ol", "repeat-runs", comparison.runs.map(runWords)),
  ]);
  words.id = `${options.idPrefix}-words`;
  figure.setAttribute("aria-describedby", words.id);

  const block = make("div", "repeat-comparison", [heading, figure, words]);
  block.dataset.room = String(comparison.roomIndex);
  return block;
}
