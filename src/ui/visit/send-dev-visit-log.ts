import type {
  VisitArchive,
  VisitToSave,
} from "../../session/result-page-types";

/** The dev server's path that writes visit logs into `logs/visits/` (see `vite.config.ts`). */
const devVisitLogPath = "/__dev-visit-log";

/**
 * Development only: hands every finished visit, and once on load every visit saved in this
 * browser, to the dev server, which writes them under `logs/visits/` for offline analysis. Does
 * nothing in a built page, and never lets a failed send reach the visitor.
 */
export function createDevVisitLog(
  view: Window & typeof globalThis,
  archive: VisitArchive,
): { finished(visit: VisitToSave): void } {
  if (!import.meta.env.DEV) {
    return { finished: () => undefined };
  }
  const send = (kind: "finished" | "saved", body: unknown): void => {
    void view
      .fetch(`${devVisitLogPath}?kind=${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      .catch(() => undefined);
  };
  const saved = archive.list().visits.map((listing) => listing.visit);
  if (saved.length > 0) {
    send("saved", saved);
  }
  // The result snapshot is shown again on every change while the visit stays on it. A swapped
  // repeat adds to it later, so the visit is sent again when its repeats change.
  const sentRepeats = new WeakMap<object, number>();
  return {
    finished(visit) {
      const repeatCount = visit.swappedRepeats?.length ?? 0;
      if (sentRepeats.get(visit.visitLog) === repeatCount) return;
      sentRepeats.set(visit.visitLog, repeatCount);
      send("finished", {
        visitLog: visit.visitLog,
        summary: visit.summary,
        swappedRepeats: visit.swappedRepeats ?? [],
      });
    },
  };
}
