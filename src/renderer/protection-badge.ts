// Capture-protection indicator for the hint window (capture-invisibility spec,
// task 8.1). Shows whether the window is hidden from screen capture, or, on an
// OS without the capability, that hiding is unavailable and HOST + VIEWER mode
// is the way.
//
// The derivation mirrors shared/invisibility.ts (the authority the main process
// uses to actually call setContentProtection). It is restated here, not imported,
// because the renderer tsconfig keeps src/shared out of its rootDir and the
// sandboxed preload cannot require local modules - so the renderer derives the
// view from the platform string the preload exposes, the same way source-badge
// derives its label from kind/health.

export type ContentProtection = {
  supported: boolean;
  hidden: boolean;
  disabled: boolean;
  label: string;
};

export function contentProtectionSupported(platform: string): boolean {
  return platform === "win32" || platform === "darwin";
}

export function contentProtectionState(platform: string, hidden: boolean): ContentProtection {
  if (!contentProtectionSupported(platform)) {
    return {
      supported: false,
      hidden: false,
      disabled: true,
      label: "Hiding from capture is not supported on this OS - use HOST + VIEWER mode",
    };
  }
  return {
    supported: true,
    hidden,
    disabled: false,
    label: hidden ? "Hidden from capture" : "Visible to capture",
  };
}

/** Paint the protection state; dataset drives styling (disabled, hidden). */
export function renderProtection(el: HTMLElement, state: ContentProtection): void {
  el.textContent = state.label;
  el.dataset.disabled = String(state.disabled);
  el.dataset.hidden = String(state.hidden);
}

/** Wire the hide-from-capture toggle. On an unsupported OS the button is disabled.
 *  Otherwise each click flips the hide state and reports it; the caller repaints
 *  the indicator and asks the main process to call setContentProtection. */
export function bindProtectionToggle(
  button: HTMLButtonElement,
  state: ContentProtection,
  onToggle: (hidden: boolean) => void,
): void {
  button.disabled = state.disabled;
  if (state.disabled) return;
  let hidden = state.hidden;
  button.addEventListener("click", () => {
    hidden = !hidden;
    onToggle(hidden);
  });
}
