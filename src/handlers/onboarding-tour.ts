import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "How it works", data: "tour:open", order: 40 });
const composer = new Composer<Ctx>();
composer.callbackQuery("tour:open", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Track coins, add price or percent alerts, and choose when notifications may reach you. Your data stays private to this chat.", { reply_markup: inlineKeyboard([[inlineButton("Add coin", "watchlist:add")], [inlineButton("Back", "menu:main")]]) });
});
export default composer;
