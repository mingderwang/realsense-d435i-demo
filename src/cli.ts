import * as fs from "fs";
import * as path from "path";
import { capture, getVersion } from "./realsense";

interface CliOptions {
  out: string;
  frames: number;
  depth?: [number, number, number];
  color?: [number, number, number];
}

function parseSize(arg: string): [number, number, number] {
  const m = /^(\d+)x(\d+)(?:@(\d+))?$/.exec(arg);
  if (!m) throw new Error(`bad size "${arg}", expected WxH[@FPS]`);
  return [Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0];
}

function avg(args: string[]): CliOptions {
  const o: CliOptions = { out: "captures", frames: 30 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out") o.out = args[++i];
    else if (a === "--frames") o.frames = Number(args[++i]);
    else if (a === "--depth") o.depth = parseSize(args[++i]);
    else if (a === "--color") o.color = parseSize(args[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(
        "usage: realsense [--out DIR] [--frames N] [--depth WxH[@FPS]] [--color WxH[@FPS]]"
      );
      process.exit(0);
    } else if (a.startsWith("--")) {
      throw new Error(`unknown option: ${a}`);
    }
  }
  return o;
}

function toCfg(sz?: [number, number, number]) {
  if (!sz) return undefined;
  const [width, height, fps] = sz;
  return { width, height, ...(fps ? { fps } : {}) };
}

async function main() {
  console.log(`librealsense: ${getVersion()}`);
  const opt = avg(process.argv.slice(2));

  if (process.getuid && process.getuid() !== 0) {
    console.warn(
      "Warning: on macOS camera USB access needs root. Re-run with: sudo node dist/cli.js"
    );
  }

  const result = await capture({
    frames: opt.frames,
    depth: toCfg(opt.depth),
    color: toCfg(opt.color),
  });

  const dir = path.resolve(opt.out);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const colorPath = path.join(dir, `${stamp}-${result.color.width}x${result.color.height}.ppm`);
  const depthPath = path.join(dir, `${stamp}-${result.depth.width}x${result.depth.height}.pgm`);

  const ppm = Buffer.concat([
    Buffer.from(`P6\n${result.color.width} ${result.color.height}\n255\n`),
    result.color.data,
  ]);
  fs.writeFileSync(colorPath, ppm);

  const pgm = Buffer.concat([
    Buffer.from(`P5\n${result.depth.width} ${result.depth.height}\n65535\n`),
    result.depth.data,
  ]);
  fs.writeFileSync(depthPath, pgm);

  const { stats, device } = result;
  console.log(`device : ${device.name} (${device.serial})`);
  console.log(`color  : ${result.color.width}x${result.color.height} RGB -> ${colorPath}`);
  console.log(`depth  : ${result.depth.width}x${result.depth.height} Z16 -> ${depthPath}`);
  console.log(`rate   : ${stats.fps.toFixed(1)} fps`);
  console.log(`center : ${stats.centerMm.toFixed(1)} mm`);
  console.log(
    `depth  : min=${stats.minM.toFixed(2)}m mean=${stats.meanM.toFixed(2)}m max=${stats.maxM.toFixed(2)}m valid=${stats.validPct.toFixed(1)}%`
  );
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});