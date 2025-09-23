/**
 * ContentLinter detects disallowed abbreviations and can propose expansions.
 * This implements Stage 9 concept early to remove placeholder stubs (Stage 8 polishing request).
 */
export interface LintIssue {
    abbreviation: string; // the token found
    start: number; // index in source
    end: number; // exclusive end index
    suggestion: string; // proposed expansion
}

export interface LintResult {
    issues: LintIssue[]; // list of detected abbreviation issues
    fixed?: string; // optionally expanded content when apply = true
}

const defaultDictionary: Record<string, string> = {
    cfg: 'configuration',
    id: 'identifier',
    approx: 'approximately',
};

/** Tokenize simple word boundaries */
function tokenize(text: string): Array<{ word: string; index: number }> {
    const regex = /\b([a-zA-Z]+)\b/g;
    const out: Array<{ word: string; index: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text))) {
        out.push({ word: match[1], index: match.index });
    }
    return out;
}

export function lintContent(text: string, dict: Record<string, string> = defaultDictionary, apply = false): LintResult {
    const tokens = tokenize(text);
    const issues: LintIssue[] = [];
    let result = text;

    for (const t of tokens) {
        const lower = t.word.toLowerCase();

        if (dict[lower] && t.word !== dict[lower]) {
            issues.push({
                abbreviation: t.word,
                start: t.index,
                end: t.index + t.word.length,
                suggestion: dict[lower],
            });
        }
    }

    if (apply && issues.length) {
        // Apply from end to start so indexes remain valid
        const chars = result.split('');

        for (let i = issues.length - 1; i >= 0; i--) {
            const issue = issues[i];
            chars.splice(issue.start, issue.abbreviation.length, issue.suggestion);
        }
        result = chars.join('');
    }
    return { issues, fixed: apply ? result : undefined };
}
