import os, hmac, hashlib, json
from urllib.parse import parse_qsl
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor

app = Flask(__name__)
CORS(app)

BOT_TOKEN = os.environ.get("BOT_TOKEN")
DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db():
    return psycopg2.connect(DATABASE_URL, sslmode="require")

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
    
    # Получаем данные из Telegram
    username = user.get("username", "Игрок")
    photo_url = user.get("photo_url", "")

    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # Проверяем, есть ли игрок. Если нет - создаем с его именем и аватаркой
    cur.execute("""
        INSERT INTO users (user_id, coins, click_power, username, photo_url)
        VALUES (%s, 0, 1, %s, %s)
        ON CONFLICT(user_id) DO UPDATE SET
            username = EXCLUDED.username,
            photo_url = EXCLUDED.photo_url
        RETURNING coins, click_power, username, photo_url
    """, (uid, username, photo_url))
    
    row = cur.fetchone()
    conn.commit()
    cur.close(); conn.close()

    return jsonify({
        "coins": row["coins"], 
        "clickPower": row["click_power"],
        "username": row["username"],
        "photo_url": row["photo_url"],
        "user_id": uid
    })

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

@app.route("/")
def index():
    return "KisaGame OK"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
