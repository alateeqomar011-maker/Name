// Line icons for the HUD, touch controls and menus (24px grid, 1.8px stroke, currentColor).
const P = {
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z"/>',
  bolt: '<path d="M13.2 2.8 5.6 13.4h5.6l-1 7.8 7.6-10.6h-5.6l1-7.8Z"/>',
  food: '<path d="M15.5 4.2a4.3 4.3 0 0 1 4.3 4.3c0 2.9-2.6 4.6-5.2 4.9l-3.1 3.1"/><path d="M15.5 4.2c-2.4 0-4.3 2-4.3 4.3 0 1 .3 1.9.9 2.6l-3.4 3.4"/><circle cx="6.6" cy="17.4" r="2.1"/><circle cx="9.2" cy="19.6" r="1.6"/>',
  drop: '<path d="M12 3.2s6.2 6.6 6.2 11a6.2 6.2 0 0 1-12.4 0c0-4.4 6.2-11 6.2-11Z"/><path d="M9.2 15.2a2.9 2.9 0 0 0 2.6 2.8"/>',
  air: '<circle cx="9" cy="14.5" r="4"/><circle cx="16.5" cy="8.5" r="2.6"/><circle cx="17" cy="16.6" r="1.6"/>',
  run: '<circle cx="14.6" cy="4.6" r="1.8"/><path d="M9.6 21l2.4-5.2 2.8 2.4V22"/><path d="M6 11.6l3.2-3.2 3.4.6 2.6 3 3 .6"/><path d="M12.6 9l-1.4 6.8"/>',
  jump: '<path d="M12 19.5V5.5"/><path d="M6.5 11 12 5.5 17.5 11"/><path d="M5 20.5h14"/>',
  hand: '<path d="M8.2 12.6V5.8a1.5 1.5 0 0 1 3 0v5.6"/><path d="M11.2 10.8V4.4a1.5 1.5 0 0 1 3 0v6.6"/><path d="M14.2 11V6a1.5 1.5 0 0 1 3 0v7.4c0 4.2-2.6 7.1-6.2 7.1-2.4 0-3.9-1-5.2-3l-2.3-3.6a1.5 1.5 0 0 1 2.5-1.6l2.2 2.3"/>',
  compass: '<circle cx="12" cy="12" r="8.6"/><path d="m15.6 8.4-2.2 5-5 2.2 2.2-5 5-2.2Z"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 14-14-0.5 9-6 14-14 14Z"/><path d="M5 19 12.5 11.5"/>',
  play: '<path d="M8 5.6v12.8L18.4 12 8 5.6Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  gauge: '<path d="M4.5 16.5a8 8 0 1 1 15 0"/><path d="m12 13.2 4.2-4.2"/><circle cx="12" cy="13.2" r="1.2"/>',
  keys: '<rect x="2.8" y="6.5" width="18.4" height="11" rx="2.2"/><path d="M6.5 10h1M10 10h1M13.5 10h1M17 10h.5M7.5 14h9"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  pack: '<path d="M7 8.5V7a5 5 0 0 1 10 0v1.5"/><rect x="5" y="8.5" width="14" height="12" rx="2.6"/><path d="M9 13.5h6"/>',
  user: '<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0"/>',
  book: '<path d="M4.5 5.5c2.6-1 5-1 7.5.6v13c-2.5-1.6-4.9-1.6-7.5-.6v-13Z"/><path d="M19.5 5.5c-2.6-1-5-1-7.5.6v13c2.5-1.6 4.9-1.6 7.5-.6v-13Z"/>',
  flag: '<path d="M5.5 21V4.5"/><path d="M5.5 5c4-2.2 7 2 13 0v8c-6 2-9-2.2-13 0"/>',
  map: '<path d="m3.5 6.5 5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2v-13Z"/><path d="M9 4.5v13M15 6.5v13"/>',
  camera: '<path d="M4 8.5h3.2L8.8 6h6.4l1.6 2.5H20v10H4v-10Z"/><circle cx="12" cy="13.3" r="3.3"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
