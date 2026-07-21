---
name: knowledge-base
description: Use when a CAD task depends on standards data, engineering handbooks, or user-uploaded reference PDFs — GB/ISO/ANSI numeric values, gear module series, tolerance/fit tables, thread specs, bearing dimensions, material allowable stresses, surface roughness classes, keyway dimensions, etc. Invokes the `cad-kb_search_knowledge` MCP tool to retrieve authoritative passages before modeling. Do not use it for general CAD strategy questions or for values the user has already supplied.
---

# Knowledge Base Skill

## Objective

Ground CadQuery generation in real reference material. When the requested part touches standardized values (GB/ISO/ANSI numbers, tables, formulas, catalog data), retrieve the relevant passage from the user's uploaded knowledge base and use those numbers instead of inventing them. Correctness on standard values outranks brevity and speed.

Use this skill only for retrieving factual reference material via `cad-kb_search_knowledge`. Do not use it for modeling strategy, image interpretation, or generic web knowledge.

## When To Use

Invoke `cad-kb_search_knowledge` **before** writing CadQuery when the task depends on any of:

- Standard series values: gear modules (GB/T 1357), gear tooth profile parameters (GB/T 1356), preferred numbers (GB/T 321), thread pitches (GB/T 193, ISO 261), bearing series (GB/T 276, GB/T 297).
- Tolerance and fit tables: IT grades, H7/h6 style fits, form/position tolerance classes.
- Material properties: allowable bending/contact stress, tensile strength, hardness ranges for named materials (45#, 40Cr, Q235, alloy grades).
- Machining/design constants: keyway dimensions, chamfer/fillet series, surface roughness Ra classes, thread relief undercut, retaining ring grooves.
- Any user request that explicitly names a standard, handbook, chapter, or a numeric spec you would otherwise have to guess.

Skip retrieval when:

- The user has already supplied the exact numeric values.
- The task is purely geometric ("box 100×60×20, four M4 holes at corners") with no dependency on catalog data.
- The value is a common, non-standardized dimension (e.g. arbitrary enclosure size) chosen by design intent.

Never fabricate a standard number, table entry, or material property. If retrieval fails or returns nothing relevant, state the missing value in your assumptions and pick a conservative, clearly-labeled default — do not present a made-up number as if it came from the standard.

## Tool Contract

Tool name: `cad-kb_search_knowledge`

Inputs:

- `query` (string, required): a natural-language query in Chinese or English. Include the standard identifier and the concrete quantity you need.
- `top_k` (integer, optional, 1–8, default 3): number of chunks to return. Use 3 for a single specific value, 5–8 when scanning tables or comparing options.

Output: a list of chunks, each with `filename`, `page`, `heading`, `text` (raw PDF paragraph), `polished_text` (optional Markdown, only for user-facing display — the model receives the raw `text`), and `score`.

## Query Strategy

A good query is precise, keyword-dense, and standard-anchored:

- Include the standard code when known: `GB/T 1357`, `ISO 261`, `GB/T 297`.
- Include the concrete quantity: `模数系列`, `齿数最小值`, `许用弯曲应力`, `H7 公差带`, `M8 螺距`.
- Include the material or class when relevant: `45钢 调质`, `40Cr 表面淬火`.
- Prefer 8–20 characters per query. Long sentences dilute the embedding.
- If the first query misses, reformulate with different keywords or an English synonym before giving up. One retry is usually enough.

Examples:

- `GB/T 1357 圆柱齿轮模数系列 第一系列`
- `45钢 调质 齿轮许用弯曲应力 σFP`
- `GB/T 1095 平键 键槽尺寸 8mm 轴径`
- `ISO 261 metric thread pitch M8`
- `深沟球轴承 6205 外径 内径 宽度`

## Using The Results

- Read every returned chunk before deciding. `heading` and `page` help you tell a table caption apart from a paragraph of prose.
- Cite the source in your final Chinese summary as `[filename 第 X 页]` so the user can trace the number back. This is user-facing text, not a code comment.
- If two chunks disagree, prefer the chunk whose `heading` most clearly matches the quantity you asked about; mention the disagreement in your summary rather than silently picking one.
- Put the retrieved numbers into `params` with clear names (`module`, `tooth_count`, `allowable_stress`, `key_width`, `key_depth`). Do not hard-code them inside expressions.
- Add a short comment next to the constant only when the source needs to be preserved in-code (rare — the user summary is usually enough).

## Failure Modes

- **Empty result**: the corpus does not cover this topic. State this in your assumptions, pick a conservative default, and continue. Do not retry with unrelated queries more than once.
- **Backend unreachable**: the tool returns an error. Proceed with clearly-labeled assumptions and note the retrieval failure in the summary. Do not stall the build.
- **Chunk looks irrelevant**: reformulate the query with more specific keywords once; if still poor, treat as empty result.
- **Chunk contradicts user request**: follow the user's explicit override, but flag the discrepancy in the summary.

## Interaction With Other Skills

- Before `cadquery-studio`: retrieve any standard values the model will need, then hand off to modeling.
- After `cad-vision-brief`: if the brief lists standard fasteners, gears, or bearings by callout, retrieve their catalog dimensions here before building the CadQuery source.
- This skill never edits `cadquery.py` and never renders. It only feeds numeric ground truth into the downstream modeling step.
