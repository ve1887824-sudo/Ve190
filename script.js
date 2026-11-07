const API_URL = 'https://ve190-9.onrender.com'; 
const ADMIN_ID = "5372048108"; 
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

let coins = 0, clickPower = 1, autoClickPower = 0;
let pendingCoins = 0, pendingUpgrade = false;
let syncTimer = null, userData = {};
let currentGame = '', gameChoice = null;

// Бусты
let buffMultiplier = 1;
let buffEndTime = 0;

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
    
    document.getElementById('btn-up-power').innerText = `Ур. ${clickPower} | ${costPower} 🐾`;
    document.getElementById('btn-up-power').disabled = coins < costPower;
    
    document.getElementById('btn-up-auto').innerText = `Ур. ${autoClickPower} | ${costAuto} 🐾`;
    document.getElementById('btn-up-auto').disabled = coins < costAuto;
    
    document.getElementById('btn-buff').innerText = `Купить за 500 🐾`;
    document.getElementById('btn-buff').disabled = coins < 500;
}

// Автоклик и проверка буста
setInterval(() => {
    if (autoClickPower > 0) {
        let earn = autoClickPower;
        coins += earn;
        pendingCoins += earn;
        updateUI();
        scheduleSync();
    }
    
    if (buffEndTime > 0 && Date.now() > buffEndTime) {
        buffEndTime = 0;
        buffMultiplier = 1;
        document.getElementById('coin-btn').style.filter = '';
        alert("🔥 Буст x2 закончился!");
    }
}, 1000);

async function fetchWithTimeout(url, options, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
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

// МАГАЗИН
window.openShop = function() { document.getElementById('shop-modal').classList.add('active'); updateUI(); }
window.closeShop = function() { document.getElementById('shop-modal').classList.remove('active'); }

window.buyUpgrade = function(type) {
    if (type === 'power') {
        let cost = 15 + (clickPower * 10);
        if (coins >= cost) {
            coins -= cost; clickPower += 1;
            pendingCoins -= cost; pendingUpgrade = true; 
            updateUI(); scheduleSync();
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }
    } else if (type === 'auto') {
        let cost = 100 + (autoClickPower * 50);
        if (coins >= cost) {
            coins -= cost; autoClickPower += 1;
            pendingCoins -= cost;
            updateUI(); scheduleSync();
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }
    }
}

window.buyBuff = function() {
    if (coins >= 500) {
        coins -= 500; pendingCoins -= 500;
        buffMultiplier = 2;
        buffEndTime = Date.now() + 5 * 60 * 1000; 
        updateUI(); scheduleSync();
        document.getElementById('coin-btn').style.filter = 'drop-shadow(0 0 30px #FF5252)'; 
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        alert("🔥 Буст x2 активирован на 5 минут!");
    }
}

// ИГРЫ
window.openGame = function(gameType) {
    currentGame = gameType;
    gameChoice = null;
    const title = document.getElementById('modal-title');
    const ui = document.getElementById('game-ui');
    document.getElementById('game-modal').classList.add('active');
    document.getElementById('bet-input').value = 10;
    ui.innerHTML = '';

    if (gameType === 'cups') {
        title.innerText = "Наперстки";
        ui.innerHTML = `<p>Выбери стаканчик</p><div class="cups-container">
            <div class="cup" onclick="selectChoice('cups', 1)">🥥</div>
            <div class="cup" onclick="selectChoice('cups', 2)">🥥</div>
            <div class="cup" onclick="selectChoice('cups', 3)">🥥</div></div>`;
    } else if (gameType === 'dice') {
        title.innerText = "Кости (Больше 7)";
        ui.innerHTML = `<p>Выпадет больше 7?</p>
            <div class="dice-container">
                <div class="dice">⚀</div>
                <div class="dice">⚀</div>
            </div>
            <div style="display:flex; gap:10px; justify-content:center; margin-top:15px;">
                <button class="btn-primary" style="width: 100px;" onclick="selectChoice('dice', true)">Да</button>
                <button class="btn-primary" style="width: 100px; background: var(--accent-red);" onclick="selectChoice('dice', false)">Нет</button>
            </div>`;
    } else if (gameType === 'coin') {
        title.innerText = "Монетка";
        ui.innerHTML = `<p>Орел или Решка?</p>
            <div class="coin-container"><div class="coin" id="coin-anim">🪙</div></div>
            <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
                <button class="btn-primary" style="width: 100px;" onclick="selectChoice('coin', true)">Орел</button>
                <button class="btn-primary" style="width: 100px; background: var(--accent-yellow); color: black;" onclick="selectChoice('coin', false)">Решка</button>
            </div>`;
    } else if (gameType === 'slots') {
        title.innerText = "Слоты";
        ui.innerHTML = `<p>Испытай удачу!</p>
            <div class="slots-container" id="slots-anim">
                <div class="slot-reel">🍒</div>
                <div class="slot-reel">🍋</div>
                <div class="slot-reel">💎</div>
            </div>`;
        gameChoice = true;
    } else if (gameType === 'wheel') {
        title.innerText = "Колесо Фортуны";
        ui.innerHTML = `<p>Испытай удачу!</p>
            <div class="wheel-container" id="wheel-anim">🎡</div>`;
        gameChoice = true;
    } else if (gameType === 'guess') {
        title.innerText = "Угадай число";
        ui.innerHTML = `<p>Выбери число от 1 до 10</p>
            <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<button class="btn-primary" style="width: 50px; height: 50px; padding: 0; margin: 2px;" onclick="selectChoice('guess', ${n})">${n}</button>`).join('')}</div>`;
    }
}

window.closeGame = function() { document.getElementById('game-modal').classList.remove('active'); }
window.selectChoice = function(game, choice) { 
    gameChoice = choice; 
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium'); 
    // Визуальный отклик
    document.querySelectorAll('.cup, .btn-primary').forEach(el => el.style.opacity = '0.5');
    event.target.style.opacity = '1';
}

window.executeGame = async function() {
    if (!gameChoice) { alert("Сделайте выбор!"); return; }
    const bet = parseInt(document.getElementById('bet-input').value);
    if (isNaN(bet) || bet <= 0 || bet > coins) { alert('Недостаточно монет!'); return; }

    // Анимация
    if (currentGame === 'dice') {
        document.querySelectorAll('.dice').forEach(d => d.classList.add('rolling'));
    } else if (currentGame === 'coin') {
        document.getElementById('coin-anim').classList.add('flip');
    } else if (currentGame === 'slots') {
        document.querySelectorAll('.slot-reel').forEach(r => r.classList.add('spinning'));
    } else if (currentGame === 'wheel') {
        document.getElementById('wheel-anim').classList.add('spinning');
    }

    // Ждем анимацию перед результатом
    setTimeout(async () => {
        let win = false;
        if (currentGame === 'cups') {
            win = (gameChoice === Math.floor(Math.random() * 3) + 1);
        } else if (currentGame === 'dice') {
            const d1 = Math.ceil(Math.random() * 6);
            const d2 = Math.ceil(Math.random() * 6);
            const sum = d1 + d2;
            alert(`Выпало: ${d1} и ${d2} = ${sum}`);
            win = (gameChoice === (sum > 7));
        } else if (currentGame === 'coin') {
            const isHeads = Math.random() < 0.5;
            alert(isHeads ? "Выпал Орел!" : "Выпала Решка!");
            win = (gameChoice === isHeads);
        } else if (currentGame === 'slots') {
            win = Math.random() < 0.15;
        } else if (currentGame === 'wheel') {
            win = Math.random() < 0.2;
        } else if (currentGame === 'guess') {
            const num = Math.floor(Math.random() * 10) + 1;
            alert(`Выпало число: ${num}`);
            win = (gameChoice === num);
        }

        closeGame();
        // Сброс анимаций
        document.querySelectorAll('.dice').forEach(d => d.classList.remove('rolling'));
        document.querySelectorAll('.slot-reel').forEach(r => r.classList.remove('spinning'));

        try {
            const r = await fetchWithTimeout(`${API_URL}/api/game`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ initData: tg.initData, bet: bet, win: win })
            });
            const d = await r.json();
            if (d.coins !== undefined) {
                coins = d.coins;
                userData.games_played = (userData.games_played || 0) + 1;
                if (win) userData.wins = (userData.wins || 0) + 1; else userData.losses = (userData.losses || 0) + 1;
                
                document.getElementById('stat-games').innerText = userData.games_played;
                document.getElementById('stat-wins').innerText = userData.wins;
                document.getElementById('stat-losses').innerText = userData.losses;
                updateUI();
                if (win) { if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); alert(`🎉 Победа! +${bet} Kisa!`); }
                else { if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error'); alert(`😿 Проигрыш. -${bet} Kisa.`); }
            }
        } catch(e) { alert('Ошибка сети'); }
    }, 600); // 600мс на анимацию
}

// БОНУС И РЕЙТИНГ
function checkBonusStatus() {
    const btn = document.getElementById('claim-bonus-btn');
    const timer = document.getElementById('bonus-timer');
    if (!userData.last_bonus) { btn.disabled = false; btn.innerText = "Забрать бонус"; timer.innerText = ""; return; }
    const diff = 86400000 - (new Date().getTime() - new Date(userData.last_bonus).getTime());
    if (diff > 0) {
        btn.disabled = true;
        timer.innerText = `Доступно через: ${Math.floor(diff / 3600000)}ч ${Math.floor((diff % 3600000) / 60000)}м`;
        btn.innerText = "Уже получено";
    } else { btn.disabled = false; btn.innerText = "Забрать бонус"; timer.innerText = ""; }
}

document.getElementById('claim-bonus-btn').addEventListener('click', async () => {
    try {
        const r = await fetchWithTimeout(`${API_URL}/api/bonus`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ initData: tg.initData }) });
        if (r.ok) {
            const d = await r.json();
            coins = d.coins; userData.last_bonus = new Date().toISOString();
            updateUI(); checkBonusStatus(); alert(`🎁 Вы получили ${d.amount} Kisa!`);
        }
    } catch(e) { alert('Ошибка'); }
});

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    try {
        const r = await fetchWithTimeout(`${API_URL}/api/leaderboard`, { method: 'GET' });
        const data = await r.json();
        container.innerHTML = '';
        if (data.length === 0) { container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Пока нет игроков</div>'; return; }
        data.forEach((player, index) => {
            container.innerHTML += `<div class="leader-row"><div class="leader-left">
                <span class="leader-rank">${index + 1}</span>
                <img class="leader-avatar" src="${player.photo_url || 'https://ui-avatars.com/api/?name='+(player.username||'U')+'&background=00D1FF&color=fff'}">
                <span class="leader-name">${player.username || 'Игрок'}</span></div>
                <span class="leader-coins">${player.coins} 🐾</span></div>`;
        });
    } catch(e) { container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Ошибка загрузки</div>'; }
}

loadProgress();
