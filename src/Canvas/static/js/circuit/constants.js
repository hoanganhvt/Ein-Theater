// ── Constants ─────────────────────────────────────────────────────

export const GRID_SIZE = 50;          // Grid spacing in network-coordinate units

export const BG_COLOR       = '#f8fafc';     // Clean schematic canvas background

export const DOT_COLOR      = 'rgba(71, 85, 105, 0.35)'; // Visible circuit grid dots

export const COLOR_TRACE    = '#16a34a';     // Standard wire trace (circuit green)

export const COLOR_SELECTED = '#00e07a';     // Selected wire (bright neon green)

export const COLOR_PREVIEW  = 'rgba(0, 224, 122, 0.90)'; // Live preview trace

export const TRACE_WIDTH    = 2.5;           // Wire stroke width

export const DOT_RADIUS     = 1.8;           // Grid dot radius

// ── Module State ──────────────────────────────────────────────────

export const BEND_MODES = ['horizontal', 'vertical', 'l-horizontal', 'l-vertical'];

export const BEND_LABELS = {
    'horizontal':   'Z-Horizontal (H-V-H)',
    'vertical':     'Z-Vertical (V-H-V)',
    'l-horizontal': 'L-Horizontal (H-V)',
    'l-vertical':   'L-Vertical (V-H)'
};
