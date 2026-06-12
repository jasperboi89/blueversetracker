import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getActivePhase, isShiftActive } from "./phases";
import { GalaxyBackground } from "@/components/layout/GalaxyBackground";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Domain-warped FBM nebula. Three colors are blended by noise channels.
const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2  uRes;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform float uActivity; // 1.0 = active shift, 0.25 = day rest

  // hash & noise
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    float a = hash(i); float b = hash(i+vec2(1.,0.));
    float c = hash(i+vec2(0.,1.)); float d = hash(i+vec2(1.,1.));
    vec2 u = f*f*(3.0-2.0*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
  }
  float fbm(vec2 p){
    float v = 0.0; float a = 0.5;
    for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = vUv;
    float aspect = uRes.x / max(uRes.y, 1.0);
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0;
    float t = uTime * (0.03 + 0.05 * uActivity);

    // Domain warp
    vec2 q = vec2( fbm(p + t),
                   fbm(p + vec2(5.2, 1.3) - t*0.7) );
    vec2 r = vec2( fbm(p + 4.0*q + vec2(1.7,9.2) + t*0.4),
                   fbm(p + 4.0*q + vec2(8.3,2.8) - t*0.3) );
    float n = fbm(p + 4.0*r);

    // Color blend
    vec3 col = mix(uColorA, uColorB, smoothstep(0.2, 0.7, n));
    col = mix(col, uColorC, smoothstep(0.55, 0.95, length(q)));

    // Soft vignette around center bloom
    float bloom = smoothstep(1.3, 0.1, length(p));
    col += uColorC * bloom * 0.35 * uActivity;

    // Star sparkle (sparse)
    float s = step(0.997, hash(floor(uv * uRes * 0.6)));
    col += vec3(s) * 0.6;

    // Overall energy/exposure dampened in sleep mode
    col *= mix(0.45, 1.0, uActivity);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function parseOklch(str: string): THREE.Color {
  // Use the browser to resolve oklch → rgb via a throwaway element.
  if (typeof document === "undefined") return new THREE.Color(0x223355);
  const probe = document.createElement("div");
  probe.style.color = str;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color; // "rgb(r, g, b)"
  document.body.removeChild(probe);
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return new THREE.Color(0x223355);
  const parts = m[1].split(",").map((x) => parseFloat(x.trim()));
  return new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255);
}

function NebulaPlane() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const phaseRef = useRef({ a: new THREE.Color(), b: new THREE.Color(), c: new THREE.Color(), active: 1 });

  const uniforms = useMemo(
    () => ({
      uTime:    { value: 0 },
      uRes:     { value: new THREE.Vector2(1, 1) },
      uColorA:  { value: new THREE.Color() },
      uColorB:  { value: new THREE.Color() },
      uColorC:  { value: new THREE.Color() },
      uActivity:{ value: 1.0 },
    }),
    [],
  );

  // Pull phase colors every minute and lerp uniforms toward them each frame.
  useEffect(() => {
    function readPhase() {
      const p = getActivePhase(new Date());
      phaseRef.current.a = parseOklch(p.primary);
      phaseRef.current.b = parseOklch(p.secondary);
      phaseRef.current.c = parseOklch(p.accent);
      phaseRef.current.active = isShiftActive(new Date()) ? 1.0 : 0.25;
    }
    readPhase();
    const id = setInterval(readPhase, 60_000);
    return () => clearInterval(id);
  }, []);

  useFrame((state, delta) => {
    const m = matRef.current;
    if (!m) return;
    const u = m.uniforms;
    u.uTime.value += delta * (0.5 + phaseRef.current.active);
    const size = state.size;
    u.uRes.value.set(size.width, size.height);
    const lerp = Math.min(1, delta * 1.2);
    (u.uColorA.value as THREE.Color).lerp(phaseRef.current.a, lerp);
    (u.uColorB.value as THREE.Color).lerp(phaseRef.current.b, lerp);
    (u.uColorC.value as THREE.Color).lerp(phaseRef.current.c, lerp);
    u.uActivity.value += (phaseRef.current.active - u.uActivity.value) * lerp;
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function webglSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function NebulaCanvas() {
  const [mounted, setMounted] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    setMounted(true);
    setSupported(webglSupported());
  }, []);

  if (!mounted || supported === null) return null;
  if (!supported) return <GalaxyBackground />;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ background: "oklch(0.07 0.04 270)" }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: false, powerPreference: "high-performance", alpha: false }}
        camera={{ position: [0, 0, 1] }}
        style={{ width: "100%", height: "100%" }}
        frameloop="always"
      >
        <NebulaPlane />
      </Canvas>
      {/* Soft top-vignette so glass panels read cleanly */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, transparent 30%, oklch(0.07 0.04 270 / 0.5) 90%)",
        }}
      />
    </div>
  );
}