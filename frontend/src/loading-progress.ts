/**
 * Two-phase loading progress UI for the COPC point cloud.
 *
 * Phase 1 — metadata: full-screen overlay with spinner (shown until
 *   Potree.loadPointCloud fires its callback).
 *
 * Phase 2 — tile streaming: compact pill at the bottom that tracks
 *   active network requests in real time and auto-hides when idle.
 *
 * Network tracking works by patching XMLHttpRequest.prototype.send and
 * window.fetch.  Both are resolved dynamically at call time, so the patch
 * catches Potree's tile fetches even though Potree is already loaded when
 * this module runs.
 */

const IDLE_HIDE_DELAY_MS = 2_000;

/**
 * Monkey-patch XHR and fetch to count pending requests.
 * The callback is invoked every time the count changes.
 */
function trackRequests(onChange: (pending: number) => void): void {
    let pending = 0;

    const inc = (): void => onChange(++pending);
    const dec = (): void => {
        pending = Math.max(0, pending - 1);
        onChange(pending);
    };

    // Patch the shared prototype — affects all existing and future XHR instances.
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (
        this: XMLHttpRequest,
        body?: Document | XMLHttpRequestBodyInit | null,
    ): void {
        inc();
        this.addEventListener("loadend", dec, { once: true });
        originalSend.call(this, body);
    };

    // Patch global fetch.
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args: Parameters<typeof fetch>): Promise<Response> => {
        inc();
        return originalFetch(...args).finally(dec);
    };
}

export class LoadingProgress {
    private readonly overlay: HTMLElement;
    private readonly overlayStatus: HTMLElement;
    private readonly tileBar: HTMLElement;
    private readonly tileCount: HTMLElement;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingCount = 0;
    private streaming = false;

    constructor() {
        this.overlay = this.el("loading-overlay");
        this.overlayStatus = this.el("loading-status");
        this.tileBar = this.el("tile-progress");
        this.tileCount = this.el("tile-count");

        trackRequests((count) => {
            this.pendingCount = count;
            if (this.streaming) this.refreshTileBar();
        });
    }

    /** Call before Potree.loadPointCloud — shows the full-screen overlay. */
    startMetadataPhase(): void {
        this.overlay.style.display = "flex";
    }

    /** Update the overlay status text during the metadata phase. */
    setMetadataStatus(text: string): void {
        this.overlayStatus.textContent = text;
    }

    /**
     * Call inside the loadPointCloud callback — fades the overlay out and
     * switches to the compact tile-streaming indicator.
     */
    startStreamingPhase(): void {
        this.streaming = true;

        this.overlay.style.opacity = "0";
        setTimeout(() => {
            this.overlay.style.display = "none";
        }, 500);

        this.tileBar.style.display = "flex";
        this.tileBar.style.opacity = "1";
        this.refreshTileBar();
    }

    private refreshTileBar(): void {
        if (this.hideTimer !== null) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        if (this.pendingCount > 0) {
            this.tileCount.textContent = String(this.pendingCount);
            this.tileBar.dataset["state"] = "loading";
            this.tileBar.style.opacity = "1";
        } else {
            this.tileBar.dataset["state"] = "ready";
            this.tileCount.textContent = "";
            this.hideTimer = setTimeout(() => {
                this.tileBar.style.opacity = "0";
                setTimeout(() => {
                    this.tileBar.style.display = "none";
                }, 500);
            }, IDLE_HIDE_DELAY_MS);
        }
    }

    private el(id: string): HTMLElement {
        const el = document.getElementById(id);
        if (!el) throw new Error(`#${id} not found in DOM`);
        return el;
    }
}
