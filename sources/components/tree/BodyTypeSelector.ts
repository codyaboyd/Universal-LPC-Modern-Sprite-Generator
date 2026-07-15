// Body type selector component (styled as tree category)
import m from "mithril";
import { state } from "../../state/state.ts";
import { BODY_TYPES } from "../../state/constants.ts";
import { capitalize } from "../../utils/helpers.ts";

type State = { isExpanded: boolean };

export const BodyTypeSelector: m.Component<Record<string, never>, State> = {
  oninit(vnode) {
    vnode.state.isExpanded = true; // Start expanded by default
  },
  view(vnode) {
    return m("div.mb-3", [
      m(
        "div.tree-label",
        {
          onclick: () => {
            vnode.state.isExpanded = !vnode.state.isExpanded;
          },
        },
        [
          m("span.tree-arrow", {
            class: vnode.state.isExpanded ? "expanded" : "collapsed",
          }),
          m("span.has-text-weight-semibold", "Technical Body Type"),
        ],
      ),
      vnode.state.isExpanded
        ? m("div.ml-4.mt-2", [
            m(
              "p.is-size-7.has-text-grey.ml-4.mb-2",
              "These labels reflect LPC asset compatibility slots, not character identity.",
            ),
            m(
              "div.buttons.ml-4",
              BODY_TYPES.map((type) =>
                m(
                  "button.button.is-small",
                  {
                    class: state.bodyType === type ? "is-primary" : "",
                    onclick: () => {
                      state.bodyType = type;
                    },
                  },
                  capitalize(type),
                ),
              ),
            ),
          ])
        : null,
    ]);
  },
};
