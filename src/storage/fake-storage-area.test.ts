import { describe, expect, it } from "vitest";
import { createFakeStorageArea } from "./fake-storage-area";

function thrown(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("createFakeStorageArea", () => {
  it("starts empty and keeps, gives and removes values", () => {
    const area = createFakeStorageArea();
    expect(area.getItem("a")).toBeNull();
    area.setItem("a", "1");
    area.setItem("b", "2");
    area.setItem("a", "3");
    expect(area.getItem("a")).toBe("3");
    area.removeItem("b");
    area.removeItem("missing");
    expect(area.items()).toEqual({ a: "3" });
  });

  it("starts with the items it is given, as a copy", () => {
    const initialItems = { x: "one", y: "two" };
    const area = createFakeStorageArea({ initialItems });
    area.setItem("x", "changed");
    expect(area.getItem("y")).toBe("two");
    expect(initialItems.x).toBe("one");
  });

  it("gives a frozen copy of what it holds", () => {
    const area = createFakeStorageArea({ initialItems: { a: "1" } });
    const items = area.items();
    expect(Object.isFrozen(items)).toBe(true);
    area.setItem("a", "2");
    expect(items).toEqual({ a: "1" });
  });

  it("records every call in order, including those that throw", () => {
    const area = createFakeStorageArea({ setItemThrows: true });
    area.getItem("k");
    thrown(() => area.setItem("k", "v"));
    area.removeItem("k");
    expect(area.calls).toEqual([
      { method: "getItem", key: "k" },
      { method: "setItem", key: "k", value: "v" },
      { method: "removeItem", key: "k" },
    ]);
  });

  it("throws a SecurityError from getItem when asked to", () => {
    const area = createFakeStorageArea({
      initialItems: { k: "v" },
      getItemThrows: true,
    });
    const error = thrown(() => area.getItem("k"));
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("SecurityError");
  });

  it("throws a SecurityError from setItem when asked to, and keeps what it held", () => {
    const area = createFakeStorageArea({
      initialItems: { k: "v" },
      setItemThrows: true,
    });
    const error = thrown(() => area.setItem("k", "w"));
    expect((error as DOMException).name).toBe("SecurityError");
    expect(area.items()).toEqual({ k: "v" });
  });

  it("throws a SecurityError from removeItem when asked to, and keeps what it held", () => {
    const area = createFakeStorageArea({
      initialItems: { k: "v" },
      removeItemThrows: true,
    });
    const error = thrown(() => area.removeItem("k"));
    expect((error as DOMException).name).toBe("SecurityError");
    expect(area.items()).toEqual({ k: "v" });
  });

  it("throws a QuotaExceededError beyond its size in characters over keys and values, and keeps what it held", () => {
    const area = createFakeStorageArea({
      initialItems: { ab: "cd" },
      maxCharacterCount: 7,
    });
    area.setItem("e", "f");
    expect(area.items()).toEqual({ ab: "cd", e: "f" });
    area.setItem("e", "fg");
    expect(area.items()).toEqual({ ab: "cd", e: "fg" });
    const error = thrown(() => area.setItem("e", "fgh"));
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe("QuotaExceededError");
    expect(area.items()).toEqual({ ab: "cd", e: "fg" });
  });

  it("refuses every write with a size of 0", () => {
    const area = createFakeStorageArea({ maxCharacterCount: 0 });
    const error = thrown(() => area.setItem("k", ""));
    expect((error as DOMException).name).toBe("QuotaExceededError");
    expect(area.items()).toEqual({});
  });
});
