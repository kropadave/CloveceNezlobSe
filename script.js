console.log("Script.js v4.0 - FINAL CONNECTION FIX");

// --- HTML Elementy ---
const board = document.getElementById('game-board');
const rollBtn = document.getElementById('roll-btn');
const diceDisplay = document.getElementById('dice');
const rollInfo = document.getElementById('roll-info');
const messageLog = document.getElementById('message-log');
const gameContainer = document.getElementById('game-container');
const lobbyOverlay = document.getElementById('lobby-overlay');
const hostStatus = document.getElementById('host-status');
const connectionStatus = document.getElementById('connection-status');
const p1Card = document.getElementById('p1-card');
const p2Card = document.getElementById('p2-card');

// --- Konfigurace ---
const BOARD_SIZE = 11;
const PATH_LENGTH = 40;

let PLAYERS = [
    { id: 0, name: 'Zrzek', class: 'p1', colorClass: 'player-orange', startPos: 0, tokens: [-1, -1, -1, -1], baseIndices: [0, 1, 2, 3] },
    { id: 1, name: 'Modrák', class: 'p2', colorClass: 'player-blue', startPos: 20, tokens: [-1, -1, -1, -1], baseIndices: [4, 5, 6, 7] }
];

let GAME_STATE = {
    currentPlayerIndex: 0,
    currentRoll: 0,
    waitingForMove: false,
    rollsLeft: 1, 
    turnStep: 'ROLL'
};

let myPlayerId = null; 
let conn = null; 
let lastPeerId = null;

// --- Mapy ---
const pathMap = [
    {x:4, y:10}, {x:4, y:9}, {x:4, y:8}, {x:4, y:7}, {x:4, y:6}, {x:3, y:6}, {x:2, y:6}, {x:1, y:6}, {x:0, y:6}, 
    {x:0, y:5}, {x:0, y:4}, {x:1, y:4}, {x:2, y:4}, {x:3, y:4}, {x:4, y:4}, {x:4, y:3}, {x:4, y:2}, {x:4, y:1}, {x:4, y:0},
    {x:5, y:0}, {x:6, y:0}, {x:6, y:1}, {x:6, y:2}, {x:6, y:3}, {x:6, y:4}, {x:7, y:4}, {x:8, y:4}, {x:9, y:4}, {x:10, y:4},
    {x:10, y:5}, {x:10, y:6}, {x:9, y:6}, {x:8, y:6}, {x:7, y:6}, {x:6, y:6}, {x:6, y:7}, {x:6, y:8}, {x:6, y:9}, {x:6, y:10},
    {x:5, y:10}
];
const homePaths = [[{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}], [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}]];
const bases = [{x:0, y:10}, {x:1, y:10}, {x:0, y:9}, {x:1, y:9}, {x:9, y:1}, {x:10, y:1}, {x:9, y:0}, {x:10, y:0}];


// ==========================================
// SÍŤOVÁ ČÁST - MAXIMÁLNÍ KOMPATIBILITA
// ==========================================

// Používáme základní PeerJS konfiguraci bez vynucování vlastních STUN serverů,
// protože PeerJS cloud to často řeší lépe sám automaticky.
const peer = new Peer(null, {
    debug: 2
});

peer.on('open', (id) => {
    lastPeerId = id;
    console.log("Moje ID: " + id);
    document.getElementById('my-id-code').innerText = id;
    connectionStatus.innerText = "Připraven. Vyber roli.";
});

peer.on('error', (err) => {
    console.error("Peer Error:", err);
    let msg = "Chyba sítě.";
    if (err.type === 'peer-unavailable') msg = "ID nenalezeno. Zkontroluj kód.";
    if (err.type === 'network') msg = "Ztraceno připojení k internetu.";
    if (err.type === 'browser-incompatible') msg = "Prohlížeč nepodporuje WebRTC.";
    alert(msg);
    connectionStatus.innerText = "❌ " + msg;
});

peer.on('disconnected', () => {
    connectionStatus.innerText = "⚠️ Odpojeno od serveru. Zkouším znovu...";
    peer.reconnect();
});

// HOST - Čeká na spojení
document.getElementById('create-btn').addEventListener('click', () => {
    myPlayerId = 0;
    document.getElementById('create-btn').disabled = true;
    document.getElementById('my-id-wrapper').classList.remove('hidden');
    hostStatus.innerText = "Čekám na připojení soupeře...";
    
    peer.on('connection', (c) => {
        // Přijetí spojení
        conn = c;
        setupConnection();
        hostStatus.innerText = "Spojování...";
    });
});

// KLIENT - Připojuje se
document.getElementById('join-btn').addEventListener('click', () => {
    const rawId = document.getElementById('join-input').value.trim();
    if (!rawId) return alert("Musíš zadat ID!");
    const hostId = rawId.replace(/\s/g, ''); 

    myPlayerId = 1;
    connectionStatus.innerText = "⏳ Připojuji se k hostiteli...";
    
    // Zkusíme reliable: true pro lepší stabilitu
    conn = peer.connect(hostId, {
        reliable: true
    });

    // Pojistka, kdyby se event 'open' nespustil
    const failTimeout = setTimeout(() => {
        if (!conn.open) {
            connectionStatus.innerText = "⚠️ Spojení trvá dlouho. Zkuste to znovu nebo oba Refresh.";
        }
    }, 8000);
    
    conn.on('open', () => {
        clearTimeout(failTimeout);
        connectionStatus.innerText = "✅ Spojeno! Čekej na start...";
        setupConnection();
        // Počkáme chvilku a pošleme pozdrav
        setTimeout(() => {
            sendData('HELLO', {});
        }, 1000);
    });

    conn.on('error', (err) => {
        alert("Chyba při spojování: " + err);
    });
});

function setupConnection() {
    conn.on('data', (data) => {
        console.log("Data přijata:", data.type);
        handleNetworkData(data);
    });
    
    conn.on('close', () => {
        alert("Spojení přerušeno!");
        location.reload();
    });
}

function sendData(type, payload) {
    if (conn && conn.open) {
        conn.send({ type, payload });
    } else {
        console.warn("Nelze odeslat data, spojení není otevřené.");
    }
}


// ==========================================
// SYNCHRONIZACE A HRA
// ==========================================

function handleNetworkData(data) {
    // 1. HOST přijme HELLO -> Spustí hru
    if (myPlayerId === 0 && data.type === 'HELLO') {
        console.log("Host: Klient je tu. Startuji.");
        hostStatus.innerText = "Hra běží!";
        startGameUI();
        resetTurn(0);
        sendState();
    }

    // 2. KLIENT přijme STATE_UPDATE -> Aktualizuje se
    if (myPlayerId === 1 && data.type === 'STATE_UPDATE') {
        if (gameContainer.classList.contains('hidden')) {
            startGameUI();
        }
        
        PLAYERS = data.payload.players;
        GAME_STATE = data.payload.gameState;
        messageLog.innerHTML = data.payload.logs;
        
        if (GAME_STATE.currentRoll > 0) diceDisplay.innerText = getDiceIcon(GAME_STATE.currentRoll);
        
        updateUI();
        renderTokens(); // Důležité: Překreslit figurky podle dat od Hosta
        
        if (GAME_STATE.currentPlayerIndex === 1 && GAME_STATE.turnStep === 'MOVE') {
            const moveable = getMoveableTokens(PLAYERS[1], GAME_STATE.currentRoll);
            highlightTokens(moveable);
        }
    }

    // 3. HOST přijímá akce
    if (myPlayerId === 0) {
        if (data.type === 'REQUEST_ROLL') handleRollLogic();
        if (data.type === 'REQUEST_MOVE') handleMoveLogic(1, data.payload.tokenIdx);
    }
}

function sendState() {
    if (myPlayerId !== 0) return;
    sendData('STATE_UPDATE', {
        players: PLAYERS,
        gameState: GAME_STATE,
        logs: messageLog.innerHTML
    });
}

// ==========================================
// HERNÍ LOGIKA (Hostitel počítá vše)
// ==========================================

function startGameUI() {
    lobbyOverlay.classList.add('hidden');
    gameContainer.classList.remove('hidden');
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
    
    log(`Na tahu je ${player.name}.`);
    diceDisplay.innerText = "🎲";
    
    updateUI();
}

function handleRollLogic() {
    let i = 0;
    const interval = setInterval(() => {
        diceDisplay.innerText = getDiceIcon(Math.floor(Math.random()*6)+1);
        i++;
        if (i > 10) {
            clearInterval(interval);
            finalizeRoll();
        }
    }, 50);
}

function finalizeRoll() {
    const roll = Math.floor(Math.random() * 6) + 1;
    GAME_STATE.currentRoll = roll;
    diceDisplay.innerText = getDiceIcon(roll);
    
    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    log(`${player.name} hodil ${roll}.`);
    GAME_STATE.rollsLeft--;

    const moveable = getMoveableTokens(player, roll);

    if (moveable.length > 0) {
        GAME_STATE.turnStep = 'MOVE';
        if (GAME_STATE.currentPlayerIndex === 0) highlightTokens(moveable);
    } else {
        if (GAME_STATE.rollsLeft > 0) {
            log(`Žádný tah. Ještě ${GAME_STATE.rollsLeft} pokus(y).`);
            GAME_STATE.turnStep = 'ROLL'; 
        } else {
            log("Žádný tah. Konec kola.");
            setTimeout(nextPlayer, 1500);
        }
    }
    
    renderTokens(); // Update pro hosta
    updateUI();
    sendState();    // Update pro klienta
}

function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex) return;
    
    const player = PLAYERS[pid];
    const roll = GAME_STATE.currentRoll;
    const moveable = getMoveableTokens(player, roll);

    if (!moveable.includes(tokenIdx)) return;

    let currentPos = player.tokens[tokenIdx];
    
    if (currentPos === -1) {
        player.tokens[tokenIdx] = player.startPos;
        handleKick(player.startPos, pid);
        log("Figurka nasazena!");
    } else {
        let relativePos = (currentPos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
        let targetRelative = relativePos + roll;
        
        if (targetRelative >= PATH_LENGTH) {
            player.tokens[tokenIdx] = 100 + (targetRelative - PATH_LENGTH);
            log("Figurka v domečku!");
            checkWin(player);
        } else {
            let newPos = (currentPos + roll) % PATH_LENGTH;
            player.tokens[tokenIdx] = newPos;
            handleKick(newPos, pid);
        }
    }

    if (roll === 6) {
        log("Padla šestka! Hraješ znovu.");
        resetTurn(pid); 
        GAME_STATE.rollsLeft = 1; 
    } else {
        nextPlayer();
    }

    renderTokens(); // Update pro hosta
    updateUI();
    sendState();    // Update pro klienta
}

function nextPlayer() {
    const nextPid = GAME_STATE.currentPlayerIndex === 0 ? 1 : 0;
    resetTurn(nextPid);
    renderTokens();
    updateUI();
    sendState();
}

function getMoveableTokens(player, roll) {
    let options = [];
    player.tokens.forEach((pos, idx) => {
        if (pos === -1) {
            if (roll === 6 && !isOccupiedBySelf(player.startPos, player.id)) options.push(idx);
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
                    log(`🔥 ${PLAYERS[attackerId].name} vyhodil ${p.name}a!`);
                }
            });
        }
    });
}

// --- UI / Board ---

rollBtn.addEventListener('click', () => {
    if (GAME_STATE.currentPlayerIndex !== myPlayerId) return;
    if (GAME_STATE.turnStep !== 'ROLL') return;

    if (myPlayerId === 0) handleRollLogic();
    else sendData('REQUEST_ROLL', {});
});

function onTokenClick(pid, idx) {
    if (pid !== myPlayerId) return;
    if (GAME_STATE.currentPlayerIndex !== myPlayerId) return;
    if (GAME_STATE.turnStep !== 'MOVE') return;

    if (myPlayerId === 0) handleMoveLogic(0, idx);
    else sendData('REQUEST_MOVE', { tokenIdx: idx });
}

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
                if (pIdx===20) cell.classList.add('start-p2');
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

function updateUI() {
    p1Card.classList.toggle('active', GAME_STATE.currentPlayerIndex === 0);
    p2Card.classList.toggle('active', GAME_STATE.currentPlayerIndex === 1);
    
    const isMyTurn = GAME_STATE.currentPlayerIndex === myPlayerId;
    
    if (isMyTurn && GAME_STATE.turnStep === 'ROLL') {
        rollBtn.disabled = false;
        const attempts = GAME_STATE.rollsLeft > 1 ? `(${GAME_STATE.rollsLeft}x)` : "";
        rollBtn.innerText = `HODIT KOSTKOU ${attempts}`;
        rollInfo.innerText = "Jsi na tahu, házej!";
        rollBtn.classList.add('pulse');
    } else if (isMyTurn && GAME_STATE.turnStep === 'MOVE') {
        rollBtn.disabled = true;
        rollBtn.innerText = "VYBER FIGURKU";
        rollInfo.innerText = "Klikni na figurku pro pohyb.";
        rollBtn.classList.remove('pulse');
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = "ČEKEJ...";
        rollInfo.innerText = `Hraje soupeř (${PLAYERS[GAME_STATE.currentPlayerIndex].name}).`;
        rollBtn.classList.remove('pulse');
    }
}

function highlightTokens(indices) {
    const pClass = PLAYERS[GAME_STATE.currentPlayerIndex].class;
    document.querySelectorAll(`.token.${pClass}`).forEach(t => {
        if (indices.includes(parseInt(t.dataset.idx))) {
            t.classList.add('highlight');
            t.style.cursor = 'pointer';
        } else {
            t.style.opacity = '0.5';
            t.style.cursor = 'not-allowed';
        }
    });
}

function log(msg) {
    const p = document.createElement('div');
    p.innerText = `> ${msg}`;
    messageLog.prepend(p);
}

function checkWin(player) {
    if (player.tokens.every(t => t >= 100)) {
        alert(`🏆 VÍTĚZSTVÍ! ${player.name} vyhrál!`);
        location.reload();
    }
}

function getDiceIcon(n) { return ['⚀','⚁','⚂','⚃','⚄','⚅'][n-1]; }
function getCell(coords) { return document.querySelector(`.cell[data-x="${coords.x}"][data-y="${coords.y}"]`); }
function isHome(x,y,pid) { return homePaths[pid].some(p=>p.x===x && p.y===y); }
function isBase(x,y) { return bases.some(b=>b.x===x && b.y===y); }
function isOccupiedBySelf(idx, pid) { return PLAYERS[pid].tokens.includes(idx); }
function isOccupiedBySelfInHome(hIdx, pid) { return PLAYERS[pid].tokens.includes(100+hIdx); }

initBoard();
