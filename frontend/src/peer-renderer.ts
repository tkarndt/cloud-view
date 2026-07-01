/**
 * Renders a wireframe view cone for each connected peer in Potree's overlay
 * Three.js scene.
 *
 * Geometry is built in local space pointing along +Z and rotated to match the
 * peer's reported view direction on every update.
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
     * @param state  Current camera position and normalised view direction.
     */
    updatePeer(peerId: string, state: CameraState): void {
        const position = new THREE.Vector3(state.position_x, state.position_y, state.position_z);
        const direction = new THREE.Vector3(
            state.direction_x,
            state.direction_y,
            state.direction_z,
        ).normalize();

        let visual = this.peers.get(peerId);
        if (!visual) {
            visual = this.createVisual(peerId);
            this.peers.set(peerId, visual);
            this.scene.add(visual.group);
            console.debug(`[peers] Created view cone for peer ${peerId.slice(0, 8)}`);
        }

        visual.group.position.copy(position);
        this.orientGroup(visual.group, direction);
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

    private createVisual(peerId: string): PeerVisual {
        const color = PEER_COLORS[this.colorCounter % PEER_COLORS.length]!;
        this.colorCounter++;

        const group = new THREE.Group();
        group.name = `peer-${peerId.slice(0, 8)}`;

        const eyeSphere = new THREE.Mesh(
            new THREE.SphereGeometry(EYE_SPHERE_RADIUS, 8, 8),
            new THREE.MeshBasicMaterial({ color }),
        );
        group.add(eyeSphere);

        group.add(buildConeLines(color));

        return { group, cone: group.children[1] as THREE.LineSegments, eyeSphere };
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