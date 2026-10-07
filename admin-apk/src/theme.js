// src/theme.js — Premium design system
export const colors = {
  bg:          '#05060f',
  bgMid:       '#0d0f1e',
  bgCard:      '#12142a',
  glass:       'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.12)',
  accent:      '#7c6dfa',
  accent2:     '#4fc3f7',
  accentDark:  '#5a4fe0',
  success:     '#00e5a0',
  danger:      '#ff4d6d',
  warn:        '#ffb703',
  text1:       '#f0f0ff',
  text2:       'rgba(240,240,255,0.65)',
  text3:       'rgba(240,240,255,0.38)',
  // Gradients
  gradPrimary: ['#7c6dfa', '#4fc3f7'],
  gradSuccess: ['#00e5a0', '#00b8d4'],
  gradDanger:  ['#ff4d6d', '#ff8a5c'],
  gradWarn:    ['#ffb703', '#ff8a00'],
  gradDark:    ['#1a1d3a', '#0d0f1e'],
};

export const typography = {
  display: 'System',
  body:    'System',
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  glow: (color) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  }),
};

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32,
};

export const borderRadius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 999,
};
