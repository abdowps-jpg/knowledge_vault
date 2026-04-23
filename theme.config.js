/** @type {const} */
const themeColors = {
  primary: { light: '#0a7ea4', dark: '#0a7ea4' },
  background: { light: '#ffffff', dark: '#151718' },
  surface: { light: '#f5f5f5', dark: '#1e2022' },
  foreground: { light: '#11181C', dark: '#ECEDEE' },
  muted: { light: '#687076', dark: '#9BA1A6' },
  border: { light: '#E5E7EB', dark: '#334155' },
  success: { light: '#22C55E', dark: '#4ADE80' },
  warning: { light: '#F59E0B', dark: '#FBBF24' },
  error: { light: '#EF4444', dark: '#F87171' },
};

// Border-radius scale. Tailwind `rounded-md` → radii.md, etc.
// `pill` is for circular / chip buttons.
const radii = { none: 0, sm: 6, md: 8, lg: 12, xl: 16, pill: 9999 };

// 4/8-based spacing scale. `md` is the card-internal default.
const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 40 };

// Shadow stacks. Always include the iOS triple + Android elevation so the
// shadow renders cross-platform. `card` is subtle; `overlay` is for
// toasts/bottom-sheets; `fab` is for floating action buttons.
const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  overlay: {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
};

module.exports = { themeColors, radii, space, shadows };
