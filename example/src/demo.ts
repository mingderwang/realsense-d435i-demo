import * as fs from "fs";
import * as path from "path";
import {
  capture,
  getVersion,
} from "@yourorg/realsense-napi";

async function main() {
  console.log(`librealsense: ${getVersion()}`);
  if (process.getuid && process.getuid() !== 0) {
    console.warn("macOS needs root for camera USB access: use sudo node dist/demo.js");
  }

  const result = await capture({
    frames: 30,
    depth: { width: 848, height: 480, fps: 10 },
    color: { width: 1280, height: 720, fps: 15 },
  });

  fs.mkdirSync("out", { recursive: true });

  const ppm = Buffer.concat([
    Buffer.from(`P6\n${result.color.width} ${result.color.height}\n255\n`),
    result.color.data,
  ]);
  fs.writeFileSync(path.join("out", "demo.ppm"), ppm);

  const pgm = Buffer.concat([
    Buffer.from(`P5\n${result.depth.width} ${result.depth.height}\n65535\n`),
    result.depth.data,
  ]);
  fs.writeFileSync(path.join("out", "demo.pgm"), pgm);

  const { stats, device, depth } = result;
  console.log(`device : ${device.name} (${device.serial})`);
  console.log(`color  : ${result.color.width}x${result.color.height} -> out/demo.ppm`);
  console.log(`depth  : ${depth.width}x${depth.height} (scale ${depth.scale}) -> out/demo.pgm`);
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