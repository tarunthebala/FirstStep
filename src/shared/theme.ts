/**
 * FirstStep design tokens.
 *
 * Brand values were read from the live CSS of https://www.wacode2026.com/ on 2026-10-23:
 *   :root { --forest:#143e29; --ink:#20271e; --line:#d4d7cb; --muted:#596052; --paper:#f3f2ed; --sage:#c8dfb5 }
 * plus the site's hero gradient (#0c2e1c → #19522f → #3b773f → #a5bf8f → #e2e8d5)
 * and its muted card surface (#dfe6d8).
 *
 * Status colors and the white surface are additions (the reference has no status palette);
 * they were picked to sit inside the same green/earth family and pass WCAG AA for text on paper.
 * The CSS custom properties in src/client/styles/tokens.css mirror this object.
 */
export const tokens = {
  brand: {
    primary: '#143e29', // --forest on wacode2026.com
    secondary: '#19522f', // hero gradient stop
    accent: '#3b773f', // hero gradient stop
    accentSoft: '#c8dfb5', // --sage
    deep: '#0c2e1c', // hero gradient start
    light: '#a5bf8f', // hero gradient stop
  },
  background: {
    page: '#f3f2ed', // --paper
    surface: '#ffffff', // addition
    muted: '#dfe6d8', // card surface on wacode2026.com
  },
  text: {
    primary: '#20271e', // --ink
    secondary: '#596052', // --muted
    inverse: '#f3f2ed',
  },
  border: {
    default: '#d4d7cb', // --line
    strong: '#c3cbbb', // border color on wacode2026.com
  },
  status: {
    success: '#2f6b38',
    successBg: '#e3eedb',
    warning: '#7a5200',
    warningBg: '#f5ebd2',
    error: '#9c2f27',
    errorBg: '#f5dfdb',
  },
  chart: {
    income: '#143e29',
    expenses: '#596052',
    loan: '#3b773f',
    savings: '#a5bf8f',
    shortfall: '#9c2f27',
  },
  font: {
    family: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif',
  },
} as const;
