import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { alerts, ensureProfile, id, keyboardPrompt, now, priceFor, quietNow, watchlist } from "../domain.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
function itemFor(ctx: Ctx, itemId: string) { return watchlist(ctx).find((item) => item.id === itemId); }
composer.callbackQuery(/^alert:add:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const item = itemFor(ctx, ctx.match[1]);
  if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; }
  ctx.session.flow = { itemId: item.id }; ctx.session.step = "alert_type";
  await ctx.reply(`Create an alert for ${item.ticker}.`, { reply_markup: inlineKeyboard([[inlineButton("Price threshold", `alert:type:threshold:${item.id}`)], [inlineButton("Percent move", `alert:type:percent:${item.id}`)], [inlineButton("Back", "watchlist:view")]]) });
});
composer.callbackQuery(/^alert:type:(threshold|percent):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const item = itemFor(ctx, ctx.match[2]); if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; }
  ctx.session.flow = { itemId: item.id, type: ctx.match[1] }; ctx.session.step = "alert_direction";
  await ctx.reply(ctx.match[1] === "threshold" ? "When should I alert you?" : "Which move should trigger the alert?", { reply_markup: inlineKeyboard(ctx.match[1] === "threshold" ? [[inlineButton("Above", "alert:direction:above"), inlineButton("Below", "alert:direction:below")]] : [[inlineButton("Rise", "alert:direction:rise"), inlineButton("Fall", "alert:direction:fall")]]) });
});
composer.callbackQuery(/^alert:direction:(above|below|rise|fall)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { ...(ctx.session.flow ?? {}), direction: ctx.match[1] }; ctx.session.step = "alert_value"; await ctx.reply(ctx.session.flow.type === "threshold" ? "Enter the USD price." : "Enter the percentage, such as 5 for 5%.", { reply_markup: keyboardPrompt("Enter a number") }); });
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "alert_value") return next();
  const value = Number(ctx.message.text.trim()); const flow = ctx.session.flow ?? {};
  if (!Number.isFinite(value) || value <= 0) { await ctx.reply("Enter a number greater than zero.", { reply_markup: keyboardPrompt("Enter a number") }); return; }
  ctx.session.flow = { ...flow, value: String(value) };
  if (flow.type === "percent") { ctx.session.step = "alert_lookback"; await ctx.reply("Choose the lookback window.", { reply_markup: inlineKeyboard([[inlineButton("15 minutes", "alert:lookback:15"), inlineButton("1 hour", "alert:lookback:60")], [inlineButton("4 hours", "alert:lookback:240"), inlineButton("24 hours", "alert:lookback:1440")]]) }); return; }
  ctx.session.step = "alert_confirm"; await summary(ctx, undefined);
});
async function summary(ctx: Ctx, lookback?: string) {
  const flow = ctx.session.flow ?? {}; const item = itemFor(ctx, flow.itemId ?? ""); const profile = ensureProfile(ctx);
  if (!item) { await ctx.reply("That coin is no longer on your watchlist."); return; }
  const unit = flow.type === "threshold" ? `$${Number(flow.value).toLocaleString("en-US")}` : `${flow.value}% over ${lookback ?? flow.lookback ?? "1 hour"}`;
  await ctx.reply(`Alert summary\n${item.ticker}: ${flow.direction} ${unit}\nCooldown: ${profile.cooldownMinutes} minutes`, { reply_markup: inlineKeyboard([[inlineButton("Save alert", "alert:confirm")], [inlineButton("Cancel", "watchlist:view")]]) });
}
composer.callbackQuery(/^alert:lookback:(15|60|240|1440)$/, async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.flow = { ...(ctx.session.flow ?? {}), lookback: ctx.match[1] }; ctx.session.step = "alert_confirm"; await summary(ctx, `${ctx.match[1]} minutes`); });
composer.callbackQuery("alert:confirm", async (ctx) => {
  await ctx.answerCallbackQuery(); const flow = ctx.session.flow ?? {}; const item = itemFor(ctx, flow.itemId ?? "");
  if (!item || !flow.type || !flow.direction || !flow.value) { await ctx.reply("This alert form expired. Start again from your watchlist."); return; }
  alerts(ctx).push({ id: id("alert", ctx), itemId: item.id, type: flow.type as "threshold" | "percent", direction: flow.direction as "above" | "below" | "rise" | "fall", value: Number(flow.value), ...(flow.lookback ? { lookbackMinutes: Number(flow.lookback) } : {}), active: true, createdAt: now().toISOString() });
  ctx.session.step = undefined; ctx.session.flow = undefined; await ctx.reply(`Your ${item.ticker} alert is active.`, { reply_markup: inlineKeyboard([[inlineButton("View list", "watchlist:view")]]) });
});
composer.callbackQuery("alerts:check", async (ctx) => {
  await ctx.answerCallbackQuery();
  const profile = ensureProfile(ctx); const current = now().getTime(); const fired: string[] = [];
  for (const alert of alerts(ctx)) {
    if (!alert.active || alert.lastFiredAt && current - new Date(alert.lastFiredAt).getTime() < profile.cooldownMinutes * 60_000) continue;
    const item = itemFor(ctx, alert.itemId); if (!item) continue;
    const quote = await priceFor(item.ticker); if (!quote) continue;
    const hit = alert.type === "threshold" ? (alert.direction === "above" ? quote.price >= alert.value : quote.price <= alert.value) : (alert.direction === "rise" ? quote.change >= alert.value : quote.change <= -alert.value);
    if (!hit) continue;
    alert.lastFiredAt = now().toISOString(); fired.push(item.ticker);
    ctx.session.fireCounts ??= {};
    ctx.session.fireCounts[item.ticker] = (ctx.session.fireCounts[item.ticker] ?? 0) + 1;
    if (!quietNow(profile)) await ctx.reply(`${item.ticker} reached your ${alert.type === "threshold" ? "price" : "percent"} alert.`);
    else (ctx.session.queuedAlertIds ??= []).push(alert.id);
  }
  if (!fired.length) await ctx.reply("No alerts are firing right now.");
  else if ((ctx.session.queuedAlertIds ?? []).length) await ctx.reply("Alerts were recorded and will be summarized after quiet hours.");
});
composer.callbackQuery("summary:send", async (ctx) => {
  await ctx.answerCallbackQuery(); const items = watchlist(ctx);
  if (!items.length) { await ctx.reply("Your watchlist is empty — tap Add coin to begin."); return; }
  const lines: string[] = []; let failed = 0;
  for (const item of items) { const quote = await priceFor(item.ticker); if (!quote) { failed += 1; lines.push(`${item.ticker}: unavailable`); } else lines.push(`${item.ticker}: $${quote.price.toLocaleString("en-US")} (${quote.change >= 0 ? "+" : ""}${quote.change.toFixed(2)}% 1h)`); }
  await ctx.reply(`Morning summary\n${lines.join("\n")}${failed ? `\n\n${failed} item${failed === 1 ? "" : "s"} couldn't be loaded.` : ""}`);
});
composer.callbackQuery("alerts:flush", async (ctx) => {
  await ctx.answerCallbackQuery(); const ids = ctx.session.queuedAlertIds ?? []; if (!ids.length) { await ctx.reply("There are no queued alerts."); return; }
  ctx.session.queuedAlertIds = []; await ctx.reply(`Quiet hours ended. ${ids.length} alert${ids.length === 1 ? "" : "s"} were triggered.`);
});
export default composer;
