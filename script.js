console.log("Royal Ludo Mobile v9.0 - Boost & Strict Turns");

// --- UI Elements ---
const board = document.getElementById('game-board');
const rollBtn = document.getElementById('roll-btn');
const diceCube = document.getElementById('dice-cube');
const statusText = document.getElementById('game-status-text');
const infoMsg = document.getElementById('info-msg');
const magicCounterUI = document.getElementById('magic-counter');
const sevenValUI = document.getElementById('seven-count-val');
const playersBar = document.getElementById('players-bar');
const lobbyOverlay = document.getElementById('lobby-overlay');
const lobbyMenu = document.getElementById('lobby-menu');
const hostPanel = document.getElementById('host-panel');
const clientPanel = document.getElementById('client-panel');
const playerList = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');

// --- Konfigurace ---
const BOARD_SIZE = 11;
const PATH_LENGTH = 40; 

// ⚡ 6 BOOST POLÍČEK (indexy na cestě 0-39)
// Rozmístěno symetricky: 5 (střed ramene), 12 (konec), 18, 25 (střed), 32, 38 (před cílem)
const SPECIAL_TILES = [5, 12, 18, 25, 32, 38]; 

const CHARACTERS = [
    { id: 0, name: 'Kočka', class: 'p1', icon: '🐱', startOffset: 0, color: '#ff7675' },
    { id: 1, name: 'Myš', class: 'p2', icon: '🐭', startOffset: 10, color: '#0984e3' },
    { id: 2, name: 'Liška', class: 'p3', icon: '🦊', startOffset: 20, color: '#00b894' },
    { id: 3, name: 'Méďa', class: 'p4', icon: '🐻', startOffset: 30, color: '#fdcb6e' }
];

let PLAYERS = []; 
let GAME_STATE = {
    currentPlayerIndex: 0,
    currentRoll: 1,
    turnStep: 'WAIT', 
    rollsLeft: 1,
    sevenCounters: { 0: 0, 1: 0, 2: 0, 3: 0 }, 
    teleportActive: false,
    lastActionText: "Čekání na hru..."
};

let myPlayerId = null;
let peer = null;
let connections = {};
let hostConn = null;

// --- MAPA ---
// Definice cesty po obvodu 11x11
const MAP_PATH = [
    {x:4, y:10}, {x:4, y:9}, {x:4, y:8}, {x:4, y:7}, {x:4, y:6}, // Spodek start
    {x:3, y:6}, {x:2, y:6}, {x:1, y:6}, {x:0, y:6}, // Levé rameno do kraje
    {x:0, y:5}, {x:0, y:4}, {x:1, y:4}, {x:2, y:4}, {x:3, y:4}, {x:4, y:4}, // Zpět
    {x:4, y:3}, {x:4, y:2}, {x:4, y:1}, {x:4, y:0}, // Nahoru
    {x:5, y:0}, {x:6, y:0}, {x:6, y:1}, {x:6, y:2}, {x:6, y:3}, {x:6, y:4}, // Dolů
    {x:7, y:4}, {x:8, y:4}, {x:9, y:4}, {x:10, y:4}, // Doprava
    {x:10, y:5}, {x:10, y:6}, {x:9, y:6}, {x:8, y:6}, {x:7, y:6}, {x:6, y:6}, // Zpět
    {x:6, y:7}, {x:6, y:8}, {x:6, y:9}, {x:6, y:10}, // Dolů do cíle
    {x:5, y:10} // Poslední
];

const HOMES = {
    0: [{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}], 
    1: [{x:1, y:5}, {x:2, y:5}, {x:3, y:5}, {x:4, y:5}], 
    2: [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}], 
    3: [{x:9, y:5}, {x:8, y:5}, {x:7, y:5}, {x:6, y:5}]  
};

// Base positions (visual only)
const BASES = {
    0: [{x:0,y:10}, {x:1,y:10}, {x:0,y:9}, {x:1,y:9}],
    1: [{x:0,y:0}, {x:1,y:0}, {x:0,y:1}, {x:1,y:1}],
    2: [{x:9,y:0}, {x:10,y:0}, {x:9,y:1}, {x:10,y:1}],
    3: [{x:9,y:10}, {x:10,y:10}, {x:9,y:9}, {x:10,y:9}]
};

// ==========================================
// SÍŤ
// ==========================================

peer = new Peer(null);
peer.on('open', (id) => { document.getElementById('my-id-code').innerText = id; });

// HOST
document.getElementById('create-btn').addEventListener('click', () => {
    myPlayerId = 0;
    setupPlayer(0);
    lobbyMenu.classList.add('hidden');
    hostPanel.classList.remove('hidden');

    peer.on('connection', (c) => {
        c.on('open', () => {
            const newId = PLAYERS.length;
            if (newId >= 4) { c.send({type: 'ERROR', msg: 'Plno'}); c.close(); return; }
            connections[newId] = c;
            setupPlayer(newId);
            c.send({ type: 'WELCOME', id: newId, players: PLAYERS });
            broadcast({ type: 'LOBBY_UPDATE', players: PLAYERS });
        });
        c.on('data', (d) => handleNetworkData(d));
    });
});

// CLIENT
document.getElementById('join-btn').addEventListener('click', () => {
    const rawId = document.getElementById('join-input').value.trim();
    if (!rawId) return alert("Zadej kód!");
    lobbyMenu.classList.add('hidden');
    clientPanel.classList.remove('hidden');
    hostConn = peer.connect(rawId);
    hostConn.on('open', () => document.getElementById('connection-status').innerText = "Připojeno!");
    hostConn.on('data', (d) => handleNetworkData(d));
});

document.getElementById('start-game-btn').addEventListener('click', () => {
    if (PLAYERS.length < 2) return alert("Potřebuješ alespoň 2 hráče!");
    broadcast({ type: 'START_GAME' });
    initGame();
});

function handleNetworkData(data) {
    if (myPlayerId !== 0) { // Client
        if (data.type === 'WELCOME') { myPlayerId = data.id; PLAYERS = data.players; updateLobbyUI(); }
        if (data.type === 'LOBBY_UPDATE') { PLAYERS = data.players; updateLobbyUI(); }
        if (data.type === 'START_GAME') initGame();
        if (data.type === 'STATE_UPDATE') { 
            GAME_STATE = data.state; 
            PLAYERS = data.players; 
            renderGame(); 
        }
    } else { // Host
        if (data.type === 'ACTION_ROLL') handleRollLogic();
        if (data.type === 'ACTION_MOVE') handleMoveLogic(data.pid, data.tokenIdx);
        if (data.type === 'ACTION_TELEPORT') handleTeleportLogic(data.pid, data.tokenIdx);
    }
}

function broadcast(msg) {
    Object.values(connections).forEach(c => c.send(msg));
}

function setupPlayer(id) {
    PLAYERS.push({ ...CHARACTERS[id], tokens: [-1, -1, -1, -1] });
    updateLobbyUI();
}
function updateLobbyUI() {
    playerList.innerHTML = '';
    PLAYERS.forEach(p => {
        playerList.innerHTML += `<li style="border-left:5px solid ${p.color}">${p.icon} ${p.name}</li>`;
    });
    if (myPlayerId === 0) startGameBtn.disabled = PLAYERS.length < 2;
}

// ==========================================
// HERNÍ LOGIKA (HOST)
// ==========================================

function initGame() {
    lobbyOverlay.classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    initBoard();
    if (myPlayerId === 0) resetTurn(0);
    renderGame();
}

function resetTurn(pid) {
    GAME_STATE.currentPlayerIndex = pid;
    GAME_STATE.currentRoll = 1;
    GAME_STATE.turnStep = 'ROLL';
    GAME_STATE.teleportActive = false;
    
    const inPlay = PLAYERS[pid].tokens.some(t => t !== -1 && t < 100);
    GAME_STATE.rollsLeft = inPlay ? 1 : 3;
    GAME_STATE.lastActionText = `Na tahu: ${PLAYERS[pid].name}`;

    sendState();
}

// HOD
function handleRollLogic() {
    let roll;
    if (Math.random() < 0.15) roll = 7; 
    else roll = Math.floor(Math.random() * 6) + 1;
    
    // Broadcast roll immediately for animation
    GAME_STATE.currentRoll = roll;
    sendState(); 
    
    setTimeout(() => finalizeRoll(roll), 600);
}

function finalizeRoll(roll) {
    const pid = GAME_STATE.currentPlayerIndex;
    GAME_STATE.rollsLeft--;

    if (roll === 7) {
        GAME_STATE.sevenCounters[pid]++;
        GAME_STATE.lastActionText = "Padla SEDMIČKA! (Stojíš)";
        
        if (GAME_STATE.sevenCounters[pid] >= 3) {
            GAME_STATE.turnStep = 'MOVE'; 
            GAME_STATE.teleportActive = true; 
            GAME_STATE.lastActionText = "TELEPORT AKTIVNÍ!";
        } else {
            if (GAME_STATE.rollsLeft <= 0) setTimeout(nextPlayer, 1500);
            else GAME_STATE.turnStep = 'ROLL';
        }
    } else {
        const moveable = getMoveableTokens(pid, roll);
        if (moveable.length > 0) {
            GAME_STATE.turnStep = 'MOVE';
            GAME_STATE.lastActionText = `Hozeno ${roll}. Hraj!`;
        } else {
            GAME_STATE.lastActionText = `Hozeno ${roll}. Žádný tah.`;
            if (GAME_STATE.rollsLeft > 0) GAME_STATE.turnStep = 'ROLL';
            else setTimeout(nextPlayer, 1000);
        }
    }
    sendState();
}

// POHYB
function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex || GAME_STATE.teleportActive) return;

    const player = PLAYERS[pid];
    const roll = GAME_STATE.currentRoll;
    let currentPos = player.tokens[tokenIdx];
    
    // ⚡ BOOST LOGIKA: Pokud stojím na boost políčku PŘED hodem, hod se násobí
    let moveAmount = roll;
    if (currentPos !== -1 && currentPos < 100 && SPECIAL_TILES.includes(currentPos % PATH_LENGTH)) {
        moveAmount = roll * 2;
        GAME_STATE.lastActionText = "BOOST! Dvojnásobný pohyb!";
    }

    let newPos = -1;

    // Nasazení (vždy jen o 1 na start, pokud padla 6)
    if (currentPos === -1) {
        if (roll === 6) newPos = 0; 
        else return;
    } 
    // Domeček
    else if (currentPos >= 100) {
        let homeIdx = currentPos - 100;
        if (homeIdx + roll <= 3) newPos = 100 + homeIdx + roll;
        else return;
    }
    // Mapa
    else {
        newPos = currentPos + moveAmount; // Zde aplikujeme Boost
        if (newPos >= PATH_LENGTH) {
            let over = newPos - PATH_LENGTH;
            if (over <= 3) newPos = 100 + over;
            else return; 
        }
    }

    player.tokens[tokenIdx] = newPos;
    
    // Vyhazování
    if (newPos < 100) {
        const globalPos = getGlobalPos(pid, newPos);
        checkKick(globalPos, pid);
    }
    
    checkWin(pid);

    if (roll === 6) {
        GAME_STATE.turnStep = 'ROLL';
        GAME_STATE.rollsLeft = 1;
        sendState();
    } else {
        nextPlayer();
    }
}

function handleTeleportLogic(pid, tokenIdx) {
    if (!GAME_STATE.teleportActive || pid !== GAME_STATE.currentPlayerIndex) return;
    const player = PLAYERS[pid];
    
    // Teleport na začátek domečku (políčko 100)
    // Kontrola: Je tam místo?
    if (isOccupiedBySelfHome(pid, 0)) return; // Plno

    GAME_STATE.sevenCounters[pid] = 0; // Reset
    GAME_STATE.teleportActive = false;
    player.tokens[tokenIdx] = 100;
    
    checkWin(pid);
    nextPlayer();
}

function nextPlayer() {
    let nextPid = (GAME_STATE.currentPlayerIndex + 1) % PLAYERS.length;
    resetTurn(nextPid);
}

function checkKick(globalTarget, attackerId) {
    PLAYERS.forEach(p => {
        if (p.id !== attackerId) {
            p.tokens.forEach((t, idx) => {
                if (t !== -1 && t < 100) {
                    if (getGlobalPos(p.id, t) === globalTarget) {
                        p.tokens[idx] = -1; // KICK!
                        GAME_STATE.lastActionText = `Au! ${p.name} vyhozen!`;
                    }
                }
            });
        }
    });
}

function checkWin(pid) {
    if (PLAYERS[pid].tokens.every(t => t >= 100)) {
        alert(`🏆 ${PLAYERS[pid].name} VYHRÁL!`);
        location.reload();
    }
}

function sendState() {
    const data = { type: 'STATE_UPDATE', state: GAME_STATE, players: PLAYERS };
    if (myPlayerId === 0) {
        handleNetworkData(data);
        broadcast(data);
    }
}

// Helpers
function getGlobalPos(pid, localPos) {
    if (localPos === -1 || localPos >= 100) return null;
    return (localPos + PLAYERS[pid].startOffset) % PATH_LENGTH;
}
function getMoveableTokens(pid, roll) {
    const p = PLAYERS[pid];
    let indices = [];
    p.tokens.forEach((pos, i) => {
        let moveAmount = roll;
        // Check boost multiplier for validation
        if (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos % PATH_LENGTH)) moveAmount = roll * 2;

        if (pos === -1) {
            if (roll === 6 && !isOccupiedBySelf(pid, 0)) indices.push(i);
        } else if (pos < 100) {
            let next = pos + moveAmount;
            if (next >= 40) {
                let h = next - 40;
                if (h <= 3 && !isOccupiedBySelfHome(pid, h)) indices.push(i);
            } else if (!isOccupiedBySelf(pid, next)) indices.push(i);
        } else {
            let next = (pos - 100) + roll;
            if (next <= 3 && !isOccupiedBySelfHome(pid, next)) indices.push(i);
        }
    });
    return indices;
}
function isOccupiedBySelf(pid, localPos) { return PLAYERS[pid].tokens.includes(localPos); }
function isOccupiedBySelfHome(pid, hIdx) { return PLAYERS[pid].tokens.includes(100+hIdx); }

// ==========================================
// RENDER
// ==========================================
function initBoard() {
    board.innerHTML = '';
    for(let y=0; y<BOARD_SIZE; y++) {
        for(let x=0; x<BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.x = x; cell.dataset.y = y;
            
            const pathIdx = MAP_PATH.findIndex(p=>p.x===x && p.y===y);
            if (pathIdx !== -1) {
                cell.classList.add('path');
                // Boost políčka
                if (SPECIAL_TILES.includes(pathIdx)) cell.classList.add('special');
                // Start barvy
                PLAYERS.forEach(p => { if(p.startOffset === pathIdx) cell.classList.add(`start-${p.class}`); });
            } else {
                let isHome = false;
                for(let pid=0; pid<4; pid++) {
                    if (HOMES[pid].some(h=>h.x===x && h.y===y)) {
                        cell.classList.add(`home-p${pid+1}`); isHome = true;
                    }
                }
                if (!isHome) cell.style.visibility = 'hidden';
            }
            board.appendChild(cell);
        }
    }
    // Vykreslit UI hráčů
    playersBar.innerHTML = '';
    PLAYERS.forEach(p => {
        playersBar.innerHTML += `
            <div class="player-badge ${p.class}" id="badge-${p.id}">
                <div class="avatar-icon">${p.icon}</div>
                <div class="p-name">${p.name}</div>
                <div class="seven-dot" id="dot-${p.id}"></div>
            </div>`;
    });
}

function renderGame() {
    const activePlayer = PLAYERS[GAME_STATE.currentPlayerIndex];
    statusText.innerText = GAME_STATE.lastActionText;
    statusText.style.color = activePlayer.color;
    infoMsg.innerText = "";

    // Badge update
    document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active'));
    const badge = document.getElementById(`badge-${activePlayer.id}`);
    if(badge) badge.classList.add('active');

    // Sedmičky
    PLAYERS.forEach(pl => {
        const el = document.getElementById(`dot-${pl.id}`);
        if(el) el.innerText = "⭐".repeat(GAME_STATE.sevenCounters[pl.id]);
    });

    // Ovládání
    const isMyTurn = (myPlayerId === GAME_STATE.currentPlayerIndex);
    rollBtn.disabled = !isMyTurn || GAME_STATE.turnStep !== 'ROLL';
    rollBtn.innerText = isMyTurn ? (GAME_STATE.turnStep === 'ROLL' ? 'HODIT' : 'HRAJ') : 'ČEKEJ';
    if(GAME_STATE.teleportActive && isMyTurn) {
        rollBtn.style.display = 'none';
        infoMsg.innerText = "Vyber figurku pro TELEPORT!";
    } else {
        rollBtn.style.display = 'block';
    }

    if(myPlayerId !== null) sevenValUI.innerText = GAME_STATE.sevenCounters[myPlayerId];
    updateDiceVisual(GAME_STATE.currentRoll);

    // Figurky
    document.querySelectorAll('.token').forEach(t => t.remove());
    document.querySelectorAll('.kill-hint, .target-hint').forEach(c => c.classList.remove('kill-hint', 'target-hint'));

    PLAYERS.forEach(pl => {
        pl.tokens.forEach((pos, idx) => {
            let cell = null;
            if (pos === -1) cell = getCell(BASES[pl.id][idx]); // Base
            else if (pos >= 100) cell = getCell(HOMES[pl.id][pos-100]);
            else cell = getCell(MAP_PATH[getGlobalPos(pl.id, pos)]);

            if (cell) {
                // Pokud je v base, chceme aby byla vidět
                if(pos===-1) cell.style.visibility='visible';

                const t = document.createElement('div');
                t.className = `token ${pl.class}`;
                t.innerText = pl.icon;
                
                // Interaktivita jen pro mě
                if (isMyTurn) {
                    const moveable = getMoveableTokens(pl.id, GAME_STATE.currentRoll);
                    
                    if (GAME_STATE.teleportActive) {
                        if (pos < 100 && !isOccupiedBySelfHome(pl.id, 0)) {
                            t.classList.add('highlight');
                            t.onclick = () => sendAction('TELEPORT', idx);
                        }
                    } else if (GAME_STATE.turnStep === 'MOVE' && moveable.includes(idx)) {
                        t.classList.add('highlight');
                        t.onclick = () => sendAction('MOVE', idx);
                        showTargetHint(pl.id, pos, GAME_STATE.currentRoll);
                    }
                }
                cell.appendChild(t);
            }
        });
    });
}

function showTargetHint(pid, pos, roll) {
    let moveAmount = roll;
    if (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos % PATH_LENGTH)) moveAmount = roll * 2;

    let targetCell = null;
    let isKill = false;

    if (pos === -1) {
        let globalStart = PLAYERS[pid].startOffset;
        targetCell = getCell(MAP_PATH[globalStart]);
        isKill = isEnemyHere(globalStart, pid);
    } else if (pos < 100) {
        let next = pos + moveAmount;
        if (next < 40) {
            let globalNext = getGlobalPos(pid, next);
            targetCell = getCell(MAP_PATH[globalNext]);
            isKill = isEnemyHere(globalNext, pid);
        }
    }
    if (targetCell) targetCell.classList.add(isKill ? 'kill-hint' : 'target-hint');
}

function isEnemyHere(globalIdx, myPid) {
    return PLAYERS.some(p => p.id !== myPid && p.tokens.some(t => t<100 && t!==-1 && getGlobalPos(p.id, t)===globalIdx));
}

function updateDiceVisual(n) {
    diceCube.className = 'dice-cube'; // Reset
    if(n === 7) diceCube.classList.add('show-seven');
    else {
        const rot = { 1:'rotateX(0deg) rotateY(0deg)', 2:'rotateX(0deg) rotateY(180deg)', 3:'rotateX(0deg) rotateY(-90deg)', 4:'rotateX(0deg) rotateY(90deg)', 5:'rotateX(-90deg) rotateY(0deg)', 6:'rotateX(90deg) rotateY(0deg)' };
        diceCube.style.transform = rot[n] || rot[1];
    }
}

function sendAction(type, tokenIdx) {
    if (myPlayerId === 0) {
        if (type === 'MOVE') handleMoveLogic(0, tokenIdx);
        if (type === 'TELEPORT') handleTeleportLogic(0, tokenIdx);
    } else {
        hostConn.send({ type: `ACTION_${type}`, pid: myPlayerId, tokenIdx });
    }
}

rollBtn.addEventListener('click', () => {
    if (myPlayerId === 0) handleRollLogic();
    else hostConn.send({ type: 'ACTION_ROLL' });
});

function getCell(c) { return document.querySelector(`.cell[data-x="${c.x}"][data-y="${c.y}"]`); }
