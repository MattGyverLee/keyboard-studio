// Centralised hash-based navigation helper.
//
// All route changes must go through navigateTo() — do not assign
// window.location.hash directly in component files.

export type RouteId =
  | 'survey'
  | 'preview'
  | 'output';

export function navigateTo(route: RouteId): void {
  window.location.hash = route;
}
