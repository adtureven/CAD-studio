from fastapi import APIRouter

from ..models.cad import CADExecuteRequest, CADExecuteResponse, CADNameRequest, CADNameResponse, ParamUpdateRequest
from ..services.ai.base import AIRequest
from ..services.ai import model_config
from ..services.ai.router import ai_router
from ..services.cad.executor import execute_cadquery

router = APIRouter()


NAME_SYSTEM_PROMPT = """你负责给 CAD 模型生成简短、直观的中文名称。
要求：
- 只输出名称本身，不要解释、编号、引号或标点。
- 名称应根据用户需求和代码特征总结模型用途或形状。
- 优先 2 到 10 个汉字；必要时可包含 M3/M4、USB、STEP 等短英文术语。
- 不要使用“智能体模型”“生成模型”“模型”这类泛称。"""


def _clean_model_name(value: str, fallback: str) -> str:
    name = (value or "").strip()
    name = name.strip("`\"'“”‘’ \t\r\n")
    if "\n" in name:
        name = next((line.strip() for line in name.splitlines() if line.strip()), "")
    for prefix in ("名称：", "名字：", "模型名称：", "CAD名称："):
        if name.startswith(prefix):
            name = name[len(prefix):].strip()
    name = name.strip("：:，,。.;；-—_ \t\r\n\"'“”‘’")
    if not name:
        return fallback
    return name[:24]


def _fallback_name(value: str) -> str:
    name = (value or "生成模型").strip()
    return name[:24] or "生成模型"


@router.post("/execute", response_model=CADExecuteResponse)
async def execute_cad(request: CADExecuteRequest):
    result = execute_cadquery(request.code, request.parameters)
    return CADExecuteResponse(**result)


@router.post("/update-params", response_model=CADExecuteResponse)
async def update_params(request: ParamUpdateRequest):
    result = execute_cadquery(request.code, request.parameters)
    return CADExecuteResponse(**result)


@router.post("/name", response_model=CADNameResponse)
async def name_cad(request: CADNameRequest):
    fallback = _fallback_name(request.fallback_name)
    model = request.model or model_config.default_model_id()

    try:
        provider = ai_router.get_provider(model)
    except ValueError:
        return CADNameResponse(name=fallback)

    code_preview = request.code[:3000]
    user_prompt = request.prompt.strip() or "用户未提供文字需求，请根据 CadQuery 代码判断模型类型。"
    prompt = f"""用户需求：
{user_prompt}

CadQuery 代码片段：
```python
{code_preview}
```

请输出一个适合作为左侧历史列表显示的模型名称。"""

    try:
        name = await provider.generate(
            AIRequest(
                system_prompt=NAME_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
                model=model,
                max_tokens=64,
                temperature=0.2,
            )
        )
    except Exception:
        return CADNameResponse(name=fallback)

    return CADNameResponse(name=_clean_model_name(name, fallback))
