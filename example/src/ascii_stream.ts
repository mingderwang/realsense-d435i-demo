import * as fs from "fs";
import * as path from "path";
import { openStream } from "@yourorg/realsense-napi";

// ASCII-art ways to view the depth camera output.
//
//   sudo bun run ascii_stream.ts                 # LIVE animation (camera at 15fps)
//   sudo bun run ascii_stream.ts --animate out   # PLAY saved PPM frames as a movie
//   sudo bun run ascii_stream.ts --file x.ppm    # single frame preview
// common: --cols N  --fps N

const argAfter = (flag: string, fallback: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? Number(process.argv[i + 1])
    : fallback;
};

const COLS = argAfter("--cols", Math.min(100, process.stdout.columns || 100));
const ROWS = Math.max(6, Math.round((COLS * 9) / 16 / 2));
const ANIM_FPS = argAfter("--fps", 8);

const RAMP = [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"];

function toAscii(data: Buffer, cw: number, ch: number, cols = COLS, rows = ROWS): string[] {
  const cellW = cw / cols;
  const cellH = ch / rows;
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor(r * cellH);
    const y1 = Math.max(y0 + 1, Math.floor((r + 1) * cellH));
    let row = "";
    for (let c = 0; c < cols; c++) {
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

function draw(header: string, art: string[]) {
  process.stdout.write("\x1b[H" + header + "\n" + art.join("\n") + "\n");
}

function loadPpm(file: string): { data: Buffer; w: number; h: number } {
  const body = fs.readFileSync(file);
  let p = 0;
  for (let k = 0; k < 3; k++) p = body.indexOf(10, p + 1); // P6\n W H\n 255\n
  const [w, h] = body
    .subarray(0, p)
    .toString()
    .split(/\s+/)
    .map(Number)
    .slice(1, 3);
  return { data: body.subarray(p + 1), w, h };
}

process.stdout.write("\x1b[2J");

const fileIdx = process.argv.indexOf("--file");
if (fileIdx >= 0) {
  const { data, w, h } = loadPpm(process.argv[fileIdx + 1]);
  draw(`ASCII  ${path.basename(process.argv[fileIdx + 1])}  ${w}x${h} -> ${COLS}x${ROWS}`, toAscii(data, w, h));
  process.exit(0);
}

const animIdx = process.argv.indexOf("--animate");
if (animIdx >= 0) {
  const dir = fs.existsSync(process.argv[animIdx + 1])
    ? process.argv[animIdx + 1]
    : "out";
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ppm"))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] ?? 0);
      const nb = Number(b.match(/\d+/)?.[0] ?? 0);
      return na - nb;
    });
  if (files.length === 0) {
    console.error(`no .ppm files in ${dir}/ -- run stream_demo.js --save first`);
    process.exit(1);
  }
  const seq = files.map((f) => ({ f, ...loadPpm(path.join(dir, f)) }));
  console.log(`playing ${seq.length} frames from ${dir}/ at ${ANIM_FPS} fps (Ctrl+C to stop)`);
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      process.stdout.write("\x1b[2J\x1b[H");
      process.exit(0);
    });
  }
  let i = 0;
  setInterval(() => {
    const it = seq[i % seq.length];
    draw(
      `ASCII MOVIE  ${it.f}  ${i % seq.length + 1}/${seq.length}  ${seq.length} frames @ ${ANIM_FPS}fps`,
      toAscii(it.data, it.w, it.h)
    );
    i++;
  }, 1000 / ANIM_FPS);
  // keep the event loop alive and wait forever
  setInterval(() => {}, 1 << 30);
} else {
  let deviceName = "";
  const cam = openStream(
    { depth: { width: 848, height: 480, fps: 10 }, color: { width: 1280, height: 720, fps: 15 } },
    (frame) => {
      if (frame.error) {
        console.error(`\nstream stopped: ${frame.error}`);
        process.exit(1);
      }
      if (frame.device) deviceName = `${frame.device.name} (${frame.device.serial})`;
      draw(
        `ASCII LIVE  frame=${frame.index}  ${deviceName || "warming up..."}  ` +
          `${frame.color.width}x${frame.color.height}->${COLS}x${ROWS}  ` +
          `center=${frame.stats.centerMm.toFixed(0)}mm valid=${frame.stats.validPct.toFixed(0)}% ` +
          `fps=${frame.stats.fps.toFixed(1)}  (Ctrl+C)`,
        toAscii(frame.color.data, frame.color.width, frame.color.height)
      );
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
}