const RUN_OPTIONS = [1, 2, 3, 4, 6]; // The design had 1-6 but wait, run pad in design has 1, 2, 3, 4, 5, 6. User requested removing 5.

const state = {
  user: null,
  playerId: "",
  roomCode: "",
  room: null,
  events: null,
  lastTossFlip: null
};

let totalBallsProcessed = -1;
let cachedRevealBall = null;
let revealLockTimer = null;

const el = {
  loginView: document.getElementById("loginView"),
  profileSetupView: document.getElementById("profileSetupView"),
  appShell: document.getElementById("appShell"),
  dashboardView: document.getElementById("dashboardView"),
  lobbyView: document.getElementById("lobbyView"),
  matchView: document.getElementById("matchView"),
  resultView: document.getElementById("resultView"),
  
  navTabs: document.querySelectorAll(".nav-menu li"),
  navMatchTab: document.getElementById("navMatchTab"),
  navResultTab: document.getElementById("navResultTab"),
  
  // Auth & Profile
  profileSetupForm: document.getElementById("profileSetupForm"),
  profileNameInput: document.getElementById("profileNameInput"),
  profileSetupError: document.getElementById("profileSetupError"),
  logoutButton: document.getElementById("logoutButton"),
  guestPlayBtn: document.getElementById("guestPlayBtn"),
  
  // Sidebar
  sidebarUserName: document.getElementById("sidebarUserName"),
  
  // Dashboard Stats
  statMatches: document.getElementById("statMatches"),
  statWinRate: document.getElementById("statWinRate"),
  statRuns: document.getElementById("statRuns"),
  statWickets: document.getElementById("statWickets"),
  statHighestScore: document.getElementById("statHighestScore"),
  statAverage: document.getElementById("statAverage"),
  statStrikeRate: document.getElementById("statStrikeRate"),
  statEconomy: document.getElementById("statEconomy"),
  
  // Lobby Controls
  btnCreatePublic: document.getElementById("btnCreatePublic"),
  btnCreatePrivate: document.getElementById("btnCreatePrivate"),
  joinCodeForm: document.getElementById("joinCodeForm"),
  roomCodeInput: document.getElementById("roomCodeInput"),
  joinError: document.getElementById("joinError"),
  noticeText: document.getElementById("noticeText"),
  publicRoomsList: document.getElementById("publicRoomsList"),
  
  // Active Lobby
  roomControls: document.getElementById("roomControls"),
  activeRoomContainer: document.getElementById("activeRoomContainer"),
  lobbyRoomCode: document.getElementById("lobbyRoomCode"),
  teamASlots: document.getElementById("teamASlots"),
  teamBSlots: document.getElementById("teamBSlots"),
  startMatchBtn: document.getElementById("startMatchBtn"),
  lobbyStatusMsg: document.getElementById("lobbyStatusMsg"),

  // Toss
  tossOverlay: document.getElementById("tossOverlay"),
  tossCoinAnim: document.getElementById("tossCoinAnim"),
  tossStatusText: document.getElementById("tossStatusText"),
  tossCallActions: document.getElementById("tossCallActions"),
  tossChoiceActions: document.getElementById("tossChoiceActions"),
  
  // Match View
  teamAScoreBox: document.getElementById("teamAScoreBox"),
  teamBScoreBox: document.getElementById("teamBScoreBox"),
  teamALive: document.getElementById("teamALive"),
  teamBLive: document.getElementById("teamBLive"),
  scoreA: document.getElementById("scoreA"),
  scoreB: document.getElementById("scoreB"),
  oversA: document.getElementById("oversA"),
  oversB: document.getElementById("oversB"),
  crrA: document.getElementById("crrA"),
  crrB: document.getElementById("crrB"),
  targetA: document.getElementById("targetA"),
  targetB: document.getElementById("targetB"),
  
  bowlerName: document.getElementById("bowlerName"),
  bowlerChoice: document.getElementById("bowlerChoice"),
  batterName: document.getElementById("batterName"),
  batterChoice: document.getElementById("batterChoice"),
  playerRoleBadge: document.getElementById("playerRoleBadge"),
  runPad: document.getElementById("runPad"),
  matchLog: document.getElementById("matchLog"),
  
  // Result View
  winnerText: document.getElementById("winnerText"),
  victoryMargin: document.getElementById("victoryMargin"),
  scorecardTable: document.getElementById("scorecardTable"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  exitLobbyBtn: document.getElementById("exitLobbyBtn"),
};

/* --- INITIALIZATION --- */

async function checkAuth() {
  const response = await fetch("/api/me");
  if (response.ok) {
    const data = await response.json();
    state.user = data.user;
    if (!state.user.profile_name) {
      switchMainView(el.profileSetupView);
    } else {
      state.playerId = state.user.id;
      initDashboard();
    }
  } else {
    switchMainView(el.loginView);
    renderGoogleSignIn();
  }
}

function switchMainView(view) {
  el.loginView.classList.add("hidden");
  el.profileSetupView.classList.add("hidden");
  el.appShell.classList.add("hidden");
  view.classList.remove("hidden");
}

function switchTab(tabId) {
  el.dashboardView.classList.add("hidden");
  el.lobbyView.classList.add("hidden");
  el.matchView.classList.add("hidden");
  el.resultView.classList.add("hidden");
  
  document.getElementById(tabId).classList.remove("hidden");
  
  el.navTabs.forEach(tab => {
    tab.classList.toggle("active", tab.dataset.target === tabId);
  });
}

el.navTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    switchTab(tab.dataset.target);
  });
});

/* --- AUTHENTICATION --- */

function renderGoogleSignIn() {
  google.accounts.id.initialize({
    client_id: "657579248075-n52mu3kmfe4fpja5ejmu3n9rg7q5o8pr.apps.googleusercontent.com",
    callback: async (response) => {
      const res = await postJson("/api/auth/google", { credential: response.credential });
      if (res.ok) {
        state.user = res.user;
        if (!state.user.profile_name) switchMainView(el.profileSetupView);
        else { state.playerId = state.user.id; initDashboard(); }
      }
    }
  });
  google.accounts.id.renderButton(document.getElementById("googleSignInContainer"), { theme: "filled_black", size: "large", type: "standard", shape: "rectangular" });
}

el.guestPlayBtn.addEventListener("click", () => {
  alert("Guest play is disabled for stat tracking. Please login with Google.");
});

el.profileSetupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  el.profileSetupError.textContent = "";
  const res = await postJson("/api/profile", { profileName: el.profileNameInput.value });
  if (res.ok) {
    state.user = res.user;
    state.playerId = state.user.id;
    initDashboard();
  } else {
    el.profileSetupError.textContent = res.error || "Failed to save profile.";
  }
});

el.logoutButton.addEventListener("click", async () => {
  await postJson("/api/auth/logout", {});
  window.location.reload();
});

function initDashboard() {
  switchMainView(el.appShell);
  switchTab("dashboardView");
  
  const s = state.user;
  el.sidebarUserName.textContent = s.profile_name;
  
  el.statMatches.textContent = s.matches_played;
  el.statWinRate.textContent = s.matches_played > 0 ? Math.round((0 /* Need win tracking, spoof for now */ / s.matches_played) * 100) + "%" : "0%";
  el.statRuns.textContent = s.runs_scored;
  el.statWickets.textContent = s.wickets_taken;
  el.statHighestScore.textContent = s.highest_score;
  el.statAverage.textContent = s.matches_played > 0 ? (s.runs_scored / Math.max(1, s.matches_played)).toFixed(1) : "0.0";
  el.statStrikeRate.textContent = s.balls_faced > 0 ? ((s.runs_scored / s.balls_faced) * 100).toFixed(1) : "0.0";
  el.statEconomy.textContent = s.balls_bowled > 0 ? ((s.runs_conceded / (s.balls_bowled / 6))).toFixed(1) : "0.0";

  loadPublicRooms();
  openLobbyEvents();
  
  // Build Run Pad
  el.runPad.innerHTML = RUN_OPTIONS.map((run) => `
    <button class="bg-surface text-primary brutalist-border brutalist-shadow-white p-2 md:p-4 flex items-center justify-center brutalist-button relative group hover:bg-surface-variant key-btn" data-run="${run}">
      <span class="font-display-lg text-display-lg group-hover:text-primary-fixed transition-colors pointer-events-none">${run}</span>
      <span class="absolute top-2 left-2 font-label-md text-label-md text-on-surface-variant pointer-events-none">${run === 4 ? 'FOU' : run === 6 ? 'SIX' : run === 1 ? 'ONE' : run === 2 ? 'TWO' : run === 3 ? 'THR' : 'RUN'}</span>
    </button>`).join("");
  
  document.querySelectorAll(".key-btn").forEach(btn => {
    btn.addEventListener("click", () => handlePlayCall(parseInt(btn.dataset.run, 10)));
  });
}

/* --- LOBBY LOGIC --- */

el.btnCreatePublic.addEventListener("click", () => createRoom("public"));
el.btnCreatePrivate.addEventListener("click", () => createRoom("private"));

el.joinCodeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await joinRoom(el.roomCodeInput.value);
});

async function createRoom(visibility) {
  el.joinError.textContent = "";
  const response = await postJson("/api/rooms", { visibility });
  if (response.ok) enterRoom(await response.json());
  else el.joinError.textContent = response.error || "Could not create room";
}

async function joinRoom(roomCode) {
  el.joinError.textContent = "";
  const response = await postJson("/api/join", { roomCode });
  if (response.ok) enterRoom(await response.json());
  else el.joinError.textContent = response.error || "Room full or not found";
}

function enterRoom(response) {
  state.playerId = response.playerId;
  state.roomCode = response.roomCode;
  state.room = response.room;
  
  el.roomControls.classList.add("hidden");
  el.activeRoomContainer.classList.remove("hidden");
  el.lobbyRoomCode.textContent = state.roomCode;
  
  switchTab("lobbyView");
  openEvents();
  renderLobby();
}

/* --- API HELPERS --- */
async function postJson(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (res.ok) {
    const json = await res.json().catch(() => ({}));
    return { ok: true, json: () => Promise.resolve(json), ...json };
  }
  if (res.status === 404) {
    alert("This match room was lost (the server likely restarted to apply an update). Returning to the homepage.");
    window.location.reload();
    return { ok: false, error: "Room not found" };
  }
  const err = await res.json().catch(() => ({}));
  return { ok: false, error: err.error || "Request failed" };
}

/* --- SSE --- */
function openLobbyEvents() {
  const src = new EventSource("/events?roomCode=__lobby__");
  src.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (Array.isArray(data)) {
      el.publicRoomsList.innerHTML = data.map(r => 
        `<div style="display:flex; justify-content:space-between; background: var(--bg-darker); padding: 10px; border: 2px solid var(--border-color);">
          <span style="font-family: var(--font-heading); font-style: italic; font-size: 1.5rem;">${r.hostName}'s Room</span>
          <button class="brutalist-btn" onclick="joinRoom('${r.code}')">JOIN</button>
        </div>`
      ).join("") || "<span style='color: var(--text-muted)'>No public rooms right now.</span>";
    }
  };
}

function openEvents() {
  if (state.events) state.events.close();
  totalBallsProcessed = -1;
  state.events = new EventSource(`/events?roomCode=${state.roomCode}&playerId=${state.playerId}`);
  state.events.onmessage = (event) => {
    const room = JSON.parse(event.data);
    state.room = room;
    
    if (room.status === "waiting") {
      renderLobby();
    } else if (room.status === "toss") {
      renderLobby();
      renderToss();
    } else if (room.status === "playing") {
      renderMatch();
    } else if (room.status === "finished") {
      renderResult();
    }
  };
}

/* --- RENDERERS --- */
function renderLobby() {
  el.tossOverlay.classList.add("hidden");
  const { players } = state.room;
  
  const teamA = players.filter(p => p.team === "A");
  const teamB = players.filter(p => p.team === "B");
  
  el.teamASlots.innerHTML = renderSlots(teamA);
  el.teamBSlots.innerHTML = renderSlots(teamB);
  
  if (players.length < 4) {
    el.lobbyStatusMsg.textContent = `WAITING FOR PLAYERS (${players.length}/4)...`;
  } else {
    el.lobbyStatusMsg.textContent = "MATCH STARTING...";
  }
}

function renderSlots(teamPlayers) {
  let html = "";
  for (let i = 0; i < 2; i++) {
    const p = teamPlayers[i];
    if (p) {
      html += `<div class="player-slot">
                 <div class="status-badge">CONNECTED</div>
                 <div class="avatar"></div>
                 <div class="name">${p.name}</div>
               </div>`;
    } else {
      html += `<div class="player-slot empty">WAITING FOR PLAYER...</div>`;
    }
  }
  return html;
}

/* --- TOSS LOGIC --- */
function renderToss() {
  const { toss } = state.room;
  el.tossOverlay.classList.remove("hidden");
  
  const isCalling = toss.status === "call";
  const isDecision = toss.status === "decision";
  
  // Find who acts
  const myPlayer = state.room.players.find(p => p.id === state.playerId);
  const myTeam = myPlayer ? myPlayer.team : null;
  const callingCaptain = state.room.players.find(p => p.team === toss.callingTeam);
  const isCaptain = callingCaptain ? state.playerId === callingCaptain.id : false;
  const isWinningTeam = toss.winnerTeam === myTeam;
  const isWinningCaptain = toss.winnerTeam ? state.room.players.find(p => p.team === toss.winnerTeam)?.id === state.playerId : false;
  
  el.tossCallActions.classList.add("hidden");
  el.tossChoiceActions.classList.add("hidden");
  
  if (isCalling) {
    el.tossCoinAnim.style.animation = "none";
    if (isCaptain) {
      el.tossStatusText.textContent = "YOUR CALL. HEADS OR TAILS?";
      el.tossCallActions.classList.remove("hidden");
    } else {
      el.tossStatusText.textContent = "WAITING FOR CAPTAIN TO CALL TOSS...";
    }
  } else if (isDecision) {
    if (state.lastTossFlip !== toss.result) {
      state.lastTossFlip = toss.result;
      el.tossStatusText.textContent = "FLIPPING COIN...";
      
      el.tossCoinAnim.style.animation = "none";
      void el.tossCoinAnim.offsetWidth; // trigger reflow
      
      el.tossCoinAnim.style.animation = toss.result === "Tails" 
        ? "flipCoinTails 3s cubic-bezier(0.1, 0.8, 0.4, 1) forwards"
        : "flipCoinHeads 3s cubic-bezier(0.1, 0.8, 0.4, 1) forwards";
      
      state.isFlipping = true;
      setTimeout(() => {
        state.isFlipping = false;
        el.tossStatusText.textContent = `${toss.result.toUpperCase()}! ${isWinningTeam ? 'YOUR TEAM' : 'THEIR TEAM'} WON THE TOSS.`;
        if (isWinningCaptain) {
          el.tossChoiceActions.classList.remove("hidden");
        }
      }, 3000); // 3 seconds animation
    } else if (!state.isFlipping) {
      el.tossStatusText.textContent = `${toss.result.toUpperCase()}! ${isWinningTeam ? 'YOUR TEAM' : 'THEIR TEAM'} WON THE TOSS.`;
      if (isWinningCaptain) {
        el.tossChoiceActions.classList.remove("hidden");
      } else {
        el.tossStatusText.innerHTML += "<br>WAITING FOR DECISION...";
      }
    }
  }
}

el.tossCallActions.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") {
    postJson(`/api/toss`, { roomCode: state.roomCode, playerId: state.playerId, action: "call", call: e.target.dataset.call });
  }
});

el.tossChoiceActions.addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") {
    postJson(`/api/toss`, { roomCode: state.roomCode, playerId: state.playerId, action: "decision", decision: e.target.dataset.choice });
  }
});

/* --- MATCH LOGIC --- */
function renderMatch() {
  el.tossOverlay.classList.add("hidden");
  el.navMatchTab.classList.remove("hidden");
  switchTab("matchView");
  
  const r = state.room;
  const battingTeam = getBattingTeam(r);
  
  // Update Scores
  const sA = r.score["A"];
  const sB = r.score["B"];
  
  el.scoreA.innerHTML = `${sA.runs} <span class="text-on-surface-variant text-4xl">/ ${sA.wickets}</span>`;
  el.scoreB.innerHTML = `${sB.runs} <span class="text-on-surface-variant text-2xl">/ ${sB.wickets}</span>`;
  el.oversA.textContent = `OVERS: ${Math.floor(sA.balls / 6)}.${sA.balls % 6} / 4`;
  el.oversB.textContent = `OVERS: ${Math.floor(sB.balls / 6)}.${sB.balls % 6} / 4`;
  el.crrA.textContent = `CRR: ${sA.balls ? ((sA.runs / sA.balls) * 6).toFixed(1) : "0.0"}`;
  el.crrB.textContent = `CRR: ${sB.balls ? ((sB.runs / sB.balls) * 6).toFixed(1) : "0.0"}`;
  
  el.teamAScoreBox.classList.toggle("inactive", battingTeam !== "A");
  el.teamBScoreBox.classList.toggle("inactive", battingTeam !== "B");
  el.teamALive.classList.toggle("hidden", battingTeam !== "A");
  el.teamBLive.classList.toggle("hidden", battingTeam !== "B");
  
  if (r.innings === 1) {
    const target = r.score[r.battingFirstTeam].runs + 1;
    const chasing = battingTeam;
    const sChase = r.score[chasing];
    const remRuns = target - sChase.runs;
    const remBalls = 24 - sChase.balls;
    if (chasing === "A") { el.targetA.innerHTML = `TARGET: ${target}<br>NEED ${remRuns} FROM ${remBalls}`; el.targetA.classList.remove("hidden"); }
    if (chasing === "B") { el.targetB.innerHTML = `TARGET: ${target}<br>NEED ${remRuns} FROM ${remBalls}`; el.targetB.classList.remove("hidden"); }
  }

  // Active Players
  const batter = getActiveBatter(r, battingTeam);
  const bowler = getActiveBowler(r, battingTeam === "A" ? "B" : "A");

  let myRole = "SPECTATOR";
  let canPlay = false;
  if (batter?.id === state.playerId) { myRole = "BATTER"; canPlay = true; }
  else if (bowler?.id === state.playerId) { myRole = "BOWLER"; canPlay = true; }
  else {
    const myPlayer = r.players.find(p => p.id === state.playerId);
    if (myPlayer) myRole = myPlayer.team === battingTeam ? "NON-STRIKER" : "FIELDER";
  }

  el.playerRoleBadge.textContent = myRole;
  
  el.batterName.textContent = batter ? batter.name : "BATTER";
  el.bowlerName.textContent = bowler ? bowler.name : "BOWLER";

  let currentBalls = r.score.A.balls + r.score.B.balls;
  if (totalBallsProcessed === -1) {
    // Just joined, initialize without playing animation for old balls
    totalBallsProcessed = currentBalls;
  } else if (currentBalls > totalBallsProcessed && r.lastBall) {
    cachedRevealBall = r.lastBall;
    if (revealLockTimer) clearTimeout(revealLockTimer);
    revealLockTimer = setTimeout(() => {
      cachedRevealBall = null;
      renderMatch();
    }, 2000);
  }
  totalBallsProcessed = currentBalls;

  document.querySelectorAll(".key-btn").forEach(btn => {
    btn.disabled = !canPlay || cachedRevealBall !== null;
    if (canPlay && !cachedRevealBall) {
      // highlight choice if already made
      const myPendingChoice = r.pendingChoices && r.pendingChoices[myRole.toLowerCase()];
      const isSelected = myPendingChoice === parseInt(btn.dataset.run, 10);
      if (isSelected) {
        btn.className = "bg-safe-orange text-surface p-2 md:p-4 flex items-center justify-center relative transform scale-[1.02] key-btn selected";
        btn.querySelector("span:last-child").className = "absolute top-2 left-2 font-label-md text-label-md text-surface pointer-events-none";
      } else {
        btn.className = "bg-surface-container text-primary p-2 md:p-4 flex items-center justify-center relative group hover:bg-surface-variant key-btn border border-surface-variant";
        btn.querySelector("span:last-child").className = "absolute top-2 left-2 font-label-md text-label-md text-on-surface-variant pointer-events-none";
      }
    } else {
      btn.className = "bg-surface-container text-primary p-2 md:p-4 flex items-center justify-center relative group hover:bg-surface-variant key-btn border border-surface-variant opacity-50";
      btn.querySelector("span:last-child").className = "absolute top-2 left-2 font-label-md text-label-md text-on-surface-variant pointer-events-none";
    }
  });
  
  if (cachedRevealBall) {
    el.batterChoice.textContent = cachedRevealBall.batterChoice;
    el.bowlerChoice.textContent = cachedRevealBall.bowlerChoice;
    el.batterChoice.classList.remove("opacity-50");
    el.bowlerChoice.classList.remove("opacity-50");
  } else if (r.pendingChoices && r.pendingChoices.batter !== undefined && r.pendingChoices.bowler !== undefined) {
    // Should theoretically not happen unless server is slow, but just in case
    el.batterChoice.textContent = "✓";
    el.bowlerChoice.textContent = "✓";
    el.batterChoice.classList.remove("opacity-50");
    el.bowlerChoice.classList.remove("opacity-50");
  } else {
    const batterHasChosen = r.pendingChoices && r.pendingChoices.batter !== undefined;
    const bowlerHasChosen = r.pendingChoices && r.pendingChoices.bowler !== undefined;
    
    if (myRole === "BATTER") {
      el.batterChoice.textContent = batterHasChosen ? r.pendingChoices.batter : "?";
      el.bowlerChoice.textContent = bowlerHasChosen ? "READY" : "?";
      el.batterChoice.classList.toggle("opacity-50", !batterHasChosen);
      el.bowlerChoice.classList.toggle("opacity-50", !bowlerHasChosen);
    } else if (myRole === "BOWLER") {
      el.bowlerChoice.textContent = bowlerHasChosen ? r.pendingChoices.bowler : "?";
      el.batterChoice.textContent = batterHasChosen ? "READY" : "?";
      el.bowlerChoice.classList.toggle("opacity-50", !bowlerHasChosen);
      el.batterChoice.classList.toggle("opacity-50", !batterHasChosen);
    } else {
      el.batterChoice.textContent = "?";
      el.bowlerChoice.textContent = "?";
      el.batterChoice.classList.add("opacity-50");
      el.bowlerChoice.classList.add("opacity-50");
    }
  }
  
  // Render log
  el.matchLog.innerHTML = r.log.slice(0, 5).map(l => {
    const isWicket = l.includes("Wicket");
    const isSix = l.includes("6 run");
    const cls = isWicket ? "text-primary-fixed" : isSix ? "text-safe-orange" : "text-primary";
    const tag = isWicket ? "WICKET!" : isSix ? "SIX!" : "RUN!";
    return `<div class="flex justify-between items-center font-label-md text-label-md py-2 border-b border-surface-variant">
              <span class="${cls}">${tag}</span>
              <span class="text-on-surface-variant text-right ml-4">${l}</span>
            </div>`;
  }).join("");
}

function handlePlayCall(run) {
  // Optimistically disable buttons to prevent double-clicking and 403 errors
  document.querySelectorAll(".key-btn").forEach(btn => btn.disabled = true);
  postJson(`/api/choice`, { roomCode: state.roomCode, playerId: state.playerId, run });
}

/* --- RESULT LOGIC --- */
function renderResult() {
  el.navResultTab.classList.remove("hidden");
  switchTab("resultView");
  
  const r = state.room;
  el.winnerText.innerHTML = r.winner === "Tie" ? "MATCH<br>TIED" : `TEAM ${r.winner}<br>WINS`;
  
  const winTeamRuns = r.winner !== "Tie" ? r.score[r.winner].runs : 0;
  const loseTeamRuns = r.winner !== "Tie" ? r.score[r.winner === "A" ? "B" : "A"].runs : 0;
  el.victoryMargin.textContent = r.winner === "Tie" ? "TIE GAME" : `VICTORY BY ${winTeamRuns - loseTeamRuns} RUNS`;

  let tableHtml = `<tr class="header-row"><th>BATTER</th><th>R</th><th>B</th><th>SR</th></tr>`;
  
  ["A", "B"].forEach(team => {
    const isLoser = r.winner !== "Tie" && r.winner !== team;
    tableHtml += `<tr class="team-row ${isLoser ? 'loser' : ''}"><th colspan="3">TEAM ${team} ${r.winner===team?'(WINNERS)':''}</th><td>${r.score[team].runs}/${r.score[team].wickets}</td></tr>`;
    r.players.filter(p => p.team === team).forEach(p => {
      const stats = p.stats;
      const sr = stats.ballsFaced > 0 ? ((stats.runsScored / stats.ballsFaced)*100).toFixed(1) : "0.0";
      tableHtml += `<tr class="player-row"><td>${p.name}</td><td class="runs">${stats.runsScored}</td><td>${stats.ballsFaced}</td><td>${sr}</td></tr>`;
    });
  });
  
  el.scorecardTable.innerHTML = tableHtml;
}

el.playAgainBtn.addEventListener("click", () => {
  postJson(`/api/restart`, { roomCode: state.roomCode });
});

el.exitLobbyBtn.addEventListener("click", () => {
  window.location.reload();
});

/* --- UTILS --- */
function getBattingTeam(room) {
  const firstBattingTeam = room.battingFirstTeam || "A";
  if (room.innings === 0) return firstBattingTeam;
  return firstBattingTeam === "A" ? "B" : "A";
}

function getActiveBatter(room, team) {
  const teammates = room.players.filter((p) => p.team === team);
  const outIds = room.score[team].outPlayerIds;
  const notOuts = teammates.filter(p => !outIds.includes(p.id));
  const strikerIndex = room.score[team].strikerIndex;
  return notOuts.find((p) => teammates.indexOf(p) === strikerIndex) || notOuts[0];
}

function getActiveBowler(room, team) {
  const teammates = room.players.filter((p) => p.team === team);
  const battingTeam = team === "A" ? "B" : "A";
  const currentOver = Math.floor(room.score[battingTeam].balls / 6);
  return teammates[currentOver % Math.max(teammates.length, 1)];
}

function loadPublicRooms() {
  fetch("/api/rooms").then(r=>r.json()).then(data => {
    el.publicRoomsList.innerHTML = data.rooms.map(r => 
      `<div style="display:flex; justify-content:space-between; background: var(--bg-darker); padding: 10px; border: 2px solid var(--border-color);">
        <span style="font-family: var(--font-heading); font-style: italic; font-size: 1.5rem;">${r.hostName}'s Room</span>
        <button class="brutalist-btn" onclick="joinRoom('${r.code}')">JOIN</button>
      </div>`
    ).join("") || "<span style='color: var(--text-muted)'>No public rooms right now.</span>";
  });
}

window.addEventListener('load', checkAuth);
