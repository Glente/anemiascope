/**
 * Geometry helpers on a loaded Mol* structure. Only imported by the (lazy, client-side)
 * structure viewer and by the tests.
 */
import { OrderedSet } from "molstar/lib/mol-data/int";
import { Vec3 } from "molstar/lib/mol-math/linear-algebra";
import {
  Structure,
  StructureElement,
  StructureProperties,
  StructureSelection,
  Unit,
} from "molstar/lib/mol-model/structure";
import { Script } from "molstar/lib/mol-script/script";

/** Loci of one residue (label_seq_id) of an entity, across all copies in the structure. */
export function residueLoci(
  structure: Structure,
  seqId: number,
  entityId?: string,
): StructureElement.Loci | null {
  const sel = Script.getStructureSelection(
    (Q) =>
      Q.struct.generator.atomGroups({
        ...(entityId
          ? {
              "entity-test": Q.core.rel.eq([
                Q.struct.atomProperty.macromolecular.label_entity_id(),
                entityId,
              ]),
            }
          : {}),
        "residue-test": Q.core.rel.eq([Q.struct.atomProperty.macromolecular.label_seq_id(), seqId]),
      }),
    structure,
  );
  if (StructureSelection.isEmpty(sel)) return null;
  return StructureSelection.toLociWithSourceUnits(sel);
}

/**
 * Chains (other units) with any atom within `cutoff` Å of the residue in `element`.
 * Returned as auth chain ids, with the symmetry operator when the copy is not the identity.
 */
export function interfacePartners(
  structure: Structure,
  element: StructureElement.Loci["elements"][number],
  entityId: string,
  cutoff = 4,
): string[] {
  const v = Vec3();
  const target: Vec3[] = [];
  OrderedSet.forEach(element.indices, (i) => {
    target.push(Vec3.clone(element.unit.conformation.position(element.unit.elements[i]!, v)));
  });
  if (!target.length) return [];
  const cut2 = cutoff * cutoff;
  const partners = new Set<string>();
  const loc = StructureElement.Location.create(structure);
  for (const unit of structure.units) {
    if (unit === element.unit || !Unit.isAtomic(unit)) continue;
    const els = unit.elements;
    for (let k = 0; k < els.length; k++) {
      unit.conformation.position(els[k]!, v);
      if (!target.some((p) => Vec3.squaredDistance(v, p) <= cut2)) continue;
      loc.unit = unit;
      loc.element = els[k]!;
      const chain = StructureProperties.chain.auth_asym_id(loc);
      const op = StructureProperties.unit.operator_name(loc);
      const other = StructureProperties.chain.label_entity_id(loc) !== entityId;
      const isIdentity = !op || op === "1_555" || /^ASM_1$|^1$/.test(op);
      partners.add(`${chain}${isIdentity ? "" : ` (${op})`}${other ? " · other molecule" : ""}`);
      break;
    }
  }
  return [...partners].sort();
}
