---
name: cadquery-studio
description: Use when OpenCode must create, modify, parameterize, or repair CAD AI Studio CadQuery models in a session cadquery.py file. Applies to text-to-CAD parts, enclosures, brackets, bosses, standoffs, holes, slots, shells, fillets, chamfers, parameter edits, render failures, and any workflow that must end with a valid backend-rendered STEP result.
---

# CAD AI Studio CadQuery Skill

## Objective

Produce a high-fidelity CadQuery model that renders successfully, matches the user's requirements, exposes useful parameters, and remains stable when parameters change. Accuracy and geometric correctness outrank speed, brevity, and convenience. "Renders successfully" is only the minimum bar: the model must also use the correct CAD construction strategy, avoid visibly faceted or patched surfaces, and pass a source-level quality review before the final reply.

Use this skill only for CAD AI Studio session modeling and repair. Do not use it for CAM, FEA, certification, unrelated repository edits, package installation, or generated sidecar files.

## Operating Rules

- Edit only the current session `cadquery.py`; read this skill and its references when needed.
- Write a complete source file, not a partial snippet.
- Assign the final closed solid or compound to `result`.
- Use millimeters unless the user explicitly requests another unit.
- Keep the primary body centered on the origin when possible, with XY as the base plane and +Z as height.
- Do not write STEP, STL, GLB, PNG, JSON, logs, or helper files; the backend handles exports.
- Do not use shell, web, environment access, file I/O, package installation, or other project files.

Allowed imports are `cadquery` and `math` only:

```python
import cadquery as cq
import math
```

## Workflow

1. Classify the request: new part, modification, parameter change, visual correction, or render repair.
2. Build an internal CAD brief before coding: required features, dimensions, parameters, coordinate frame, assumptions, expected envelope, and validation targets.
3. Choose the highest-quality modeling strategy before coding. Axisymmetric parts must be driven by a true revolved profile; prismatic machined/plastic parts must be driven by sketches, extrusions, pockets, holes, ribs, bosses, and controlled fillets; organic transitions must use real curves, not sampled polylines.
4. If modifying an existing model, preserve useful parameters, coordinate intent, and feature intent from the current `cadquery.py`, but replace low-quality construction methods when they cause faceting, patch seams, unstable booleans, or incorrect surface continuity.
5. Plan requirement coverage: every visible or functional request should map to a parameter, sketch, curve, solid operation, or explicit assumption.
6. Generate robust CadQuery source with named intermediate solids for non-trivial features.
7. Perform a source-level quality review before stopping: reject the code if it uses the wrong construction strategy, faceted curve approximations, unsafe dimensions, or fragile feature ordering. Never accept a faster approximation when a more exact safe strategy exists.
8. Let CAD AI Studio run the backend render after your edit.
9. On failure or poor geometry, change the responsible modeling strategy rather than making cosmetic tweaks. After two failures with the same strategy, simplify the geometry only if accuracy and core requirements are still preserved.
10. Finish only after a successful render unless the user explicitly asked for analysis only or the workflow is blocked.

Ask one focused clarification question only when missing information makes the model impossible, fit-critical, safety-critical, or compliance-bound. Otherwise proceed with clear assumptions.

## Source Contract

Use this structure for generated models:

```python
import cadquery as cq
import math

params = {
    "width": 100.0,
    "depth": 60.0,
    "height": 20.0,
    "fillet_radius": 2.0,
}

# PARAMETER_DEFS: [{"name":"width","label":"Width","type":"number","default":100.0,"current_value":100.0,"min":10.0,"max":300.0,"step":1.0}]

width = params["width"]
depth = params["depth"]
height = params["height"]
fillet_radius = max(0.0, min(params["fillet_radius"], width / 10.0, depth / 10.0, height / 4.0))

body = cq.Workplane("XY").box(width, depth, height)
if fillet_radius > 0:
    body = body.edges("|Z").fillet(fillet_radius)

result = body
```

Hard requirements:

- Keep all user-adjustable dimensions in the top-level `params` dictionary.
- Use `params["name"]` or local variables derived from `params`; avoid repeated magic numbers.
- Keep `# PARAMETER_DEFS:` as valid single-line JSON when using UI metadata.
- Keep `default` and `current_value` synchronized with `params`.
- Use stable names such as `width`, `depth`, `height`, `diameter`, `thickness`, `wall_thickness`, `hole_diameter`, `boss_diameter`, `boss_height`, `slot_width`, `fillet_radius`, `chamfer_size`, `hole_count`.
- Guard derived dimensions so they cannot become negative, zero, self-intersecting, or larger than their containing feature.
- Do not use `open`, `exec`, `eval`, `compile`, `__import__`, `os`, `sys`, `subprocess`, networking, file reads, or file writes.

## Modeling Defaults

- Enclosure walls: 2.0 to 3.0 mm unless the scale suggests otherwise.
- Cosmetic fillets: 1.0 to 3.0 mm, clamped to nearby geometry.
- M3, M4, M5 normal clearance holes: 3.4, 4.5, 5.5 mm.
- Through-holes must cut fully through the target with margin.
- Bosses and standoffs should have realistic wall thickness and base support.
- Rectangular hole patterns should use explicit coordinate lists.
- Circular patterns should compute positions with `math.sin` and `math.cos`.

Prefer boxes, cylinders, extrusions, pockets, holes, counterbores, countersinks, slots, ribs, bosses, standoffs, chamfers, and small fillets. Avoid true threads, dense gear teeth, thin self-intersecting sketches, fragile shells, large chained fillets, and sliver faces unless explicitly required.

## High-Fidelity CAD Rules

The generated source must model the part as CAD geometry, not as a visual mesh approximation.

Required strategy selection:

- Axisymmetric parts such as handles, knobs, shafts, bottle-like shapes, turned parts, tapered plugs, pins, and rounded grips: create a 2D radius profile in the XY plane and `revolve(360.0, (0, 0), (1, 0))`. Use true profile curves for the outside contour.
- Smooth ergonomic or organic transitions: use `spline`, `threePointArc`, `radiusArc`, and controlled tangent-like transitions. Use a small number of meaningful control points. Do not sample a curve into many straight segments.
- Cylindrical ends, collars, shoulders, bores, grooves, and stepped features on a turned part: include them in the revolved profile whenever possible, then cut axial holes with cylinders.
- Boxy or sheet-like parts: use sketch/extrude/cut operations with exact dimensions, then apply restrained fillets/chamfers late.
- Repeated functional features: use explicit pattern math and named coordinates, not copy-pasted uncontrolled operations.

Forbidden low-quality patterns:

- Do not use `polyline(many_sampled_points).revolve(...)` to approximate a curved surface. This creates many conical bands and is a failed quality gate for smooth parts.
- Do not use a chain of circular `loft()` sections as a substitute for a true revolved profile when the object is axisymmetric. Loft is acceptable only when cross-sections are intentionally non-circular or non-axisymmetric.
- Do not union a sphere onto a lofted/cylindrical body to fake a smooth rounded tip unless the intersection is intentionally hidden or the transition is explicitly blended.
- Do not use dense point clouds, micro-polygons, decorative zigzags, or arbitrary faceting for smooth design intent.
- Do not globally fillet all edges of a complex boolean result. Fillet selected, stable edge sets or use chamfers when reliability matters.
- Do not rely on final scaling to fix wrong dimensions.

Smoothness requirements:

- For a revolved smooth part, the profile must be mostly lines, arcs, and splines, not many short line segments.
- Curved profiles should have monotonic, plausible radius changes unless the user asks for grooves, ribs, or sharp shoulders.
- Sharp shoulders are allowed only where the object visibly has a step, collar, flange, seat, or machining transition.
- If a parameter can make a spline self-intersect or invert, clamp it before constructing the profile.
- Prefer one clean primary solid plus explicit subtractive/union features over many patched solids.

Reject and rewrite the model before finalizing if it renders but has obvious faceting, unintended seams, disconnected-looking patches, tiny sliver features, wrong construction strategy, or parameter ranges that can break the geometry.
Reject and rewrite the model if it is merely fast to author but not the most exact safe CAD strategy available.

## Quality Gates

For every new model or non-trivial modification, read `references/quality-gates.md` before finalizing. Treat those gates as mandatory, not advisory.

Minimum acceptance checks before the final response:

- Requirement coverage: every requested feature is present or called out as an assumption.
- Parameter safety: ranges are realistic and derived values are clamped.
- Geometry stability: cutters overlap, walls have thickness, holes cut through, fillets/chamfers are smaller than adjacent edges.
- Construction quality: the modeling strategy matches the part type; smooth surfaces use true CAD curves, not faceted approximations.
- Visual plausibility: the source should produce clean, intentional surfaces with no avoidable banding, seams, or lumpy transitions.
- Backend contract: legal imports, top-level `params`, valid optional `PARAMETER_DEFS`, and final `result`.
- Render result: report success only after the backend reports a successful render.

## Repair Heuristics

- No `result`: assign the final object to `result`.
- Import rejected: remove everything except `cadquery` and `math`.
- Empty STEP: ensure the model has positive volume, booleans overlap, and sketches are closed.
- Hole did not cut: use the correct face/workplane and a cut depth with margin.
- Fillet failed: reduce radius, fillet fewer edges, or replace with chamfer.
- Shell failed: reduce complexity, thicken walls, or model the cavity with explicit cuts.
- Boolean failed: enlarge the cutter slightly, ensure overlap, or split into simpler operations.
- Units look wrong: fix parameter values, not by scaling the whole finished body.

## Response Style

Reply to the user in concise Chinese:

- State what was built or changed.
- List the main adjustable parameters.
- Mention important assumptions.
- Mention render success or the specific blocker if validation could not complete.

Do not paste long code unless the user asks for it. The updated source file is already in the session.
