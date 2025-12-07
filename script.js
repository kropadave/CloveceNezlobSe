console.log("Royal Cats & Mouse v8.0 - Perfect Teleport");

// --- UI Elements ---
const board = document.getElementById('game-board');
const rollBtn = document.getElementById('roll-btn');
const diceCube = document.getElementById('dice-cube');
const statusText = document.getElementById('game-status-text');
const powerupIndicator = document.getElementById('powerup-indicator');

// Lobby
const lobbyOverlay = document.getElementById('lobby-overlay');
const hostStatus = document.getElementById('host-status');
const connectionStatus = document.getElementById('connection-status');
const p1Card = document.getElementById('p1-card');
const p2Card = document.getElementById('p2-card');

// --- Konfigurace ---
const BOARD_SIZE = 11;
const PATH_LENGTH = 40;

// Hráči
let PLAYERS = [
    { id: 0, name: 'Pinky', class: 'p1', startPos: 0, tokens: [-1, -1, -1, -1], baseIndices: [0, 1, 2, 3] },
    { id: 1, name: 'Brain', class: 'p2', startPos: 20, tokens: [-1, -1, -1, -1], baseIndices: [4, 5, 6, 7] }
];

let GAME_STATE = {
    currentPlayerIndex: 0,
    currentRoll: 1,
    waitingForMove: false,
    rollsLeft: 1, 
    turnStep: 'ROLL', // 'ROLL', 'MOVE', 'TELEPORT_SELECT'
    teleportPossible: false // Indikátor, že podmínky pro teleport jsou splněny
};

let myPlayerId = null; 
let conn = null; 

// --- MAPA ---
const pathMap = [
    {x:4, y:10}, {x:4, y:9}, {x:4, y:8}, {x:4, y:7}, {x:4, y:6}, {x:3, y:6}, {x:2, y:6}, {x:1, y:6}, {x:0, y:6}, 
    {x:0, y:5}, {x:0, y:4}, {x:1, y:4}, {x:2, y:4}, {x:3, y:4}, {x:4, y:4}, {x:4, y:3}, {x:4, y:2}, {x:4, y:1}, {x:4, y:0},
    {x:5, y:0}, {x:6, y:0}, {x:6, y:1}, {x:6, y:2}, {x:6, y:3}, {x:6, y:4}, {x:7, y:4}, {x:8, y:4}, {x:9, y:4}, {x:10, y:4},
    {x:10, y:5}, {x:10, y:6}, {x:9, y:6}, {x:8, y:6}, {x:7, y:6}, {x:6, y:6}, {x:6, y:7}, {x:6, y:8}, {x:6, y:9}, {x:6, y:10},
    {x:5, y:10}
];
const homePaths = [[{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}], [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}]];
const bases = [{x:0, y:10}, {x:1, y:10}, {x:0, y:9}, {x:1, y:9}, {x:9, y:1}, {x:10, y:1}, {x:9, y:0}, {x:10, y:0}];

// ⚡ Boost Políčka
const SPECIAL_TILES = [5, 15, 25, 35, 12, 32]; 

// ==========================================
// SÍŤ
// ==========================================
const peer = new Peer(null, { debug: 1 });

peer.on('open', (id) => { document.getElementById('my-id-code').innerText = id; });
peer.on('error', (err) => { alert("Chyba sítě: " + err.type); });

document.getElementById('create-btn').addEventListener('click', () => {
    myPlayerId = 0;
    document.getElementById('create-btn').disabled = true;
    document.getElementById('my-id-wrapper').classList.remove('hidden');
    hostStatus.innerText = "Čekám na Myšáka...";
    peer.on('connection', (c) => { conn = c; setupConnection(); });
});

document.getElementById('join-btn').addEventListener('click', () => {
    const rawId = document.getElementById('join-input').value.trim().replace(/\s/g, '');
    if (!rawId) return alert("Zadej kód!");
    myPlayerId = 1;
    connectionStatus.innerText = "Hledám...";
    conn = peer.connect(rawId, { reliable: true });
    conn.on('open', () => {
        connectionStatus.innerText = "Spojeno!";
        setupConnection();
        setTimeout(() => sendData('HELLO', {}), 500);
    });
});

function setupConnection() {
    conn.on('data', (data) => handleNetworkData(data));
    conn.on('close', () => { alert("Odpojeno!"); location.reload(); });
}
function sendData(type, payload) { if (conn && conn.open) conn.send({ type, payload }); }

// ==========================================
// SYNC & UPDATE
// ==========================================

function handleNetworkData(data) {
    if (myPlayerId === 0 && data.type === 'HELLO') {
        startGameUI();
        resetTurn(0);
        sendState();
    }
    if (myPlayerId === 1 && data.type === 'STATE_UPDATE') {
        if (document.getElementById('game-container').classList.contains('hidden')) startGameUI();
        PLAYERS = data.payload.players;
        GAME_STATE = data.payload.gameState;
        updateDiceVisual(GAME_STATE.currentRoll);
        updateUI();
        renderTokens();
        
        // Zvýraznění pro klienta
        if (GAME_STATE.currentPlayerIndex === 1) {
            if (GAME_STATE.turnStep === 'MOVE') {
                const moveable = getMoveableTokens(PLAYERS[1], GAME_STATE.currentRoll);
                highlightTokens(moveable);
                showHints(moveable, GAME_STATE.currentRoll);
            } else if (GAME_STATE.turnStep === 'TELEPORT_SELECT') {
                const teleportables = getTeleportableTokens(PLAYERS[1]);
                highlightTokens(teleportables);
            }
        }
    }
    if (myPlayerId === 0) {
        if (data.type === 'REQUEST_ROLL') handleRollLogic();
        if (data.type === 'REQUEST_TELEPORT_MODE') activateTeleportMode(); // Nový request
        if (data.type === 'REQUEST_MOVE') handleMoveLogic(1, data.payload.tokenIdx);
    }
}

function sendState() {
    if (myPlayerId !== 0) return;
    sendData('STATE_UPDATE', { players: PLAYERS, gameState: GAME_STATE });
}

// ==========================================
// GAME LOGIC (HOST)
// ==========================================

function startGameUI() {
    lobbyOverlay.classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    initBoard();
    updateDiceVisual(1);
    updateUI();
}

function resetTurn(playerId) {
    const player = PLAYERS[playerId];
    const figuresInPlay = player.tokens.some(t => t !== -1 && t < 100); 
    
    GAME_STATE.currentPlayerIndex = playerId;
    GAME_STATE.waitingForMove = false;
    GAME_STATE.turnStep = 'ROLL';
    GAME_STATE.rollsLeft = figuresInPlay ? 1 : 3;
    
    // --- KONTROLA TELEPORTU (Na začátku tahu) ---
    // Podmínky:
    // 1. Dvě figurky na boostu
    // 2. Třetí figurka je "v poli" (ne -1, ne >=100)
    const tokensOnSpecial = player.tokens.filter(t => t !== -1 && t < 100 && SPECIAL_TILES.includes(t % PATH_LENGTH)).length;
    const tokensInField = player.tokens.filter(t => t !== -1 && t < 100 && !SPECIAL_TILES.includes(t % PATH_LENGTH)).length;
    
    GAME_STATE.teleportPossible = (tokensOnSpecial >= 2 && tokensInField >= 1);

    statusText.innerText = "VS";
    updateUI();
}

// Spustí režim vybírání figurky pro teleport
function activateTeleportMode() {
    GAME_STATE.turnStep = 'TELEPORT_SELECT';
    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    
    if (GAME_STATE.currentPlayerIndex === 0) {
        const teleportables = getTeleportableTokens(player);
        highlightTokens(teleportables);
        // Hint v domečku
        let freeHome = getFirstFreeHomeIndex(player.id);
        if (freeHome !== -1) {
            let cell = getCell(homePaths[player.id][freeHome]);
            if (cell) cell.classList.add('target-hint');
        }
    }
    
    updateUI();
    sendState();
}

function handleRollLogic() {
    if (GAME_STATE.turnStep !== 'ROLL') return;

    let roll = Math.floor(Math.random() * 6) + 1;
    let rotations = 0;
    let interval = setInterval(() => {
        let tempRoll = Math.floor(Math.random() * 6) + 1;
        updateDiceVisual(tempRoll); 
        rotations++;
        if(rotations > 5) {
            clearInterval(interval);
            finalizeRoll(roll);
        }
    }, 60);
}

function finalizeRoll(roll) {
    GAME_STATE.currentRoll = roll;
    GAME_STATE.rollsLeft--;

    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    const moveable = getMoveableTokens(player, roll);
    updateDiceVisual(roll);

    // Pokud už hodil, teleport padá
    GAME_STATE.teleportPossible = false;

    if (moveable.length > 0) {
        GAME_STATE.turnStep = 'MOVE';
        if (GAME_STATE.currentPlayerIndex === 0) {
            highlightTokens(moveable);
            showHints(moveable, roll);
        }
    } else {
        if (GAME_STATE.rollsLeft > 0) {
            GAME_STATE.turnStep = 'ROLL'; 
        } else {
            setTimeout(nextPlayer, 1000);
        }
    }
    updateUI();
    sendState();
}

function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex) return;
    
    const player = PLAYERS[pid];
    
    // --- TELEPORT AKCE ---
    if (GAME_STATE.turnStep === 'TELEPORT_SELECT') {
        let currentPos = player.tokens[tokenIdx];
        // Kontrola: musí to být figurka v poli a ne na boostu
        if (currentPos !== -1 && currentPos < 100 && !SPECIAL_TILES.includes(currentPos % PATH_LENGTH)) {
            // Najít první volné místo v domečku (od konce = index 3, pak 2, 1, 0)
            // Zde se ptal na "volné místo", automaticky vybereme to nejlepší (nejdál)
            let targetHomeIdx = getFirstFreeHomeIndex(pid);
            if (targetHomeIdx !== -1) {
                player.tokens[tokenIdx] = 100 + targetHomeIdx;
                checkWin(player);
                nextPlayer();
                return;
            }
        }
        return; // Neplatný výběr pro teleport
    }

    // --- BĚŽNÝ POHYB ---
    const roll = GAME_STATE.currentRoll;
    let currentPos = player.tokens[tokenIdx];
    let multiplier = 1;
    if (currentPos !== -1 && currentPos < 100 && SPECIAL_TILES.includes(currentPos % PATH_LENGTH)) {
        multiplier = 2;
    }
    const effectiveRoll = roll * multiplier;

    // 1. Nasazení
    if (currentPos === -1) {
        if (roll === 6) { 
            player.tokens[tokenIdx] = player.startPos;
            handleKick(player.startPos, pid);
        }
    } 
    // 2. Pohyb v domečku (100+)
    else if (currentPos >= 100) {
        let currentHomeIdx = currentPos - 100;
        let targetHomeIdx = currentHomeIdx + roll;
        // Kontrola kolize v domečku
        if (targetHomeIdx <= 3 && !isOccupiedBySelfInHome(targetHomeIdx, pid)) {
             player.tokens[tokenIdx] = 100 + targetHomeIdx;
             checkWin(player);
        }
    } 
    // 3. Pohyb na mapě
    else {
        let relativePos = (currentPos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
        let targetRelative = relativePos + effectiveRoll;
        
        if (targetRelative >= PATH_LENGTH) {
            // Vstup do domečku
            let homeIdx = targetRelative - PATH_LENGTH;
            // Kontrola kolize v domečku
            if (homeIdx <= 3 && !isOccupiedBySelfInHome(homeIdx, pid)) {
                player.tokens[tokenIdx] = 100 + homeIdx;
                checkWin(player);
            }
        } else {
            // Klasický posun
            let newPos = (currentPos + effectiveRoll) % PATH_LENGTH;
            player.tokens[tokenIdx] = newPos;
            handleKick(newPos, pid);
        }
    }

    clearHints();
    if (roll === 6 && GAME_STATE.turnStep !== 'TELEPORT_SELECT') {
        resetTurn(pid); 
        GAME_STATE.rollsLeft = 1; 
    } else {
        nextPlayer();
    }
    renderTokens();
    updateUI();
    sendState();
}

function nextPlayer() {
    clearHints();
    const nextPid = GAME_STATE.currentPlayerIndex === 0 ? 1 : 0;
    resetTurn(nextPid);
    renderTokens();
    updateUI();
    sendState();
}

// --- Pravidla Helpers ---

function getTeleportableTokens(player) {
    let options = [];
    player.tokens.forEach((pos, idx) => {
        if (pos !== -1 && pos < 100 && !SPECIAL_TILES.includes(pos % PATH_LENGTH)) {
            options.push(idx);
        }
    });
    return options;
}

function getFirstFreeHomeIndex(pid) {
    // Hledáme od konce (3) k začátku (0)
    for (let i = 3; i >= 0; i--) {
        if (!isOccupiedBySelfInHome(i, pid)) return i;
    }
    return -1; // Domeček plný
}

function getMoveableTokens(player, roll) {
    let options = [];
    player.tokens.forEach((pos, idx) => {
        let multiplier = (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos % PATH_LENGTH)) ? 2 : 1;
        let effective = roll * multiplier;

        if (pos === -1) {
            if (roll === 6 && !isOccupiedBySelf(player.startPos, player.id)) options.push(idx);
        } else if (pos >= 100) {
            // Logika v domečku - nesmí skočit na jinou figurku
            let currentHomeIdx = pos - 100;
            let targetHomeIdx = currentHomeIdx + roll;
            if (targetHomeIdx <= 3 && !isOccupiedBySelfInHome(targetHomeIdx, player.id)) {
                options.push(idx);
            }
        } else {
            // Logika na mapě
            let relativePos = (pos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
            if (relativePos + effective >= PATH_LENGTH) {
                let homeIdx = (relativePos + effective) - PATH_LENGTH;
                // Vstup do domečku - nesmí tam nikdo být
                if (homeIdx <= 3 && !isOccupiedBySelfInHome(homeIdx, player.id)) options.push(idx);
            } else {
                let targetGlobal = (pos + effective) % PATH_LENGTH;
                if (!isOccupiedBySelf(targetGlobal, player.id)) options.push(idx);
            }
        }
    });
    return options;
}

function handleKick(pos, attackerId) {
    PLAYERS.forEach(p => {
        if (p.id !== attackerId) {
            p.tokens.forEach((t, idx) => {
                if (t === pos) p.tokens[idx] = -1; 
            });
        }
    });
}

// --- Grafika ---

function initBoard() {
    board.innerHTML = '';
    for(let y=0; y<BOARD_SIZE; y++) {
        for(let x=0; x<BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.x = x; cell.dataset.y = y;
            
            const pIdx = pathMap.findIndex(p=>p.x===x && p.y===y);
            if (pIdx !== -1) {
                cell.classList.add('path');
                if (pIdx===0) cell.classList.add('start-p1');
                else if (pIdx===20) cell.classList.add('start-p2');
                else if (SPECIAL_TILES.includes(pIdx)) cell.classList.add('special');
            } else if (isHome(x,y,0)) cell.classList.add('home-p1');
            else if (isHome(x,y,1)) cell.classList.add('home-p2');
            else if (isBase(x,y)) cell.classList.add('base'); 
            else cell.style.visibility = 'hidden';
            
            board.appendChild(cell);
        }
    }
    renderTokens();
}

function renderTokens() {
    document.querySelectorAll('.token').forEach(t => t.remove());
    PLAYERS.forEach(player => {
        player.tokens.forEach((pos, idx) => {
            let cell;
            if (pos === -1) cell = getCell(bases[player.baseIndices[idx]]);
            else if (pos >= 100) cell = getCell(homePaths[player.id][pos-100]);
            else cell = getCell(pathMap[pos % PATH_LENGTH]);

            if (cell) {
                const t = document.createElement('div');
                t.classList.add('token', player.class);
                t.dataset.idx = idx;
                if (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos % PATH_LENGTH)) {
                    t.classList.add('charged');
                }
                t.onclick = () => onTokenClick(player.id, idx);
                cell.appendChild(t);
            }
        });
    });
}

function updateDiceVisual(n) {
    if (!n || n < 1) return;
    const rotations = {
        1: 'rotateX(0deg) rotateY(0deg)',
        2: 'rotateX(0deg) rotateY(180deg)',
        3: 'rotateX(0deg) rotateY(-90deg)',
        4: 'rotateX(0deg) rotateY(90deg)',
        5: 'rotateX(-90deg) rotateY(0deg)',
        6: 'rotateX(90deg) rotateY(0deg)'
    };
    diceCube.style.transform = rotations[n];
}

function updateUI() {
    p1Card.classList.toggle('active', GAME_STATE.currentPlayerIndex === 0);
    p2Card.classList.toggle('active', GAME_STATE.currentPlayerIndex === 1);
    
    const isMyTurn = GAME_STATE.currentPlayerIndex === myPlayerId;
    powerupIndicator.classList.add('hidden');
    rollBtn.classList.remove('btn-teleport');

    if (isMyTurn) {
        if (GAME_STATE.teleportPossible && GAME_STATE.turnStep === 'ROLL') {
            // Zobrazit tlačítko Teleport MÍSTO hodu
            rollBtn.disabled = false;
            rollBtn.classList.add('btn-teleport');
            rollBtn.innerHTML = `🌀 TELEPORT 🌀<span class="small">Klikni pro aktivaci</span>`;
            return;
        }

        if (GAME_STATE.turnStep === 'TELEPORT_SELECT') {
            rollBtn.disabled = true;
            rollBtn.innerHTML = `VYBER FIGURKU<span class="small">Která půjde do domečku?</span>`;
            powerupIndicator.classList.remove('hidden');
            powerupIndicator.innerText = "Vyber figurku v poli!";
            return;
        }

        if (GAME_STATE.turnStep === 'ROLL') {
            rollBtn.disabled = false;
            rollBtn.innerHTML = `HODIT <span class="small">${GAME_STATE.rollsLeft} pokus</span>`;
        } else {
            rollBtn.disabled = true;
            rollBtn.innerHTML = `HRAJ <span class="small">Vyber figurku</span>`;
        }
    } else {
        rollBtn.disabled = true;
        rollBtn.innerHTML = `ČEKEJ <span class="small">Soupeř hraje</span>`;
    }
}

function showHints(tokenIndices, roll) {
    clearHints();
    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    tokenIndices.forEach(idx => {
        const pos = player.tokens[idx];
        let multiplier = (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos % PATH_LENGTH)) ? 2 : 1;
        let effective = roll * multiplier;
        
        let targetCell = null;
        if (pos === -1) {
            targetCell = getCell(pathMap[player.startPos]);
        } else if (pos >= 100) {
            let targetH = (pos - 100) + roll;
            if(targetH <= 3) targetCell = getCell(homePaths[player.id][targetH]);
        } else {
            let relativePos = (pos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
            if (relativePos + effective >= PATH_LENGTH) {
                let h = (relativePos + effective) - PATH_LENGTH;
                if (h <= 3) targetCell = getCell(homePaths[player.id][h]);
            } else {
                targetCell = getCell(pathMap[(pos + effective) % PATH_LENGTH]);
            }
        }
        if (targetCell) targetCell.classList.add('target-hint');
    });
}

function clearHints() { document.querySelectorAll('.target-hint').forEach(el => el.classList.remove('target-hint')); }
function highlightTokens(indices) {
    const pClass = PLAYERS[GAME_STATE.currentPlayerIndex].class;
    document.querySelectorAll(`.token.${pClass}`).forEach(t => {
        if (indices.includes(parseInt(t.dataset.idx))) t.classList.add('highlight');
        else t.style.opacity = '0.4';
    });
}

// Helpers
function getCell(c) { return document.querySelector(`.cell[data-x="${c.x}"][data-y="${c.y}"]`); }
function isOccupiedBySelf(idx, pid) { return PLAYERS[pid].tokens.includes(idx); }
function isOccupiedBySelfInHome(hIdx, pid) { return PLAYERS[pid].tokens.includes(100+hIdx); }

function checkWin(player) {
    if (player.tokens.every(t => t >= 100)) {
        alert(`🏆 VÍTĚZSTVÍ! ${player.name} vyhrál!`);
        location.reload();
    }
}

// Listeners
rollBtn.addEventListener('click', () => {
    if (GAME_STATE.currentPlayerIndex === myPlayerId) {
        // Pokud je aktivní možnost teleportu a hráč na to klikl
        if (GAME_STATE.teleportPossible && GAME_STATE.turnStep === 'ROLL') {
            if (myPlayerId === 0) activateTeleportMode(); 
            else sendData('REQUEST_TELEPORT_MODE', {});
            return;
        }

        if (GAME_STATE.turnStep === 'ROLL') {
            if (myPlayerId === 0) handleRollLogic(); 
            else sendData('REQUEST_ROLL', {});
        }
    }
});

function onTokenClick(pid, idx) {
    if (pid === myPlayerId && GAME_STATE.currentPlayerIndex === myPlayerId) {
        // Kliknutí pro pohyb nebo pro výběr teleportu
        if (GAME_STATE.turnStep === 'MOVE' || GAME_STATE.turnStep === 'TELEPORT_SELECT') {
            if (myPlayerId === 0) handleMoveLogic(0, idx); 
            else sendData('REQUEST_MOVE', { tokenIdx: idx });
        }
    }
}

initBoard();
