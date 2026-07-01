/** Camera position and normalised view direction in world coordinates. */
export interface CameraState {
    position_x: number;
    position_y: number;
    position_z: number;
    direction_x: number;
    direction_y: number;
    direction_z: number;
}

/** Color assignment and last known camera state for a peer. */
export interface PeerInfo {
    color: string;
    name: string;
    camera_state: CameraState;
}

/** Union of all message types the server can send. */
export type ServerMessage = WelcomeMessage | PeerUpdateMessage | PeerLeftMessage;

/** Sent once on connect: the client's own peer_id, color, name, and every current peer's state. */
export interface WelcomeMessage {
    type: "welcome";
    peer_id: string;
    color: string;
    name: string;
    peers: Record<string, PeerInfo>;
}

/** Sent whenever another peer moves their camera. */
export interface PeerUpdateMessage {
    type: "peer_update";
    peer_id: string;
    color: string;
    name: string;
    data: CameraState;
}

/** Sent when a peer disconnects. */
export interface PeerLeftMessage {
    type: "peer_left";
    peer_id: string;
}

/** Message shape sent from client to server. */
export interface CameraUpdateMessage {
    type: "camera_update";
    data: CameraState;
}