/**
 * Application entry point.
 *
 * Wires together:
 *  - Potree viewer (COPC point cloud, elevation coloring)
 *  - SyncClient (WebSocket camera-state broadcast)
 *  - PeerRenderer (THREE.js view cones for each connected peer)
 */

import * as THREE from "three";
import { LoadingProgress } from "./loading-progress.js";
import { PeerRenderer } from "./peer-renderer.js";
import { SyncClient } from "./sync-client.js";
import type { CameraState } from "./types.js";

const COPC_URL = "https://s3.amazonaws.com/hobu-lidar/sofi.copc.laz";

/** Read camera state directly from Potree's view object. */
function readCameraState(view: PotreeView): CameraState {
    return {
        position_x: view.position.x,
        position_y: view.position.y,
        position_z: view.position.z,
        direction_x: view.direction.x,
        direction_y: view.direction.y,
        direction_z: view.direction.z,
    };
}

function init(): void {
    const progress = new LoadingProgress();
    progress.startMetadataPhase();

    const renderArea = document.getElementById("potree_render_area");
    if (!renderArea) {
        throw new Error("#potree_render_area not found in DOM");
    }

    // --- Potree viewer setup ---
    const viewer = new Potree.Viewer(renderArea);
    viewer.setEDLEnabled(true);
    viewer.setFOV(60);
    viewer.setPointBudget(2_000_000);
    viewer.loadGUI(() => {
        viewer.setLanguage("en");
    });

    // Cast the overlay scene to THREE.Scene so PeerRenderer can type-check it
    const overlayScene = viewer.scene.scene as THREE.Scene;
    const peerRenderer = new PeerRenderer(
        overlayScene,
        document.getElementById("peer-overlay")!,
        document.getElementById("peer-count")!,
        document.getElementById("peer-list")!,
    );

    // --- WebSocket sync ---
    const wsUrl = `ws://${window.location.host}/ws`;
    const sync = new SyncClient(
        wsUrl,
        (_myId, _myColor, _myName, peers) => {
            // Populate visuals for peers already in the session when we join
            for (const [id, peerInfo] of Object.entries(peers)) {
                peerRenderer.updatePeer(id, peerInfo.camera_state, peerInfo.color, peerInfo.name);
            }
        },
        (id, state, color, name) => peerRenderer.updatePeer(id, state, color, name),
        (id) => peerRenderer.removePeer(id),
    );
    sync.connect();

    // --- Load point cloud ---
    progress.setMetadataStatus("Connecting to S3 and parsing COPC header…");
    Potree.loadPointCloud(COPC_URL, "SoFi Stadium", (e) => {
        const { pointcloud } = e;
        pointcloud.material.size = 1;
        pointcloud.material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
        pointcloud.material.shape = Potree.PointShape.SQUARE;
        // Apply elevation coloring immediately on load (not a manual toggle)
        pointcloud.material.activeAttributeName = "elevation";
        viewer.scene.addPointCloud(pointcloud);
        viewer.fitToScreen();
        console.info("[viewer] SoFi Stadium loaded — elevation coloring active");
        // Metadata loaded; switch to tile-streaming progress indicator
        progress.startStreamingPhase();
    });

    // --- Camera polling at 0.001 Hz ---
    setInterval(() => {
        sync.queueCameraState(readCameraState(viewer.scene.view));
    }, 1);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}