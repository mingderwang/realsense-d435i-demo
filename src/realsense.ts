import type {
  CaptureOptions,
  CaptureResult,
  NativeStreamSession,
  RealsenseNative,
  RealsenseStream,
  StreamFrame,
  StreamOptions,
} from "./types";

const native: RealsenseNative = require("../build/Release/realsense.node");

/**
 * Captures depth + RGB frames from the RealSense camera on a worker thread.
 *
 * Resolves with raw color/depth buffers and depth statistics, or rejects if
 * the camera cannot be accessed (on macOS, run with `sudo`).
 */
export function capture(options?: CaptureOptions): Promise<CaptureResult> {
  return native.capture(options);
}

/**
 * Blocking variant of {@link capture}. Returns the same result shape but
 * blocks the Node.js event loop for the duration of the capture.
 */
export function captureSync(options?: CaptureOptions): CaptureResult {
  return native.captureSync(options);
}

/**
 * Opens a continuous, frame-by-frame stream.
 *
 * `onFrame` receives each frame at the sensor rate. If your handler is slower
 * than the camera, frames are dropped (never queued) so the stream stays live.
 * A transient camera wedge is recovered automatically; unrecoverable failures
 * arrive as a frame whose `error` field is set, after which the stream stops.
 *
 * ```ts
 * const cam = openStream(
 *   { depth: { width: 848, height: 480, fps: 10 }, color: { width: 1280, height: 720, fps: 15 } },
 *   ({ device, depth, color, stats }) => {
 *     if (device) console.log("camera:", device);
 *     console.log(`#frame depth center=${stats.centerMm.toFixed(0)}mm fps=${stats.fps.toFixed(1)}`);
 *   }
 * );
 * // ...
 * cam.close();
 * ```
 */
export function openStream(
  options: StreamOptions,
  onFrame: (frame: StreamFrame) => void
): RealsenseStream {
  let device: { name: string; serial: string } | null = null;
  let closed = false;
  const nativeSession: NativeStreamSession = new native.StreamSession();
  nativeSession.open(options, (frame: StreamFrame) => {
    if (frame.device && !device) device = frame.device;
    try {
      onFrame(frame);
    } catch (err) {
      // Iterating frames must never kill the native stream loop.
      setImmediate(() => {
        if (!closed) console.error("onFrame threw:", err);
      });
    }
  });
  return {
    get device() {
      return device;
    },
    close() {
      if (closed) return;
      closed = true;
      nativeSession.close();
    },
  };
}

/**
 * Returns the librealsense SDK version the native addon was built against.
 */
export function getVersion(): string {
  return native.getVersion();
}

export type {
  FrameInfo,
  DepthFrameInfo,
  CaptureStats,
  CaptureResult,
  StreamConfig,
  CaptureOptions,
  StreamFrame,
  StreamOptions,
  RealsenseStream,
} from "./types";

export default { capture, captureSync, openStream, getVersion };