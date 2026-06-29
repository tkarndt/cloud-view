/**
 * Renders a view-cone (eye sphere + directional arrow) for each connected peer
 * in Potree's overlay Three.js scene.
 *
 * Each peer gets a stable colour derived from its insertion order.  The arrow
 * is sized relative to the peer's camera-to-target distance so it stays legible
 * at any zoom level.
 */

import * as THREE from "three";
import type { CameraState } from "./types.js";

const PEER_COLORS: number[] = [
    0xff4444, // red
    0x44cc44, // green
    0x4488ff, // blue
    0xffcc00, // yellow
    0xff44ff, // magenta
    0x00cccc, // cyan
];

interface PeerVisual {
    group: THREE.Group;
    arrow: THREE.ArrowHelper;
    eyeMesh: THREE.Mesh;
}

export class PeerRenderer {
    private readonly peers = new Map<string, PeerVisual>();
    private colorCounter = 0;

    /**
     * @param scene The THREE.Scene that Potree uses for overlays
     *              (typically `viewer.scene.scene`).
     */
    constructor(private readonly scene: THREE.Scene) {}

    /**
     * Create or update the view-cone visual for a peer.
     *
     * @param peerId Stable peer identifier.
     * @param state  Current camera position and look-at target.
     */
    updatePeer(peerId: string, state: CameraState): void {
        const position = new THREE.Vector3(state.position_x, state.position_y, state.position_z);
        const target = new THREE.Vector3(state.target_x, state.target_y, state.target_z);
        const direction = new THREE.Vector3().subVectors(target, position).normalize();

        // Scale the arrow to 30% of the orbit radius, clamped to a visible range
        const orbitRadius = position.distanceTo(target);
        const arrowLength = Math.min(Math.max(orbitRadius * 0.3, 3), 100);

        let visual = this.peers.get(peerId);
        if (!visual) {
            visual = this.createVisual(peerId, arrowLength);
            this.peers.set(peerId, visual);
            this.scene.add(visual.group);
            console.debug(`[peers] Created view cone for peer ${peerId.slice(0, 8)}`);
        }

        visual.group.position.copy(position);
        visual.arrow.setDirection(direction);
        visual.arrow.setLength(arrowLength, arrowLength * 0.25, arrowLength * 0.12);

        // Scale eye sphere proportionally
        const eyeRadius = arrowLength * 0.08;
        visual.eyeMesh.scale.setScalar(eyeRadius);
    }

    /**
     * Remove the visual for a peer that has disconnected.
     *
     * @param peerId The peer to remove.
     */
    removePeer(peerId: string): void {
        const visual = this.peers.get(peerId);
        if (visual) {
            this.scene.remove(visual.group);
            this.peers.delete(peerId);
            console.debug(`[peers] Removed view cone for peer ${peerId.slice(0, 8)}`);
        }
    }

    private createVisual(peerId: string, initialLength: number): PeerVisual {
        const color = PEER_COLORS[this.colorCounter % PEER_COLORS.length]!;
        this.colorCounter++;

        const group = new THREE.Group();
        group.name = `peer-${peerId.slice(0, 8)}`;

        // Unit sphere at the eye; scaled dynamically on each update
        const eyeGeo = new THREE.SphereGeometry(1, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color });
        const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
        group.add(eyeMesh);

        // Arrow pointing from eye toward look-at target
        const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1), // placeholder; updated immediately
            new THREE.Vector3(0, 0, 0), // origin relative to group
            initialLength,
            color,
            initialLength * 0.25,
            initialLength * 0.12,
        );
        group.add(arrow);

        return { group, arrow, eyeMesh };
    }
}
