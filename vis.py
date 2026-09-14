import numpy as np
from PIL import Image

def read_ppm(path):
    with open(path, "rb") as f:
        raw = f.read()
    tokens = raw.split()
    assert tokens[0] == b"P6"
    w, h, maxv = int(tokens[1]), int(tokens[2]), int(tokens[3])
    header_len = raw.index(tokens[3]) + len(tokens[3])
    while header_len < len(raw) and bytes([raw[header_len]]).isspace():
        header_len += 1
    payload = raw[header_len:]
    arr = np.frombuffer(payload, dtype=np.uint8).reshape(h, w, 3)
    return arr

def read_pgm16(path):
    with open(path, "rb") as f:
        raw = f.read()
    tokens = raw.split()
    assert tokens[0] == b"P5"
    w, h, maxv = int(tokens[1]), int(tokens[2]), int(tokens[3])
    header_len = raw.index(tokens[3]) + len(tokens[3])
    while header_len < len(raw) and bytes([raw[header_len]]).isspace():
        header_len += 1
    payload = raw[header_len:]
    arr = np.frombuffer(payload, dtype=np.uint16).reshape(h, w)
    return arr

JET = np.array([
    [0.00, 0.00, 0.50], [0.00, 0.00, 1.00], [0.00, 0.50, 1.00], [0.00, 1.00, 1.00],
    [0.50, 1.00, 0.50], [1.00, 1.00, 0.00], [1.00, 0.50, 0.00], [1.00, 0.00, 0.00],
    [0.50, 0.00, 0.00],
], dtype=np.float32)

def colormap(depth_m, vmin=0.2, vmax=8.0):
    t = np.clip((depth_m - vmin) / (vmax - vmin), 0, 1)
    scaled = t * (len(JET) - 1)
    i0 = np.floor(scaled).astype(int)
    i1 = np.clip(i0 + 1, 0, len(JET) - 1)
    frac = (scaled - i0)[..., None]
    return (JET[i0] * (1 - frac) + JET[i1] * frac)

color = read_ppm("output/color.ppm")
depth = read_pgm16("output/depth.pgm")

depth_m = depth.astype(np.float32) * 1e-3
rgb = (colormap(depth_m) * 255).astype(np.uint8)
rgb[depth == 0] = [20, 20, 20]

Image.fromarray(color).save("output/color.png")
Image.fromarray(rgb).save("output/depth_jet.png")

ch = color.shape[0]
dh = depth.shape[0]
composite = np.zeros((ch, color.shape[1] + depth.shape[1] + 8, 3), dtype=np.uint8)
composite[:ch, :color.shape[1]] = color
composite[:dh, color.shape[1] + 8:] = rgb
Image.fromarray(composite).save("output/composite.png")

print(f"color  : {color.shape}")
print(f"depth  : {depth.shape}")
print("saved output/color.png, output/depth_jet.png, output/composite.png")