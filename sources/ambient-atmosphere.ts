import m from "mithril";

const THEME_KEY = "ulpc:ambient-theme";
const EFFECTS_KEY = "ulpc:ambient-effects";
const THEMES = ["arcane-workshop", "forest-camp", "royal-armory"] as const;
type Theme = (typeof THEMES)[number];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  hue: string;
};

const THEME_LABELS: Record<Theme, string> = {
  "arcane-workshop": "Arcane Workshop",
  "forest-camp": "Forest Camp",
  "royal-armory": "Royal Armory",
};

let theme: Theme = readTheme();
let effectsEnabled = readEffectsEnabled();
let lowPower = false;
let reducedMotion = false;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animationFrame = 0;
let particles: Particle[] = [];
let lastTime = 0;

function readTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  return THEMES.includes(saved as Theme) ? (saved as Theme) : "arcane-workshop";
}

function readEffectsEnabled(): boolean {
  return localStorage.getItem(EFFECTS_KEY) !== "false";
}

function isLowPowerDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (
    navigator.hardwareConcurrency <= 4 ||
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) ||
    window.matchMedia("(update: slow)").matches
  );
}

function applyAtmosphereState(): void {
  document.documentElement.dataset.ambientTheme = theme;
  document.documentElement.dataset.ambientEffects = effectsEnabled
    ? "enabled"
    : "disabled";
  document.documentElement.classList.toggle("ambient-low-power", lowPower);
  document.documentElement.classList.toggle(
    "ambient-paused",
    document.hidden || reducedMotion || !effectsEnabled,
  );
}

function resizeCanvas(): void {
  if (!canvas) return;
  const scale = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5);
  canvas.width = Math.floor(window.innerWidth * scale);
  canvas.height = Math.floor(window.innerHeight * scale);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx?.setTransform(scale, 0, 0, scale, 0, 0);
}

function particleColor(): string {
  if (theme === "forest-camp") return "255, 129, 65";
  if (theme === "royal-armory") return "255, 214, 118";
  return Math.random() > 0.45 ? "178, 125, 255" : "118, 218, 255";
}

function seedParticles(): void {
  const count = lowPower ? 18 : 46;
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    vx: (Math.random() - 0.5) * 8,
    vy: -(8 + Math.random() * 18),
    size: 0.8 + Math.random() * 2.4,
    life: Math.random(),
    hue: particleColor(),
  }));
}

function draw(time: number): void {
  animationFrame = window.requestAnimationFrame(draw);
  if (!ctx || !canvas || document.hidden || reducedMotion || !effectsEnabled)
    return;
  const delta = Math.min((time - lastTime) / 1000 || 0.016, 0.05);
  lastTime = time;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.life += delta * 0.12;
    if (p.y < -12 || p.x < -12 || p.x > window.innerWidth + 12 || p.life > 1) {
      p.x = Math.random() * window.innerWidth;
      p.y = window.innerHeight + Math.random() * 40;
      p.vx = (Math.random() - 0.5) * 8;
      p.vy = -(8 + Math.random() * 18);
      p.life = 0;
      p.hue = particleColor();
    }
    const alpha =
      Math.max(0, Math.sin(p.life * Math.PI)) * (lowPower ? 0.28 : 0.5);
    const gradient = ctx.createRadialGradient(
      p.x,
      p.y,
      0,
      p.x,
      p.y,
      p.size * 5,
    );
    gradient.addColorStop(0, `rgba(${p.hue}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${p.hue}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function setTheme(nextTheme: Theme): void {
  theme = nextTheme;
  localStorage.setItem(THEME_KEY, theme);
  seedParticles();
  applyAtmosphereState();
  m.redraw();
}

function setEffectsEnabled(enabled: boolean): void {
  effectsEnabled = enabled;
  localStorage.setItem(EFFECTS_KEY, String(enabled));
  applyAtmosphereState();
  m.redraw();
}

export function initAmbientAtmosphere(): void {
  lowPower = isLowPowerDevice();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion = motionQuery.matches;
  canvas = document.getElementById(
    "ambient-particles",
  ) as HTMLCanvasElement | null;
  ctx = canvas?.getContext("2d", { alpha: true }) ?? null;
  resizeCanvas();
  seedParticles();
  applyAtmosphereState();
  window.addEventListener("resize", () => {
    resizeCanvas();
    seedParticles();
  });
  document.addEventListener("visibilitychange", applyAtmosphereState);
  motionQuery.addEventListener("change", () => {
    reducedMotion = motionQuery.matches;
    applyAtmosphereState();
  });
  animationFrame = window.requestAnimationFrame(draw);
}

export const AmbientSettings: m.Component = {
  onremove() {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
  },
  view() {
    return m(
      "section.ambient-settings",
      { "aria-label": "Visual atmosphere settings" },
      [
        m("label.ambient-settings__field", [
          m("span", "Visual theme"),
          m(
            "select.form-select.form-select-sm",
            {
              value: theme,
              onchange: (event: Event) =>
                setTheme((event.target as HTMLSelectElement).value as Theme),
            },
            THEMES.map((value) => m("option", { value }, THEME_LABELS[value])),
          ),
        ]),
        m("label.form-check.form-switch ambient-settings__toggle", [
          m("input.form-check-input", {
            type: "checkbox",
            checked: effectsEnabled,
            onchange: (event: Event) =>
              setEffectsEnabled((event.target as HTMLInputElement).checked),
          }),
          m("span.form-check-label", "Ambient effects"),
        ]),
        lowPower
          ? m("p.ambient-settings__note", "Simplified for this device")
          : null,
      ],
    );
  },
};
