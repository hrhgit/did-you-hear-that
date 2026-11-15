const svgNamespace = "http://www.w3.org/2000/svg";

/** Attribute values an SVG element is created with. Numbers are written as they are. */
export type SvgAttributes = Readonly<Record<string, string | number>>;

/** Creates one SVG element with its attributes and children. */
export function svgElement(
  doc: Document,
  tag: string,
  attributes: SvgAttributes = {},
  children: readonly Node[] = [],
): SVGElement {
  const element = doc.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  element.append(...children);
  return element;
}
