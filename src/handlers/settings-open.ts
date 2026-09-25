import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { ensureProfile, keyboardPrompt } from "../domain.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Settings", data: "settings:open", order: 30 });
const composer = new Composer<Ctx>();
function menu(ctx: Ctx) { const p = ensureProfile(ctx); return ctx.reply(`Settings\nQuiet hours: ${p.quietStart}–${p.quietEnd}\nMorning summary: ${p.morningEnabled ? `on at ${p.morningTime}` : "off"}\nCooldown: ${p.cooldownMinutes} minutes\nTimezone: ${p.timezone}`, { reply_markup: inlineKeyboard([[inlineButton("Quiet hours", "settings:quiet")], [inlineButton("Morning summary", "settings:morning")], [inlineButton("Cooldown", "settings:cooldown")], [inlineButton("Timezone", "settings:timezone")], [inlineButton("Back", "menu:main")]]) }); }
composer.callbackQuery("settings:open", async (ctx) => { await ctx.answerCallbackQuery(); await menu(ctx); });
composer.callbackQuery("settings:quiet", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "quiet"; await ctx.reply("Enter quiet hours as HH:MM-HH:MM, for example 22:00-07:00.", { reply_markup: keyboardPrompt("22:00-07:00") }); });
composer.callbackQuery("settings:morning", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "morning"; await ctx.reply("Enter the summary time as HH:MM, or type off.", { reply_markup: keyboardPrompt("08:00") }); });
composer.callbackQuery("settings:cooldown", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "cooldown"; await ctx.reply("Enter the cooldown in minutes.", { reply_markup: keyboardPrompt("60") }); });
composer.callbackQuery("settings:timezone", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.step = "timezone"; await ctx.reply("Enter your IANA timezone, for example America/New_York.", { reply_markup: keyboardPrompt("Europe/London") }); });
composer.on("message:text", async (ctx, next) => {
  const p = ensureProfile(ctx); const value = ctx.message.text.trim();
  if (ctx.session.step === "quiet") { const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(value); if (!match || [match[1], match[2]].some((x) => Number(x.slice(0, 2)) > 23 || Number(x.slice(3)) > 59)) { await ctx.reply("Use HH:MM-HH:MM, such as 22:00-07:00."); return; } p.quietStart = match[1]; p.quietEnd = match[2]; ctx.session.step = undefined; await ctx.reply("Quiet hours updated.", { reply_markup: inlineKeyboard([[inlineButton("Settings", "settings:open")]]) }); return; }
  if (ctx.session.step === "morning") { if (value.toLowerCase() === "off") p.morningEnabled = false; else if (/^\d{2}:\d{2}$/.test(value) && Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60) { p.morningEnabled = true; p.morningTime = value; } else { await ctx.reply("Use HH:MM, such as 08:00, or type off."); return; } ctx.session.step = undefined; await ctx.reply("Morning summary settings updated.", { reply_markup: inlineKeyboard([[inlineButton("Settings", "settings:open")]]) }); return; }
  if (ctx.session.step === "cooldown") { const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > 10080) { await ctx.reply("Enter a whole number from 1 to 10080."); return; } p.cooldownMinutes = n; ctx.session.step = undefined; await ctx.reply("Cooldown updated.", { reply_markup: inlineKeyboard([[inlineButton("Settings", "settings:open")]]) }); return; }
  if (ctx.session.step === "timezone") { try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); } catch { await ctx.reply("I couldn't use that timezone. Try America/New_York or Europe/London."); return; } p.timezone = value; ctx.session.step = undefined; await ctx.reply("Timezone updated.", { reply_markup: inlineKeyboard([[inlineButton("Settings", "settings:open")]]) }); return; }
  return next();
});
export default composer;
