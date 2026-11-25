import type { ResultPicture } from "../../session/result-page-types";
import {
  layoutPictureSheet,
  type SheetHeadphones,
  type SheetTone,
} from "./picture-sheet";

/** What is needed to save the picture of a result as an image file. */
export interface PictureToSave {
  readonly doc: Document;
  readonly view: Window & typeof globalThis;
  /** The drawing of the house as it is on the page. */
  readonly section: SVGElement;
  readonly picture: ResultPicture;
  readonly headphones: SheetHeadphones | null;
}

/**
 * The styles a drawing carries with it when it leaves the page's style sheets. `display` keeps
 * hidden the parts of a creature that are only shown in another mood, such as its shut eyes.
 */
const carriedStyles = [
  "display",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "filter",
  "stop-color",
  "stop-opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-variant-numeric",
  "text-anchor",
] as const;

/**
 * The drawing as SVG text that stands on its own: every element carries the colours and line
 * widths the page's style sheets gave it.
 */
function standaloneDrawing(
  section: SVGElement,
  view: Window & typeof globalThis,
  width: number,
  height: number,
): string {
  // The light is drawn where it ends, even if it was still spreading on the page.
  section.setAttribute("data-entering", "false");
  const copy = section.cloneNode(true) as SVGElement;
  const originals = [section, ...section.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  originals.forEach((original, index) => {
    const twin = copies[index];
    if (!(twin instanceof view.SVGElement)) {
      return;
    }
    const computed = view.getComputedStyle(original);
    for (const property of carriedStyles) {
      twin.style.setProperty(property, computed.getPropertyValue(property));
    }
    twin.removeAttribute("class");
  });
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  copy.style.removeProperty("opacity");
  return new view.XMLSerializer().serializeToString(copy);
}

function loadImage(
  view: Window & typeof globalThis,
  address: string,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new view.Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error("The drawing could not be read as an image."));
    };
    image.src = address;
  });
}

/**
 * Saves the picture as a PNG file through the browser's own download: the drawing of the house,
 * the caption, what the house says about silence, each floor in words and the limits statement
 * in full. Nothing is sent anywhere. Resolves to false if the browser could not make the image.
 */
export async function savePictureAsImage(
  request: PictureToSave,
): Promise<boolean> {
  const { doc, view, section, picture, headphones } = request;
  try {
    const canvas = doc.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) {
      return false;
    }
    const rootStyle = view.getComputedStyle(doc.documentElement);
    const fontFamily = rootStyle.fontFamily;
    const fontOf = (sizePx: number, italic: boolean): string =>
      `${italic ? "italic " : ""}${String(sizePx)}px ${fontFamily}`;
    const colour = (name: string, fallback: string): string => {
      const value = rootStyle.getPropertyValue(name).trim();
      return value === "" ? fallback : value;
    };
    const tones: Readonly<Record<SheetTone, string>> = {
      moonlight: colour("--color-moonlight", "#e6e1d6"),
      graphite: colour("--color-graphite", "#8a93a6"),
      lamp: colour("--color-lamp", "#f3b562"),
    };

    const sheet = layoutPictureSheet(
      picture,
      headphones,
      (text, sizePx, italic) => {
        context.font = fontOf(sizePx, italic);
        return context.measureText(text).width;
      },
    );
    canvas.width = sheet.width;
    canvas.height = sheet.height;

    context.fillStyle = colour("--color-night", "#080b12");
    context.fillRect(0, 0, sheet.width, sheet.height);

    const drawingText = standaloneDrawing(
      section,
      view,
      sheet.drawing.width,
      sheet.drawing.height,
    );
    const image = await loadImage(
      view,
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawingText)}`,
    );
    context.drawImage(
      image,
      sheet.drawing.x,
      sheet.drawing.y,
      sheet.drawing.width,
      sheet.drawing.height,
    );

    context.strokeStyle = colour("--color-graphite-faint", "#3d4555");
    context.lineWidth = 1.5;
    for (const rule of sheet.rules) {
      context.beginPath();
      context.moveTo(rule.x1, rule.y1);
      context.lineTo(rule.x2, rule.y2);
      context.stroke();
    }
    context.textBaseline = "alphabetic";
    for (const line of sheet.lines) {
      context.font = fontOf(line.sizePx, line.italic);
      context.fillStyle = tones[line.tone];
      context.fillText(line.text, line.x, line.y);
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (blob === null) {
      return false;
    }
    const address = view.URL.createObjectURL(blob);
    const link = doc.createElement("a");
    link.href = address;
    link.download = `${picture.imageFileBaseName}.png`;
    link.hidden = true;
    doc.body.append(link);
    link.click();
    link.remove();
    // The browser has taken the file by now. Let go of it a little later, to be sure.
    view.setTimeout(() => {
      view.URL.revokeObjectURL(address);
    }, 10_000);
    return true;
  } catch {
    return false;
  }
}
