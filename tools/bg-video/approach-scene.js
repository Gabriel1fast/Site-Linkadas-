/* Cena da 6ª dobra (lâminas de luz) — usada só para gerar o vídeo de fundo (tools/bg-video/render.cjs).
   O site exibe o vídeo; este shader é a fonte, para regerar o vídeo se o visual mudar. */


const hex = (v) => { const n = parseInt(v.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const C = { deep: hex('#18072B'), violet: hex('#8B2AC2'), magenta: hex('#C51AD8'), offwhite: hex('#F5EFE8') };

const VERTEX = 'attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }';

/* Duas lâminas de luz inspiradas na referência:
   1) um "canto" arredondado de luz (borda que vem da esquerda, curva e sobe);
   2) um grande arco que varre do centro para baixo e para a direita.
   Cada lâmina tem: linha nítida com antisserrilhado por pixel, halo suave, volume em degradê
   (magenta junto à borda → violeta → roxo profundo) e textura sedosa muito sutil.
   Formas e posições se deslocam com a rolagem (uP). */
const FRAGMENT = `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uP;
  uniform vec3 cDeep, cViolet, cMagenta, cOff;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
  }
  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  // Distância assinada a um quadrante com canto arredondado (interior: acima e à direita do canto)
  float cornerSdf(vec2 p, vec2 k, float r) {
    vec2 v = k - p;
    return length(max(v + r, 0.0)) + min(max(v.x + r, v.y + r), 0.0) - r;
  }

  // Luz de uma lâmina a partir da distância assinada d (px = tamanho de 1 pixel)
  vec3 sheet(float d, float px, float depth, float silk, float strength) {
    float inside = smoothstep(1.5 * px, -1.5 * px, d);              // interior com borda suave (sem serrilhado)
    float line = exp(-abs(d) / (1.4 * px));                          // linha nítida de ~2px
    float halo = exp(-abs(d) / 0.016);                               // brilho próximo à borda
    float glow = exp(-abs(d) / 0.07);                                // atmosfera
    float vol = exp(min(d, 0.0) / depth) * inside;                   // volume que se dissolve para dentro

    vec3 hot = mix(cMagenta, cOff, 0.62);
    vec3 body = mix(cDeep, cViolet, smoothstep(0.0, 0.6, vol));
    body = mix(body, cMagenta, smoothstep(0.55, 1.0, vol));
    vec3 c = body * vol * (0.62 + 0.38 * silk)
           + cMagenta * halo * 0.68
           + cViolet * glow * 0.16
           + hot * line * 0.85;
    return c * strength;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    vec2 p = vec2(uv.x * aspect, uv.y);
    float px = 1.0 / uRes.y;
    float t = uTime;
    float s = uP;

    // Base: quase preto com leve roxo no alto
    vec3 col = cDeep * 0.18 * smoothstep(0.1, 1.0, uv.y);

    // Textura sedosa: estrias suaves que acompanham o fluxo da luz
    float silk = noise(vec2(p.x * 3.0 + p.y * 7.0, p.y * 2.0 - t * 0.05));

    // 1) Canto de luz superior — gira levemente e sobe com a rolagem
    vec2 k = vec2(aspect * (0.50 - 0.06 * s), 0.50 + 0.08 * s + 0.012 * sin(t * 0.18));
    vec2 q = rot(-0.18 + 0.12 * s) * (p - k) + k;
    float d1 = cornerSdf(q, k, 0.24 + 0.025 * sin(t * 0.12));
    col += sheet(d1, px, 0.16, silk, 0.85);

    // 2) Grande arco — centro fora da tela, passa pelo ponto de encontro com a lâmina 1
    vec2 c2 = vec2(aspect * (1.32 - 0.12 * s), 1.42 + 0.10 * s + 0.015 * cos(t * 0.1));
    vec2 meet = k + vec2(0.02, -0.02);
    float r2 = length(meet - c2);
    float d2 = length(p - c2) - r2;
    float along = smoothstep(-0.12, 0.55, p.x - meet.x);           // mais intensa à direita do encontro
    col += sheet(d2, px, 0.24, silk, 1.0) * (0.3 + 0.7 * along);
    // Reflexo violeta frio, fino, logo abaixo da borda do arco
    float d3 = d2 - 0.02;
    col += mix(cViolet, cOff, 0.15) * exp(-abs(d3) / (1.6 * px)) * 0.45 * along;
    col += cViolet * exp(-abs(d3) / 0.012) * 0.22 * along;

    // Leitura: lado do texto mais escuro; telas estreitas com luz mais contida
    col *= mix(0.3, 1.0, smoothstep(0.1, 0.62, uv.x));
    col *= mix(0.42, 1.0, smoothstep(0.7, 1.2, aspect));
    // Vinheta suave
    col *= 1.0 - 0.35 * pow(length((uv - 0.5) * vec2(1.0, 1.2)), 2.0);

    // Mapeamento de tom suave (sem estourar) + grão fino de filme
    col = 1.0 - exp(-col * 1.15);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createApproachScene(canvas, { scroll = 0.45 } = {}) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: true });
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  gl.uniform3fv(u('cDeep'), C.deep);
  gl.uniform3fv(u('cViolet'), C.violet);
  gl.uniform3fv(u('cMagenta'), C.magenta);
  gl.uniform3fv(u('cOff'), C.offwhite);
  gl.viewport(0, 0, canvas.width, canvas.height);
  return (time) => {
    gl.uniform2f(u('uRes'), canvas.width, canvas.height);
    gl.uniform1f(u('uTime'), time);
    gl.uniform1f(u('uP'), scroll);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
  };
}
