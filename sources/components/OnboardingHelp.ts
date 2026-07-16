import m from "mithril";

const COMPLETED_KEY = "ulpc:onboarding-completed:v1";

type TourStep = {
  title: string;
  body: string;
  target: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    title: "Choose your base",
    body: "Start with Technical Body Type, then choose a compatible body or skin. This base controls which art layers fit.",
    target: "#category-tree-panel",
  },
  {
    title: "Browse, equip, and remove",
    body: "Open a category and select an item card to equip it. Select the equipped card again to remove it; search and filters narrow long lists.",
    target: "#category-tree-panel",
  },
  {
    title: "Understand compatibility",
    body: "Compatible items match the current body, animation, and license filters. Disabled or hidden items will not render correctly with the current choices.",
    target: "#category-tree-panel",
  },
  {
    title: "Preview and save",
    body: "Use the animation controls beside the character to check movement. Name the character in Presentation details and save a preset to keep the setup locally.",
    target: "#preview-column",
  },
  {
    title: "Export your sprite sheet",
    body: "Open Export for PNG, animation, ZIP, and preset options. Save PNG is the fastest way to download the full sheet.",
    target: ".creator-bottom-bar",
  },
];

const HELP_ARTICLES = [
  [
    "Choose a base character",
    "Open Body and select a Technical Body Type. Pick body and skin layers marked compatible before adding equipment.",
  ],
  [
    "Browse categories",
    "Use category tabs to move between body, hair, clothing, armor, weapons, and effects. Search by asset name or keyword and use filters for compatible, equipped, favorite, or recent items.",
  ],
  [
    "Equip or remove items",
    "Select an available item card to equip it. Selecting the same equipped card again removes it. Choosing another item in its layer group replaces the previous one.",
  ],
  [
    "Compatibility",
    "Compatibility checks the technical body type, selected animation, asset requirements, and active license filters. The Compatible filter hides choices that cannot be rendered reliably.",
  ],
  [
    "Preview animations",
    "Use the preview panel's animation and direction controls. Previewing does not change the exported artwork; it lets you inspect frames before download.",
  ],
  [
    "Save a character",
    "Add a name under Presentation details, then save a preset for reuse in this browser. Export a Character preset JSON when you need a portable backup.",
  ],
  [
    "Export a sprite sheet",
    "Select Export, choose the full PNG or a focused animation/ZIP format, review validation messages, and download. Save PNG provides a quick full-sheet export.",
  ],
  [
    "Colors and variants",
    "Items may offer variants and palette recolors. A body-color matching option keeps supported layers aligned with the selected base palette.",
  ],
] as const;

type LocalState = {
  touring: boolean;
  step: number;
  helpOpen: boolean;
  query: string;
  returnFocus: HTMLElement | null;
  helpListener?: EventListener;
  keyListener?: (event: KeyboardEvent) => void;
};

function canUseStorage(): boolean {
  try {
    return localStorage.getItem(COMPLETED_KEY) === "true";
  } catch {
    return true;
  }
}

function focusDialog(id: string): void {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

function finish(local: LocalState): void {
  local.touring = false;
  try {
    localStorage.setItem(COMPLETED_KEY, "true");
  } catch {
    // The tour still dismisses when storage is unavailable.
  }
  local.returnFocus?.focus();
}

export const OnboardingHelp: m.Component<Record<string, never>, LocalState> = {
  oninit(vnode) {
    vnode.state.touring = !canUseStorage();
    vnode.state.step = 0;
    vnode.state.helpOpen = false;
    vnode.state.query = "";
    vnode.state.returnFocus = null;
    vnode.state.helpListener = ((event: CustomEvent<{ topic?: string }>) => {
      vnode.state.returnFocus = document.activeElement as HTMLElement;
      vnode.state.query = event.detail?.topic ?? "";
      vnode.state.helpOpen = true;
      focusDialog("creator-help-dialog");
      m.redraw();
    }) as EventListener;
    window.addEventListener("ulpc:open-help", vnode.state.helpListener);
    vnode.state.keyListener = (event) => {
      if (!vnode.state.touring && !vnode.state.helpOpen) return;
      if (event.key === "Escape") {
        if (vnode.state.touring) finish(vnode.state);
        else {
          vnode.state.helpOpen = false;
          vnode.state.returnFocus?.focus();
        }
        m.redraw();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(
        "[data-active-dialog='true']",
      );
      const focusable = dialog?.querySelectorAll<HTMLElement>(
        "button,input,[href],[tabindex]:not([tabindex='-1'])",
      );
      if (!focusable?.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", vnode.state.keyListener);
  },
  oncreate(vnode) {
    if (vnode.state.touring) focusDialog("onboarding-dialog");
  },
  onremove(vnode) {
    if (vnode.state.helpListener)
      window.removeEventListener("ulpc:open-help", vnode.state.helpListener);
    if (vnode.state.keyListener)
      document.removeEventListener("keydown", vnode.state.keyListener);
  },
  view(vnode) {
    const local = vnode.state;
    const openTour = (event: Event) => {
      local.returnFocus = event.currentTarget as HTMLElement;
      local.helpOpen = false;
      local.step = 0;
      local.touring = true;
      focusDialog("onboarding-dialog");
    };
    const closeHelp = () => {
      local.helpOpen = false;
      local.returnFocus?.focus();
    };
    const q = local.query.trim().toLowerCase();
    const articles = HELP_ARTICLES.filter(
      ([title, body]) => !q || `${title} ${body}`.toLowerCase().includes(q),
    );

    return m("div.creator-assistance", [
      m(
        "button.btn.btn-outline-light.btn-sm.creator-help-launch",
        {
          type: "button",
          onclick: (event: Event) => {
            local.returnFocus = event.currentTarget as HTMLElement;
            local.helpOpen = true;
            local.query = "";
            focusDialog("creator-help-dialog");
          },
          "aria-haspopup": "dialog",
        },
        [m("i.bi.bi-question-circle.me-1", { "aria-hidden": "true" }), "Help"],
      ),
      local.touring
        ? m("div.onboarding-layer", { role: "presentation" }, [
            m(
              "div.onboarding-callout",
              {
                id: "onboarding-dialog",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "onboarding-title",
                tabindex: "-1",
                "data-active-dialog": "true",
              },
              [
                m(
                  "div.onboarding-progress",
                  `Step ${local.step + 1} of ${TOUR_STEPS.length}`,
                ),
                m(
                  "h2.h5",
                  { id: "onboarding-title" },
                  TOUR_STEPS[local.step]!.title,
                ),
                m("p", TOUR_STEPS[local.step]!.body),
                m("div.d-flex.flex-wrap.gap-2", [
                  local.step
                    ? m(
                        "button.btn.btn-outline-secondary",
                        {
                          type: "button",
                          onclick: () => {
                            local.step--;
                            focusDialog("onboarding-dialog");
                          },
                        },
                        "Back",
                      )
                    : null,
                  m(
                    "button.btn.btn-link.ms-auto",
                    { type: "button", onclick: () => finish(local) },
                    "Skip tour",
                  ),
                  m(
                    "button.btn.btn-warning",
                    {
                      type: "button",
                      onclick: () => {
                        if (local.step === TOUR_STEPS.length - 1) finish(local);
                        else {
                          local.step++;
                          document
                            .querySelector(TOUR_STEPS[local.step]!.target)
                            ?.scrollIntoView({
                              block: "center",
                              behavior: "smooth",
                            });
                          focusDialog("onboarding-dialog");
                        }
                      },
                    },
                    local.step === TOUR_STEPS.length - 1
                      ? "Start creating"
                      : "Next",
                  ),
                ]),
              ],
            ),
          ])
        : null,
      local.helpOpen
        ? m(
            "div.help-modal-backdrop",
            {
              onclick: (event: Event) => {
                if (event.target === event.currentTarget) closeHelp();
              },
            },
            m(
              "section.help-modal",
              {
                id: "creator-help-dialog",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "creator-help-title",
                tabindex: "-1",
                "data-active-dialog": "true",
              },
              [
                m("header.help-modal__header", [
                  m("div", [
                    m("span.creator-kicker", "Adventurer's handbook"),
                    m(
                      "h2.h4.mb-0",
                      { id: "creator-help-title" },
                      "Creator help",
                    ),
                  ]),
                  m("button.btn-close", {
                    type: "button",
                    "aria-label": "Close help",
                    onclick: closeHelp,
                  }),
                ]),
                m("div.help-modal__body", [
                  m("label.form-label", { for: "help-search" }, "Search help"),
                  m("input.form-control.mb-3", {
                    id: "help-search",
                    type: "search",
                    placeholder: "Try “compatibility” or “export”",
                    value: local.query,
                    oninput: (event: Event) =>
                      (local.query = (event.target as HTMLInputElement).value),
                  }),
                  m(
                    "div.help-articles",
                    articles.length
                      ? articles.map(([title, body]) =>
                          m("article.help-article", [
                            m("h3.h6", title),
                            m("p.mb-0", body),
                          ]),
                        )
                      : m(
                          "p.text-muted",
                          "No help topics match. Try a broader word.",
                        ),
                  ),
                ]),
                m("footer.help-modal__footer", [
                  m(
                    "button.btn.btn-outline-dark",
                    { type: "button", onclick: openTour },
                    "Restart guided tour",
                  ),
                  m(
                    "button.btn.btn-dark",
                    { type: "button", onclick: closeHelp },
                    "Done",
                  ),
                ]),
              ],
            ),
          )
        : null,
    ]);
  },
};

export function openContextHelp(topic = ""): void {
  window.dispatchEvent(
    new CustomEvent("ulpc:open-help", { detail: { topic } }),
  );
}
