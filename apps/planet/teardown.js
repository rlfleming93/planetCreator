/* Planet Creator — the companions' own teardown.
 *
 * Every builder of a companion object hangs its own disposal on the group it
 * returns, as `userData.dispose`: the race ring in any of its styles
 * (rings.js, rings-rubble.js, rings-track.js, rings-saturn-shader.js), the ice
 * giant's own pair (bodies/ice.js) and the week's system (system.js). The
 * page's teardown walks the companions group and calls it on each child, so a
 * companion that is taken down gives back everything it built rather than
 * leaving the GPU to hold geometries and textures nothing can reach again.
 *
 * A ring builds more than meshes: the band tables and the race's own profile
 * are DataTextures, and they hang off a material's uniforms, not off its map
 * or its channel — a sweep that only looked at `material.map` would leave the
 * largest allocation of the whole companion behind. So the traversal frees
 * every geometry and material under the group, and every texture a material
 * carries in a uniform. Everything is freed by identity, so a mesh standing in
 * two of a group's rings is freed once.
 */

/** Hang `group.userData.dispose` on a companion group: everything under it —
 *  the geometries, the materials and the textures their uniforms carry — is
 *  released when the page calls it. Returns the group, for the builders that
 *  want to hand it straight back. */
export function attachTeardown(group) {
  group.userData.dispose = () => {
    const freed = new Set();
    const handled = new Set();
    const free = (item) => {
      if (!item || freed.has(item) || typeof item.dispose !== 'function') return;
      freed.add(item);
      item.dispose();
    };
    group.traverse((node) => {
      free(node.geometry);
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material || handled.has(material)) continue;
        handled.add(material);
        const uniforms = material.uniforms;
        if (uniforms) {
          for (const key in uniforms) {
            const value = uniforms[key] && uniforms[key].value;
            if (value && value.isTexture) free(value);
          }
        }
        free(material);
      }
    });
  };
  return group;
}
