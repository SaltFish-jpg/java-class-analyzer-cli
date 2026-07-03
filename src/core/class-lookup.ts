import path from 'node:path';
import type { ClassIndexEntry, ProjectClassIndex } from './project-index.js';

export interface ClassResolution {
  className: string;
  selected: ClassIndexEntry;
  conflicts: ClassIndexEntry[];
}

export interface ClassSearchResult {
  className: string;
  simpleName: string;
  selected: ClassIndexEntry;
  conflicts: ClassIndexEntry[];
  score: number;
}

export function resolveClass(index: ProjectClassIndex, className: string): ClassResolution {
  const entries = index.classes[className];

  if (!entries?.length) {
    const suggestions = searchClasses(index, className, 8).map((result) => result.className);
    const suffix = suggestions.length ? ` Did you mean: ${suggestions.join(', ')}` : '';
    throw new Error(`Class not found in project classpath index: ${className}.${suffix}`);
  }

  const sorted = [...entries].sort((left, right) => left.order - right.order);
  return {
    className,
    selected: sorted[0],
    conflicts: sorted.slice(1),
  };
}

export function searchClasses(index: ProjectClassIndex, query: string, limit = 50): ClassSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const results: ClassSearchResult[] = [];

  for (const [className, entries] of Object.entries(index.classes)) {
    const selected = [...entries].sort((left, right) => left.order - right.order)[0];
    const simpleName = getSimpleName(className);
    const score = scoreClassName(className, simpleName, normalizedQuery);

    if (score <= 0) {
      continue;
    }

    results.push({
      className,
      simpleName,
      selected,
      conflicts: entries.length > 1 ? entries.slice(1) : [],
      score,
    });
  }

  return results
    .sort((left, right) => right.score - left.score || left.selected.order - right.selected.order || left.className.localeCompare(right.className))
    .slice(0, limit);
}

export function formatEntrySource(entry: ClassIndexEntry): string {
  return entry.coordinate ?? path.normalize(entry.jarPath);
}

function scoreClassName(className: string, simpleName: string, normalizedQuery: string): number {
  const full = className.toLowerCase();
  const simple = simpleName.toLowerCase();

  if (full === normalizedQuery) {
    return 1000;
  }

  if (simple === normalizedQuery) {
    return 900;
  }

  if (full.endsWith(`.${normalizedQuery}`)) {
    return 850;
  }

  if (simple.startsWith(normalizedQuery)) {
    return 750;
  }

  if (full.includes(normalizedQuery)) {
    return 650;
  }

  if (isSubsequence(normalizedQuery, simple) || isSubsequence(normalizedQuery, full)) {
    return 400;
  }

  return 0;
}

function getSimpleName(className: string): string {
  const dot = className.lastIndexOf('.');
  return dot >= 0 ? className.slice(dot + 1) : className;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let needleIndex = 0;

  for (const char of haystack) {
    if (char === needle[needleIndex]) {
      needleIndex += 1;
      if (needleIndex === needle.length) {
        return true;
      }
    }
  }

  return false;
}
