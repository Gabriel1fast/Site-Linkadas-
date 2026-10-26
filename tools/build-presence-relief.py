"""Gera assets/img/presence/relief.webp — textura de relevo decorativa (sombreamento procedural,
sem dados altimétricos reais) aplicada sobre o mapa, recortada pelo contorno do Brasil.
Uso: cd tools && npm run build:textures"""
import os
import numpy as np
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'assets', 'img', 'presence', 'relief.webp')
rng = np.random.default_rng(13)
N = 800

def octave(cells):
    grid = rng.random((cells, cells)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8)).resize((N, N), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255

h = sum(octave(c) * a for c, a in [(5, 1.0), (12, 0.55), (28, 0.28), (64, 0.1), (140, 0.03)])
h = (h - h.min()) / (h.max() - h.min())
# Cristas: dobra o ruído para lembrar serras e vales
h = 1 - np.abs(h * 2 - 1)

gy, gx = np.gradient(h * 22)
light = np.array([-0.6, -0.7, 0.55]); light /= np.linalg.norm(light)
nrm = np.dstack([-gx, -gy, np.ones_like(h)])
nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
shade = np.clip(nrm @ light, 0, 1)
shade = (shade - shade.mean()) * 1.1 + 0.5

# Lavanda clara derivada da paleta (off-white #F5EFE8 + violeta #8B2AC2)
off = np.array([245, 239, 232], np.float32); violet = np.array([139, 42, 194], np.float32)
base = off * 0.78 + violet * 0.22
col = base[None, None, :] * (0.82 + 0.3 * shade[..., None])
col = np.clip(col, 0, 255).astype(np.uint8)
Image.fromarray(col, 'RGB').save(out, 'WEBP', quality=72, method=6)
print('ok:', os.path.relpath(out, os.path.join(here, '..')), round(os.path.getsize(out) / 1024, 1), 'KB')
