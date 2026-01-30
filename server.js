const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve config.js dynamically so SOCKET_URL is available without a build step (fixes 404/MIME on Render)
app.get('/js/config.js', (req, res) => {
  const url = process.env.SOCKET_URL || '';
  res.type('application/javascript');
  res.send('// Injected at runtime\nwindow.SOCKET_URL = ' + JSON.stringify(url) + ';\n');
});

app.use(express.static(path.join(__dirname, 'public')));

// Game state per room (game code)
const rooms = new Map();

// Generate 6-char game code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Build the Most Reliable Car — 10 categories, 5 choices each (reliability, cost, risk)
// Scoring: total reliability + risk modifier − budget overrun penalty ± 1-star bonuses
const BUDGET_LIMIT = 200;
const BONUS_NO_ONE_STAR = 5;
const MALUS_THREE_PLUS_ONE_STAR = 5;
const MALUS_OVER_BUDGET = 5;

const GAME_DATA = [
  {
    id: 'engine',
    name: 'Engine',
    options: [
      { label: 'Fragile turbo', reliability: 1, cost: 10, risk: -3 },
      { label: 'Powerful modern', reliability: 2, cost: 15, risk: -2 },
      { label: 'Standard atmospheric', reliability: 3, cost: 15, risk: -1 },
      { label: 'Renowned reliable', reliability: 4, cost: 22, risk: 0 },
      { label: 'Simple and robust', reliability: 5, cost: 28, risk: 1 }
    ]
  },
  {
    id: 'transmission',
    name: 'Transmission',
    options: [
      { label: 'Low-end CVT', reliability: 1, cost: 8, risk: -3 },
      { label: 'Old automatic', reliability: 2, cost: 12, risk: -2 },
      { label: 'Standard manual', reliability: 3, cost: 14, risk: -1 },
      { label: 'Modern automatic', reliability: 4, cost: 20, risk: 0 },
      { label: 'Robust manual', reliability: 5, cost: 24, risk: 1 }
    ]
  },
  {
    id: 'chassis',
    name: 'Chassis',
    options: [
      { label: 'Lightweight fragile', reliability: 1, cost: 8, risk: -3 },
      { label: 'Weak standard', reliability: 2, cost: 12, risk: -2 },
      { label: 'Standard', reliability: 3, cost: 14, risk: -1 },
      { label: 'Reinforced', reliability: 4, cost: 20, risk: 0 },
      { label: 'Ultra robust', reliability: 5, cost: 25, risk: 1 }
    ]
  },
  {
    id: 'electrical',
    name: 'Electrical System',
    options: [
      { label: 'Cheap complex', reliability: 1, cost: 8, risk: -3 },
      { label: 'Old', reliability: 2, cost: 11, risk: -2 },
      { label: 'Standard', reliability: 3, cost: 14, risk: -1 },
      { label: 'Modern reliable', reliability: 4, cost: 18, risk: 0 },
      { label: 'Simple protected', reliability: 5, cost: 22, risk: 1 }
    ]
  },
  {
    id: 'suspension',
    name: 'Suspension',
    options: [
      { label: 'Cheap', reliability: 1, cost: 6, risk: -3 },
      { label: 'Mid sport', reliability: 2, cost: 10, risk: -2 },
      { label: 'Standard', reliability: 3, cost: 13, risk: -1 },
      { label: 'Reinforced', reliability: 4, cost: 17, risk: 0 },
      { label: 'Durable high-end', reliability: 5, cost: 21, risk: 1 }
    ]
  },
  {
    id: 'brakes',
    name: 'Brakes',
    options: [
      { label: 'Low-end', reliability: 1, cost: 6, risk: -3 },
      { label: 'Weak standard', reliability: 2, cost: 10, risk: -2 },
      { label: 'Standard', reliability: 3, cost: 13, risk: -1 },
      { label: 'Performance', reliability: 4, cost: 17, risk: 0 },
      { label: 'Very durable', reliability: 5, cost: 21, risk: 1 }
    ]
  },
  {
    id: 'cooling',
    name: 'Cooling',
    options: [
      { label: 'Weak', reliability: 1, cost: 6, risk: -3 },
      { label: 'Cheap radiator', reliability: 2, cost: 9, risk: -2 },
      { label: 'Standard', reliability: 3, cost: 12, risk: -1 },
      { label: 'Reinforced', reliability: 4, cost: 16, risk: 0 },
      { label: 'Very efficient', reliability: 5, cost: 20, risk: 1 }
    ]
  },
  {
    id: 'fuel',
    name: 'Fuel Supply',
    options: [
      { label: 'Fragile pump', reliability: 1, cost: 6, risk: -3 },
      { label: 'Cheap injectors', reliability: 2, cost: 9, risk: -2 },
      { label: 'Standard', reliability: 3, cost: 12, risk: -1 },
      { label: 'Reliable', reliability: 4, cost: 16, risk: 0 },
      { label: 'Simple robust', reliability: 5, cost: 19, risk: 1 }
    ]
  },
  {
    id: 'steering',
    name: 'Steering',
    options: [
      { label: 'Worn', reliability: 1, cost: 6, risk: -3 },
      { label: 'Imprecise', reliability: 2, cost: 9, risk: -2 },
      { label: 'Standard', reliability: 3, cost: 12, risk: -1 },
      { label: 'Reliable power steering', reliability: 4, cost: 15, risk: 0 },
      { label: 'Robust precise', reliability: 5, cost: 18, risk: 1 }
    ]
  },
  {
    id: 'body',
    name: 'Body / Protection',
    options: [
      { label: 'Rusty', reliability: 1, cost: 5, risk: -3 },
      { label: 'Weak protection', reliability: 2, cost: 8, risk: -2 },
      { label: 'Standard', reliability: 3, cost: 11, risk: -1 },
      { label: 'Reinforced protection', reliability: 4, cost: 14, risk: 0 },
      { label: 'Very resistant', reliability: 5, cost: 17, risk: 1 }
    ]
  }
];

function getRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, {
      teams: new Map(),
      hostId: null,
      state: 'lobby',
      currentCategoryIndex: 0,
      answers: new Map(),
      teamChoices: new Map(), // teamId -> array of 10 option indices
      startedAt: null
    });
  }
  return rooms.get(code);
}

io.on('connection', (socket) => {
  socket.on('create-game', () => {
    const code = generateCode();
    const room = getRoom(code);
    room.hostId = socket.id;
    socket.gameCode = code;
    socket.join(code);
    socket.emit('game-created', { code, categories: GAME_DATA.map(c => ({ id: c.id, name: c.name, options: c.options.map(o => ({ label: o.label })) })), budgetLimit: BUDGET_LIMIT });
  });

  socket.on('join-game', ({ code, teamName }) => {
    code = (code || '').toUpperCase().trim();
    if (!code || code.length !== 6) {
      socket.emit('join-error', 'Please enter a valid 6-character game code.');
      return;
    }
    const room = getRoom(code);
    if (room.state !== 'lobby') {
      socket.emit('join-error', 'This game has already started.');
      return;
    }
    const name = (teamName || 'Team').trim() || 'Team';
    if (Array.from(room.teams.values()).some(t => t.name.toLowerCase() === name.toLowerCase())) {
      socket.emit('join-error', 'A team with this name already exists.');
      return;
    }
    room.teams.set(socket.id, { name });
    socket.join(code);
    socket.gameCode = code;
    socket.teamName = name;
    socket.emit('joined', { code, teamName: name });
    io.to(code).emit('lobby-update', {
      teams: Array.from(room.teams.entries()).map(([id, t]) => ({ id, name: t.name })),
      isHost: room.hostId === socket.id
    });
  });

  socket.on('start-game', (code) => {
    const room = getRoom(code);
    if (room.hostId !== socket.id || room.state !== 'lobby') return;
    room.state = 'playing';
    room.currentCategoryIndex = 0;
    room.answers = new Map();
    room.teamChoices = new Map();
    room.startedAt = Date.now();
    const category = GAME_DATA[0];
    io.to(code).emit('category', {
      index: 0,
      name: category.name,
      options: category.options.map(o => ({ label: o.label }))
    });
  });

  socket.on('answer', ({ code, optionIndex }) => {
    const room = getRoom(code);
    if (room.state !== 'playing' || socket.gameCode !== code) return;
    if (socket.id === room.hostId) return;
    const team = room.teams.get(socket.id);
    if (!team) return;
    const key = `${room.currentCategoryIndex}-${socket.id}`;
    if (room.answers.has(key)) return;
    const category = GAME_DATA[room.currentCategoryIndex];
    const option = category.options[optionIndex];
    if (!option) return;
    room.answers.set(key, { teamId: socket.id, optionIndex });
    if (!room.teamChoices.has(socket.id)) room.teamChoices.set(socket.id, new Array(GAME_DATA.length).fill(null));
    room.teamChoices.get(socket.id)[room.currentCategoryIndex] = optionIndex;
    socket.emit('answer-recorded');
    const totalInRoom = room.teams.size;
    const answered = new Set([...room.answers.keys()].map(k => k.split('-')[1]));
    if (answered.size >= totalInRoom) {
      nextCategoryOrLeaderboard(io, code, room);
    }
  });

  socket.on('next-category', (code) => {
    const room = getRoom(code);
    if (room.hostId !== socket.id || room.state !== 'playing') return;
    nextCategoryOrLeaderboard(io, code, room);
  });

  socket.on('leave-lobby', () => {
    const code = socket.gameCode;
    if (!code) return;
    const room = getRoom(code);
    const wasHost = room.hostId === socket.id;
    socket.leave(code);
    socket.gameCode = null;
    socket.teamName = null;
    if (wasHost) {
      room.hostId = null;
      room.teams.clear();
      rooms.delete(code);
      io.to(code).emit('host-left');
    } else {
      room.teams.delete(socket.id);
      io.to(code).emit('lobby-update', {
        teams: Array.from(room.teams.entries()).map(([id, t]) => ({ id, name: t.name })),
        isHost: false
      });
    }
  });

  socket.on('disconnect', () => {
    const code = socket.gameCode;
    if (code) {
      const room = getRoom(code);
      room.teams.delete(socket.id);
      if (room.state === 'lobby') {
        io.to(code).emit('lobby-update', {
          teams: Array.from(room.teams.entries()).map(([id, t]) => ({ id, name: t.name })),
          isHost: room.hostId === socket.id
        });
      }
    }
  });
});

function computeFinalScore(teamId, room) {
  const choices = room.teamChoices.get(teamId);
  if (!choices || choices.length !== GAME_DATA.length) return 0;
  let totalReliability = 0;
  let totalCost = 0;
  let totalRisk = 0;
  let countOneStar = 0;
  for (let i = 0; i < GAME_DATA.length; i++) {
    const optIdx = choices[i];
    if (optIdx == null) return 0;
    const opt = GAME_DATA[i].options[optIdx];
    if (!opt) return 0;
    totalReliability += opt.reliability;
    totalCost += opt.cost;
    totalRisk += opt.risk;
    if (opt.reliability === 1) countOneStar += 1;
  }
  let points = totalReliability + totalRisk;
  if (totalCost > BUDGET_LIMIT) points -= MALUS_OVER_BUDGET;
  if (countOneStar === 0) points += BONUS_NO_ONE_STAR;
  if (countOneStar >= 3) points -= MALUS_THREE_PLUS_ONE_STAR;
  return points;
}

function nextCategoryOrLeaderboard(io, code, room) {
  room.currentCategoryIndex += 1;
  if (room.currentCategoryIndex >= GAME_DATA.length) {
    room.state = 'finished';
    const leaderboard = Array.from(room.teams.entries())
      .map(([id, t]) => ({ id, name: t.name, points: computeFinalScore(id, room) }))
      .sort((a, b) => b.points - a.points);
    io.to(code).emit('leaderboard', { leaderboard });
    return;
  }
  room.answers = new Map();
  const category = GAME_DATA[room.currentCategoryIndex];
  io.to(code).emit('category', {
    index: room.currentCategoryIndex,
    name: category.name,
    options: category.options.map(o => ({ label: o.label }))
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Build the Most Reliable Car — http://localhost:${PORT}`));
