console.log("Royal Ludo v8.0 - 4 Player Edition");

// --- UI Elements ---
const board = document.getElementById('game-board');
const rollBtn = document.getElementById('roll-btn');
const diceCube = document.getElementById('dice-cube');
const statusText = document.getElementById('game-status-text');
const powerupIndicator = document.getElementById('powerup-indicator');
const magicCounterUI = document.getElementById('magic-counter');
const sevenValUI = document.getElementById('seven-count-val');
const playersBar = document.getElementById('players-bar');

// Lobby UI
const lobbyOverlay = document.getElementById('lobby-overlay');
const lobbyMenu = document.getElementById('lobby-menu');
const hostPanel = document.getElementById('host-panel');
const clientPanel = document.getElementById('client-panel');
const playerList = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');

// --- Konfigurace ---
const BOARD_SIZE = 11;
const PATH_LENGTH = 40; // Standardní okruh

// Definice 4 hráčů
const CHARACTERS = [
    { id: 0, name: 'Kočka', class: 'p1', icon: '🐱', startOffset: 0, color: '#fd79a8' },
    { id: 1, name: 'Myš', class: 'p2', icon: '🐭', startOffset: 10, color: '#0984e3' },
    { id: 2, name: 'Liška', class: 'p3', icon: '🦊', startOffset: 20, color: '#00b894' },
    { id: 3, name: 'Medvěd', class: 'p4', icon: '🐻', startOffset: 30, color: '#fdcb6e' }
];

// Stav hry
let PLAYERS = []; // Naplní se podle připojených lidí
let GAME_STATE = {
    currentPlayerIndex: 0,
    currentRoll: 1,
    turnStep: 'WAIT', // WAIT, ROLL, MOVE
    rollsLeft: 1,
    sevenCounters: { 0: 0, 1: 0, 2: 0, 3: 0 }, // Počítadlo sedmiček
    teleportActive: false
};

// Síť
let myPlayerId = null;
let peer = null;
let connections = {}; // Pro hosta: id -> conn
let hostConn = null; // Pro klienta

// --- MAPA (Standardní Ludo kříž) ---
// Generujeme cestu po obvodu 11x11 s domečky dovnitř
const pathMap = [];
// Cesta: Spodní hrana (zleva doprava), Pravá (zdola nahoru), Horní (zprava doleva), Levá (shora dolů)
// Start P1 (0): (0,10) -> (4,10)...
// Toto je zjednodušená definice okruhu 40 polí:
const perimeter = [
    {x:0,y:10}, {x:1,y:10}, {x:2,y:10}, {x:3,y:10}, {x:4,y:10}, // Spodek levá
    {x:4,y:9}, {x:4,y:8}, {x:4,y:7}, {x:4,y:6}, // Spodek kříž nahoru
    {x:3,y:6}, {x:2,y:6}, {x:1,y:6}, {x:0,y:6}, {x:0,y:5}, {x:0,y:4}, // Levé rameno
    {x:1,y:4}, {x:2,y:4}, {x:3,y:4}, {x:4,y:4}, // Zpět ke středu
    {x:4,y:3}, {x:4,y:2}, {x:4,y:1}, {x:4,y:0}, {x:5,y:0}, {x:6,y:0}, // Horní rameno
    {x:6,y:1}, {x:6,y:2}, {x:6,y:3}, {x:6,y:4}, // Dolů ke středu
    {x:7,y:4}, {x:8,y:4}, {x:9,y:4}, {x:10,y:4}, {x:10,y:5}, {x:10,y:6}, // Pravé rameno
    {x:9,y:6}, {x:8,y:6}, {x:7,y:6}, {x:6,y:6}, // Zpět ke středu
    {x:6,y:7}, {x:6,y:8}, {x:6,y:9}, {x:6,y:10}, // Dolní rameno
    {x:5,y:10} // Poslední pole
];
// Mapování aby to sedělo na indexy 0-39 přesně
// Pro zjednodušení si vytvoříme mapu tak, že P1 startuje na indexu 0.
// Generování souřadnic přesně pro Ludo je zdlouhavé, použijeme hardcoded "Round-Robin" mapu z pole výše, 
// ale musíme zajistit, že má 40 unikátních polí a navazuje. 
// Výše uvedené pole má 40 prvků a tvoří smyčku. P1 startuje na indexu 0. P2 na 10. P3 na 20. P4 na 30.

// Domečky (Home Rows)
const homePaths = {
    0: [{x:1,y:5}, {x:2,y:5}, {x:3,y:5}, {x:4,y:5}], // P1 jde zleva (upraveno pro mapu) -> NE, P1 startuje dole.
    // Oprava mapy podle Start pozic:
    // P1 (Kočka) start: (4,10) což je index 4 v poli perimeter? 
    // Uděláme to jednodušeji. Mapa je pole 40 souřadnic.
    // Startovní pozice na mapě: P1=0, P2=10, P3=20, P4=30.
    // Vstupy do domečku jsou vždy na (Start - 1). Tzn P1 vchází do domečku na indexu 39.
};

// Předefinování správné cesty a domečků pro 11x11 Grid:
const MAP_PATH = [
    // P1 Start Area (Dole, jde nahoru) - index 0
    {x:4, y:10}, {x:4, y:9}, {x:4, y:8}, {x:4, y:7}, {x:4, y:6}, 
    // Doleva
    {x:3, y:6}, {x:2, y:6}, {x:1, y:6}, {x:0, y:6}, 
    // Střed vlevo (otočka)
    {x:0, y:5}, {x:0, y:4}, {x:1, y:4}, {x:2, y:4}, {x:3, y:4}, {x:4, y:4},
    // Nahoru
    {x:4, y:3}, {x:4, y:2}, {x:4, y:1}, {x:4, y:0}, 
    // Střed nahoře
    {x:5, y:0}, {x:6, y:0}, {x:6, y:1}, {x:6, y:2}, {x:6, y:3}, {x:6, y:4},
    // Doprava
    {x:7, y:4}, {x:8, y:4}, {x:9, y:4}, {x:10, y:4},
    // Střed vpravo
    {x:10, y:5}, {x:10, y:6}, {x:9, y:6}, {x:8, y:6}, {x:7, y:6}, {x:6, y:6},
    // Dolů
    {x:6, y:7}, {x:6, y:8}, {x:6, y:9}, {x:6, y:10},
    // Střed dole
    {x:5, y:10}
]; 
// Kontrola: Length je 40.

// Domečky (cílové rovinky)
const HOMES = {
    0: [{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}], // P1 (z indexu 39)
    1: [{x:1, y:5}, {x:2, y:5}, {x:3, y:5}, {x:4, y:5}], // P2 (z indexu 9)
    2: [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}], // P3 (z indexu 19)
    3: [{x:9, y:5}, {x:8, y:5}, {x:7, y:5}, {x:6, y:5}]  // P4 (z indexu 29)
};

const BASES = {
    0: [{x:0,y:10}, {x:1,y:10}, {x:0,y:9}, {x:1,y:9}],
    1: [{x:0,y:0}, {x:1,y:0}, {x:0,y:1}, {x:1,y:1}],
    2: [{x:9,y:0}, {x:10,y:0}, {x:9,y:1}, {x:10,y:1}],
    3: [{x:9,y:10}, {x:10,y:10}, {x:9,y:9}, {x:10,y:9}]
};


// ==========================================
// SÍŤOVÁNÍ & LOBBY
// ==========================================

peer = new Peer(null, { debug: 1 });

peer.on('open', (id) => { 
    document.getElementById('my-id-code').innerText = id; 
});

// HOST LOGIKA
document.getElementById('create-btn').addEventListener('click', () => {
    myPlayerId = 0;
    setupPlayer(0);
    lobbyMenu.classList.add('hidden');
    hostPanel.classList.remove('hidden');

    // Host poslouchá připojení
    peer.on('connection', (c) => {
        c.on('open', () => {
            // Přidělit ID
            const newId = PLAYERS.length;
            if (newId >= 4) { c.send({type: 'ERROR', msg: 'Plno'}); c.close(); return; }
            
            connections[newId] = c;
            setupPlayer(newId);
            
            // Poslat nováčkovi jeho ID a data
            c.send({ type: 'WELCOME', id: newId, players: PLAYERS });
            
            // Broadcast všem update lobby
            broadcast({ type: 'LOBBY_UPDATE', players: PLAYERS });
            updateLobbyUI();
        });
        
        c.on('data', (data) => handleNetworkData(data, c));
        c.on('close', () => { 
            // Zjednodušení: Při odpojení v lobby reload. Ve hře to je složitější.
            location.reload(); 
        });
    });
});

// CLIENT LOGIKA
document.getElementById('join-btn').addEventListener('click', () => {
    const rawId = document.getElementById('join-input').value.trim();
    if (!rawId) return alert("Chybí kód!");
    
    lobbyMenu.classList.add('hidden');
    clientPanel.classList.remove('hidden');
    
    hostConn = peer.connect(rawId);
    hostConn.on('open', () => {
        document.getElementById('connection-status').innerText = "Spojeno, čekám na ID...";
    });
    hostConn.on('data', (data) => handleNetworkData(data));
    hostConn.on('close', () => alert("Hostitel hru ukončil."));
});

document.getElementById('start-game-btn').addEventListener('click', () => {
    if (PLAYERS.length < 2) return alert("Potřebuješ alespoň 2 hráče!");
    broadcast({ type: 'START_GAME' });
    initGame();
});

// Data handler
function handleNetworkData(data, senderConn) {
    // Client handling
    if (myPlayerId !== 0) {
        if (data.type === 'WELCOME') {
            myPlayerId = data.id;
            PLAYERS = data.players;
        }
        if (data.type === 'LOBBY_UPDATE') {
            PLAYERS = data.players; // Update seznamu
        }
        if (data.type === 'START_GAME') {
            initGame();
        }
        if (data.type === 'STATE_UPDATE') {
            GAME_STATE = data.state;
            PLAYERS = data.players; // Sync pozic
            renderGame();
        }
    } 
    // Host handling
    else {
        if (data.type === 'ACTION_ROLL') handleRollLogic();
        if (data.type === 'ACTION_MOVE') handleMoveLogic(data.pid, data.tokenIdx);
        if (data.type === 'ACTION_TELEPORT') handleTeleportLogic(data.pid, data.tokenIdx);
    }
}

function broadcast(msg) {
    Object.values(connections).forEach(c => c.send(msg));
}

function setupPlayer(id) {
    // Přidat hráče do pole PLAYERS
    PLAYERS.push({
        ...CHARACTERS[id],
        tokens: [-1, -1, -1, -1] // -1 = Base, 0-39 = Mapa, 100+ = Domeček
    });
    updateLobbyUI();
}

function updateLobbyUI() {
    playerList.innerHTML = '';
    PLAYERS.forEach(p => {
        const li = document.createElement('li');
        li.className = p.class;
        li.innerText = `${p.icon} ${p.name}`;
        playerList.appendChild(li);
    });
    if (myPlayerId === 0) {
        startGameBtn.disabled = PLAYERS.length < 2;
        startGameBtn.innerText = PLAYERS.length < 2 ? "Čekám na hráče..." : `SPUSTIT HRU (${PLAYERS.length})`;
    }
}

// ==========================================
// HERNÍ LOGIKA (HOST AUTHORITATIVE)
// ==========================================

function initGame() {
    lobbyOverlay.classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    // Generovat UI hráčů
    playersBar.innerHTML = '';
    PLAYERS.forEach(p => {
        const badge = document.createElement('div');
        badge.className = `player-badge ${p.class}`;
        badge.id = `badge-${p.id}`;
        badge.innerHTML = `<div class="avatar-icon">${p.icon}</div><div class="p-name">${p.name}</div><div class="seven-dot" id="dot-${p.id}"></div>`;
        playersBar.appendChild(badge);
    });

    initBoard();
    if (myPlayerId === 0) {
        resetTurn(0);
    }
    renderGame();
}

function resetTurn(pid) {
    GAME_STATE.currentPlayerIndex = pid;
    GAME_STATE.currentRoll = 1;
    GAME_STATE.turnStep = 'ROLL';
    GAME_STATE.teleportActive = false;
    
    // Má nějaké figurky ve hře? (Pro 3 pokusy na nasazení)
    const inPlay = PLAYERS[pid].tokens.some(t => t !== -1 && t < 100);
    GAME_STATE.rollsLeft = inPlay ? 1 : 3;

    sendState();
}

// 🎲 HOD KOSTKOU
function handleRollLogic() {
    // 15% šance na 7, jinak 1-6
    let roll;
    const rand = Math.random();
    if (rand < 0.15) roll = 7; 
    else roll = Math.floor(Math.random() * 6) + 1;
    
    // Animace pro všechny
    GAME_STATE.currentRoll = roll; // Dočasně pro vizuál
    sendState(); // Aby se protočila kostka
    
    setTimeout(() => {
        finalizeRoll(roll);
    }, 600);
}

function finalizeRoll(roll) {
    const pid = GAME_STATE.currentPlayerIndex;
    GAME_STATE.currentRoll = roll;
    GAME_STATE.rollsLeft--;

    if (roll === 7) {
        GAME_STATE.sevenCounters[pid]++;
        if (GAME_STATE.sevenCounters[pid] >= 3) {
            GAME_STATE.turnStep = 'MOVE'; // Povolit výběr pro teleport
            GAME_STATE.teleportActive = true; // Flag pro teleport
            sendState();
            return;
        } else {
            // Jen inkrement, konec tahu (pokud nejsou další hody)
            if (GAME_STATE.rollsLeft <= 0) setTimeout(nextPlayer, 1000);
            else GAME_STATE.turnStep = 'ROLL';
        }
    } else {
        // Klasický hod
        const moveable = getMoveableTokens(pid, roll);
        if (moveable.length > 0) {
            GAME_STATE.turnStep = 'MOVE';
        } else {
            if (GAME_STATE.rollsLeft > 0) GAME_STATE.turnStep = 'ROLL';
            else setTimeout(nextPlayer, 1000);
        }
    }
    sendState();
}

// 🏃 POHYB
function handleMoveLogic(pid, tokenIdx) {
    if (pid !== GAME_STATE.currentPlayerIndex) return;
    if (GAME_STATE.teleportActive) return; // Pokud je aktivní teleport, běžný klik nefunguje, musí jít přes teleport funkci

    const player = PLAYERS[pid];
    const roll = GAME_STATE.currentRoll;
    let currentPos = player.tokens[tokenIdx];
    let newPos = -1;

    // Nasazení
    if (currentPos === -1) {
        if (roll === 6) newPos = 0; // Lokální 0 (StartOffset se řeší při renderu/kolizi)
        else return; // Error
    } 
    // Pohyb v domečku
    else if (currentPos >= 100) {
        let homeIdx = currentPos - 100;
        if (homeIdx + roll <= 3) newPos = 100 + homeIdx + roll;
        else return; 
    }
    // Pohyb po mapě
    else {
        newPos = currentPos + roll;
        if (newPos >= PATH_LENGTH) {
            // Vstup do domečku
            let over = newPos - PATH_LENGTH;
            if (over <= 3) newPos = 100 + over;
            else return; // Moc velký hod
        }
    }

    // Aplikovat pohyb
    player.tokens[tokenIdx] = newPos;
    
    // Kolize (Vyhazování) - jen na mapě
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

// 🌀 TELEPORT
function handleTeleportLogic(pid, tokenIdx) {
    if (!GAME_STATE.teleportActive || pid !== GAME_STATE.currentPlayerIndex) return;
    
    const player = PLAYERS[pid];
    // Reset počítadla
    GAME_STATE.sevenCounters[pid] = 0;
    GAME_STATE.teleportActive = false;
    
    // Teleport na začátek domečku (100)
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
                        // KICK!
                        p.tokens[idx] = -1; // Zpět do base
                        // Poznámka: Animace se vyřeší v renderu, pokud si pamatujeme state, 
                        // ale pro jednoduchost tady jen update dat.
                    }
                }
            });
        }
    });
}

function checkWin(pid) {
    if (PLAYERS[pid].tokens.every(t => t >= 100)) {
        alert(`🏆 HRÁČ ${PLAYERS[pid].name} VYHRÁL!`);
        location.reload();
    }
}

function sendState() {
    const data = { type: 'STATE_UPDATE', state: GAME_STATE, players: PLAYERS };
    if (myPlayerId === 0) {
        handleNetworkData(data); // Host update sám sebe
        broadcast(data);
    }
}

// ==========================================
// POMOCNÉ FUNKCE PRO LOGIKU
// ==========================================

function getGlobalPos(pid, localPos) {
    if (localPos === -1 || localPos >= 100) return null;
    return (localPos + PLAYERS[pid].startOffset) % PATH_LENGTH;
}

function getMoveableTokens(pid, roll) {
    const p = PLAYERS[pid];
    let indices = [];
    p.tokens.forEach((pos, i) => {
        // Nasazení
        if (pos === -1) {
            if (roll === 6) {
                // Je start volný? (Můj start je local 0 -> global startOffset)
                if (!isOccupiedBySelf(pid, 0)) indices.push(i);
            }
        }
        // Mapa
        else if (pos < 100) {
            let next = pos + roll;
            if (next >= 40) { // Do domečku
                let homeIdx = next - 40;
                if (homeIdx <= 3 && !isOccupiedBySelfHome(pid, homeIdx)) indices.push(i);
            } else { // Po mapě
                // Kontrola, zda nestojím na svém
                if (!isOccupiedBySelf(pid, next)) indices.push(i);
            }
        }
        // Domeček
        else {
            let next = (pos - 100) + roll;
            if (next <= 3 && !isOccupiedBySelfHome(pid, next)) indices.push(i);
        }
    });
    return indices;
}

function isOccupiedBySelf(pid, localPos) {
    return PLAYERS[pid].tokens.some(t => t === localPos);
}
function isOccupiedBySelfHome(pid, homeIdx) {
    return PLAYERS[pid].tokens.some(t => t === 100 + homeIdx);
}


// ==========================================
// RENDER & UI
// ==========================================

function initBoard() {
    board.innerHTML = '';
    // Vykreslení gridu
    for(let y=0; y<BOARD_SIZE; y++) {
        for(let x=0; x<BOARD_SIZE; x++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.x = x; cell.dataset.y = y;
            
            // Je to cesta?
            const pathIdx = MAP_PATH.findIndex(p=>p.x===x && p.y===y);
            if (pathIdx !== -1) {
                cell.classList.add('path');
                // Obarvení startů
                PLAYERS.forEach(p => {
                    const startGlobal = p.startOffset;
                    if (pathIdx === startGlobal) cell.classList.add(`start-${p.class}`);
                });
            } 
            // Je to domeček?
            else {
                let isHome = false;
                for(let pid=0; pid<4; pid++) {
                    if (HOMES[pid].some(h=>h.x===x && h.y===y)) {
                        cell.classList.add(`home-p${pid+1}`);
                        isHome = true;
                    }
                }
                if (!isHome) cell.style.visibility = 'hidden'; // Base a prázdná místa
            }
            board.appendChild(cell);
        }
    }
}

function renderGame() {
    // 1. Update textů
    const p = PLAYERS[GAME_STATE.currentPlayerIndex];
    statusText.innerText = `Na tahu: ${p.name}`;
    statusText.style.color = p.color;
    
    document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active'));
    const activeBadge = document.getElementById(`badge-${p.id}`);
    if(activeBadge) activeBadge.classList.add('active');

    // Update sedmiček
    PLAYERS.forEach(pl => {
        const dot = document.getElementById(`dot-${pl.id}`);
        if(dot) dot.innerText = "⭐".repeat(GAME_STATE.sevenCounters[pl.id]);
    });

    // Zobrazení pro mého hráče
    if (myPlayerId === GAME_STATE.currentPlayerIndex) {
        rollBtn.disabled = GAME_STATE.turnStep !== 'ROLL';
        rollBtn.innerHTML = GAME_STATE.turnStep === 'ROLL' ? 'HODIT KOSTKOU' : 'HRAJ...';
        
        if (GAME_STATE.teleportActive) {
            powerupIndicator.classList.remove('hidden');
            powerupIndicator.innerText = "VYBER FIGURKU K TELEPORTU!";
            rollBtn.style.display = 'none';
        } else {
            powerupIndicator.classList.add('hidden');
            rollBtn.style.display = 'block';
        }
    } else {
        rollBtn.disabled = true;
        rollBtn.innerHTML = 'ČEKEJ';
        powerupIndicator.classList.add('hidden');
    }

    magicCounterUI.classList.toggle('hidden', myPlayerId === null);
    if(myPlayerId !== null) sevenValUI.innerText = GAME_STATE.sevenCounters[myPlayerId];

    // Kostka
    updateDiceVisual(GAME_STATE.currentRoll);

    // 2. Figurky
    document.querySelectorAll('.token').forEach(t => t.remove());
    document.querySelectorAll('.kill-hint').forEach(c => c.classList.remove('kill-hint'));
    document.querySelectorAll('.target-hint').forEach(c => c.classList.remove('target-hint'));

    PLAYERS.forEach(pl => {
        pl.tokens.forEach((pos, idx) => {
            let cell = null;
            
            if (pos === -1) {
                // Base - vizuálně je dáme do rohů (hardcoded bases)
                const basePos = BASES[pl.id][idx];
                cell = getCell(basePos);
                if(cell) cell.style.visibility = 'visible';
            } 
            else if (pos >= 100) {
                cell = getCell(HOMES[pl.id][pos-100]);
            } 
            else {
                const globalIdx = getGlobalPos(pl.id, pos);
                cell = getCell(MAP_PATH[globalIdx]);
            }

            if (cell) {
                const t = document.createElement('div');
                t.classList.add('token', pl.class);
                t.innerText = pl.icon;
                
                // Interaktivita
                if (pl.id === myPlayerId && pl.id === GAME_STATE.currentPlayerIndex) {
                    if (GAME_STATE.turnStep === 'MOVE' || GAME_STATE.teleportActive) {
                        // Zvýraznit pokud jde o validní tah
                        const moveable = getMoveableTokens(pl.id, GAME_STATE.currentRoll);
                        if (GAME_STATE.teleportActive) {
                             // Pro teleport můžu vybrat jakoukoliv figurku, která NENÍ v cíli a NENÍ obsazeno cílové pole
                             if (pos < 100 && !isOccupiedBySelfHome(pl.id, 0)) {
                                 t.classList.add('highlight');
                                 t.onclick = () => sendAction('TELEPORT', idx);
                             }
                        } else if (moveable.includes(idx)) {
                            t.classList.add('highlight');
                            t.onclick = () => sendAction('MOVE', idx);
                            
                            // Kill hint
                            showHint(pl.id, pos, GAME_STATE.currentRoll);
                        }
                    }
                }
                cell.appendChild(t);
            }
        });
    });
}

function showHint(pid, currentPos, roll) {
    // Spočítat cílové políčko a pokud tam je nepřítel, zčervenat
    let targetCell = null;
    let isKill = false;

    if (currentPos === -1) {
       // Nasazení na start
       const globalStart = PLAYERS[pid].startOffset;
       targetCell = getCell(MAP_PATH[globalStart]);
       isKill = isEnemyHere(globalStart, pid);
    } else if (currentPos < 100) {
        let next = currentPos + roll;
        if (next < 40) {
            let globalNext = getGlobalPos(pid, next);
            targetCell = getCell(MAP_PATH[globalNext]);
            isKill = isEnemyHere(globalNext, pid);
        }
    }

    if (targetCell) {
        targetCell.classList.add(isKill ? 'kill-hint' : 'target-hint');
    }
}

function isEnemyHere(globalIdx, myPid) {
    return PLAYERS.some(p => p.id !== myPid && p.tokens.some(t => t < 100 && t !== -1 && getGlobalPos(p.id, t) === globalIdx));
}

function updateDiceVisual(n) {
    if (n === 7) {
        diceCube.classList.add('show-seven');
        return;
    }
    diceCube.classList.remove('show-seven');
    const rot = {
        1: 'rotateX(0deg) rotateY(0deg)',
        2: 'rotateX(0deg) rotateY(180deg)',
        3: 'rotateX(0deg) rotateY(-90deg)',
        4: 'rotateX(0deg) rotateY(90deg)',
        5: 'rotateX(-90deg) rotateY(0deg)',
        6: 'rotateX(90deg) rotateY(0deg)'
    };
    diceCube.style.transform = rot[n] || rot[1];
}

function sendAction(type, tokenIdx) {
    if (myPlayerId === 0) {
        if (type === 'MOVE') handleMoveLogic(0, tokenIdx);
        if (type === 'TELEPORT') handleTeleportLogic(0, tokenIdx);
    } else {
        hostConn.send({ type: `ACTION_${type}`, pid: myPlayerId, tokenIdx });
    }
}

// Roll Listener
rollBtn.addEventListener('click', () => {
    if (myPlayerId === 0) handleRollLogic();
    else hostConn.send({ type: 'ACTION_ROLL' });
});

function getCell(c) { return document.querySelector(`.cell[data-x="${c.x}"][data-y="${c.y}"]`); }
