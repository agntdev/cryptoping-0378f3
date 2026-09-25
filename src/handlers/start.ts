import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { ensureProfile } from "../domain.js";
import { mainMenuKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
const WELCOME = "👋 Welcome! Your watchlist and settings stay private to this chat. Tap a button to track prices and manage alerts.";
composer.command("start", async (ctx) => { ensureProfile(ctx); const arg = ctx.message?.text?.trim().split(/\s+/)[1]; if (arg) ctx.session.flow = { deepTicker: arg }; await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() }); });
composer.callbackQuery("menu:main", async (ctx) => { await ctx.answerCallbackQuery(); await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() }); });
export default composer;
