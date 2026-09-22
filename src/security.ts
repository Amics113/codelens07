const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["jwt", /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ["generic-secret", /\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_\-./+=]{12,})["']?/gi]
];

export interface RedactionResult {
  redacted: string;
  count: number;
  categories: string[];
}

export function redactSecrets(input: string): RedactionResult {
  let output = input;
  let count = 0;
  const categories: string[] = [];

  for (const [category, pattern] of SECRET_PATTERNS) {
    output = output.replace(pattern, (match) => {
      count++;
      if (!categories.includes(category)) categories.push(category);
      return `[REDACTED:${category}]`;
    });
  }

  return { redacted: output, count, categories };
}
