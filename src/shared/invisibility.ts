// Content-protection availability and display state (capture-invisibility spec,
// task 8.1). setContentProtection excludes a window from screen capture and
// recording on Windows and macOS; Linux has no such API (design.md), so there
// the control is disabled and the UI must not claim the window is hidden - it
// recommends HOST + VIEWER mode instead.

export interface ContentProtection {
  /** The OS can exclude the window from capture. */
  supported: boolean;
  /** The window is currently excluded from capture (only meaningful when supported). */
  hidden: boolean;
  /** The hide control is disabled (unsupported OS). */
  disabled: boolean;
  /** Text to show in the window. */
  label: string;
}

export function contentProtectionSupported(platform: NodeJS.Platform): boolean {
  return platform === "win32" || platform === "darwin";
}

/** The protection state to apply and display for a platform and requested hide flag. */
export function contentProtectionState(platform: NodeJS.Platform, hidden: boolean): ContentProtection {
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
