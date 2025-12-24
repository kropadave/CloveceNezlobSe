console.log("Royal Ludo Fixed v10.0");

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
const MAP_PATH = [
    {x:4, y:10}, {x:4, y:9}, {x:4, y:8}, {x:4, y:7}, {x:4, y:6}, 
    {x:3, y:6}, {x:2, y:6}, {x:1, y:6}, {x:0, y:6}, 
    {x:0, y:5}, {x:0, y:4}, {x:1, y:4}, {x:2, y:4}, {x:3, y:4}, {x:4, y:4}, 
    {x:4, y:3}, {x:4, y:2}, {x:4, y:1}, {x:4, y:0}, 
    {x:5, y:0}, {x:6, y:0}, {x:6, y:1}, {x:6, y:2}, {x:6, y:3}, {x:6, y:4}, 
    {x:7, y:4}, {x:8, y:4}, {x:9, y:4}, {x:10, y:4}, 
    {x:10, y:5}, {x:10, y:6}, {x:9, y:6}, {x:8, y:6}, {x:7, y:6}, {x:6, y:6}, 
    {x:6, y:7}, {x:6, y:8}, {x:6, y:9}, {x:6, y:10}, 
    {x:5, y:10}
];

const HOMES = {
    0: [{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}], 
    1: [{x:1, y:5}, {x:2, y:5}, {x:3, y:5}, {x:4, y:5}], 
    2: [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}], 
    3: [{x:9, y:5}, {x:8, y:5}, {x:7, y:5}, {x:6, y:5}]  
};

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
peer.on('open', (id) => { 
    document.getElementById('my-id-code').innerText = id; 
    console.log("My Peer ID:", id);
});
peer.on('error', (err) => alert("Chyba sítě: " + err.type));

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
    hostConn.on('open', () => {
        document.getElementById('connection-status').innerText = "Spojeno! Čekám na data...";
    });
    hostConn.on('data', (d) => handleNetworkData(d));
    hostConn.on('close', () => alert("Hostitel se odpojil."));
});

document.getElementById('start-game-btn').addEventListener('click', () => {
    // Pro testování povolíme hru i v jednom, ale varujeme
    if (PLAYERS.length < 2) {
        if(!confirm("Opravdu chceš hrát sám? Hra je pro 2-4 hráče.")) return;
    }
    broadcast({ type: 'START_GAME' });
    initGame();
});

function handleNetworkData(data) {
    console.log("Data received:", data.type);
    if (myPlayerId !== 0) { // Client
        if (data.type === 'WELCOME') { 
            myPlayerId = data.id; 
            PLAYERS = data.players; 
            updateLobbyUI(); 
        }
        if (data.type === 'LOBBY_UPDATE') { 
            PLAYERS = data.players; 
            updateLobbyUI(); 
        }
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
    // Zabrání duplicitě
    if (PLAYERS.find(p => p.id === id)) return;
    PLAYERS.push({ ...CHARACTERS[id], tokens: [-1, -1, -1, -1] });
    updateLobbyUI();
}

function updateLobbyUI() {
    playerList.innerHTML = '';
    PLAYERS.forEach(p => {
        playerList.innerHTML += `<li style="border-left:5px solid ${p.color}">${p.icon} ${p.name}</li>`;
    });
    if (myPlayerId === 0) {
        startGameBtn.disabled = false; // Povolíme tlačítko vždy pro testování
        startGameBtn.innerText = `SPUSTIT HRU (${PLAYERS.length})`;
    }
}

// ==========================================
// HERNÍ LOGIKA
// ==========================================

function initGame() {
    lobbyOverlay.classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    // Generování UI hráčů - JEN PRO EXISTUJÍCÍ HRÁČE
    playersBar.innerHTML = '';
    PLAYERS.forEach(p => {
        if (!p) return; // Ochrana proti undefined
        playersBar.innerHTML += `
            <div class="player-badge ${p.class}" id="badge-${p.id}">
                <div class="avatar-icon">${p.icon}</div>
                <div class="p-name">${p.name}</div>
                <div class="seven-dot" id="dot-${p.id}"></div>
            </div>`;
    });

    initBoard();
    if (myPlayerId === 0) resetTurn(0);
    renderGame();
}

function resetTurn(pid) {
    GAME_STATE.currentPlayerIndex = pid;
    GAME_STATE.currentRoll = 1;
    GAME_STATE.turnStep = 'ROLL';
    GAME_STATE.teleportActive = false;
    
    // Má nějaké figurky ve hře?
    const inPlay = PLAYERS[pid].tokens.some(t => t !== -1 && t < 100);
    GAME_STATE.rollsLeft = inPlay ? 1 : 3;
    GAME_STATE.lastActionText = `Na tahu: ${PLAYERS[pid].name}`;

    sendState();
}

function handleRollLogic() {
    let roll;
    if (Math.random() < 0.15) roll = 7; 
    else roll = Math.floor(Math.random() * 6) + 1;
    
    GAME_STATE.currentRoll = roll;
    sendState(); // Ukázat animaci
    
    setTimeout(() => finalizeRoll(roll), 600);
}

function finalizeRoll(roll) {
    const pid = GAME_STATE.currentPlayerIndex;
    GAME_STATE.rollsLeft--;

    if (roll === 7) {
        GAME_STATE.sevenCounters[pid]++;
        GAME_STATE.lastActionText = "Padla 7! Stojíš (+1 magie)";
        
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

function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex || GAME_STATE.teleportActive) return;

    const player = PLAYERS[pid];
    const roll = GAME_STATE.currentRoll;
    let currentPos = player.tokens[tokenIdx];
    
    // BOOST
    let moveAmount = roll;
    if (currentPos !== -1 && currentPos < 100 && SPECIAL_TILES.includes(currentPos % PATH_LENGTH)) {
        moveAmount = roll * 2;
        GAME_STATE.lastActionText = "BOOST! Dvojnásobek!";
    }

    let newPos = -1;

    if (currentPos === -1) {
        if (roll === 6) newPos = 0; 
        else return;
    } else if (currentPos >= 100) {
        let homeIdx = currentPos - 100;
        if (homeIdx + roll <= 3) newPos = 100 + homeIdx + roll;
        else return;
    } else {
        newPos = currentPos + moveAmount;
        if (newPos >= PATH_LENGTH) {
            let over = newPos - PATH_LENGTH;
            if (over <= 3) newPos = 100 + over;
            else return; 
        }
    }

    player.tokens[tokenIdx] = newPos;
    
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
    
    if (isOccupiedBySelfHome(pid, 0)) return; 

    GAME_STATE.sevenCounters[pid] = 0; 
    GAME_STATE.teleportActive = false;
    player.tokens[tokenIdx] = 100; // Skok do domečku
    
    checkWin(pid);
    nextPlayer();
}

function nextPlayer() {
    // Opravený výpočet dalšího hráče - modulo podle počtu reálných hráčů
    let nextPid = (GAME_STATE.currentPlayerIndex + 1) % PLAYERS.length;
    resetTurn(nextPid);
}

function checkKick(globalTarget, attackerId) {
    PLAYERS.forEach(p => {
        if (p.id !== attackerId) {
            p.tokens.forEach((t, idx) => {
                if (t !== -1 && t < 100) {
                    if (getGlobalPos(p.id, t) === globalTarget) {
                        p.tokens[idx] = -1; 
                        GAME_STATE.lastActionText = `VYHOZENÍ!`;
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
    if (!p) return []; // Safety
    let indices = [];
    p.tokens.forEach((pos, i) => {
        let moveAmount = roll;
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
                if (SPECIAL_TILES.includes(pathIdx)) cell.classList.add('special');
                // Vykreslit starty jen pro aktivní hráče
                PLAYERS.forEach(p => { 
                    if(p && p.startOffset === pathIdx) cell.classList.add(`start-${p.class}`); 
                });
            } else {
                let isHome = false;
                // Vykreslit domečky jen pro aktivní hráče
                PLAYERS.forEach((p, index) => {
                    if (p && HOMES[index].some(h=>h.x===x && h.y===y)) {
                        cell.classList.add(`home-p${index+1}`); isHome = true;
                    }
                });
                if (!isHome) cell.style.visibility = 'hidden';
            }
            board.appendChild(cell);
        }
    }
}

function renderGame() {
    const activePlayer = PLAYERS[GAME_STATE.currentPlayerIndex];
    if (!activePlayer) return; // Ještě nejsou načtená data

    statusText.innerText = GAME_STATE.lastActionText;
    statusText.style.color = activePlayer.color;
    infoMsg.innerText = "";

    // Badge update
    document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active'));
    const badge = document.getElementById(`badge-${activePlayer.id}`);
    if(badge) badge.classList.add('active');

    // Sedmičky
    PLAYERS.forEach(pl => {
        if (!pl) return;
        const el = document.getElementById(`dot-${pl.id}`);
        if(el) el.innerText = "⭐".repeat(GAME_STATE.sevenCounters[pl.id]);
    });

    // Ovládání
    const isMyTurn = (myPlayerId === GAME_STATE.currentPlayerIndex);
    rollBtn.disabled = !isMyTurn || GAME_STATE.turnStep !== 'ROLL';
    
    if (isMyTurn) {
        rollBtn.innerText = GAME_STATE.turnStep === 'ROLL' ? 'HODIT KOSTKOU' : 'VYBER FIGURKU';
        rollBtn.style.opacity = '1';
    } else {
        rollBtn.innerText = `ČEKEJ NA SOUPEŘE`;
        rollBtn.style.opacity = '0.5';
    }

    if(GAME_STATE.teleportActive && isMyTurn) {
        rollBtn.style.display = 'none';
        infoMsg.innerText = "KLIKNI NA FIGURKU PRO TELEPORT!";
    } else {
        rollBtn.style.display = 'block';
    }

    if(myPlayerId !== null) sevenValUI.innerText = GAME_STATE.sevenCounters[myPlayerId] || 0;
    updateDiceVisual(GAME_STATE.currentRoll);

    // Figurky
    document.querySelectorAll('.token').forEach(t => t.remove());
    document.querySelectorAll('.kill-hint, .target-hint').forEach(c => c.classList.remove('kill-hint', 'target-hint'));

    PLAYERS.forEach(pl => {
        if (!pl) return;
        pl.tokens.forEach((pos, idx) => {
            let cell = null;
            if (pos === -1) cell = getCell(BASES[pl.id][idx]); 
            else if (pos >= 100) cell = getCell(HOMES[pl.id][pos-100]);
            else cell = getCell(MAP_PATH[getGlobalPos(pl.id, pos)]);

            if (cell) {
                if(pos===-1) cell.style.visibility='visible';

                const t = document.createElement('div');
                t.className = `token ${pl.class}`;
                t.innerText = pl.icon;
                
                // Interaktivita
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
    diceCube.className = 'dice-cube'; 
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
    else if (hostConn) hostConn.send({ type: 'ACTION_ROLL' });
});

function getCell(c) { return document.querySelector(`.cell[data-x="${c.x}"][data-y="${c.y}"]`); }
