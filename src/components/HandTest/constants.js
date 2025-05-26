// /src/components/HandTest/constants.js

// REACTION_TIME_THRESHOLDS, STD_DEV_THRESHOLDS, SCORE_THRESHOLDS remain the same as your latest version
// (e.g., the one adjusted for older adults with arm movement)
export const REACTION_TIME_THRESHOLDS = {
  VERY_FAST: 800,
  GOOD: 1050,
  NORMAL: 1300,
};

export const STD_DEV_THRESHOLDS = {
  CONSISTENT: 150,
  SLIGHT_FLUCTUATION: 270,
};

export const SCORE_THRESHOLDS = {
  EXCELLENT: 80,
  GOOD: 60,
  FAIR: 40,
};

export const SCALE_COLORS = {
  GREEN: '#5cb85c',    // For "Very Fast" / "Consistent"
  YELLOW: '#FFDD57',   // << NEW: Clearer Yellow for "Good" / "Slight Fluctuation"
  ORANGE: '#FFA500',   // True Orange for "Normal Range"
  RED: '#c9302c',       // For "Relatively Slow" / "Larger Fluctuation"
};

export const PERFECT_REACTION_TIME = 400;
export const MAX_REACTION_TIME_FOR_ZERO_SCORE = 1400;