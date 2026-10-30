import { describe, expect, it } from "vitest";

import { CIF } from "molstar/lib/mol-io/reader/cif";
import { trajectoryFromMmCIF } from "molstar/lib/mol-model-formats/structure/mmcif";
import { Structure, StructureSymmetry } from "molstar/lib/mol-model/structure";
import { Task } from "molstar/lib/mol-task";

import { interfacePartners, residueLoci } from "@/lib/structure-context";

/**
 * Synthetic homodimer of a 3-residue protein (entity 1, chains A and B) plus a
 * one-residue peptide of another entity (chain C, entity 2). In the assembly,
 * A:2 touches B:2 (3 Å) and C:1 sits 3 Å from A:3. Same label_seq_id in both entities
 * tests that selection is restricted to the protein of interest.
 */
function atomRows() {
  const rows: string[] = [];
  let id = 1;
  const atom = (asym: string, entity: string, seq: number, x: number, y: number) =>
    rows.push(
      `ATOM ${id++} C CA . ALA ${asym} ${entity} ${seq} ? ${x.toFixed(3)} ${y.toFixed(3)} 0.000 1.00 20.00 ? ${seq} ALA ${asym} CA 1`,
    );
  // chain A along x at y = 0
  atom("A", "1", 1, 0, 0);
  atom("A", "1", 2, 3.8, 0);
  atom("A", "1", 3, 7.6, 0);
  // chain B at y = 3 for residue 2 only (others far away)
  atom("B", "1", 1, 0, 20);
  atom("B", "1", 2, 3.8, 3);
  atom("B", "1", 3, 7.6, 20);
  // chain C (other entity) next to A:3
  atom("C", "2", 1, 7.6, -3);
  return rows.join("\n");
}

const MMCIF = `data_TEST
#
loop_
_entity.id
_entity.type
1 polymer
2 polymer
#
loop_
_entity_poly_seq.entity_id
_entity_poly_seq.num
_entity_poly_seq.mon_id
_entity_poly_seq.hetero
1 1 ALA n
1 2 ALA n
1 3 ALA n
2 1 ALA n
#
loop_
_struct_asym.id
_struct_asym.entity_id
A 1
B 1
C 2
#
loop_
_pdbx_struct_assembly.id
_pdbx_struct_assembly.details
_pdbx_struct_assembly.oligomeric_details
1 author_defined_assembly dimeric
#
loop_
_pdbx_struct_assembly_gen.assembly_id
_pdbx_struct_assembly_gen.oper_expression
_pdbx_struct_assembly_gen.asym_id_list
1 1 A,B,C
#
loop_
_pdbx_struct_oper_list.id
_pdbx_struct_oper_list.type
_pdbx_struct_oper_list.matrix[1][1]
_pdbx_struct_oper_list.matrix[1][2]
_pdbx_struct_oper_list.matrix[1][3]
_pdbx_struct_oper_list.vector[1]
_pdbx_struct_oper_list.matrix[2][1]
_pdbx_struct_oper_list.matrix[2][2]
_pdbx_struct_oper_list.matrix[2][3]
_pdbx_struct_oper_list.vector[2]
_pdbx_struct_oper_list.matrix[3][1]
_pdbx_struct_oper_list.matrix[3][2]
_pdbx_struct_oper_list.matrix[3][3]
_pdbx_struct_oper_list.vector[3]
1 'identity operation' 1 0 0 0 0 1 0 0 0 0 1 0
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.pdbx_formal_charge
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
${atomRows()}
#
`;

async function loadAssembly(): Promise<Structure> {
  const parsed = await CIF.parseText(MMCIF).run();
  if (parsed.isError) throw new Error(parsed.message);
  const trajectory = await trajectoryFromMmCIF(parsed.result.blocks[0]!).run();
  const model = await Task.resolveInContext(trajectory.getFrameAtIndex(0));
  const structure = Structure.ofModel(model);
  return StructureSymmetry.buildAssembly(structure, "1").run();
}

describe("structure context (Mol*)", () => {
  it("selects a residue in every copy of the protein's entity only", async () => {
    const s = await loadAssembly();
    const loci = residueLoci(s, 1, "1")!;
    expect(loci.elements).toHaveLength(2); // chains A and B, not C
    expect(residueLoci(s, 1)!.elements).toHaveLength(3); // without the entity filter
    expect(residueLoci(s, 9, "1")).toBeNull();
  });

  it("finds a subunit interface", async () => {
    const s = await loadAssembly();
    const loci = residueLoci(s, 2, "1")!;
    expect(interfacePartners(s, loci.elements[0]!, "1")).toEqual(["B"]);
  });

  it("reports contacts with another molecule", async () => {
    const s = await loadAssembly();
    const loci = residueLoci(s, 3, "1")!;
    expect(interfacePartners(s, loci.elements[0]!, "1")).toEqual(["C · other molecule"]);
  });

  it("reports no partner for a buried/isolated residue", async () => {
    const s = await loadAssembly();
    const loci = residueLoci(s, 1, "1")!;
    expect(interfacePartners(s, loci.elements[0]!, "1")).toEqual([]);
  });
});
