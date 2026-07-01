"""Pydantic models for the WebSocket sync protocol."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CameraState(BaseModel):
    """Camera position and normalised view direction in world coordinates."""

    position_x: float
    position_y: float
    position_z: float
    direction_x: float
    direction_y: float
    direction_z: float


class PeerInfo(BaseModel):
    """Color assignment and last known camera state for a peer."""

    color: str
    name: str
    camera_state: CameraState


class CameraUpdateMessage(BaseModel):
    """Sent by a client to report its current camera state."""

    type: Literal["camera_update"]
    data: CameraState


class WelcomeMessage(BaseModel):
    """Sent to a new client: its assigned peer_id, color, name, and all current peer states."""

    type: Literal["welcome"] = "welcome"
    peer_id: str
    color: str
    name: str
    peers: dict[str, PeerInfo]


class PeerUpdateMessage(BaseModel):
    """Broadcast to all other clients when a peer's camera moves."""

    type: Literal["peer_update"] = "peer_update"
    peer_id: str
    color: str
    name: str
    data: CameraState


class PeerLeftMessage(BaseModel):
    """Broadcast when a peer disconnects."""

    type: Literal["peer_left"] = "peer_left"
    peer_id: str
