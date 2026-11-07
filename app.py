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
                auto_click INTEGER DEFAULT 0,
                username TEXT,
                photo_url TEXT,
                games_played INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                last_bonus TIMESTAMP
            )
        """)
        # Добавляем колонку автоклика, если её нет
        cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_click INTEGER DEFAULT 0;")
        conn.commit(); cur.close(); conn.close()
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
        INSERT INTO users (user_id, coins, click_power, auto_click, username, photo_url)
        VALUES (%s, 0, 1, 0, %s, %s)
        ON CONFLICT(user_id) DO UPDATE SET username = EXCLUDED.username, photo_url = EXCLUDED.photo_url
        RETURNING *
    """, (uid, username, photo_url))
    
    row = cur.fetchone()
    conn.commit(); cur.close(); conn.close()

    last_bonus = row["last_bonus"].isoformat() if row["last_bonus"] else None

    return jsonify({
        "coins": row["coins"], "clickPower": row["click_power"],
        "autoClick": row["auto_click"],
        "username": row["username"], "photo_url": row["photo_url"],
        "user_id": uid, "games_played": row["games_played"],
        "wins": row["wins"], "losses": row["losses"],
        "last_bonus": last_bonus
    })

@app.route("/api/sync", methods=["POST"])
def sync():
    payload = request.json
    user = verify_init_data(payload.get("initData", ""))
    if not user: return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])

    add_coins = int(payload.get("addCoins", 0))
    # Теперь сервер принимает конкретную силу клика и автоклика
    new_click_power = payload.get("clickPower")
    new_auto_click = payload.get("autoClick")

    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Обновляем баланс
    cur.execute("""
        UPDATE users SET coins = GREATEST(0, coins + %s) WHERE user_id = %s
    """, (add_coins, uid))
    
    # Если пришли новые улучшения, обновляем их
    if new_click_power is not None:
        cur.execute("UPDATE users SET click_power = %s WHERE user_id = %s", (int(new_click_power), uid))
    if new_auto_click is not None:
        cur.execute("UPDATE users SET auto_click = %s WHERE user_id = %s", (int(new_auto_click), uid))

    conn.commit(); cur.close(); conn.close()

    return jsonify({"status": "ok"})

@app.route("/api/game", methods=["POST"])
def game():
    payload = request.json
    user = verify_init_data(payload.get("initData", ""))
    if not user: return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])
    bet = int(payload.get("bet", 0))
    win = bool(payload.get("win", False))

    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
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
    conn.commit(); cur.close(); conn.close()
    return jsonify({"coins": new_coins})

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
        if diff < 86400:
            cur.close(); conn.close()
            return jsonify({"error": "wait", "time_left": int(86400 - diff)}), 400

    bonus_amount = 500
    cur.execute("""
        UPDATE users SET coins = coins + %s, last_bonus = %s WHERE user_id = %s
        RETURNING coins
    """, (bonus_amount, now, uid))
    new_coins = cur.fetchone()["coins"]
    conn.commit(); cur.close(); conn.close()
    return jsonify({"success": True, "amount": bonus_amount, "coins": new_coins})

@app.route("/api/leaderboard", methods=["GET"])
def leaderboard():
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT username, coins, photo_url FROM users ORDER BY coins DESC LIMIT 10")
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify(rows)

@app.route("/")
def index():
    return "KisaGame OK"
