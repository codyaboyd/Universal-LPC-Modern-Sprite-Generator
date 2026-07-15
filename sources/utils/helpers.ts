// Pure utility functions with minimal catalog reads for tree search
import type { CatalogReader, CategoryTreeNode } from "../state/catalog.ts";

/**
 * Simple ES6 template string replacement
 * e.g. es6DynamicTemplate("Hello ${name}", {name: "World"}) => "Hello World"
 * Note: does not support complex expressions, only simple variable replacement
 */
// copied from https://github.com/mikemaccana/dynamic-template/blob/046fee36aecc1f48cf3dc454d9d36bb0e96e0784/index.js
export const es6DynamicTemplate = (
  templateString: string,
  templateVariables: Record<string, string>,
): string =>
  templateString.replace(
    /\${(.*?)}/g,
    (_, g) => templateVariables[g] ?? `\${${g}}`,
  );

/**
 * Convert variant name to filename format (spaces to underscores)
 * e.g. "light brown" → "light_brown"
 */
export function variantToFilename(variant: string): string {
  return variant.replaceAll(" ", "_");
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function ucwords(str: string): string {
  return str
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
}

export function normalizeAssetLabel(identifier: string): string {
  const withoutPath = identifier.split(/[\\/]/).pop() ?? identifier;
  const withoutExtension = withoutPath.replace(/\.[a-z0-9]+$/i, "");
  const withoutLayerPrefix = withoutExtension.replace(/^\d{1,3}\s+/, "");
  const spaced = withoutLayerPrefix
    .replace(/[-_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b(?:male|female|universal|lpc|ulpc|lpcr)\b/gi, (match) =>
      match.length <= 4 ? match.toUpperCase() : match.toLowerCase(),
    )
    .replace(/\s+/g, " ")
    .trim();

  if (!spaced) return identifier;
  return spaced
    .split(" ")
    .map((word) =>
      /^[A-Z]{2,}$/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

export function matchesSearch(text: string, query: string): boolean {
  if (!query || query.length < 2) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

export function nodeHasMatches(
  node: CategoryTreeNode,
  query: string,
  catalog: CatalogReader,
): boolean {
  if (!query || query.length < 2) return true;

  // Until lite metadata is registered we cannot match item names; keep nodes visible
  if (node.items && node.items.length > 0 && !catalog.isLiteReady()) {
    return true;
  }

  // Check if any items in this node match
  if (
    node.items &&
    node.items.some((itemId) =>
      catalog.getItemLite(itemId).match(
        (meta) => matchesSearch(meta.name, query),
        () => false,
      ),
    )
  ) {
    return true;
  }

  // Check if any child nodes have matches
  if (node.children) {
    return Object.values(node.children).some((childNode) =>
      nodeHasMatches(childNode, query, catalog),
    );
  }

  return false;
}
