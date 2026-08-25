const SIDES = Object.freeze(["left", "right"]);

export function initializeWorkspaceShell(root = document, { initialLeftExpanded = false } = {}) {
  const shell = root.getElementById("chat");
  if (!shell) return { collapseAll() {}, destroy() {} };

  const rails = Object.fromEntries(SIDES.map(side => [side, {
    button: root.getElementById(`${side}-rail-toggle`),
    body: root.getElementById(`${side}-rail-body`),
    className: `${side}-expanded`,
  }]));
  if (SIDES.some(side => !rails[side].button || !rails[side].body)) {
    throw new Error("workspace-shell-controls-missing");
  }

  function setExpanded(side, expanded) {
    const rail = rails[side];
    shell.classList.toggle(rail.className, expanded);
    rail.button.setAttribute("aria-expanded", String(expanded));
    rail.button.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${side} panel`);
    rail.body.setAttribute("aria-hidden", String(!expanded));
    rail.body.inert = !expanded;
  }

  function collapseAll() {
    for (const side of SIDES) setExpanded(side, false);
  }

  const clickHandlers = Object.fromEntries(SIDES.map(side => [side, () => {
    const expanded = rails[side].button.getAttribute("aria-expanded") === "true";
    setExpanded(side, !expanded);
  }]));
  for (const side of SIDES) rails[side].button.addEventListener("click", clickHandlers[side]);

  const onKeydown = event => {
    if (event.key === "Escape") collapseAll();
  };
  root.addEventListener("keydown", onKeydown);
  collapseAll();
  if (initialLeftExpanded) setExpanded("left", true);

  return {
    collapseAll,
    destroy() {
      root.removeEventListener?.("keydown", onKeydown);
      for (const side of SIDES) {
        rails[side].button.removeEventListener?.("click", clickHandlers[side]);
      }
    },
  };
}
