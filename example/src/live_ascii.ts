import { openStream } from "@yourorg/realsense-napi";

// LIVE ASCII camera demo -- streams the D435i and redraws a text-art view
// every frame. Unlike ascii_stream.ts this demo ONLY does live capture;
// there is no ppm playback path. The watermark clock/frame counter prove
// each redraw is a fresh frame from the sensor.
//
//   sudo bun run live_ascii.ts                 # live text art, ~15 fps
//   sudo bun run live_ascii.ts --cols 120
//   sudo bun run live_ascii.ts --cols 80 --skip 2   # redraw every 2nd frame (slower terminals)

const argAfter = (flag: string, fallback: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? Number(process.argv[i + 1])
    : fallback;
};

const COLS = argAfter("--cols", Math.min(110, process.stdout.columns || 110));
const ROWS = Math.max(6, Math.round((COLS * 9) / 16 / 2));
const SKIP = argAfter("--skip", 1);

const RAMP = [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"];

// Fast path: one center-pixel sample per cell. ~2.6k reads/frame vs ~800k
// for box-averaging, so redraws keep up with the 15 fps sensor.
function toAscii(data: Buffer, cw: number, ch: number, cols: number, rows: number): string[] {
  const cellW = cw / cols;
  const cellH = ch / rows;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const y = Math.min(ch - 1, Math.floor((r + 0.5) * cellH));
    let offBase = y * cw * 3;
    let row = "";
    const lum = (x: number) => {
      const o = offBase + x * 3;
      return data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
    };
    for (let c = 0; c < cols; c++) {
      const x = Math.min(cw - 1, Math.floor((c + 0.5) * cellW));
      const idx = Math.floor((lum(x) / 255) * (RAMP.length - 1));
      row += RAMP[idx];
    }
    lines.push(row);
  }
  return lines;
}

const clock = () => new Date().toISOString().slice(11, 19);

process.stdout.write("\x1b[2J");
let shown = 0;
let deviceName = "";
const t0 = Date.now();

const cam = openStream(
  { depth: { width: 848, height: 480, fps: 10 }, color: { width: 1280, height: 720, fps: 15 } },
  (frame) => {
    if (frame.error) {
      console.error(`\nstream stopped: ${frame.error}`);
      process.exit(1);
    }
    if (frame.device) deviceName = `${frame.device.name} (${frame.device.serial})`;
    if (++shown % SKIP !== 0) return;

    const art = toAscii(frame.color.data, frame.color.width, frame.color.height, COLS, ROWS);
    const live =
      `\x1b[1;31mLIVE\x1b[0m  ` +
      `frame=${frame.index}  clock=${clock()}  up=${((Date.now() - t0) / 1000).toFixed(1)}s  ` +
      `${deviceName || "warming up..."}  ` +
      `${frame.color.width}x${frame.color.height}->${COLS}x${ROWS}  ` +
      `center=${frame.stats.centerMm.toFixed(0)}mm valid=${frame.stats.validPct.toFixed(0)}% ` +
      `sensor=${frame.stats.fps.toFixed(1)}fps`;
    process.stdout.write(`\x1b[H${live}\n${art.join("\n")}`);
  }
);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    process.stdout.write("\x1b[2J\x1b[H");
    cam.close();
    console.log("live ascii closed");
    process.exit(0);
  });
}