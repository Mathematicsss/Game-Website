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
  const gameRulesOverlay = document.getElementById('game-rules-overlay');
  const btnRulesGotIt = document.getElementById('btn-rules-got-it');

  const leaderboardList = document.getElementById('leaderboard-list');
  const podiumName1 = document.getElementById('podium-name-1');
  const podiumName2 = document.getElementById('podium-name-2');
  const podiumName3 = document.getElementById('podium-name-3');
  const podiumScore1 = document.getElementById('podium-score-1');
  const podiumScore2 = document.getElementById('podium-score-2');
  const podiumScore3 = document.getElementById('podium-score-3');
  const podiumAvatar1 = document.getElementById('podium-avatar-1');
  const podiumAvatar2 = document.getElementById('podium-avatar-2');
  const podiumAvatar3 = document.getElementById('podium-avatar-3');
  const podiumActions1 = document.getElementById('podium-actions-1');
  const podiumActions2 = document.getElementById('podium-actions-2');
  const podiumActions3 = document.getElementById('podium-actions-3');
  const carStatsModal = document.getElementById('car-stats-modal');
  const carStatsModalTitle = document.getElementById('car-stats-modal-title');
  const carStatsGrid = document.getElementById('car-stats-grid');
  const carStatsVerdict = document.getElementById('car-stats-verdict');
  const carStatsPartsList = document.getElementById('car-stats-parts-list');
  const btnCloseCarStats = document.getElementById('btn-close-car-stats');

  let lastLeaderboard = [];

  let gameCode = null;
  let isHost = false;
  let currentCategoryIndex = 0;
  const totalCategories = 10;

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
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    if (categoryTitle) categoryTitle.textContent = data.name;
    if (categoryDesc) categoryDesc.textContent = isHost ? 'Waiting for teams to vote.' : 'Choose one option. Budget and reliability matter for your final score.';
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
      requestAnimationFrame(() => {
        if (document.activeElement && gameOptions.contains(document.activeElement)) {
          document.activeElement.blur();
        }
      });
    }

    if (gameRulesOverlay) {
      if (data.index === 0) {
        gameRulesOverlay.hidden = false;
      } else {
        gameRulesOverlay.hidden = true;
      }
    }
    showView('game');
  });

  if (btnRulesGotIt) {
    btnRulesGotIt.addEventListener('click', () => {
      if (gameRulesOverlay) gameRulesOverlay.hidden = true;
    });
  }

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

  function getInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  function openCarStatsModal(entry) {
    if (!entry || !entry.build || !carStatsModal) return;
    const b = entry.build;
    if (carStatsModalTitle) carStatsModalTitle.textContent = entry.name + ' — Car build';
    if (carStatsGrid) {
      const breakdownClass = (b.breakdownLikelihood === 'Very high' || b.breakdownLikelihood === 'High') ? ' stat-high-risk' : (b.breakdownLikelihood === 'Low') ? ' stat-low-risk' : '';
      const crashClass = (b.crashLikelihood === 'High') ? ' stat-high-risk' : (b.crashLikelihood === 'Low') ? ' stat-low-risk' : '';
      carStatsGrid.innerHTML =
        '<span class="stat-label">Reliability (max 50)</span><span class="stat-value">' + b.totalReliability + '</span>' +
        '<span class="stat-label">Total cost</span><span class="stat-value">' + b.totalCost + (b.overBudget ? ' (over budget)' : '') + '</span>' +
        '<span class="stat-label">Risk score</span><span class="stat-value">' + b.totalRisk + '</span>' +
        '<span class="stat-label">Breakdown risk</span><span class="stat-value' + breakdownClass + '">' + b.breakdownLikelihood + '</span>' +
        '<span class="stat-label">Crash risk</span><span class="stat-value' + crashClass + '">' + b.crashLikelihood + '</span>';
    }
    if (carStatsVerdict) carStatsVerdict.textContent = b.verdict || '';
    if (carStatsPartsList) {
      carStatsPartsList.innerHTML = '';
      (b.parts || []).forEach(function (p) {
        const li = document.createElement('li');
        li.innerHTML = '<span class="part-name">' + escapeHtml(p.categoryName) + '</span><span class="part-choice">' + escapeHtml(p.optionLabel) + '</span>';
        carStatsPartsList.appendChild(li);
      });
    }
    carStatsModal.hidden = false;
  }

  function closeCarStatsModal() {
    if (carStatsModal) carStatsModal.hidden = true;
  }

  socket.on('leaderboard', (data) => {
    const list = data.leaderboard || [];
    lastLeaderboard = list;

    const first = list[0];
    const second = list[1];
    const third = list[2];

    if (podiumName1) podiumName1.textContent = first ? first.name : '—';
    if (podiumName2) podiumName2.textContent = second ? second.name : '—';
    if (podiumName3) podiumName3.textContent = third ? third.name : '—';
    if (podiumScore1) podiumScore1.textContent = first ? first.points + ' pts' : '';
    if (podiumScore2) podiumScore2.textContent = second ? second.points + ' pts' : '';
    if (podiumScore3) podiumScore3.textContent = third ? third.points + ' pts' : '';
    if (podiumAvatar1) podiumAvatar1.textContent = first ? getInitial(first.name) : '';
    if (podiumAvatar2) podiumAvatar2.textContent = second ? getInitial(second.name) : '';
    if (podiumAvatar3) podiumAvatar3.textContent = third ? getInitial(third.name) : '';

    if (podiumActions1) {
      podiumActions1.innerHTML = first && first.build ? '<button type="button" class="btn-review-build" data-index="0">Review build</button>' : '';
      const btn1 = podiumActions1.querySelector('.btn-review-build');
      if (btn1) btn1.addEventListener('click', () => openCarStatsModal(list[0]));
    }
    if (podiumActions2) {
      podiumActions2.innerHTML = second && second.build ? '<button type="button" class="btn-review-build" data-index="1">Review build</button>' : '';
      const btn2 = podiumActions2.querySelector('.btn-review-build');
      if (btn2) btn2.addEventListener('click', () => openCarStatsModal(list[1]));
    }
    if (podiumActions3) {
      podiumActions3.innerHTML = third && third.build ? '<button type="button" class="btn-review-build" data-index="2">Review build</button>' : '';
      const btn3 = podiumActions3.querySelector('.btn-review-build');
      if (btn3) btn3.addEventListener('click', () => openCarStatsModal(list[2]));
    }

    leaderboardList.innerHTML = '';
    list.slice(3).forEach((entry, i) => {
      const rank = i + 4;
      const globalIndex = i + 3;
      const li = document.createElement('li');
      li.innerHTML = '<span class="rank">' + rank + '</span><span class="team-name">' + escapeHtml(entry.name) + '</span><span class="points">' + entry.points + ' pts</span>' +
        (entry.build ? '<button type="button" class="btn-review-build" data-index="' + globalIndex + '">Review build</button>' : '');
      leaderboardList.appendChild(li);
      const reviewBtn = li.querySelector('.btn-review-build');
      if (reviewBtn) reviewBtn.addEventListener('click', () => openCarStatsModal(list[globalIndex]));
    });

    showView('leaderboard');
  });

  if (btnCloseCarStats) btnCloseCarStats.addEventListener('click', closeCarStatsModal);
  if (carStatsModal) {
    const backdrop = carStatsModal.querySelector('.car-stats-modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeCarStatsModal);
  }

  btnPlayAgain.addEventListener('click', () => {
    closeCarStatsModal();
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
