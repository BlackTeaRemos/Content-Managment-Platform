/**
 * Split a large string into chunks not exceeding the provided size.
 * @param input string Source text
 * @param size number Maximum chunk size
 */
export function chunkString(input: string, size: number) {
    const out: string[] = [];
    for (let i = 0; i < input.length; i += size) {
        out.push(input.slice(i, i + size));
    }
    return out;
}
