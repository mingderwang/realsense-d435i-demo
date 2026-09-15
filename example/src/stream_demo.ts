import * as fs from "fs";
import * as path from "path";
import { openStream } from "@yourorg/realsense-napi";

// Live depth+RGB stream with per-frame device/rate statistics.
// Designed for AI visualization: each frame arrives as fast as the sensor
// produces it; slow handlers automatically drop frames instead of queuing.
//
//   sudo bun run stream_demo.ts        # live view (Ctrl+C to stop)
//   sudo bun run stream_demo.ts --save # also save a PPM/PGM every 60 frames

const saveEvery = process.argv.includes("--save") ? 60 : 0;

const cam = openStream(
  {
    depth: { width: 848, height: 480, fps: 10 },
    color: { width: 1280, height: 720, fps: 15 },
  },
  (frame) => {
    if (frame.error) {
      console.error(`stream stopped: ${frame.error}`);
      process.exit(1);
    }

    if (frame.device) {
      console.log(
        `device : ${frame.device.name} (${frame.device.serial}) — streaming, Ctrl+C to stop`
      );
    }

    const line =
      `#${String(frame.index).padStart(4)} ` +
      `${frame.color.width}x${frame.color.height} RGB, ` +
      `${frame.depth.width}x${frame.depth.height} Z16 ` +
      `center=${frame.stats.centerMm.toFixed(0).padStart(4)}mm ` +
      `valid=${frame.stats.validPct.toFixed(0)}% ` +
      `fps=${frame.stats.fps.toFixed(1)} ` +
      `[min=${frame.stats.minM.toFixed(2)} mean=${frame.stats.meanM.toFixed(2)} max=${frame.stats.maxM.toFixed(1)}m]`;
    process.stdout.write(`\r${line}\x1b[K`);

    if (saveEvery > 0 && frame.index % saveEvery === 0) {
      fs.mkdirSync("out", { recursive: true });
      const tag = String(frame.index).padStart(6, "0");
      const colorPpm = Buffer.concat([
        Buffer.from(`P6\n${frame.color.width} ${frame.color.height}\n255\n`),
        frame.color.data,
      ]);
      const depthPgm = Buffer.concat([
        Buffer.from(`P5\n${frame.depth.width} ${frame.depth.height}\n65535\n`),
        frame.depth.data,
      ]);
      fs.writeFileSync(path.join("out", `stream-${tag}.ppm`), colorPpm);
      fs.writeFileSync(path.join("out", `stream-${tag}.pgm`), depthPgm);
    }
  }
);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    process.stdout.write("\n");
    cam.close();
    console.log(`closed after ${cam.device ? "streaming" : "open"}; saved frames in out/ (if --save)`);
    process.exit(0);
  });
}