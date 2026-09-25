import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { cleanTicker, coinId } from "../domain.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
const composer = new Composer<Ctx>();
composer.callbackQuery("deep:add", async (ctx) => { await ctx.answerCallbackQuery(); const ticker = cleanTicker(ctx.session.flow?.deepTicker ?? ""); if (!ticker || !coinId(ticker)) { await ctx.reply("I couldn't identify that ticker. Try BTC, ETH, TON, or USDT."); return; } await ctx.reply(`Ready to add ${ticker}.`, { reply_markup: inlineKeyboard([[inlineButton("Add coin", "watchlist:quick:" + ticker)], [inlineButton("Back", "menu:main")]]) }); });
export default composer;
