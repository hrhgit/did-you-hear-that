import titleUrl from "./art/title.webp";

/**
 * The name of the house as painted lettering, for the front door. It is a picture only: the
 * heading that holds it also holds the words, for a visitor who cannot see it.
 */
export function titleLettering(doc: Document): HTMLImageElement {
  const image = doc.createElement("img");
  image.className = "visit-front-lettering";
  image.src = titleUrl;
  image.alt = "";
  image.decoding = "async";
  return image;
}
