// The catalogue of structure types. Each type belongs to a category, supports some size tiers and
// has one builder that draws every era. New types only need an entry here (see cat/*.ts).
import type { Category, Size } from './genome';
import type { Ctx } from './parts';
import { RESIDENTIAL } from './cat/residential';
import { INDUSTRIAL } from './cat/industrial';
import { EXTRACTION } from './cat/extraction';
import { COMMERCIAL } from './cat/commercial';
import { MILITARY } from './cat/military';

export interface StructType {
  id: string; cat: Category; sizes: Size[];
  name: string;
  /** name per era (index 0 tribal .. 7 space) when it changes with the technology */
  eraNames?: string[];
  blurb: string;
  build: (x: Ctx) => void;
}

export const TYPES: StructType[] = [...RESIDENTIAL, ...INDUSTRIAL, ...EXTRACTION, ...COMMERCIAL, ...MILITARY];
export const typeById = (id: string) => TYPES.find(t => t.id === id) ?? TYPES[0];
export const typesFor = (cat: Category, size: Size) => TYPES.filter(t => t.cat === cat && t.sizes.includes(size));
export const typeName = (t: StructType, era: number) => t.eraNames?.[era] ?? t.name;
