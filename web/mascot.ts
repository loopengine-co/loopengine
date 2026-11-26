// LoopEngine's mascot: a small robot with a rounded helmet, a dark visor
// and teal eyes that blink now and then, an antenna tipped in the accent
// colour, and two short arms (it perches on the edge of what it sits on).
// Plain SVG and CSS, no image file, so it's crisp at any size, follows the
// theme, and loads nothing. Used on Home and Schedules.

export const MASCOT_CSS = `
  .le-mascot .le-mascot-eye { transform-box: fill-box; transform-origin: center; animation: le-mascot-blink 6s infinite; }
  .le-mascot .le-mascot-tip { animation: le-mascot-glow 3s ease-in-out infinite; }
  @keyframes le-mascot-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
  @keyframes le-mascot-glow { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) { .le-mascot .le-mascot-eye, .le-mascot .le-mascot-tip { animation: none; } }
`

/** The mascot at `size` pixels wide. */
export function mascotSvg(size: number): string {
  return `<svg class="le-mascot" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="leMascotHead" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5254"/><stop offset="1" stop-color="#1c2224"/></linearGradient>
    <linearGradient id="leMascotBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4244"/><stop offset="1" stop-color="#1c2224"/></linearGradient>
  </defs>
  <path d="M32 5.5v6" stroke="#2a3133" stroke-width="2.4" stroke-linecap="round"/>
  <circle class="le-mascot-tip" cx="32" cy="4.5" r="3" fill="var(--accent)"/>
  <rect x="11" y="10.5" width="42" height="30" rx="15" fill="url(#leMascotHead)"/>
  <rect x="13.5" y="12.5" width="37" height="8" rx="4" fill="#ffffff" opacity=".08"/>
  <rect x="17.5" y="17" width="29" height="16" rx="8" fill="#0b1012"/>
  <rect class="le-mascot-eye" x="23.5" y="20.5" width="5.5" height="9" rx="2.75" fill="#5ff0d2"/>
  <rect class="le-mascot-eye" x="35" y="20.5" width="5.5" height="9" rx="2.75" fill="#5ff0d2"/>
  <rect x="27.5" y="40" width="9" height="4.5" rx="2" fill="#2a3133"/>
  <rect x="21" y="43.5" width="22" height="11" rx="5.5" fill="url(#leMascotBody)"/>
  <path d="M22 47.5c-4.5 1.2-6.5 4.6-7 9.5" stroke="#2a3133" stroke-width="4" stroke-linecap="round"/>
  <path d="M42 47.5c4.5 1.2 6.5 4.6 7 9.5" stroke="#2a3133" stroke-width="4" stroke-linecap="round"/>
</svg>`
}
