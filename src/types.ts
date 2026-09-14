export interface FrameInfo {
  width: number;
  height: number;
  data: Buffer;
}

export interface DepthFrameInfo extends FrameInfo {
  scale: number;
}

export interface CaptureStats {
  fps: number;
  centerMm: number;
  validPct: number;
  minM: number;
  meanM: number;
  maxM: number;
}

export interface CaptureResult {
  device: { name: string; serial: string };
  color: FrameInfo;
  depth: DepthFrameInfo;
  stats: CaptureStats;
}

export interface StreamConfig {
  width?: number;
  height?: number;
  fps?: number;
}

export interface CaptureOptions {
  frames?: number;
  warmup?: number;
  depth?: StreamConfig;
  color?: StreamConfig;
}

export interface RealsenseNative {
  capture(options?: CaptureOptions): Promise<CaptureResult>;
  captureSync(options?: CaptureOptions): CaptureResult;
  getVersion(): string;
}