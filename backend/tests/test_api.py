"""Integration tests for the FastAPI WebSocket endpoint.

Uses Starlette's synchronous TestClient (single event-loop portal) so that
two WebSocket connections can coexist and share the same hub instance without
event-loop conflicts.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from cloud_view.main import app


def test_health_endpoint() -> None:
    """Health check returns 200 with status ok."""
    with TestClient(app) as client:
        resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "connections" in body


def test_openapi_schema_is_available() -> None:
    """FastAPI publishes an OpenAPI spec at /openapi.json."""
    with TestClient(app) as client:
        resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert "paths" in resp.json()


def test_websocket_welcome_on_connect() -> None:
    """First message after connect is a welcome with the client's peer_id."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            data = json.loads(ws.receive_text())

    assert data["type"] == "welcome"
    assert "peer_id" in data
    assert "color" in data
    assert "name" in data
    assert data["peers"] == {}


def test_second_joiner_receives_existing_peers() -> None:
    """A new joiner whose predecessor already sent a camera update sees that state."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws1:
            welcome1 = json.loads(ws1.receive_text())
            peer1_id = welcome1["peer_id"]

            ws1.send_text(
                json.dumps(
                    {
                        "type": "camera_update",
                        "data": {
                            "position_x": 1.0,
                            "position_y": 2.0,
                            "position_z": 3.0,
                            "direction_x": 4.0,
                            "direction_y": 5.0,
                            "direction_z": 6.0,
                        },
                    }
                )
            )

            with client.websocket_connect("/ws") as ws2:
                welcome2 = json.loads(ws2.receive_text())

    assert peer1_id in welcome2["peers"]
    assert welcome2["peers"][peer1_id]["camera_state"]["position_x"] == 1.0
    assert "color" in welcome2["peers"][peer1_id]
    assert "name" in welcome2["peers"][peer1_id]


def test_camera_update_relayed_to_second_client() -> None:
    """Camera update from client A reaches client B as a peer_update."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws1:
            welcome1 = json.loads(ws1.receive_text())
            peer1_id = welcome1["peer_id"]

            with client.websocket_connect("/ws") as ws2:
                json.loads(ws2.receive_text())  # consume welcome

                ws1.send_text(
                    json.dumps(
                        {
                            "type": "camera_update",
                            "data": {
                                "position_x": 10.0,
                                "position_y": 20.0,
                                "position_z": 30.0,
                                "direction_x": 15.0,
                                "direction_y": 25.0,
                                "direction_z": 35.0,
                            },
                        }
                    )
                )

                msg = json.loads(ws2.receive_text())

    assert msg["type"] == "peer_update"
    assert msg["peer_id"] == peer1_id
    assert msg["data"]["position_x"] == 10.0
    assert "color" in msg
    assert "name" in msg


def test_invalid_message_does_not_close_connection() -> None:
    """Malformed JSON from a client is silently discarded; connection stays open."""
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            ws.receive_text()  # consume welcome
            ws.send_text("this is not json {{")
            # Send a valid message to confirm the connection is still alive
            ws.send_text(
                json.dumps(
                    {
                        "type": "camera_update",
                        "data": {
                            "position_x": 0.0,
                            "position_y": 0.0,
                            "position_z": 0.0,
                            "direction_x": 1.0,
                            "direction_y": 0.0,
                            "direction_z": 0.0,
                        },
                    }
                )
            )
            # No exception means the connection remained open
