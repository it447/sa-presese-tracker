/**
 * Formats a display name as "FirstName L." (full first name, first initial of last name).
 * Example: "ALEX KRUGER" → "Alex K.", "john doe smith" → "John S."
 * Single-word names (e.g. email prefixes) are returned with just the first letter capitalized.
 */
export function formatDisplayName(name: string): string {
  // Split on whitespace or dots — handles email-prefix names like "alex.kruger"
  const parts = name.trim().split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return name;

  const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();

  if (parts.length === 1) return firstName;

  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
}
