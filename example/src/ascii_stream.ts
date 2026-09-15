import * as fs from "fs";
import { openStream } from "@yourorg/realsense-napi";

// Live ASCII-art visualization of the depth camera.
//
//   sudo bun run ascii_stream.ts              # fit-to-terminal ascii video
//   sudo bun run ascii_stream.ts --cols 120   # force width (rows follow 16:9)
//
// The camera streams its proven profile (depth 848x480@10 + color
// 1280x720@15); each RGB frame is box-downsampled to a low-res grid and
// mapped to a brightness ramp, then redrawn over itself in the terminal.

const argAfter = (flag: string, fallback: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const COLS = argAfter("--cols", Math.min(100, process.stdout.columns || 100));
const ROWS = Math.max(6, Math.round((COLS * 9) / 16 / 2)); // chars are ~2x as tall as wide
const FRAME_SKIP = 1; // show every Nth frame (heavy terminals: raise it)

const RAMP = [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"];

function toAscii(data: Buffer, cw: number, ch: number): string[] {
  const cellW = cw / COLS;
  const cellH = ch / ROWS;
  const lines: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    const y0 = Math.floor(r * cellH);
    const y1 = Math.max(y0 + 1, Math.floor((r + 1) * cellH));
    let row = "";
    for (let c = 0; c < COLS; c++) {
      const x0 = Math.floor(c * cellW);
      const x1 = Math.max(x0 + 1, Math.floor((c + 1) * cellW));
      let lum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        let off = (y * cw + x0) * 3;
        for (let x = x0; x < x1; x++, off += 3) {
          lum += data[off] * 0.299 + data[off + 1] * 0.587 + data[off + 2] * 0.114;
          n++;
        }
      }
      const idx = n > 0 ? Math.floor(((lum / n) / 255) * (RAMP.length - 1)) : 0;
      row += RAMP[idx];
    }
    lines.push(row);
  }
  return lines;
}

process.stdout.write("\x1b[2J"); // clear once
let shown = 0;
let deviceName = "";

const cam = openStream(
  { depth: { width: 848, height: 480, fps: 10 }, color: { width: 1280, height: 720, fps: 15 } },
  (frame) => {
    if (frame.error) {
      console.error(`\nstream stopped: ${frame.error}`);
      process.exit(1);
    }
    if (frame.device) deviceName = `${frame.device.name} (${frame.device.serial})`;
    if (++shown % FRAME_SKIP !== 0) return;

    const art = toAscii(frame.color.data, frame.color.width, frame.color.height);
    const header =
      `ASCII REALSENSE  ${deviceName || "warming up..."}  ` +
      `${frame.color.width}x${frame.color.height} -> ${COLS}x${ROWS} chars  ` +
      `center=${frame.stats.centerMm.toFixed(0)}mm  valid=${frame.stats.validPct.toFixed(0)}%  ` +
      `fps=${frame.stats.fps.toFixed(1)}  (Ctrl+C to stop)`;

    process.stdout.write("\x1b[H" + header + "\n" + art.join("\n") + "\n");
  }
);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    process.stdout.write("\x1b[2J\x1b[H");
    cam.close();
    console.log("ascii stream closed");
    process.exit(0);
  });
}

// Optional: render a saved PPM instead of live capture -- useful to verify.
//   sudo bun run ascii_stream.ts --file out/stream-000060.ppm --cols 80
const fileIdx = process.argv.indexOf("--file");
if (fileIdx >= 0) {
  const body = fs.readFileSync(process.argv[fileIdx + 1]);
  let p = 0;
  for (let k = 0; k < 3; k++) p = body.indexOf(10, p + 1); // P6\n W H\n 255\n
  const [w, h] = body.subarray(0, p).toString().split(/\s+/).slice(1, 3).map(Number);
  const art = toAscii(body.subarray(p + 1), w, h);
  process.stdout.write("\x1b[2J\x1b[H" + art.join("\n") + "\n");
  cam.close();
  process.exit(0);
}