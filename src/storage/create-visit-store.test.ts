import { describe, expect, it } from "vitest";
import { createVisitStore } from "./create-visit-store";
import { entryChecksum } from "./entry-checksum";
import type { FakeStorageAreaOptions } from "./fake-storage-area";
import { createFakeStorageArea } from "./fake-storage-area";
import { savedVisitsKey } from "./saved-visits-key";
import type { StoreEntryFields } from "./visit-store-types";

const key = "did-you-hear-that:saved-visits:v1";

function fields(
  savedVisitId: string,
  change: Partial<StoreEntryFields> = {},
): StoreEntryFields {
  return {
    savedVisitId,
    savedAtEpochMs: 1795180800000,
    savedOnLocalDate: "2026-11-20",
    visitType: "quick",
    headphoneName: "White earbuds",
    payloadJson: `{"payloadOf":"${savedVisitId}"}`,
    ...change,
  };
}

/** A stored entry as the store writes it. */
function entry(entryFields: StoreEntryFields): Record<string, unknown> {
  return { ...entryFields, checksum: entryChecksum(entryFields) };
}

function valueText(visits: readonly unknown[], extra: object = {}): string {
  return JSON.stringify({ formatVersion: 1, visits, ...extra });
}

/** A fake area holding this text under the key, and a store over it. */
function storeOver(text: string | null, options: FakeStorageAreaOptions = {}) {
  const area = createFakeStorageArea({
    ...options,
    initialItems: {
      ...(text === null ? {} : { [key]: text }),
      ...options.initialItems,
    },
  });
  return { area, store: createVisitStore(() => area) };
}

function storedValue(text: string | undefined): unknown {
  return text === undefined ? undefined : JSON.parse(text);
}

const first = fields("0000000a");
const second = fields("0000000b", { visitType: "full", headphoneName: null });
const third = fields("0000000c", { savedOnLocalDate: "2026-11-21" });

describe("createVisitStore", () => {
  describe("the key and the value", () => {
    it("uses the one key of the design", () => {
      expect(savedVisitsKey).toBe(key);
    });

    it("writes the format version and the entries in save order, each with its checksum", () => {
      const { area, store } = storeOver(null);
      expect(store.append(first)).toEqual({ ok: true });
      expect(store.append(second)).toEqual({ ok: true });
      expect(Object.keys(area.items())).toEqual([key]);
      expect(storedValue(area.items()[key])).toEqual({
        formatVersion: 1,
        visits: [entry(first), entry(second)],
      });
      expect(Object.keys(entry(first))).toEqual([
        "savedVisitId",
        "savedAtEpochMs",
        "savedOnLocalDate",
        "visitType",
        "headphoneName",
        "payloadJson",
        "checksum",
      ]);
    });

    it("reads back what it wrote, in save order, with the payload as the same text", () => {
      const { store } = storeOver(null);
      store.append(first);
      store.append(second);
      store.append(third);
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first, second, third],
        unreadableCount: 0,
      });
    });

    it("gives frozen results", () => {
      const { store } = storeOver(valueText([entry(first)]));
      const read = store.read();
      expect(Object.isFrozen(read)).toBe(true);
      if (read.status === "ready") {
        expect(Object.isFrozen(read.entries)).toBe(true);
        expect(Object.isFrozen(read.entries[0])).toBe(true);
      }
      expect(Object.isFrozen(store.append(second))).toBe(true);
    });

    it("orders entries by saving, never by their wall times", () => {
      const later = fields("0000000d", { savedAtEpochMs: 2000000000000 });
      const earlier = fields("0000000e", { savedAtEpochMs: 1000 });
      const { store } = storeOver(null);
      store.append(later);
      store.append(earlier);
      const read = store.read();
      expect(read.status === "ready" && read.entries).toEqual([later, earlier]);
    });

    it("reads and writes no key other than its own, and leaves other keys alone", () => {
      const { area, store } = storeOver(null, {
        initialItems: { other: "x", [`${key}x`]: "y" },
      });
      store.read();
      store.append(first);
      store.append(second);
      store.changeName(first.savedVisitId, "New");
      store.remove(first.savedVisitId);
      store.remove("ffffffff");
      store.removeAll();
      store.removeAll();
      expect(area.calls.every((call) => call.key === key)).toBe(true);
      expect(area.items()).toEqual({ other: "x", [`${key}x`]: "y" });
    });

    it("reads the value again at every call, so it acts on what is stored now", () => {
      const { area, store } = storeOver(null);
      store.append(first);
      area.setItem(key, valueText([entry(second)]));
      store.append(third);
      expect(storedValue(area.items()[key])).toEqual({
        formatVersion: 1,
        visits: [entry(second), entry(third)],
      });
    });

    it("writes the whole new value with one setItem per change", () => {
      const { area, store } = storeOver(valueText([entry(first)]));
      store.append(second);
      store.changeName(second.savedVisitId, "Name");
      store.remove(first.savedVisitId);
      const writes = area.calls.filter((call) => call.method !== "getItem");
      expect(writes.map((call) => call.method)).toEqual([
        "setItem",
        "setItem",
        "setItem",
      ]);
      expect(
        area.calls.map((call) => call.method).filter((m) => m === "getItem"),
      ).toHaveLength(3);
    });
  });

  describe("the failure table", () => {
    const getters: readonly [string, () => never | null | undefined][] = [
      [
        "the getter throws",
        () => {
          throw new DOMException("blocked", "SecurityError");
        },
      ],
      ["the getter gives null", () => null],
      ["the getter gives undefined", () => undefined],
    ];

    it.each(getters)("%s: every method gives unavailable", (_label, get) => {
      const store = createVisitStore(get);
      expect(store.read()).toEqual({ status: "unavailable" });
      expect(store.append(first)).toEqual({
        ok: false,
        reason: "unavailable",
      });
      expect(store.changeName(first.savedVisitId, null)).toEqual({
        ok: false,
        reason: "unavailable",
      });
      expect(store.remove(first.savedVisitId)).toEqual({
        ok: false,
        reason: "unavailable",
      });
      expect(store.removeAll()).toEqual({ ok: false, reason: "unavailable" });
    });

    it("getItem throws: every method gives unavailable and nothing is written", () => {
      const { area, store } = storeOver(valueText([entry(first)]), {
        getItemThrows: true,
      });
      expect(store.read()).toEqual({ status: "unavailable" });
      for (const outcome of [
        store.append(second),
        store.changeName(first.savedVisitId, null),
        store.remove(first.savedVisitId),
        store.removeAll(),
      ]) {
        expect(outcome).toEqual({ ok: false, reason: "unavailable" });
      }
      expect(area.calls.every((call) => call.method === "getItem")).toBe(true);
    });

    it("nothing under the key: read is ready and empty, append writes, the others are notFound, removeAll is ok", () => {
      const { area, store } = storeOver(null);
      expect(store.read()).toEqual({
        status: "ready",
        entries: [],
        unreadableCount: 0,
      });
      expect(store.changeName(first.savedVisitId, null)).toEqual({
        ok: false,
        reason: "notFound",
      });
      expect(store.remove(first.savedVisitId)).toEqual({
        ok: false,
        reason: "notFound",
      });
      expect(store.removeAll()).toEqual({ ok: true });
      expect(area.calls.every((call) => call.method === "getItem")).toBe(true);
      expect(store.append(first)).toEqual({ ok: true });
      expect(area.items()[key]).toBe(valueText([entry(first)]));
    });

    const unreadableValues: readonly [string, string][] = [
      ["not JSON", "{not json"],
      ["cut off", valueText([entry(first)]).slice(0, 40)],
      ["JSON null", "null"],
      ["a JSON array", "[]"],
      ["a JSON string", '"text"'],
      ["a JSON number", "1"],
      ["format version 2", JSON.stringify({ formatVersion: 2, visits: [] })],
      [
        "format version as text",
        JSON.stringify({ formatVersion: "1", visits: [] }),
      ],
      ["no format version", JSON.stringify({ visits: [] })],
      ["no visits", JSON.stringify({ formatVersion: 1 })],
      [
        "visits not a list",
        JSON.stringify({ formatVersion: 1, visits: { 0: entry(first) } }),
      ],
    ];

    it.each(unreadableValues)(
      "an unreadable value (%s): read is unreadable, single writes are unreadable and write nothing, removeAll removes the key",
      (_label, text) => {
        const { area, store } = storeOver(text, {
          initialItems: { other: "x" },
        });
        expect(store.read()).toEqual({ status: "unreadable" });
        for (const outcome of [
          store.append(second),
          store.changeName(first.savedVisitId, null),
          store.remove(first.savedVisitId),
        ]) {
          expect(outcome).toEqual({ ok: false, reason: "unreadable" });
        }
        expect(area.items()).toEqual({ [key]: text, other: "x" });
        expect(store.removeAll()).toEqual({ ok: true });
        expect(area.items()).toEqual({ other: "x" });
      },
    );

    it("a value with unreadable entries: read is ready with the readable ones and the count; writes keep the unreadable ones", () => {
      const broken = { ...entry(second), checksum: "00000000" };
      const { area, store } = storeOver(
        valueText([entry(first), broken, "text"]),
      );
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first],
        unreadableCount: 2,
      });
      expect(store.append(third)).toEqual({ ok: true });
      expect(storedValue(area.items()[key])).toEqual({
        formatVersion: 1,
        visits: [entry(first), broken, "text", entry(third)],
      });
      expect(store.removeAll()).toEqual({ ok: true });
      expect(area.items()).toEqual({});
    });

    it("setItem throws QuotaExceededError: full, and the old value stays", () => {
      const text = valueText([entry(first)]);
      const { area, store } = storeOver(text, {
        maxCharacterCount: key.length + text.length,
      });
      expect(store.append(second)).toEqual({ ok: false, reason: "full" });
      expect(
        store.changeName(first.savedVisitId, "A much longer name than before"),
      ).toEqual({ ok: false, reason: "full" });
      expect(area.items()).toEqual({ [key]: text });
    });

    it("setItem throws anything else: refused, and the old value stays", () => {
      const text = valueText([entry(first), entry(second)]);
      const { area, store } = storeOver(text, { setItemThrows: true });
      expect(store.append(third)).toEqual({ ok: false, reason: "refused" });
      expect(store.changeName(first.savedVisitId, "New")).toEqual({
        ok: false,
        reason: "refused",
      });
      expect(store.remove(first.savedVisitId)).toEqual({
        ok: false,
        reason: "refused",
      });
      expect(area.items()).toEqual({ [key]: text });
    });

    it("removeItem throws: refused for removeAll and for removing the last entry, and the old value stays", () => {
      const text = valueText([entry(first)]);
      const { area, store } = storeOver(text, { removeItemThrows: true });
      expect(store.remove(first.savedVisitId)).toEqual({
        ok: false,
        reason: "refused",
      });
      expect(store.removeAll()).toEqual({ ok: false, reason: "refused" });
      expect(area.items()).toEqual({ [key]: text });
    });

    it("never throws for a value that throws nothing but holds strange JSON", () => {
      for (const text of [
        "",
        " ",
        "{}",
        '{"__proto__":{"formatVersion":1}}',
        '{"formatVersion":1,"visits":[null,1,[],{"__proto__":{}}]}',
      ]) {
        const { store } = storeOver(text);
        expect(() => store.read()).not.toThrow();
        expect(() => store.append(first)).not.toThrow();
        expect(() => store.changeName(first.savedVisitId, null)).not.toThrow();
        expect(() => store.remove(first.savedVisitId)).not.toThrow();
        expect(() => store.removeAll()).not.toThrow();
      }
    });
  });

  describe("what storage checks", () => {
    const good = entry(first);

    const unreadableEntries: readonly [string, unknown][] = [
      ["null", null],
      ["a string", "entry"],
      ["a list", [good]],
      ["no id", { ...good, savedVisitId: undefined }],
      ["an id of seven digits", { ...good, savedVisitId: "0000000" }],
      ["an id of nine digits", { ...good, savedVisitId: "000000000" }],
      ["an id in capitals", { ...good, savedVisitId: "0000000A" }],
      ["an id that is not hexadecimal", { ...good, savedVisitId: "0000000g" }],
      ["an id that is a number", { ...good, savedVisitId: 10 }],
      ["no wall time", { ...good, savedAtEpochMs: undefined }],
      ["a wall time as text", { ...good, savedAtEpochMs: "1795180800000" }],
      ["a negative wall time", { ...good, savedAtEpochMs: -1 }],
      [
        "a wall time of null (from Infinity)",
        { ...good, savedAtEpochMs: null },
      ],
      ["no date", { ...good, savedOnLocalDate: undefined }],
      ["a date of 30 February", { ...good, savedOnLocalDate: "2026-02-30" }],
      [
        "29 February of a year that is not a leap year",
        { ...good, savedOnLocalDate: "2100-02-29" },
      ],
      ["month 13", { ...good, savedOnLocalDate: "2026-13-01" }],
      ["month 0", { ...good, savedOnLocalDate: "2026-00-10" }],
      ["day 0", { ...good, savedOnLocalDate: "2026-01-00" }],
      ["a date without padding", { ...good, savedOnLocalDate: "2026-1-5" }],
      ["a date with a time", { ...good, savedOnLocalDate: "2026-11-20T00:00" }],
      ["no visit type", { ...good, visitType: undefined }],
      ["another visit type", { ...good, visitType: "medium" }],
      ["a visit type in capitals", { ...good, visitType: "Quick" }],
      ["no headphone name", { ...good, headphoneName: undefined }],
      ["a headphone name that is a number", { ...good, headphoneName: 5 }],
      ["no payload", { ...good, payloadJson: undefined }],
      ["a payload that is an object", { ...good, payloadJson: {} }],
      ["no checksum", { ...good, checksum: undefined }],
      ["a checksum that does not match", { ...good, checksum: "00000000" }],
      [
        "a checksum in capitals",
        { ...good, checksum: String(good.checksum).toUpperCase() },
      ],
      [
        "a field changed without its checksum",
        { ...good, headphoneName: "Other" },
      ],
    ];

    it.each(unreadableEntries)(
      "counts an entry with %s as unreadable, and keeps it",
      (_label, broken) => {
        const { area, store } = storeOver(valueText([broken, entry(second)]));
        expect(store.read()).toEqual({
          status: "ready",
          entries: [second],
          unreadableCount: 1,
        });
        store.changeName(second.savedVisitId, "Renamed");
        const written = storedValue(area.items()[key]) as {
          visits: unknown[];
        };
        expect(written.visits[0]).toEqual(
          JSON.parse(JSON.stringify([broken]))[0],
        );
      },
    );

    it("reads the first of two entries with the same id and counts the later one as unreadable", () => {
      const twin = fields(first.savedVisitId, { headphoneName: "Twin" });
      const { store } = storeOver(valueText([entry(first), entry(twin)]));
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first],
        unreadableCount: 1,
      });
    });

    it("reads an entry whose earlier twin is unreadable", () => {
      const twin = { ...entry(first), checksum: "00000000" };
      const { store } = storeOver(valueText([twin, entry(first)]));
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first],
        unreadableCount: 1,
      });
    });

    it("reads a null name, a name of any text, a wall time of 0 and 29 February of a leap year", () => {
      const odd = [
        fields("00000001", { headphoneName: null }),
        fields("00000002", { headphoneName: "" }),
        fields("00000003", { headphoneName: "Ünïcödé 🎧\n" }),
        fields("00000004", { savedAtEpochMs: 0 }),
        fields("00000005", { savedOnLocalDate: "2028-02-29" }),
        fields("00000006", { savedOnLocalDate: "2000-02-29" }),
        fields("00000007", { savedAtEpochMs: 1.5 }),
      ];
      const { store } = storeOver(valueText(odd.map(entry)));
      expect(store.read()).toEqual({
        status: "ready",
        entries: odd,
        unreadableCount: 0,
      });
    });

    it("ignores and keeps fields an entry has beyond its own", () => {
      const withExtra = { ...entry(first), note: { kept: [1, 2] } };
      const { area, store } = storeOver(valueText([withExtra, entry(second)]));
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first, second],
        unreadableCount: 0,
      });
      store.remove(second.savedVisitId);
      expect(storedValue(area.items()[key])).toEqual({
        formatVersion: 1,
        visits: [withExtra],
      });
    });

    it("refuses to append fields that break a rule of the format, as a bug of its caller", () => {
      const { area, store } = storeOver(null);
      expect(() => store.append(fields("XYZ"))).toThrow(RangeError);
      expect(() =>
        store.append(fields("00000001", { savedOnLocalDate: "2026-02-30" })),
      ).toThrow(RangeError);
      expect(area.calls).toEqual([]);
    });
  });

  describe("keeping what it does not change", () => {
    const unknownFields = { writtenBy: "a later page", list: [1, { a: null }] };
    const brokenEntry = { savedVisitId: "zz", whatever: [true] };
    const extraEntry = { ...entry(second), extra: "kept" };

    function holding() {
      return storeOver(
        valueText([entry(first), brokenEntry, extraEntry], unknownFields),
      );
    }

    function expectKept(
      text: string | undefined,
      visits: readonly unknown[],
    ): void {
      expect(storedValue(text)).toEqual({
        formatVersion: 1,
        visits,
        ...unknownFields,
      });
    }

    it("keeps every other entry and every unknown field when it appends", () => {
      const { area, store } = holding();
      expect(store.append(third)).toEqual({ ok: true });
      expectKept(area.items()[key], [
        entry(first),
        brokenEntry,
        extraEntry,
        entry(third),
      ]);
    });

    it("keeps every other entry, the changed entry's own unknown fields and every unknown field when it changes a name", () => {
      const { area, store } = holding();
      expect(store.changeName(second.savedVisitId, "Big cans")).toEqual({
        ok: true,
      });
      const renamed = { ...second, headphoneName: "Big cans" };
      expectKept(area.items()[key], [
        entry(first),
        brokenEntry,
        { ...entry(renamed), extra: "kept" },
      ]);
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first, renamed],
        unreadableCount: 1,
      });
    });

    it("changes a name to null and back", () => {
      const { store } = storeOver(valueText([entry(first)]));
      store.changeName(first.savedVisitId, null);
      expect(store.read()).toEqual({
        status: "ready",
        entries: [{ ...first, headphoneName: null }],
        unreadableCount: 0,
      });
      store.changeName(first.savedVisitId, "White earbuds");
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first],
        unreadableCount: 0,
      });
    });

    it("keeps every other entry and every unknown field when it removes one", () => {
      const { area, store } = holding();
      expect(store.remove(first.savedVisitId)).toEqual({ ok: true });
      expectKept(area.items()[key], [brokenEntry, extraEntry]);
    });

    it("keeps the value when the last entry goes but unknown fields stay", () => {
      const { area, store } = storeOver(
        valueText([entry(first)], unknownFields),
      );
      expect(store.remove(first.savedVisitId)).toEqual({ ok: true });
      expectKept(area.items()[key], []);
    });

    it("keeps the value when the last readable entry goes but unreadable ones stay", () => {
      const { area, store } = storeOver(valueText([entry(first), brokenEntry]));
      expect(store.remove(first.savedVisitId)).toEqual({ ok: true });
      expect(storedValue(area.items()[key])).toEqual({
        formatVersion: 1,
        visits: [brokenEntry],
      });
    });
  });

  describe("removing", () => {
    it("removes the key when the last entry goes", () => {
      const { area, store } = storeOver(
        valueText([entry(first), entry(second)]),
      );
      expect(store.remove(second.savedVisitId)).toEqual({ ok: true });
      expect(store.remove(first.savedVisitId)).toEqual({ ok: true });
      expect(area.items()).toEqual({});
      expect(area.calls.at(-1)).toEqual({ method: "removeItem", key });
    });

    it("removes the key on removeAll, readable or not", () => {
      const { area, store } = storeOver(
        valueText([entry(first), { broken: true }], { more: 1 }),
      );
      expect(store.removeAll()).toEqual({ ok: true });
      expect(area.items()).toEqual({});
    });

    it("gives notFound for an id that is not stored, or stored only in an unreadable entry, and writes nothing", () => {
      const brokenFirst = { ...entry(third), checksum: "00000000" };
      const text = valueText([entry(first), brokenFirst]);
      const { area, store } = storeOver(text);
      for (const savedVisitId of [second.savedVisitId, third.savedVisitId]) {
        expect(store.remove(savedVisitId)).toEqual({
          ok: false,
          reason: "notFound",
        });
        expect(store.changeName(savedVisitId, "x")).toEqual({
          ok: false,
          reason: "notFound",
        });
      }
      expect(area.calls.every((call) => call.method === "getItem")).toBe(true);
      expect(area.items()).toEqual({ [key]: text });
    });
  });

  describe("changePayload (swapped-repeat Q5, decided by the owner on 2026-11-15)", () => {
    const newPayload =
      '{"payloadOf":"0000000b","swappedRepeats":[{"runNumber":1}]}';
    const unknownFields = { writtenBy: "a later page", list: [1, { a: null }] };
    const brokenEntry = { savedVisitId: "zz", whatever: [true] };
    const extraEntry = { ...entry(second), extra: "kept" };

    const getters: readonly [string, () => never | null | undefined][] = [
      [
        "the getter throws",
        () => {
          throw new DOMException("blocked", "SecurityError");
        },
      ],
      ["the getter gives null", () => null],
      ["the getter gives undefined", () => undefined],
    ];

    it.each(getters)("%s: unavailable", (_label, get) => {
      expect(
        createVisitStore(get).changePayload(first.savedVisitId, newPayload),
      ).toEqual({ ok: false, reason: "unavailable" });
    });

    it("getItem throws: unavailable, and nothing is written", () => {
      const { area, store } = storeOver(valueText([entry(first)]), {
        getItemThrows: true,
      });
      expect(store.changePayload(first.savedVisitId, newPayload)).toEqual({
        ok: false,
        reason: "unavailable",
      });
      expect(area.calls.every((call) => call.method === "getItem")).toBe(true);
    });

    it("nothing under the key: notFound, and nothing is written", () => {
      const { area, store } = storeOver(null);
      expect(store.changePayload(first.savedVisitId, newPayload)).toEqual({
        ok: false,
        reason: "notFound",
      });
      expect(area.calls.every((call) => call.method === "getItem")).toBe(true);
      expect(area.items()).toEqual({});
    });

    it.each([
      ["not JSON", "{not json"],
      ["JSON null", "null"],
      ["format version 2", JSON.stringify({ formatVersion: 2, visits: [] })],
      ["no visits", JSON.stringify({ formatVersion: 1 })],
    ])(
      "an unreadable value (%s): unreadable, and nothing is written",
      (_label, text) => {
        const { area, store } = storeOver(text, {
          initialItems: { other: "x" },
        });
        expect(store.changePayload(first.savedVisitId, newPayload)).toEqual({
          ok: false,
          reason: "unreadable",
        });
        expect(area.items()).toEqual({ [key]: text, other: "x" });
      },
    );

    it("gives the entry the new payload and a new valid checksum, and keeps its id, dates, visit type, name, place, own unknown fields, every other entry and every unknown field, with one setItem", () => {
      const { area, store } = storeOver(
        valueText(
          [entry(first), brokenEntry, extraEntry, entry(third)],
          unknownFields,
        ),
      );
      expect(store.changePayload(second.savedVisitId, newPayload)).toEqual({
        ok: true,
      });
      const changed = { ...second, payloadJson: newPayload };
      expect(storedValue(area.items()[key])).toEqual({
        formatVersion: 1,
        visits: [
          entry(first),
          brokenEntry,
          { ...entry(changed), extra: "kept" },
          entry(third),
        ],
        ...unknownFields,
      });
      const stored = (
        storedValue(area.items()[key]) as { visits: Record<string, unknown>[] }
      ).visits[2]!;
      expect(stored.checksum).toBe(entryChecksum(changed));
      expect(stored.checksum).not.toBe(entryChecksum(second));
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first, changed, third],
        unreadableCount: 1,
      });
      expect(
        area.calls.filter((call) => call.method === "setItem"),
      ).toHaveLength(1);
    });

    it("changes a payload and back", () => {
      const { store } = storeOver(valueText([entry(first)]));
      store.changePayload(first.savedVisitId, newPayload);
      expect(store.read()).toEqual({
        status: "ready",
        entries: [{ ...first, payloadJson: newPayload }],
        unreadableCount: 0,
      });
      store.changePayload(first.savedVisitId, first.payloadJson);
      expect(store.read()).toEqual({
        status: "ready",
        entries: [first],
        unreadableCount: 0,
      });
    });

    it("setItem throws QuotaExceededError: full, and the stored text stays as it was", () => {
      const text = valueText([entry(first)]);
      const { area, store } = storeOver(text, {
        maxCharacterCount: key.length + text.length,
      });
      expect(store.changePayload(first.savedVisitId, newPayload)).toEqual({
        ok: false,
        reason: "full",
      });
      expect(area.items()).toEqual({ [key]: text });
    });

    it("setItem throws anything else: refused, and the stored text stays as it was", () => {
      const text = valueText([entry(first), entry(second)]);
      const { area, store } = storeOver(text, { setItemThrows: true });
      expect(store.changePayload(first.savedVisitId, newPayload)).toEqual({
        ok: false,
        reason: "refused",
      });
      expect(area.items()).toEqual({ [key]: text });
    });

    it("gives notFound for an id that is not stored, or stored only in an unreadable entry, and writes nothing", () => {
      const brokenThird = { ...entry(third), checksum: "00000000" };
      const text = valueText([entry(first), brokenThird]);
      const { area, store } = storeOver(text);
      for (const savedVisitId of [second.savedVisitId, third.savedVisitId]) {
        expect(store.changePayload(savedVisitId, newPayload)).toEqual({
          ok: false,
          reason: "notFound",
        });
      }
      expect(area.calls.every((call) => call.method === "getItem")).toBe(true);
      expect(area.items()).toEqual({ [key]: text });
    });

    it("never throws for a value that throws nothing but holds strange JSON", () => {
      for (const text of [
        "",
        " ",
        "{}",
        '{"__proto__":{"formatVersion":1}}',
        '{"formatVersion":1,"visits":[null,1,[],{"__proto__":{}}]}',
      ]) {
        const { store } = storeOver(text);
        expect(() =>
          store.changePayload(first.savedVisitId, newPayload),
        ).not.toThrow();
      }
    });
  });

  describe("idTaken", () => {
    it("gives idTaken for an id already stored, readable or not, and writes nothing", () => {
      const brokenThird = { ...entry(third), checksum: "00000000" };
      const text = valueText([entry(first), brokenThird]);
      const { area, store } = storeOver(text);
      expect(
        store.append(fields(first.savedVisitId, { headphoneName: "x" })),
      ).toEqual({ ok: false, reason: "idTaken" });
      expect(store.append(third)).toEqual({ ok: false, reason: "idTaken" });
      expect(area.calls.every((call) => call.method === "getItem")).toBe(true);
      expect(area.items()).toEqual({ [key]: text });
    });
  });
});
