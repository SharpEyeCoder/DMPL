const RUN_OPTIONS = [1, 2, 3, 4, 6];

const state = {
  playerId: "",
  roomCode: "",
  room: null,
  events: null,
  lastTossFlip: null
};

const elements = {
  joinForm: document.querySelector("#joinForm"),
  joinCodeForm: document.querySelector("#joinCodeForm"),
  playerName: document.querySelector("#playerName"),
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
  flipTossButton: document.querySelector("#flipTossButton"),
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

setupJoinLink();
loadPublicRooms();
openLobbyEvents();

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

elements.flipTossButton.addEventListener("click", async () => {
  if (!state.room) return;

  elements.playError.textContent = "";
  elements.coin.classList.remove("coin-flip");
  window.requestAnimationFrame(() => elements.coin.classList.add("coin-flip"));

  const response = await postJson("/api/toss", {
    roomCode: state.roomCode,
    hostPlayerId: state.playerId
  });

  if (!response.ok) {
    elements.playError.textContent = response.error || "Toss failed.";
  }
});

async function createRoom(visibility) {
  elements.joinError.textContent = "";
  elements.notice.textContent = "";

  const response = await postJson("/api/rooms", {
    playerName: elements.playerName.value,
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
    playerName: elements.playerName.value,
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
  elements.joinForm.classList.add("hidden");
  elements.matchView.classList.remove("hidden");
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
  const showToss = room.status === "toss" || room.toss?.status === "done";
  const isHost = room.hostId === state.playerId;
  elements.tossPanel.classList.toggle("hidden", !showToss);
  elements.flipTossButton.classList.toggle("hidden", !(room.status === "toss" && isHost));
  elements.runPad.classList.toggle("hidden", room.status === "toss");

  if (!showToss) return;

  if (room.toss?.status === "done") {
    elements.coinFace.textContent = room.toss.result === "Heads" ? "H" : "T";
    elements.tossTitle.textContent = `${room.toss.result}: Team ${room.toss.winnerTeam} won`;
    elements.tossHelp.textContent = `Team ${room.battingFirstTeam} bats first.`;

    if (room.toss.flippedAt && room.toss.flippedAt !== state.lastTossFlip) {
      state.lastTossFlip = room.toss.flippedAt;
      elements.coin.classList.remove("coin-flip");
      window.requestAnimationFrame(() => elements.coin.classList.add("coin-flip"));
    }
    return;
  }

  elements.coinFace.textContent = "?";
  elements.tossTitle.textContent = isHost ? "Flip for batting" : "Waiting for host";
  elements.tossHelp.textContent = isHost
    ? "Heads gives Team A first batting. Tails gives Team B first batting."
    : "The host will flip the coin to decide who bats first.";
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
    return room.hostId === state.playerId ? "Flip the coin to start the match." : "Waiting for the host to flip the coin.";
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
  if (room.status === "toss") return "All players joined. Toss pending.";
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
