# Fockit!

A local-network live quiz platform. No internet required. Host creates a game, players on the same network join with a room code.

---

## Quick Start

### Requirements

- Node.js 18+
- npm 9+

### 1. Install Dependencies

```bash
npm run install:all
```

### 2. Build Frontend

```bash
npm run build
```

### 3. Start Server

```bash
npm start
```

Server starts on `http://localhost:3001`

---

## Usage

### Host Machine

Open `http://localhost:3001` in a browser.

### Player Devices (Same Network)

Open `http://<host-ip>:3001` — replace `<host-ip>` with machine's local IP address (e.g., `192.168.1.42`).

> **mDNS:** If bonjour-service is available on your network, players may also reach the app at `http://fockit.local:3001`

---

## Development Mode (Hot Reload)

Run server and client dev servers simultaneously:

```bash
npm run dev
```

- Client dev server: `http://localhost:3000`
- Server: `http://localhost:3001`
- API calls and sockets are proxied automatically

---

## Project Structure

```
fockit/
├── server/
│   ├── index.js          # Express + Socket.io server
│   └── gameManager.js    # In-memory game session logic
├── client/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── socket.js
│   │   ├── index.css
│   │   └── pages/
│   │       ├── MainPage.jsx    # Room code entry + CREATE
│   │       ├── CreatePage.jsx  # Question builder
│   │       ├── HostPage.jsx    # Host lobby / game view / results
│   │       └── PlayPage.jsx    # Client full flow
│   └── index.html
└── package.json
```

---

## Game Flow

### Host

1. Go to `/` → click **Create**
2. Enter quiz name, add questions (Quiz or True/False), set timers
3. Click **Start Game** → share room code with players
4. Click **Ready** once players have joined
5. Watch real-time answer dashboard during each question
6. Click **Next** to advance (or auto-advances after 8s)
7. See final leaderboard → **Play Again** or **Exit**

### Players

1. Go to host's IP in a browser
2. Enter room code → choose nickname → **Jump In**
3. Answer questions before timer runs out
4. See score after each round

---

## Scoring

```
points = 1000 × (timeRemaining / totalTime)
```

Faster correct answers score more. Wrong answers score 0.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3001`  | Server port |

Set via environment: `PORT=8080 npm start`
