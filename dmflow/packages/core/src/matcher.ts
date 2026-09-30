export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}
export function match(
  text: string,
  keyword: string,
  mode: "exact" | "whole_phrase" | "contains" | "fuzzy" = "fuzzy",
): { rank: number; keyword: string } | null {
  const t = normalize(text),
    k = normalize(keyword);
  if (!k) return null;
  if (mode === "exact") return t === k ? { rank: 0, keyword } : null;
  if (mode === "contains") return t.includes(k) ? { rank: 0, keyword } : null;
  if ((" " + t + " ").includes(" " + k + " ")) return { rank: 0, keyword };
  const words = t.split(" "),
    compact = k.replace(/ /g, "");
  for (let i = 0; i < words.length; i++)
    for (let n = 1; n <= Math.min(3, words.length - i); n++) {
      const candidate = words.slice(i, i + n).join("");
      if (candidate === compact) return { rank: 0, keyword };
      if (mode !== "fuzzy" || compact.length <= 3) continue;
      const limit = compact.length >= 8 ? 2 : 1;
      if (
        n === 1 &&
        Math.abs(candidate.length - compact.length) <= limit &&
        distance(candidate, compact) <= limit
      )
        return { rank: 1, keyword };
    }
  return null;
}
export function excluded(text: string, phrases: string[]): boolean {
  return phrases.some((p) => match(text, p, "whole_phrase") !== null);
}
