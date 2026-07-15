// RPG Character Preview Stage component
import m from "mithril";
import { state } from "../../state/state.ts";
import { ANIMATIONS } from "../../state/constants.ts";
import {
  repaintStaticPreviewFrameForTests,
  setPreviewAnimation,
  startPreviewAnimation,
  stopPreviewAnimation,
  getCustomAnimations,
} from "../../canvas/preview-animation.ts";
import {
  initPreviewCanvas,
  setPreviewCanvasZoom,
} from "../../canvas/preview-canvas.ts";
import { PreviewMetadataLoadingOverlay } from "./PreviewMetadataLoadingOverlay.ts";

type PreviewCanvasAttrs = {
  selectedAnimation: string;
  zoomLevel: number;
  animationEnabled: boolean;
  onFrameCycleUpdate: (frameCycle: string) => void;
};

type PreviewCanvasState = {
  lastAnimation: string;
  lastAnimationEnabled: boolean;
};

const PreviewCanvas: m.Component<PreviewCanvasAttrs, PreviewCanvasState> = {
  oncreate(vnode) {
    const canvas = vnode.dom as HTMLCanvasElement;
    const { selectedAnimation, animationEnabled, onFrameCycleUpdate } =
      vnode.attrs;

    if (!window.canvasRenderer) {
      console.error("Canvas renderer not available yet");
      return;
    }

    initPreviewCanvas(canvas);
    setPreviewCanvasZoom(vnode.attrs.zoomLevel);
    const frames = setPreviewAnimation(selectedAnimation);
    if (animationEnabled) startPreviewAnimation();
    else repaintStaticPreviewFrameForTests();

    if (frames) onFrameCycleUpdate(frames.join("-"));
    vnode.state.lastAnimation = selectedAnimation;
    vnode.state.lastAnimationEnabled = animationEnabled;
  },
  onupdate(vnode) {
    const { selectedAnimation, animationEnabled } = vnode.attrs;

    if (window.canvasRenderer) {
      if (vnode.state.lastAnimation !== selectedAnimation) {
        stopPreviewAnimation();
        setPreviewAnimation(selectedAnimation);
        initPreviewCanvas(vnode.dom as HTMLCanvasElement);
        if (animationEnabled) startPreviewAnimation();
        vnode.state.lastAnimation = selectedAnimation;
      }

      if (vnode.state.lastAnimationEnabled !== animationEnabled) {
        if (animationEnabled) startPreviewAnimation();
        else stopPreviewAnimation();
        vnode.state.lastAnimationEnabled = animationEnabled;
      }

      setPreviewCanvasZoom(vnode.attrs.zoomLevel);
      repaintStaticPreviewFrameForTests();
    }
  },
  onremove() {
    if (window.canvasRenderer) stopPreviewAnimation();
  },
  view() {
    return m("canvas#previewAnimations.rpg-preview-stage__canvas", {
      "aria-label": "Assembled LPC character preview",
    });
  },
};

type AnimationOption = { value: string; label: string };
type StageBackground = "transparent" | "tavern" | "forest" | "arcane";

type AnimationPreviewState = {
  selectedAnimation: string;
  zoomLevel: number;
  frameCycle: string;
  showGrid: boolean;
  background: StageBackground;
  transparentBackground: boolean;
  animationEnabled: boolean;
  showRune: boolean;
  isPanning: boolean;
  panStartX: number;
  panStartY: number;
  scrollStartLeft: number;
  scrollStartTop: number;
};

const BACKGROUNDS: { value: StageBackground; label: string }[] = [
  { value: "transparent", label: "Transparent" },
  { value: "tavern", label: "Moonlit tavern" },
  { value: "forest", label: "Enchanted forest" },
  { value: "arcane", label: "Arcane hall" },
];

function getAnimationOptions(): AnimationOption[] {
  const customAnims = Object.keys(getCustomAnimations());
  return [
    ...ANIMATIONS,
    ...customAnims.map((anim) => ({
      value: anim,
      label: anim.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    })),
  ];
}

function clampZoom(zoom: number): number {
  return Math.min(4, Math.max(0.5, Number(zoom.toFixed(2))));
}

function setZoom(vnode: { state: AnimationPreviewState }, zoom: number) {
  vnode.state.zoomLevel = clampZoom(zoom);
  state.previewCanvasZoomLevel = vnode.state.zoomLevel;
  if (window.canvasRenderer) setPreviewCanvasZoom(vnode.state.zoomLevel);
}

function fitToStage(vnode: { state: AnimationPreviewState }) {
  const root = document.getElementById("mithril-preview");
  const viewport = root?.querySelector(
    ".rpg-preview-stage__viewport",
  ) as HTMLElement | null;
  const canvas = root?.querySelector(
    "#previewAnimations",
  ) as HTMLCanvasElement | null;
  if (!viewport || !canvas || !canvas.width || !canvas.height) return;

  const availableWidth = Math.max(1, viewport.clientWidth - 96);
  const availableHeight = Math.max(1, viewport.clientHeight - 96);
  setZoom(
    vnode,
    Math.min(4, availableWidth / canvas.width, availableHeight / canvas.height),
  );
}

function requestStageFullscreen() {
  const stage = document.querySelector(
    ".rpg-preview-stage",
  ) as HTMLElement | null;
  if (!stage) return;
  if (document.fullscreenElement) void document.exitFullscreen();
  else void stage.requestFullscreen?.();
}

export const AnimationPreview: m.Component<
  Record<string, never>,
  AnimationPreviewState
> = {
  oninit(vnode) {
    vnode.state.selectedAnimation = "walk";
    vnode.state.zoomLevel = state.previewCanvasZoomLevel || 2;
    vnode.state.frameCycle = "";
    vnode.state.showGrid = true;
    vnode.state.background = "forest";
    vnode.state.transparentBackground = false;
    vnode.state.animationEnabled = true;
    vnode.state.showRune = true;
    vnode.state.isPanning = false;
    if (window.canvasRenderer) {
      const frames = setPreviewAnimation("walk");
      vnode.state.frameCycle = frames ? frames.join("-") : "";
    }
  },
  onupdate(vnode) {
    vnode.state.zoomLevel =
      state.previewCanvasZoomLevel || vnode.state.zoomLevel;
  },
  view(vnode) {
    const allAnimations = getAnimationOptions();
    if (
      !allAnimations.find(
        (anim) => anim.value === vnode.state.selectedAnimation,
      )
    ) {
      vnode.state.selectedAnimation = "walk";
      state.selectedAnimation = "walk";
    }

    const effectiveBackground = vnode.state.transparentBackground
      ? "transparent"
      : vnode.state.background;
    const zoomPercent = `${Math.round(vnode.state.zoomLevel * 100)}%`;
    const canPan = vnode.state.zoomLevel > 1;

    return m("section.rpg-preview-stage", [
      m(
        "div.rpg-preview-stage__toolbar",
        { "aria-label": "Preview stage toolbar" },
        [
          m(
            "button.button.is-small",
            {
              type: "button",
              onclick: () => setZoom(vnode, vnode.state.zoomLevel - 0.25),
              title: "Zoom out",
            },
            [m("i.bi.bi-zoom-out", { "aria-hidden": true }), " Zoom out"],
          ),
          m("output.rpg-preview-stage__zoom", zoomPercent),
          m(
            "button.button.is-small",
            {
              type: "button",
              onclick: () => setZoom(vnode, vnode.state.zoomLevel + 0.25),
              title: "Zoom in",
            },
            [m("i.bi.bi-zoom-in", { "aria-hidden": true }), " Zoom in"],
          ),
          m(
            "button.button.is-small",
            { type: "button", onclick: () => fitToStage(vnode) },
            "Fit",
          ),
          m(
            "button.button.is-small",
            {
              type: "button",
              class: vnode.state.showGrid ? "is-info" : "",
              onclick: () => (vnode.state.showGrid = !vnode.state.showGrid),
            },
            "Grid",
          ),
          m("label.rpg-preview-stage__check", [
            m("input[type=checkbox]", {
              checked: vnode.state.transparentBackground,
              onchange: (e: Event) =>
                (vnode.state.transparentBackground = (
                  e.target as HTMLInputElement
                ).checked),
            }),
            " Transparent",
          ]),
          m("div.select.is-small", [
            m(
              "select",
              {
                value: vnode.state.background,
                disabled: vnode.state.transparentBackground,
                onchange: (e: Event) =>
                  (vnode.state.background = (e.target as HTMLSelectElement)
                    .value as StageBackground),
              },
              BACKGROUNDS.map((bg) =>
                m("option", { value: bg.value }, bg.label),
              ),
            ),
          ]),
          m(
            "button.button.is-small",
            { type: "button", onclick: () => requestStageFullscreen() },
            [m("i.bi.bi-fullscreen", { "aria-hidden": true }), " Fullscreen"],
          ),
          m(
            "button.button.is-small",
            {
              type: "button",
              class: vnode.state.animationEnabled ? "is-primary" : "",
              onclick: () =>
                (vnode.state.animationEnabled = !vnode.state.animationEnabled),
            },
            vnode.state.animationEnabled ? "Pause animation" : "Play animation",
          ),
        ],
      ),
      m("div.rpg-preview-stage__animation-row", [
        m("label", "Animation"),
        m("div.select.is-small", [
          m(
            "select",
            {
              value: vnode.state.selectedAnimation,
              onchange: (e: Event) => {
                const target = e.target as HTMLSelectElement;
                vnode.state.selectedAnimation = target.value;
                state.selectedAnimation = target.value;
                if (window.canvasRenderer) {
                  const frames = setPreviewAnimation(target.value);
                  vnode.state.frameCycle = frames ? frames.join("-") : "";
                }
              },
            },
            allAnimations.map((anim) =>
              m("option", { value: anim.value }, anim.label),
            ),
          ),
        ]),
        m("span.rpg-preview-stage__frames", vnode.state.frameCycle),
      ]),
      m(
        "div",
        {
          class: `rpg-preview-stage__viewport rpg-preview-stage__viewport--${effectiveBackground} ${vnode.state.showGrid ? "rpg-preview-stage__viewport--grid" : ""} ${canPan ? "rpg-preview-stage__viewport--pannable" : ""} ${vnode.state.isPanning ? "is-panning" : ""}`,
          onmousedown: (e: MouseEvent) => {
            if (!canPan) return;
            const el = e.currentTarget as HTMLElement;
            vnode.state.isPanning = true;
            vnode.state.panStartX = e.clientX;
            vnode.state.panStartY = e.clientY;
            vnode.state.scrollStartLeft = el.scrollLeft;
            vnode.state.scrollStartTop = el.scrollTop;
          },
          onmousemove: (e: MouseEvent) => {
            if (!vnode.state.isPanning) return;
            const el = e.currentTarget as HTMLElement;
            el.scrollLeft =
              vnode.state.scrollStartLeft - (e.clientX - vnode.state.panStartX);
            el.scrollTop =
              vnode.state.scrollStartTop - (e.clientY - vnode.state.panStartY);
          },
          onmouseup: () => (vnode.state.isPanning = false),
          onmouseleave: () => (vnode.state.isPanning = false),
        },
        [
          m("div.rpg-preview-stage__parallax", { "aria-hidden": true }, [
            m("span.rpg-preview-stage__ray.rpg-preview-stage__ray--one"),
            m("span.rpg-preview-stage__ray.rpg-preview-stage__ray--two"),
            ...Array.from({ length: 10 }, (_, i) =>
              m("span.rpg-preview-stage__particle", {
                class: `rpg-preview-stage__particle--${i + 1}`,
              }),
            ),
            ...Array.from({ length: 6 }, (_, i) =>
              m("span.rpg-preview-stage__mote", {
                class: `rpg-preview-stage__mote--${i + 1}`,
              }),
            ),
          ]),
          m("div.preview-canvas-root.rpg-preview-stage__character", [
            vnode.state.showRune
              ? m("div.rpg-preview-stage__rune", { "aria-hidden": true })
              : null,
            m(PreviewCanvas, {
              selectedAnimation: vnode.state.selectedAnimation,
              zoomLevel: vnode.state.zoomLevel,
              animationEnabled: vnode.state.animationEnabled,
              onFrameCycleUpdate: (frameCycle) =>
                (vnode.state.frameCycle = frameCycle),
            }),
            state.isRenderingCharacter
              ? m("div.preview-canvas-busy", { "aria-live": "polite" }, [
                  m("span.loading", { "aria-label": "Rendering character" }),
                  m("span.ms-2", "Rendering character…"),
                ])
              : null,
            m(PreviewMetadataLoadingOverlay),
          ]),
        ],
      ),
      state.assetLoadFailures.length
        ? m("div.rpg-preview-stage__error", { role: "alert" }, [
            m("strong", "Some sprite assets failed to load."),
            m(
              "ul",
              state.assetLoadFailures.map((path) => m("li", path)),
            ),
          ])
        : null,
      m(
        "p.rpg-preview-stage__note",
        "Stage backgrounds and decorative effects are preview-only and are never included in exported sprite sheets.",
      ),
    ]);
  },
};
