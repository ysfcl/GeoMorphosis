import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return {
      url: new URL('./stubs/next-server.js', import.meta.url).href,
      shortCircuit: true,
    };
  }

  if (specifier.startsWith('@/')) {
    const relativePath = specifier.slice(2);
    const candidates = [
      new URL(`../src/${relativePath}.js`, import.meta.url),
      new URL(`../src/${relativePath}/index.js`, import.meta.url),
    ];

    for (const candidate of candidates) {
      const filePath = fileURLToPath(candidate);
      if (existsSync(filePath)) {
        return {
          url: candidate.href,
          shortCircuit: true,
        };
      }
    }
  }

  return nextResolve(specifier, context, nextResolve);
}
