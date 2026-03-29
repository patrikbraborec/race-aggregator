/**
 * Compute normalized Levenshtein similarity between two strings.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function similarity(a: string, b: string): number {
    if (a === b) return 1;
    const lenA = a.length;
    const lenB = b.length;
    if (lenA === 0 || lenB === 0) return 0;

    // Levenshtein distance via single-row DP
    let prev = Array.from({ length: lenB + 1 }, (_, i) => i);
    for (let i = 1; i <= lenA; i++) {
        const curr = [i];
        for (let j = 1; j <= lenB; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                curr[j - 1] + 1,
                prev[j] + 1,
                prev[j - 1] + cost,
            );
        }
        prev = curr;
    }

    const maxLen = Math.max(lenA, lenB);
    return 1 - prev[lenB] / maxLen;
}
