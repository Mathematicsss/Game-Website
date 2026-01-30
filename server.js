require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
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

// Game categories and options (points hidden from client until end)
const GAME_DATA = [
  {
    id: 'body',
    name: 'Body Type',
    options: [
      { label: 'Family', points: 1 },
      { label: 'Sedan', points: 5 },
      { label: 'Coupe', points: 2 },
      { label: 'Pick-up', points: 3 },
      { label: 'Hatchback', points: 4 }
    ]
  },
  {
    id: 'chassis',
    name: 'Chassis',
    options: [
      { label: 'Aluminum', points: 4 },
      { label: 'Steel', points: 3 },
      { label: 'Cast Iron', points: 2 },
      { label: 'Plastic', points: 1 }
    ]
  },
  {
    id: 'engine',
    name: 'Engine',
    options: [
      { label: '4-cylinder 2.0L Turbo', points: 2 },
      { label: 'V6 4.5L', points: 3 },
      { label: '5-cylinder 2.5L Turbo', points: 1 },
      { label: '4-cylinder 1.9 TDI Diesel', points: 5 },
      { label: 'V8 5.7L Turbo Diesel', points: 4 }
    ]
  },
  {
    id: 'interior',
    name: 'Interior',
    options: [
      { label: 'Sporty', points: 2 },
      { label: 'Luxurious', points: 2 },
      { label: 'Comfortable', points: 2 },
      { label: 'Minimalist', points: 2 },
      { label: 'Futuristic', points: 2 }
    ]
  },
  {
    id: 'electrical',
    name: 'Electrical System',
    options: [
      { label: 'ABS Brakes', points: 5 },
      { label: 'Air Conditioning', points: 4 },
      { label: 'Power Windows', points: 2 },
      { label: 'Touchscreen', points: 3 },
      { label: 'Power Seats', points: 1 }
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
    socket.emit('game-created', { code, categories: GAME_DATA.map(c => ({ id: c.id, name: c.name, options: c.options.map(o => ({ label: o.label })) })) });
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
    room.teams.set(socket.id, { name, points: 0 });
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
    // Host does not vote; only teams (players who joined) can submit answers
    if (socket.id === room.hostId) return;
    const team = room.teams.get(socket.id);
    if (!team) return;
    const key = `${room.currentCategoryIndex}-${socket.id}`;
    if (room.answers.has(key)) return;
    const category = GAME_DATA[room.currentCategoryIndex];
    const option = category.options[optionIndex];
    if (!option) return;
    room.answers.set(key, { teamId: socket.id, points: option.points, label: option.label });
    team.points += option.points;
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

function getTeamChoices(room) {
  const byTeam = new Map();
  for (let catIndex = 0; catIndex < GAME_DATA.length; catIndex++) {
    for (const [key, val] of room.answers) {
      if (key.startsWith(catIndex + '-') && val.label) {
        const teamId = val.teamId;
        if (!byTeam.has(teamId)) byTeam.set(teamId, []);
        byTeam.get(teamId)[catIndex] = val.label;
      }
    }
  }
  return byTeam;
}

function nextCategoryOrLeaderboard(io, code, room) {
  room.currentCategoryIndex += 1;
  if (room.currentCategoryIndex >= GAME_DATA.length) {
    room.state = 'finished';
    const teamChoices = getTeamChoices(room);
    const leaderboard = Array.from(room.teams.entries())
      .map(([id, t]) => ({
        id,
        name: t.name,
        points: t.points,
        choices: teamChoices.get(id) || []
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
    options: category.options.map(o => ({ label: o.label }))
  });
}

// Dream car image generation via Gemini (API key in env; never expose to client)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const categoryLabels = ['Body type', 'Chassis', 'Engine', 'Interior', 'Electrical'];

app.post('/api/generate-car-image', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ error: 'Image generation not configured. Set GEMINI_API_KEY.' });
  }
  const { choices = [], teamName = 'Team' } = req.body;
  if (!Array.isArray(choices) || choices.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid choices array.' });
  }
  const parts = [];
  categoryLabels.forEach((label, i) => {
    if (choices[i]) parts.push(`${label}: ${choices[i]}`);
  });
  const spec = parts.join(', ');
  const prompt = `Generate a single photorealistic image of a car that matches these build choices: ${spec}. The car should look like a cohesive "dream car" that fits all these features. Style: clean product or showroom shot, professional lighting, 16:9 wide. No text or logos in the image.`;
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: prompt,
      config: {
        responseModalities: ['TEXT', 'IMAGE']
      }
    });
    const base64Image = response.data || (() => {
      const c = response.candidates && response.candidates[0];
      if (!c || !c.content || !c.content.parts) return null;
      for (const part of c.content.parts) {
        if (part.inlineData && part.inlineData.data) return part.inlineData.data;
      }
      return null;
    })();
    if (!base64Image) {
      return res.status(502).json({ error: 'No image data in response. The model may not support image generation in this region.' });
    }
    res.json({ image: 'data:image/png;base64,' + base64Image });
  } catch (err) {
    console.error('Gemini image error:', err.message);
    const msg = err.message || 'Image generation failed.';
    res.status(500).json({ error: msg });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Car Parts Quiz running at http://localhost:${PORT}`));
