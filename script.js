const API_URL = 'https://ve190-9.onrender.com'; 
const ADMIN_ID = "5372048108"; 
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

let coins = 0, clickPower = 1, autoClickPower = 0;
let pendingCoins = 0;
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
    
    const costPower = 15 + (clickPower * 10);
    const costAuto = 100 + (autoClickPower * 50);
    
    if(document.getElementById('btn-up-power')) {
        document.getElementById('btn-up-power').innerText = `${costPower} 🐾`;
        document.getElementById('btn-up-power').disabled = coins < costPower;
        document.getElementById('btn-up-auto').innerText = `${costAuto} 🐾`;
        document.getElementById('btn-up-auto').disabled = coins < costAuto;
        document.getElementById('btn-buff').innerText = `500 🐾`;
        document.getElementById('btn-buff').disabled = coins < 500;
    }
}

setInterval(() => {
    if (autoClickPower > 0) {
        let earn = autoClickPower;
        coins += earn; pendingCoins += earn;
        updateUI(); scheduleSync();
    }
    const buffEl = document.getElementById('buff-timer');
    const buffTimeEl = document.getElementById('buff-time');
    if (buffEndTime > 0) {
        const now = Date.now();
        if (now > buffEndTime) {
            buffEndTime = 0; buffMultiplier = 1; buffEl.classList.add('hidden');
        } else {
            buffEl.classList.remove('hidden');
            const diff = Math.floor((buffEndTime - now) / 1000);
            buffTimeEl.innerText = `${Math.floor(diff/60)}:${(diff%60<10?'0':'')}${diff%60}`;
        }
    }
}, 1000);

async function fetchWithTimeout(url, options, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try { return await fetch(url, { ...options, signal: controller.signal }); clearTimeout(id); } 
    catch (e) { clearTimeout(id); throw e; }
}

async function loadProgress() {
    if (!tg?.initData) return;
    try {
        const r = await fetchWithTimeout(`${API_URL}/api/load`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ initData: tg.initData }) });
        userData = await r.json();
        coins = userData.coins ?? 0; clickPower = userData.clickPower ?? 1; autoClickPower = userData.autoClick ?? 0; 
        document.getElementById('user-name').innerText = userData.username || "Игрок";
        document.getElementById('user-username').innerText = userData.username || "username";
        document.getElementById('user-id').innerText = userData.user_id;
        document.getElementById('user-avatar').src = userData.photo_url || "https://ui-avatars.com/api/?name=K&background=00D1FF&color=fff";
        document.getElementById('stat-games').innerText = userData.games_played || 0;
        document.getElementById('stat-wins').innerText = userData.wins || 0;
        document.getElementById('stat-losses').innerText = userData.losses || 0;
    } catch(e) { console.warn('Ошибка загрузки', e); }
    updateUI();
}

// ИСПРАВЛЕННАЯ СИНХРОНИЗАЦИЯ
async function sync() {
    if (!tg?.initData) return;
    // Отправляем данные, если изменились монеты ИЛИ сила клика/автоклик
    if (pendingCoins === 0 && clickPower === userData.clickPower && autoClickPower === userData.autoClick) return;
    
    const add = pendingCoins;
    const currentPower = clickPower;
    const currentAuto = autoClickPower;
    
    pendingCoins = 0; 
    userData.clickPower = currentPower; 
    userData.autoClick = currentAuto;
    
    try {
        await fetchWithTimeout(`${API_URL}/api/sync`, { 
            method:'POST', 
            headers:{'Content-Type':'application/json'}, 
            body: JSON.stringify({ 
                initData: tg.initData, 
                addCoins: add, 
                clickPower: currentPower, 
                autoClick: currentAuto 
            }) 
        });
    } catch(e) { 
        pendingCoins += add; 
    }
}

function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1000); }

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
            coins -= cost; 
            clickPower += 1; 
            pendingCoins -= cost; 
            updateUI(); scheduleSync();
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }
    } else if (type === 'auto') {
        let cost = 100 + (autoClickPower * 50);
        if (coins >= cost) {
            coins -= cost; 
            autoClickPower += 1; 
            pendingCoins -= cost;
            updateUI(); scheduleSync();
            if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        }
    }
}

window.buyBuff = function() {
    if (coins >= 500) { 
        coins -= 500; 
        pendingCoins -= 500;
        buffMultiplier = 2; 
        buffEndTime = Date.now() + 300000; 
        updateUI(); scheduleSync(); 
    }
}

window.setBet = function(amount) { document.getElementById('bet-input').value = amount > coins ? coins : amount; }

window.openGame = function(gameType) {
    currentGame = gameType; gameChoice = null;
    const ui = document.getElementById('game-ui');
    document.getElementById('bet-input').value = 10;
    document.getElementById('win-panel').classList.add('hidden');
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('play-btn').innerText = "Играть";
    switchScreen('screen-game-play');

    if (gameType === 'cups') {
        document.getElementById('game-header-title').innerText = "🥥 Наперстки";
        ui.innerHTML = `<p>Выбери стаканчик</p><div class="slots-container" style="background:transparent; border:none; box-shadow:none;">
            <div class="slot-reel" style="background:transparent; border:none;" id="cup-1" onclick="selectChoice('cups', 1)">🥥</div>
            <div class="slot-reel" style="background:transparent; border:none;" id="cup-2" onclick="selectChoice('cups', 2)">🥥</div>
            <div class="slot-reel" style="background:transparent; border:none;" id="cup-3" onclick="selectChoice('cups', 3)">🥥</div></div>`;
    } else if (gameType === 'dice') {
        document.getElementById('game-header-title').innerText = "🎲 Кости";
        ui.innerHTML = `<p>Сумма > 7?</p><div class="dice-container"><div class="dice-box" id="d1">⚀</div><div class="dice-box" id="d2">⚀</div></div>
            <div style="display:flex; gap:15px; margin-top:20px;">
            <button class="quick-bet" id="d-yes" onclick="selectChoice('dice', true)">Да</button>
            <button class="quick-bet" id="d-no" onclick="selectChoice('dice', false)">Нет</button></div>`;
    } else if (gameType === 'coin') {
        document.getElementById('game-header-title').innerText = "🪙 Монетка";
        ui.innerHTML = `<p>Орел или Решка?</p><div class="coin-wrapper"><div class="coin-3d" id="coin-obj">🪙</div></div>
            <div style="display:flex; gap:15px; margin-top:20px;">
            <button class="quick-bet" id="c-yes" onclick="selectChoice('coin', true)">Орел</button>
            <button class="quick-bet" id="c-no" onclick="selectChoice('coin', false)">Решка</button></div>`;
    } else if (gameType === 'slots') {
        document.getElementById('game-header-title').innerText = "🎰 Слоты";
        ui.innerHTML = `<p>Поймай 3 одинаковых (x10)</p><div class="slots-container">
            <div class="slot-reel" id="r1">🍒</div><div class="slot-reel" id="r2">🍋</div><div class="slot-reel" id="r3">💎</div></div>`;
        gameChoice = true;
    } else if (gameType === 'wheel') {
        document.getElementById('game-header-title').innerText = "🎡 Колесо";
        ui.innerHTML = `<p>Испытай удачу!</p><div class="wheel-wrapper">
            <div class="wheel-pointer">▼</div><div class="wheel-circle" id="wheel-obj"></div><div class="wheel-center">🐾</div></div>`;
        gameChoice = true;
    } else if (gameType === 'guess') {
        document.getElementById('game-header-title').innerText = "🔢 Угадай число";
        ui.innerHTML = `<p>Выбери число от 1 до 10</p><div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:10px; margin-top:20px;">
            ${[1,2,3,4,5,6,7,8,9,10].map(n => `<div class="quick-bet" id="g-${n}" onclick="selectChoice('guess', ${n})">${n}</div>`).join('')}</div>`;
    }
}

window.selectChoice = function(game, choice) { 
    gameChoice = choice; if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium'); 
    if (game === 'cups') { document.querySelectorAll('.slot-reel').forEach(c => c.style.border='none'); document.getElementById('cup-'+choice).style.border='2px solid var(--accent-blue)'; }
    if (game === 'dice') { document.getElementById('d-yes').style.background='rgba(255,255,255,0.1)'; document.getElementById('d-no').style.background='rgba(255,255,255,0.1)'; document.getElementById(choice?'d-yes':'d-no').style.background='var(--accent-blue)'; }
    if (game === 'coin') { document.getElementById('c-yes').style.background='rgba(255,255,255,0.1)'; document.getElementById('c-no').style.background='rgba(255,255,255,0.1)'; document.getElementById(choice?'c-yes':'c-no').style.background='var(--accent-blue)'; }
    if (game === 'guess') { document.querySelectorAll('.quick-bet').forEach(b=>b.style.border='none'); document.getElementById('g-'+choice).style.border='2px solid var(--accent-blue)'; }
}

window.executeGame = async function() {
    if (!gameChoice) { alert("Сначала сделайте выбор!"); return; }
    const bet = parseInt(document.getElementById('bet-input').value);
    if (isNaN(bet) || bet <= 0 || bet > coins) { alert('Недостаточно монет!'); return; }

    const playBtn = document.getElementById('play-btn');
    playBtn.disabled = true; playBtn.innerText = "Ждем-с...";
    document.getElementById('progress-fill').style.width = '100%';

    if (currentGame === 'dice') document.querySelectorAll('.dice-box').forEach(d => d.classList.add('rolling'));
    else if (currentGame === 'coin') document.getElementById('coin-obj').classList.add('flipping');
    else if (currentGame === 'slots') {
        document.getElementById('r1').classList.add('spinning');
        setTimeout(()=>document.getElementById('r2').classList.add('spinning'), 200);
        setTimeout(()=>document.getElementById('r3').classList.add('spinning'), 400);
    }
    else if (currentGame === 'wheel') document.getElementById('wheel-obj').style.transform = `rotate(${Math.floor(Math.random()*360)+1440}deg)`;

    setTimeout(async () => {
        let win = false;
        let mult = 0;
        
        if (currentGame === 'cups') {
            win = (gameChoice === Math.floor(Math.random()*3)+1);
        } else if (currentGame === 'dice') {
            win = (gameChoice === ((Math.ceil(Math.random()*6) + Math.ceil(Math.random()*6)) > 7));
            mult = 2;
        } else if (currentGame === 'coin') {
            win = (gameChoice === (Math.random()<0.5));
            mult = 2;
        } else if (currentGame === 'slots') {
            win = Math.random() < 0.2; mult = 10;
        } else if (currentGame === 'wheel') {
            win = Math.random() < 0.2; mult = 5;
        } else if (currentGame === 'guess') {
            win = (gameChoice === Math.floor(Math.random()*10)+1); mult = 10;
        }

        try {
            const r = await fetchWithTimeout(`${API_URL}/api/game`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ initData: tg.initData, bet: bet, win: win }) });
            const d = await r.json();
            if (d.coins !== undefined) {
                coins = d.coins; updateUI();
                
                if (win) {
                    document.getElementById('win-panel').classList.remove('hidden');
                    document.getElementById('win-amount').innerText = bet * (mult || 2) - bet;
                    document.getElementById('win-multiplier').innerText = `x${mult || 2}`;
                    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success'); 
                } else {
                    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error'); 
                }
            }
        } catch(e) { alert('Ошибка сети'); }
        
        document.querySelectorAll('.dice-box, .slot-reel').forEach(el => el.classList.remove('rolling', 'spinning'));
        if(document.getElementById('coin-obj')) document.getElementById('coin-obj').classList.remove('flipping');
        document.getElementById('progress-fill').style.width = '0%';
        playBtn.disabled = false; playBtn.innerText = "Играть снова";
    }, 2000);
}

function checkBonusStatus() {
    const btn = document.getElementById('claim-bonus-btn');
    if (!userData.last_bonus) { btn.disabled = false; return; }
    const diff = 86400000 - (Date.now() - new Date(userData.last_bonus).getTime());
    if (diff > 0) { btn.disabled = true; document.getElementById('bonus-timer').innerText = `Ждать: ${Math.floor(diff/3600000)}ч`; } 
    else { btn.disabled = false; }
}

document.getElementById('claim-bonus-btn').addEventListener('click', async () => {
    try {
        const r = await fetchWithTimeout(`${API_URL}/api/bonus`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ initData: tg.initData }) });
        if (r.ok) { const d = await r.json(); coins = d.coins; userData.last_bonus = new Date().toISOString(); updateUI(); checkBonusStatus(); alert(`🎁 +${d.amount} Kisa!`); }
    } catch(e) { alert('Ошибка'); }
});

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    try {
        const r = await fetchWithTimeout(`${API_URL}/api/leaderboard`, { method: 'GET' });
        const data = await r.json();
        container.innerHTML = data.map((p, i) => `<div class="leader-row"><div class="leader-left"><span>${i+1}</span><img class="leader-avatar" src="${p.photo_url || 'https://ui-avatars.com/api/?name=U&background=00D1FF&color=fff'}"><span>${p.username || 'Игрок'}</span></div><span class="leader-coins">${p.coins} 🐾</span></div>`).join('');
    } catch(e) { container.innerHTML = 'Ошибка'; }
}

loadProgress();
