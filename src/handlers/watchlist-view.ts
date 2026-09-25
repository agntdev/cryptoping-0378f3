import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { alerts, watchlist } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "View list", data: "watchlist:view", order: 20 });
const composer = new Composer<Ctx>();
function view(ctx: Ctx) {
  const items = watchlist(ctx);
  if (!items.length) return ctx.reply("Your watchlist is empty — tap Add coin to begin.", { reply_markup: inlineKeyboard([[inlineButton("Add coin", "watchlist:add")]]) });
  const rows = items.map((item) => [inlineButton(`Alert ${item.ticker}`, `alert:add:${item.id}`), inlineButton(`Remove ${item.ticker}`, `watchlist:remove:${item.id}`)]);
  return ctx.reply(`Your watchlist (${items.length}):\n\n${items.map((item) => `• ${item.ticker}${item.lastPrice !== undefined ? ` — $${item.lastPrice.toLocaleString("en-US")}` : ""}`).join("\n")}`, { reply_markup: inlineKeyboard([...rows, [inlineButton("Add coin", "watchlist:add")], [inlineButton("Back", "menu:main")]]) });
}
composer.callbackQuery("watchlist:view", async (ctx) => { await ctx.answerCallbackQuery(); await view(ctx); });
composer.callbackQuery(/^watchlist:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const item = watchlist(ctx).find((x) => x.id === ctx.match[1]);
  if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; }
  await ctx.reply(`Remove ${item.ticker} from your watchlist?`, { reply_markup: inlineKeyboard([[inlineButton("Remove", `watchlist:remove:yes:${item.id}`), inlineButton("Keep", "watchlist:view")]]) });
});
composer.callbackQuery(/^watchlist:remove:yes:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const index = watchlist(ctx).findIndex((x) => x.id === ctx.match[1]);
  if (index < 0) { await ctx.reply("That coin is no longer on your watchlist."); return; }
  const [item] = watchlist(ctx).splice(index, 1); alerts(ctx).splice(0, alerts(ctx).length, ...alerts(ctx).filter((a) => a.itemId !== item.id));
  await ctx.reply(`${item.ticker} was removed from your watchlist.`, { reply_markup: inlineKeyboard([[inlineButton("View list", "watchlist:view")]]) });
});
export default composer;
