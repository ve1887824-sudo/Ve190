const API_URL = 'https://ve190-9.onrender.com'; 
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

let coins = 0;
let userData = {};

// RPG Переменные
let heroLevel = 1;
let heroMaxHp = 100;
let heroHp = 100;
let heroPower = 15; 
let currentLocation = '';
let isFighting = false;
let currentMonster = null;

window.switchScreen = function(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (screenId === 'screen-main') document.getElementById('nav-main').classList.add('active');
}

function formatMoney(num) {
    return Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function updateUI() {
    document.getElementById('balance-header').innerText = formatMoney(coins);
    document.getElementById('main-level').innerText = heroLevel;
    document.getElementById('main-xp').innerText = (heroLevel * 100) - 100; // Просто для красоты
    document.getElementById('main-max-xp').innerText = heroLevel * 100;
    document.getElementById('xp-fill').style.width = `${(heroLevel % 10) * 10}%`; // Заглушка
    
    const hpText = document.getElementById('rpg-hp-text');
    if (hpText) hpText.innerText = `HP: ${Math.floor(heroHp)}/${heroMaxHp}`;
}

// Восстановление HP вне боя
setInterval(() => {
    if (!isFighting && heroHp < heroMaxHp) {
        heroHp += 2;
        if (heroHp > heroMaxHp) heroHp = heroMaxHp;
        updateUI();
    }
}, 1000);

// СИНХРОНИЗАЦИЯ
let syncTimer = null;
async function sync() {
    if (!tg?.initData) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
        try {
            await fetch(`${API_URL}/api/sync`, { 
                method:'POST', headers:{'Content-Type':'application/json'}, 
                body: JSON.stringify({ 
                    initData: tg.initData, 
                    addCoins: 0, 
                    heroLevel: heroLevel,
                    heroHp: Math.floor(heroHp),
                    heroPower: heroPower
                }) 
            });
        } catch(e) { console.warn('sync error', e); }
    }, 2000);
}

async function loadProgress() {
    if (!tg?.initData) return;
    try {
        const r = await fetch(`${API_URL}/api/load`, { 
            method:'POST', headers:{'Content-Type':'application/json'}, 
            body: JSON.stringify({ initData: tg.initData }) 
        });
        userData = await r.json();
        
        coins = parseInt(userData.coins) || 0; 
        heroLevel = parseInt(userData.heroLevel) || 1;
        heroHp = parseInt(userData.heroHp) || 100;
        heroMaxHp = 100 + (heroLevel * 20);
        if(heroHp > heroMaxHp) heroHp = heroMaxHp;
        heroPower = parseInt(userData.heroPower) || 15;
        
        updateUI();
    } catch(e) { console.warn('load error', e); }
}

// ==========================================
// КАРТА
// ==========================================
window.openRPG = function() {
    switchScreen('screen-rpg');
    isFighting = false;
    renderMap();
}

function renderMap() {
    const area = document.getElementById('rpg-area');
    const getLock = (reqLvl) => heroLevel < reqLvl ? '🔒' : '';

    area.innerHTML = `
        <div class="map-container">
            <div style="text-align: center; margin-bottom: 10px;">
                <div style="font-size: 14px; color: var(--text-muted);">Твой уровень: <b>${heroLevel}</b></div>
                <div style="font-size: 12px; color: var(--accent-green);">⚔️ Сила атаки: ${heroPower}</div>
            </div>

            <div class="map-location loc-forest" onclick="enterLocation('forest')">
                <div class="loc-icon">🌲</div>
                <div class="loc-lvl">Ур. 1-3</div>
                <div class="loc-content">
                    <div class="loc-title">Темный Лес</div>
                    <div class="loc-desc">Гоблины и дикие звери</div>
                </div>
            </div>

            <div class="map-location loc-cave" onclick="enterLocation('cave')" style="${heroLevel < 3 ? 'opacity: 0.5;' : ''}">
                <div class="loc-icon">🕷️</div>
                <div class="loc-lvl">Ур. 3+ ${getLock(3)}</div>
                <div class="loc-content">
                    <div class="loc-title">Пещера Пауков</div>
                    <div class="loc-desc">Ядовитые твари и скелеты</div>
                </div>
            </div>

            <div class="map-location loc-castle" onclick="enterLocation('castle')" style="${heroLevel < 5 ? 'opacity: 0.5;' : ''}">
                <div class="loc-icon">🐉</div>
                <div class="loc-lvl">Ур. 5+ ${getLock(5)}</div>
                <div class="loc-content">
                    <div class="loc-title">Замок Дракона</div>
                    <div class="loc-desc">Обитель древнего босса</div>
                </div>
            </div>
        </div>
    `;
}

window.enterLocation = function(loc) {
    if (loc === 'cave' && heroLevel < 3) { alert('Нужен 3 уровень!'); return; }
    if (loc === 'castle' && heroLevel < 5) { alert('Нужен 5 уровень!'); return; }
    
    currentLocation = loc;
    startBattle();
}

function startBattle() {
    isFighting = true;
    const area = document.getElementById('rpg-area');
    
    let monster = { name: "Гоблин", icon: "👺", hp: 60, dmg: 12, reward: 500 };
    if (currentLocation === 'cave') monster = { name: "Король Пауков", icon: "🕷️", hp: 120, dmg: 20, reward: 2000 };
    if (currentLocation === 'castle') monster = { name: "Древний Дракон", icon: "🐉", hp: 300, dmg: 40, reward: 10000 };

    monster.hp += (heroLevel * 10);
    monster.dmg += (heroLevel * 2);

    currentMonster = monster;
    currentMonster.maxHp = currentMonster.hp;

    area.innerHTML = `
        <div class="battle-screen">
            <div class="enemy-zone">
                <div class="loc-title" style="color: var(--accent-red); font-size: 20px; margin-bottom: 10px;">${monster.name}</div>
                <div class="enemy-sprite">${monster.icon}</div>
                <div style="width: 80%; margin-top: 20px;">
                    <div class="hp-text"><span>HP Врага</span><span id="enemy-hp-txt">${monster.hp}/${monster.maxHp}</span></div>
                    <div class="hp-bar-bg"><div class="hp-bar-fill hp-enemy" id="enemy-hp-bar" style="width: 100%;"></div></div>
                </div>
            </div>

            <div class="battle-log" id="b-log">
                <div>Вы вступили в бой с ${monster.name}!</div>
            </div>

            <div class="hero-zone">
                <div class="hero-sprite">🧙‍♂️</div>
                <div style="width: 60%;">
                    <div class="hp-text"><span>Твое HP</span><span id="hero-hp-txt">${Math.floor(heroHp)}/${heroMaxHp}</span></div>
                    <div class="hp-bar-bg"><div class="hp-bar-fill hp-hero" id="hero-hp-bar" style="width: ${(heroHp/heroMaxHp)*100}%;"></div></div>
                </div>
            </div>

            <button class="btn-attack" id="attack-btn" onclick="attackTurn()">⚔️ Атаковать</button>
        </div>
    `;
}

window.attackTurn = function() {
    if (!isFighting) return;
    document.getElementById('attack-btn').disabled = true;
    let log = document.getElementById('b-log');

    let isCrit = Math.random() < 0.15;
    let dmg = isCrit ? heroPower * 2 : heroPower;
    
    currentMonster.hp -= dmg;
    if (currentMonster.hp < 0) currentMonster.hp = 0;

    if (isCrit) log.innerHTML += `<div style="color: gold">💥 КРИТ! Ты нанес ${dmg} урона!</div>`;
    else log.innerHTML += `<div>⚔️ Ты нанес ${dmg} урона.</div>`;

    updateBattleUI();

    if (currentMonster.hp <= 0) {
        winBattle();
        return;
    }

    setTimeout(() => {
        let mDmg = currentMonster.dmg + Math.floor(Math.random() * 5);
        heroHp -= mDmg;
        if (heroHp < 0) heroHp = 0;
        
        log.innerHTML += `<div style="color: #ef4444">👹 ${currentMonster.name} бьет на ${mDmg} урона.</div>`;
        log.scrollTop = log.scrollHeight;
        updateBattleUI();

        if (heroHp <= 0) {
            loseBattle();
            return;
        }

        document.getElementById('attack-btn').disabled = false;
        if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
    }, 600);
}

function updateBattleUI() {
    document.getElementById('enemy-hp-txt').innerText = `${currentMonster.hp}/${currentMonster.maxHp}`;
    document.getElementById('enemy-hp-bar').style.width = `${(currentMonster.hp/currentMonster.maxHp)*100}%`;
    
    document.getElementById('hero-hp-txt').innerText = `${Math.floor(heroHp)}/${heroMaxHp}`;
    document.getElementById('hero-hp-bar').style.width = `${(heroHp/heroMaxHp)*100}%`;
    document.getElementById('rpg-hp-text').innerText = `HP: ${Math.floor(heroHp)}/${heroMaxHp}`;
}

function winBattle() {
    isFighting = false;
    coins += currentMonster.reward;
    heroLevel += 1;
    heroMaxHp += 20;
    heroPower += 3;
    updateUI();
    sync();

    const area = document.getElementById('rpg-area');
    area.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center;">
            <div style="font-size: 80px; margin-bottom: 20px;">🏆</div>
            <h2 style="color: var(--accent-green); margin-bottom: 10px;">Победа!</h2>
            <p>Вы победили ${currentMonster.name}!</p>
            <div style="font-size: 24px; color: var(--accent-yellow); font-weight: bold; margin: 15px 0;">+${formatMoney(currentMonster.reward)} 🐾</div>
            <p style="color: #a855f7; font-weight: bold;">Уровень повышен до ${heroLevel}!</p>
            
            <button class="btn-play" style="margin-top: 30px; background: var(--accent-green);" onclick="renderMap()">На карту</button>
        </div>
    `;
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
}

function loseBattle() {
    isFighting = false;
    heroHp = Math.floor(heroMaxHp * 0.3);
    sync();

    const area = document.getElementById('rpg-area');
    area.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center;">
            <div style="font-size: 80px; margin-bottom: 20px;">💀</div>
            <h2 style="color: var(--accent-red); margin-bottom: 10px;">Поражение</h2>
            <p>Вы пали в бою...</p>
            <p style="color: var(--text-muted); font-size: 14px; margin-top: 10px;">Но вы выжили и восстановили часть сил.</p>
            
            <button class="btn-play" style="margin-top: 30px;" onclick="renderMap()">Вернуться на карту</button>
        </div>
    `;
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
}

loadProgress();
