import os, hmac, hashlib, json, sqlite3
from urllib.parse import parse_qsl
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
BOT_TOKEN = os.environ["BOT_TOKEN"]

DB_PATH = "game.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        coins INTEGER DEFAULT 0,
        click_power INTEGER DEFAULT 1
    )""")
    conn.commit()
    conn.close()

init_db()

def verify_init_data(init_data: str):
    parsed = dict(parse_qsl(init_data))
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        return None
    dcs = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, dcs.encode(), hashlib.sha256).hexdigest()
    if calc != received_hash:
        return None
    return json.loads(parsed.get("user", "{}")) or None

@app.route("/api/load", methods=["POST"])
def load():
    user = verify_init_data(request.json.get("initData", ""))
    if not user:
        return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT coins, click_power FROM users WHERE user_id=?", (uid,)
    ).fetchone()
    conn.close()
    if row:
        return jsonify({"coins": row[0], "clickPower": row[1]})
    return jsonify({"coins": 0, "clickPower": 1})

@app.route("/api/sync", methods=["POST"])
def sync():
    payload = request.json
    user = verify_init_data(payload.get("initData", ""))
    if not user:
        return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])

    add_coins = int(payload.get("addCoins", 0))
    upgrade = bool(payload.get("upgradePower", False))

    # защита от абсурдных значений
    if abs(add_coins) > 100000:
        return jsonify({"error": "too much"}), 400

    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT INTO users (user_id, coins, click_power)
        VALUES (?, MAX(0, ?), ?)
        ON CONFLICT(user_id) DO UPDATE SET
            coins = MAX(0, coins + ?),
            click_power = click_power + ?
    """, (uid, add_coins, 1 + (1 if upgrade else 0),
          add_coins, 1 if upgrade else 0))
    conn.commit()
    row = conn.execute(
        "SELECT coins, click_power FROM users WHERE user_id=?", (uid,)
    ).fetchone()
    conn.close()
    return jsonify({"coins": row[0], "clickPower": row[1]})

@app.route("/")
def index():
    return "KisaGame server OK"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
