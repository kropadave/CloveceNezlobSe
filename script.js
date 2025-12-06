// --- Původní proměnné ---
const board = document.getElementById('game-board');
const rollBtn = document.getElementById('roll-btn');
const diceDisplay = document.getElementById('dice');
const messageLog = document.getElementById('message-log');
const currentPlayerName = document.getElementById('current-player-name');
const gameContainer = document.getElementById('game-container');
const lobbyOverlay = document.getElementById('lobby-overlay');
const myRoleSpan = document.getElementById('my-role');

// --- Konfigurace hry ---
const BOARD_SIZE = 11;
const PATH_LENGTH = 40;
// Resetujeme stav, abychom ho mohli synchronizovat
let PLAYERS = [
    { id: 0, name: 'Zrzek', class: 'p1', colorClass: 'player-orange', startPos: 0, tokens: [-1, -1, -1, -1], baseIndices: [0, 1, 2, 3] },
    { id: 1, name: 'Modrák', class: 'p2', colorClass: 'player-blue', startPos: 20, tokens: [-1, -1, -1, -1], baseIndices: [4, 5, 6, 7] }
];

let currentPlayerIndex = 0;
let currentRoll = 0;
let waitingForMove = false;
let myPlayerId = null; // 0 (Host) nebo 1 (Klient)
let conn = null; // PeerJS spojení

// --- Mapy a souřadnice (stejné jako minule) ---
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
// SÍŤOVÁ ČÁST (PEERJS)
// ==========================================

const peer = new Peer(); // Automaticky vygeneruje ID

peer.on('open', (id) => {
    document.getElementById('my-id-code').innerText = id;
    console.log('Moje Peer ID je: ' + id);
});

// Tlačítko ZALOŽIT HRU (Host)
document.getElementById('create-btn').addEventListener('click', () => {
    myPlayerId = 0;
    document.getElementById('create-btn').disabled = true;
    document.getElementById('my-id-display').style.display = 'block';
    document.getElementById('status-text').innerText = "Čekám na soupeře...";
    
    // Čekáme, až se někdo připojí
    peer.on('connection', (c) => {
        conn = c;
        setupConnection();
        log("Soupeř připojen! Hra začíná.");
        startGameUI();
        // Host pošle úvodní stav
        sendState();
    });
});

// Tlačítko PŘIPOJIT SE (Klient)
document.getElementById('join-btn').addEventListener('click', () => {
    const hostId = document.getElementById('join-input').value.trim();
    if (!hostId) return alert("Zadej ID hostitele!");

    myPlayerId = 1;
    conn = peer.connect(hostId);
    
    conn.on('open', () => {
        setupConnection();
        log("Připojeno k hostiteli!");
        startGameUI();
    });
});

function setupConnection() {
    conn.on('data', (data) => {
        handleNetworkData(data);
    });
    conn.on('close', () => {
        alert("Spojení ztraceno!");
        location.reload();
    });
}

function startGameUI() {
    lobbyOverlay.style.display = 'none';
    gameContainer.style.display = 'block';
    initBoard();
    myRoleSpan.innerText = myPlayerId === 0 ? "Zrzek (Ty)" : "Modrák (Ty)";
    myRoleSpan.className = myPlayerId === 0 ? "player-orange" : "player-blue";
    updateUI();
}

function sendData(type, payload) {
    if (conn && conn.open) {
        conn.send({ type, payload });
    }
}

// Hostitel posílá kompletní stav hry klientovi
function sendState() {
    if (myPlayerId !== 0) return; // Jen host posílá stav
    sendData('STATE_UPDATE', {
        players: PLAYERS,
        currentPlayerIndex: currentPlayerIndex,
        currentRoll: currentRoll,
        waitingForMove: waitingForMove,
        lastLog: messageLog.innerText
    });
}

// Zpracování příchozích dat
function handleNetworkData(data) {
    // Pokud jsem KLIENT, přijímám stav hry od Hosta
    if (myPlayerId === 1 && data.type === 'STATE_UPDATE') {
        PLAYERS = data.payload.players;
        currentPlayerIndex = data.payload.currentPlayerIndex;
        currentRoll = data.payload.currentRoll;
        waitingForMove = data.payload.waitingForMove;
        messageLog.innerText = data.payload.lastLog;
        
        // Pokud padla kostka, zobraz ji
        if (currentRoll > 0) diceDisplay.innerText = getDiceIcon(currentRoll);
        
        updateUI();
        renderTokens();
        
        // Zvýraznit moje tahy, pokud jsem na tahu
        if (currentPlayerIndex === 1 && waitingForMove) {
            const moveable = getMoveableTokens(PLAYERS[1], currentRoll);
            highlightTokens(moveable);
        }
    }

    // Pokud jsem HOST, přijímám akce od Klienta
    if (myPlayerId === 0) {
        if (data.type === 'REQUEST_ROLL') {
            handleRollClick(); // Spustí logiku hodu
        }
        if (data.type === 'REQUEST_MOVE') {
            handleTokenClickLogic(1, data.payload.tokenIdx); // Spustí logiku tahu pro hráče 1
        }
    }
}

// ==========================================
// HERNÍ LOGIKA (Upravená pro Host/Klient)
// ==========================================

function initBoard() {
    board.innerHTML = '';
    for(let y=0; y<BOARD_SIZE; y++) {
        for(let x=0; x<BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.x = x;
            cell.dataset.y = y;
            const pathIndex = pathMap.findIndex(p => p.x === x && p.y === y);
            if (pathIndex !== -1) {
                if (pathIndex === 0) cell.classList.add('start-p1');
                if (pathIndex === 20) cell.classList.add('start-p2');
            } else if (isHome(x, y, 0)) { cell.classList.add('home-p1'); }
            else if (isHome(x, y, 1)) { cell.classList.add('home-p2'); }
            else if (isBase(x, y)) { cell.classList.add('base'); }
            else { cell.style.visibility = 'hidden'; }
            board.appendChild(cell);
        }
    }
    renderTokens();
}

function renderTokens() {
    document.querySelectorAll('.token').forEach(t => t.remove());
    PLAYERS.forEach(player => {
        player.tokens.forEach((pos, tokenIdx) => {
            let targetCell;
            if (pos === -1) targetCell = getCell(bases[player.baseIndices[tokenIdx]].x, bases[player.baseIndices[tokenIdx]].y);
            else if (pos >= 100) targetCell = getCell(homePaths[player.id][pos-100].x, homePaths[player.id][pos-100].y);
            else targetCell = getCell(pathMap[pos % PATH_LENGTH].x, pathMap[pos % PATH_LENGTH].y);

            if (targetCell) {
                const token = document.createElement('div');
                token.classList.add('token', player.class);
                token.dataset.player = player.id;
                token.dataset.tokenIdx = tokenIdx;
                // Click event posíláme do sítě
                token.onclick = () => onTokenClickUI(player.id, tokenIdx);
                targetCell.appendChild(token);
            }
        });
    });
}

// UI: Kliknutí na tlačítko HOD
rollBtn.addEventListener('click', () => {
    if (currentPlayerIndex !== myPlayerId) return; // Není můj tah
    if (waitingForMove) return;

    if (myPlayerId === 0) {
        handleRollClick(); // Host rovnou hraje
    } else {
        sendData('REQUEST_ROLL', {}); // Klient žádá o hod
    }
});

// Logika: Hod kostkou (Vykonává jen HOST)
function handleRollClick() {
    rollBtn.disabled = true;
    // Animace (jen vizuální, výsledek se pošle)
    let rolls = 0;
    const interval = setInterval(() => {
        const tempRoll = Math.floor(Math.random() * 6) + 1;
        diceDisplay.innerText = getDiceIcon(tempRoll);
        rolls++;
        if (rolls > 10) {
            clearInterval(interval);
            // Skutečný hod
            currentRoll = Math.floor(Math.random() * 6) + 1;
            diceDisplay.innerText = getDiceIcon(currentRoll);
            log(`${PLAYERS[currentPlayerIndex].name} hodil ${currentRoll}.`);
            
            const moveable = getMoveableTokens(PLAYERS[currentPlayerIndex], currentRoll);
            
            if (moveable.length === 0) {
                log("Žádný tah.");
                setTimeout(nextTurn, 1500);
                waitingForMove = false;
            } else {
                waitingForMove = true;
                if (currentPlayerIndex === 0) highlightTokens(moveable); // Host vidí své tahy hned
            }
            sendState(); // Synchronizace
        }
    }, 50);
}

// UI: Kliknutí na figurku
function onTokenClickUI(playerId, tokenIdx) {
    if (playerId !== myPlayerId) return; // Klikám na cizí
    if (currentPlayerIndex !== myPlayerId) return; // Není můj tah
    if (!waitingForMove) return;

    if (myPlayerId === 0) {
        handleTokenClickLogic(0, tokenIdx);
    } else {
        sendData('REQUEST_MOVE', { tokenIdx: tokenIdx });
    }
}

// Logika: Pohyb figurky (Vykonává jen HOST)
function handleTokenClickLogic(playerId, tokenIdx) {
    if (playerId !== currentPlayerIndex) return;
    const player = PLAYERS[playerId];
    const moveable = getMoveableTokens(player, currentRoll);

    if (!moveable.includes(tokenIdx)) return;

    // Provést tah
    let currentPos = player.tokens[tokenIdx];
    if (currentPos === -1) {
        player.tokens[tokenIdx] = player.startPos;
        checkKick(player.startPos, player.id);
    } else {
        let relativePos = (currentPos - player.startPos + PATH_LENGTH) % PATH_LENGTH;
        let targetRelative = relativePos + currentRoll;
        if (targetRelative >= PATH_LENGTH) {
            player.tokens[tokenIdx] = 100 + (targetRelative - PATH_LENGTH);
            checkWin(player);
        } else {
            let newPos = (currentPos + currentRoll) % PATH_LENGTH;
            player.tokens[tokenIdx] = newPos;
            checkKick(newPos, player.id);
        }
    }

    waitingForMove = false;
    if (currentRoll === 6) {
        log("Šestka! Hraješ znovu.");
        rollBtn.disabled = false; // Pro Hosta
    } else {
        nextTurn();
    }
    sendState(); // Synchronizace
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
                if ((targetRelative - PATH_LENGTH) < 4 && !isOccupiedBySelfInHome(targetRelative - PATH_LENGTH, player.id)) options.push(idx);
            } else {
                if (!isOccupiedBySelf((pos + roll) % PATH_LENGTH, player.id)) options.push(idx);
            }
        }
    });
    return options;
}

function nextTurn() {
    currentPlayerIndex = (currentPlayerIndex === 0) ? 1 : 0;
    updateUI();
}

function updateUI() {
    const nextP = PLAYERS[currentPlayerIndex];
    currentPlayerName.innerText = `${nextP.name}`;
    currentPlayerName.className = nextP.colorClass;
    
    // Povolení tlačítka
    if (currentPlayerIndex === myPlayerId && !waitingForMove) {
        rollBtn.disabled = false;
        rollBtn.innerText = "HÁZEJ!";
    } else {
        rollBtn.disabled = true;
        rollBtn.innerText = (currentPlayerIndex === myPlayerId) ? "Hraj figurkou..." : "Čekej na soupeře...";
    }
    
    document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));
    document.querySelectorAll('.token').forEach(el => el.style.opacity = '1');
}

// --- Pomocné funkce (stejné) ---
function getDiceIcon(n) { return ['⚀','⚁','⚂','⚃','⚄','⚅'][n-1]; }
function getCell(x, y) { return document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`); }
function isHome(x, y, pid) { return homePaths[pid].some(p => p.x === x && p.y === y); }
function isBase(x, y) { return bases.some(b => b.x === x && b.y === y); }
function log(msg) { messageLog.innerText = msg; }
function isOccupiedBySelf(idx, pid) { return PLAYERS[pid].tokens.some(t => t === idx); }
function isOccupiedBySelfInHome(idx, pid) { return PLAYERS[pid].tokens.some(t => t === 100 + idx); }

function checkKick(pos, attackerId) {
    PLAYERS.forEach(p => {
        if (p.id !== attackerId) {
            p.tokens.forEach((t, idx) => {
                if (t === pos) {
                    p.tokens[idx] = -1;
                    log(`Au! ${PLAYERS[attackerId].name} vyhodil ${p.name}a!`);
                }
            });
        }
    });
}

function checkWin(player) {
    if (player.tokens.filter(t => t >= 100).length === 4) {
        log(`VÍTĚZSTVÍ! ${player.name} vyhrál!`);
        alert(`${player.name} vyhrál!`);
    }
}

function highlightTokens(indices) {
    const playerClass = PLAYERS[currentPlayerIndex].class;
    const tokens = document.querySelectorAll(`.token.${playerClass}`);
    tokens.forEach(t => {
        if (indices.includes(parseInt(t.dataset.tokenIdx))) t.classList.add('highlight');
        else t.style.opacity = '0.5';
    });
}