/** Camera position and look-at target in the point cloud's world coordinates. */
export interface CameraState {
    position_x: number;
    position_y: number;
    position_z: number;
    target_x: number;
    target_y: number;
    target_z: number;
}

/** Union of all message types the server can send. */
export type ServerMessage = WelcomeMessage | PeerUpdateMessage | PeerLeftMessage;

/** Sent once on connect: the client's own peer_id and every current peer's camera state. */
export interface WelcomeMessage {
    type: "welcome";
    peer_id: string;
    peers: Record<string, CameraState>;
}

/** Sent whenever another peer moves their camera. */
export interface PeerUpdateMessage {
    type: "peer_update";
    peer_id: string;
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
