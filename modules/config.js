// Published game uses the existing Firebase requests, presence and score services.
export const PREVIEW_MODE = false;
export const BUILD_VERSION = 'livewire-rebuild-20260923-01';
export const QUALITY = matchMedia('(pointer: coarse)').matches ? 'balanced' : 'high';
document.documentElement.dataset.preview = String(PREVIEW_MODE);
