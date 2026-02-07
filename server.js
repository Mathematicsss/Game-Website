const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/js/config.js', (req, res) => {
  const url = process.env.SOCKET_URL || '';
  res.type('application/javascript');
  res.send('// Injected at runtime\nwindow.SOCKET_URL = ' + JSON.stringify(url) + ';\n');
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const BUDGET_LIMIT = 200;
const BONUS_NO_ONE_STAR = 5;
const MALUS_THREE_PLUS_ONE_STAR = 5;
const MALUS_OVER_BUDGET = 5;

const GAME_DATA = [
  {
    id: 'engine',
    name: 'Engine',
    options: [
      { label: 'Rubber band & prayer', reliability: 1, cost: 0, risk: -3 },
      { label: 'Lawn mower engine', reliability: 2, cost: 5, risk: -2 },
      { label: 'Salvaged weed-whacker', reliability: 3, cost: 10, risk: -1 },
      { label: 'Used car engine', reliability: 4, cost: 18, risk: 0 },
      { label: 'Refurbished engine', reliability: 5, cost: 25, risk: 1 }
    ]
  },
  {
    id: 'transmission',
    name: 'Transmission',
    options: [
      { label: 'Shopping cart axle', reliability: 1, cost: 0, risk: -3 },
      { label: 'Bicycle chain', reliability: 2, cost: 4, risk: -2 },
      { label: 'Go-kart gearbox', reliability: 3, cost: 10, risk: -1 },
      { label: 'Used manual', reliability: 4, cost: 16, risk: 0 },
      { label: 'Rebuilt transmission', reliability: 5, cost: 22, risk: 1 }
    ]
  },
  {
    id: 'chassis',
    name: 'Chassis',
    options: [
      { label: 'Styrofoam frame', reliability: 1, cost: 0, risk: -3 },
      { label: 'Cardboard reinforced', reliability: 2, cost: 4, risk: -2 },
      { label: 'Plywood chassis', reliability: 3, cost: 10, risk: -1 },
      { label: 'Salvaged frame', reliability: 4, cost: 16, risk: 0 },
      { label: 'Reinforced frame', reliability: 5, cost: 22, risk: 1 }
    ]
  },
  {
    id: 'electrical',
    name: 'Electrical System',
    options: [
      { label: 'Candle lights', reliability: 1, cost: 0, risk: -3 },
      { label: 'Flashlight taped on', reliability: 2, cost: 4, risk: -2 },
      { label: 'Dollar store wiring', reliability: 3, cost: 10, risk: -1 },
      { label: 'Used harness', reliability: 4, cost: 15, risk: 0 },
      { label: 'New wiring', reliability: 5, cost: 20, risk: 1 }
    ]
  },
  {
    id: 'suspension',
    name: 'Suspension',
    options: [
      { label: 'No springs (just hope)', reliability: 1, cost: 0, risk: -3 },
      { label: 'Pencil springs', reliability: 2, cost: 3, risk: -2 },
      { label: 'Office chair springs', reliability: 3, cost: 8, risk: -1 },
      { label: 'Salvaged struts', reliability: 4, cost: 14, risk: 0 },
      { label: 'New shocks', reliability: 5, cost: 19, risk: 1 }
    ]
  },
  {
    id: 'brakes',
    name: 'Brakes',
    options: [
      { label: 'Flip-flop on tire', reliability: 1, cost: 0, risk: -3 },
      { label: 'Shoe brake', reliability: 2, cost: 3, risk: -2 },
      { label: 'Bicycle brake', reliability: 3, cost: 8, risk: -1 },
      { label: 'Used brake pads', reliability: 4, cost: 14, risk: 0 },
      { label: 'New brakes', reliability: 5, cost: 19, risk: 1 }
    ]
  },
  {
    id: 'cooling',
    name: 'Cooling',
    options: [
      { label: 'Ice pack', reliability: 1, cost: 0, risk: -3 },
      { label: 'House fan', reliability: 2, cost: 3, risk: -2 },
      { label: 'PC fan', reliability: 3, cost: 8, risk: -1 },
      { label: 'Used radiator', reliability: 4, cost: 13, risk: 0 },
      { label: 'New radiator', reliability: 5, cost: 18, risk: 1 }
    ]
  },
  {
    id: 'fuel',
    name: 'Fuel Supply',
    options: [
      { label: 'Soda bottle tank', reliability: 1, cost: 0, risk: -3 },
      { label: 'Garden hose line', reliability: 2, cost: 3, risk: -2 },
      { label: 'Turkey baster', reliability: 3, cost: 8, risk: -1 },
      { label: 'Used fuel pump', reliability: 4, cost: 13, risk: 0 },
      { label: 'New fuel system', reliability: 5, cost: 17, risk: 1 }
    ]
  },
  {
    id: 'steering',
    name: 'Steering',
    options: [
      { label: 'Rope tied to axle', reliability: 1, cost: 0, risk: -3 },
      { label: 'Fishing rod', reliability: 2, cost: 3, risk: -2 },
      { label: 'Broom handle', reliability: 3, cost: 8, risk: -1 },
      { label: 'Used steering', reliability: 4, cost: 12, risk: 0 },
      { label: 'New steering', reliability: 5, cost: 16, risk: 1 }
    ]
  },
  {
    id: 'body',
    name: 'Body / Protection',
    options: [
      { label: 'Cardboard body', reliability: 1, cost: 0, risk: -3 },
      { label: 'Tarp wrap', reliability: 2, cost: 3, risk: -2 },
      { label: 'Duct tape & plastic', reliability: 3, cost: 8, risk: -1 },
      { label: 'Salvaged panels', reliability: 4, cost: 12, risk: 0 },
      { label: 'Rust-proof body', reliability: 5, cost: 15, risk: 1 }
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
      teamChoices: new Map(),
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
    socket.emit('game-created', { code, categories: GAME_DATA.map(c => ({ id: c.id, name: c.name, options: c.options.map(o => ({ label: o.label, cost: o.cost })) })), budgetLimit: BUDGET_LIMIT });
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
      options: category.options.map(o => ({ label: o.label, cost: o.cost }))
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

function getBreakdownLikelihood(totalReliability) {
  if (totalReliability <= 18) return 'Very high';
  if (totalReliability <= 28) return 'High';
  if (totalReliability <= 38) return 'Medium';
  return 'Low';
}

function getCrashLikelihood(totalRisk) {
  if (totalRisk < -12) return 'High';
  if (totalRisk <= -3) return 'Medium';
  return 'Low';
}

function getTeamBuildSummary(teamId, room) {
  const choices = room.teamChoices.get(teamId);
  if (!choices || choices.length !== GAME_DATA.length) {
    return { totalReliability: 0, totalCost: 0, totalRisk: 0, countOneStar: 0, parts: [], breakdownLikelihood: '—', crashLikelihood: '—', verdict: 'No build data.' };
  }
  let totalReliability = 0;
  let totalCost = 0;
  let totalRisk = 0;
  let countOneStar = 0;
  const parts = [];
  for (let i = 0; i < GAME_DATA.length; i++) {
    const optIdx = choices[i];
    if (optIdx == null) continue;
    const cat = GAME_DATA[i];
    const opt = cat.options[optIdx];
    if (!opt) continue;
    totalReliability += opt.reliability;
    totalCost += opt.cost;
    totalRisk += opt.risk;
    if (opt.reliability === 1) countOneStar += 1;
    parts.push({ categoryName: cat.name, optionLabel: opt.label, reliability: opt.reliability, cost: opt.cost, risk: opt.risk });
  }
  const breakdownLikelihood = getBreakdownLikelihood(totalReliability);
  const crashLikelihood = getCrashLikelihood(totalRisk);
  const overBudget = totalCost > BUDGET_LIMIT;
  let verdict = '';
  if (breakdownLikelihood === 'Low' && crashLikelihood === 'Low' && !overBudget) verdict = 'Your car is solid and safe!';
  else if (breakdownLikelihood === 'Very high' || crashLikelihood === 'High') verdict = 'High risk of breakdown or crash.';
  else if (overBudget) verdict = 'Over budget — reliable but expensive.';
  else verdict = 'Decent build. Could be safer or more reliable.';
  return { totalReliability, totalCost, totalRisk, countOneStar, parts, breakdownLikelihood, crashLikelihood, overBudget, verdict };
}

function nextCategoryOrLeaderboard(io, code, room) {
  room.currentCategoryIndex += 1;
  if (room.currentCategoryIndex >= GAME_DATA.length) {
    room.state = 'finished';
    const leaderboard = Array.from(room.teams.entries())
      .map(([id, t]) => ({
        id,
        name: t.name,
        points: computeFinalScore(id, room),
        build: getTeamBuildSummary(id, room)
      }))
      .sort((a, b) => b.points - a.points);
    io.to(code).emit('leaderboard', { leaderboard });
    return;
  }
  room.answers = new Map();
  const category = GAME_DATA[room.currentCategoryIndex];
  io.to(code).emit('category', {
    index: room.currentCategoryIndex,
    name: category.name,
    options: category.options.map(o => ({ label: o.label, cost: o.cost }))
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Build the Most Reliable Car — http://localhost:${PORT}`));
