"""纯 Python 生成应用图标（无第三方依赖）：圆角渐变方块 + 白色对勾。
输出： build/icon.ico （16/24/32/48/64/128 BMP + 256 PNG）与 src/assets/icon.png
"""
import os
import math
import zlib
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

SS = 4  # 超采样倍数


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_rect_sdf(x, y, w, h, r):
    """点到圆角矩形的有符号距离（负数在内部）"""
    qx = abs(x - w / 2.0) - (w / 2.0 - r)
    qy = abs(y - h / 2.0) - (h / 2.0 - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    return math.hypot(px - (ax + vx * t), py - (ay + vy * t))


def render(size):
    """返回 RGBA bytes（size*size*4）"""
    S = size * SS
    radius = S * 0.225
    # 渐变色
    c1 = (79, 110, 247)    # #4f6ef7
    c2 = (139, 108, 247)   # #8b6cf7

    # 勾的三个点（单位坐标）
    pts = [(0.265, 0.520), (0.435, 0.690), (0.745, 0.330)]
    P = [(x * S, y * S) for x, y in pts]
    thick = S * 0.098

    hi = []  # 超采样缓冲：list of (r,g,b,a)
    for j in range(S):
        for i in range(S):
            x, y = i + 0.5, j + 0.5
            d = rounded_rect_sdf(x, y, S, S, radius)
            if d > 1.2:
                hi.append((0, 0, 0, 0))
                continue
            a = 1.0 if d <= 0 else max(0.0, 1.0 - d)
            t = (x / S * 0.55 + y / S * 0.45)
            r = int(lerp(c1[0], c2[0], t))
            g = int(lerp(c1[1], c2[1], t))
            b = int(lerp(c1[2], c2[2], t))
            # 顶部高光
            gl = max(0.0, 1.0 - (y / S) * 2.2) * 0.16
            r = min(255, int(r + 255 * gl))
            g = min(255, int(g + 255 * gl))
            b = min(255, int(b + 255 * gl))
            # 对勾
            dm = min(seg_dist(x, y, P[0][0], P[0][1], P[1][0], P[1][1]),
                     seg_dist(x, y, P[1][0], P[1][1], P[2][0], P[2][1]))
            if dm < thick / 2 + 1.0:
                cov = 1.0 if dm <= thick / 2 else max(0.0, 1.0 - (dm - thick / 2))
                r = int(lerp(r, 255, cov))
                g = int(lerp(g, 255, cov))
                b = int(lerp(b, 255, cov))
            hi.append((r, g, b, int(a * 255)))

    # 下采样
    out = bytearray()
    n = SS * SS
    for j in range(size):
        for i in range(size):
            R = G = B = A = 0
            for dy in range(SS):
                row = (j * SS + dy) * S
                for dx in range(SS):
                    p = hi[row + i * SS + dx]
                    R += p[0] * p[3]; G += p[1] * p[3]; B += p[2] * p[3]; A += p[3]
            if A == 0:
                out += bytes((0, 0, 0, 0))
            else:
                out += bytes((min(255, R // A), min(255, G // A), min(255, B // A), A // n))
    return bytes(out)


def png_bytes(rgba, size):
    raw = bytearray()
    stride = size * 4
    for j in range(size):
        raw.append(0)
        raw += rgba[j * stride:(j + 1) * stride]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))


def bmp_bytes(rgba, size):
    """ICO 内嵌 DIB：BITMAPINFOHEADER + BGRA(自下而上) + AND 掩码"""
    hdr = struct.pack('<IiiHHIIiiII', 40, size, size * 2, 1, 32, 0, size * size * 4, 0, 0, 0, 0)
    px = bytearray()
    for j in range(size - 1, -1, -1):
        row = j * size * 4
        for i in range(size):
            r, g, b, a = rgba[row + i * 4: row + i * 4 + 4]
            px += bytes((b, g, r, a))
    mask_row = ((size + 31) // 32) * 4
    mask = bytes(mask_row * size)
    return hdr + bytes(px) + mask


def build_ico(path, sizes_bmp, size_png):
    entries = []
    images = []
    for s in sizes_bmp:
        rgba = render(s)
        images.append((s, bmp_bytes(rgba, s)))
    rgba256 = render(size_png)
    images.append((size_png, png_bytes(rgba256, size_png)))

    offset = 6 + 16 * len(images)
    header = struct.pack('<HHH', 0, 1, len(images))
    dir_data = b''
    body = b''
    for s, data in images:
        w = 0 if s >= 256 else s
        dir_data += struct.pack('<BBBBHHII', w, w, 0, 0, 1, 32, len(data), offset)
        body += data
        offset += len(data)
    with open(path, 'wb') as f:
        f.write(header + dir_data + body)
    return rgba256


if __name__ == '__main__':
    ico = os.path.join(HERE, 'icon.ico')
    rgba256 = build_ico(ico, [16, 24, 32, 48, 64, 128], 256)
    assets = os.path.join(ROOT, 'src', 'assets')
    os.makedirs(assets, exist_ok=True)
    with open(os.path.join(assets, 'icon.png'), 'wb') as f:
        f.write(png_bytes(rgba256, 256))
    print('icon.ico', os.path.getsize(ico), 'bytes')
    print('icon.png ok')
