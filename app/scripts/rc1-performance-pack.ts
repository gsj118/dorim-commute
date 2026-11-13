/** Lossless build-time JSON representation. The source JSON remains the audit record. */
type Scalar = string | number | boolean | null;
type JsonValue = Scalar | JsonValue[] | { [key: string]: JsonValue };
type PackedNode = number | PackedNode[];

export function packJson(input: JsonValue) {
  const shapes: string[][] = [];
  const values: Scalar[] = [];
  const shapeIds = new Map<string, number>();
  const valueIds = new Map<string, number>();
  function visit(value: JsonValue): PackedNode {
    if (value !== null && typeof value === 'object') {
      // -1 is an array; nonnegative first elements identify an object's key shape.
      if (Array.isArray(value)) return [-1, ...value.map(visit)];
      const keys = Object.keys(value);
      const signature = JSON.stringify(keys);
      let id = shapeIds.get(signature);
      if (id === undefined) {
        id = shapes.length;
        shapeIds.set(signature, id);
        shapes.push(keys);
      }
      return [id, ...keys.map(key => visit(value[key]))];
    }
    const signature = JSON.stringify(value);
    let id = valueIds.get(signature);
    if (id === undefined) {
      id = values.length;
      valueIds.set(signature, id);
      values.push(value);
    }
    return id;
  }
  const root = visit(input);
  return { shapes, values, root };
}

export function createPackedModule(input: JsonValue): string {
  const packed = packJson(input);
  // Each visit constructs a fresh array/object, preserving independent JSON nodes.
  // No fact, evidence, conflicting claim, unknown state or source field is removed.
  return `const shapes=${JSON.stringify(packed.shapes)};
const values=${JSON.stringify(packed.values)};
function restore(node) {
  if (typeof node === 'number') return values[node];
  if (node[0] === -1) return node.slice(1).map(restore);
  return Object.fromEntries(shapes[node[0]].map((key, index) => [key, restore(node[index + 1])]));
}
export default restore(${JSON.stringify(packed.root)});`;
}
