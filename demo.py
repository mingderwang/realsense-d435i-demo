import os
import time

import numpy as np
import pyrealsense2 as rs
from PIL import Image

OUT = "output"
os.makedirs(OUT, exist_ok=True)

pipe = rs.pipeline()
config = rs.config()
config.enable_stream(rs.stream.depth, 640, 480, rs.format.z16, 30)
config.enable_stream(rs.stream.color, 640, 480, rs.format.bgr8, 30)
config.enable_stream(rs.stream.accel, rs.format.motion_xyz32f)
config.enable_stream(rs.stream.gyro, rs.format.motion_xyz32f)

profile = pipe.start(config)
colorizer = rs.colorizer()
align = rs.align(rs.stream.color)

device = profile.get_device()
depth_sensor = profile.get_device().first_depth_sensor()
depth_scale = depth_sensor.get_depth_scale()
serial = device.get_info(rs.camera_info.serial_number)
print(f"Device: {device.get_info(rs.camera_info.name)} serial={serial}")
print(f"Depth scale: {depth_scale:.6f} m")

frames = []
start = time.time()
for _ in range(30):
    frames.append(pipe.wait_for_frames())
elapsed = time.time() - start
print(f"Captured 30 frames in {elapsed:.2f}s ({30/elapsed:.1f} FPS)")

gyro_samples = []
accel_samples = []
for frame in frames:
    if frame.is_gyro_frame():
        gyro_samples.append(frame.get_motion())
    if frame.is_accel_frame():
        accel_samples.append(frame.get_motion())

frame = align.process(frames[-1])
depth = frame.get_depth_frame()
color = frame.get_color_frame()
colorized = colorizer.process(depth)

depth_img = np.asanyarray(depth.get_data())
color_img = np.asanyarray(color.get_data())
vis_img = np.asanyarray(colorized.get_data())

color_rgb = Image.fromarray(color_img[:, :, ::-1])
color_rgb.save(os.path.join(OUT, "color.png"))
Image.fromarray(vis_img).save(os.path.join(OUT, "depth_visual.png"))
depth_img.astype(np.uint16).tofile(os.path.join(OUT, "depth_16bit.raw"))

h, w = depth_img.shape
cy, cx = h // 2, w // 2
center_mm = depth_img[cy, cx] * depth_scale * 1000
print(f"Center distance: {center_mm:.1f} mm")

mask = depth_img > 0
valid = depth_img[mask]
if valid.size:
    print(f"Min / Mean / Max depth: {valid.min()*depth_scale:0.2f} / "
          f"{valid.mean()*depth_scale:0.2f} / {valid.max()*depth_scale:0.2f} m")

nzero = int(np.count_nonzero(depth_img))
print(f"Valid depth pixels: {nzero} / {depth_img.size} ({100*nzero/depth_img.size:.1f}%)")

if gyro_samples:
    g = np.mean(gyro_samples, axis=0)
    print(f"Gyro avg (rad/s): x={g[0]:+.4f} y={g[1]:+.4f} z={g[2]:+.4f} ({len(gyro_samples)} samples)")
if accel_samples:
    a = np.mean(accel_samples, axis=0)
    mag = float(np.linalg.norm(a))
    print(f"Accel avg (m/s²): x={a[0]:+.3f} y={a[1]:+.3f} z={a[2]:+.3f} |g|={mag:.2f} ({len(accel_samples)} samples)")

pipe.stop()
print("Saved: color.png, depth_visual.png, depth_16bit.raw")