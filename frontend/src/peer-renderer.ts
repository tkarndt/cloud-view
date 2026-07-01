/**
 * Renders a wireframe view cone for each connected peer in Potree's overlay
 * Three.js scene, and maintains a DOM overlay listing all connected peers.
 *
 * Colors and names are assigned by the backend and arrive with each message,
 * so all clients display the same color for the same peer.
 *
 * Geometry is built in local space pointing along +Z and rotated to match the
 * peer's reported view direction on every update.
 */

import * as THREE from "three";
import type { CameraState } from "./types.js";

/** Matches viewer.setFOV(60) in main.ts. */
const VERTICAL_FOV_RADIANS = Math.PI / 3;
const CONE_LENGTH = 100;
const CONE_BASE_RADIUS = Math.tan(VERTICAL_FOV_RADIANS / 2) * CONE_LENGTH;
/** Number of line segments used to approximate the base circle. */
const RING_SEGMENTS = 32;
/** Number of lines drawn from apex to the base ring. */
const SPOKE_COUNT = 8;
const EYE_SPHERE_RADIUS = 3;

const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Fallback when direction is parallel to world-up (looking straight up/down). */
const WORLD_FORWARD = new THREE.Vector3(0, 0, 1);

interface PeerVisual {
    group: THREE.Group;
    cone: THREE.LineSegments;
    eyeSphere: THREE.Mesh;
    listItem: HTMLLIElement;
}

export class PeerRenderer {
    private readonly peers = new Map<string, PeerVisual>();

    /**
     * @param scene             The THREE.Scene that Potree uses for overlays.
     * @param overlayElement    The `#peer-overlay` container (shown/hidden).
     * @param peerCountElement  The element whose text shows the peer count.
     * @param peerListElement   The `<ul>` that receives one `<li>` per peer.
     */
    constructor(
        private readonly scene: THREE.Scene,
        private readonly overlayElement: HTMLElement,
        private readonly peerCountElement: HTMLElement,
        private readonly peerListElement: HTMLElement,
    ) {}

    /**
     * Create or update the view-cone visual and overlay entry for a peer.
     *
     * @param peerId Stable peer identifier.
     * @param state  Current camera position and normalised view direction.
     * @param color  CSS hex color assigned by the backend, e.g. `"#ff4444"`.
     * @param name   Human-readable color name assigned by the backend.
     */
    updatePeer(peerId: string, state: CameraState, color: string, name: string): void {
        const position = new THREE.Vector3(state.position_x, state.position_y, state.position_z);
        const direction = new THREE.Vector3(
            state.direction_x,
            state.direction_y,
            state.direction_z,
        ).normalize();

        let visual = this.peers.get(peerId);
        if (!visual) {
            visual = this.createVisual(peerId, color, name);
            this.peers.set(peerId, visual);
            this.scene.add(visual.group);
            this.refreshOverlay();
            console.debug(`[peers] Created view cone for peer ${peerId.slice(0, 8)} (${name})`);
        }

        visual.group.position.copy(position);
        this.orientGroup(visual.group, direction);
    }

    /**
     * Remove the visual and overlay entry for a peer that has disconnected.
     *
     * @param peerId The peer to remove.
     */
    removePeer(peerId: string): void {
        const visual = this.peers.get(peerId);
        if (visual) {
            this.scene.remove(visual.group);
            visual.listItem.remove();
            this.peers.delete(peerId);
            this.refreshOverlay();
            console.debug(`[peers] Removed view cone for peer ${peerId.slice(0, 8)}`);
        }
    }

    private createVisual(peerId: string, color: string, name: string): PeerVisual {
        const threeColor = parseInt(color.slice(1), 16);

        const group = new THREE.Group();
        group.name = `peer-${peerId.slice(0, 8)}`;

        const eyeSphere = new THREE.Mesh(
            new THREE.SphereGeometry(EYE_SPHERE_RADIUS, 8, 8),
            new THREE.MeshBasicMaterial({ color: threeColor }),
        );
        group.add(eyeSphere);

        const cone = buildConeLines(threeColor);
        group.add(cone);

        const listItem = this.createListItem(peerId, color, name);

        return { group, cone, eyeSphere, listItem };
    }

    private createListItem(peerId: string, color: string, name: string): HTMLLIElement {
        const listItem = document.createElement("li");
        listItem.className = "peer-list-item";

        const dot = document.createElement("span");
        dot.className = "peer-color-dot";
        dot.style.background = color;

        const label = document.createElement("span");
        label.textContent = `${name} · ${peerId.slice(0, 8)}`;

        listItem.append(dot, label);
        this.peerListElement.append(listItem);
        return listItem;
    }

    /** Show/hide the overlay and update the peer count text. */
    private refreshOverlay(): void {
        const count = this.peers.size;
        this.overlayElement.style.display = count > 0 ? "flex" : "none";
        this.peerCountElement.textContent =
            count === 1 ? "1 peer connected" : `${count} peers connected`;
    }

    /**
     * Rotate group so its local +Z aligns with direction, with roll locked to
     * world-up.  Builds an explicit orthonormal basis instead of using
     * setFromUnitVectors, which leaves roll undefined (shortest-arc only).
     */
    private orientGroup(group: THREE.Group, direction: THREE.Vector3): void {
        const zAxis = direction.clone().normalize();

        // When looking straight up or down, world-up is parallel to zAxis and
        // cannot serve as the right-vector seed — fall back to world-forward.
        const upReference = Math.abs(zAxis.dot(WORLD_UP)) > 0.9999 ? WORLD_FORWARD : WORLD_UP;

        const xAxis = new THREE.Vector3().crossVectors(upReference, zAxis).normalize();
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);

        group.setRotationFromMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    }
}

/**
 * Build a wireframe cone pointing in +Z: a circular base ring plus evenly
 * spaced spokes from the apex to the ring.
 *
 * Segments: RING_SEGMENTS (ring) + SPOKE_COUNT (spokes)
 */
function buildConeLines(color: number): THREE.LineSegments {
    const apex = new THREE.Vector3(0, 0, 0);

    const ringPoints: THREE.Vector3[] = Array.from({ length: RING_SEGMENTS }, (_, index) => {
        const angle = (index / RING_SEGMENTS) * Math.PI * 2;
        return new THREE.Vector3(
            Math.cos(angle) * CONE_BASE_RADIUS,
            Math.sin(angle) * CONE_BASE_RADIUS,
            CONE_LENGTH,
        );
    });

    const points: THREE.Vector3[] = [];

    // Base ring: consecutive pairs close the loop
    for (let index = 0; index < RING_SEGMENTS; index++) {
        points.push(ringPoints[index]!, ringPoints[(index + 1) % RING_SEGMENTS]!);
    }

    // Spokes from apex to evenly spaced points on the ring
    for (let index = 0; index < SPOKE_COUNT; index++) {
        const ringIndex = Math.round((index / SPOKE_COUNT) * RING_SEGMENTS) % RING_SEGMENTS;
        points.push(apex, ringPoints[ringIndex]!);
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
    return new THREE.LineSegments(geometry, material);
}