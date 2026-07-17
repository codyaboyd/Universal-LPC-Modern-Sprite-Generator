import m from "mithril";
import type { CatalogReader } from "../state/catalog.ts";
import { AmbientSettings } from "../ambient-atmosphere.ts";
import { AdvancedTools } from "./advanced/AdvancedTools.ts";
import { Credits } from "./download/Credits.ts";
import { DiagnosticsPanel } from "./DiagnosticsPanel.ts";
import { PowerUserTools } from "./PowerUserTools.ts";
import { openContextHelp } from "./OnboardingHelp.ts";

type MenuName = "settings" | "credits" | "advanced";
type NavigationItemName = MenuName | "help";
type NavigationState = {
  activeMenu: MenuName | null;
  keyHandler: (event: KeyboardEvent) => void;
};

const setMenuOpen = (open: boolean) => {
  document.body.classList.toggle("modal-open", open);
};

const menuDetails: Record<
  NavigationItemName,
  { label: string; icon: string; description: string }
> = {
  help: {
    label: "Help",
    icon: "bi-question-circle",
    description: "Find guidance or restart the introductory tour.",
  },
  settings: {
    label: "Settings",
    icon: "bi-gear",
    description: "Adjust the appearance and performance of the atelier.",
  },
  credits: {
    label: "Credits",
    icon: "bi-people",
    description: "Review the authors and licenses for your selected artwork.",
  },
  advanced: {
    label: "Advanced",
    icon: "bi-tools",
    description: "Open power-user controls, custom assets, and diagnostics.",
  },
};

export const NavigationMenus: m.Component<
  { catalog: CatalogReader },
  NavigationState
> = {
  oninit(vnode) {
    vnode.state.activeMenu = null;
    vnode.state.keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && vnode.state.activeMenu) {
        vnode.state.activeMenu = null;
        setMenuOpen(false);
        m.redraw();
      }
    };
    window.addEventListener("keydown", vnode.state.keyHandler);
  },
  onremove(vnode) {
    window.removeEventListener("keydown", vnode.state.keyHandler);
    setMenuOpen(false);
  },
  view(vnode) {
    const close = () => {
      vnode.state.activeMenu = null;
      setMenuOpen(false);
    };
    const active = vnode.state.activeMenu;

    return [
      m(
        "ul.creator-navigation.nav.gap-2",
        { "aria-label": "Application menus" },
        (Object.keys(menuDetails) as NavigationItemName[]).map((name) => {
          const menu = menuDetails[name];
          return m("li.nav-item", [
            m(
              "button.btn.btn-sm.btn-outline-light.creator-navigation__button",
              {
                type: "button",
                "aria-haspopup": "dialog",
                "aria-expanded": active === name ? "true" : "false",
                onclick: () => {
                  if (name === "help") {
                    openContextHelp();
                    return;
                  }
                  vnode.state.activeMenu = name;
                  setMenuOpen(true);
                },
              },
              [
                m(`i.bi.${menu.icon}.me-1`, { "aria-hidden": "true" }),
                menu.label,
              ],
            ),
          ]);
        }),
      ),
      active
        ? [
            m("div.modal-backdrop.fade.show.creator-menu-backdrop", {
              onclick: close,
              "aria-hidden": "true",
            }),
            m(
              "div.modal.fade.show.d-block.creator-menu-modal",
              {
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": `creator-${active}-menu-title`,
                onclick: (event: MouseEvent) => {
                  if (event.target === event.currentTarget) close();
                },
              },
              [
                m(
                  "div.modal-dialog.modal-dialog-centered.modal-dialog-scrollable",
                  [
                    m("div.modal-content", [
                      m("div.modal-header", [
                        m("div", [
                          m(
                            `h2#creator-${active}-menu-title.h5.modal-title`,
                            menuDetails[active].label,
                          ),
                          m(
                            "p.small.text-muted.mb-0.mt-1",
                            menuDetails[active].description,
                          ),
                        ]),
                        m("button.btn-close", {
                          type: "button",
                          "aria-label": `Close ${menuDetails[active].label} menu`,
                          onclick: close,
                        }),
                      ]),
                      m("div.modal-body.creator-menu-modal__body", [
                        active === "settings" ? m(AmbientSettings) : null,
                        active === "credits"
                          ? m(Credits, { catalog: vnode.attrs.catalog })
                          : null,
                        active === "advanced"
                          ? [
                              m(AdvancedTools),
                              m(PowerUserTools),
                              m(DiagnosticsPanel),
                            ]
                          : null,
                      ]),
                    ]),
                  ],
                ),
              ],
            ),
          ]
        : null,
    ];
  },
};
