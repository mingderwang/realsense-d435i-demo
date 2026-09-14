/**
 * A single 2D image frame with raw pixel data.
 */
export interface FrameInfo {
  /** Frame width in pixels. */
  width: number;
  /** Frame height in pixels. */
  height: number;
  /**
   * Raw pixel bytes.
   * - color: `width * height * 3` bytes, RGB order
   * - depth: `width * height * 2` bytes, little-endian uint16 Z16
   */
  data: Buffer;
}

/**
 * A depth frame. Each 16-bit sample is in `scale` units (usually mm),
 * where `0` means "no data". Convert to meters with `value * scale`.
 */
export interface DepthFrameInfo extends FrameInfo {
  /** Depth units in meters per 16-bit count (typically `0.001`). */
  scale: number;
}

/**
 * Depth/throughput statistics measured over the captured frames.
 */
export interface CaptureStats {
  /** Measured capture rate in frames per second. */
  fps: number;
  /** Depth (mm) of the center pixel of the last depth frame. */
  centerMm: number;
  /** Percentage of depth pixels with a valid (non-zero) reading. */
  validPct: number;
  /** Minimum depth over the frame, meters. */
  minM: number;
  /** Mean depth over valid pixels, meters. */
  meanM: number;
  /** Maximum depth over the frame, meters. */
  maxM: number;
}

/**
 * The complete result of a capture.
 */
export interface CaptureResult {
  /** Camera identity information. */
  device: { name: string; serial: string };
  /** RGB color frame. */
  color: FrameInfo;
  /** Depth frame with its scale. */
  depth: DepthFrameInfo;
  /** Statistics gathered during the capture. */
  stats: CaptureStats;
}

/**
 * Stream resolution/framerate selection.
 *
 * See the macOS notes in the README:
 * the supported profile is depth 848x480@10 + color 1280x720@15.
 */
export interface StreamConfig {
  /** Frame width in pixels. */
  width?: number;
  /** Frame height in pixels. */
  height?: number;
  /** Frames per second. */
  fps?: number;
}

/**
 * Options for {@link RealsenseNative.capture}.
 */
export interface CaptureOptions {
  /** Number of frames to grab and average over (default 30, min 1). */
  frames?: number;
  /** Number of startup frames to discard before measuring (default 5). */
  warmup?: number;
  /** Depth stream configuration. */
  depth?: StreamConfig;
  /** Color stream configuration. */
  color?: StreamConfig;
}

/**
 * The shape of the native addon exports.
 */
export interface RealsenseNative {
  /** Async capture running on a worker thread. */
  capture(options?: CaptureOptions): Promise<CaptureResult>;
  /** Blocking capture. */
  captureSync(options?: CaptureOptions): CaptureResult;
  /** SDK version string. */
  getVersion(): string;
}