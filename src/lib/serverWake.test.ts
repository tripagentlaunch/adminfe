import { describe, expect, it } from "vitest";
import { ServerUnreachableError, backoffMs, fetchWithRetry, isNotReady, wakeMessage } from "./serverWake";

const res = (status: number) => ({ status, ok: status >= 200 && status < 300 }) as unknown as Response;
const noSleep = () => Promise.resolve();

describe("isNotReady / backoffMs", () => {
  it("treats gateway and busy answers as not ready, real answers as answers", () => {
    [502, 503, 504, 408, 429].forEach((s) => expect(isNotReady(s)).toBe(true));
    [200, 201, 401, 403, 404, 422, 500].forEach((s) => expect(isNotReady(s)).toBe(false));
  });
  it("backs off a little more each time, up to 8 seconds", () => {
    expect(backoffMs(1)).toBe(3000);
    expect(backoffMs(2)).toBe(4500);
    expect(backoffMs(99)).toBe(8000);
  });
});

describe("fetchWithRetry", () => {
  it("returns a real answer at once, even a refusal", async () => {
    let calls = 0;
    const r = await fetchWithRetry("u", {}, { fetchImpl: (async () => { calls++; return res(403); }) as any, sleep: noSleep });
    expect(r.status).toBe(403);
    expect(calls).toBe(1);
  });
  it("keeps trying while the server answers 502, then returns the first real answer, telling the screen", async () => {
    const seq = [502, 503, 502, 200];
    const waits: any[] = [];
    let i = 0;
    const r = await fetchWithRetry("u", {}, { fetchImpl: (async () => res(seq[i++])) as any, sleep: noSleep, onWait: (w) => waits.push(w) });
    expect(r.status).toBe(200);
    expect(i).toBe(4);
    expect(waits.map((w) => [w.attempt, w.reason])).toEqual([[1, "server"], [2, "server"], [3, "server"]]);
  });
  it("retries a network failure, and gives up at the deadline with a server-unreachable error", async () => {
    let t = 0;
    let calls = 0;
    await expect(fetchWithRetry("u", {}, {
      fetchImpl: (async () => { calls++; throw new TypeError("Failed to fetch"); }) as any,
      sleep: async (ms) => { t += ms; }, now: () => t, deadlineMs: 20_000,
    })).rejects.toBeInstanceOf(ServerUnreachableError);
    expect(calls).toBeGreaterThan(2);
  });
  it("a try that hangs is cut off at its limit and counted as a timeout", async () => {
    const waits: any[] = [];
    let n = 0;
    const hang = ((_u: any, init: any) => new Promise((resolve, reject) => {
      n++;
      if (n === 2) { resolve(res(200)); return; }
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    })) as any;
    const r = await fetchWithRetry("u", {}, { fetchImpl: hang, sleep: noSleep, perTryMs: 20, onWait: (w) => waits.push(w.reason) });
    expect(r.status).toBe(200);
    expect(waits).toEqual(["timeout"]);
  });
});

describe("wakeMessage", () => {
  it("says nothing at first, then says what is happening", () => {
    expect(wakeMessage(3_000)).toBeNull();
    expect(wakeMessage(12_000)).toContain("waking up (12s)");
    expect(wakeMessage(70_000)).toContain("Still waking the server (70s)");
  });
});
