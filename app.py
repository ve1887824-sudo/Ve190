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

def init_db():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                coins BIGINT DEFAULT 0,
                click_power INTEGER DEFAULT 1
            )
        """)
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

@app.route("/api/load", methods=["POST"])
def load():
    user = verify_init_data(request.json.get("initData", ""))
    if not user: return jsonify({"error": "invalid"}), 401
    uid = str(user["id"])

    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT coins, click_power FROM users WHERE user_id = %s", (uid,))
    row = cur.fetchone()
    cur.close(); conn.close()

    if row:
        return jsonify({"coins": row["coins"], "clickPower": row["click_power"]})
    return jsonify({"coins": 0, "clickPower": 1})

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
