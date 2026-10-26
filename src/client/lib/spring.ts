/**
 * Minimal spring physics for interruptible, velocity-aware motion.
 *
 * Parameters follow Apple's designer-friendly model:
 *  - dampingRatio: 1 = critically damped (no overshoot, the default); < 1 overshoots (use only after a flick).
 *  - response: roughly how quickly the value gets to the target, in seconds. Not a duration.
 *
 * Every animation starts from the spring's *current* value and velocity, so re-targeting mid-flight is
 * continuous — there's no jump and no velocity "brick wall" when a gesture reverses.
 */

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export interface SpringConfig {
  dampingRatio?: number;
  response?: number;
}

export const SPRING = {
  /** Default UI motion: critically damped, quick. */
  default: { dampingRatio: 1, response: 0.35 },
  /** Sheets/drawers released with momentum. */
  sheet: { dampingRatio: 0.8, response: 0.3 },
  /** Repositioning (selection indicators, cards). */
  move: { dampingRatio: 1, response: 0.4 },
} satisfies Record<string, Required<SpringConfig>>;

export class Spring {
  value: number;
  velocity = 0;
  private target: number;
  private raf = 0;
  private last = 0;
  private cfg: Required<SpringConfig> = SPRING.default;
  private onRest: (() => void) | null = null;
  private precision = 0.01;

  constructor(initial: number, private onUpdate: (v: number) => void) {
    this.value = initial;
    this.target = initial;
  }

  /** Jump immediately (used for 1:1 tracking during a drag). */
  set(v: number, velocity = 0) {
    this.stop();
    this.value = v;
    this.target = v;
    this.velocity = velocity;
    this.onUpdate(v);
  }

  /** Animate toward `target` from the current value; `velocity` (units/s) hands off a gesture's speed. */
  to(target: number, cfg: SpringConfig = {}, opts: { velocity?: number; onRest?: () => void; precision?: number } = {}) {
    this.target = target;
    this.precision = opts.precision ?? (Math.abs(target - this.value) > 2 ? 0.5 : 0.002);
    this.cfg = { ...SPRING.default, ...cfg };
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    this.onRest = opts.onRest ?? null;
    if (prefersReducedMotion()) {
      // Reduced motion: no travel. Callers pair this with an opacity change instead.
      this.set(target);
      this.onRest?.();
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number) => {
    const { dampingRatio, response } = this.cfg;
    const k = Math.pow((2 * Math.PI) / response, 2); // stiffness (mass = 1)
    const c = (4 * Math.PI * dampingRatio) / response; // damping coefficient
    let dt = Math.min(0.064, (now - this.last) / 1000);
    this.last = now;
    // Fixed small sub-steps keep the integration stable regardless of frame rate.
    const step = 1 / 240;
    while (dt > 0) {
      const h = Math.min(step, dt);
      const force = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += force * h;
      this.value += this.velocity * h;
      dt -= h;
    }
    const settled = Math.abs(this.value - this.target) < this.precision && Math.abs(this.velocity) < this.precision * 5;
    if (settled) {
      this.value = this.target;
      this.velocity = 0;
      this.raf = 0;
      this.onUpdate(this.value);
      const cb = this.onRest;
      this.onRest = null;
      cb?.();
      return;
    }
    this.onUpdate(this.value);
    this.raf = requestAnimationFrame(this.tick);
  };
}

/** Tracks recent pointer samples so a drag release can hand its velocity to a spring. */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = [];
  add(v: number, t = performance.now()) {
    this.samples.push({ t, v });
    while (this.samples.length && t - this.samples[0].t > 100) this.samples.shift();
  }
  /** Units per second over the last ~100ms. */
  velocity() {
    const s = this.samples;
    if (s.length < 2) return 0;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? (b.v - a.v) / dt : 0;
  }
  reset() {
    this.samples = [];
  }
}

/** Where a flick would come to rest (Apple's exponential-decay projection). */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
