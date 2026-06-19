# DMPL

DMPL is a beginner-friendly 2v2 multiplayer hand-cricket game.

Rules in this first version:

- Four players join the same room.
- Rooms are created with unique 6-character alphanumeric codes.
- Rooms can be public or private.
- Public rooms appear in the lobby.
- Private rooms can be joined only by code or invite link.
- The first player in a room becomes the host.
- The host can kick players from the room.
- A kicked player is returned to the join screen with a notification.
- Team A bats first, Team B chases.
- Each innings is 4 overs or 2 wickets.
- The active batter chooses `1`, `2`, `3`, `4`, or `6`.
- The active bowler secretly chooses one of the same numbers.
- If both choose the same number, the batter is out.
- An out batter cannot bat again in that innings.
- Otherwise, the batter's chosen number is added to the score.
- Odd runs and completed overs rotate the strike.

## Architecture

This project has two parts:

- `server/index.js` is the backend. It owns the official match state, rooms, teams, score, wickets, innings, and realtime events.
- `public/app.js` is the frontend logic. It renders the screen, sends player choices, and listens for updated match state.
- `public/styles.css` is the frontend design.

The important multiplayer idea is this:

1. The browser never decides the final score.
2. The browser sends an action, such as "I choose 4".
3. The backend validates it, updates the official room state, then broadcasts the new state to every player.

That pattern is the foundation of most realtime multiplayer games.

## Run Locally

Start the server:

```bash
npm run dev
```

Open four browser tabs at:

```text
http://127.0.0.1:3000
```

Create a public or private room, then join the room from other tabs by code or invite link.

## Deploy

This repo includes `render.yaml` for a Render Web Service deployment.

Recommended MVP deploy flow:

1. Push this repo to GitHub.
2. Open Render and create a new Blueprint or Web Service from the repo.
3. Use `npm install` as the build command.
4. Use `npm start` as the start command.
5. After deploy, share the generated `onrender.com` URL.

Important MVP limitation: rooms are currently stored in server memory. That is fine for learning and a first live demo, but rooms reset when the server restarts. For serious public traffic, add a database or Redis-style store next.

## Learning Path

Recommended order:

1. Learn the frontend flow in `public/app.js`: forms, state, buttons, and conditional rendering.
2. Learn the backend endpoints in `server/index.js`: `/api/rooms`, `/api/join`, `/api/choice`, `/api/kick`, `/api/restart`, `/api/room`, and `/events`.
3. Study `resolveBall`, because that is the game engine for one ball.
4. Add one feature at a time: toss, custom teams, scoreboard history, chat, login, database storage, and public matchmaking.
