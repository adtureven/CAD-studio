import ast
import json
import re
import time
import uuid
import subprocess
import tempfile
import sys
from pathlib import Path
from typing import Optional

from ...config import settings
from ...models.cad import ParameterDef, ParameterType


ALLOWED_IMPORTS = {"cadquery", "math", "cq"}

EXECUTOR_TEMPLATE = '''
import cadquery as cq
import math
import json
import sys

{code}

output_path = sys.argv[1] if len(sys.argv) > 1 else None

if "result" in dir():
    if output_path:
        cq.exporters.export(result, output_path, exportType="STEP")
        print("__CAD_RESULT__")
        print(json.dumps({{"step_file": output_path}}))
    else:
        shape = result.val() if hasattr(result, "val") else result
        vertices, faces = shape.tessellate(0.1)
        output = {{
            "vertices": [[v.x, v.y, v.z] for v in vertices],
            "faces": [[f[0], f[1], f[2]] for f in faces],
        }}
        print("__CAD_RESULT__")
        print(json.dumps(output))
else:
    print("__CAD_ERROR__")
    print("No 'result' variable found in generated code")
'''


def validate_code(code: str) -> Optional[str]:
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"Syntax error: {e}"

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                module = alias.name.split(".")[0]
                if module not in ALLOWED_IMPORTS:
                    return f"Import not allowed: {alias.name}"
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                module = node.module.split(".")[0]
                if module not in ALLOWED_IMPORTS:
                    return f"Import not allowed: {node.module}"
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                if node.func.id in ("exec", "eval", "compile", "__import__", "open"):
                    return f"Builtin not allowed: {node.func.id}"
            elif isinstance(node.func, ast.Attribute):
                if node.func.attr in ("system", "popen", "exec", "spawn"):
                    return f"Method not allowed: {node.func.attr}"

    return None


def extract_parameters(code: str) -> list[ParameterDef]:
    pattern = r"#\s*PARAMETER_DEFS:\s*(\[.*?\])"
    match = re.search(pattern, code, re.DOTALL)
    if not match:
        return _extract_params_from_dict(code)

    try:
        raw_defs = json.loads(match.group(1))
        return [ParameterDef(**d) for d in raw_defs]
    except (json.JSONDecodeError, Exception):
        return _extract_params_from_dict(code)


def _extract_params_from_dict(code: str) -> list[ParameterDef]:
    pattern = r'params\s*=\s*\{([^}]+)\}'
    match = re.search(pattern, code)
    if not match:
        return []

    params = []
    for line in match.group(1).strip().split("\n"):
        line = line.strip().rstrip(",")
        kv_match = re.match(r'"(\w+)"\s*:\s*([^,#]+)', line)
        if not kv_match:
            continue
        name = kv_match.group(1)
        value_str = kv_match.group(2).strip()
        try:
            value = json.loads(value_str)
        except (json.JSONDecodeError, ValueError):
            value = value_str

        param_type = ParameterType.NUMBER
        if isinstance(value, bool):
            param_type = ParameterType.BOOLEAN
        elif isinstance(value, int):
            param_type = ParameterType.INTEGER
        elif isinstance(value, str):
            param_type = ParameterType.STRING

        comment_match = re.search(r"#\s*(.+)$", line)
        label = comment_match.group(1).strip() if comment_match else name.replace("_", " ").title()

        params.append(ParameterDef(
            name=name,
            label=label,
            type=param_type,
            default=value,
            current_value=value,
        ))

    return params


def apply_parameters(code: str, parameters: dict) -> str:
    for name, value in parameters.items():
        if isinstance(value, str):
            replacement = f'"{value}"'
        elif isinstance(value, bool):
            replacement = "True" if value else "False"
        else:
            replacement = str(value)

        pattern = rf'("{name}"\s*:\s*)([^,\n}}]+)'
        code = re.sub(pattern, rf'\g<1>{replacement}', code)

    return code


def execute_cadquery(code: str, parameters: Optional[dict] = None, output_format: str = "step") -> dict:
    if parameters:
        code = apply_parameters(code, parameters)

    validation_error = validate_code(code)
    if validation_error:
        return {"success": False, "error": validation_error}

    script = EXECUTOR_TEMPLATE.format(code=code)

    start_time = time.time()

    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(script)
        script_path = f.name

    model_filename = f"{uuid.uuid4().hex}"
    step_path = settings.generated_dir / f"{model_filename}.step"

    try:
        cmd = [sys.executable, script_path]
        if output_format == "step":
            cmd.append(str(step_path))

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.max_execution_time,
        )

        elapsed_ms = int((time.time() - start_time) * 1000)

        if result.returncode != 0:
            return {
                "success": False,
                "error": result.stderr.strip() or "Execution failed",
                "execution_time_ms": elapsed_ms,
            }

        stdout = result.stdout
        if "__CAD_ERROR__" in stdout:
            error_msg = stdout.split("__CAD_ERROR__\n")[-1].strip()
            return {"success": False, "error": error_msg, "execution_time_ms": elapsed_ms}

        if "__CAD_RESULT__" not in stdout:
            return {
                "success": False,
                "error": "No CAD result produced",
                "execution_time_ms": elapsed_ms,
            }

        params = extract_parameters(code)

        if output_format == "step" and step_path.exists():
            return {
                "success": True,
                "model_url": f"/assets/{model_filename}.step",
                "format": "step",
                "parameters": [p.model_dump() for p in params],
                "execution_time_ms": elapsed_ms,
            }

        json_str = stdout.split("__CAD_RESULT__\n")[-1].strip()
        mesh_data = json.loads(json_str)

        gltf_path = settings.generated_dir / f"{model_filename}.gltf"
        _write_gltf(mesh_data, gltf_path)

        return {
            "success": True,
            "model_url": f"/assets/{model_filename}.gltf",
            "format": "gltf",
            "parameters": [p.model_dump() for p in params],
            "execution_time_ms": elapsed_ms,
        }

    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Execution timed out ({settings.max_execution_time}s)"}
    except json.JSONDecodeError as e:
        return {"success": False, "error": f"Failed to parse result: {e}"}
    finally:
        Path(script_path).unlink(missing_ok=True)


def _write_gltf(mesh_data: dict, output_path: Path):
    import struct
    import base64

    vertices = mesh_data["vertices"]
    faces = mesh_data["faces"]

    flat_vertices = []
    for v in vertices:
        flat_vertices.extend(v)

    flat_indices = []
    for f in faces:
        flat_indices.extend(f)

    vertex_data = struct.pack(f"<{len(flat_vertices)}f", *flat_vertices)
    index_data = struct.pack(f"<{len(flat_indices)}I", *flat_indices)

    vertex_b64 = base64.b64encode(vertex_data).decode()
    index_b64 = base64.b64encode(index_data).decode()

    mins = [min(vertices[i][j] for i in range(len(vertices))) for j in range(3)]
    maxs = [max(vertices[i][j] for i in range(len(vertices))) for j in range(3)]

    gltf = {
        "asset": {"version": "2.0", "generator": "CAD AI Studio"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{
            "primitives": [{
                "attributes": {"POSITION": 0},
                "indices": 1,
                "mode": 4,
            }]
        }],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(vertices),
                "type": "VEC3",
                "min": mins,
                "max": maxs,
            },
            {
                "bufferView": 1,
                "componentType": 5125,
                "count": len(flat_indices),
                "type": "SCALAR",
                "min": [0],
                "max": [len(vertices) - 1],
            },
        ],
        "bufferViews": [
            {
                "buffer": 0,
                "byteOffset": 0,
                "byteLength": len(vertex_data),
                "target": 34962,
            },
            {
                "buffer": 1,
                "byteOffset": 0,
                "byteLength": len(index_data),
                "target": 34963,
            },
        ],
        "buffers": [
            {"uri": f"data:application/octet-stream;base64,{vertex_b64}", "byteLength": len(vertex_data)},
            {"uri": f"data:application/octet-stream;base64,{index_b64}", "byteLength": len(index_data)},
        ],
    }

    with open(output_path, "w") as f:
        json.dump(gltf, f)
