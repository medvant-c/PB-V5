import { cn } from "@/lib/utils";

const CENTER = 280;
const RADIUS = 195;

function seededRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function generateGlobeDots(count: number) {
  const dots: { x: number; y: number; r: number; o: number }[] = [];
  let attempts = 0;
  while (dots.length < count && attempts < count * 30) {
    attempts++;
    const seed = attempts * 7.13;
    const rx = seededRandom(seed) * 2 - 1;
    const ry = seededRandom(seed + 1) * 2 - 1;
    const dist = Math.sqrt(rx * rx + ry * ry);
    if (dist > 0.98) continue;
    const bandNoise = Math.sin((ry * RADIUS) * 0.045) * 0.5 + 0.5;
    if (seededRandom(seed + 2) > bandNoise + 0.15) continue;
    dots.push({
      x: CENTER + rx * RADIUS,
      y: CENTER + ry * RADIUS,
      r: 1 + seededRandom(seed + 3) * 1.3,
      o: 0.35 + seededRandom(seed + 4) * 0.55,
    });
  }
  return dots;
}

const globeDots = generateGlobeDots(170);

function generateSparkles(count: number) {
  const sparkles: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const seed = (i + 1) * 19.7;
    const rx = seededRandom(seed) * 2 - 1;
    const ry = seededRandom(seed + 1) * 2 - 1;
    const dist = Math.sqrt(rx * rx + ry * ry);
    if (dist > 0.95) continue;
    sparkles.push({
      x: CENTER + rx * RADIUS,
      y: CENTER + ry * RADIUS,
      r: 1.2 + seededRandom(seed + 2) * 1,
    });
  }
  return sparkles;
}

const sparkles = generateSparkles(26);

function ellipsePath(rx: number, ry: number) {
  return `M ${CENTER - rx} ${CENTER} A ${rx} ${ry} 0 1 1 ${CENTER + rx} ${CENTER} A ${rx} ${ry} 0 1 1 ${CENTER - rx} ${CENTER} Z`;
}

const orbits = [
  { rx: 225, ry: 58, rotate: 8, dur: 16 },
  { rx: 245, ry: 82, rotate: -22, dur: 22 },
  { rx: 208, ry: 100, rotate: 40, dur: 19 },
  { rx: 260, ry: 70, rotate: -48, dur: 26 },
  { rx: 190, ry: 88, rotate: 68, dur: 14 },
];

function HeroGlobe({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 560" className={cn("h-full w-full", className)} aria-hidden="true">
      <defs>
        <radialGradient id="heroSphereGrad" cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#f2f6ff" stopOpacity="0.98" />
          <stop offset="45%" stopColor="#a8c2ff" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#5672d6" stopOpacity="0.92" />
        </radialGradient>
        <radialGradient id="heroGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8fb0ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#8fb0ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orbitGlassGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="0.5" stopColor="#a5c4ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.75" />
        </linearGradient>
        <radialGradient id="glassBallGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#cfe0ff" />
          <stop offset="100%" stopColor="#8fb2ff" />
        </radialGradient>
        <radialGradient id="ballGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#bcd2ff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#bcd2ff" stopOpacity="0" />
        </radialGradient>
        <clipPath id="heroSphereClip">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} />
        </clipPath>
      </defs>

      <circle cx={CENTER} cy={CENTER} r={RADIUS * 1.45} fill="url(#heroGlowGrad)" />

      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="url(#heroSphereGrad)" />

      <g clipPath="url(#heroSphereClip)">
        <g stroke="white" strokeOpacity="0.22" fill="none">
          <ellipse cx={CENTER} cy={CENTER} rx={RADIUS} ry={RADIUS * 0.25} />
          <ellipse cx={CENTER} cy={CENTER} rx={RADIUS} ry={RADIUS * 0.5} />
          <ellipse cx={CENTER} cy={CENTER} rx={RADIUS} ry={RADIUS * 0.75} />
          <ellipse cx={CENTER} cy={CENTER} rx={RADIUS * 0.25} ry={RADIUS} />
          <ellipse cx={CENTER} cy={CENTER} rx={RADIUS * 0.5} ry={RADIUS} />
          <ellipse cx={CENTER} cy={CENTER} rx={RADIUS * 0.75} ry={RADIUS} />
        </g>

        {globeDots.map((dot, i) => (
          <circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill="white" opacity={dot.o} />
        ))}

        {sparkles.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity="0.9" />
        ))}
      </g>

      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="white"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      {orbits.map((orbit, i) => {
        const pathId = `heroOrbitPath${i}`;
        const d = ellipsePath(orbit.rx, orbit.ry);
        return (
          <g key={i} transform={`rotate(${orbit.rotate} ${CENTER} ${CENTER})`}>
            <path
              id={pathId}
              d={d}
              fill="none"
              stroke="url(#orbitGlassGrad)"
              strokeWidth="1.3"
              opacity="0.6"
            />
            <g>
              <animateMotion dur={`${orbit.dur}s`} repeatCount="indefinite" rotate="auto">
                <mpath href={`#${pathId}`} />
              </animateMotion>
              <circle r="7" fill="url(#ballGlowGrad)" />
              <circle r="3.2" fill="url(#glassBallGrad)" stroke="white" strokeOpacity="0.6" strokeWidth="0.5">
                <animate
                  attributeName="opacity"
                  values="0.45;1;0.45"
                  dur={`${2.2 + i * 0.4}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export { HeroGlobe };
