console.log("Royal Cats Ludo v5.0 - Mobile Pro Loaded");

// --- UI Elementy ---
const board = document.getElementById('game-board');
const rollBtn = document.getElementById('roll-btn');
const rollInfo = document.getElementById('roll-info');
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
    currentRoll: 0,
    waitingForMove: false,
    rollsLeft: 1, 
    turnStep: 'ROLL', // 'ROLL' nebo 'MOVE'
    multiplier: 1 // Pro Power-upy
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

// ⚡ Specialní políčka (Power-ups: 2x hod)
// Indexy na cestě (0-39)
const SPECIAL_TILES = [5, 15, 25, 35, 10, 30]; 

// ==========================================
// SÍŤOVÁ ČÁST (Zachováno funkční z minula)
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
// UPDATE LOGIKA & ANIMACE
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
        
        // Animace kostky pro klienta, pokud se změnilo číslo
        updateDiceVisual(GAME_STATE.currentRoll);

        updateUI();
        renderTokens();
        
        if (GAME_STATE.currentPlayerIndex === 1 && GAME_STATE.turnStep === 'MOVE') {
            const moveable = getMoveableTokens(PLAYERS[1], GAME_STATE.currentRoll * GAME_STATE.multiplier);
            highlightTokens(moveable);
            showHints(moveable, GAME_STATE.currentRoll * GAME_STATE.multiplier);
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
    updateUI();
}

function resetTurn(playerId) {
    const player = PLAYERS[playerId];
    const figuresInPlay = player.tokens.some(t => t !== -1 && t < 100); 
    
    GAME_STATE.currentPlayerIndex = playerId;
    GAME_STATE.currentRoll = 0;
    GAME_STATE.waitingForMove = false;
    GAME_STATE.turnStep = 'ROLL';
    GAME_STATE.rollsLeft = figuresInPlay ? 1 : 3;
    GAME_STATE.multiplier = 1;

    statusText.innerText = `Na tahu: ${player.name}`;
    updateUI();
    
    // Zjistit, jestli hráč nestojí na Power-Upu
    checkPowerUpStart(player);
}

function checkPowerUpStart(player) {
    // Pokud má hráč nějakou figurku na speciálním políčku, dáváme boost příštímu hodu
    // (Zjednodušená logika: pokud je na tahu, a stojí na blesku, dostane indikátor)
    const onSpecial = player.tokens.some(t => SPECIAL_TILES.includes(t % PATH_LENGTH) && t !== -1 && t < 100);
    if (onSpecial) {
        GAME_STATE.multiplier = 2; // Připraveno, ale aplikuje se až po hodu
    }
}

function handleRollLogic() {
    // Animace kostky na hostovi
    let roll = Math.floor(Math.random() * 6) + 1;
    
    // Simulace rotace
    let rotations = 0;
    let interval = setInterval(() => {
        let tempRoll = Math.floor(Math.random() * 6) + 1;
        updateDiceVisual(tempRoll);
        rotations++;
        if(rotations > 10) {
            clearInterval(interval);
            finalizeRoll(roll);
        }
    }, 80);
}

function finalizeRoll(roll) {
    GAME_STATE.currentRoll = roll;
    
    // Kontrola Power-Upu (pokud stál na blesku, násobíme)
    // Zde je to tricky: Kterou figurkou hýbe? 
    // Pro zjednodušení: Pokud STOJÍ na blesku alespoň jednou figurkou, MÁ násobič pro tento hod.
    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    const isOnSpecial = player.tokens.some(t => SPECIAL_TILES.includes(t % PATH_LENGTH) && t < 100 && t !== -1);
    
    if (isOnSpecial) {
        GAME_STATE.multiplier = 2;
    } else {
        GAME_STATE.multiplier = 1;
    }

    const effectiveRoll = roll * GAME_STATE.multiplier;
    
    updateDiceVisual(roll); // Zobrazí číslo na kostce (1-6)
    
    if (GAME_STATE.multiplier > 1) {
        rollInfo.innerText = `⚡ BOOST! HOD ${roll} x 2 = ${effectiveRoll}`;
    } else {
        rollInfo.innerText = `Hodil jsi ${roll}`;
    }

    GAME_STATE.rollsLeft--;

    const moveable = getMoveableTokens(player, effectiveRoll);

    if (moveable.length > 0) {
        GAME_STATE.turnStep = 'MOVE';
        if (GAME_STATE.currentPlayerIndex === 0) {
            highlightTokens(moveable);
            showHints(moveable, effectiveRoll);
        }
    } else {
        if (GAME_STATE.rollsLeft > 0) {
            rollInfo.innerText = `Nic... Ještě ${GAME_STATE.rollsLeft} pokusy.`;
            GAME_STATE.turnStep = 'ROLL'; 
        } else {
            rollInfo.innerText = "Smůla. Konec kola.";
            setTimeout(nextPlayer, 1500);
        }
    }
    
    updateUI();
    sendState();
}

function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex) return;
    
    const player = PLAYERS[pid];
    const effectiveRoll = GAME_STATE.currentRoll * GAME_STATE.multiplier;
    const moveable = getMoveableTokens(player, effectiveRoll);

    if (!moveable.includes(tokenIdx)) return;

    let currentPos = player.tokens[tokenIdx];
    
    // Logika pohybu
    if (currentPos === -1) {
        player.tokens[tokenIdx] = player.startPos;
        handleKick(player.startPos, pid);
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

    // Čistíme nápovědu
    clearHints();

    if (GAME_STATE.currentRoll === 6) {
        rollInfo.innerText = "Šestka! Hraješ znovu.";
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
        if (pos === -1) {
            // Nasazení: standardně na 6, ALE pokud mám multiplier (stojím jinde na blesku), tak 6*2=12 mi k nasazení nepomůže.
            // Nasazení vyžaduje čistou 6 na kostce.
            if (GAME_STATE.currentRoll === 6 && !isOccupiedBySelf(player.startPos, player.id)) options.push(idx);
        } else if (pos < 100) {
            let relativePos = (pos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
            let targetRelative = relativePos + roll;

            if (targetRelative >= PATH_LENGTH) {
                let homeIdx = targetRelative - PATH_LENGTH;
                if (homeIdx <= 3 && !isOccupiedBySelfInHome(homeIdx, player.id)) options.push(idx);
            } else {
                let targetGlobal = (pos + roll) % PATH_LENGTH;
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
                    rollInfo.innerText = "🔥 VYHOZENÍ! 🔥";
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
            
            // Určení typu políčka
            const pIdx = pathMap.findIndex(p=>p.x===x && p.y===y);
            if (pIdx !== -1) {
                if (pIdx===0) cell.classList.add('start-p1');
                else if (pIdx===20) cell.classList.add('start-p2');
                else if (SPECIAL_TILES.includes(pIdx)) cell.classList.add('special'); // ⚡
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
                t.onclick = () => onTokenClick(player.id, idx);
                cell.appendChild(t);
            }
        });
    });
}

function updateDiceVisual(n) {
    // Rotace 3D kostky podle čísla
    if(n < 1) n = 1;
    const rotations = {
        1: 'rotateX(0deg) rotateY(0deg)',
        2: 'rotateX(0deg) rotateY(180deg)',
        3: 'rotateX(0deg) rotateY(-90deg)',
        4: 'rotateX(0deg) rotateY(90deg)',
        5: 'rotateX(-90deg) rotateY(0deg)',
        6: 'rotateX(90deg) rotateY(0deg)'
    };
    diceCube.style.transform = rotations[n];
    
    // Aktualizace textu na stěnách (jen pro jistotu)
    document.querySelectorAll('.face').forEach((f, i) => f.innerText = "");
    const faces = ['front', 'back', 'right', 'left', 'top', 'bottom']; // 1, 2, 3, 4, 5, 6
    const dots = ['•', '••', '•••', '::', '::•', ':::']; // Zjednodušená vizualizace
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
    
    // Indikátor boostu
    if (GAME_STATE.multiplier > 1 && GAME_STATE.turnStep === 'MOVE') {
        powerupIndicator.classList.remove('hidden');
    } else {
        powerupIndicator.classList.add('hidden');
    }

    const isMyTurn = GAME_STATE.currentPlayerIndex === myPlayerId;
    
    if (isMyTurn) {
        if (GAME_STATE.turnStep === 'ROLL') {
            rollBtn.disabled = false;
            rollBtn.innerText = `HODIT (${GAME_STATE.rollsLeft}x)`;
        } else {
            rollBtn.disabled = true;
            rollBtn.innerText = "HRAJ FIGURKOU";
        }
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "SOUPEŘ HRAJE";
    }
}

// Zvýrazní možné cíle (NÁPOVĚDA)
function showHints(tokenIndices, roll) {
    clearHints();
    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    
    tokenIndices.forEach(idx => {
        const pos = player.tokens[idx];
        let targetCell = null;

        if (pos === -1) {
            // Cíl je start
            targetCell = getCell(pathMap[player.startPos]);
        } else if (pos < 100) {
            let targetGlobal = (pos + roll) % PATH_LENGTH;
            // Ošetření vstupu do domečku
            let relativePos = (pos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
            if (relativePos + roll >= PATH_LENGTH) {
                let homeIdx = (relativePos + roll) - PATH_LENGTH;
                if (homeIdx < 4) targetCell = getCell(homePaths[player.id][homeIdx]);
            } else {
                targetCell = getCell(pathMap[targetGlobal]);
            }
        }
        
        if (targetCell) {
            targetCell.classList.add('target-hint');
        }
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
            t.style.opacity = '0.5';
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

// Event Listenery
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

// Init
initBoard();
