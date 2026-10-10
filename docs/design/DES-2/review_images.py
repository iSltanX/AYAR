"""DES-2 — صور المراجعة: محاكاة عمى الألوان وتكبير البكسل.

يحاكي عمى الألوان على لقطات PNG بمصفوفات Machado وOliveira وFernandes (2009) بشدة 1.0 في RGB الخطي،
ويكبّر شريط الرموز بحجم 12 الفعلي بالجار الأقرب (بلا تنعيم) لمراجعة البكسل.

الاستخدام:
  python3 -I docs/design/DES-2/review_images.py cvd <in.png> <out-dir> [protanopia deuteranopia tritanopia]
  python3 -I docs/design/DES-2/review_images.py zoom <in.png> <out.png> <x> <y> <w> <h> <factor>
"""
import os
import site
import sys

# يُشغَّل بـ python3 -I (عزل عن المجلد الحالي)، فيُضاف مجلد حزم المستخدم صراحةً لـ numpy وPillow.
sys.path.append(site.getusersitepackages())

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

CVD = {
    "protanopia": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    "deuteranopia": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    "tritanopia": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def from_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def simulate(path, out_dir, kinds):
    img = Image.open(path).convert("RGBA")
    arr = np.asarray(img).astype(np.float64) / 255.0
    rgb, alpha = arr[..., :3], arr[..., 3:]
    lin = to_linear(rgb)
    base = os.path.splitext(os.path.basename(path))[0]
    os.makedirs(out_dir, exist_ok=True)
    for kind in kinds:
        m = np.array(CVD[kind])
        sim = from_linear(np.einsum("hwc,kc->hwk", lin, m))
        out = np.concatenate([sim, alpha], axis=-1)
        dest = os.path.join(out_dir, f"{base}--{kind}.png")
        Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(dest, optimize=True)
        print(dest)


def zoom(path, dest, x, y, w, h, factor):
    img = Image.open(path).convert("RGBA").crop((x, y, x + w, y + h))
    img.resize((w * factor, h * factor), Image.NEAREST).save(dest, optimize=True)
    print(dest)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "cvd":
        simulate(sys.argv[2], sys.argv[3], sys.argv[4:] or ["protanopia", "deuteranopia"])
    elif cmd == "zoom":
        zoom(sys.argv[2], sys.argv[3], *map(int, sys.argv[4:9]))
    else:
        sys.exit(__doc__)
