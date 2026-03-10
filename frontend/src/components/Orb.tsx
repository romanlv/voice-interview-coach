import { type FC, type MutableRefObject, useRef, useEffect } from "react";

const PULSE_PERIOD_SECONDS = 3;
const PULSE_SIZE_MULTIPLIER = 1.02;
const AVERAGE_ROTATION_PERIOD_SECONDS = 6;
const ROCKING_SWING_FRACTION = 18;
const ROCKING_PERIOD_SECONDS = 6;
const SLEEP_SPEED_MULTIPLIER = 0.5;
const DEFLATE_TRANSITION_TIME_MS = 1000;
const DEFLATE_PULL = 1.3;
const INFLATE_TRANSITION_TIME_MS = 300;
const FOCUS_TRANSITION_TIME_MS = 700;
const RELAX_TRANSITION_TIME_MS = 1000;
const CHATTER_SIZE_MULTIPLIER = 1.15;
const CHATTER_WINDOW_SIZE = 3;
const FOCUS_SPEED_MULTIPLIER = 5;
const FOCUS_SIZE_MULTIPLIER = 0.5;

type OrbStatus = "LISTENING" | "THINKING" | "SPEAKING";

interface Props {
  width: number;
  height: number;
  agentVolume: number;
  userVolume: number;
  status: OrbStatus;
}

interface Point {
  x: number;
  y: number;
}

interface ColorStop {
  pct: number;
  color: string;
}

type NonEmptyArray<T> = [T, ...T[]];

interface LineConfig {
  segments: NonEmptyArray<ColorStop>;
  startAngle: number;
  speedMultiplier: number;
  centerOffset: Point;
  radiusOffset: number;
  width: number;
}

interface Deflation {
  angle: number;
  depth: number;
}

interface Shape {
  generation: number;
  time: number;
  deflation: number;
  focus: number;
  agentNoise: number[];
  userNoise: number[];
}

type ShapeRef = MutableRefObject<Shape>;
type Context = CanvasRenderingContext2D;

const pi = (n: number): number => Math.PI * n;

const coordsFrom = ({ x, y }: Point, distance: number, angle: number): Point => ({
  x: x + distance * Math.cos(angle),
  y: y + distance * Math.sin(angle),
});

const bezierCurve = (ctx: Context, cp1: Point, cp2: Point, end: Point): void => {
  ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
};

const lerp = (start: number, stop: number, amt: number): number => amt * (stop - start) + start;

const easeInOutQuad = (x: number): number =>
  x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

const getCenter = (ctx: Context): Point => {
  const { width, height } = ctx.canvas.getBoundingClientRect();
  return { x: width / 2, y: height / 2 };
};

const crescent = (
  ctx: Context,
  offset: Point,
  radius: number,
  deflation: Deflation,
  strokeStyle: CanvasGradient,
): void => {
  const bezierDistance = radius * (4 / 3) * Math.tan(pi(1 / 8));
  const trueCenter = getCenter(ctx);
  const center = {
    x: trueCenter.x * (1 + offset.x),
    y: trueCenter.y * (1 + offset.y),
  };
  ctx.strokeStyle = strokeStyle;
  ctx.beginPath();

  const arcStart = deflation.angle + pi(1 / 2);
  const arcEnd = deflation.angle + pi(3 / 2);
  ctx.arc(center.x, center.y, radius, arcStart, arcEnd, false);

  const start = coordsFrom(center, radius, arcEnd);
  const midpointPull = radius * deflation.depth * DEFLATE_PULL;
  const mid = coordsFrom(
    center,
    radius - midpointPull,
    lerp(deflation.angle, pi(3) - deflation.angle, deflation.depth),
  );
  const end = coordsFrom(center, radius, arcStart);

  const bez1 = {
    cp1: coordsFrom(start, bezierDistance, arcEnd + pi(1 / 2)),
    cp2: coordsFrom(mid, bezierDistance, deflation.angle + pi(3 / 2)),
  };
  const bez2 = {
    cp1: coordsFrom(mid, bezierDistance, deflation.angle + pi(1 / 2)),
    cp2: coordsFrom(end, bezierDistance, arcStart + pi(3 / 2)),
  };

  bezierCurve(ctx, bez1.cp1, bez1.cp2, mid);
  bezierCurve(ctx, bez2.cp1, bez2.cp2, end);
  ctx.stroke();
};

const makeGradient = (
  ctx: Context,
  offset: Point,
  angle: number,
  parts: ColorStop[],
): CanvasGradient => {
  const center = getCenter(ctx);
  const x1 = center.x * (1 - Math.cos(angle) + offset.x);
  const y1 = center.y * (1 - Math.sin(angle) + offset.y);
  const x2 = center.x * (1 + Math.cos(angle) + offset.x);
  const y2 = center.y * (1 + Math.sin(angle) + offset.y);
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  parts.forEach(({ pct, color }) => g.addColorStop(pct, color));
  return g;
};

enum Color {
  springGreen = "#13ef93cc",
  springGreenLight = "#b8f8d2cc",
  eucalyptus = "#027a48cc",
  rose = "#f185becc",
  lavender = "#ba80f5cc",
  chryslerBlue = "#3a00d3cc",
  azure = "#149afbcc",
  transparent = "transparent",
}

const lines: LineConfig[] = [
  {
    segments: [
      { pct: 0.42, color: Color.transparent },
      { pct: 0.61, color: Color.rose },
    ],
    startAngle: 3.52,
    speedMultiplier: 1.21,
    centerOffset: { x: 0.01, y: -0.01 },
    radiusOffset: 0.02,
    width: 3.38,
  },
  {
    segments: [
      { pct: 0.28, color: Color.springGreen },
      { pct: 0.62, color: Color.rose },
    ],
    startAngle: 1.59,
    speedMultiplier: 0.64,
    centerOffset: { x: -0.03, y: -0.01 },
    radiusOffset: 0.05,
    width: 2.39,
  },
  {
    segments: [
      { pct: 0.31, color: Color.eucalyptus },
      { pct: 0.66, color: Color.chryslerBlue },
    ],
    startAngle: 2.86,
    speedMultiplier: 0.94,
    centerOffset: { x: 0.02, y: 0.02 },
    radiusOffset: -0.06,
    width: 2.64,
  },
  {
    segments: [
      { pct: 0.16, color: Color.chryslerBlue },
      { pct: 0.62, color: Color.eucalyptus },
      { pct: 0.75, color: Color.lavender },
    ],
    startAngle: 0.65,
    speedMultiplier: 1.23,
    centerOffset: { x: 0.01, y: 0.0 },
    radiusOffset: -0.01,
    width: 2.32,
  },
  {
    segments: [
      { pct: 0.02, color: Color.springGreen },
      { pct: 0.8, color: Color.azure },
    ],
    startAngle: 6.19,
    speedMultiplier: 1.18,
    centerOffset: { x: -0.04, y: 0.02 },
    radiusOffset: 0.01,
    width: 3.98,
  },
  {
    segments: [
      { pct: 0.2, color: Color.transparent },
      { pct: 0.47, color: Color.transparent },
      { pct: 0.81, color: Color.springGreenLight },
    ],
    startAngle: 0.49,
    speedMultiplier: 0.51,
    centerOffset: { x: 0.04, y: -0.01 },
    radiusOffset: -0.04,
    width: 1.19,
  },
];
const LINE_COUNT = lines.length;

const radiusOscillation = (shape: ShapeRef): number =>
  1 +
  (PULSE_SIZE_MULTIPLIER - 1) *
    Math.sin((shape.current.time * pi(1)) / PULSE_PERIOD_SECONDS / 1000) *
    lerp(1, 0, shape.current.deflation) *
    lerp(1, 0.33, shape.current.focus);

const rollingAverage = (noise: number[], start: number): number => {
  const noiseWindow = noise.slice(start, start + CHATTER_WINDOW_SIZE);
  return noiseWindow.reduce((a, b) => a + b) / noiseWindow.length;
};

const speechSimulation = (shape: ShapeRef, start: number): number =>
  lerp(1, CHATTER_SIZE_MULTIPLIER, rollingAverage(shape.current.agentNoise, start));

const listeningSimulation = (shape: ShapeRef, start: number): number =>
  lerp(1, 1 / CHATTER_SIZE_MULTIPLIER, rollingAverage(shape.current.userNoise, start));

const draw = (ctx: Context | null, shape: ShapeRef, last: number, now: number): void => {
  if (!ctx) return;
  shape.current.time +=
    (now - last) *
    lerp(1, FOCUS_SPEED_MULTIPLIER, shape.current.focus) *
    lerp(1, SLEEP_SPEED_MULTIPLIER, shape.current.deflation);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.filter = "saturate(150%)";

  const center = getCenter(ctx);
  const maxRadius = Math.min(center.x, center.y);

  lines.forEach((line, i) => {
    ctx.lineWidth = line.width;
    ctx.shadowColor = line.segments[0].color;
    ctx.shadowBlur = line.width * 1.1;
    const radius =
      maxRadius *
      0.8 *
      speechSimulation(shape, i) *
      listeningSimulation(shape, i) *
      radiusOscillation(shape);
    const gradient = makeGradient(
      ctx,
      line.centerOffset,
      line.startAngle +
        ((shape.current.time * pi(1)) / 1000 / AVERAGE_ROTATION_PERIOD_SECONDS) *
          line.speedMultiplier,
      line.segments,
    );
    crescent(
      ctx,
      line.centerOffset,
      (radius + line.radiusOffset * radius) *
        lerp(1, FOCUS_SIZE_MULTIPLIER, easeInOutQuad(shape.current.focus)),
      {
        depth: easeInOutQuad(shape.current.deflation),
        angle:
          pi(3 / 2) +
          pi(
            Math.sin(
              (shape.current.time * pi(1)) /
                (ROCKING_PERIOD_SECONDS * SLEEP_SPEED_MULTIPLIER) /
                1000,
            ) / ROCKING_SWING_FRACTION,
          ),
      },
      gradient,
    );
  });

  requestAnimationFrame((t) => {
    draw(ctx, shape, now, t);
  });
};

const deflationDepth = (status: OrbStatus): number => {
  switch (status) {
    case "LISTENING":
    case "THINKING":
    case "SPEAKING":
      return 0;
    default:
      return 0;
  }
};

const focusIntensity = (status: OrbStatus): number => {
  switch (status) {
    case "THINKING":
      return 1;
    case "LISTENING":
    case "SPEAKING":
      return 0;
    default:
      return 0;
  }
};

const doTransition = (
  generation: number,
  status: OrbStatus,
  shape: ShapeRef,
  last: number,
  now: number = last,
) => {
  if (shape.current.generation > generation) return;

  const depth = deflationDepth(status);
  if (depth < shape.current.deflation) {
    const step = (now - last) / INFLATE_TRANSITION_TIME_MS;
    shape.current.deflation = Math.max(depth, shape.current.deflation - step);
  } else {
    const step = (now - last) / DEFLATE_TRANSITION_TIME_MS;
    shape.current.deflation = Math.min(depth, shape.current.deflation + step);
  }

  const focus = focusIntensity(status);
  if (focus < shape.current.focus) {
    const step = (now - last) / RELAX_TRANSITION_TIME_MS;
    shape.current.focus = Math.max(focus, shape.current.focus - step);
  } else {
    const step = (now - last) / FOCUS_TRANSITION_TIME_MS;
    shape.current.focus = Math.min(focus, shape.current.focus + step);
  }

  if (shape.current.deflation !== depth || shape.current.focus !== focus) {
    requestAnimationFrame((ts) => {
      doTransition(generation, status, shape, now, ts);
    });
  }
};

const Orb: FC<Props> = ({ width, height, agentVolume, userVolume, status }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const shape = useRef<Shape>({
    generation: 0,
    time: 0,
    deflation: deflationDepth(status),
    focus: focusIntensity(status),
    agentNoise: Array(LINE_COUNT + CHATTER_WINDOW_SIZE).fill(agentVolume),
    userNoise: Array(LINE_COUNT + CHATTER_WINDOW_SIZE).fill(userVolume),
  });

  useEffect(() => {
    if (canvas.current) {
      const context = canvas.current.getContext("2d");
      if (context) {
        const now = performance.now();
        requestAnimationFrame((t) => {
          draw(context, shape, now, t);
        });
      }
    }
  }, []);

  useEffect(() => {
    shape.current.generation += 1;
    requestAnimationFrame((t) => {
      doTransition(shape.current.generation, status, shape, t);
    });
  }, [status]);

  useEffect(() => {
    shape.current.agentNoise.shift();
    shape.current.agentNoise.push(agentVolume);
  }, [agentVolume]);

  useEffect(() => {
    shape.current.userNoise.shift();
    shape.current.userNoise.push(userVolume);
  }, [userVolume]);

  return <canvas ref={canvas} width={width} height={height} />;
};

export default Orb;
