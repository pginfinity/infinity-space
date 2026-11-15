import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Starfield } from "../lens3d/Starfield.tsx";

/**
 * O lado de fora: estrelas e a Terra lá embaixo, vista pelas bordas da estação e pelas janelas.
 * A Terra é procedural (oceano, continentes, nuvens e atmosfera), sem baixar textura.
 */

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.0;float a=0.5;for(int i=0;i<5;i++){f+=a*snoise(p);p*=2.02;a*=0.5;}return f;}
`;

function earthMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.45, 0.55, 0.7).normalize() } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP; varying vec3 vView;
      void main(){
        vN = normalize(normal); vP = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uSun;
      varying vec3 vN; varying vec3 vP; varying vec3 vView;
      ${NOISE}
      void main(){
        vec3 n = normalize(vP);
        float land = fbm(n * 2.2);
        float clouds = smoothstep(0.15, 0.6, fbm(n * 4.0 + vec3(uTime * 0.004, 0.0, uTime * 0.002)));
        vec3 ocean = mix(vec3(0.02, 0.10, 0.28), vec3(0.04, 0.28, 0.55), smoothstep(-0.3, 0.1, land));
        vec3 ground = mix(vec3(0.16, 0.42, 0.22), vec3(0.62, 0.52, 0.34), smoothstep(0.2, 0.55, land));
        float isLand = smoothstep(0.08, 0.12, land);
        vec3 col = mix(ocean, ground, isLand);
        col = mix(col, vec3(0.95), clouds * 0.75);
        float light = clamp(dot(normalize(vN), uSun) * 1.2 + 0.15, 0.0, 1.0);
        vec3 night = vec3(1.0, 0.75, 0.4) * isLand * smoothstep(0.35, 0.5, fbm(n * 18.0)) * 0.5;
        col = col * light + night * (1.0 - smoothstep(0.0, 0.25, light));
        float rim = pow(1.0 - max(dot(normalize(vN), vView), 0.0), 3.0);
        col += vec3(0.25, 0.55, 1.0) * rim * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function atmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vView;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vView;
      void main(){ float i = pow(0.72 - dot(vN, vView), 4.0); gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * i * 1.6; }`,
  });
}

export function Space() {
  const earth = useRef<THREE.Mesh>(null);
  const { mat, atmo, geo } = useMemo(() => ({ mat: earthMaterial(), atmo: atmosphereMaterial(), geo: new THREE.SphereGeometry(1, 96, 64) }), []);
  useEffect(
    () => () => {
      mat.dispose();
      atmo.dispose();
      geo.dispose();
    },
    [mat, atmo, geo],
  );
  useFrame((state) => {
    mat.uniforms.uTime!.value = state.clock.elapsedTime;
    if (earth.current) earth.current.rotation.y = state.clock.elapsedTime * 0.004;
  });
  return (
    <group>
      <Starfield />
      <group position={[60, -760, -260]}>
        <mesh ref={earth} geometry={geo} material={mat} scale={560} />
        <mesh geometry={geo} material={atmo} scale={600} />
      </group>
    </group>
  );
}
