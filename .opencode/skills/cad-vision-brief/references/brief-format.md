# CAD Brief Format

Use this as the canonical structure for image interpretation.

## Recommended Fields

- `object`: what the part is
- `source`: photo, sketch, drawing, screenshot, or mixed
- `orientation`: front, top, side, section, perspective, unknown
- `dimensions`: visible or inferred measurements with units and confidence
- `features`: holes, slots, bosses, tapers, fillets, chamfers, steps, textures, labels
- `finish`: surface roughness, coatings, machining notes, cosmetic notes
- `assumptions`: explicit assumptions used to bridge missing information
- `uncertainties`: items that are ambiguous or unresolved
- `strategy`: revolve, extrude, loft, sweep, or mixed
- `questions`: one short clarification question only if required

## Dimension Labels

Use one of:

- `exact`
- `estimated`
- `inferred`
- `unknown`

## Confidence Labels

Use one of:

- `high`
- `medium`
- `low`
