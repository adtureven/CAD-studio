---
name: cad-vision-brief
description: Use when the user provides images, screenshots, scans, sketches, or drawings that need to be converted into a structured CAD brief before CadQuery generation. Produces a concise, uncertainty-aware brief with geometry, dimensions, features, annotations, and modeling strategy; does not write CadQuery code.
---

# CAD Vision Brief Skill

## Objective

Turn image input into a precise CAD brief that downstream CadQuery generation can trust. Focus on visible geometry, annotated dimensions, feature inventory, orientation, scale, finish notes, and uncertainty. Accuracy matters more than speed: do not guess hidden dimensions or collapse ambiguity into a single unsupported value.

Use this skill only for image-to-brief interpretation in CAD workflows. Do not write `cadquery.py`, do not invent geometry beyond what the image supports, and do not treat this as a generic OCR or captioning task.

## Operating Rules

- Read the image(s) and extract a structured brief before any model code is written.
- Prefer dimensioned orthographic views over perspective photos. If both exist, let the drawing dominate and the photo only fill gaps.
- Transcribe visible dimensions, notes, symbols, and surface finish callouts exactly.
- Estimate only when the image does not provide a dimension. Mark estimated values explicitly.
- If a measurement is inferred from scale, state the basis and confidence.
- If multiple views conflict, report the conflict instead of reconciling it silently.
- If the target object is one part in an assembly, isolate that part and ignore unrelated items.
- Ask at most one clarification question only when the brief cannot be made useful without it.

## Output Contract

Return a compact CAD brief using this structure:

1. Object summary
2. View/source notes
3. Visible dimensions
4. Feature list
5. Surface/finish notes
6. Uncertainties and assumptions
7. Recommended modeling strategy
8. Follow-up question, if needed

Keep the brief short, factual, and ready for a CadQuery generation skill to consume.

## Modeling Hints

- Rotational parts usually map to a revolved profile.
- Prismatic parts usually map to sketches, extrusions, pockets, holes, bosses, and fillets.
- Non-axisymmetric blends may require loft or sweep, but only when the image clearly supports that choice.
- If the image looks like a technical drawing, preserve the drawing intent and annotations, not just the outline.
