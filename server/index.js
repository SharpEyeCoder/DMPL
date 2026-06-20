import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const PORT = process.env.PORT || 3000;
const VALID_RUNS = new Set([1, 2, 3, 4, 6]);
const BALLS_PER_OVER = 6;
const MAX_BALLS = BALLS_PER_OVER * 4;
const WICKETS_PER_TEAM = 2;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "..", "public");

const rooms = new Map();
const streams = new Map();

const httpServer = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, game: "DMPL" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/events") {
    openEventStream(request, response, url.searchParams.get("roomCode"));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/room") {
    const room = rooms.get(normalizeRoomCode(url.searchParams.get("roomCode")));
    if (!room) {
      sendJson(response, 404, { ok: false, error: "Room not found." });
      return;
    }

    sendJson(response, 200, { ok: true, room: serializeRoom(room) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/rooms") {
    sendJson(response, 200, { ok: true, rooms: getPublicRooms(request) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    await handleCreateRoom(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/join") {
    await handleJoin(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/choice") {
    await handleChoice(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/restart") {
    await handleRestart(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/toss") {
    await handleToss(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/kick") {
    await handleKick(request, response);
    return;
  }

  if (request.method === "GET") {
    await serveStatic(url.pathname, response);
    return;
  }

  sendJson(response, 404, { ok: false, error: "Not found." });
});

httpServer.listen(PORT, () => {
  console.log(`DMPL server running on http://127.0.0.1:${PORT}`);
});

async function handleJoin(request, response) {
  const body = await readJsonBody(request);
  const normalizedRoomCode = normalizeRoomCode(body.roomCode);
  const name = String(body.playerName || "").trim().slice(0, 24);

  if (!normalizedRoomCode || !name) {
    sendJson(response, 400, { ok: false, error: "Enter a player name and room code." });
    return;
  }

  const room = rooms.get(normalizedRoomCode);
  if (!room) {
    sendJson(response, 404, { ok: false, error: "Room not found. Create a room first or check the code." });
    return;
  }

  if (room.players.length >= 4) {
    sendJson(response, 409, { ok: false, error: "This room already has 4 players." });
    return;
  }

  const player = addPlayer(room, name);
  room.log.unshift(`${name} joined ${normalizedRoomCode}.`);

  if (room.players.length === 4 && room.status === "waiting") {
    prepareToss(room);
  }

  publishRoom(room);
  publishRoomList();
  sendJson(response, 200, {
    ok: true,
    playerId: player.id,
    roomCode: normalizedRoomCode,
    room: serializeRoom(room)
  });
}

async function handleCreateRoom(request, response) {
  const body = await readJsonBody(request);
  const name = String(body.playerName || "").trim().slice(0, 24);
  const visibility = body.visibility === "private" ? "private" : "public";

  if (!name) {
    sendJson(response, 400, { ok: false, error: "Enter a player name to create a room." });
    return;
  }

  const room = createRoom(visibility);
  const player = addPlayer(room, name);
  room.log.unshift(`${name} created ${room.code}.`);
  publishRoomList();

  sendJson(response, 200, {
    ok: true,
    playerId: player.id,
    roomCode: room.code,
    room: serializeRoom(room)
  });
}

async function handleChoice(request, response) {
  const body = await readJsonBody(request);
  const room = rooms.get(normalizeRoomCode(body.roomCode));
  const selectedRun = Number(body.run);

  if (!room || !VALID_RUNS.has(selectedRun)) {
    sendJson(response, 400, { ok: false, error: "Invalid run choice." });
    return;
  }

  const role = getPlayerRole(room, body.playerId);
  if (role !== "batter" && role !== "bowler") {
    sendJson(response, 403, { ok: false, error: "Only the active batter and bowler can choose." });
    return;
  }

  room.pendingChoices[role] = selectedRun;
  publishRoom(room);

  if (room.pendingChoices.batter && room.pendingChoices.bowler) {
    resolveBall(room);
    publishRoom(room);
  }

  sendJson(response, 200, { ok: true });
}

async function handleRestart(request, response) {
  const body = await readJsonBody(request);
  const room = rooms.get(normalizeRoomCode(body.roomCode));

  if (!room) {
    sendJson(response, 404, { ok: false, error: "Room not found." });
    return;
  }

  if (room.players.length === 4) {
    prepareToss(room);
  } else {
    resetRoomToWaiting(room);
  }
  publishRoom(room);
  sendJson(response, 200, { ok: true });
}

async function handleToss(request, response) {
  const body = await readJsonBody(request);
  const room = rooms.get(normalizeRoomCode(body.roomCode));

  if (!room) {
    sendJson(response, 404, { ok: false, error: "Room not found." });
    return;
  }

  if (room.hostId !== body.hostPlayerId) {
    sendJson(response, 403, { ok: false, error: "Only the host can flip the toss." });
    return;
  }

  if (room.status !== "toss") {
    sendJson(response, 400, { ok: false, error: "Toss is not available right now." });
    return;
  }

  flipTossAndStart(room);
  publishRoom(room);
  sendJson(response, 200, { ok: true, room: serializeRoom(room) });
}

async function handleKick(request, response) {
  const body = await readJsonBody(request);
  const room = rooms.get(normalizeRoomCode(body.roomCode));

  if (!room) {
    sendJson(response, 404, { ok: false, error: "Room not found." });
    return;
  }

  if (room.hostId !== body.hostPlayerId) {
    sendJson(response, 403, { ok: false, error: "Only the host can kick players." });
    return;
  }

  if (body.targetPlayerId === room.hostId) {
    sendJson(response, 400, { ok: false, error: "The host cannot kick themselves." });
    return;
  }

  const target = room.players.find((player) => player.id === body.targetPlayerId);
  if (!target) {
    sendJson(response, 404, { ok: false, error: "Player not found." });
    return;
  }

  notifyPlayer(room.code, target.id, "kicked-player", {
    message: `You were kicked from ${room.code} by the host.`
  });
  removePlayer(room, target.id, `${target.name} was kicked by the host.`);
  publishRoom(room);
  sendJson(response, 200, { ok: true });
}

function createRoom(visibility = "public") {
  const code = createRoomCode();
  const room = {
    code,
    visibility,
    hostId: null,
    players: [],
    status: "waiting",
    toss: null,
    battingFirstTeam: "A",
    innings: 0,
    score: createEmptyScores(),
    pendingChoices: {},
    lastBall: null,
    winner: null,
    log: [`Room ${code} created.`]
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(room, name) {
  const team = room.players.length < 2 ? "A" : "B";
  const player = { id: crypto.randomUUID(), name, team };
  room.players.push(player);
  room.hostId ||= player.id;
  return player;
}

function removePlayer(room, playerId, logEntry) {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) return;

  room.players = room.players.filter((candidate) => candidate.id !== playerId);
  room.pendingChoices = {};
  room.log.unshift(logEntry);

  if (room.hostId === playerId) {
    room.hostId = room.players[0]?.id || null;
  }

  rebalanceTeams(room);

  if (room.players.length < 4) {
    resetRoomToWaiting(room);
  }
  publishRoomList();
}

function rebalanceTeams(room) {
  room.players = room.players.map((player, index) => ({
    ...player,
    team: index < 2 ? "A" : "B"
  }));
}

function prepareToss(room) {
  room.status = "toss";
  room.innings = 0;
  room.score = createEmptyScores();
  room.pendingChoices = {};
  room.lastBall = null;
  room.winner = null;
  room.battingFirstTeam = "A";
  room.toss = {
    status: "ready",
    winnerTeam: null,
    result: null,
    flippedAt: null
  };
  room.log = ["All players joined. Host can flip the toss."];
  publishRoomList();
}

function flipTossAndStart(room) {
  const result = crypto.randomInt(2) === 0 ? "Heads" : "Tails";
  const winnerTeam = result === "Heads" ? "A" : "B";
  room.toss = {
    status: "done",
    winnerTeam,
    result,
    flippedAt: Date.now()
  };
  startMatch(room, winnerTeam);
}

function startMatch(room, battingFirstTeam = room.battingFirstTeam || "A") {
  room.status = "playing";
  room.innings = 0;
  room.battingFirstTeam = battingFirstTeam;
  room.score = createEmptyScores();
  room.pendingChoices = {};
  room.lastBall = null;
  room.winner = null;
  room.log.unshift(`Toss result: ${room.toss?.result}. Team ${battingFirstTeam} bats first.`);
  room.log.unshift("Match started.");
  publishRoomList();
}

function resetRoomToWaiting(room) {
  room.status = "waiting";
  room.innings = 0;
  room.score = createEmptyScores();
  room.pendingChoices = {};
  room.lastBall = null;
  room.winner = null;
  room.battingFirstTeam = "A";
  room.toss = null;
}

function createEmptyScores() {
  return {
    A: createTeamScore(),
    B: createTeamScore()
  };
}

function createTeamScore() {
  return {
    runs: 0,
    balls: 0,
    wickets: 0,
    strikerIndex: 0,
    outPlayerIds: []
  };
}

function resolveBall(room) {
  const battingTeam = getBattingTeam(room);
  const bowlingTeam = battingTeam === "A" ? "B" : "A";
  const battingScore = room.score[battingTeam];
  const batterChoice = room.pendingChoices.batter;
  const bowlerChoice = room.pendingChoices.bowler;
  const isOut = batterChoice === bowlerChoice;

  battingScore.balls += 1;

  if (isOut) {
    const batter = getActiveBatter(room, battingTeam);
    battingScore.wickets += 1;
    if (batter && !battingScore.outPlayerIds.includes(batter.id)) {
      battingScore.outPlayerIds.push(batter.id);
    }
    battingScore.strikerIndex = getOnlyNotOutIndex(room, battingTeam);
    room.log.unshift(`Wicket! Both players chose ${batterChoice}.`);
  } else {
    battingScore.runs += batterChoice;
    if (batterChoice % 2 === 1 && canRotateStrike(room, battingTeam)) {
      battingScore.strikerIndex = battingScore.strikerIndex === 0 ? 1 : 0;
    }
    room.log.unshift(`${batterChoice} run${batterChoice === 1 ? "" : "s"} scored.`);
  }

  if (battingScore.balls % BALLS_PER_OVER === 0 && !isInningsOver(room) && canRotateStrike(room, battingTeam)) {
    battingScore.strikerIndex = battingScore.strikerIndex === 0 ? 1 : 0;
    room.log.unshift(`End of over ${battingScore.balls / BALLS_PER_OVER}. Strike changed.`);
  }

  room.lastBall = {
    batterChoice,
    bowlerChoice,
    isOut,
    battingTeam,
    bowlingTeam
  };
  room.pendingChoices = {};

  if (isInningsOver(room)) {
    advanceMatch(room);
  }
}

function advanceMatch(room) {
  if (room.innings === 0) {
    room.innings = 1;
    room.pendingChoices = {};
    const firstBattingTeam = room.battingFirstTeam;
    const chasingTeam = firstBattingTeam === "A" ? "B" : "A";
    room.log.unshift(`Innings break. Team ${chasingTeam} needs ${room.score[firstBattingTeam].runs + 1} to win.`);
    return;
  }

  const firstBattingTeam = room.battingFirstTeam;
  const chasingTeam = firstBattingTeam === "A" ? "B" : "A";
  const firstBattingRuns = room.score[firstBattingTeam].runs;
  const chasingRuns = room.score[chasingTeam].runs;
  room.status = "finished";
  room.winner = firstBattingRuns === chasingRuns ? "Tie" : firstBattingRuns > chasingRuns ? firstBattingTeam : chasingTeam;
  room.log.unshift(room.winner === "Tie" ? "Match tied." : `Team ${room.winner} wins.`);
}

function isInningsOver(room) {
  const battingTeam = getBattingTeam(room);
  const battingScore = room.score[battingTeam];
  const firstBattingTeam = room.battingFirstTeam;
  const targetReached = room.innings === 1 && battingScore.runs > room.score[firstBattingTeam].runs;

  return battingScore.balls >= MAX_BALLS || battingScore.wickets >= WICKETS_PER_TEAM || targetReached;
}

function getPlayerRole(room, playerId) {
  if (room.status !== "playing") return "spectator";

  const battingTeam = getBattingTeam(room);
  const bowlingTeam = battingTeam === "A" ? "B" : "A";
  const batter = getActiveBatter(room, battingTeam);
  const bowler = getActiveBowler(room, bowlingTeam);

  if (batter?.id === playerId) return "batter";
  if (bowler?.id === playerId) return "bowler";
  return "fielder";
}

function getActiveBatter(room, team) {
  const teammates = room.players.filter((player) => player.team === team);
  const notOutTeammates = getNotOutTeammates(room, team);
  const strikerIndex = room.score[team].strikerIndex;
  return notOutTeammates.find((player) => teammates.indexOf(player) === strikerIndex) || notOutTeammates[0];
}

function getActiveBowler(room, team) {
  const teammates = room.players.filter((player) => player.team === team);
  const battingTeam = team === "A" ? "B" : "A";
  const currentOver = Math.floor(room.score[battingTeam].balls / BALLS_PER_OVER);
  return teammates[currentOver % Math.max(teammates.length, 1)];
}

function getBattingTeam(room) {
  const firstBattingTeam = room.battingFirstTeam || "A";
  if (room.innings === 0) return firstBattingTeam;
  return firstBattingTeam === "A" ? "B" : "A";
}

function publishRoom(room) {
  const roomStreams = streams.get(room.code);
  if (!roomStreams) return;

  const payload = `data: ${JSON.stringify(serializeRoom(room))}\n\n`;
  for (const stream of roomStreams) {
    stream.response.write(payload);
  }
}

function publishRoomList() {
  for (const [roomCode, roomStreams] of streams.entries()) {
    if (roomCode !== "__lobby__") continue;

    const payload = `data: ${JSON.stringify(getPublicRooms())}\n\n`;
    for (const stream of roomStreams) {
      stream.response.write(payload);
    }
  }
}

function serializeRoom(room) {
  const battingTeam = room.status === "playing" ? getBattingTeam(room) : null;
  const bowlingTeam = battingTeam ? (battingTeam === "A" ? "B" : "A") : null;

  return {
    code: room.code,
    visibility: room.visibility,
    joinUrl: `/join/${room.code}`,
    hostId: room.hostId,
    players: room.players,
    status: room.status,
    toss: room.toss,
    battingFirstTeam: room.battingFirstTeam,
    innings: room.innings,
    battingTeam,
    bowlingTeam,
    score: room.score,
    activeBatterId: battingTeam ? getActiveBatter(room, battingTeam)?.id : null,
    activeBowlerId: bowlingTeam ? getActiveBowler(room, bowlingTeam)?.id : null,
    pendingChoices: {
      batter: Boolean(room.pendingChoices.batter),
      bowler: Boolean(room.pendingChoices.bowler)
    },
    lastBall: room.lastBall,
    winner: room.winner,
    log: room.log.slice(0, 10)
  };
}

function normalizeRoomCode(roomCode) {
  return String(roomCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

function openEventStream(request, response, rawRoomCode) {
  const roomCode = rawRoomCode === "__lobby__" ? "__lobby__" : normalizeRoomCode(rawRoomCode);
  const url = new URL(request.url, `http://${request.headers.host}`);
  const playerId = url.searchParams.get("playerId") || "";
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  if (!roomCode) {
    response.write(`event: error\ndata: ${JSON.stringify({ error: "Missing room code." })}\n\n`);
    response.end();
    return;
  }

  if (!streams.has(roomCode)) {
    streams.set(roomCode, new Set());
  }

  const stream = { response, playerId };
  streams.get(roomCode).add(stream);
  const room = rooms.get(roomCode);
  if (room) {
    response.write(`data: ${JSON.stringify(serializeRoom(room))}\n\n`);
  } else if (roomCode === "__lobby__") {
    response.write(`data: ${JSON.stringify(getPublicRooms(request))}\n\n`);
  }

  request.on("close", () => {
    streams.get(roomCode)?.delete(stream);
    setTimeout(() => removeDisconnectedPlayer(roomCode, playerId), 3000);
  });
}

function getNotOutTeammates(room, team) {
  const outPlayerIds = room.score[team].outPlayerIds;
  return room.players.filter((player) => player.team === team && !outPlayerIds.includes(player.id));
}

function getOnlyNotOutIndex(room, team) {
  const teammates = room.players.filter((player) => player.team === team);
  const notOutPlayer = getNotOutTeammates(room, team)[0];
  return Math.max(teammates.findIndex((player) => player.id === notOutPlayer?.id), 0);
}

function canRotateStrike(room, team) {
  return getNotOutTeammates(room, team).length > 1;
}

function createRoomCode() {
  let code = "";
  do {
    code = Array.from({ length: ROOM_CODE_LENGTH }, () =>
      ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)]
    ).join("");
  } while (rooms.has(code));

  return code;
}

function getPublicRooms(request) {
  return [...rooms.values()]
    .filter((room) => room.visibility === "public" && room.status !== "finished" && room.players.length < 4)
    .map((room) => ({
      code: room.code,
      joinUrl: `/join/${room.code}`,
      playerCount: room.players.length,
      status: room.status,
      hostName: room.players.find((player) => player.id === room.hostId)?.name || "Host"
    }));
}

function notifyPlayer(roomCode, playerId, eventName, payload) {
  const roomStreams = streams.get(roomCode);
  if (!roomStreams) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const stream of roomStreams) {
    if (stream.playerId === playerId) {
      stream.response.write(message);
    }
  }
}

function removeDisconnectedPlayer(roomCode, playerId) {
  if (!playerId) return;

  const roomStreams = streams.get(roomCode);
  const stillConnected = [...(roomStreams || [])].some((stream) => stream.playerId === playerId);
  if (stillConnected) return;

  const room = rooms.get(roomCode);
  const player = room?.players.find((candidate) => candidate.id === playerId);
  if (!room || !player) return;

  removePlayer(room, playerId, `${player.name} left the room.`);
  publishRoom(room);
}

async function serveStatic(pathname, response) {
  const requestedPath = pathname === "/" || pathname.startsWith("/join/") ? "/index.html" : pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { ok: false, error: "Forbidden." });
    return;
  }

  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) throw new Error("Not a file");

    response.writeHead(200, {
      "Content-Type": getContentType(filePath)
    });
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { ok: false, error: "File not found." });
  }
}

async function readJsonBody(request) {
  let rawBody = "";
  for await (const chunk of request) {
    rawBody += chunk;
  }

  try {
    return JSON.parse(rawBody || "{}");
  } catch {
    return {};
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function getContentType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };

  return types[extname(filePath)] || "application/octet-stream";
}
