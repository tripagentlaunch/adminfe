import { afterEach, describe, expect, it, vi } from "vitest";
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "test-key";
const loadApi = () => import("./api");

const ok = (rows: any[]) => new Response(JSON.stringify({ rows }), { status: 200, headers: { "content-type": "application/json" } });

describe("table reads ride out a restarting backend", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("waits and tries again while the backend answers 503, then returns the rows, telling the screen it waited", async () => {
    vi.useFakeTimers();
    const answers = [new Response("", { status: 503 }), new Response("", { status: 502 }), ok([{ id: 1 }])];
    vi.stubGlobal("fetch", vi.fn(async () => answers.shift() as Response));
    const waits: Array<number | null> = [];
    const { db, onBackendWait } = await loadApi();
    const off = onBackendWait((w) => waits.push(w ? w.attempt : null));
    const p = db("members?select=*&limit=5");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await p).toEqual([{ id: 1 }]);
    off();
    expect(waits.filter((x) => x !== null).length).toBe(2); // two waits...
    expect(waits[waits.length - 1]).toBeNull(); // ...and "no longer waiting" at the end
  });

  it("a real answer (not a not-ready one) is not retried", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 403, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", f);
    const { db } = await loadApi();
    await expect(db("members?select=*")).rejects.toBeTruthy();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
