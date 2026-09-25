import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { ensureProfile, money, priceFor, watchlist } from "../domain.js";

const composer = new Composer<Ctx>();
composer.command("price", async (ctx) => {
  ensureProfile(ctx); const raw = ctx.message?.text?.trim().split(/\s+/).slice(1).join(" ") ?? "";
  if (!raw) { await ctx.reply("Usage: /price BTC or /price mylist"); return; }
  const items = raw.toLowerCase() === "mylist" ? watchlist(ctx) : [{ ticker: raw.toUpperCase() }];
  if (!items.length) { await ctx.reply("Your watchlist is empty — tap Add coin to begin."); return; }
  const lines: string[] = []; let failed = 0;
  for (const item of items) { const quote = await priceFor(item.ticker); if (!quote) { failed += 1; continue; } lines.push(`${item.ticker}: ${money(quote.price)} (${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)}% 1h)`); }
  if (!lines.length) { await ctx.reply("I couldn't find that ticker. Try BTC, ETH, TON, or USDT, then try again."); return; }
  await ctx.reply(lines.join("\n") + (failed ? `\n\n${failed} item${failed === 1 ? "" : "s"} couldn't be loaded. Try again later.` : ""));
});
export default composer;
