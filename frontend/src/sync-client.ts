/**
 * WebSocket client for camera-state synchronisation.
 *
 * Camera updates are queued and sent at most once per SEND_INTERVAL_MS,
 * so moving the camera quickly does not flood the server.  The connection
 * reconnects automatically after an unexpected close.
 */

import type {
    CameraState,
    CameraUpdateMessage,
    PeerInfo,
    PeerLeftMessage,
    PeerUpdateMessage,
    ServerMessage,
    WelcomeMessage,
} from "./types.js";

export type WelcomeHandler = (
    myPeerId: string,
    myColor: string,
    myName: string,
    peers: Record<string, PeerInfo>,
) => void;
export type PeerUpdateHandler = (
    peerId: string,
    state: CameraState,
    color: string,
    name: string,
) => void;
export type PeerLeftHandler = (peerId: string) => void;

const SEND_INTERVAL_MS = 1_000;
const RECONNECT_DELAY_MS = 2_000;

export class SyncClient {
    private ws: WebSocket | null = null;
    private sendTimer: ReturnType<typeof setInterval> | null = null;
    private pendingState: CameraState | null = null;
    private intentionallyClosed = false;

    /**
     * @param url           WebSocket URL, e.g. `ws://localhost/ws`
     * @param onWelcome     Called once on connect with own peer_id and existing peers.
     * @param onPeerUpdate  Called when a peer's camera state changes.
     * @param onPeerLeft    Called when a peer disconnects.
     */
    constructor(
        private readonly url: string,
        private readonly onWelcome: WelcomeHandler,
        private readonly onPeerUpdate: PeerUpdateHandler,
        private readonly onPeerLeft: PeerLeftHandler,
    ) {}

    /** Open the WebSocket connection and start the periodic send loop. */
    connect(): void {
        this.intentionallyClosed = false;
        this.openSocket();
    }

    /** Close the connection and stop sending. */
    disconnect(): void {
        this.intentionallyClosed = true;
        this.stopSendTimer();
        this.ws?.close();
        this.ws = null;
    }

    /**
     * Queue the latest camera state.  The most-recent state is sent on the
     * next tick of the send timer — intermediate states are dropped.
     */
    queueCameraState(state: CameraState): void {
        this.pendingState = state;
    }

    private openSocket(): void {
        const ws = new WebSocket(this.url);
        this.ws = ws;

        ws.onopen = (): void => {
            console.info("[sync] Connected to", this.url);
            this.startSendTimer();
        };

        ws.onmessage = (event: MessageEvent<string>): void => {
            const msg = JSON.parse(event.data) as ServerMessage;
            this.handleMessage(msg);
        };

        ws.onclose = (): void => {
            this.stopSendTimer();
            if (!this.intentionallyClosed) {
                console.warn("[sync] Connection lost. Reconnecting in", RECONNECT_DELAY_MS, "ms");
                setTimeout(() => this.openSocket(), RECONNECT_DELAY_MS);
            }
        };

        ws.onerror = (err: Event): void => {
            console.error("[sync] WebSocket error", err);
        };
    }

    private handleMessage(msg: ServerMessage): void {
        switch (msg.type) {
            case "welcome": {
                const { peer_id, color, name, peers } = msg as WelcomeMessage;
                console.info("[sync] My peer_id:", peer_id, "color:", name);
                this.onWelcome(peer_id, color, name, peers);
                break;
            }
            case "peer_update": {
                const { peer_id, data, color, name } = msg as PeerUpdateMessage;
                this.onPeerUpdate(peer_id, data, color, name);
                break;
            }
            case "peer_left": {
                const { peer_id } = msg as PeerLeftMessage;
                console.info("[sync] Peer left:", peer_id);
                this.onPeerLeft(peer_id);
                break;
            }
        }
    }

    private startSendTimer(): void {
        this.sendTimer = setInterval(() => {
            if (this.pendingState !== null && this.ws?.readyState === WebSocket.OPEN) {
                const msg: CameraUpdateMessage = {
                    type: "camera_update",
                    data: this.pendingState,
                };
                this.ws.send(JSON.stringify(msg));
                this.pendingState = null;
            }
        }, SEND_INTERVAL_MS);
    }

    private stopSendTimer(): void {
        if (this.sendTimer !== null) {
            clearInterval(this.sendTimer);
            this.sendTimer = null;
        }
    }
}
