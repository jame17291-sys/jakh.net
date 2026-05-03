(function() {
  'use strict';

  var VERTEX_SHADER = `attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  var FRAGMENT_SHADER = `precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

#define PI 3.14159265359
#define TAU 6.28318530718

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec2 mod289v2(vec2 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec3 permute(vec3 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float f = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    f += amp * snoise(p * freq);
    amp *= 0.5;
    freq *= 2.0;
  }
  return f;
}

float warpDomain(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + t * 0.15), fbm(p + vec2(5.2, 1.3) + t * 0.12));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.08), fbm(p + 4.0 * q + vec2(8.3, 2.8) + t * 0.10));
  return fbm(p + 3.5 * r);
}

void main() {
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float t = u_time * 0.4;
  vec2 mouseInfluence = vec2(0.0);
  if (u_mouse.x > 0.0) {
    vec2 mouseNorm = (u_mouse * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
    mouseInfluence = (mouseNorm - p) * 0.3;
  }
  float flow = warpDomain(p * 0.8 + mouseInfluence, t);
  flow = pow(smoothstep(-0.2, 1.2, flow), 0.9);
  vec3 c1 = vec3(0.01, 0.01, 0.02);
  vec3 c2 = vec3(0.22, 0.74, 0.97);
  vec3 c3 = vec3(0.75, 0.15, 0.83);
  vec3 finalColor = mix(mix(c1, c2, smoothstep(0.2, 0.5, flow)), c3, smoothstep(0.5, 0.8, flow));
  finalColor += vec3(snoise(p * 2.0 + t) * 0.05);
  float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(finalColor, smoothstep(0.05, 0.15, lum));
}`;

  var _canvas = null;
  var _gl = null;
  var _program = null;
  var _rafId = 0;
  var _startTime = 0;
  var _mouseX = -1;
  var _mouseY = -1;
  var _positionBuffer = null;
  var _vs = null;
  var _fs = null;

  function createShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function mount(canvas) {
    _canvas = canvas;
    var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
    if (!gl) return false;
    _gl = gl;

    _vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    _fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!_vs || !_fs) return false;

    _program = gl.createProgram();
    gl.attachShader(_program, _vs);
    gl.attachShader(_program, _fs);
    gl.linkProgram(_program);
    if (!gl.getProgramParameter(_program, gl.LINK_STATUS)) return false;

    gl.useProgram(_program);

    _positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, _positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 1,-1, -1,1,
      -1,1, 1,-1, 1,1
    ]), gl.STATIC_DRAW);

    var posLoc = gl.getAttribLocation(_program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize);

    canvas.addEventListener('mousemove', function(e) {
      var rect = canvas.getBoundingClientRect();
      _mouseX = e.clientX - rect.left;
      _mouseY = rect.height - (e.clientY - rect.top);
    });
    canvas.addEventListener('mouseleave', function() {
      _mouseX = -1; _mouseY = -1;
    });

    var uTime = gl.getUniformLocation(_program, 'u_time');
    var uRes  = gl.getUniformLocation(_program, 'u_resolution');
    var uMouse = gl.getUniformLocation(_program, 'u_mouse');

    _startTime = performance.now();

    function render() {
      var elapsed = (performance.now() - _startTime) / 1000;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      var dpr = canvas.width / (canvas.clientWidth || 1);
      gl.uniform2f(uMouse,
        _mouseX > 0 ? _mouseX * dpr : -1,
        _mouseY > 0 ? _mouseY * dpr : -1
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      _rafId = requestAnimationFrame(render);
    }
    _rafId = requestAnimationFrame(render);
    return true;
  }

  function destroy() {
    cancelAnimationFrame(_rafId);
    if (_gl) {
      if (_program) _gl.deleteProgram(_program);
      if (_vs) _gl.deleteShader(_vs);
      if (_fs) _gl.deleteShader(_fs);
      if (_positionBuffer) _gl.deleteBuffer(_positionBuffer);
    }
    _canvas = _gl = _program = null;
  }

  window.FluidShader = { mount: mount, destroy: destroy };
})();
