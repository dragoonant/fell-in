// Wasteland palette: rust, sand, faded teal. One place so the 3D scene and the CSS agree.
export const PALETTE = {
  sand: '#c9ad7c',
  sandDark: '#9c8257',
  dust: '#d8c49a',
  rust: '#a4502c',
  rustDark: '#6d3319',
  teal: '#4f8a82',
  tealDark: '#2f5a55',
  steel: '#5c5f5e',
  ink: '#1d1a16',
  bone: '#ece3d0',
} as const

// CSS font stacks only (no hosted fonts). Heading stack leans on installed stencil/condensed faces.
export const FONTS = {
  heading: '"Stencil Std", "Stencil", "Impact", "Haettenschweiler", "Arial Narrow Bold", "Franklin Gothic Medium", sans-serif',
  body: '"Segoe UI", "Trebuchet MS", system-ui, sans-serif',
} as const
