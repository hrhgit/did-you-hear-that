/**
 * The two addresses at which `vite preview` serves the same `dist/`: the server root, and the
 * repository path that GitHub Pages uses. `playwright.config.ts` starts one server for each, and
 * the end-to-end tests load the page from each.
 */
export const previewServers: ReadonlyArray<{
  readonly name: string;
  readonly port: number;
  readonly basePath: string;
}> = Object.freeze([
  Object.freeze({ name: "server root", port: 4173, basePath: "/" }),
  Object.freeze({
    name: "repository path",
    port: 4174,
    basePath: "/did-you-hear-that/",
  }),
]);
