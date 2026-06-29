"""WebSocket connection hub: tracks peers and broadcasts camera state."""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Protocol, runtime_checkable

from .models import CameraState, PeerLeftMessage, PeerUpdateMessage, WelcomeMessage

logger = logging.getLogger(__name__)


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
        """Initialise with empty connection and camera-state registries."""
        self._connections: dict[str, WebSocketLike] = {}
        self._camera_states: dict[str, CameraState] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocketLike) -> str:
        """Register a new peer and send it the current state of all other peers.

        Args:
            websocket: The WebSocket connection to register.

        Returns:
            The newly assigned peer_id (UUID string).
        """
        peer_id = str(uuid.uuid4())
        async with self._lock:
            self._connections[peer_id] = websocket
            existing = dict(self._camera_states)

        welcome = WelcomeMessage(peer_id=peer_id, peers=existing)
        await websocket.send_text(welcome.model_dump_json())
        logger.info("Peer connected: %s (total: %d)", peer_id, len(self._connections))
        return peer_id

    async def disconnect(self, peer_id: str) -> None:
        """Remove a peer and notify all remaining peers.

        Args:
            peer_id: The peer to remove.
        """
        async with self._lock:
            self._connections.pop(peer_id, None)
            self._camera_states.pop(peer_id, None)

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
            targets = {pid: ws for pid, ws in self._connections.items() if pid != peer_id}

        msg = PeerUpdateMessage(peer_id=peer_id, data=state)
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
