console.log("Royal Ludo - Animal & Lucky 7 Edition");

// --- UI Elements ---
const board = document.getElementById('game-board');
const rollBtn = document.getElementById('roll-btn');
const diceCube = document.getElementById('dice-cube');
const statusText = document.getElementById('game-status-text');
const powerupIndicator = document.getElementById('powerup-indicator');

// Lobby
const lobbyOverlay = document.getElementById('lobby-overlay');
const lobbyMenu = document.getElementById('lobby-menu');
const hostLobbyUi = document.getElementById('host-lobby-ui');
const hostStatus = document.getElementById('host-status');
const startGameBtn = document.getElementById('start-game-btn');
const playerBadges = [
    document.getElementById('p1-card'),
    document.getElementById('p2-card'),
    document.getElementById('p3-card'),
    document.getElementById('p4-card')
];

// --- Konfigurace ---
const BOARD_SIZE = 11;
const PATH_LENGTH = 40; 

// Hráči - Zvířátka
// sevens: počet nasbíraných sedmiček
let PLAYERS = [
    { id: 0, name: 'P1', emoji: '🐱', class: 'p1', active: true,  startIdx: 0,  tokens: [-1, -1, -1, -1], sevens: 0 },
    { id: 1, name: 'P2', emoji: '🐭', class: 'p2', active: false, startIdx: 10, tokens: [-1, -1, -1, -1], sevens: 0 },
    { id: 2, name: 'P3', emoji: '🐶', class: 'p3', active: false, startIdx: 20, tokens: [-1, -1, -1, -1], sevens: 0 },
    { id: 3, name: 'P4', emoji: '🐦', class: 'p4', active: false, startIdx: 30, tokens: [-1, -1, -1, -1], sevens: 0 }
];

let GAME_STATE = {
    currentPlayerIndex: 0,
    currentRoll: 1,
    turnStep: 'ROLL', // ROLL, MOVE, SPECIAL_HOME (pokud má 3x7)
    rollsLeft: 3, 
    gameStarted: false
};

let myPlayerId = null; 
let peer = null;
let hostConnections = [null, null, null, null]; 
let clientConn = null;    

// --- MAPA (Stejná jako předtím) ---
const pathMap = generatePathMap();
const homePaths = generateHomePaths();
const bases = generateBases();
const SPECIAL_TILES = [4, 14, 24, 34]; // Boost políčka

function generatePathMap() {
    const map = [];
    // Q1 (P1 Start -> P2 Start)
    map.push({x:6, y:10}, {x:6, y:9}, {x:6, y:8}, {x:6, y:7}, {x:6, y:6});
    map.push({x:7, y:6}, {x:8, y:6}, {x:9, y:6}, {x:10, y:6}, {x:10, y:5});
    // Q2
    map.push({x:10, y:4}, {x:9, y:4}, {x:8, y:4}, {x:7, y:4}, {x:6, y:4}); 
    map.push({x:6, y:3}, {x:6, y:2}, {x:6, y:1}, {x:6, y:0}, {x:5, y:0}); 
    // Q3
    map.push({x:4, y:0}, {x:4, y:1}, {x:4, y:2}, {x:4, y:3}, {x:4, y:4}); 
    map.push({x:3, y:4}, {x:2, y:4}, {x:1, y:4}, {x:0, y:4}, {x:0, y:5}); 
    // Q4
    map.push({x:0, y:6}, {x:1, y:6}, {x:2, y:6}, {x:3, y:6}, {x:4, y:6}); 
    map.push({x:4, y:7}, {x:4, y:8}, {x:4, y:9}, {x:4, y:10}, {x:5, y:10}); 
    return map;
}

function generateHomePaths() {
    return [
        [{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}], // P1
        [{x:9, y:5}, {x:8, y:5}, {x:7, y:5}, {x:6, y:5}], // P2
        [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}], // P3
        [{x:1, y:5}, {x:2, y:5}, {x:3, y:5}, {x:4, y:5}]  // P4
    ];
}

function generateBases() {
    return [
        {x:9, y:9}, {x:10, y:9}, {x:9, y:10}, {x:10, y:10}, // P1
        {x:9, y:0}, {x:10, y:0}, {x:9, y:1}, {x:10, y:1},   // P2
        {x:0, y:0}, {x:1, y:0}, {x:0, y:1}, {x:1, y:1},     // P3
        {x:0, y:9}, {x:1, y:9}, {x:0, y:10}, {x:1, y:10}    // P4
    ];
}

// ==========================================
// SÍŤ (PeerJS) - Zkráceno (stejné jádro)
// ==========================================
peer = new Peer(null, { debug: 1 });

peer.on('open', (id) => { document.getElementById('my-id-code').innerText = id; });
peer.on('error', (err) => { alert("Chyba: " + err.type); });

// HOST
document.getElementById('create-btn').addEventListener('click', () => {
    myPlayerId = 0;
    lobbyMenu.classList.add('hidden');
    hostLobbyUi.classList.remove('hidden');
    peer.on('connection', (conn) => handleHostConnection(conn));
});

function handleHostConnection(conn) {
    let freeSlot = PLAYERS.findIndex((p, i) => i > 0 && !p.active);
    if (freeSlot === -1) return conn.close();

    PLAYERS[freeSlot].active = true;
    hostConnections[freeSlot] = conn;

    conn.on('open', () => {
        conn.send({ type: 'WELCOME', payload: { yourId: freeSlot, players: PLAYERS } });
        updateLobbyUI();
        broadcastData('LOBBY_UPDATE', { players: PLAYERS });
        conn.on('data', (data) => handleHostData(freeSlot, data));
        conn.on('close', () => {
            PLAYERS[freeSlot].active = false;
            updateLobbyUI();
            broadcastData('LOBBY_UPDATE', { players: PLAYERS });
        });
    });
}

startGameBtn.addEventListener('click', () => {
    GAME_STATE.gameStarted = true;
    resetTurn(0);
    broadcastData('GAME_START', { gameState: GAME_STATE, players: PLAYERS });
    startGameUI();
});

// CLIENT
document.getElementById('join-btn').addEventListener('click', () => {
    const rawId = document.getElementById('join-input').value.trim();
    if (!rawId) return;
    clientConn = peer.connect(rawId, { reliable: true });
    clientConn.on('open', () => document.getElementById('connection-status').innerText = "Spojeno!");
    clientConn.on('data', (data) => handleClientData(data));
});

function broadcastData(type, payload) {
    hostConnections.forEach(c => { if (c && c.open) c.send({ type, payload }); });
}

function handleHostData(senderId, data) {
    if (data.type === 'REQUEST_ROLL' && GAME_STATE.currentPlayerIndex === senderId) handleRollLogic();
    if (data.type === 'REQUEST_MOVE' && GAME_STATE.currentPlayerIndex === senderId) handleMoveLogic(senderId, data.payload.tokenIdx);
}

function handleClientData(data) {
    if (data.type === 'WELCOME') {
        myPlayerId = data.payload.yourId;
        PLAYERS = data.payload.players;
    }
    if (data.type === 'GAME_START') {
        GAME_STATE = data.payload.gameState;
        PLAYERS = data.payload.players;
        startGameUI();
    }
    if (data.type === 'STATE_UPDATE') {
        GAME_STATE = data.payload.gameState;
        PLAYERS = data.payload.players;
        updateDiceVisual(GAME_STATE.currentRoll);
        updateUI();
        renderTokens();
        
        // Zobrazit hinty, pokud jsem na tahu
        if (GAME_STATE.currentPlayerIndex === myPlayerId) {
            if (GAME_STATE.turnStep === 'MOVE') {
                const moveable = getMoveableTokens(PLAYERS[myPlayerId], GAME_STATE.currentRoll);
                highlightTokens(moveable);
                showHints(moveable, GAME_STATE.currentRoll);
            } else if (GAME_STATE.turnStep === 'SPECIAL_HOME') {
                const candidates = getTokensForSpecialMove(PLAYERS[myPlayerId]);
                highlightTokens(candidates);
            }
        }
    }
}

function updateLobbyUI() {
    const activeCount = PLAYERS.filter(p => p.active).length;
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`slot-${i}`);
        if (PLAYERS[i].active) {
            el.innerText = `${i+1}. Připojen ✅`;
            el.classList.add('active');
        } else {
            el.innerText = `${i+1}. Čekám...`;
            el.classList.remove('active');
        }
    }
    if (activeCount >= 2) {
        startGameBtn.disabled = false;
        startGameBtn.innerText = "SPUSTIT HRU ▶";
    }
}

// ==========================================
// GAME LOGIC
// ==========================================

function startGameUI() {
    lobbyOverlay.classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    PLAYERS.forEach((p, idx) => {
        if (!p.active) playerBadges[idx].style.display = 'none';
        // Zobrazit počítadlo sedmiček
        playerBadges[idx].querySelector('.sevens-count').classList.remove('hidden');
    });
    initBoard();
    updateUI();
}

function resetTurn(playerId) {
    let nextId = playerId;
    let loopGuard = 0;
    while (!PLAYERS[nextId].active && loopGuard < 5) {
        nextId = (nextId + 1) % 4;
        loopGuard++;
    }
    
    GAME_STATE.currentPlayerIndex = nextId;
    const player = PLAYERS[nextId];
    
    const figuresInPlay = player.tokens.some(t => t !== -1 && t < 100); 
    GAME_STATE.turnStep = 'ROLL';
    GAME_STATE.rollsLeft = figuresInPlay ? 1 : 3;
    
    // Zrušená teleportAvailable logika

    statusText.innerText = `Na tahu: ${player.emoji} ${player.name}`;
    updateUI();
}

function handleRollLogic() {
    // Generování hodu s šancí na 7
    // Šance na 7 = 15% (0.15)
    // Šance na 1-6 = 85%
    let finalRoll;
    if (Math.random() < 0.15) {
        finalRoll = 7;
    } else {
        finalRoll = Math.floor(Math.random() * 6) + 1;
    }

    // Animace
    let rotations = 0;
    let interval = setInterval(() => {
        // Při animaci ukazuj jen 1-6
        updateDiceVisual(Math.floor(Math.random() * 6) + 1);
        rotations++;
        if(rotations > 6) {
            clearInterval(interval);
            finalizeRoll(finalRoll);
        }
    }, 50);
}

function finalizeRoll(roll) {
    GAME_STATE.currentRoll = roll;
    GAME_STATE.rollsLeft--;
    updateDiceVisual(roll);

    const player = PLAYERS[GAME_STATE.currentPlayerIndex];

    // --- LOGIKA PRO 7 ---
    if (roll === 7) {
        player.sevens++;
        // Pokud nasbíral 3, aktivuje se speciální tah
        if (player.sevens >= 3) {
            // Kontrola, zda má co poslat domů
            const candidates = getTokensForSpecialMove(player);
            if (candidates.length > 0) {
                GAME_STATE.turnStep = 'SPECIAL_HOME';
                statusText.innerText = `3x 7️⃣! Vyber figurku do domečku!`;
                powerupIndicator.innerText = "INSTANT HOME!";
                powerupIndicator.classList.remove('hidden');
            } else {
                // Nemá koho poslat (všichni v base nebo v domečku)
                // Jen reset sedmiček? Nebo mu je necháme?
                // Řekněme, že mu propadnou, je to smůla.
                player.sevens = 0;
                statusText.innerText = `3x 7️⃣, ale nelze hrát!`;
                setTimeout(nextPlayer, 1500);
                return;
            }
        } else {
            statusText.innerText = `Padla 7! Máš ${player.sevens}/3.`;
            // Po 7 se nehází znovu (pokud to není pravidlo navíc), jen se sbírá.
            setTimeout(nextPlayer, 1500);
            updateUI();
            if (myPlayerId === 0) broadcastData('STATE_UPDATE', { players: PLAYERS, gameState: GAME_STATE });
            return;
        }
    } else {
        // --- KLASICKÁ LOGIKA 1-6 ---
        const moveable = getMoveableTokens(player, roll);
        if (moveable.length > 0) {
            GAME_STATE.turnStep = 'MOVE';
        } else {
            if (GAME_STATE.rollsLeft > 0 && !player.tokens.some(t => t !== -1 && t < 100)) {
                GAME_STATE.turnStep = 'ROLL'; 
            } else {
                setTimeout(nextPlayer, 1000);
                return;
            }
        }
    }

    updateUI();
    // Pokud jsem host, pošlu update. Pokud ne, klient si počká na STATE_UPDATE.
    // Ale pozor: finalizeRoll se volá u hosta.
    if (myPlayerId === 0) {
        broadcastData('STATE_UPDATE', { players: PLAYERS, gameState: GAME_STATE });
        // Pokud hraje host, highlight rovnou
        if (GAME_STATE.currentPlayerIndex === 0 && GAME_STATE.turnStep === 'MOVE') {
            const m = getMoveableTokens(player, roll);
            highlightTokens(m);
            showHints(m, roll);
        }
        if (GAME_STATE.currentPlayerIndex === 0 && GAME_STATE.turnStep === 'SPECIAL_HOME') {
             const c = getTokensForSpecialMove(player);
             highlightTokens(c);
        }
    }
}

function nextPlayer() {
    clearHints();
    powerupIndicator.classList.add('hidden');
    let nextPid = (GAME_STATE.currentPlayerIndex + 1) % 4;
    resetTurn(nextPid);
    renderTokens();
    if (myPlayerId === 0) broadcastData('STATE_UPDATE', { players: PLAYERS, gameState: GAME_STATE });
}

function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex) return;
    const player = PLAYERS[pid];

    // --- SPECIÁLNÍ TAH (3x7) ---
    if (GAME_STATE.turnStep === 'SPECIAL_HOME') {
        const currentPos = player.tokens[tokenIdx];
        // Validace: nesmí být v base (-1) a nesmí být už v domečku (>=100)
        if (currentPos !== -1 && currentPos < 100) {
            // Najdi první volné místo v domečku
            let freeSlot = -1;
            for(let i=3; i>=0; i--) { // Hledáme od konce domečku? Ne, od 0 (nejbližší) nebo od 3 (konec)?
                // Zvykem je zaplňovat od konce, ale tady je to jedno.
                // "Rovnou do domečku" -> První volné políčko od začátku domečku (index 0..3)
                // Ale nesmí se překrývat.
                if (!player.tokens.includes(100+i)) {
                    freeSlot = i;
                    // Chceme co nejhlubší místo? Nebo první?
                    // Zvolíme první volné od konce (3), aby neblokoval vstup?
                    // Logic: Ludo domeček se plní od 3 do 0? Nebo od 0 do 3?
                    // Mapa je nastavená, že vstup je 0.
                    // Dáme ho na nejvyšší možné volné číslo (nejhlouběji).
                }
            }
            
            // Lepší algoritmus: Najít nejvyšší index (3), který je volný.
            let targetSlot = -1;
            for (let i=3; i>=0; i--) {
                if (!player.tokens.includes(100+i)) {
                    targetSlot = i;
                    break; 
                }
            }

            if (targetSlot !== -1) {
                player.tokens[tokenIdx] = 100 + targetSlot;
                player.sevens = 0; // Reset
                checkWin(player);
                nextPlayer();
            }
        }
        return;
    }

    // --- KLASICKÝ TAH ---
    const roll = GAME_STATE.currentRoll;
    let currentPos = player.tokens[tokenIdx];
    
    // 1. NASAZENÍ
    if (currentPos === -1) {
        if (roll === 6) {
            player.tokens[tokenIdx] = player.startIdx; 
            handleKick(player.startIdx, pid);
        }
    } 
    // 2. DOMEČEK
    else if (currentPos >= 100) {
        let currentHomeIdx = currentPos - 100;
        let targetHomeIdx = currentHomeIdx + roll;
        if (targetHomeIdx <= 3 && !isOccupiedBySelfInHome(targetHomeIdx, pid)) {
             player.tokens[tokenIdx] = 100 + targetHomeIdx;
             checkWin(player);
        }
    } 
    // 3. MAPA
    else {
        let multiplier = SPECIAL_TILES.includes(currentPos) ? 2 : 1;
        let effectiveRoll = roll * multiplier;
        
        let relativePos = (currentPos - player.startIdx + PATH_LENGTH) % PATH_LENGTH;
        let targetRelative = relativePos + effectiveRoll;
        
        if (targetRelative >= PATH_LENGTH) {
            let homeStep = targetRelative - PATH_LENGTH;
            if (homeStep <= 3 && !isOccupiedBySelfInHome(homeStep, pid)) {
                player.tokens[tokenIdx] = 100 + homeStep;
                checkWin(player);
            }
        } else {
            let newPos = (currentPos + effectiveRoll) % PATH_LENGTH;
            player.tokens[tokenIdx] = newPos;
            handleKick(newPos, pid);
        }
    }

    clearHints();
    if (roll === 6) {
        GAME_STATE.rollsLeft = 1;
        GAME_STATE.turnStep = 'ROLL';
        statusText.innerText = `${player.name} hází znovu!`;
    } else {
        nextPlayer();
    }
    
    renderTokens();
    updateUI();
    if (myPlayerId === 0) broadcastData('STATE_UPDATE', { players: PLAYERS, gameState: GAME_STATE });
}

function getTokensForSpecialMove(player) {
    // Vrátí indexy figurek, které jsou na mapě (ne base, ne home)
    let opts = [];
    player.tokens.forEach((t, i) => {
        if (t !== -1 && t < 100) opts.push(i);
    });
    return opts;
}

function handleKick(pos, attackerId) {
    PLAYERS.forEach(p => {
        if (p.id !== attackerId && p.active) {
            p.tokens.forEach((t, idx) => {
                if (t === pos) p.tokens[idx] = -1; // Zpět do base
            });
        }
    });
}

function getMoveableTokens(player, roll) {
    let options = [];
    player.tokens.forEach((pos, idx) => {
        let multiplier = (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos)) ? 2 : 1;
        let effective = roll * multiplier;

        if (pos === -1) {
            if (roll === 6 && !player.tokens.includes(player.startIdx)) options.push(idx);
        } else if (pos >= 100) {
            let target = (pos - 100) + roll;
            if (target <= 3 && !player.tokens.includes(100+target)) options.push(idx);
        } else {
            let relativePos = (pos - player.startIdx + PATH_LENGTH) % PATH_LENGTH;
            if (relativePos + effective >= PATH_LENGTH) {
                let h = (relativePos + effective) - PATH_LENGTH;
                if (h <= 3 && !player.tokens.includes(100+h)) options.push(idx);
            } else {
                let targetGlobal = (pos + effective) % PATH_LENGTH;
                if (!player.tokens.includes(targetGlobal)) options.push(idx);
            }
        }
    });
    return options;
}

// --- VISUALS ---

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
                if (pIdx === 0) cell.classList.add('start-p1');
                if (pIdx === 10) cell.classList.add('start-p2');
                if (pIdx === 20) cell.classList.add('start-p3');
                if (pIdx === 30) cell.classList.add('start-p4');
                if (SPECIAL_TILES.includes(pIdx)) cell.classList.add('special');
            }
            else if (isHome(x,y,0)) cell.classList.add('home-p1');
            else if (isHome(x,y,1)) cell.classList.add('home-p2');
            else if (isHome(x,y,2)) cell.classList.add('home-p3');
            else if (isHome(x,y,3)) cell.classList.add('home-p4');
            else cell.style.visibility = 'hidden';
            
            board.appendChild(cell);
        }
    }
    renderTokens();
}

function renderTokens() {
    document.querySelectorAll('.token').forEach(t => t.remove());
    PLAYERS.forEach(player => {
        if (!player.active) return;
        player.tokens.forEach((pos, idx) => {
            let cell = null;
            if (pos === -1) {
                let b = bases[player.id * 4 + idx];
                cell = getCell(b);
                if(cell) cell.style.visibility = 'visible';
            }
            else if (pos >= 100) cell = getCell(homePaths[player.id][pos-100]);
            else cell = getCell(pathMap[pos]);

            if (cell) {
                const t = document.createElement('div');
                t.classList.add('token', player.class);
                t.innerText = player.emoji; // Zobrazení zvířátka
                t.dataset.idx = idx;
                
                if (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos)) t.classList.add('charged');
                
                t.onclick = () => onTokenClick(player.id, idx);
                cell.appendChild(t);
            }
        });
    });
}

function updateDiceVisual(n) {
    // Reset stylů
    document.querySelectorAll('.face').forEach(f => {
        f.classList.remove('lucky-seven');
        // Reset textu na default (1-6) je složitý, protože nevíme která face je která.
        // Jednodušší: Přepíšeme aktivní face.
    });

    const rotations = {
        1: 'rotateX(0deg) rotateY(0deg)',
        2: 'rotateX(0deg) rotateY(180deg)',
        3: 'rotateX(0deg) rotateY(-90deg)',
        4: 'rotateX(0deg) rotateY(90deg)',
        5: 'rotateX(-90deg) rotateY(0deg)',
        6: 'rotateX(90deg) rotateY(0deg)',
        7: 'rotateX(0deg) rotateY(0deg)' // Tváříme se jako 1, ale změníme text
    };
    
    diceCube.style.transform = rotations[n === 7 ? 1 : n];

    // Pokud padne 7, najdeme 'front' (protože rotace je jako 1) a změníme ji
    const frontFace = document.querySelector('.face.front');
    if (n === 7) {
        frontFace.innerText = '7';
        frontFace.classList.add('lucky-seven');
    } else {
        frontFace.innerText = '1'; // Vrátíme zpět
    }
}

function updateUI() {
    playerBadges.forEach((el, i) => {
        el.classList.toggle('active', i === GAME_STATE.currentPlayerIndex);
        // Update počtu sedmiček
        const countEl = el.querySelector('.sevens-count');
        countEl.innerText = `7️⃣ x ${PLAYERS[i].sevens}/3`;
        if (PLAYERS[i].sevens >= 3) countEl.style.color = '#ff7675';
        else countEl.style.color = 'gold';
    });

    const isMyTurn = GAME_STATE.currentPlayerIndex === myPlayerId;
    if (isMyTurn) {
        if (GAME_STATE.turnStep === 'ROLL') {
            rollBtn.disabled = false;
            rollBtn.innerText = "HODIT";
        } else if (GAME_STATE.turnStep === 'SPECIAL_HOME') {
            rollBtn.disabled = true;
            rollBtn.innerText = "VYBER CÍL!";
        } else {
            rollBtn.disabled = true;
            rollBtn.innerText = "HRAJ";
        }
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "ČEKEJ";
    }
}

function showHints(tokenIndices, roll) {
    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    tokenIndices.forEach(idx => {
        const pos = player.tokens[idx];
        let targetCell = null;
        
        // Logika pro výpočet cíle (viz getMoveableTokens)
        let multiplier = (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos)) ? 2 : 1;
        let effective = roll * multiplier;

        if (pos === -1) targetCell = getCell(pathMap[player.startIdx]);
        else if (pos >= 100) targetCell = getCell(homePaths[player.id][(pos-100)+roll]);
        else {
            let rel = (pos - player.startIdx + PATH_LENGTH) % PATH_LENGTH;
            if (rel + effective >= PATH_LENGTH) targetCell = getCell(homePaths[player.id][(rel + effective) - PATH_LENGTH]);
            else targetCell = getCell(pathMap[(pos+effective)%PATH_LENGTH]);
        }
        if (targetCell) targetCell.classList.add('target-hint');
    });
}

function clearHints() { document.querySelectorAll('.target-hint').forEach(el => el.classList.remove('target-hint')); }
function highlightTokens(indices) {
    const p = PLAYERS[GAME_STATE.currentPlayerIndex];
    document.querySelectorAll(`.token.${p.class}`).forEach(t => {
        if (indices.includes(parseInt(t.dataset.idx))) t.classList.add('highlight');
        else t.style.opacity = '0.4';
    });
}

function getCell(c) { return document.querySelector(`.cell[data-x="${c.x}"][data-y="${c.y}"]`); }
function isHome(x,y,pid) { return homePaths[pid].some(p=>p.x===x && p.y===y); }
function isOccupiedBySelfInHome(hIdx, pid) { return PLAYERS[pid].tokens.includes(100+hIdx); }

function checkWin(player) {
    if (player.tokens.every(t => t >= 100)) {
        alert(`🏆 VÍTĚZSTVÍ! ${player.emoji} vyhrál!`);
        location.reload();
    }
}

rollBtn.addEventListener('click', () => {
    if (GAME_STATE.currentPlayerIndex === myPlayerId && GAME_STATE.turnStep === 'ROLL') {
        if (myPlayerId === 0) handleRollLogic(); 
        else if (clientConn) clientConn.send({ type: 'REQUEST_ROLL' });
    }
});

function onTokenClick(pid, idx) {
    if (pid === myPlayerId && GAME_STATE.currentPlayerIndex === myPlayerId) {
        if (GAME_STATE.turnStep === 'MOVE' || GAME_STATE.turnStep === 'SPECIAL_HOME') {
            if (myPlayerId === 0) handleMoveLogic(0, idx); 
            else if (clientConn) clientConn.send({ type: 'REQUEST_MOVE', payload: { tokenIdx: idx } });
        }
    }
}
