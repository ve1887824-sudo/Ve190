const API_URL = 'https://ve190-9.onrender.com'; 
const ADMIN_ID = "5372048108"; 
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

let coins = 0, clickPower = 1, autoClickPower = 0;
let pendingCoins = 0, pendingUpgrade = false;
let syncTimer = null, userData = {};
let currentGame = '', gameChoice = null;
let buffMultiplier = 1, buffEndTime = 0;

window.switchScreen = function(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    if (screenId === 'screen-main') document.getElementById('nav-main').classList.add('active');
    if (screenId === 'screen-games') document.getElementById('nav-games').classList.add('active');
    if (screenId === 'screen-bonus') { document.getElementById('nav-bonus').classList.add('active'); checkBonusStatus(); }
    if (screenId === 'screen-profile') document.getElementById('nav-profile').classList.add('active');
    if (screenId === 'screen-leaderboard') { document.getElementById('nav-leader').classList.add('active'); loadLeaderboard(); }
}

function updateUI() {
    document.getElementById('balance-header').innerText = coins;
    document.getElementById('balance-main').innerText = coins;
    document.getElementById('stat-balance').innerText = coins;
    document.getElementById('detail-balance').innerText = coins + ' Kisa';
    
    const costPower = 15 + (clickPower * 10);
    const costAuto = 100 + (autoClickPower * 50);
    
    if(document.getElementById('btn-up-power')) {
        document.getElementById('btn-up-power').innerText = `Ур. ${clickPower} | ${costPower} 🐾`;
        document.getElementById('btn-up-power').disabled = coins < costPower;
        document.getElementById('btn-up-auto').innerText = `Ур. ${autoClickPower} | ${costAuto} 🐾`;
        document.getElementById('btn-up-auto').disabled = coins < costAuto;
        document.getElementById('btn-buff').innerText = `Купить за 500 🐾`;
        document.getElementById('btn-buff').disabled = coins < 500;
    }
}

setInterval(() => {
    if (autoClickPower > 0) {
        let earn = autoClickPower;
        coins += earn; pendingCoins += earn;
        updateUI(); scheduleSync();
    }
    if (buffEndTime > 0 && Date.now() > buffEndTime) {
        buffEndTime = 0; buffMultiplier = 1;
        document.getElementById('coin-btn').style.filter = '';
    }
}, 1000);

async function fetchWithTimeout(url, options, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id); return response;
    } catch (error) { clearTimeout(id); throw error; }
}

async function loadProgress() {
    if (!tg?.initData) return;
    try {
        const r = await fetchWithTimeout(`${API_URL}/api/load`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        userData = await r.json();
        coins = userData.coins ?? 0;
        clickPower = userData.clickPower ?? 1;
        autoClickPower = userData.autoClick || 0; 

        document.getElementById('user-name').innerText = userData.username || "Игрок";
        document.getElementById('user-username').innerText = userData.username || "username";
        document.getElementById('user-id').innerText = userData.user_id;
        document.getElementById('detail-id').innerText = userData.user_id;
        document.getElementById('user-avatar').src = userData.photo_url || "https://ui-avatars.com/api/?name=K&background=00D1FF&color=fff";
        document.getElementById('stat-games').innerText = userData.games_played || 0;
        document.getElementById('stat-wins').innerText = userData.wins || 0;
        document.getElementById('stat-losses').innerText = userData.losses || 0;

        if (String(userData.user_id) === String(ADMIN_ID)) {
            document.getElementById('admin-badge').classList.remove('hidden');
        }
    } catch(e) { console.warn('Ошибка загрузки', e); }
    updateUI();
}

async function sync() {
    if (!tg?.initData || (pendingCoins === 0 && !pendingUpgrade)) return;
    const add = pendingCoins, upg = pendingUpgrade;
    pendingCoins = 0; pendingUpgrade = false;
    try {
        await fetchWithTimeout(`${API_URL}/api/sync`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ initData: tg.initData, addCoins: add, upgradePower: upg })
        });
    } catch(e) { pendingCoins += add; pendingUpgrade = pendingUpgrade || upg; }
}

function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, 1000);
}

document.getElementById('coin-btn').addEventListener('click', () => {
    let earn = clickPower * buffMultiplier;
    coins += earn; pendingCoins += earn;
    updateUI(); scheduleSync();
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

window.openShop = function() { document.getElementById('shop-modal').classList.add('active'); updateUI(); }
window.closeShop = function() { document.getElementById('shop-modal').classList.remove('active'); }

window.buyUpgrade = function(type) {
    if (type === 'power') {
        let cost = 15 + (clickPower * 10);
        if (coins >= cost) {
            coins -= cost; clickPower += 1; pendingCoins -= cost; pendingUpgrade = true; 
            updateUI(); scheduleSync();
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }
    } else if (type === 'auto') {
        let cost = 100 + (autoClickPower * 50);
        if (coins >= cost) {
            coins -= cost; autoClickPower += 1; pendingCoins -= cost;
            updateUI(); scheduleSync();
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }
    }
}

window.buyBuff = function() {
    if (coins >= 500) {
        coins -= 500; pendingCoins -= 500;
        buffMultiplier = 2; buffEndTime = Date.now() + 5 * 60 * 1000; 
        updateUI(); scheduleSync();
        document.getElementById('coin-btn').style.filter = 'drop-shadow(0 0 30px #FF5252)'; 
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        alert("🔥 Буст x2 активирован на 5 минут!");
    }
}

window.openGame = function(gameType) {
    currentGame = gameType;
    gameChoice = null;
    const ui = document.getElementById('game-ui');
    document.getElementById('bet-input').value = 10;
    ui.innerHTML = '';

    switchScreen('screen-game-play');

    if (gameType === 'cups') {
        document.getElementById('game-header-title').innerText = "🥥 Наперстки";
        ui.innerHTML = `<p>Выбери стаканчик, под которым котик</p>
            <div class="cups-container">
                <div class="cup" id="cup-1" onclick="selectChoice('cups', 1)">🥥</div>
                <div class="cup" id="cup-2" onclick="selectChoice('cups', 2)">🥥</div>
                <div class="cup" id="cup-3" onclick="selectChoice('cups', 3)">🥥</div>
            </div>`;
    } else if (gameType === 'dice') {
        document.getElementById('game-header-title').innerText = "🎲 Кости";
        ui.innerHTML = `<p>Сумма будет больше 7?</p>
            <div class="dice-container">
                <div class="dice">⚀</div><div class="dice">⚀</div>
            </div>
            <div style="display:flex; gap:15px; justify-content:center; margin-top:20px;">
                <button class="guess-btn" id="dice-yes" onclick="selectChoice('dice', true)">Да</button>
                <button class="guess-btn" id="dice-no" onclick="selectChoice('dice', false)">Нет</button>
            </div>`;
    } else if (gameType === 'coin') {
        document.getElementById('game-header-title').innerText = "
