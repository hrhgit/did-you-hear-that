import { createSeededRandom } from "../../config/seeded-random";
import { createSketchPen } from "../house/sketch-pen";
import { svgElement } from "../house/svg-element";

/** The seed of the pencil that draws the headphones, so they look the same every time. */
const headphonesDrawingSeed = 2311;

/** What the sketch of the swapped headphones is lettered with. */
export interface SwappedHeadphonesWords {
  /** The mark on each earpiece, as headphones carry it: such as "L" and "R". */
  readonly marks: { readonly left: string; readonly right: string };
  /** The words under the two ears: the visitor's own left and right. */
  readonly earLabels: { readonly left: string; readonly right: string };
}

/**
 * A small pencil sketch of headphones worn the other way round: the earpiece marked for the right
 * sits over the left ear, and the one marked for the left over the right ear. It is drawn once.
 * Afterwards only its `data-state` changes: `asked` while the house has only asked for the swap,
 * `swapped` once a check has confirmed it. The sketch says nothing the words beside it do not
 * say, so it is hidden from anything that reads the page aloud.
 */
export function drawSwappedHeadphones(
  doc: Document,
  words: SwappedHeadphonesWords,
): SVGElement {
  const pen = createSketchPen(createSeededRandom(headphonesDrawingSeed));
  const leftX = 62;
  const rightX = 178;
  const cupTop = 50;
  const cupBottom = 96;
  const cupHalfWidth = 15;
  const cup = (x: number, mark: string, ear: "left" | "right"): SVGElement => {
    const letter = svgElement(doc, "text", {
      class: "swap-sketch-mark",
      x,
      y: (cupTop + cupBottom) / 2 + 6,
      "text-anchor": "middle",
    });
    letter.textContent = mark;
    return svgElement(doc, "g", { "data-ear": ear }, [
      svgElement(doc, "path", {
        class: "swap-sketch-cup",
        d: pen.box(x - cupHalfWidth, cupTop, x + cupHalfWidth, cupBottom),
      }),
      letter,
    ]);
  };
  const earLabel = (x: number, label: string): SVGElement => {
    const text = svgElement(doc, "text", {
      class: "swap-sketch-ear",
      x,
      y: 122,
      "text-anchor": "middle",
    });
    text.textContent = label;
    return text;
  };
  return svgElement(
    doc,
    "svg",
    {
      class: "swap-sketch",
      viewBox: "0 0 240 130",
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false",
      "data-state": "asked",
    },
    [
      // The head, from behind: only a faint outline between the two ears.
      svgElement(doc, "ellipse", {
        class: "swap-sketch-head",
        cx: (leftX + rightX) / 2,
        cy: 74,
        rx: (rightX - leftX) / 2 - cupHalfWidth - 3,
        ry: 44,
      }),
      // The band over the head, from one earpiece to the other.
      svgElement(doc, "path", {
        class: "swap-sketch-band",
        d: `M${leftX} ${cupTop}C${leftX} -8 ${rightX} -8 ${rightX} ${cupTop}`,
      }),
      // Over the left ear sits the earpiece marked for the right, and the other way round.
      cup(leftX, words.marks.right, "left"),
      cup(rightX, words.marks.left, "right"),
      earLabel(leftX, words.earLabels.left),
      earLabel(rightX, words.earLabels.right),
    ],
  );
}
