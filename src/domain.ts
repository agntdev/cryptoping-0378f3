import type { Ctx, Session } from "./bot.js";

export type Clock = () => Date;
let clock: Clock = () => new Date();
export function setClockForTests(next: Clock): void { clock = next; }
export function now(): Date { return clock(); }

export const QUICK_COINS = ["BTC", "ETH", "TON", "USDT"] as const;
const COIN_IDS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", TON: "the-open-network", USDT: "tether",
};

export function chatId(ctx: Ctx): number { return ctx.chat?.id ?? ctx.from?.id ?? 0; }
export function ensureProfile(ctx: Ctx): NonNullable<Session["profile"]> {
  const current = now().toISOString();
  ctx.session.profile ??= {
    timezone: "UTC", quietStart: "22:00", quietEnd: "07:00", morningEnabled: false,
    morningTime: "08:00", cooldownMinutes: 60, createdAt: current, lastActiveAt: current,
  };
  ctx.session.profile.lastActiveAt = current;
  return ctx.session.profile;
}
export function watchlist(ctx: Ctx) { return (ctx.session.watchlist ??= []); }
export function alerts(ctx: Ctx) { return (ctx.session.alerts ??= []); }
export function id(prefix: string, ctx: Ctx): string {
  return `${prefix}-${chatId(ctx)}-${now().getTime()}-${watchlist(ctx).length}-${alerts(ctx).length}`;
}
export function cleanTicker(value: string): string {
  return value.trim().replace(/^\$/, "").replace(/\s+/g, "").toUpperCase().slice(0, 20);
}
export function coinId(ticker: string): string | undefined { return COIN_IDS[cleanTicker(ticker)]; }

export async function priceFor(ticker: string): Promise<{ price: number; change: number } | undefined> {
  const symbol = cleanTicker(ticker);
  const idValue = coinId(symbol);
  if (!idValue || typeof fetch !== "function") return undefined;
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(idValue)}&price_change_percentage=1h,24h`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      if (response.ok) {
        const body = await response.json() as Array<{ current_price?: number; price_change_percentage_1h_in_currency?: number }>;
        const row = body[0];
        if (row?.current_price !== undefined) return { price: row.current_price, change: row.price_change_percentage_1h_in_currency ?? 0 };
      }
    } catch { /* retry below */ }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
  }
  return undefined;
}

export function money(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 2 })}`;
}
export function quietNow(profile: NonNullable<Session["profile"]>, date = now()): boolean {
  let minutes: number;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: profile.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    minutes = hour * 60 + minute;
  } catch { minutes = date.getUTCHours() * 60 + date.getUTCMinutes(); }
  const parse = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
  const start = parse(profile.quietStart); const end = parse(profile.quietEnd);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
export function keyboardPrompt(input = "Type a value…") { return { force_reply: true as const, input_field_placeholder: input }; }
