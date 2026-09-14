import type {
  CaptureOptions,
  CaptureResult,
  RealsenseNative,
} from "./types";

const native: RealsenseNative = require("../build/Release/realsense.node");

export function capture(options?: CaptureOptions): Promise<CaptureResult> {
  return native.capture(options);
}

export function captureSync(options?: CaptureOptions): CaptureResult {
  return native.captureSync(options);
}

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