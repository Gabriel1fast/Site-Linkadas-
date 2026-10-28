"""Transforma os quadros de render.cjs num vídeo de fundo em loop perfeito (WebM VP9 + MP4 H.264 + pôster WebP).

Uso: python3 tools/bg-video/encode.py <pasta-dos-quadros> <loop-em-segundos> <fps> <saída-sem-extensão> [crf-webm] [crf-mp4]
Ex.: python3 tools/bg-video/encode.py /tmp/quadros/finale-desktop 10 30 assets/video/finale-desktop

Loop sem emenda: a cena é renderizada por (loop + transição) segundos. O início do vídeo é uma fusão
gradual entre os quadros finais e os iniciais, então o último quadro emenda exatamente no primeiro.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

src, loop_s, fps, out = Path(sys.argv[1]), float(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
crf_webm = sys.argv[5] if len(sys.argv) > 5 else '44'
crf_mp4 = sys.argv[6] if len(sys.argv) > 6 else '30'

frames = sorted(src.glob('f*.png'))
loop_n = round(loop_s * fps)
fade_n = len(frames) - loop_n
assert 0 < fade_n <= loop_n, 'renderize (loop + transição) segundos'


def load(i):
    return np.asarray(Image.open(frames[i]).convert('RGB'), dtype=np.float32)


with tempfile.TemporaryDirectory() as tmp:
    for i in range(loop_n):
        if i < fade_n:
            a = (i + 0.5) / fade_n
            a = a * a * (3 - 2 * a)  # transição suave
            img = load(loop_n + i) * (1 - a) + load(i) * a
        else:
            img = load(i)
        Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8)).save(f'{tmp}/o{i:04d}.png', compress_level=1)

    pattern = ['-framerate', str(fps), '-i', f'{tmp}/o%04d.png']
    common = ['-an', '-pix_fmt', 'yuv420p', '-g', str(loop_n)]
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *pattern, *common,
                    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', crf_webm, '-row-mt', '1',
                    '-deadline', 'good', '-cpu-used', '1', '-tile-columns', '2', f'{out}.webm'], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *pattern, *common,
                    '-c:v', 'libx264', '-crf', crf_mp4, '-preset', 'veryslow', '-profile:v', 'high',
                    '-tune', 'film', '-movflags', '+faststart', f'{out}.mp4'], check=True)
    # Pôster: primeiro quadro, exibido enquanto o vídeo carrega
    Image.open(f'{tmp}/o0000.png').save(f'{out}.webp', quality=72, method=6)

for ext in ('webm', 'mp4', 'webp'):
    print(f'{out}.{ext}: {Path(f"{out}.{ext}").stat().st_size // 1024} KB')
