// The rest of a city's hotels, fetched behind the first screen (2026-10-27).
//
// A hotel search answers with the top hotels at once and a token for the rest (hotelListingStart).
// This asks for the rest the way TripSure's own site does: every 1.5s, up to 15 times, with the
// cursor TripSure returns, until it says the search is no longer "InProgress". Each page brings its
// own docKey/token (hotel details and price check need the pair that came with the hotel), a hotel
// seen twice keeps the later copy. Used by the Search desk and the New Booking hotel step.
import { hotelListingMore } from "../services/api";

export type MoreHandle = { stop: () => void };

export function loadRestOfCity<T>(opts: {
  more: { token: string; countryCode?: string; ctx: any };
  first: T[];
  idOf: (item: T) => string;
  mapHotel: (hotel: any, ctx: any) => T;
  onUpdate: (all: T[], info: { loaded: number }) => void;
  onDone: (all: T[]) => void;
  onFail: (all: T[]) => void;
}): MoreHandle {
  const ctl = new AbortController();
  let stopped = false;
  let timer: any = null;
  const byId = new Map<string, T>();
  opts.first.forEach((o) => byId.set(String(opts.idOf(o)), o));
  let key: string | undefined;
  let polls = 0;
  opts.onUpdate(Array.from(byId.values()), { loaded: byId.size });
  const tick = () => {
    if (stopped) return;
    polls += 1;
    hotelListingMore({ token: opts.more.token, nextResultsKey: key, countryCode: opts.more.countryCode }, ctl.signal)
      .then((pg: any) => {
        if (stopped) return;
        const ctx = { ...opts.more.ctx, docKey: pg.docKey || opts.more.ctx.docKey, token: pg.token || opts.more.ctx.token };
        (pg.hotels || []).forEach((h: any) => byId.set(String(h.hotelKey), opts.mapHotel(h, ctx)));
        if (pg.nextResultsKey) key = pg.nextResultsKey;
        const all = Array.from(byId.values());
        if (pg.status !== "InProgress" || polls >= 15) {
          opts.onUpdate(all, { loaded: all.length });
          opts.onDone(all);
          return;
        }
        opts.onUpdate(all, { loaded: all.length });
        timer = setTimeout(tick, 1500);
      })
      .catch((e: any) => {
        if (stopped || (e && e.aborted)) return;
        opts.onFail(Array.from(byId.values()));
      });
  };
  tick();
  return { stop: () => { stopped = true; if (timer) clearTimeout(timer); ctl.abort(); } };
}
