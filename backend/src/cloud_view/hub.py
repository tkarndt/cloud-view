"""WebSocket connection hub: tracks peers and broadcasts camera state."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Protocol, runtime_checkable

from .models import CameraState, PeerInfo, PeerLeftMessage, PeerUpdateMessage, WelcomeMessage

logger = logging.getLogger(__name__)

# Palette cycled in order; when exhausted, names gain a numeric suffix ("red 2", etc.).
PEER_COLOR_PALETTE: list[tuple[str, str]] = [
    ("#ff4444", "red"),
    ("#44cc44", "green"),
    ("#4488ff", "blue"),
    ("#ffcc00", "yellow"),
    ("#ff44ff", "magenta"),
    ("#00cccc", "cyan"),
]


@runtime_checkable
class WebSocketLike(Protocol):
    """Minimal interface the hub needs from a WebSocket connection.

    Using a Protocol here (rather than the FastAPI WebSocket type directly)
    allows tests to inject lightweight async doubles without full mocking.
    """

    async def send_text(self, data: str) -> None:
        """Send a text frame to the client."""
        ...


class ConnectionHub:
    """Manages all active WebSocket connections and relays camera state between peers.

    Designed for dependency injection: a single instance is shared across all
    WebSocket endpoint handlers in the process.  All state is in-memory; suitable
    for a single-process deployment.
    """

    def __init__(self) -> None:
        """Initialise with empty connection and state registries."""
        self._connections: dict[str, WebSocketLike] = {}
        self._camera_states: dict[str, CameraState] = {}
        self._peer_colors: dict[str, tuple[str, str]] = {}
        self._color_counter: int = 0
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocketLike) -> str:
        """Register a new peer, assign it a color, and send it the current state of all peers.

        Args:
            websocket: The WebSocket connection to register.

        Returns:
            The newly assigned peer_id (UUID string).
        """
        peer_id = str(uuid.uuid4())
        async with self._lock:
            color, name = self._next_color()
            self._connections[peer_id] = websocket
            self._peer_colors[peer_id] = (color, name)
            existing_states = dict(self._camera_states)
            existing_colors = dict(self._peer_colors)

        peers = {
            pid: PeerInfo(
                color=existing_colors[pid][0],
                name=existing_colors[pid][1],
                camera_state=state,
            )
            for pid, state in existing_states.items()
        }
        welcome = WelcomeMessage(peer_id=peer_id, color=color, name=name, peers=peers)
        await websocket.send_text(welcome.model_dump_json())
        logger.info(
            "Peer connected: %s color=%s (total: %d)", peer_id, name, len(self._connections)
        )
        return peer_id

    async def disconnect(self, peer_id: str) -> None:
        """Remove a peer and notify all remaining peers.

        Args:
            peer_id: The peer to remove.
        """
        async with self._lock:
            self._connections.pop(peer_id, None)
            self._camera_states.pop(peer_id, None)
            self._peer_colors.pop(peer_id, None)

        msg = PeerLeftMessage(peer_id=peer_id)
        await self._broadcast(msg.model_dump_json(), exclude=peer_id)
        logger.info("Peer disconnected: %s (total: %d)", peer_id, len(self._connections))

    async def update_camera(self, peer_id: str, state: CameraState) -> None:
        """Store a peer's new camera state and broadcast it to all other peers.

        Args:
            peer_id: The peer that moved.
            state:   The new camera state.
        """
        async with self._lock:
            self._camera_states[peer_id] = state
            color, name = self._peer_colors[peer_id]
            targets = {pid: ws for pid, ws in self._connections.items() if pid != peer_id}

        msg = PeerUpdateMessage(peer_id=peer_id, color=color, name=name, data=state)
        serialized = msg.model_dump_json()

        results = await asyncio.gather(
            *(ws.send_text(serialized) for ws in targets.values()),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, Exception):
                logger.warning("Failed to send camera update to a peer: %s", result)

        logger.debug("Camera update from %s relayed to %d peer(s)", peer_id, len(targets))

    @property
    def connection_count(self) -> int:
        """Current number of connected peers."""
        return len(self._connections)

    def _next_color(self) -> tuple[str, str]:
        """Assign the next color from the palette, cycling with a numeric suffix.

        Must be called while holding self._lock.
        """
        index = self._color_counter % len(PEER_COLOR_PALETTE)
        cycle = self._color_counter // len(PEER_COLOR_PALETTE)
        hex_color, base_name = PEER_COLOR_PALETTE[index]
        name = base_name if cycle == 0 else f"{base_name} {cycle + 1}"
        self._color_counter += 1
        return hex_color, name

    async def _broadcast(self, message: str, exclude: str | None = None) -> None:
        """Send a message to all connected peers, optionally excluding one."""
        async with self._lock:
            targets = [ws for pid, ws in self._connections.items() if pid != exclude]

        results = await asyncio.gather(
            *(ws.send_text(message) for ws in targets),
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, Exception):
                logger.warning("Broadcast failed for a peer: %s", result)
