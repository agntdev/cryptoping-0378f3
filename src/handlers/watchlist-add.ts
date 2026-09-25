import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { cleanTicker, coinId, ensureProfile, id, now, priceFor, watchlist, keyboardPrompt } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Add coin", data: "watchlist:add", order: 10 });
const composer = new Composer<Ctx>();

async function add(ctx: Ctx, raw: string) {
  ensureProfile(ctx);
  const ticker = cleanTicker(raw);
  if (!ticker || ticker.length < 2) { await ctx.reply("Enter a ticker such as BTC or ETH."); return; }
  const existing = watchlist(ctx).find((item) => item.ticker === ticker);
  if (existing) { await ctx.reply(`${ticker} is already on your watchlist.`, { reply_markup: inlineKeyboard([[inlineButton("View list", "watchlist:view")]]) }); return; }
  const quote = await priceFor(ticker);
  if (!quote && !coinId(ticker)) {
    await ctx.reply("I couldn't find that ticker. Try BTC, ETH, TON, or USDT.", { reply_markup: inlineKeyboard([[inlineButton("Try again", "watchlist:add")]]) });
    return;
  }
  const item = { id: id("coin", ctx), ticker, canonicalSymbol: coinId(ticker), ...(quote ? { lastPrice: quote.price, lastPriceAt: now().toISOString() } : {}) };
  watchlist(ctx).push(item);
  await ctx.reply(`${ticker} was added to your watchlist.`, { reply_markup: inlineKeyboard([[inlineButton("Create alert", `alert:add:${item.id}`)], [inlineButton("View list", "watchlist:view")]]) });
}

composer.callbackQuery("watchlist:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Choose a coin to add.", { reply_markup: inlineKeyboard([
    [inlineButton("BTC", "watchlist:quick:BTC"), inlineButton("ETH", "watchlist:quick:ETH")],
    [inlineButton("TON", "watchlist:quick:TON"), inlineButton("USDT", "watchlist:quick:USDT")],
    [inlineButton("Other", "watchlist:other"), inlineButton("Back", "menu:main")],
  ]) });
});
composer.callbackQuery(/^watchlist:quick:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); await add(ctx, ctx.match[1]); });
composer.callbackQuery("watchlist:other", async (ctx) => {
  await ctx.answerCallbackQuery(); ctx.session.step = "watchlist_ticker";
  await ctx.reply("Type the ticker to add.", { reply_markup: keyboardPrompt("Ticker, for example BTC") });
});
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "watchlist_ticker") return next();
  ctx.session.step = undefined; await add(ctx, ctx.message.text);
});

export default composer;
