"""Transforma os quadros de render.cjs num vídeo de fundo em loop perfeito (MP4 H.264 + pôster WebP).

Só H.264: decodificado por hardware em todos os aparelhos e, com o dither, mantém os degradês escuros lisos
(o VP9 testado borrava e manchava esses degradês mesmo com pouca compressão).

Uso: python3 tools/bg-video/encode.py <pasta-dos-quadros> <loop-em-segundos> <fps> <saída-sem-extensão> [-] [crf-mp4] [LxA|-] [dither]
(LxA: tamanho final; quadros renderizados maiores são reduzidos → bordas lisas por superamostragem)
Ex.: python3 tools/bg-video/encode.py /tmp/quadros/finale-desktop 10 30 assets/video/finale-desktop - 22 1920x1080 1

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
crf_mp4 = sys.argv[6] if len(sys.argv) > 6 else '22'
size = tuple(map(int, sys.argv[7].split('x'))) if len(sys.argv) > 7 and sys.argv[7] != '-' else None
# Dither: ruído fixo (o mesmo padrão em todos os quadros) que evita faixas/manchas nos degradês escuros
dither = float(sys.argv[8]) if len(sys.argv) > 8 else 1.0

frames = sorted(src.glob('f*.png'))
loop_n = round(loop_s * fps)
fade_n = len(frames) - loop_n
# fade_n = 0: a cena já é periódica (hero) e emenda sozinha
assert 0 <= fade_n <= loop_n, 'renderize (loop + transição) segundos'


def load(i):
    img = Image.open(frames[i]).convert('RGB')
    if size and img.size != size:
        img = img.resize(size, Image.LANCZOS)
    return np.asarray(img, dtype=np.float32)


noise = None
with tempfile.TemporaryDirectory() as tmp:
    for i in range(loop_n):
        if i < fade_n:
            a = (i + 0.5) / fade_n
            a = a * a * (3 - 2 * a)  # transição suave
            img = load(loop_n + i) * (1 - a) + load(i) * a
        else:
            img = load(i)
        if dither:
            if noise is None:
                noise = (np.random.default_rng(7).random(img.shape[:2], dtype=np.float32)[..., None] - 0.5) * 2 * dither
            img = img + noise
        Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8)).save(f'{tmp}/o{i:04d}.png', compress_level=1)

    pattern = ['-framerate', str(fps), '-i', f'{tmp}/o%04d.png']
    # Cores: conversão e marcação BT.709 (o navegador assume 709 em vídeo HD; sem isso as cores mudam)
    common = ['-an', '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-pix_fmt', 'yuv420p',
              '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
              '-g', str(loop_n)]
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *pattern, *common,
                    '-c:v', 'libx264', '-crf', crf_mp4, '-preset', 'veryslow', '-profile:v', 'high',
                    '-tune', 'film', '-movflags', '+faststart', f'{out}.mp4'], check=True)
    # Pôster: primeiro quadro, exibido enquanto o vídeo carrega
    Image.open(f'{tmp}/o0000.png').save(f'{out}.webp', quality=72, method=6)

for ext in ('mp4', 'webp'):
    print(f'{out}.{ext}: {Path(f"{out}.{ext}").stat().st_size // 1024} KB')
