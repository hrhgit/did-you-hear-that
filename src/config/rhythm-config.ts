/**
 * How one turn of the room is judged (the rhythm game, 2026-11-18). `rhythm-score.ts` in
 * `src/session` says what each means; the type lives here so that the copy and the room may name
 * it.
 */
export type RhythmJudgement =
  "perfect" | "great" | "good" | "miss" | "wrong" | "trick" | "steady";

/**
 * The rhythm game of the one room (decided by the owner on 2026-11-18, replacing the lantern). A
 * steady beat plays in both ears while the room counts. Every turn of the search lands on an
 * off-beat, half way between two beats, so the sound of a creature always comes between the
 * beats and never on top of one. The creatures creep towards Jack, the jack-o'-lantern in the
 * middle of the room, to snuff his candle and take his candy. A catch kicks the creature away; a
 * sound that goes by, or is answered on the other side, lets it reach Jack and burn down his
 * flame. Every field name ends in its unit.
 *
 * The adaptive search treats Good as weak evidence and Great and Perfect as clear catches.
 */
export interface RhythmConfig {
  /** Beats per minute of the room's beat. */
  readonly beatsPerMinute: number;
  /** Beats in one bar. The first beat of a bar is a little stronger. */
  readonly beatsPerBar: number;
  /**
   * The beat's level, relative to the calibration anchor. Low and soft: it sits under the music
   * the visitor set as comfortable, and well clear of the off-beats where the sounds come.
   */
  readonly beatLevelDb: number;
  /**
   * How far under `beatLevelDb` the beat sinks while a sound plays (a creature's, or the chime
   * after a catch), so that the sound has the room to itself. The beat comes back after it.
   */
  readonly beatDuckDb: number;
  /** How many beats ahead of its off-beat a turn is shown creeping in, on both sides alike. */
  readonly cueLeadBeats: number;
  /**
   * How long before its off-beat, beyond the output stage's own scheduling lead, a turn is handed
   * to the output stage, so that the page's timer, which may run late, still meets the off-beat.
   */
  readonly presentAheadMs: number;
  /** A catch answered within this long of the sound's start is Perfect. */
  readonly perfectWithinMs: number;
  /** Within this long, Great. Later in the window, Good. */
  readonly greatWithinMs: number;
  /** The points of each judgement before the combo bonus. */
  readonly points: Readonly<
    Record<"perfect" | "great" | "good" | "steady", number>
  >;
  /** The combo bonus grows by this fraction for every `comboStepCount` in the combo. */
  readonly comboBonusStepFraction: number;
  readonly comboStepCount: number;
  /** The combo bonus never grows beyond this fraction. */
  readonly comboBonusMaxFraction: number;
  /** Jack's full flame. */
  readonly flameMax: number;
  /** What a creature that reaches Jack burns off: a sound that went by or came on the other side. */
  readonly flameLostToCreature: number;
  /** What a kick at a turn with no creature costs. */
  readonly flameLostToTrick: number;
  /** What a catch gives back, Perfect or not. */
  readonly flameGainedByCatch: number;
  /** A flame that goes out is lit again at this, and the night goes on. */
  readonly flameRelitAt: number;
}

export const rhythmConfig: RhythmConfig = Object.freeze({
  // 100 BPM: a beat every 600 ms, an off-beat 300 ms after each beat. The beat's own thump has
  // died away long before the off-beat, so it does not cover the creature's sound.
  beatsPerMinute: 100,
  beatsPerBar: 4,
  beatLevelDb: -9,
  beatDuckDb: -15,
  cueLeadBeats: 2,
  presentAheadMs: 80,
  perfectWithinMs: 600,
  greatWithinMs: 1000,
  points: Object.freeze({ perfect: 300, great: 200, good: 100, steady: 50 }),
  comboBonusStepFraction: 0.1,
  comboStepCount: 10,
  comboBonusMaxFraction: 1,
  flameMax: 100,
  // The search misses about a third of its sounds by design, near the visitor's threshold, so a
  // catch gives back almost as much as a creature burns off, and the flame swings without dying.
  flameLostToCreature: 10,
  flameLostToTrick: 6,
  flameGainedByCatch: 6,
  flameRelitAt: 50,
});

/** The length of one beat in milliseconds. */
export function beatMsOf(config: Pick<RhythmConfig, "beatsPerMinute">): number {
  return 60000 / config.beatsPerMinute;
}
