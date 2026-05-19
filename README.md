# Fockit!

A local-network live quiz platform. No internet required. Host creates a game, players on the same network join with a room code.

---

## Tech Stack

- **Frontend:** React, Vite, Socket.io-client
- **Backend:** Python (Django), ASGI (Uvicorn), python-socketio
- **Database:** PostgreSQL

---

## Quick Start (Docker - Recommended)

The easiest way to run the application is using Docker Compose, which sets up the database, backend, and frontend automatically.

```bash
docker-compose up --build
```

Server starts on `http://localhost:3001`

---

## Manual Development Setup

### Requirements

- Node.js 18+
- npm 9+
- Python 3.12+

### 1. Install Dependencies

This will create a Python virtual environment (`venv`), install Django requirements, and install the React frontend dependencies.

```bash
npm run setup
```

### 2. Start Servers

Run the backend (Uvicorn) and frontend (Vite) development servers simultaneously:

```bash
npm run dev
```

- Client dev server: `http://localhost:3000`
- Server (API & Sockets): `http://localhost:3001`
- *Note: API calls and sockets from the client are proxied automatically.*

---

## Usage

### Host Machine

Open `http://localhost:3001` in a browser.

### Player Devices (Same Network)

Open `http://<host-ip>:3001` — replace `<host-ip>` with machine's local IP address (e.g., `192.168.1.42`).

> **mDNS:** If bonjour-service is available on your network, players may also reach the app at `http://fockit.local:3001`

---

## Project Structure

```
fockit/
├── server/
│   ├── fockit_project/   # Django configuration and settings
│   ├── api/              # Django app (models, views, socket endpoints)
│   │   ├── game_manager.py # In-memory game session logic
│   │   ├── sockets.py    # Websocket event handlers
│   │   ├── models.py     # PostgreSQL database schema
│   │   └── views.py      # REST APIs
│   └── requirements.txt  # Python dependencies
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
├── docker-compose.yml
└── Dockerfile
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
| `PGHOST` | `localhost` | PostgreSQL host |
| `PGUSER` | `fockit` | PostgreSQL username |

Set via environment variables if running manually.
