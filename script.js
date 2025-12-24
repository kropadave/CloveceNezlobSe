console.log("Royal Ludo: FINAL REPAIR");

// --- KONFIGURACE ---
const BOARD_SIZE = 11;
const PATH_LENGTH = 40;
const SPECIAL_TILES = [5, 12, 18, 25, 32, 38]; // Boost políčka

// Definice postav
const CHARACTERS = [
    { id: 0, class: 'p1', icon: '🐱', color: '#ff7675', startOffset: 0 },
    { id: 1, class: 'p2', icon: '🐭', color: '#0984e3', startOffset: 10 },
    { id: 2, class: 'p3', icon: '🦊', color: '#00b894', startOffset: 20 },
    { id: 3, class: 'p4', icon: '🐻', color: '#fdcb6e', startOffset: 30 }
];

// Mapa (Cesta dokola)
const MAP_PATH = [
    {x:4, y:10}, {x:4, y:9}, {x:4, y:8}, {x:4, y:7}, {x:4, y:6}, // 0-4
    {x:3, y:6}, {x:2, y:6}, {x:1, y:6}, {x:0, y:6}, {x:0, y:5}, // 5-9
    {x:0, y:4}, {x:1, y:4}, {x:2, y:4}, {x:3, y:4}, {x:4, y:4}, // 10-14
    {x:4, y:3}, {x:4, y:2}, {x:4, y:1}, {x:4, y:0}, {x:5, y:0}, // 15-19
    {x:6, y:0}, {x:6, y:1}, {x:6, y:2}, {x:6, y:3}, {x:6, y:4}, // 20-24
    {x:7, y:4}, {x:8, y:4}, {x:9, y:4}, {x:10, y:4}, {x:10, y:5}, // 25-29
    {x:10, y:6}, {x:9, y:6}, {x:8, y:6}, {x:7, y:6}, {x:6, y:6}, // 30-34
    {x:6, y:7}, {x:6, y:8}, {x:6, y:9}, {x:6, y:10}, {x:5, y:10} // 35-39
];

// Domečky
const HOMES = {
    0: [{x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}],
    1: [{x:1, y:5}, {x:2, y:5}, {x:3, y:5}, {x:4, y:5}],
    2: [{x:5, y:1}, {x:5, y:2}, {x:5, y:3}, {x:5, y:4}],
    3: [{x:9, y:5}, {x:8, y:5}, {x:7, y:5}, {x:6, y:5}]
};

// Základny (Base) - Vizuální pozice pro vyhozené figurky
const BASES = {
    0: [{x:0,y:10}, {x:1,y:10}, {x:0,y:9}, {x:1,y:9}],
    1: [{x:0,y:0}, {x:1,y:0}, {x:0,y:1}, {x:1,y:1}],
    2: [{x:9,y:0}, {x:10,y:0}, {x:9,y:1}, {x:10,y:1}],
    3: [{x:9,y:10}, {x:10,y:10}, {x:9,y:9}, {x:10,y:9}]
};

// STAV HRY
let players = []; 
let myId = null; 
let gameState = {
    turn: 0, // Kdo je na řadě (index v poli players)
    step: 'ROLL', // ROLL nebo MOVE
    roll: 1,
    rollsLeft: 1,
    magic: { 0:0, 1:0, 2:0, 3:0 },
    teleporting: false,
    msg: "Čekání na hru..."
};

// PeerJS
let peer = new Peer();
let conns = []; // Host: seznam spojení
let hostConn = null; // Klient: spojení s hostem

// --- 1. PŘÍPRAVA HRY (INIT) ---

// Zobrazení mého ID
peer.on('open', (id) => {
    document.getElementById('my-id-code').innerText = id;
});

// HOST: Založit hru
document.getElementById('create-btn').onclick = () => {
    myId = 0; // Host je vždy 0
    players = [ { ...CHARACTERS[0], tokens: [-1,-1,-1,-1] } ]; // Hned se přidám
    
    document.getElementById('lobby-menu').classList.add('hidden');
    document.getElementById('host-panel').classList.remove('hidden');
    updateLobby();

    // Poslouchat připojení
    peer.on('connection', (c) => {
        c.on('open', () => {
            let pid = players.length;
            if(pid >= 4) { c.close(); return; } // Plno
            
            conns.push(c);
            players.push({ ...CHARACTERS[pid], tokens: [-1,-1,-1,-1] });
            
            // Poslat data nováčkovi
            c.send({ type: 'WELCOME', id: pid, players: players });
            // Říct ostatním
            broadcast({ type: 'UPDATE_LOBBY', players: players });
            updateLobby();
        });
        c.on('data', (d) => handleData(d));
    });
};

// KLIENT: Připojit se
document.getElementById('join-btn').onclick = () => {
    let hostId = document.getElementById('join-input').value;
    if(!hostId) return alert("Chybí ID!");

    document.getElementById('lobby-menu').classList.add('hidden');
    document.getElementById('client-panel').classList.remove('hidden');

    hostConn = peer.connect(hostId);
    hostConn.on('open', () => document.getElementById('connection-status').innerText = "Spojeno!");
    hostConn.on('data', (d) => handleData(d));
};

// START HRY
document.getElementById('start-game-btn').onclick = () => {
    broadcast({ type: 'START' });
    initBoard();
    startGame();
};

function updateLobby() {
    let list = document.getElementById('player-list');
    list.innerHTML = "";
    players.forEach(p => {
        list.innerHTML += `<li style="color:${p.color}">${p.icon} Hráč ${p.id+1}</li>`;
    });
    // Host může spustit
    if(myId === 0) document.getElementById('start-game-btn').innerText = `SPUSTIT HRU (${players.length})`;
}

// --- 2. SÍŤOVÁ KOMUNIKACE ---

function broadcast(msg) {
    conns.forEach(c => c.send(msg));
}

function handleData(d) {
    // KLIENT PŘÍJEM
    if(myId !== 0) {
        if(d.type === 'WELCOME') { myId = d.id; players = d.players; updateLobby(); }
        if(d.type === 'UPDATE_LOBBY') { players = d.players; updateLobby(); }
        if(d.type === 'START') { initBoard(); startGame(); }
        if(d.type === 'STATE') { 
            gameState = d.state; 
            players = d.players; 
            render(); 
        }
    }
    // HOST PŘÍJEM (Akce od klientů)
    else {
        if(d.type === 'ROLL') hostRoll();
        if(d.type === 'MOVE') hostMove(d.pid, d.idx);
        if(d.type === 'TELEPORT') hostTeleport(d.pid, d.idx);
    }
}

// --- 3. HERNÍ LOGIKA (HOST) ---

function startGame() {
    document.getElementById('lobby-overlay').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    // Generovat horní lištu
    let bar = document.getElementById('players-bar');
    bar.innerHTML = "";
    players.forEach(p => {
        bar.innerHTML += `
            <div class="p-badge ${p.class}" id="badge-${p.id}">
                <span>${p.icon}</span>
                <span style="font-size:0.8rem">${p.id === myId ? '(Já)' : ''}</span>
            </div>`;
    });

    if(myId === 0) {
        resetTurn(0);
    }
    render();
}

function resetTurn(pid) {
    // Má hráč figurky ve hře?
    let inGame = players[pid].tokens.some(t => t !== -1 && t < 100);
    
    gameState.turn = pid;
    gameState.step = 'ROLL';
    gameState.rollsLeft = inGame ? 1 : 3;
    gameState.teleporting = false;
    gameState.msg = `Na tahu: Hráč ${pid+1}`;
    
    sendState();
}

// HOD KOSTKOU
function hostRoll() {
    if(gameState.rollsLeft <= 0) return; // Ochrana proti spamu

    // Logika hodu
    let r = Math.random() < 0.15 ? 7 : Math.floor(Math.random()*6)+1;
    gameState.roll = r;
    gameState.rollsLeft--;

    let pid = gameState.turn;

    if(r === 7) {
        gameState.magic[pid]++;
        gameState.msg = "Padla 7! (+1 Magie)";
        if(gameState.magic[pid] >= 3) {
            gameState.teleporting = true;
            gameState.step = 'MOVE';
            gameState.msg = "TELEPORT AKTIVNÍ! Vyber figurku.";
        } else {
            // Pokud neaktivoval teleport, jen přišel o tah (pokud nemá víc pokusů)
            if(gameState.rollsLeft <= 0) setTimeout(nextPlayer, 1500);
        }
    } else {
        // Kontrola, zda může táhnout
        let moves = getMoves(pid, r);
        if(moves.length > 0) {
            gameState.step = 'MOVE';
            gameState.msg = `Hozeno ${r}. Hraj!`;
        } else {
            gameState.msg = `Hozeno ${r}. Žádný tah.`;
            if(gameState.rollsLeft <= 0) setTimeout(nextPlayer, 1500);
        }
    }
    sendState();
}

// POHYB
function hostMove(pid, tokenIdx) {
    if(pid !== gameState.turn) return;

    let p = players[pid];
    let pos = p.tokens[tokenIdx];
    let roll = gameState.roll;

    // Boost?
    let amount = roll;
    if(pos !== -1 && pos < 100 && SPECIAL_TILES.includes(pos % 40)) amount *= 2;

    // Výpočet nové pozice
    let newPos = -1;
    
    // Z domečku (nasazení)
    if(pos === -1) {
        if(roll === 6) newPos = 0; // Lokální start
    }
    // V cíli
    else if(pos >= 100) {
        if(pos + roll <= 103) newPos = pos + roll;
    }
    // Na mapě
    else {
        newPos = pos + amount;
        if(newPos >= 40) { // Do cíle
            let over = newPos - 40;
            if(over <= 3) newPos = 100 + over;
        }
    }

    if(newPos !== -1) {
        p.tokens[tokenIdx] = newPos;
        // Vyhazování
        if(newPos < 100) checkKick(pid, newPos);
        // Výhra?
        if(p.tokens.every(t => t >= 100)) {
            alert("KONEC HRY! Vítěz: Hráč " + (pid+1));
            location.reload();
        }
    }

    // 6 hází znovu
    if(roll === 6) {
        gameState.rollsLeft = 1;
        gameState.step = 'ROLL';
        gameState.msg = "Šestka! Házíš znovu.";
        sendState();
    } else {
        nextPlayer();
    }
}

function hostTeleport(pid, idx) {
    if(!gameState.teleporting) return;
    
    players[pid].tokens[idx] = 100; // Skok do cíle
    gameState.magic[pid] = 0;
    gameState.teleporting = false;
    
    // Kontrola výhry...
    nextPlayer();
}

function checkKick(attackerId, localPos) {
    // Musíme převést lokální pozici útočníka na globální index mapy
    let attackerStart = players[attackerId].startOffset;
    let globalPos = (localPos + attackerStart) % 40;

    players.forEach(p => {
        if(p.id !== attackerId) {
            p.tokens.forEach((t, i) => {
                if(t !== -1 && t < 100) {
                    let enemyGlobal = (t + p.startOffset) % 40;
                    if(enemyGlobal === globalPos) {
                        p.tokens[i] = -1; // Vyhozen!
                    }
                }
            });
        }
    });
}

function nextPlayer() {
    let next = (gameState.turn + 1) % players.length;
    resetTurn(next);
}

function sendState() {
    let data = { type: 'STATE', state: gameState, players: players };
    render(); // Host renderuje hned
    broadcast(data);
}

// --- 4. VYKRESLOVÁNÍ (UI) ---

function initBoard() {
    let b = document.getElementById('game-board');
    b.innerHTML = "";
    for(let y=0; y<11; y++) {
        for(let x=0; x<11; x++) {
            let div = document.createElement('div');
            div.className = 'cell';
            div.dataset.x = x; div.dataset.y = y;

            // Zjistit typ políčka
            let pathIdx = MAP_PATH.findIndex(p => p.x===x && p.y===y);
            if(pathIdx !== -1) {
                div.classList.add('path');
                if(SPECIAL_TILES.includes(pathIdx)) div.classList.add('special');
                // Starty (hardcoded barvy)
                if(pathIdx === 0) div.classList.add('start-0');
                if(pathIdx === 10) div.classList.add('start-1');
                if(pathIdx === 20) div.classList.add('start-2');
                if(pathIdx === 30) div.classList.add('start-3');
            } else {
                // Domečky
                let isHome = false;
                for(let i=0; i<4; i++) {
                    if(HOMES[i].some(h => h.x===x && h.y===y)) {
                        div.classList.add('home-'+i);
                        isHome = true;
                    }
                }
                if(!isHome) div.style.visibility = 'hidden';
                // Base zobrazíme jen pokud tam je figurka (řeší render())
            }
            b.appendChild(div);
        }
    }
}

function render() {
    // Update textů
    document.getElementById('game-status-text').innerText = gameState.msg;
    
    // Aktivní hráč
    document.querySelectorAll('.p-badge').forEach(b => b.classList.remove('active'));
    let badge = document.getElementById('badge-'+gameState.turn);
    if(badge) badge.classList.add('active');

    // Kostka
    let cube = document.getElementById('dice-cube');
    cube.className = 'cube'; // Reset
    if(gameState.roll === 7) cube.classList.add('show-7');
    else {
        let rot = {1:'', 2:'rotateY(180deg)', 3:'rotateY(-90deg)', 4:'rotateY(90deg)', 5:'rotateX(-90deg)', 6:'rotateX(90deg)'};
        cube.style.transform = rot[gameState.roll] || '';
    }

    // Tlačítko
    let btn = document.getElementById('roll-btn');
    let isMyTurn = (myId === gameState.turn);
    
    if(isMyTurn) {
        if(gameState.teleporting) {
            btn.style.display = 'none';
        } else if(gameState.step === 'ROLL') {
            btn.style.display = 'block';
            btn.disabled = false;
            btn.innerText = "HODIT KOSTKOU";
        } else {
            btn.style.display = 'block';
            btn.disabled = true;
            btn.innerText = "TÁHNI FIGURKOU";
        }
    } else {
        btn.style.display = 'block';
        btn.disabled = true;
        btn.innerText = "ČEKEJ NA SOUPEŘE";
    }

    // Magie
    if(myId !== null) {
        document.getElementById('magic-info').innerText = "Magie: " + (gameState.magic[myId]||0) + "/3";
        document.getElementById('magic-info').classList.remove('hidden');
    }

    // Figurky
    document.querySelectorAll('.token').forEach(t => t.remove());

    players.forEach((p, pid) => {
        p.tokens.forEach((pos, idx) => {
            let cell;
            // Base
            if(pos === -1) {
                let bp = BASES[pid][idx];
                cell = getCell(bp.x, bp.y);
                if(cell) cell.style.visibility = 'visible'; // Ukázat base políčko
            }
            // Domeček
            else if(pos >= 100) {
                let hp = HOMES[pid][pos-100];
                cell = getCell(hp.x, hp.y);
            }
            // Mapa
            else {
                let globalIdx = (pos + p.startOffset) % 40;
                let mp = MAP_PATH[globalIdx];
                cell = getCell(mp.x, mp.y);
            }

            if(cell) {
                let t = document.createElement('div');
                t.className = `token ${p.class}`;
                t.innerText = p.icon;
                
                // Klikání
                if(isMyTurn) {
                    let canMove = false;
                    
                    if(gameState.teleporting) {
                        canMove = (pos < 100); // Může teleportovat cokoliv co není v cíli
                        if(canMove) {
                            t.onclick = () => action('TELEPORT', idx);
                            t.classList.add('highlight');
                        }
                    } 
                    else if(gameState.step === 'MOVE') {
                        // Zjednodušená kontrola "moves" v klientovi
                        // (Přesná validace proběhne na Hostovi)
                        t.onclick = () => action('MOVE', idx);
                        // Highlight dáme všem, host tah zamítne pokud nejde
                        t.classList.add('highlight'); 
                    }
                }
                cell.appendChild(t);
            }
        });
    });
}

function action(type, idx) {
    if(myId === 0) {
        if(type === 'ROLL') hostRoll();
        if(type === 'MOVE') hostMove(0, idx);
        if(type === 'TELEPORT') hostTeleport(0, idx);
    } else {
        hostConn.send({ type: type, pid: myId, idx: idx });
    }
}

document.getElementById('roll-btn').onclick = () => action('ROLL');

// Helpery
function getCell(x, y) { return document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`); }

// Logika tahů (zjednodušená pro UI highlight, host má vlastní)
function getMoves(pid, roll) {
    // Vrací indexy figurek, kterými jde táhnout (pro Host validaci)
    let idxs = [];
    players[pid].tokens.forEach((pos, i) => {
        if(pos === -1 && roll === 6) idxs.push(i);
        else if(pos !== -1 && pos < 100) idxs.push(i); // Zjednodušeno
        else if(pos >= 100 && pos+roll <= 103) idxs.push(i);
    });
    return idxs;
}
