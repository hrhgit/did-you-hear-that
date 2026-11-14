import { houseNotOpenLine } from "../copy/house-not-open-line";
import { siteTitle } from "../copy/site-title";

/**
 * Fills the page with the placeholder: the site title as the document title and the only
 * heading, and one line saying the house is not open yet. Text is set with `textContent`.
 * Throws if the document has no `<main>` element.
 */
export function renderPlaceholder(doc: Document): void {
  const main = doc.querySelector("main");
  if (main === null) {
    throw new Error("The page has no <main> element to render into.");
  }

  doc.title = siteTitle;

  const heading = doc.createElement("h1");
  heading.textContent = siteTitle;

  const line = doc.createElement("p");
  line.textContent = houseNotOpenLine;

  main.replaceChildren(heading, line);
}
