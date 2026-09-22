// scripts/learning-book/figures.mjs — all book figures, in reading order.
import { FIGURES_A, coverArt } from './figures-a.mjs';
import { FIGURES_B } from './figures-b.mjs';

export { coverArt };
export const FIGURES = [...FIGURES_A, ...FIGURES_B];
