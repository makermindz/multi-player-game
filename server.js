// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// Allow connections from any origin for Socket.IO (for iframe embedding)
// For better security, you can replace "*" with your website's domain,
// e.g., "https://my-nonprofit-website.org"
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- Game Data ---
const CHEMICAL_EQUATIONS = [
    { formula: ['N₂', 'H₂', 'NH₃'], target: [1, 3, 2], reactants: 2 },
    { formula: ['H₂', 'O₂', 'H₂O'], target: [2, 1, 2], reactants: 2 },
    { formula: ['SO₂', 'O₂', 'SO₃'], target: [2, 1, 2], reactants: 2 },
    { formula: ['K', 'H₂O', 'KOH', 'H₂'], target: [2, 2, 2, 1], reactants: 2 },
    { formula: ['C₃H₈', 'O₂', 'CO₂', 'H₂O'], target: [1, 5, 3, 4], reactants: 2 },
    { formula: ['Fe', 'H₂O', 'Fe₃O₄', 'H₂'], target: [3, 4, 1, 4], reactants: 2 },
    { formula: ['CH₄', 'O₂', 'CO₂', 'H₂O'], target: [1, 2, 1, 2], reactants: 2 },
    { formula: ['P₄', 'O₂', 'P₂O₅'], target: [1, 5, 2], reactants: 2 },
    { formula: ['Al', 'HCl', 'AlCl₃', 'H₂'], target: [2, 6, 2, 3], reactants: 2 },
    { formula: ['C₂H₆', 'O₂', 'CO₂', 'H₂O'], target: [2, 7, 4, 6], reactants: 2 },
    { formula: ['Fe₂O₃', 'CO', 'Fe', 'CO₂'], target: [1, 3, 2, 3], reactants: 2 },
];

const LOGIC_GATE_CHALLENGES = [
    { inputs: 2, slots: 1, available: ['AND', 'OR', 'NOT'], solution: { gates: ['AND'], truthTable: [{ inputs: [0, 0], output: 0 }, { inputs: [0, 1], output: 0 }, { inputs: [1, 0], output: 0 }, { inputs: [1, 1], output: 1 }] } },
    { inputs: 2, slots: 1, available: ['AND', 'OR', 'XOR'], solution: { gates: ['OR'], truthTable: [{ inputs: [0, 0], output: 0 }, { inputs: [0, 1], output: 1 }, { inputs: [1, 0], output: 1 }, { inputs: [1, 1], output: 1 }] } },
    { inputs: 1, slots: 1, available: ['AND', 'OR', 'NOT'], solution: { gates: ['NOT'], truthTable: [{ inputs: [0], output: 1 }, { inputs: [1], output: 0 }] } },
    { inputs: 2, slots: 1, available: ['OR', 'XOR', 'NAND'], solution: { gates: ['XOR'], truthTable: [{ inputs: [0, 0], output: 0 }, { inputs: [0, 1], output: 1 }, { inputs: [1, 0], output: 1 }, { inputs: [1, 1], output: 0 }] } },
    { inputs: 2, slots: 1, available: ['AND', 'NOR', 'NAND'], solution: { gates: ['NAND'], truthTable: [{ inputs: [0, 0], output: 1 }, { inputs: [0, 1], output: 1 }, { inputs: [1, 0], output: 1 }, { inputs: [1, 1], output: 0 }] } },
];

const VECTOR_CHALLENGES = [
    { target: [100, 50], available: [[50, 0], [50, 50], [0, -50]] },
    { target: [-50, 100], available: [[-50, 0], [0, 50], [50, 50]] },
    { target: [150, 150], available: [[50, 50], [100, 100], [50, 0]] },
    { target: [0, 150], available: [[50, 100], [-50, 50], [0, 100]] },
    // 16 new challenges
    { target: [100, 100], available: [[100, 0], [0, 100], [50, 50]] },
    { target: [-100, -50], available: [[-50, 0], [-50, -50], [0, 50]] },
    { target: [200, 0], available: [[100, 50], [100, -50], [50, 0]] },
    { target: [0, -100], available: [[50, -50], [-50, -50], [0, 100]] },
    { target: [250, 100], available: [[100, 0], [50, 50], [100, 50]] },
    { target: [-150, 150], available: [[-100, 100], [-50, 50], [0, 50]] },
    { target: [50, -150], available: [[50, -50], [0, -100], [50, 0]] },
    { target: [-200, 0], available: [[-100, -50], [-100, 50], [0, 50]] },
    { target: [100, 75], available: [[50, 25], [50, 50], [25, 25]] },
    { target: [-75, -75], available: [[-25, -50], [-50, -25], [-25, -25]] },
    { target: [125, 0], available: [[75, 50], [50, -50], [25, 0]] },
    { target: [0, 125], available: [[50, 75], [-50, 50], [0, 25]] },
    { target: [300, 50], available: [[150, 0], [150, 50], [0, 50]] },
    { target: [-50, -125], available: [[-50, -75], [0, -50], [-50, 0]] },
    { target: [150, -50], available: [[100, 0], [50, -50], [100, -50]] },
    { target: [-150, -150], available: [[-100, -100], [-50, -50], [-50, 0]] },
];

// --- Game State Management ---
let gameRooms = {}; // Stores the state of all active game rooms
let players = {};   // Stores player data, keyed by socket.id
let globalScores = {}; // Key: playerName, Value: score

// Serve static files (index.html, CSS, client-side JS)
app.use(express.static(__dirname)); // Serves files from the root (like index.html)

// Add headers to allow the site to be embedded in an iframe
app.use((req, res, next) => {
    // For better security, you can replace "*" with your website's domain,
    // e.g., "frame-ancestors 'self' https://my-nonprofit-website.org;"
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' *");
    next();
});

// Health check endpoint for Render's keep-alive service
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// A public endpoint to reset the global leaderboard, accessible by automated services.
app.get('/reset-leaderboard', (req, res) => {
    globalScores = {};
    broadcastLeaderboard(); // Notify all clients that the leaderboard has been cleared
    return res.status(200).send('Global leaderboard has been cleared.');
});

function broadcastLobbyInfo() {
    const lobbyInfo = Object.keys(gameRooms).map(roomId => {
        const room = gameRooms[roomId];
        return {
            roomId: roomId,
            gameType: room.gameType,
            playerCount: room.playerCount,
            isGameActive: room.isGameActive,
        };
    });
    io.emit('lobbyUpdate', lobbyInfo);
}

function broadcastLeaderboard() {
    // Create a sorted array from the scores object
    const sortedLeaderboard = Object.entries(globalScores)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => b.score - a.score) // Sort descending
        .slice(0, 10); // Get top 10

    // Broadcast to all clients
    io.emit('leaderboardUpdate', sortedLeaderboard);
}

function broadcastRoomState(roomId) {
    if (gameRooms[roomId]) {
        io.to(roomId).emit('gameUpdate', gameRooms[roomId]);
    }
}

function resetAllPlayersInRoom(room) {
    for (const id in room.players) {
        if (room.gameType === 'chemical') {
            room.players[id].coefficients = Array(room.chemical.equation.target.length || 0).fill(1);
        }
        // Scores are intentionally not reset here to persist across rounds.
    }
}

function resetProjectileGame(room) {
    // CRITICAL: Ensure the room still exists before proceeding
    if (!room || !gameRooms[room.roomId]) {
        console.warn(`Attempted to reset projectile game for non-existent room: ${room?.roomId}`);
        return;
    }

    room.gameType = 'projectile';

    // Generate a solvable target location by simulating a valid shot.
    // This ensures every target is possible to hit.
    const g = 9.8;
    const cannonX = 25; // Client-side cannon position offset

    // 1. Pick a random valid angle and velocity.
    const randomAngle = 20 + Math.random() * 50; // Angle between 20 and 70 degrees for interesting arcs
    const randomVelocity = 40 + Math.random() * 60; // Velocity between 40 and 100 m/s
    const angleRad = randomAngle * (Math.PI / 180);

    // 2. Calculate the coordinates of that shot at a random time.
    const timeToTarget = 2 + Math.random() * 6; // Fly time between 2 and 8 seconds
    const targetX = cannonX + (randomVelocity * Math.cos(angleRad) * timeToTarget);
    const targetY = (randomVelocity * Math.sin(angleRad) * timeToTarget) - (0.5 * g * timeToTarget * timeToTarget);

    room.projectile = {
        target: { x: targetX, y: Math.max(50, targetY) } // Ensure target is not below a minimum height
    };

    room.isGameActive = true;
    room.winner = null;
    room.specialMessage = null;
    broadcastRoomState(room.roomId);
}

function resetVectorVoyageGame(room) {
    // CRITICAL: Ensure the room still exists before proceeding
    if (!room || !gameRooms[room.roomId]) {
        console.warn(`Attempted to reset vector voyage game for non-existent room: ${room?.roomId}`);
        return;
    }

    room.gameType = 'vectorVoyage';
    const newChallenge = VECTOR_CHALLENGES[Math.floor(Math.random() * VECTOR_CHALLENGES.length)];
    room.vectorVoyage = {
        challenge: newChallenge,
    };

    room.isGameActive = true;
    room.winner = null;
    room.specialMessage = null;

    broadcastRoomState(room.roomId);
}

function resetLogicGateGame(room) {
    // CRITICAL: Ensure the room still exists before proceeding
    if (!room || !gameRooms[room.roomId]) {
        console.warn(`Attempted to reset logic gate game for non-existent room: ${room?.roomId}`);
        return;
    }

    room.gameType = 'logicGate';
    const newChallenge = LOGIC_GATE_CHALLENGES[Math.floor(Math.random() * LOGIC_GATE_CHALLENGES.length)];
    room.logicGate = {
        challenge: newChallenge,
    };

    room.isGameActive = true;
    room.winner = null;
    room.specialMessage = null;

    broadcastRoomState(room.roomId);
}

function resetChemicalGame(room) {
    // CRITICAL: Ensure the room still exists before proceeding
    if (!room || !gameRooms[room.roomId]) {
        console.warn(`Attempted to reset chemical game for non-existent room: ${room?.roomId}`);
        return;
    }

    room.gameType = 'chemical';

    // 1. Select a new random equation
    const newEquation = CHEMICAL_EQUATIONS[Math.floor(Math.random() * CHEMICAL_EQUATIONS.length)];
    room.chemical.equation.formula = newEquation.formula;
    room.chemical.equation.target = newEquation.target;

    // 2. Build the equation structure for the client
    const structure = [];
    // Use the 'reactants' property from the data, which is reliable.
    const reactants = newEquation.formula.slice(0, newEquation.reactants);
    const products = newEquation.formula.slice(newEquation.reactants);

    reactants.forEach((val, i) => {
        structure.push({ type: 'reactant', value: val });
        if (i < reactants.length - 1) structure.push({ type: 'operator', value: '+' });
    });
    structure.push({ type: 'operator', value: '→' });
    products.forEach((val, i) => {
        structure.push({ type: 'product', value: val });
        if (i < products.length - 1) structure.push({ type: 'operator', value: '+' });
    });
    room.chemical.equation.structure = structure;

    // 3. Reset game state
    room.isGameActive = true;
    room.winner = null;
    room.specialMessage = null;

    // 4. Reset player coefficients based on the new equation's length
    resetAllPlayersInRoom(room);

    // 5. Notify all clients of the new game state
    broadcastRoomState(room.roomId);
}

// Check if the current coefficients are correct
function checkWinCondition(coeffs, room) {
    const target = room.chemical.equation.target;
    if (coeffs.length !== target.length) {
        return false;
    }
    const isCorrect = coeffs.every((c, i) => Number(c) === target[i]);
    return isCorrect;
}

function checkProjectileHit(shot, room) {
    const { angle, velocity } = shot;
    const target = room.projectile.target;
    const g = 9.8;

    const angleRad = angle * (Math.PI / 180);
    const vx = velocity * Math.cos(angleRad);
    const vy = velocity * Math.sin(angleRad);

    // Time to reach target's x position
    const time = (target.x - 25) / vx; // Account for the 25px cannon offset on the client
    // Projectile's y position at that time
    const projectileY = (vy * time) - (0.5 * g * time * time);

    // Check if it's within a certain radius of the target
    return Math.abs(projectileY - target.y) < 20; // 20 pixel hit radius
}

function checkLogicGateWinCondition(playerGates, room) {
    const solutionGates = room.logicGate.challenge.solution.gates;
    if (playerGates.length !== solutionGates.length) return false;

    // For this simple version, we just check if the gate names match in order.
    // A more complex version would simulate the circuit.
    return playerGates.every((gate, index) => gate === solutionGates[index]);
}

function checkVectorVoyageWinCondition(playerVectors, room) {
    const target = room.vectorVoyage.challenge.target;
    const sum = playerVectors.reduce((acc, vec) => {
        acc[0] += vec[0];
        acc[1] += vec[1];
        return acc;
    }, [0, 0]);
    return sum[0] === target[0] && sum[1] === target[1];
}

function removePlayerFromRoom(playerId, socket) {
    const player = players[playerId];
    if (!player) return;

    const roomId = player.roomId;
    if (roomId && gameRooms[roomId]) {
        const room = gameRooms[roomId];
        if (socket) {
            socket.leave(roomId);
        }
        // Signal to the leaving client that they are out of the room BEFORE broadcasting to others.
        if (socket) {
            socket.emit('gameUpdate', { roomId: null });
        }

        delete room.players[playerId];
        room.playerCount--;

        if (room.playerCount === 0) {
            delete gameRooms[roomId];
        } else {
            // If a player leaves an active game, end the game for the remaining player.
            if (room.isGameActive && room.playerCount < 2) {
                room.isGameActive = false;
                room.winner = null; // No winner in this case
                room.specialMessage = 'Opponent left the game.';
            }
            broadcastRoomState(roomId);
        }
    }
    player.roomId = null;
}

// --- Socket.io Handlers ---
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // 1. Add new player
    const playerId = socket.id;
    players[playerId] = {
        id: playerId,
        name: `Player ${Object.keys(players).length + 1}`,
        roomId: null
    };
    
    // Send initial game state and player's name
    broadcastLobbyInfo(); // Send current rooms to the new player
    broadcastLeaderboard(); // Send leaderboard to the new player

    socket.on('requestInitialData', () => {
        socket.emit('playerInfo', players[playerId]);
    });
    // Handle coefficient changes
    socket.on('updateCoefficients', (newCoefficients) => {
        const roomId = players[playerId]?.roomId;
        const room = gameRooms[roomId];
        if (!room || !room.isGameActive || room.winner) return;

        room.players[playerId].coefficients = newCoefficients;
        
        // Broadcast the change immediately for other players to see
        broadcastRoomState(roomId);

        // Check for win condition
        if (checkWinCondition(newCoefficients, room)) {
            room.isGameActive = false; // Temporarily set to false to prevent further submissions for this round
            room.winner = room.players[playerId];
            room.scores[playerId] = (room.scores[playerId] || 0) + 1; // Increment score
            // Update global score
            const playerName = room.players[playerId].name;
            globalScores[playerName] = (globalScores[playerName] || 0) + 1;
            broadcastLeaderboard();
            io.to(roomId).emit('chemicalRoundEnd', { winner: room.winner, targetEquation: room.chemical.equation.target, structure: room.chemical.equation.structure });
            setTimeout(() => {
                resetChemicalGame(room); // Start next challenge automatically
            }, 5000); // 5 seconds delay
        } else {
            // It's an incorrect answer, send feedback to the player
            socket.emit('chemicalAnswerResult', { correct: false });
        }
    });

    socket.on('resetChemicalCoefficients', () => {
        const roomId = players[playerId]?.roomId;
        const room = gameRooms[roomId];
        if (!room || !room.isGameActive || room.winner) return;

        // Reset the player's coefficients to 1s
        const resetCoefficients = Array(room.chemical.equation.target.length || 0).fill(1);
        room.players[playerId].coefficients = resetCoefficients;
        // Broadcast the change so other players see the reset, but do not check for a win.
        broadcastRoomState(roomId);
    });

    // Handle vector voyage submission
    socket.on('submitVectorVoyage', (placedVectors) => {
        const roomId = players[playerId]?.roomId;
        const room = gameRooms[roomId];
        if (!room || !room.isGameActive || room.winner) return;

        // Update player's state for broadcasting
        room.players[playerId].vectorVoyageState = placedVectors;
        broadcastRoomState(roomId);

        if (checkVectorVoyageWinCondition(placedVectors, room)) {
            room.isGameActive = false;
            room.winner = room.players[playerId];
            room.scores[playerId] = (room.scores[playerId] || 0) + 1; // Increment score
            // Update global score
            const playerName = room.players[playerId].name;
            globalScores[playerName] = (globalScores[playerName] || 0) + 1;
            broadcastLeaderboard();
            io.to(roomId).emit('vectorVoyageRoundEnd', { winner: room.winner });
            setTimeout(() => {
                resetVectorVoyageGame(room);
            }, 5000);
        } else {
            socket.emit('vectorVoyageAnswerResult', { correct: false });
        }
    });

    // Handle logic gate submission
    socket.on('submitLogicGate', (placedGates) => {
        const roomId = players[playerId]?.roomId;
        const room = gameRooms[roomId];
        if (!room || !room.isGameActive || room.winner) return;

        // Update player's state for broadcasting
        room.players[playerId].logicGateState = placedGates;
        broadcastRoomState(roomId);

        if (checkLogicGateWinCondition(placedGates, room)) {
            room.isGameActive = false;
            room.winner = room.players[playerId];
            room.scores[playerId] = (room.scores[playerId] || 0) + 1; // Increment score
            // Update global score
            const playerName = room.players[playerId].name;
            globalScores[playerName] = (globalScores[playerName] || 0) + 1;
            broadcastLeaderboard();
            io.to(roomId).emit('logicGateRoundEnd', { winner: room.winner, correctGates: placedGates });
            setTimeout(() => {
                resetLogicGateGame(room);
            }, 5000);
        } else {
            socket.emit('logicGateAnswerResult', { correct: false });
        }
    });

    // Handle projectile firing
    socket.on('fireProjectile', (shot) => { // shot: { angle, velocity }
        const roomId = players[playerId]?.roomId;
        const room = gameRooms[roomId];
        if (!room || !room.isGameActive || room.winner) return;

        // Update player's state for broadcasting
        room.players[playerId].lastShot = shot;
        broadcastRoomState(roomId);

        if (checkProjectileHit(shot, room)) {
            room.isGameActive = false;
            room.winner = room.players[playerId];
            room.scores[playerId] = (room.scores[playerId] || 0) + 1; // Increment score
            // Update global score
            const playerName = room.players[playerId].name;
            globalScores[playerName] = (globalScores[playerName] || 0) + 1;
            broadcastLeaderboard();
            io.to(roomId).emit('projectileRoundEnd', { winner: room.winner, winningShot: shot });
            setTimeout(() => resetProjectileGame(room), 5000);
        } else {
            socket.emit('projectileMiss');
        }
    });

    // Handle player setting their name
    socket.on('setPlayerName', (name) => {
        // Sanitize or validate name if necessary
        const cleanName = name.trim();
        if (cleanName && players[playerId]) {
            const oldName = players[playerId].name;
            players[playerId].name = cleanName.slice(0, 15); // Enforce max length
            const newName = players[playerId].name;
            const roomId = players[playerId].roomId;
            if (roomId && gameRooms[roomId]) {
                gameRooms[roomId].players[playerId].name = newName;
                broadcastRoomState(roomId);
            }
            if (globalScores[oldName] && oldName !== newName) {
                globalScores[newName] = globalScores[oldName];
                delete globalScores[oldName]; // Remove the old entry
            }
        }
    });

    socket.on('joinRoom', ({ gameType, difficulty }) => {
        // Find an available room or create a new one
        let targetRoomId = null;

        // Look for a non-active room that matches the criteria
        for (const roomId in gameRooms) {
            const room = gameRooms[roomId];
            if (!room.isGameActive && room.gameType === gameType) {
                targetRoomId = roomId;
                break;
            }
        }

        if (!targetRoomId) {
            // No suitable room found, create a new one
            targetRoomId = `room_${Date.now()}`;
            gameRooms[targetRoomId] = {
                roomId: targetRoomId,
                gameType: gameType,
                players: {},
                playerCount: 0,
                isGameActive: false,
                winner: null,
                chemical: { equation: { formula: [], target: [], structure: [] } }, // Keep all game states
                projectile: { target: null },
                logicGate: { challenge: null },
                vectorVoyage: { challenge: null },
                scores: {}
            };
        }

        // Add player to the room
        socket.join(targetRoomId);
        players[playerId].roomId = targetRoomId;
        const room = gameRooms[targetRoomId];
        room.players[playerId] = {
            id: playerId,
            name: players[playerId].name,
            coefficients: [],
            lastShot: null,
            logicGateState: [],
            vectorVoyageState: []
        };
        room.scores[playerId] = 0; // Initialize score for the new player
        room.playerCount++;

        // If the room is not yet full, just update the state.
        if (room.playerCount < 2) {
            broadcastRoomState(targetRoomId);
            broadcastLobbyInfo();
            return;
        }

        // Start the game if the room is now full (e.g., 2 players)
        if (room.playerCount >= 2 && !room.isGameActive) {
            if (gameType === 'chemical') {
                resetChemicalGame(room);
            } else if (gameType === 'projectile') {
                resetProjectileGame(room);
            } else if (gameType === 'vectorVoyage') {
                resetVectorVoyageGame(room);
            } else if (gameType === 'logicGate') {
                resetLogicGateGame(room);
            }
        }

        broadcastLobbyInfo();
    });

    socket.on('leaveRoom', () => {
        removePlayerFromRoom(playerId, socket);
        broadcastLobbyInfo();
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        removePlayerFromRoom(playerId, null); // Pass null for socket as it's already disconnecting
        delete players[playerId];
        broadcastLobbyInfo();
    });

    socket.on('requestNewGame', () => {
        const roomId = players[playerId]?.roomId;
        const room = gameRooms[roomId];
        if (!room) return;

        // Reset the game within the same room
        if (room.gameType === 'chemical') {
            resetChemicalGame(room);
        } else if (room.gameType === 'projectile') {
            resetProjectileGame(room);
        } else if (gameType === 'vectorVoyage') {
            resetVectorVoyageGame(room);
        } else if (gameType === 'logicGate') {
            resetLogicGateGame(room);
        }
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});