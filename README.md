# Cloud View

Collaborative real-time point cloud viewer. Multiple browser tabs load the SoFi Stadium COPC
point cloud and share their camera position and view direction — each tab shows where the
others are looking as a coloured 3D arrow in the scene.

## Stack

| Layer | Technology |
|---|---|
| Point cloud viewer | [Potree](https://github.com/potree/potree) (develop branch, COPC support) |
| Real-time sync | Python / FastAPI WebSocket hub |
| Peer presence | Three.js `ArrowHelper` in Potree's overlay scene |
| Build / serve | Vite (TypeScript), nginx, Docker Compose |

## Prerequisites

- Docker ≥ 24 and Docker Compose V2  
- For local development without Docker: Python ≥ 3.12, [uv](https://docs.astral.sh/uv/), Node.js 20, git

## Running with Docker Compose (recommended)

```bash
docker compose up --build
```

Open **http://localhost:8080** in two browser tabs.

> **Note:** The SoFi Stadium COPC file is ~2 GB. The first load streams tiles from S3 and
> takes 30–60 s depending on your connection. Subsequent loads use the browser cache.
>
> **Note:** The Docker build clones and builds Potree from source. This takes a few minutes
> the first time; subsequent builds use layer cache.

## Local development (without Docker)

### One-time setup

```bash
# Backend deps
cd backend && uv sync --dev && cd ..

# Frontend deps
cd frontend && npm install && cd ..

# Potree (clones develop branch and copies build output)
./scripts/setup-potree.sh
```

### Run each service

```bash
# Terminal 1 — backend
cd backend
uv run uvicorn cloud_view.main:app --reload --port 8000

# Terminal 2 — frontend dev server (proxies /ws to :8000)
cd frontend
npm run dev
```

Open **http://localhost:5173** in two tabs.

## Running tests

```bash
cd backend
uv run pytest tests -v
```

## Code quality checks

```bash
cd backend
uv run black --check src tests   # formatting
uv run flake8 src tests          # linting
uv run mypy src                  # type checking

cd frontend
npm run type-check               # tsc --noEmit
```

## Testing with two tabs

1. Open the app URL in **tab A** and wait for the point cloud to finish loading.
   Elevation coloring (height gradient) is applied automatically on load.
2. Open the same URL in **tab B**.
3. Move the camera in tab A — a coloured arrow appears in tab B showing tab A's
   camera position and viewing direction.
4. Open a third tab — it sees arrows for both existing tabs.
5. Close tab A — its arrow disappears from the other tabs within ~2 s.

## API reference

The FastAPI backend publishes an OpenAPI spec at **http://localhost:8000/docs** (dev)
or **http://localhost:8080/docs** would need to be proxied (not currently configured
— use the backend URL directly for API exploration).

### WebSocket protocol (`/ws`)

All frames are JSON. Types:

| Direction | Shape | When |
|---|---|---|
| Server → client | `{type:"welcome", peer_id, peers:{}}` | Immediately on connect |
| Client → server | `{type:"camera_update", data:{position_x,…,target_z}}` | Camera moves (≤1 Hz) |
| Server → others | `{type:"peer_update", peer_id, data:{…}}` | Relayed camera update |
| Server → others | `{type:"peer_left", peer_id}` | Tab closed / connection lost |

## Architecture

```
browser tab(s)
  ├── Potree viewer     — streams SoFi COPC from S3, elevation coloring default
  ├── SyncClient        — WebSocket to /ws, queues camera state, sends at 1 Hz
  └── PeerRenderer      — manages one THREE.ArrowHelper per peer in overlay scene
           │
           │ ws://host/ws
           ▼
     nginx (port 80)
       ├── /           → /usr/share/nginx/html  (Vite build + Potree static files)
       └── /ws         → proxy → backend:8000
           │
           ▼
     FastAPI (Python)
       └── ConnectionHub
             ├── connect()        → assign peer_id, send welcome with current states
             ├── update_camera()  → store state, broadcast peer_update to others
             └── disconnect()     → remove peer, broadcast peer_left to others
```

## Approach

**Scoping.** The task breaks cleanly into three independent pieces: point cloud loading, sync
transport, and peer visualisation. I built and verified each layer before wiring them together.

**Point cloud viewer.** Potree's develop branch is the only viewer with reliable COPC+LOD
support for a 2 GB file in the browser. The `activeAttributeName = "elevation"` is set in the
load callback so elevation coloring is the default — not a menu action. Potree is built from
source in a Docker stage (the develop branch often commits pre-built files, so the build step
is fast or a no-op).

**Real-time sync (Python/FastAPI).** `ConnectionHub` holds the state in a plain dict protected
by `asyncio.Lock`.  The lock is held only while reading/writing dicts; the actual WebSocket
sends happen concurrently via `asyncio.gather`.  `ConnectionHub` depends on a `WebSocketLike`
Protocol rather than FastAPI's `WebSocket` directly, so unit tests inject lightweight
`AsyncMock` doubles without any monkey-patching.

**Peer presence.** `PeerRenderer` keeps one `THREE.ArrowHelper` + eye sphere per peer in
Potree's overlay scene (`viewer.scene.scene`). Arrow length is 30% of the camera-to-target
distance (clamped), so it scales naturally as the user zooms in and out. Three.js objects from
our npm import are compatible with Potree's bundled Three.js because Three.js uses boolean
flags (`isObject3D`, `isMesh`) for type checks — not `instanceof`.

**What I used AI for.** Claude Code generated the scaffolding, protocol types, and boilerplate.
I specified the architecture, WebSocket protocol, and the Potree orbit-math formula
(`pivot = position − [r·sin(yaw)·cos(pitch), r·sin(pitch), r·cos(yaw)·cos(pitch)]`), and
reviewed/corrected the generated code before committing.

**What I'd improve next.** Peer name labels (Potree Annotation API), stable colours across
rejoin (hash peer_id to colour index), and a 2–4 Hz send rate for a more live feel while
keeping the 1 Hz fallback for slow connections.
