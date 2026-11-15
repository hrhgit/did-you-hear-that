/**
 * A predictor for the "the picture does not leak" property of the house interface. It is given
 * only what the screen did before an answer, as a list of small whole numbers, and tries to guess
 * something about the sound: whether there was one, which side it was on, how long the wait was.
 * If the screen is independent of the sound, it can do no better than always guessing the most
 * common answer.
 */

/** What the screen did before one answer, and the fact about the sound to be guessed from it. */
export interface LeakSample {
  /** Each feature is a small whole number, such as a count of screen events of one kind. */
  readonly features: readonly number[];
  readonly label: string;
}

export interface LeakVerdict {
  /** Share of the held-out samples the predictor guessed correctly. */
  readonly accuracy: number;
  /** Share it would get by always guessing the most common label of the training samples. */
  readonly chance: number;
  /** The accuracy above which the screen is judged to leak. */
  readonly limit: number;
  readonly heldOutCount: number;
  /** The features the predictor chose to guess from, by position. Empty for "none helped". */
  readonly chosenFeatures: readonly number[];
  readonly leaks: boolean;
}

/**
 * Standard deviations above chance at which the screen is judged to leak. With independent
 * screens the predictor passes this by luck about once in two thousand runs, and the property
 * tests run on fixed seeds, so a verdict changes only when the code does.
 */
export const leakLimitDeviations = 3.3;

/**
 * Keeps as many samples of every label as the rarest label has, chosen with `random`, in their
 * old order. Most trials have a sound, so a screen that only confirmed "there is a sound" some of
 * the time would change no guess and would go unnoticed. With the labels in equal numbers, any
 * link between the screen and the label lifts the predictor above chance.
 */
export function balanceLabels(
  samples: readonly LeakSample[],
  random: { next(): number },
): LeakSample[] {
  const byLabel = new Map<string, number[]>();
  samples.forEach((sample, index) => {
    const indexes = byLabel.get(sample.label) ?? [];
    indexes.push(index);
    byLabel.set(sample.label, indexes);
  });
  const fewest = Math.min(
    ...[...byLabel.values()].map((indexes) => indexes.length),
  );
  const kept = new Set<number>();
  for (const label of [...byLabel.keys()].sort()) {
    const indexes = byLabel.get(label) ?? [];
    // A partial shuffle: the first `fewest` places get a random choice of the rest.
    for (let place = 0; place < fewest; place += 1) {
      const from = place + Math.floor(random.next() * (indexes.length - place));
      const chosen = indexes[from] ?? 0;
      indexes[from] = indexes[place] ?? 0;
      indexes[place] = chosen;
      kept.add(chosen);
    }
  }
  return samples.filter((_, index) => kept.has(index));
}

type Table = Map<string, Map<string, number>>;

function mostCommon(counts: Map<string, number>): string {
  let best = "";
  let bestCount = -1;
  for (const [label, count] of [...counts].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

function keyOf(sample: LeakSample, positions: readonly number[]): string {
  return positions.map((position) => sample.features[position] ?? 0).join(",");
}

function buildTable(
  samples: readonly LeakSample[],
  positions: readonly number[],
): Table {
  const table: Table = new Map();
  for (const sample of samples) {
    const key = keyOf(sample, positions);
    const counts = table.get(key) ?? new Map<string, number>();
    counts.set(sample.label, (counts.get(sample.label) ?? 0) + 1);
    table.set(key, counts);
  }
  return table;
}

function accuracyOf(
  samples: readonly LeakSample[],
  positions: readonly number[],
  table: Table,
  fallback: string,
): number {
  let correct = 0;
  for (const sample of samples) {
    const counts = table.get(keyOf(sample, positions));
    const guess = counts === undefined ? fallback : mostCommon(counts);
    if (guess === sample.label) {
      correct += 1;
    }
  }
  return samples.length === 0 ? 0 : correct / samples.length;
}

/**
 * Trains on `training` and judges on `heldOut`. The predictor tries every single feature and
 * every pair of features as a lookup table from what the screen did to the most common label,
 * keeps the table that fits the training samples best, and is then judged on samples it has not
 * seen. Both lists must be non-empty and every sample must have the same number of features.
 */
export function guessFromScreen(
  training: readonly LeakSample[],
  heldOut: readonly LeakSample[],
): LeakVerdict {
  const featureCount = training[0]?.features.length;
  if (featureCount === undefined || heldOut.length === 0) {
    throw new RangeError("The predictor needs training and held-out samples.");
  }
  for (const sample of [...training, ...heldOut]) {
    if (sample.features.length !== featureCount) {
      throw new RangeError(
        `Every sample must have ${String(featureCount)} features, but one has ${String(sample.features.length)}.`,
      );
    }
  }

  const labelCounts = new Map<string, number>();
  for (const sample of training) {
    labelCounts.set(sample.label, (labelCounts.get(sample.label) ?? 0) + 1);
  }
  const fallback = mostCommon(labelCounts);

  const candidates: number[][] = [[]];
  for (let first = 0; first < featureCount; first += 1) {
    candidates.push([first]);
    for (let second = first + 1; second < featureCount; second += 1) {
      candidates.push([first, second]);
    }
  }

  let chosen: number[] = [];
  let chosenTable: Table = new Map();
  let chosenFit = -1;
  for (const positions of candidates) {
    const table = buildTable(training, positions);
    const fit = accuracyOf(training, positions, table, fallback);
    // A larger table always fits its own training samples at least as well, so a table must fit
    // clearly better than the one before it to be chosen.
    if (fit > chosenFit + 1e-9) {
      chosen = positions;
      chosenTable = table;
      chosenFit = fit;
    }
  }

  const accuracy = accuracyOf(heldOut, chosen, chosenTable, fallback);
  const chance = accuracyOf(heldOut, [], new Map(), fallback);
  const limit = Math.min(
    1,
    chance +
      leakLimitDeviations * Math.sqrt((chance * (1 - chance)) / heldOut.length),
  );
  return {
    accuracy,
    chance,
    limit,
    heldOutCount: heldOut.length,
    chosenFeatures: chosen,
    leaks: accuracy > limit,
  };
}
