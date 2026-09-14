import type {
  CaptureOptions,
  CaptureResult,
  RealsenseNative,
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
} from "./types";

export default { capture, captureSync, getVersion };