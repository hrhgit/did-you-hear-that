/**
 * A painted picture the canvas draws (2026-11-24), loaded once for the page. Until it has loaded,
 * and on a page that cannot load it, whoever draws it paints by code instead.
 */
export interface PaintedArt {
  /** The picture once it has loaded, or null before then. */
  readonly image: () => HTMLImageElement | null;
  /** Loads the picture once. Resolves to null if it cannot be loaded. */
  readonly load: (doc: Document) => Promise<HTMLImageElement | null>;
}

export function paintedArt(url: string): PaintedArt {
  let loading: Promise<HTMLImageElement | null> | null = null;
  let loaded: HTMLImageElement | null = null;
  return {
    image: () => loaded,
    load(doc) {
      loading ??= new Promise((resolve) => {
        const image = doc.createElement("img");
        image.decoding = "async";
        image.addEventListener("load", () => {
          loaded = image;
          resolve(image);
        });
        image.addEventListener("error", () => {
          resolve(null);
        });
        image.src = url;
      });
      return loading;
    },
  };
}
