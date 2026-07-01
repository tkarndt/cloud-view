"""FastAPI application: WebSocket sync endpoint and health check."""

from __future__ import annotations

import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from .hub import ConnectionHub
from .models import CameraUpdateMessage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cloud View Sync",
    description="Real-time camera sync for collaborative point cloud viewing",
    version="0.1.0",
)

hub = ConnectionHub()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Sync endpoint for camera state sharing between browser tabs.

    Protocol (all messages are JSON):

    Server → client on connect:
        ``{"type": "welcome", "peer_id": "<uuid>", "peers": {"<uuid>": <CameraState>, ...}}``

    Client → server to report camera movement:
        ``{"type": "camera_update", "data": <CameraState>}``

    Server → other clients on camera movement:
        ``{"type": "peer_update", "peer_id": "<uuid>", "data": <CameraState>}``

    Server → remaining clients on disconnect:
        ``{"type": "peer_left", "peer_id": "<uuid>"}``
    """
    await websocket.accept()
    peer_id = await hub.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = CameraUpdateMessage.model_validate_json(raw)
            except ValidationError:
                logger.warning("Invalid message from %s (ignored): %.200s", peer_id, raw)
                continue
            if msg.type == "camera_update":
                await hub.update_camera(peer_id, msg.data)
    except WebSocketDisconnect:
        logger.info("WebSocket closed by client: %s", peer_id)
    except Exception:
        logger.exception("Unexpected error from peer %s", peer_id)
    finally:
        await hub.disconnect(peer_id)


@app.get("/health")
async def health() -> dict[str, object]:
    """Return service status and number of active connections."""
    return {"status": "ok", "connections": hub.connection_count}
