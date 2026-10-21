const chars = (name: string): string[] => Array.from(name.trim());

/**
 * Initiale(n) für einen Avatar: ein Buchstabe, bei gleicher Anfangsinitiale
 * eines anderen Mitglieds die ersten beiden. `names` enthält alle Mitglieder (auch `name`).
 */
export function initials(name: string, names: readonly string[]): string {
  const own = chars(name);
  const first = own[0];
  if (first === undefined) return '?';
  const key = first.toLocaleUpperCase();
  const clash = names.some((other) => {
    if (other === name) return false;
    return chars(other)[0]?.toLocaleUpperCase() === key;
  });
  return own
    .slice(0, clash ? 2 : 1)
    .join('')
    .toLocaleUpperCase();
}
