/**
 * Ambient type declarations for the window.Potree global set by potree.js.
 *
 * These are structural types only — they cover the API surface used by this
 * application.  Potree's full API is larger.
 */

interface PotreeView {
    /** Camera position in world space (THREE.Vector3). */
    readonly position: { x: number; y: number; z: number };
    /** Vertical angle in radians (elevation). */
    pitch: number;
    /** Horizontal angle in radians (azimuth). */
    yaw: number;
    /** Distance from camera to the orbit pivot (metres). */
    radius: number;
}

interface PotreePointCloudMaterial {
    size: number;
    pointSizeType: number;
    shape: number;
    /** E.g. "elevation", "rgb", "intensity". */
    activeAttributeName: string;
}

interface PotreePointCloud {
    readonly material: PotreePointCloudMaterial;
}

interface PotreeLoadEvent {
    readonly pointcloud: PotreePointCloud;
    readonly type: string;
}

interface PotreeScene {
    /** Potree camera controller. */
    readonly view: PotreeView;
    /** The underlying THREE.Scene used for overlays and annotations. */
    readonly scene: object;
    addPointCloud(pointcloud: PotreePointCloud): void;
}

interface PotreeViewer {
    readonly scene: PotreeScene;
    setEDLEnabled(enabled: boolean): void;
    setFOV(fov: number): void;
    setPointBudget(budget: number): void;
    fitToScreen(): void;
    loadGUI(callback: () => void): void;
    setLanguage(lang: string): void;
}

interface PotreeLib {
    Viewer: new (element: HTMLElement) => PotreeViewer;
    loadPointCloud(
        url: string,
        name: string,
        callback: (event: PotreeLoadEvent) => void,
    ): void;
    readonly PointSizeType: { ADAPTIVE: number; FIXED: number };
    readonly PointShape: { SQUARE: number; CIRCLE: number };
}

declare const Potree: PotreeLib;
