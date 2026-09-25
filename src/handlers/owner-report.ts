import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem, requireOwner } from "../toolkit/index.js";
import { alerts, watchlist } from "../domain.js";

registerMainMenuItem({ label: "Owner report", data: "owner:report", order: 90 });
const composer = new Composer<Ctx>();
composer.callbackQuery("owner:report", async (ctx) => {
  await ctx.answerCallbackQuery(); if (!(await requireOwner(ctx as never))) return;
  const counts: Record<string, number> = {}; for (const alert of alerts(ctx)) { if (alert.lastFiredAt) counts[watchlist(ctx).find((i) => i.id === alert.itemId)?.ticker ?? "Unknown"] = (counts[watchlist(ctx).find((i) => i.id === alert.itemId)?.ticker ?? "Unknown"] ?? 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([ticker, count]) => `${ticker} (${count})`).join(", ") || "None yet";
  const destination = adminChatId(ctx as never); if (!destination) { await ctx.reply("Owner access isn't set up yet."); return; }
  const text = `Daily usage report\nActive users: 1\nActive watchlists: ${watchlist(ctx).length ? 1 : 0}\nTop fired tickers: ${top}`;
  try { await ctx.api.sendMessage(destination, text); await ctx.reply("The owner report is ready.", { reply_markup: inlineKeyboard([[inlineButton("Back", "menu:main")]]) }); } catch { await ctx.reply("I couldn't send the report. Check the owner chat setup."); }
});
export default composer;
