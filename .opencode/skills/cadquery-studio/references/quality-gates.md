# CAD Quality Gates

Use these gates when a request is more than a simple primitive, when a render fails, or when the model has adjustable parameters, fit-critical dimensions, shells, holes, or multiple interacting features.

## Contents

- CAD brief
- Requirement coverage
- Parameter contract
- Construction strategy
- Surface quality
- Geometry stability
- Validation loop
- Repair taxonomy
- Final acceptance

## CAD Brief

Before editing `cadquery.py`, form a short internal brief:

- Task type: new part, modification, parameter change, visual correction, or repair.
- Primary object: bracket, enclosure, adapter, fixture, knob, panel, standoff plate, decorative object, etc.
- Units: use mm unless specified.
- Coordinate frame: base plane, origin, symmetry, front/back convention, height direction.
- Main dimensions: width, depth, height, diameter, wall thickness, hole sizes, spacing, clearances.
- Feature list: each visible or functional feature the user asked for.
- Construction strategy: revolve, extrude/cut, sweep, loft, shell, boolean assembly, or a combination. Choose the strategy that best matches the physical part.
- Expected envelope: approximate bounding box and orientation.
- Assumptions: only the ones that affect fit, scale, or function.
- Validation targets: render success, non-empty STEP, positive-volume model, parameter extraction, visible requested features.

If a dimension is missing but the model is not fit-critical, choose a realistic default and expose it in `params`.

## Requirement Coverage

Map every user requirement to source code before finalizing:

- Overall shape maps to the primary body or sketch.
- Each hole, slot, boss, rib, wall, chamfer, label-like raised feature, or repeated pattern maps to an explicit operation.
- Counts map to integer params or fixed coordinate lists.
- Symmetry requirements map to centered construction or mirrored placement.
- Fit requirements map to named clearance or offset params.
- Visual style requests map to stable geometric approximations, not fragile ornamentation.

Do not silently drop difficult features. If a requested feature is unsafe or underspecified, implement a conservative approximation and mention the assumption.

## Construction Strategy

Before accepting generated code, verify that the method matches the part:

- Turned, rotational, cylindrical ergonomic, knob, handle, shaft, plug, cap, pulley-like, or bottle-like parts must normally be modeled from a half-profile and `revolve`. This gives true CAD surfaces and clean axial features.
- Prismatic parts such as brackets, enclosures, panels, plates, fixtures, and blocks should normally use sketches, extrusions, cutouts, holes, ribs, bosses, and local fillets/chamfers.
- Loft should be reserved for genuinely changing cross-sections or non-axisymmetric forms. Do not use circular loft sections for a part that could be a clean revolved profile.
- Sweep should be reserved for path-driven tubes, rails, cable channels, handles, or curved extrusions.
- Shell should be used only on simple bodies. For complex parts, explicitly cut cavities and leave controlled wall thickness.

Reject these strategy mismatches:

- A rotational part made from separate cylinders, lofts, and sphere unions when a revolved profile would be cleaner.
- A smooth revolved part made from dozens of sampled `polyline` points.
- A box/enclosure made from many unions instead of a stable base body plus cuts and bosses.
- A fragile decorative exact detail that risks render failure while the functional part is underspecified.

When the first strategy renders but looks poor, rewrite using the correct strategy instead of patching the visible artifact.

## Surface Quality

Rendering success does not imply acceptable surface quality. Perform this source-level review:

- Smooth intent must be represented by `spline`, `threePointArc`, `radiusArc`, circles, ellipses, or native fillet/chamfer operations.
- `polyline` is acceptable for intentional straight-edged polygons, brackets, flats, stepped shafts, and mechanical profiles with real corners. It is not acceptable for approximating smooth curves by many samples.
- A smooth revolved profile should use a small number of meaningful curve segments. If it contains many loop-generated points, it probably creates visible conical bands.
- Transitions from neck to bulge, bulge to taper, and taper to rounded tip should be tangent-like and monotonic unless grooves or shoulders are requested.
- Avoid union seams between a sphere and a body for rounded noses; prefer arcs in the revolved profile or a controlled fillet.
- Avoid lofts with too few sections for complex transitions and avoid lofts with many arbitrary sections for simple revolved shapes.
- Avoid tiny sliver faces from nearly coincident x/radius coordinates, near-zero tapers, or cuts exactly tangent to a body.

For quality-sensitive parts, treat any of these as failure even if the STEP exports:

- Visible banding expected from sampled line segments.
- Lumpy or pinched transitions caused by poorly placed loft sections.
- Disconnected-looking patches on what should be one continuous surface.
- Hard edge where the request implies smooth blending.
- Smooth surface made from many independent boolean unions.

## Parameter Contract

The frontend extracts `params` and optional `# PARAMETER_DEFS:` metadata from source. Keep this contract stable:

- Put `params = {...}` near the top of the file.
- Use simple JSON-compatible values in `params`: numbers, integers, booleans, strings.
- Keep UI metadata as a single-line JSON comment:

```python
# PARAMETER_DEFS: [{"name":"width","label":"Width","type":"number","default":100.0,"current_value":100.0,"min":10.0,"max":300.0,"step":1.0}]
```

- Use `type: "integer"` for counts and clamp them before loops.
- Set `min`, `max`, and `step` to ranges that preserve geometry, not just UI convenience.
- Keep `default` and `current_value` equal to the current `params` value unless intentionally showing a changed live value.
- Prefer derived local variables for safety:

```python
wall = max(1.2, min(params["wall_thickness"], min(width, depth) / 8.0))
hole_diameter = max(1.0, min(params["hole_diameter"], min(width, depth) / 3.0))
fillet_radius = max(0.0, min(params["fillet_radius"], wall * 0.45, height * 0.2))
```

Stable parameter naming matters because future edits depend on it. Rename only when the old name is misleading.

For high-quality parameterization:

- Every major dimension visible in the model should have a named parameter unless it is a fixed construction detail derived from another parameter.
- UI ranges must be narrow enough to preserve the design. Do not expose a large max value that can invert profiles, erase walls, or make a bore larger than the shaft.
- Clamp radii, bores, wall thicknesses, offsets, pattern counts, and transition positions before building sketches.
- When a profile depends on ordered x-positions or radii, compute safe bounds so the sequence cannot cross or collapse.

## Geometry Stability

Favor operations that are tolerant to parameter changes:

- Build the largest positive-volume body first.
- Add bosses, ribs, rails, and pads as simple solids before subtractive details.
- Cut holes and slots with generous depth margins.
- Apply fillets and chamfers late, with clamped radii.
- Keep thin features above realistic minimum thickness.
- Use explicit coordinate lists for rectangular patterns and computed polar positions for circular patterns.
- Use named workplanes and intermediate objects when a feature depends on orientation.

Avoid these unless the request requires them:

- Large shell operations on complex bodies.
- Filleting all edges after many booleans.
- Self-intersecting splines or polygons.
- Sliver faces from nearly coincident cuts.
- Thread geometry, dense teeth, knurling, or decorative micro-features.
- Final global scaling to fix wrong units.

When detail is requested, first create a robust functional base model, then add low-risk visual detail.

Additional checks for revolved models:

- The profile must be closed and stay on or above the rotation axis.
- The radius must never become negative.
- Adjacent profile x-coordinates must not be equal unless they intentionally create a vertical shoulder.
- The axis line should be included deliberately so the result is a solid, not an open shell.
- Axial holes should be cut with cylinders that overlap the model and extend past the target depth by a margin.
- Chamfers/fillets on front openings must be smaller than the wall between bore radius and shaft radius.

Additional checks for lofted models:

- Confirm loft is necessary. If all sections are circular and coaxial, prefer revolve.
- Section order and offsets must be monotonic.
- Adjacent sections should not differ so much that the loft pinches.
- Avoid adding a separate sphere/cap unless its intersection is clean and intentional.

## Validation Loop

This project's OpenCode agent cannot run arbitrary shell commands and should not export files directly. Validation happens through CAD AI Studio's backend after the source edit.

Use the available feedback honestly:

- Render success means the backend executed `cadquery.py`, exported STEP, and returned a model URL.
- Render failure means inspect the backend error and edit the smallest responsible source region.
- Do not claim exact bounding boxes, topology counts, mass, manufacturability, or interference checks unless that data was actually provided by the system.
- Do not claim snapshot or visual inspection unless a rendered view or user feedback was actually available.

Before finalizing after a render success, perform a source-level acceptance pass:

- Does `result` reference the intended final object?
- Is the object likely positive-volume and closed?
- Is the construction strategy appropriate for the part class?
- Are smooth surfaces represented by true CAD curves rather than sampled line segments?
- Do all cutters overlap the target and cut through when needed?
- Are wall, rib, boss, slot, and hole dimensions physically plausible?
- Are fillets/chamfers safely smaller than adjacent edges?
- Can each parameter vary within its declared range without obvious self-intersection?
- Does the visible feature list match the user request?

## Repair Taxonomy

Use failure text to choose the smallest fix:

- Syntax or AST rejection: remove unsupported imports, builtins, file I/O, or malformed code.
- Missing `result`: assign the final CadQuery object to `result`.
- Parameter extraction issue: simplify `params` and keep `PARAMETER_DEFS` valid single-line JSON.
- Empty or tiny STEP: check positive dimensions, closed sketches, boolean overlap, and final object selection.
- Poor smoothness despite render success: replace sampled polylines, circular loft chains, or sphere unions with a true curved profile and revolve.
- Face selector issue: replace fragile selectors with explicit workplanes or intermediate solids.
- Hole or pocket not visible: increase cut depth, select the correct face, or use a larger cutter margin.
- Boolean failure: split the operation, simplify the cutter, or increase overlap.
- Shell failure: avoid shell on complex geometry; model the cavity as an explicit subtractive box or cylinder.
- Fillet failure: clamp the radius, fillet fewer edges, or use chamfer.
- Over-detailed model failure: remove decorative detail first, keep functional features.

If the same modeling strategy fails twice, simplify the design. A stable, requirement-covering approximation is better than a fragile exact-looking model that does not render.

If the model renders but fails construction or surface quality, do not call it complete. Rewrite the lowest-quality construction block and render again.

## Final Acceptance

Only finish when these statements are true or explicitly reported as blocked:

- The file is a complete `cadquery.py` source.
- Imports are limited to `cadquery` and optional `math`.
- `params` contains the main adjustable dimensions.
- Optional parameter metadata is valid single-line JSON.
- `result` is assigned to the final solid or compound.
- The model follows the requested units, orientation, and main dimensions.
- Each required feature is implemented or mentioned as an assumption.
- The construction strategy matches the physical part.
- Smooth surfaces are built from true CAD curves or native operations, not sampled faceting.
- The parameter ranges are narrow and clamped enough to preserve geometry.
- Backend render completed successfully, or the final response names the blocker.

Final user replies should be short and in Chinese. State the main result, adjustable parameters, assumptions, and render status. Never invent validation evidence.
