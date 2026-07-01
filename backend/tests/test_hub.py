"""Unit tests for ConnectionHub.

The hub is tested by injecting lightweight async doubles that satisfy the
WebSocketLike Protocol — no mocking framework needed.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from cloud_view.hub import PEER_COLOR_PALETTE, ConnectionHub
from cloud_view.models import CameraState


@pytest.fixture
def hub() -> ConnectionHub:
    """Fresh hub for each test."""
    return ConnectionHub()


@pytest.fixture
def ws() -> AsyncMock:
    """Async WebSocket double."""
    double = AsyncMock()
    double.send_text = AsyncMock()
    return double


@pytest.fixture
def state() -> CameraState:
    """Sample camera state."""
    return CameraState(
        position_x=100.0,
        position_y=200.0,
        position_z=50.0,
        direction_x=0.0,
        direction_y=0.0,
        direction_z=-1.0,
    )


async def test_connect_returns_non_empty_peer_id(hub: ConnectionHub, ws: AsyncMock) -> None:
    """Each connected peer receives a unique non-empty ID."""
    peer_id = await hub.connect(ws)
    assert peer_id


async def test_connect_sends_welcome_with_color(hub: ConnectionHub, ws: AsyncMock) -> None:
    """New peer immediately receives a welcome with its ID, color, name, and empty peers."""
    peer_id = await hub.connect(ws)

    ws.send_text.assert_called_once()
    data = json.loads(ws.send_text.call_args[0][0])
    assert data["type"] == "welcome"
    assert data["peer_id"] == peer_id
    assert data["color"] == PEER_COLOR_PALETTE[0][0]
    assert data["name"] == PEER_COLOR_PALETTE[0][1]
    assert data["peers"] == {}


async def test_connect_increments_connection_count(hub: ConnectionHub, ws: AsyncMock) -> None:
    ws1, ws2 = AsyncMock(), AsyncMock()
    assert hub.connection_count == 0
    await hub.connect(ws1)
    assert hub.connection_count == 1
    await hub.connect(ws2)
    assert hub.connection_count == 2


async def test_two_peers_receive_different_colors(hub: ConnectionHub) -> None:
    """Consecutive peers are assigned distinct colors from the palette."""
    ws1, ws2 = AsyncMock(), AsyncMock()
    await hub.connect(ws1)
    await hub.connect(ws2)

    welcome1 = json.loads(ws1.send_text.call_args[0][0])
    welcome2 = json.loads(ws2.send_text.call_args[0][0])
    assert welcome1["color"] != welcome2["color"]
    assert welcome1["name"] != welcome2["name"]


async def test_palette_cycles_with_numeric_suffix(hub: ConnectionHub) -> None:
    """After all palette entries are used, colors repeat with a ' 2' suffix."""
    websockets = [AsyncMock() for _ in range(len(PEER_COLOR_PALETTE) + 1)]
    for ws in websockets:
        await hub.connect(ws)

    first_welcome = json.loads(websockets[0].send_text.call_args[0][0])
    overflow_welcome = json.loads(websockets[-1].send_text.call_args[0][0])
    assert overflow_welcome["color"] == first_welcome["color"]
    assert overflow_welcome["name"] == first_welcome["name"] + " 2"


async def test_new_joiner_receives_existing_peer_states(
    hub: ConnectionHub, state: CameraState
) -> None:
    """A peer that joins after others are connected gets all current camera states."""
    ws1, ws2 = AsyncMock(), AsyncMock()
    peer1 = await hub.connect(ws1)
    await hub.update_camera(peer1, state)

    await hub.connect(ws2)

    welcome = json.loads(ws2.send_text.call_args[0][0])
    assert peer1 in welcome["peers"]
    assert welcome["peers"][peer1]["camera_state"]["position_x"] == 100.0
    assert "color" in welcome["peers"][peer1]
    assert "name" in welcome["peers"][peer1]


async def test_camera_update_broadcasts_to_other_peers(
    hub: ConnectionHub, state: CameraState
) -> None:
    """Camera updates from one peer are forwarded to all others."""
    ws1, ws2 = AsyncMock(), AsyncMock()
    peer1 = await hub.connect(ws1)
    await hub.connect(ws2)
    ws2.send_text.reset_mock()

    await hub.update_camera(peer1, state)

    ws2.send_text.assert_called_once()
    msg = json.loads(ws2.send_text.call_args[0][0])
    assert msg["type"] == "peer_update"
    assert msg["peer_id"] == peer1
    assert msg["data"]["position_x"] == 100.0
    assert "color" in msg
    assert "name" in msg


async def test_camera_update_does_not_echo_to_sender(
    hub: ConnectionHub, state: CameraState
) -> None:
    """A peer's own camera updates are never echoed back to it."""
    ws1 = AsyncMock()
    peer1 = await hub.connect(ws1)
    ws1.send_text.reset_mock()

    await hub.update_camera(peer1, state)

    ws1.send_text.assert_not_called()


async def test_disconnect_notifies_remaining_peers(hub: ConnectionHub) -> None:
    """When a peer disconnects, remaining peers receive a peer_left message."""
    ws1, ws2 = AsyncMock(), AsyncMock()
    peer1 = await hub.connect(ws1)
    await hub.connect(ws2)
    ws2.send_text.reset_mock()

    await hub.disconnect(peer1)

    ws2.send_text.assert_called_once()
    msg = json.loads(ws2.send_text.call_args[0][0])
    assert msg["type"] == "peer_left"
    assert msg["peer_id"] == peer1


async def test_disconnect_decrements_connection_count(hub: ConnectionHub) -> None:
    ws1, ws2 = AsyncMock(), AsyncMock()
    peer1 = await hub.connect(ws1)
    await hub.connect(ws2)
    assert hub.connection_count == 2

    await hub.disconnect(peer1)
    assert hub.connection_count == 1


async def test_disconnected_peer_absent_from_later_welcome(
    hub: ConnectionHub, state: CameraState
) -> None:
    """A peer that has left does not appear in the welcome sent to new joiners."""
    ws1, ws2 = AsyncMock(), AsyncMock()
    peer1 = await hub.connect(ws1)
    await hub.update_camera(peer1, state)
    await hub.disconnect(peer1)

    await hub.connect(ws2)

    welcome = json.loads(ws2.send_text.call_args[0][0])
    assert peer1 not in welcome["peers"]


async def test_two_unique_peer_ids(hub: ConnectionHub) -> None:
    """Each connection is assigned a distinct peer_id."""
    ws1, ws2 = AsyncMock(), AsyncMock()
    peer1 = await hub.connect(ws1)
    peer2 = await hub.connect(ws2)
    assert peer1 != peer2
