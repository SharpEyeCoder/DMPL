const RUN_OPTIONS = [1, 2, 3, 4, 6];

const state = {
  user: null,
  playerId: "",
  roomCode: "",
  room: null,
  events: null,
  lastTossFlip: null
};

const elements = {
  loginView: document.querySelector("#loginView"),
  profileSetupView: document.querySelector("#profileSetupView"),
  dashboardView: document.querySelector("#dashboardView"),
  profileView: document.querySelector("#profileView"),
  profileSetupForm: document.querySelector("#profileSetupForm"),
  profileNameInput: document.querySelector("#profileNameInput"),
  profileSetupError: document.querySelector("#profileSetupError"),
  logoutButton: document.querySelector("#logoutButton"),
  viewProfileButton: document.querySelector("#viewProfileButton"),
  backToDashboardButton: document.querySelector("#backToDashboardButton"),
  dashboardUserName: document.querySelector("#dashboardUserName"),
  profileUserName: document.querySelector("#profileUserName"),
  statMatches: document.querySelector("#statMatches"),
  statRuns: document.querySelector("#statRuns"),
  statHighestScore: document.querySelector("#statHighestScore"),
  statAverage: document.querySelector("#statAverage"),
  statStrikeRate: document.querySelector("#statStrikeRate"),
  statWickets: document.querySelector("#statWickets"),
  statEconomy: document.querySelector("#statEconomy"),
  statBestBowling: document.querySelector("#statBestBowling"),
  
  joinCodeForm: document.querySelector("#joinCodeForm"),
  roomCode: document.querySelector("#roomCode"),
  joinError: document.querySelector("#joinError"),
  playError: document.querySelector("#playError"),
  matchView: document.querySelector("#matchView"),
  roomLabel: document.querySelector("#roomLabel"),
  scoreA: document.querySelector("#scoreA"),
  scoreB: document.querySelector("#scoreB"),
  oversA: document.querySelector("#oversA"),
  oversB: document.querySelector("#oversB"),
  teamA: document.querySelector("#teamA"),
  teamB: document.querySelector("#teamB"),
  matchStatus: document.querySelector("#matchStatus"),
  teamAPlayers: document.querySelector("#teamAPlayers"),
  teamBPlayers: document.querySelector("#teamBPlayers"),
  roleTitle: document.querySelector("#roleTitle"),
  roleHelp: document.querySelector("#roleHelp"),
  runPad: document.querySelector("#runPad"),
  tossPanel: document.querySelector("#tossPanel"),
  coin: document.querySelector("#coin"),
  coinFace: document.querySelector("#coinFace"),
  tossTitle: document.querySelector("#tossTitle"),
  tossHelp: document.querySelector("#tossHelp"),
  tossCallActions: document.querySelector("#tossCallActions"),
  tossDecisionActions: document.querySelector("#tossDecisionActions"),
  lastBall: document.querySelector("#lastBall"),
  lastBallText: document.querySelector("#lastBallText"),
  restartButton: document.querySelector("#restartButton"),
  matchLog: document.querySelector("#matchLog"),
  notice: document.querySelector("#notice"),
  publicRoomsList: document.querySelector("#publicRoomsList"),
  refreshRoomsButton: document.querySelector("#refreshRoomsButton"),
  shareLink: document.querySelector("#shareLink"),
  copyLinkButton: document.querySelector("#copyLinkButton")
};

elements.runPad.innerHTML = RUN_OPTIONS.map((run) => `<button type="button" data-run="${run}">${run}</button>`).join("");

async function checkAuth() {
  const response = await fetch("/api/me");
  if (response.ok) {
    const data = await response.json();
    state.user = data.user;
    if (!state.user.profile_name) {
      showView(elements.profileSetupView);
    } else {
      state.playerId = state.user.id;
      showDashboard();
    }
  } else {
    showView(elements.loginView);
    renderGoogleSignIn();
  }
}

function showView(viewElement) {
  elements.loginView.classList.add("hidden");
  elements.profileSetupView.classList.add("hidden");
  elements.dashboardView.classList.add("hidden");
  elements.profileView.classList.add("hidden");
  elements.matchView.classList.add("hidden");
  if (viewElement) viewElement.classList.remove("hidden");
}

function renderGoogleSignIn() {
  google.accounts.id.initialize({
    client_id: "657579248075-n52mu3kmfe4fpja5ejmu3n9rg7q5o8pr.apps.googleusercontent.com",
    callback: handleGoogleSignIn
  });
  google.accounts.id.renderButton(
    document.getElementById("googleSignInContainer"),
    { theme: "outline", size: "large" }
  );
}

async function handleGoogleSignIn(response) {
  const res = await postJson("/api/auth/google", { credential: response.credential });
  if (res.ok) {
    state.user = res.user;
    if (!state.user.profile_name) {
      showView(elements.profileSetupView);
    } else {
      state.playerId = state.user.id;
      showDashboard();
    }
  }
}

elements.profileSetupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.profileSetupError.textContent = "";
  const res = await postJson("/api/profile", { profileName: elements.profileNameInput.value });
  if (res.ok) {
    state.user = res.user;
    state.playerId = state.user.id;
    showDashboard();
  } else {
    elements.profileSetupError.textContent = res.error || "Failed to save profile.";
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await postJson("/api/auth/logout", {});
  state.user = null;
  state.playerId = "";
  if (state.events) state.events.close();
  showView(elements.loginView);
  renderGoogleSignIn();
});

elements.viewProfileButton.addEventListener("click", () => {
  showProfile();
});

elements.backToDashboardButton.addEventListener("click", () => {
  showDashboard();
});

function showDashboard() {
  showView(elements.dashboardView);
  const s = state.user;
  elements.dashboardUserName.textContent = s.profile_name;
  
  setupJoinLink();
  loadPublicRooms();
  openLobbyEvents();
}

function showProfile() {
  showView(elements.profileView);
  
  const s = state.user;
  elements.profileUserName.textContent = s.profile_name;
  
  // Populate stats
  elements.statMatches.textContent = s.matches_played;
  elements.statRuns.textContent = s.runs_scored;
  elements.statHighestScore.textContent = s.highest_score;
  elements.statAverage.textContent = s.matches_played > 0 ? (s.runs_scored / Math.max(1, s.matches_played)).toFixed(1) : "0.0";
  elements.statStrikeRate.textContent = s.balls_faced > 0 ? ((s.runs_scored / s.balls_faced) * 100).toFixed(1) : "0.0";
  
  elements.statWickets.textContent = s.wickets_taken;
  elements.statEconomy.textContent = s.balls_bowled > 0 ? ((s.runs_conceded / (s.balls_bowled / 6))).toFixed(1) : "0.0";
  elements.statBestBowling.textContent = `${s.best_bowling_wickets}/${s.best_bowling_runs}`;
}

window.addEventListener('load', checkAuth);

elements.joinCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await joinRoom(elements.roomCode.value);
});

document.addEventListener("click", async (event) => {
  const createButton = event.target.closest("button[data-create-room]");
  if (createButton) {
    await createRoom(createButton.dataset.createRoom);
    return;
  }

  const publicRoomButton = event.target.closest("button[data-join-room-code]");
  if (publicRoomButton) {
    await joinRoom(publicRoomButton.dataset.joinRoomCode);
  }
});

elements.refreshRoomsButton.addEventListener("click", loadPublicRooms);

elements.copyLinkButton.addEventListener("click", async () => {
  if (!state.room) return;

  const link = createAbsoluteJoinUrl(state.room.joinUrl);
  await navigator.clipboard?.writeText(link);
  elements.playError.textContent = "Room link copied.";
});

document.addEventListener("click", async (event) => {
  const callButton = event.target.closest("button[data-toss-call]");
  if (callButton) {
    await submitTossCall(callButton.dataset.tossCall);
    return;
  }

  const decisionButton = event.target.closest("button[data-toss-decision]");
  if (decisionButton) {
    await submitTossDecision(decisionButton.dataset.tossDecision);
  }
});

async function submitTossCall(call) {
  if (!state.room) return;
  elements.playError.textContent = "";
  elements.coin.classList.remove("coin-flip");
  window.requestAnimationFrame(() => elements.coin.classList.add("coin-flip"));

  const response = await postJson("/api/toss", {
    roomCode: state.roomCode,
    playerId: state.playerId,
    action: "call",
    call
  });

  if (!response.ok) {
    elements.playError.textContent = response.error || "Toss failed.";
  }
}

async function submitTossDecision(decision) {
  if (!state.room) return;
  elements.playError.textContent = "";

  const response = await postJson("/api/toss", {
    roomCode: state.roomCode,
    playerId: state.playerId,
    action: "decision",
    decision
  });

  if (!response.ok) {
    elements.playError.textContent = response.error || "Decision failed.";
  }
}

async function createRoom(visibility) {
  elements.joinError.textContent = "";
  elements.notice.textContent = "";

  const response = await postJson("/api/rooms", {
    visibility
  });

  if (!response.ok) {
    elements.joinError.textContent = response.error || "Could not create the room.";
    return;
  }

  enterRoom(response);
}

async function joinRoom(roomCode) {
  elements.joinError.textContent = "";
  elements.notice.textContent = "";

  const response = await postJson("/api/join", {
    roomCode
  });

  if (!response.ok) {
    elements.joinError.textContent = response.error || "Could not join the room.";
    return;
  }

  enterRoom(response);
}

function enterRoom(response) {
  state.playerId = response.playerId;
  state.roomCode = response.roomCode;
  state.room = response.room;
  showView(elements.matchView);
  elements.roomLabel.textContent = state.roomCode;
  openEvents();
  render();
}

elements.runPad.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-run]");
  if (!button) return;

  elements.playError.textContent = "";
  const response = await postJson("/api/choice", {
    roomCode: state.roomCode,
    playerId: state.playerId,
    run: Number(button.dataset.run)
  });

  if (!response.ok) {
    elements.playError.textContent = response.error || "Choice failed.";
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-kick-player-id]");
  if (!button) return;

  elements.playError.textContent = "";
  const response = await postJson("/api/kick", {
    roomCode: state.roomCode,
    hostPlayerId: state.playerId,
    targetPlayerId: button.dataset.kickPlayerId
  });

  if (!response.ok) {
    elements.playError.textContent = response.error || "Kick failed.";
  }
});

elements.restartButton.addEventListener("click", async () => {
  elements.playError.textContent = "";
  const response = await postJson("/api/restart", {
    roomCode: state.roomCode
  });

  if (!response.ok) {
    elements.playError.textContent = response.error || "Restart failed.";
  }
});

function openEvents() {
  state.events?.close();
  state.events = new EventSource(
    `/events?roomCode=${encodeURIComponent(state.roomCode)}&playerId=${encodeURIComponent(state.playerId)}`
  );
  state.events.onmessage = (event) => {
    state.room = JSON.parse(event.data);
    render();
  };
  state.events.addEventListener("kicked-player", (event) => {
    const payload = JSON.parse(event.data);
    leaveRoom(payload.message || "You were kicked from the room.");
  });
}

function render() {
  const room = state.room;
  if (!room) return;

  renderScore("A", room.score.A);
  renderScore("B", room.score.B);
  elements.teamA.classList.toggle("active", room.battingTeam === "A");
  elements.teamB.classList.toggle("active", room.battingTeam === "B");
  elements.matchStatus.textContent = getMatchStatus(room);
  renderPlayers("A", elements.teamAPlayers);
  renderPlayers("B", elements.teamBPlayers);
  renderToss(room);
  renderPlayPanel(room);
  renderLog(room);
  renderShareLink(room);
}

function renderScore(team, score) {
  elements[`score${team}`].textContent = `${score.runs}/${score.wickets}`;
  elements[`overs${team}`].textContent = `${Math.floor(score.balls / 6)}.${score.balls % 6} overs`;
}

function renderPlayers(team, container) {
  const isHost = state.room.hostId === state.playerId;
  container.innerHTML = state.room.players
    .filter((player) => player.team === team)
    .map(
      (player) => `
        <div class="player-row">
          <span>
            ${escapeHtml(player.name)}
            ${player.id === state.room.hostId ? '<b class="host-badge">Host</b>' : ""}
            ${player.id === state.room.captains?.[team] ? '<b class="captain-badge">Captain</b>' : ""}
          </span>
          <div class="player-actions">
            <small>${escapeHtml(getRoleLabel(player))}</small>
            ${
              isHost && player.id !== state.playerId
                ? `<button class="kick-button" type="button" data-kick-player-id="${escapeHtml(player.id)}">Kick</button>`
                : ""
            }
          </div>
        </div>
      `
    )
    .join("");
}

function renderPlayPanel(room) {
  const role = getRole(state.playerId);
  const hasChosen = role === "batter" ? room.pendingChoices.batter : room.pendingChoices.bowler;
  const canChoose = room.status === "playing" && (role === "batter" || role === "bowler") && !hasChosen;

  elements.roleTitle.textContent = roleLabel(role);
  elements.roleHelp.textContent = getRoleHelp(room, role, hasChosen);

  for (const button of elements.runPad.querySelectorAll("button")) {
    button.disabled = !canChoose;
  }

  if (room.lastBall) {
    elements.lastBall.classList.remove("hidden");
    elements.lastBallText.textContent = `Batter ${room.lastBall.batterChoice} / Bowler ${room.lastBall.bowlerChoice}`;
  } else {
    elements.lastBall.classList.add("hidden");
  }

  elements.restartButton.classList.toggle("hidden", room.status !== "finished");
}

function renderToss(room) {
  const showToss = room.status === "toss";
  const isCallingCaptain = room.toss?.status === "call" && room.captains?.[room.toss.callingTeam] === state.playerId;
  const isWinningCaptain =
    room.toss?.status === "decision" && room.captains?.[room.toss.winnerTeam] === state.playerId;
  elements.tossPanel.classList.toggle("hidden", !showToss);
  elements.tossCallActions.classList.toggle("hidden", !isCallingCaptain);
  elements.tossDecisionActions.classList.toggle("hidden", !isWinningCaptain);
  elements.runPad.classList.toggle("hidden", room.status === "toss");

  if (!showToss) return;

  if (room.toss?.status === "decision") {
    elements.coinFace.textContent = room.toss.result === "Heads" ? "H" : "T";
    elements.tossTitle.textContent = `${room.toss.result}: Team ${room.toss.winnerTeam} won the toss`;
    elements.tossHelp.textContent = isWinningCaptain
      ? "Choose whether your team will bat or bowl."
      : `Waiting for Team ${room.toss.winnerTeam} captain to choose bat or bowl.`;

    if (room.toss.flippedAt && room.toss.flippedAt !== state.lastTossFlip) {
      state.lastTossFlip = room.toss.flippedAt;
      elements.coin.classList.remove("coin-flip");
      window.requestAnimationFrame(() => elements.coin.classList.add("coin-flip"));
    }
    return;
  }

  elements.coinFace.textContent = "?";
  elements.tossTitle.textContent = isCallingCaptain
    ? "Call the toss"
    : `Waiting for Team ${room.toss?.callingTeam || "B"} captain`;
  elements.tossHelp.textContent = isCallingCaptain
    ? "Choose heads or tails. The coin flips right after your call."
    : `Team ${room.toss?.callingTeam || "B"} captain must call heads or tails.`;
}

function renderLog(room) {
  elements.matchLog.innerHTML = room.log.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
}

function getRole(playerId) {
  const room = state.room;
  if (room?.status === "toss") return "toss";
  if (!room || room.status !== "playing") return "waiting";
  if (room.activeBatterId === playerId) return "batter";
  if (room.activeBowlerId === playerId) return "bowler";
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (player && player.team === room.battingTeam && room.score[player.team].outPlayerIds.includes(playerId)) {
    return "out";
  }
  return "fielder";
}

function getRoleLabel(player) {
  const you = player.id === state.playerId ? "You" : "";
  const role = getRole(player.id);
  if (state.room.status !== "playing") return you || "Waiting";
  return you ? `You, ${roleLabel(role).toLowerCase()}` : roleLabel(role);
}

function roleLabel(role) {
  const labels = {
    batter: "Active batter",
    bowler: "Active bowler",
    fielder: "Teammate",
    out: "Out",
    toss: "Toss time",
    waiting: "Waiting"
  };

  return labels[role] || "Waiting";
}

function getRoleHelp(room, role, hasChosen) {
  if (room.status === "waiting") {
    const remaining = 4 - room.players.length;
    return `Need ${remaining} more player${remaining === 1 ? "" : "s"}.`;
  }
  if (room.status === "toss") {
    if (room.toss?.status === "call") {
      return room.captains?.[room.toss.callingTeam] === state.playerId
        ? "Call heads or tails."
        : `Waiting for Team ${room.toss.callingTeam} captain to call.`;
    }
    if (room.toss?.status === "decision") {
      return room.captains?.[room.toss.winnerTeam] === state.playerId
        ? "Choose bat or bowl."
        : `Waiting for Team ${room.toss.winnerTeam} captain to choose.`;
    }
  }
  if (room.status === "finished") {
    return room.winner === "Tie" ? "The match is tied." : `Team ${room.winner} won the match.`;
  }
  if (hasChosen) return "Choice locked. Waiting for the other side.";
  if (role === "out") return "You are out for this innings. Your teammate continues batting.";
  if (role === "batter") return "Pick the run you want to score.";
  if (role === "bowler") return "Guess the batter's number to take a wicket.";
  return "Watch this ball. Your turn can come after strike, wicket, or over changes.";
}

function getMatchStatus(room) {
  if (room.status === "waiting") return `Waiting for 4 players. ${room.players.length}/4 joined.`;
  if (room.status === "toss") {
    if (room.toss?.status === "decision") return `Team ${room.toss.winnerTeam} won the toss. Decision pending.`;
    return `All players joined. Team ${room.toss?.callingTeam || "B"} captain to call.`;
  }
  if (room.status === "finished") return room.winner === "Tie" ? "Match tied." : `Team ${room.winner} wins.`;

  const firstBattingTeam = room.battingFirstTeam || "A";
  const target = room.innings === 1 ? ` Target: ${room.score[firstBattingTeam].runs + 1}.` : "";
  return `Team ${room.battingTeam} batting.${target}`;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}

async function loadPublicRooms() {
  const response = await fetch("/api/rooms");
  const payload = await response.json();
  if (!payload.ok) return;

  renderPublicRooms(payload.rooms);
}

function openLobbyEvents() {
  const lobbyEvents = new EventSource("/events?roomCode=__lobby__");
  lobbyEvents.onmessage = (event) => {
    renderPublicRooms(JSON.parse(event.data));
  };
}

function renderPublicRooms(rooms) {
  if (!rooms.length) {
    elements.publicRoomsList.innerHTML = '<p class="empty-text">No public rooms yet.</p>';
    return;
  }

  elements.publicRoomsList.innerHTML = rooms
    .map(
      (room) => `
        <article class="room-row">
          <div>
            <strong>${escapeHtml(room.code)}</strong>
            <small>${escapeHtml(room.hostName)} · ${room.playerCount}/4 · ${escapeHtml(room.status)}</small>
          </div>
          <button type="button" data-join-room-code="${escapeHtml(room.code)}">Join</button>
        </article>
      `
    )
    .join("");
}

function renderShareLink(room) {
  const link = createAbsoluteJoinUrl(room.joinUrl);
  elements.shareLink.textContent = link;
}

function createAbsoluteJoinUrl(path) {
  return `${window.location.origin}${path}`;
}

function setupJoinLink() {
  const joinMatch = window.location.pathname.match(/^\/join\/([A-Z0-9]{6})$/i);
  if (!joinMatch) return;

  elements.roomCode.value = joinMatch[1].toUpperCase();
  elements.notice.textContent = `Joining room ${elements.roomCode.value}. Enter your name and press Join by code.`;
}

function leaveRoom(message) {
  state.events?.close();
  state.playerId = "";
  state.roomCode = "";
  state.room = null;
  state.events = null;
  state.lastTossFlip = null;

  elements.matchView.classList.add("hidden");
  elements.joinForm.classList.remove("hidden");
  elements.roomLabel.textContent = "No room";
  elements.joinError.textContent = message;
  elements.playError.textContent = "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}
