import os
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from supabase import create_client, Client

# Данные вашего бота и базы данных
BOT_TOKEN = "ВСТАВЬТЕ_ТОКЕН_ВАШЕГО_БОТА_ИЗ_BOTFATHER"
SUPABASE_URL = "https://supabase.co"
SUPABASE_KEY = "sb_publishable_GtVnaoI6QiSyj8U9X4UWdw_cx29rxUf"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Главная команда /start для бота
@dp.message(Command("start"))
async def cmd_start(message: types.Message):
    # Ссылка на вашу игру на Vercel
    web_app_url = "https://vercel.app" 
    
    keyboard = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🐱 ИГРАТЬ (KisaGame)", web_app = WebAppInfo(url=web_app_url))]
    ])
    
    await message.answer(
        f"Привет, {message.from_user.first_name}!\n"
        "Нажми на кнопку ниже, чтобы запустить игру. Твой прогресс сохраняется на сервере и переносится на любые устройства!",
        reply_markup=keyboard
    )

# Специальный обработчик, который принимает лапки из игры и пишет в базу данных
@dp.message(lambda message: message.web_app_data is not None)
async def web_app_data_handler(message: types.Message):
    # Получаем данные (баланс и силу клика) из игры
    data = message.web_app_data.data.split("|")
    coins = int(data[0])
    click_power = int(data[1])
    tg_id = str(message.from_user.id)

    # Сохраняем в вашу таблицу Kis на сервере Supabase
    try:
        supabase.table("Kis").upsert({
            "tg_id": tg_id,
            "coins": coins,
            "click_power": click_power
        }).execute()
        await message.answer("🐾 Прогресс успешно синхронизирован с сервером!")
    except Exception as e:
        print("Ошибка сохранения:", e)

async def main():
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
  
