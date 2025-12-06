console.log("Royal Cats Ludo v6.0 - Final Fixes");

// --- UI Elementy ---
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

// Definice hráčů
let PLAYERS = [
    { id: 0, name: 'Zrzek', class: 'p1', startPos: 0, tokens: [-1, -1, -1, -1], baseIndices: [0, 1, 2, 3] },
    { id: 1, name: 'Modrák', class: 'p2', startPos: 20, tokens: [-1, -1, -1, -1], baseIndices: [4, 5, 6, 7] }
];

let GAME_STATE = {
    currentPlayerIndex: 0,
    currentRoll: 1, // Startujeme na 1, aby kostka nebyla rozbitá
    waitingForMove: false,
    rollsLeft: 1, 
    turnStep: 'ROLL',
    teleportAvailable: false // Pro mega-combo
};

let myPlayerId = null; 
let conn = null; 

// --- Mapy a Cesty ---
const pathMap = [
    {x:4, y:10}, {x:4, y:9}, {x:4, y:8}, {x:4, y:7}, {x:4, y:6}, {x:3, y:6}, {x:2, y:6}, {x:1, y:6}, {x:0, y:6}, 
    {x:0, y:5}, {x:0, y:4}, {x:1, y:4}, {x:2, y:4}, {x:3, y:4}, {x:4, y:4}, {x:4, y:3}, {x:4, y:2}, {x:4, y:1}, {x:4, y:0},
    {x:5, y:0}, {x:6, y:0}, {x:6, y:1}, {x:6, y:2}, {x:6, y:3}, {x:6, y:4}, {x:7, y:4}, {x:8, y:4}, {x:9, y:4}, {x:10, y:4},
    {x:10, y:5}, {x:10, y:6}, {x:9, y:6}, {x:8, y:6}, {x:7, y:6}, {x:6, y:6}, {x:6, y:7}, {x:6, y:8}, {x:6, y:9}, {x:6, y:10},
    {x:5, y:10}
];
const homePaths = [[{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}], [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}]];
const bases = [{x:0, y:10}, {x:1, y:10}, {x:0, y:9}, {x:1, y:9}, {x:9, y:1}, {x:10, y:1}, {x:9, y:0}, {x:10, y:0}];

// ⚡ Specialní políčka (Power-ups)
const SPECIAL_TILES = [5, 15, 25, 35, 10, 30]; 

// ==========================================
// SÍŤOVÁ ČÁST
// ==========================================
const peer = new Peer(null, { debug: 1 });

peer.on('open', (id) => { document.getElementById('my-id-code').innerText = id; });
peer.on('error', (err) => { alert("Chyba sítě: " + err.type); });
peer.on('disconnected', () => peer.reconnect());

document.getElementById('create-btn').addEventListener('click', () => {
    myPlayerId = 0;
    document.getElementById('create-btn').disabled = true;
    document.getElementById('my-id-wrapper').classList.remove('hidden');
    hostStatus.innerText = "Čekám na soupeře...";
    peer.on('connection', (c) => { conn = c; setupConnection(); });
});

document.getElementById('join-btn').addEventListener('click', () => {
    const rawId = document.getElementById('join-input').value.trim().replace(/\s/g, '');
    if (!rawId) return alert("Zadej ID!");
    myPlayerId = 1;
    connectionStatus.innerText = "⏳ Připojuji...";
    conn = peer.connect(rawId, { reliable: true });
    conn.on('open', () => {
        connectionStatus.innerText = "✅ Spojeno!";
        setupConnection();
        setTimeout(() => sendData('HELLO', {}), 1000);
    });
});

function setupConnection() {
    conn.on('data', (data) => handleNetworkData(data));
    conn.on('close', () => { alert("Odpojeno!"); location.reload(); });
}
function sendData(type, payload) { if (conn && conn.open) conn.send({ type, payload }); }

// ==========================================
// UPDATE LOGIKA
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
        
        // Zde jen aktualizujeme vizuál kostky, aby seděl na číslo, ale NERESETUJEME rotaci
        updateDiceVisual(GAME_STATE.currentRoll);

        updateUI();
        renderTokens();
        
        if (GAME_STATE.currentPlayerIndex === 1 && GAME_STATE.turnStep === 'MOVE') {
            const moveable = getMoveableTokens(PLAYERS[1], GAME_STATE.currentRoll);
            highlightTokens(moveable);
            showHints(moveable, GAME_STATE.currentRoll);
        }
    }
    if (myPlayerId === 0) {
        if (data.type === 'REQUEST_ROLL') handleRollLogic();
        if (data.type === 'REQUEST_MOVE') handleMoveLogic(1, data.payload.tokenIdx);
    }
}

function sendState() {
    if (myPlayerId !== 0) return;
    sendData('STATE_UPDATE', { players: PLAYERS, gameState: GAME_STATE });
}

// ==========================================
// HERNÍ LOGIKA (HOST)
// ==========================================

function startGameUI() {
    lobbyOverlay.classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    initBoard();
    updateDiceVisual(1); // Nastavíme kostku na 1 při startu
    updateUI();
}

function resetTurn(playerId) {
    const player = PLAYERS[playerId];
    const figuresInPlay = player.tokens.some(t => t !== -1 && t < 100); 
    
    GAME_STATE.currentPlayerIndex = playerId;
    // Neresetujeme currentRoll na 0, necháme tam poslední číslo (vizuálně hezčí)
    GAME_STATE.waitingForMove = false;
    GAME_STATE.turnStep = 'ROLL';
    GAME_STATE.rollsLeft = figuresInPlay ? 1 : 3;
    GAME_STATE.teleportAvailable = false;

    // Check na Teleport (Mega-Combo)
    // Pokud má hráč 2 a více figurek na speciálních políčkách, aktivuje se možnost teleportu pro třetí figurku
    const tokensOnSpecial = player.tokens.filter(t => t !== -1 && t < 100 && SPECIAL_TILES.includes(t % PATH_LENGTH)).length;
    if (tokensOnSpecial >= 2) {
        GAME_STATE.teleportAvailable = true;
    }

    statusText.innerText = `Na tahu: ${player.name}`;
    updateUI();
}

function handleRollLogic() {
    let roll = Math.floor(Math.random() * 6) + 1;
    
    // Rychlá animace
    let rotations = 0;
    let interval = setInterval(() => {
        let tempRoll = Math.floor(Math.random() * 6) + 1;
        updateDiceVisual(tempRoll); // Jen točíme, neukládáme do State
        rotations++;
        if(rotations > 10) {
            clearInterval(interval);
            finalizeRoll(roll);
        }
    }, 80);
}

function finalizeRoll(roll) {
    GAME_STATE.currentRoll = roll;
    GAME_STATE.rollsLeft--;

    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    const moveable = getMoveableTokens(player, roll);

    // Aktualizace vizuálu kostky na finální číslo
    updateDiceVisual(roll);

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
            setTimeout(nextPlayer, 1500);
        }
    }
    
    updateUI();
    sendState();
}

function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex) return;
    
    const player = PLAYERS[pid];
    const roll = GAME_STATE.currentRoll;
    let currentPos = player.tokens[tokenIdx];
    
    // 1. TELEPORT LOGIKA (Mega-Combo)
    // Pokud je aktivní teleport a hráč vybral figurku, která NENÍ v domečku a NENÍ na startu
    if (GAME_STATE.teleportAvailable && currentPos !== -1 && currentPos < 100) {
        // Teleportovat rovnou před domeček? Ne, zadání bylo "do domečku".
        // Uděláme to tak, že skočí na první políčko domečku.
        player.tokens[tokenIdx] = 100; // 100 = první políčko domečku
        GAME_STATE.teleportAvailable = false; // Vyčerpáno
        checkWin(player);
        nextPlayer();
        return; 
    }

    // 2. BOOST LOGIKA (Lokální)
    // Zjistíme, jestli TATO figurka stojí na blesku
    let multiplier = 1;
    if (currentPos !== -1 && currentPos < 100 && SPECIAL_TILES.includes(currentPos % PATH_LENGTH)) {
        multiplier = 2;
    }

    const effectiveRoll = roll * multiplier;

    // Standardní pohyb
    if (currentPos === -1) {
        // Nasazení (jen čistá 6)
        if (roll === 6) {
            player.tokens[tokenIdx] = player.startPos;
            handleKick(player.startPos, pid);
        }
    } else {
        let relativePos = (currentPos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
        let targetRelative = relativePos + effectiveRoll;
        
        if (targetRelative >= PATH_LENGTH) {
            player.tokens[tokenIdx] = 100 + (targetRelative - PATH_LENGTH);
            checkWin(player);
        } else {
            let newPos = (currentPos + effectiveRoll) % PATH_LENGTH;
            player.tokens[tokenIdx] = newPos;
            handleKick(newPos, pid);
        }
    }

    clearHints();

    if (roll === 6) {
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

// --- Pravidla ---

function getMoveableTokens(player, roll) {
    let options = [];
    player.tokens.forEach((pos, idx) => {
        // Speciální pravidlo pro TELEPORT
        if (GAME_STATE.teleportAvailable && pos !== -1 && pos < 100) {
            options.push(idx); // Můžu pohnout jakoukoliv figurkou na ploše do domečku
            return;
        }

        // Zjistíme multiplier pro tuto konkrétní figurku
        let multiplier = 1;
        if (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos % PATH_LENGTH)) {
            multiplier = 2;
        }
        let effectiveRoll = roll * multiplier;

        if (pos === -1) {
            // Nasazení (vždy čistá 6)
            if (roll === 6 && !isOccupiedBySelf(player.startPos, player.id)) options.push(idx);
        } else if (pos < 100) {
            let relativePos = (pos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
            let targetRelative = relativePos + effectiveRoll;

            if (targetRelative >= PATH_LENGTH) {
                let homeIdx = targetRelative - PATH_LENGTH;
                if (homeIdx <= 3 && !isOccupiedBySelfInHome(homeIdx, player.id)) options.push(idx);
            } else {
                let targetGlobal = (pos + effectiveRoll) % PATH_LENGTH;
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
                if (t === pos) {
                    p.tokens[idx] = -1; 
                }
            });
        }
    });
}

// --- Grafika a Interakce ---

function initBoard() {
    board.innerHTML = '';
    for(let y=0; y<BOARD_SIZE; y++) {
        for(let x=0; x<BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.x = x; cell.dataset.y = y;
            
            const pIdx = pathMap.findIndex(p=>p.x===x && p.y===y);
            if (pIdx !== -1) {
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
                
                // Přidání efektu nabití, pokud stojí na speciálním políčku
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
    // Pokud n není validní (např. 0), necháme to být
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
    
    document.querySelector('.front').innerText = "1";
    document.querySelector('.back').innerText = "2";
    document.querySelector('.right').innerText = "3";
    document.querySelector('.left').innerText = "4";
    document.querySelector('.top').innerText = "5";
    document.querySelector('.bottom').innerText = "6";
}

function updateUI() {
    p1Card.classList.toggle('active', GAME_STATE.currentPlayerIndex === 0);
    p2Card.classList.toggle('active', GAME_STATE.currentPlayerIndex === 1);
    
    // Zobrazení boost infa
    if (GAME_STATE.teleportAvailable) {
        powerupIndicator.classList.remove('hidden');
        powerupIndicator.innerText = "🌀 TELEPORT PŘIPRAVEN!";
    } else {
        powerupIndicator.classList.add('hidden');
    }

    const isMyTurn = GAME_STATE.currentPlayerIndex === myPlayerId;
    
    if (isMyTurn) {
        if (GAME_STATE.turnStep === 'ROLL') {
            rollBtn.disabled = false;
            rollBtn.innerHTML = `HODIT<br><span class="small">Pokusů: ${GAME_STATE.rollsLeft}</span>`;
        } else {
            rollBtn.disabled = true;
            rollBtn.innerHTML = `HRAJ<br><span class="small">Vyber figurku</span>`;
        }
    } else {
        rollBtn.disabled = true;
        rollBtn.innerHTML = `ČEKEJ<br><span class="small">Soupeř hraje</span>`;
    }
}

function showHints(tokenIndices, roll) {
    clearHints();
    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    
    tokenIndices.forEach(idx => {
        // Pokud je aktivní teleport, zvýrazníme domeček jako cíl
        if (GAME_STATE.teleportAvailable) {
            let homeStart = getCell(homePaths[player.id][0]);
            if(homeStart) homeStart.classList.add('target-hint');
            return;
        }

        const pos = player.tokens[idx];
        
        // Zjistit multiplier pro nápovědu
        let multiplier = 1;
        if (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos % PATH_LENGTH)) {
            multiplier = 2;
        }
        let effective = roll * multiplier;

        let targetCell = null;
        if (pos === -1) {
            targetCell = getCell(pathMap[player.startPos]);
        } else if (pos < 100) {
            let targetGlobal = (pos + effective) % PATH_LENGTH;
            let relativePos = (pos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
            if (relativePos + effective >= PATH_LENGTH) {
                let homeIdx = (relativePos + effective) - PATH_LENGTH;
                if (homeIdx < 4) targetCell = getCell(homePaths[player.id][homeIdx]);
            } else {
                targetCell = getCell(pathMap[targetGlobal]);
            }
        }
        
        if (targetCell) targetCell.classList.add('target-hint');
    });
}

function clearHints() {
    document.querySelectorAll('.target-hint').forEach(el => el.classList.remove('target-hint'));
}

function highlightTokens(indices) {
    const pClass = PLAYERS[GAME_STATE.currentPlayerIndex].class;
    document.querySelectorAll(`.token.${pClass}`).forEach(t => {
        if (indices.includes(parseInt(t.dataset.idx))) {
            t.classList.add('highlight');
        } else {
            t.style.opacity = '0.4';
        }
    });
}

// --- Helpers ---
function getCell(coords) { return document.querySelector(`.cell[data-x="${coords.x}"][data-y="${coords.y}"]`); }
function isHome(x,y,pid) { return homePaths[pid].some(p=>p.x===x && p.y===y); }
function isBase(x,y) { return bases.some(b=>b.x===x && b.y===y); }
function isOccupiedBySelf(idx, pid) { return PLAYERS[pid].tokens.includes(idx); }
function isOccupiedBySelfInHome(hIdx, pid) { return PLAYERS[pid].tokens.includes(100+hIdx); }

function checkWin(player) {
    if (player.tokens.every(t => t >= 100)) {
        alert(`🏆 VÍTĚZSTVÍ! ${player.name} je král koček!`);
        location.reload();
    }
}

// Listenery
rollBtn.addEventListener('click', () => {
    if (GAME_STATE.currentPlayerIndex === myPlayerId && GAME_STATE.turnStep === 'ROLL') {
        if (myPlayerId === 0) handleRollLogic();
        else sendData('REQUEST_ROLL', {});
    }
});

function onTokenClick(pid, idx) {
    if (pid === myPlayerId && GAME_STATE.currentPlayerIndex === myPlayerId && GAME_STATE.turnStep === 'MOVE') {
        if (myPlayerId === 0) handleMoveLogic(0, idx);
        else sendData('REQUEST_MOVE', { tokenIdx: idx });
    }
}

initBoard();
