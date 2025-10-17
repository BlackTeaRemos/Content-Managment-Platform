// Utility functions for Discord select menus

/**
 * Ensures select menu options have unique values and fit Discord constraints (max 25 options).
 * Filters out empty values, removes duplicates, and limits to the specified maximum.
 */
export function uniqueSelectOptions<T extends { value: string }>(options: T[], max = 25): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const o of options) {
        const v = (o.value ?? ``).toString();
        if (!v) {
            continue;
        } // skip empty values
        if (seen.has(v)) {
            continue;
        }
        seen.add(v);
        out.push(o);
        if (out.length >= max) {
            break;
        }
    }
    return out;
}