// Do-not-simulate list. These people (or their estates) have publicly objected to AI replicas or
// AI-generated depictions of themselves, or the operator has received a removal request. The catalogue
// refuses to load or import anyone on this list, regardless of source.
//
// Policy exclusions applied when building the library (not enforced by name here):
//   - minors; current heads of state and serving politicians; religious figures and prophets;
//   - people primarily known for crimes or extremism.

import { normalize } from '../../shared/text.ts';

const NAMES = [
  'Scarlett Johansson',
  'Keanu Reeves',
  'Tom Hanks',
  'Morgan Freeman',
  'Taylor Swift',
  'Martin Luther King Jr.',
  'Robin Williams',
  'Bryan Cranston',
  'Celine Dion',
  'Malcolm X',
];

const KEYS = new Set(NAMES.map((n) => normalize(n)));

export function isOptedOut(name: string, id?: string): boolean {
  if (KEYS.has(normalize(name))) return true;
  if (id && KEYS.has(normalize(id.replace(/-/g, ' ')))) return true;
  return extra.has(normalize(name));
}

// Names added at runtime from approved rights-holder removal requests.
const extra = new Set<string>();

export function addOptOut(name: string): void {
  extra.add(normalize(name));
}

export function optOutList(): string[] {
  return [...NAMES, ...extra];
}
