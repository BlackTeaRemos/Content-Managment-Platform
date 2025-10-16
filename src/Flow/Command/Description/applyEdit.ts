/**
 * Apply an edit operation to current text based on edit mode and input.
 * @param current string Current description text
 * @param mode 'append' | 'remove' | 'replace' Mode of edit
 * @param input string Input to apply
 * @returns string Resulting text
 */
export function applyEdit(current: string, mode: `append` | `remove` | `replace`, input: string): string {
    switch (mode) {
        case `append`:
            return current + (input ? `\n${input}` : ``);
        case `remove`:
            if (!input) {
                return current;
            }
            return current.split(input).join(``);
        case `replace`:
        default:
            return input;
    }
}
