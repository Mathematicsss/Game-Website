(function () {
  const socket = io(window.SOCKET_URL || "", { transports: ["websocket", "polling"] });

  function setHomeError(msg) {
    homeError.textContent = msg || '';
    homeError.hidden = !msg;
  }

  const CONNECTION_ERROR_MSG = "Cannot connect to the game server. " +
    "This site only hosts the frontend — the game needs a Node.js backend. " +
    "Deploy the backend (e.g. on Render.com), then in Netlify set environment variable SOCKET_URL to your backend URL (e.g. https://your-app.onrender.com). " +
    "See the README for step-by-step instructions.";

  socket.on("connect_error", function () {
    setHomeError(CONNECTION_ERROR_MSG);
  });

  socket.on("disconnect", function (reason) {
    if (reason === "io server disconnect" || reason === "io client disconnect") return;
    setHomeError(CONNECTION_ERROR_MSG);
  });

  const views = {
    home: document.getElementById('view-home'),
    lobbyHost: document.getElementById('view-lobby-host'),
    lobbyPlayer: document.getElementById('view-lobby-player'),
    game: document.getElementById('view-game'),
    leaderboard: document.getElementById('view-leaderboard')
  };

  const homeError = document.getElementById('home-error');
  const inputCode = document.getElementById('input-code');
  const inputTeam = document.getElementById('input-team');
  const btnHost = document.getElementById('btn-host');
  const btnJoin = document.getElementById('btn-join');
  const btnStart = document.getElementById('btn-start');
  const btnPlayAgain = document.getElementById('btn-play-again');
  const btnBackHost = document.getElementById('btn-back-host');
  const btnBackPlayer = document.getElementById('btn-back-player');

  const lobbyCode = document.getElementById('lobby-code');
  const lobbyTeams = document.getElementById('lobby-teams');
  const playerCode = document.getElementById('player-code');
  const playerTeamName = document.getElementById('player-team-name');
  const lobbyTeamsPlayer = document.getElementById('lobby-teams-player');

  const categoryTitle = document.getElementById('category-title');
  const categoryDesc = document.getElementById('category-desc');
  const gameOptions = document.getElementById('game-options');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const answerFeedback = document.getElementById('answer-feedback');

  const leaderboardList = document.getElementById('leaderboard-list');

  let gameCode = null;
  let isHost = false;
  let currentCategoryIndex = 0;
  const totalCategories = 5;

  function showView(viewId) {
    Object.values(views).forEach(v => { v.classList.remove('active'); });
    const id = viewId.startsWith('view-') ? viewId : 'view-' + viewId;
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  // --- Home ---
  btnHost.addEventListener('click', () => {
    setHomeError('');
    if (!socket.connected) {
      setHomeError(CONNECTION_ERROR_MSG);
      return;
    }
    socket.emit('create-game');
  });

  btnJoin.addEventListener('click', () => {
    setHomeError('');
    if (!socket.connected) {
      setHomeError(CONNECTION_ERROR_MSG);
      return;
    }
    const code = inputCode.value.trim().toUpperCase();
    const teamName = inputTeam.value.trim() || 'Team';
    socket.emit('join-game', { code, teamName });
  });

  socket.on('join-error', (msg) => {
    setHomeError(msg);
  });

  socket.on('game-created', (data) => {
    gameCode = data.code;
    isHost = true;
    lobbyCode.textContent = gameCode;
    lobbyTeams.innerHTML = '';
    btnStart.disabled = true;
    showView('lobby-host');
  });

  socket.on('joined', (data) => {
    gameCode = data.code;
    isHost = false;
    playerCode.textContent = data.code;
    playerTeamName.textContent = data.teamName;
    lobbyTeamsPlayer.innerHTML = '';
    showView('lobby-player');
  });

  socket.on('lobby-update', (data) => {
    const list = data.isHost !== false ? lobbyTeams : lobbyTeamsPlayer;
    list.innerHTML = '';
    (data.teams || []).forEach(t => {
      const li = document.createElement('li');
      li.textContent = t.name;
      list.appendChild(li);
    });
    if (isHost) btnStart.disabled = !data.teams || data.teams.length === 0;
  });

  btnStart.addEventListener('click', () => {
    if (!gameCode || !isHost) return;
    socket.emit('start-game', gameCode);
  });

  function leaveLobbyAndGoHome() {
    if (gameCode) socket.emit('leave-lobby');
    gameCode = null;
    isHost = false;
    inputCode.value = '';
    inputTeam.value = '';
    setHomeError('');
    showView('home');
  }

  if (btnBackHost) btnBackHost.addEventListener('click', leaveLobbyAndGoHome);
  if (btnBackPlayer) btnBackPlayer.addEventListener('click', leaveLobbyAndGoHome);

  socket.on('host-left', () => {
    gameCode = null;
    isHost = false;
    setHomeError('The host left the game.');
    showView('home');
  });

  socket.on('category', (data) => {
    currentCategoryIndex = data.index;
    if (categoryTitle) categoryTitle.textContent = data.name;
    if (categoryDesc) categoryDesc.textContent = isHost ? 'Waiting for teams to vote.' : 'Choose one option for your car.';
    if (answerFeedback) {
      answerFeedback.hidden = true;
      answerFeedback.classList.remove('recorded');
    }

    const pct = ((data.index + 1) / totalCategories) * 100;
    if (progressFill) progressFill.style.width = pct + '%';
    if (progressText) progressText.textContent = (data.index + 1) + ' / ' + totalCategories;

    if (gameOptions) {
      gameOptions.innerHTML = '';
      const letters = 'ABCDEFGHIJ';
      (data.options || []).forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-btn' + (isHost ? ' option-btn-readonly' : '');
        btn.dataset.index = i;
        btn.innerHTML = '<span class="option-letter">' + (letters[i] || (i + 1)) + '</span><span>' + escapeHtml(opt.label) + '</span>';
        if (!isHost) {
          btn.addEventListener('click', () => submitAnswer(btn, i));
        } else {
          btn.disabled = true;
        }
        gameOptions.appendChild(btn);
      });
    }
    showView('game');
  });

  function submitAnswer(btn, optionIndex) {
    if (btn.disabled) return;
    socket.emit('answer', { code: gameCode, optionIndex });
    btn.disabled = true;
    btn.classList.add('selected');
    Array.from(gameOptions.querySelectorAll('.option-btn')).forEach(b => { b.disabled = true; });
    answerFeedback.textContent = 'Answer recorded!';
    answerFeedback.classList.add('recorded');
    answerFeedback.hidden = false;
  }

  socket.on('answer-recorded', () => {});

  socket.on('leaderboard', (data) => {
    leaderboardList.innerHTML = '';
    (data.leaderboard || []).forEach((entry, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="rank">' + (i + 1) + '</span><span class="team-name">' + escapeHtml(entry.name) + '</span><span class="points">' + entry.points + ' pts</span>';
      leaderboardList.appendChild(li);
    });
    showView('leaderboard');
  });

  btnPlayAgain.addEventListener('click', () => {
    gameCode = null;
    isHost = false;
    inputCode.value = '';
    inputTeam.value = '';
    setHomeError('');
    showView('home');
  });

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
})();
