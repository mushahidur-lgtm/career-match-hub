import { afterEach, describe, expect, it, vi } from "vitest";
import { makeRoom, markFailed, markSaved, registerSpaceReleaser, retryFailedSaves } from "@/lib/storage-health";

afterEach(() => {
  markSaved("a");
  markSaved("b");
  vi.useRealTimers();
});

describe("making room when storage is full", () => {
  it("asks what can spare space, and reports whether anything was freed", () => {
    const stop = registerSpaceReleaser(() => false);
    expect(makeRoom()).toBe(false);
    const stop2 = registerSpaceReleaser(() => true);
    vi.useFakeTimers();
    expect(makeRoom()).toBe(true);
    stop();
    stop2();
    expect(makeRoom()).toBe(false);
  });

  it("asks every releaser, not just the first that frees something", () => {
    const calls: string[] = [];
    const s1 = registerSpaceReleaser(() => (calls.push("one"), true));
    const s2 = registerSpaceReleaser(() => (calls.push("two"), true));
    vi.useFakeTimers();
    makeRoom();
    expect(calls).toEqual(["one", "two"]);
    s1();
    s2();
  });

  it("retries failed saves shortly after space is freed, and not when nothing was freed", () => {
    vi.useFakeTimers();
    markFailed("a");
    const stop = registerSpaceReleaser(() => true);
    const spy = vi.spyOn(globalThis, "setTimeout");
    makeRoom();
    expect(spy).toHaveBeenCalledWith(retryFailedSaves, 150);
    stop();
    spy.mockClear();
    makeRoom();
    expect(spy).not.toHaveBeenCalled();
  });
});
