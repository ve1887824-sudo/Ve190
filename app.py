import os, hmac, hashlib, json
from urllib.parse import parse_qsl
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

app = Flask(__name__)
CORS(app)

BOT_TOKEN = os.environ.get("BOT_TOKEN")
DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db():
    return psycopg2.connect(DATABASE_URL, sslmode="require")

def init_db():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                coins BIGINT DEFAULT 0,
                click_power INTEGER DEFAULT 1,
                username TEXT,
                photo_url TEXT,
                games_played INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                last_bonus TIMESTAMP
            )
        """)
        # Добавляем колонки, если их не было
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS games_played INTEGER DEFAULT 0;")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;")
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bonus TIMESTAMP;")
        
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("DB init error:", e)

init_db()

def verify_init_data(init_data: str):
    try:
        parsed = dict(parse_qsl(init_data))
        received_hash = parsed.pop("hash", None)
        if not received_hash: return None
        dcs = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calc = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
        if calc != received_hash: return None
        return json.loads(parsed.get("user", "{}")) or None
    except:
        return None

# Загрузка профиля
@app.route("/api/load", methods=["POST"])
def load():
    user = verify_init_data(request.json.get("initData", ""))
    if not user: return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])
    username = user.get("username", "Игрок")
    photo_url = user.get("photo_url", "")

    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        INSERT INTO users (user_id, coins, click_power, username, photo_url)
        VALUES (%s, 0, 1, %s, %s)
        ON CONFLICT(user_id) DO UPDATE SET username = EXCLUDED.username, photo_url = EXCLUDED.photo_url
        RETURNING *
    """, (uid, username, photo_url))
    
    row = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()

    # Форматируем дату бонуса (если он был)
    last_bonus = row["last_bonus"].isoformat() if row["last_bonus"] else None

    return jsonify({
        "coins": row["coins"], "clickPower": row["click_power"],
        "username": row["username"], "photo_url": row["photo_url"],
        "user_id": uid, "games_played": row["games_played"],
        "wins": row["wins"], "losses": row["losses"],
        "last_bonus": last_bonus
    })

# Синхронизация кликов
@app.route("/api/sync", methods=["POST"])
def sync():
    payload = request.json
    user = verify_init_data(payload.get("initData", ""))
    if not user: return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])

    add_coins = int(payload.get("addCoins", 0))
    upgrade = bool(payload.get("upgradePower", False))

    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        INSERT INTO users (user_id, coins, click_power)
        VALUES (%s, GREATEST(0, %s), %s)
        ON CONFLICT(user_id) DO UPDATE SET
            coins = GREATEST(0, users.coins + %s),
            click_power = users.click_power + %s
        RETURNING coins, click_power
    """, (uid, add_coins, 1 + (1 if upgrade else 0), add_coins, 1 if upgrade else 0))
    row = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()

    return jsonify({"coins": row["coins"], "clickPower": row["click_power"]})

# Лидерборд
@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT username, coins, photo_url FROM users ORDER BY coins DESC LIMIT 10")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify(rows)

# Ежедневный бонус
@app.route("/api/bonus", methods=["POST"])
def claim_bonus():
    user = verify_init_data(request.json.get("initData", ""))
    if not user: return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])
    
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT last_bonus FROM users WHERE user_id = %s", (uid,))
    row = cur.fetchone()
    
    now = datetime.utcnow()
    if row and row["last_bonus"]:
        diff = (now - row["last_bonus"]).total_seconds()
        if diff < 86400: # 24 часа в секундах
            cur.close(); conn.close()
            return jsonify({"error": "wait", "time_left": int(86400 - diff)}), 400

    bonus_amount = 500
    cur.execute("""
        UPDATE users SET coins = coins + %s, last_bonus = %s WHERE user_id = %s
        RETURNING coins
    """, (bonus_amount, now, uid))
    new_coins = cur.fetchone()["coins"]
    conn.commit()
    cur.close(); conn.close()
    
    return jsonify({"success": True, "amount": bonus_amount, "coins": new_coins})

# Игра (Монетка)
@app.route("/api/game", methods=["POST"])
def play_game():
    payload = request.json
    user = verify_init_data(payload.get("initData", ""))
    if not user: return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])
    bet = int(payload.get("bet", 0))
    win = bool(payload.get("win", False))

    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Проверяем баланс
    cur.execute("SELECT coins FROM users WHERE user_id = %s", (uid,))
    coins = cur.fetchone()["coins"]
    if coins < bet and not win:
        cur.close(); conn.close()
        return jsonify({"error": "no_money"}), 400

    delta = bet if win else -bet
    cur.execute("""
        UPDATE users SET 
            coins = GREATEST(0, coins + %s),
            games_played = games_played + 1,
            wins = wins + %s,
            losses = losses + %s
        WHERE user_id = %s
        RETURNING coins
    """, (delta, 1 if win else 0, 0 if win else 1, uid))
    
    new_coins = cur.fetchone()["coins"]
    conn.commit()
    cur.close(); conn.close()
    return jsonify({"coins": new_coins})

@app.route("/")
def index():
    return "KisaGame OK"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
