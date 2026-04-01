export type BSPLeaf = { type: 'leaf'; bufferId: string };
export type BSPSplit = {
  type: 'split';
  dir: 'h' | 'v'; // h = left | right, v = top | bottom
  ratio: number;  // 0..1 — proportion of space given to the `a` child
  a: BSPNode;
  b: BSPNode;
};
export type BSPNode = BSPLeaf | BSPSplit;
export type BSPPath = ('a' | 'b')[];

/**
 * Insert a buffer by recursively splitting the rightmost leaf.
 * Even depths split horizontally, odd depths split vertically (Hyprland-style alternation).
 */
export function insertBuffer(tree: BSPNode | null, bufferId: string, depth = 0): BSPNode {
  if (!tree) return { type: 'leaf', bufferId };
  if (tree.type === 'leaf') {
    const dir: 'h' | 'v' = depth % 2 === 0 ? 'h' : 'v';
    return { type: 'split', dir, ratio: 0.5, a: tree, b: { type: 'leaf', bufferId } };
  }
  return { ...tree, b: insertBuffer(tree.b, bufferId, depth + 1) };
}

/**
 * Remove a buffer from the tree. If a split loses one child it collapses to the sibling.
 */
export function removeBuffer(tree: BSPNode | null, bufferId: string): BSPNode | null {
  if (!tree) return null;
  if (tree.type === 'leaf') return tree.bufferId === bufferId ? null : tree;
  const a = removeBuffer(tree.a, bufferId);
  const b = removeBuffer(tree.b, bufferId);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return { ...tree, a, b };
}

/**
 * Swap two leaf buffer IDs anywhere in the tree.
 */
export function swapLeaves(tree: BSPNode, id1: string, id2: string): BSPNode {
  if (tree.type === 'leaf') {
    if (tree.bufferId === id1) return { ...tree, bufferId: id2 };
    if (tree.bufferId === id2) return { ...tree, bufferId: id1 };
    return tree;
  }
  return { ...tree, a: swapLeaves(tree.a, id1, id2), b: swapLeaves(tree.b, id1, id2) };
}

/**
 * Update the ratio of the split node found by walking `path` from the root.
 * An empty path updates the root node itself.
 */
export function updateRatio(tree: BSPNode, path: BSPPath, ratio: number): BSPNode {
  if (tree.type === 'leaf') return tree;
  if (path.length === 0) return { ...tree, ratio };
  const [head, ...rest] = path;
  if (head === 'a') return { ...tree, a: updateRatio(tree.a, rest, ratio) };
  return { ...tree, b: updateRatio(tree.b, rest, ratio) };
}
