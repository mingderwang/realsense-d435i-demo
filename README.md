# realsense-napi

Native **N-API addon** (C++) that wraps the Intel RealSense `librealsense2` SDK so a **TypeScript/Node.js CLI** can capture depth + RGB frames from a D435i with a one-line call.

## Requirements

- macOS (Apple Silicon tested) with the D435i connected via USB
- `librealsense` (2.58.4): `brew install librealsense`
- Node.js ≥ 18

> **macOS note:** camera USB access requires root. Run your program with `sudo`.

## Install & build

```bash
npm install        # installs deps and builds the native .node addon
npm run build      # or: node-gyp rebuild && tsc
```

You get:
- `build/Release/realsense.node` — the C++ native addon
- `dist/` — compiled TS (wrapper, CLI, types)

## Using it from TypeScript

```bash
npm install @yourorg/realsense-napi   # macOS + librealsense 2.58+ required
```

```ts
import { capture, captureSync } from "@yourorg/realsense-napi";

// async (non-blocking, worker thread)
const result = await capture({
  frames: 30,                                   // number of frames to grab
  depth: { width: 848, height: 480, fps: 10 },  // streaming modes
  color: { width: 1280, height: 720, fps: 15 },
});

const { color, depth, stats, device } = result;
console.log(device.name, device.serial);
console.log(`center distance: ${stats.centerMm} mm`);

// raw pixels
const rgb: Buffer = color.data;      // width*height*3 bytes, RGB order
const z16: Buffer = depth.data;      // width*height*2 bytes, uint16 LE
const m = (millimeters: number) => millimeters * depth.scale; // depth units
```

> Full API documentation: https://pikmin-kappa.vercel.app

### Sync version

```ts
const result = captureSync({ frames: 10 }); // blocks the event loop while capturing
```

## API

All options are optional.

```ts
interface CaptureOptions {
  frames?: number;   // frames to average over (default 30, min 1)
  warmup?: number;   // frames to discard before measuring (default 5)
  depth?:  StreamConfig;
  color?:  StreamConfig;
}
interface StreamConfig { width?: number; height?: number; fps?: number; }
```

```ts
interface CaptureResult {
  device: { name: string; serial: string };
  color:  FrameInfo;               // width, height, data: Buffer (RGB8)
  depth:  DepthFrameInfo;          // width, height, data: Buffer (Z16), scale
  stats:  CaptureStats;
}
interface CaptureStats {
  fps: number;        // measured capture rate
  centerMm: number;   // depth at the center pixel (mm)
  validPct: number;   // pixels with valid depth (%)
  minM: number; meanM: number; maxM: number;  // depth range (meters)
}
```

### Functions

| Function      | Returns    | Description                                   |
| ------------- | ---------- | --------------------------------------------- |
| `capture(options?)`   | `Promise<CaptureResult>` | Async capture on a worker thread |
| `captureSync(options?)` | `CaptureResult`         | Blocking capture (same result)   |
| `getVersion()` | `string` | SDK version string               |

## CLI

```bash
npm run build
sudo node dist/cli.js --out captures --frames 30 --depth 848x480@10 --color 1280x720@15
```

Saves a `PPM` (color) and `PGM` (16-bit depth) snapshot to `captures/` and prints device + stats. Run `sudo node dist/cli.js --help` for options.

## Working with the raw buffers

There is **no image decoding** in the addon — you get raw buffers and do whatever you want on the TS side:

```ts
import * as fs from "fs";
import { capture } from "@yourorg/realsense-napi";
import { PNG } from "pngjs";          // e.g. any encoder you like

const { color, depth } = await capture();

// wrap raw RGB into a PNG
const png = new PNG({ width: color.width, height: color.height });
Buffer.from(color.data).copy(png.data);       // rgb -> png synchronizes order
fs.writeFileSync("shot.png", PNG.sync.write(png));
```

Depth is in **16-bit Z16** (mm when `depth.scale` is 0.001). Apply `data[i] * depth.scale` to get meters.

## Notes on this macOS setup

- Stable stream combo: **depth 848×480@10 + color 1280×720@15** (not every mode/fps works)
- The IMU (gyro/accel) is **not accessible on macOS** — not exposed through the addon
- Some mode combos fail with `failed to set power state` right after plug-in; re-run or physically re-plug the camera