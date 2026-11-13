import { describe, expect, it } from 'vitest';
import source from '../src/data/routes.json';
import { createPackedModule } from '../scripts/rc1-performance-pack';

function restore<T>(value: T): T {
  // Execute exactly the emitted module body, independently of Vite's build output.
  // The generated source contains JSON literals and the fixed reconstruction code.
  const module = createPackedModule(value as Parameters<typeof createPackedModule>[0]);
  return new Function(module.replace('export default ', 'return '))() as T;
}

describe('production data packing', () => {
  it('restores the entire current source including provenance and conflicting claims', () => {
    expect(restore(source)).toEqual(source);
  });

  it('keeps equal objects and arrays independent after reconstruction', () => {
    const original = { a: { values: ['same'] }, b: { values: ['same'] } };
    const result = restore(original);
    expect(result).toEqual(original);
    expect(result.a).not.toBe(result.b);
    expect(result.a.values).not.toBe(result.b.values);
    result.a.values.push('changed');
    expect(result.b.values).toEqual(['same']);
    expect(original.a.values).toEqual(['same']);
  });

  it('preserves scalar types, empty shapes and own prototype-named keys', () => {
    const original = JSON.parse('{"__proto__":{"polluted":true},"constructor":"data","items":[null,false,true,"",-1,0,3.5,"0","한글",[],{}]}');
    const result = restore(original);
    expect(result).toEqual(original);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(result.polluted).toBeUndefined();
  });
});
