console.log("Royal Ludo - 4 Players Edition");

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
const PATH_LENGTH = 40; // Délka okruhu

// Hráči - 4 pozice
// active: zda se účastní hry (připojen)
let PLAYERS = [
    { id: 0, name: 'P1', class: 'p1', active: true,  startIdx: 0,  tokens: [-1, -1, -1, -1] },
    { id: 1, name: 'P2', class: 'p2', active: false, startIdx: 10, tokens: [-1, -1, -1, -1] },
    { id: 2, name: 'P3', class: 'p3', active: false, startIdx: 20, tokens: [-1, -1, -1, -1] },
    { id: 3, name: 'P4', class: 'p4', active: false, startIdx: 30, tokens: [-1, -1, -1, -1] }
];

let GAME_STATE = {
    currentPlayerIndex: 0,
    currentRoll: 1,
    waitingForMove: false,
    rollsLeft: 3, // Startuje se s 3 hody pro nasazení
    turnStep: 'ROLL',
    teleportAvailable: false,
    gameStarted: false
};

let myPlayerId = null; 
let peer = null;
let hostConnections = []; // Host: pole spojení [null, connP2, connP3, connP4]
let clientConn = null;    // Client: spojení na hosta

// --- MAPA (Generování symetrického okruhu na 11x11) ---
// Cross shape path for 11x11 board
// Start P1 (Bottom-Left part) -> Clockwise
// Indexy 0-39 jsou hlavní cesta.
// Domečky jsou virtuální 100+
const pathMap = generatePathMap();
const homePaths = generateHomePaths();
const bases = generateBases();
const SPECIAL_TILES = [4, 14, 24, 34]; // Boost políčka po startu

function generatePathMap() {
    // Definujeme cestu ručně po segmentech pro 11x11, aby to sedělo
    // Začátek P1 je dole (4, 10)
    let p = [];
    // P1 Side (Bottom)
    p.push({x:4,y:10}, {x:4,y:9}, {x:4,y:8}, {x:4,y:7}, {x:4,y:6}); // Up
    p.push({x:3,y:6}, {x:2,y:6}, {x:1,y:6}, {x:0,y:6}, {x:0,y:5}); // Left to edge
    p.push({x:0,y:4}, {x:1,y:4}, {x:2,y:4}, {x:3,y:4}, {x:4,y:4}); // Right back
    p.push({x:4,y:3}, {x:4,y:2}, {x:4,y:1}, {x:4,y:0}, {x:5,y:0}); // Up to top edge (P2 start area)
    
    // P2 Side (Top -> Right)
    p.push({x:6,y:0}, {x:6,y:1}, {x:6,y:2}, {x:6,y:3}, {x:6,y:4}); // Down
    p.push({x:7,y:4}, {x:8,y:4}, {x:9,y:4}, {x:10,y:4}, {x:10,y:5}); // Right to edge
    p.push({x:10,y:6}, {x:9,y:6}, {x:8,y:6}, {x:7,y:6}, {x:6,y:6}); // Left back
    p.push({x:6,y:7}, {x:6,y:8}, {x:6,y:9}, {x:6,y:10}, {x:5,y:10}); // Down to bottom edge
    
    // Note: The above is a bit manual. Let's re-order to standard index 0 = P1 Start.
    // Standard Ludo Path Order:
    // 0: Start P1 (White/Red) -> moves clockwise around board
    // Grid 11x11. Center (5,5).
    // Start P1: (0,6) -> right -> up... or standard variation.
    // Let's use the layout from the previous request but expanded.
    // 4 Ramena.
    // Rameno dolní (x=4,5,6, y=6..10)
    
    // Zjednodušená cesta po obvodu kříže:
    const map = [];
    // 1. Úsek (Dole vlevo -> nahoru) - Start P1 area
    // Start P1 na indexu 0. Řekněme, že start je (4, 10)
    
    // Segment 1 (Dole -> Střed vlevo): (6,10) -> (6,6)
    // Abychom zachovali logiku "startIdx 0, 10, 20, 30", musíme mít 40 polí.
    // Každý kvadrant má 10 polí.
    
    // Q1 (P1 Start -> P2 Start)
    map.push({x:6, y:10}, {x:6, y:9}, {x:6, y:8}, {x:6, y:7}, {x:6, y:6}); // 5 polí nahoru
    map.push({x:7, y:6}, {x:8, y:6}, {x:9, y:6}, {x:10, y:6}, {x:10, y:5}); // 5 polí doprava a roh

    // Q2 (P2 Start -> P3 Start)
    map.push({x:10, y:4}, {x:9, y:4}, {x:8, y:4}, {x:7, y:4}, {x:6, y:4}); // 5 polí doleva
    map.push({x:6, y:3}, {x:6, y:2}, {x:6, y:1}, {x:6, y:0}, {x:5, y:0}); // 5 polí nahoru a roh

    // Q3 (P3 Start -> P4 Start)
    map.push({x:4, y:0}, {x:4, y:1}, {x:4, y:2}, {x:4, y:3}, {x:4, y:4}); // 5 polí dolů
    map.push({x:3, y:4}, {x:2, y:4}, {x:1, y:4}, {x:0, y:4}, {x:0, y:5}); // 5 polí doleva a roh

    // Q4 (P4 Start -> P1 Start)
    map.push({x:0, y:6}, {x:1, y:6}, {x:2, y:6}, {x:3, y:6}, {x:4, y:6}); // 5 polí doprava
    map.push({x:4, y:7}, {x:4, y:8}, {x:4, y:9}, {x:4, y:10}, {x:5, y:10}); // 5 polí dolů a roh

    // Startovní pozice v poli (pro nasazení):
    // P1 startuje na indexu 0 (x:6, y:10)
    // P2 startuje na indexu 10 (x:10, y:4)
    // P3 startuje na indexu 20 (x:4, y:0)
    // P4 startuje na indexu 30 (x:0, y:6)
    
    return map;
}

function generateHomePaths() {
    // Cesty do domečku (střed 5,5)
    // P1 (od spodu nahoru): (5,9) -> (5,6)
    // P2 (od prava doleva): (9,5) -> (6,5)
    // P3 (od shora dolu): (5,1) -> (5,4)
    // P4 (od leva doprava): (1,5) -> (4,5)
    return [
        [{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}], // P1
        [{x:9, y:5}, {x:8, y:5}, {x:7, y:5}, {x:6, y:5}], // P2
        [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}], // P3
        [{x:1, y:5}, {x:2, y:5}, {x:3, y:5}, {x:4, y:5}]  // P4
    ];
}

function generateBases() {
    // Rohy boardu
    return [
        // P1 Bases (Bottom Right)
        {x:9, y:9}, {x:10, y:9}, {x:9, y:10}, {x:10, y:10},
        // P2 Bases (Top Right)
        {x:9, y:0}, {x:10, y:0}, {x:9, y:1}, {x:10, y:1},
        // P3 Bases (Top Left)
        {x:0, y:0}, {x:1, y:0}, {x:0, y:1}, {x:1, y:1},
        // P4 Bases (Bottom Left)
        {x:0, y:9}, {x:1, y:9}, {x:0, y:10}, {x:1, y:10}
    ];
}

// ==========================================
// SÍŤ (PeerJS) - 4 Hráči
// ==========================================
peer = new Peer(null, { debug: 1 });

peer.on('open', (id) => { 
    document.getElementById('my-id-code').innerText = id; 
});
peer.on('error', (err) => { alert("Chyba sítě: " + err.type); });

// --- HOST LOGIC ---
document.getElementById('create-btn').addEventListener('click', () => {
    myPlayerId = 0;
    hostConnections = [null, null, null, null]; // Slot 0 is me
    
    lobbyMenu.classList.add('hidden');
    hostLobbyUi.classList.remove('hidden');
    
    peer.on('connection', (conn) => {
        handleHostConnection(conn);
    });
});

function handleHostConnection(conn) {
    // Najdi první volný slot (1, 2, nebo 3)
    let freeSlot = -1;
    if (!PLAYERS[1].active) freeSlot = 1;
    else if (!PLAYERS[2].active) freeSlot = 2;
    else if (!PLAYERS[3].active) freeSlot = 3;

    if (freeSlot === -1) {
        conn.send({ type: 'ERROR', msg: 'Lobby is full!' });
        setTimeout(() => conn.close(), 500);
        return;
    }

    // Assign slot
    PLAYERS[freeSlot].active = true;
    hostConnections[freeSlot] = conn;

    conn.on('open', () => {
        conn.send({ 
            type: 'WELCOME', 
            payload: { yourId: freeSlot, players: PLAYERS }
        });
        updateLobbyUI();
        broadcastData('LOBBY_UPDATE', { players: PLAYERS });
        
        conn.on('data', (data) => handleHostData(freeSlot, data));
        conn.on('close', () => {
            PLAYERS[freeSlot].active = false;
            hostConnections[freeSlot] = null;
            updateLobbyUI();
            broadcastData('LOBBY_UPDATE', { players: PLAYERS });
        });
    });
}

startGameBtn.addEventListener('click', () => {
    GAME_STATE.gameStarted = true;
    resetTurn(0); // Začíná P1
    broadcastData('GAME_START', { gameState: GAME_STATE, players: PLAYERS });
    startGameUI();
});

// --- CLIENT LOGIC ---
document.getElementById('join-btn').addEventListener('click', () => {
    const rawId = document.getElementById('join-input').value.trim().replace(/\s/g, '');
    if (!rawId) return alert("Zadej kód!");
    
    document.getElementById('connection-status').innerText = "Připojování...";
    clientConn = peer.connect(rawId, { reliable: true });

    clientConn.on('open', () => {
        document.getElementById('connection-status').innerText = "Spojeno! Čekám na hosta...";
    });

    clientConn.on('data', (data) => handleClientData(data));
    clientConn.on('close', () => { alert("Hostitel ukončil hru."); location.reload(); });
});

// --- DATA HANDLERS ---

function broadcastData(type, payload) {
    // Pošle data všem připojeným klientům
    hostConnections.forEach(c => {
        if (c && c.open) c.send({ type, payload });
    });
}

function handleHostData(senderId, data) {
    // Data od klientů (např. hodil kostkou)
    if (data.type === 'REQUEST_ROLL') {
        if (GAME_STATE.currentPlayerIndex === senderId) handleRollLogic();
    }
    if (data.type === 'REQUEST_MOVE') {
        if (GAME_STATE.currentPlayerIndex === senderId) handleMoveLogic(senderId, data.payload.tokenIdx);
    }
}

function handleClientData(data) {
    if (data.type === 'WELCOME') {
        myPlayerId = data.payload.yourId;
        PLAYERS = data.payload.players;
        document.getElementById('connection-status').innerText = `Jsi připojen jako P${myPlayerId + 1}`;
    }
    if (data.type === 'LOBBY_UPDATE') {
        PLAYERS = data.payload.players; // Jen pro info, UI update v lobby pro klienty není kritický
    }
    if (data.type === 'GAME_START') {
        GAME_STATE = data.payload.gameState;
        PLAYERS = data.payload.players;
        startGameUI();
        updateUI();
    }
    if (data.type === 'STATE_UPDATE') {
        GAME_STATE = data.payload.gameState;
        PLAYERS = data.payload.players;
        updateDiceVisual(GAME_STATE.currentRoll);
        updateUI();
        renderTokens();
        
        // Pokud jsem na řadě já, zobraz hinty
        if (GAME_STATE.currentPlayerIndex === myPlayerId && GAME_STATE.turnStep === 'MOVE') {
            const moveable = getMoveableTokens(PLAYERS[myPlayerId], GAME_STATE.currentRoll);
            highlightTokens(moveable);
            showHints(moveable, GAME_STATE.currentRoll);
        }
    }
}

function updateLobbyUI() {
    // Jen pro hosta
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
    // Enable start button if at least 1 other player (total 2)
    if (activeCount >= 2) {
        startGameBtn.disabled = false;
        startGameBtn.innerHTML = "SPUSTIT HRU ▶";
        hostStatus.innerText = "Připraveno ke startu";
    } else {
        startGameBtn.disabled = true;
        hostStatus.innerText = "Čekám na minimálně 1 soupeře...";
    }
}

// ==========================================
// GAME LOGIC
// ==========================================

function startGameUI() {
    lobbyOverlay.classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    // Skryj nepoužívané badges
    PLAYERS.forEach((p, idx) => {
        if (!p.active) playerBadges[idx].style.display = 'none';
    });

    initBoard();
    updateDiceVisual(1);
    updateUI();
}

function resetTurn(playerId) {
    // Ujistíme se, že hráč je aktivní, jinak přeskočíme
    let nextId = playerId;
    let loopGuard = 0;
    while (!PLAYERS[nextId].active && loopGuard < 5) {
        nextId = (nextId + 1) % 4;
        loopGuard++;
    }
    
    GAME_STATE.currentPlayerIndex = nextId;
    const player = PLAYERS[nextId];
    
    // Zjištění, zda má figurky ve hře
    const figuresInPlay = player.tokens.some(t => t !== -1 && t < 100); 
    
    GAME_STATE.turnStep = 'ROLL';
    // Pokud nemá figurky ve hře, má 3 hody na nasazení
    GAME_STATE.rollsLeft = figuresInPlay ? 1 : 3;
    GAME_STATE.teleportAvailable = false;
    GAME_STATE.waitingForMove = false;

    // Boost/Teleport logika (zjednodušená pro 4 hráče)
    const tokensOnSpecial = player.tokens.filter(t => t !== -1 && t < 100 && SPECIAL_TILES.includes(t)).length;
    if (tokensOnSpecial >= 1 && figuresInPlay) {
        // Jednodušší pravidlo: 1 na boostu = možnost teleportu, pokud chceš
        // Necháme to zatím vypnuté pro zjednodušení pravidel ve 4, nebo aktivujeme:
        // GAME_STATE.teleportAvailable = true;
    }

    statusText.innerText = `Na tahu: ${player.name}`;
    updateUI();
}

function handleRollLogic() {
    let roll = Math.floor(Math.random() * 6) + 1;
    // Animace
    let rotations = 0;
    let interval = setInterval(() => {
        updateDiceVisual(Math.floor(Math.random() * 6) + 1);
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

    if (moveable.length > 0) {
        GAME_STATE.turnStep = 'MOVE';
        // Pokud jsem host a hraju já, ukážu hinty hned.
        // Pokud hraje klient, pošlu mu STATE_UPDATE a on si zobrazí hinty sám (v handleClientData)
        if (GAME_STATE.currentPlayerIndex === 0) {
            highlightTokens(moveable);
            showHints(moveable, roll);
        }
    } else {
        // Nemůže hrát
        if (GAME_STATE.rollsLeft > 0 && !player.tokens.some(t => t !== -1 && t < 100)) {
            // Má ještě pokusy na nasazení
            GAME_STATE.turnStep = 'ROLL'; 
        } else {
            setTimeout(nextPlayer, 1000);
        }
    }
    
    updateUI();
    if (myPlayerId === 0) broadcastData('STATE_UPDATE', { players: PLAYERS, gameState: GAME_STATE });
}

function nextPlayer() {
    clearHints();
    let nextPid = (GAME_STATE.currentPlayerIndex + 1) % 4;
    resetTurn(nextPid);
    renderTokens();
    updateUI();
    if (myPlayerId === 0) broadcastData('STATE_UPDATE', { players: PLAYERS, gameState: GAME_STATE });
}

function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex) return;
    
    const player = PLAYERS[pid];
    const roll = GAME_STATE.currentRoll;
    let currentPos = player.tokens[tokenIdx];
    
    // --- 1. NASAZENÍ (Start) ---
    if (currentPos === -1) {
        if (roll === 6) {
            player.tokens[tokenIdx] = player.startIdx; // Globální index na mapě
            handleKick(player.startIdx, pid);
        }
    } 
    // --- 2. POHYB V DOMEČKU ---
    else if (currentPos >= 100) {
        let currentHomeIdx = currentPos - 100;
        let targetHomeIdx = currentHomeIdx + roll;
        if (targetHomeIdx <= 3 && !isOccupiedBySelfInHome(targetHomeIdx, pid)) {
             player.tokens[tokenIdx] = 100 + targetHomeIdx;
             checkWin(player);
        }
    } 
    // --- 3. POHYB NA MAPĚ ---
    else {
        // Boost efekt
        let multiplier = SPECIAL_TILES.includes(currentPos) ? 2 : 1;
        let effectiveRoll = roll * multiplier;
        
        // Výpočet cíle
        // Musíme zjistit, kolik kroků zbývá do "vstupu do domečku"
        // Start indexy: P1=0, P2=10, P3=20, P4=30. Délka=40.
        // Vstup do domečku je vždy (startIdx - 1 + 40) % 40.
        
        // Relativní pozice od startu hráče
        let relativePos = (currentPos - player.startIdx + PATH_LENGTH) % PATH_LENGTH;
        let targetRelative = relativePos + effectiveRoll;
        
        if (targetRelative >= PATH_LENGTH) {
            // Jde do domečku
            let homeStep = targetRelative - PATH_LENGTH; // 0 = první políčko
            if (homeStep <= 3 && !isOccupiedBySelfInHome(homeStep, pid)) {
                player.tokens[tokenIdx] = 100 + homeStep;
                checkWin(player);
            }
        } else {
            // Normální pohyb po okruhu
            let newPos = (currentPos + effectiveRoll) % PATH_LENGTH;
            player.tokens[tokenIdx] = newPos;
            handleKick(newPos, pid);
        }
    }

    clearHints();
    // Pokud hodil 6, hraje znovu
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

function handleKick(pos, attackerId) {
    PLAYERS.forEach(p => {
        if (p.id !== attackerId && p.active) {
            p.tokens.forEach((t, idx) => {
                if (t === pos) {
                    // Vyhození
                    p.tokens[idx] = -1;
                    // Animace/Alert by byl fajn, ale stačí refresh
                }
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
            // Nasazení jen na 6 a pokud je start volný (nebo tam mám cizího, kterého vyhodím, ale ne sebe)
            if (roll === 6 && !player.tokens.includes(player.startIdx)) options.push(idx);
        } else if (pos >= 100) {
            let target = (pos - 100) + roll;
            if (target <= 3 && !player.tokens.includes(100+target)) options.push(idx);
        } else {
            // Mapa
            let relativePos = (pos - player.startIdx + PATH_LENGTH) % PATH_LENGTH;
            if (relativePos + effective >= PATH_LENGTH) {
                // Domeček
                let h = (relativePos + effective) - PATH_LENGTH;
                if (h <= 3 && !player.tokens.includes(100+h)) options.push(idx);
            } else {
                // Posun
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
            
            // Path
            const pIdx = pathMap.findIndex(p=>p.x===x && p.y===y);
            
            if (pIdx !== -1) {
                cell.classList.add('path');
                if (pIdx === 0) cell.classList.add('start-p1');
                if (pIdx === 10) cell.classList.add('start-p2');
                if (pIdx === 20) cell.classList.add('start-p3');
                if (pIdx === 30) cell.classList.add('start-p4');
                if (SPECIAL_TILES.includes(pIdx)) cell.classList.add('special');
            }
            // Homes
            else if (isHome(x,y,0)) cell.classList.add('home-p1');
            else if (isHome(x,y,1)) cell.classList.add('home-p2');
            else if (isHome(x,y,2)) cell.classList.add('home-p3');
            else if (isHome(x,y,3)) cell.classList.add('home-p4');
            else {
                cell.style.visibility = 'hidden'; // Base políčka neukazujeme na gridu, jsou "neviditelná"
            }
            
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
                // Base: Tady si to zjednodušíme - base figurky nejsou na mapě vidět
                // Ale můžeme je vykreslit do rohu gridu, pokud tam jsou definovaná base políčka
                // V tomto setupu base políčka jsou defined, ale mají visibility hidden.
                // Prozatím je necháme "zmizelé" dokud nejsou nasazeny.
                // NEBO: Využijeme base coords a uděláme je visible
                // Změna: Base políčka uděláme visible jen pro figurky
                // Ale jednodušší je: pokud je -1, nevykreslujeme token na desce, jen v UI info (pokud bychom měli počítadlo)
                // PRO HRU: Je lepší je vidět.
                // Najdeme base coord
                let b = bases[player.id * 4 + idx];
                cell = getCell(b);
                if(cell) cell.style.visibility = 'visible';
            }
            else if (pos >= 100) cell = getCell(homePaths[player.id][pos-100]);
            else cell = getCell(pathMap[pos]);

            if (cell) {
                const t = document.createElement('div');
                t.classList.add('token', player.class);
                t.dataset.idx = idx;
                t.dataset.pid = player.id;
                
                if (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos)) t.classList.add('charged');
                
                t.onclick = () => onTokenClick(player.id, idx);
                cell.appendChild(t);
            }
        });
    });
}

function updateDiceVisual(n) {
    if (!n) return;
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
    playerBadges.forEach((el, i) => {
        el.classList.toggle('active', i === GAME_STATE.currentPlayerIndex);
    });

    const isMyTurn = GAME_STATE.currentPlayerIndex === myPlayerId;
    
    if (isMyTurn) {
        if (GAME_STATE.turnStep === 'ROLL') {
            rollBtn.disabled = false;
            rollBtn.innerHTML = `HODIT <span class="small">Kostkou</span>`;
            rollBtn.style.opacity = 1;
        } else {
            rollBtn.disabled = true;
            rollBtn.innerHTML = `HRAJ <span class="small">Vyber figurku</span>`;
        }
    } else {
        rollBtn.disabled = true;
        rollBtn.innerHTML = `ČEKEJ <span class="small">Soupeř hraje</span>`;
        rollBtn.style.opacity = 0.5;
    }
}

function showHints(tokenIndices, roll) {
    const player = PLAYERS[GAME_STATE.currentPlayerIndex];
    tokenIndices.forEach(idx => {
        const pos = player.tokens[idx];
        let multiplier = (pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos)) ? 2 : 1;
        let effective = roll * multiplier;
        
        let targetCell = null;
        if (pos === -1) {
            targetCell = getCell(pathMap[player.startIdx]);
        } else if (pos >= 100) {
            let t = (pos-100) + roll;
            if(t<=3) targetCell = getCell(homePaths[player.id][t]);
        } else {
            let rel = (pos - player.startIdx + PATH_LENGTH) % PATH_LENGTH;
            if (rel + effective >= PATH_LENGTH) {
                let h = (rel + effective) - PATH_LENGTH;
                if(h<=3) targetCell = getCell(homePaths[player.id][h]);
            } else {
                targetCell = getCell(pathMap[(pos+effective)%PATH_LENGTH]);
            }
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

// Helpers
function getCell(c) { return document.querySelector(`.cell[data-x="${c.x}"][data-y="${c.y}"]`); }
function isHome(x,y,pid) { return homePaths[pid].some(p=>p.x===x && p.y===y); }
function isOccupiedBySelfInHome(hIdx, pid) { return PLAYERS[pid].tokens.includes(100+hIdx); }

function checkWin(player) {
    if (player.tokens.every(t => t >= 100)) {
        alert(`🏆 VÍTĚZSTVÍ! ${player.name} vyhrál!`);
        location.reload();
    }
}

// Listeners
rollBtn.addEventListener('click', () => {
    if (GAME_STATE.currentPlayerIndex === myPlayerId && GAME_STATE.turnStep === 'ROLL') {
        if (myPlayerId === 0) handleRollLogic(); 
        else if (clientConn) clientConn.send({ type: 'REQUEST_ROLL' });
    }
});

function onTokenClick(pid, idx) {
    if (pid === myPlayerId && GAME_STATE.currentPlayerIndex === myPlayerId && GAME_STATE.turnStep === 'MOVE') {
        if (myPlayerId === 0) handleMoveLogic(0, idx); 
        else if (clientConn) clientConn.send({ type: 'REQUEST_MOVE', payload: { tokenIdx: idx } });
    }
}
