/** Browser checks for install/push guidance (client only). */

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Mac; touch support gives it away.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/** Running as an installed app (Home Screen / desktop window). */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
