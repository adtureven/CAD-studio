from fastapi import APIRouter

from ..models.cad import CADExecuteRequest, CADExecuteResponse, ParamUpdateRequest
from ..services.cad.executor import execute_cadquery

router = APIRouter()


@router.post("/execute", response_model=CADExecuteResponse)
async def execute_cad(request: CADExecuteRequest):
    result = execute_cadquery(request.code, request.parameters)
    return CADExecuteResponse(**result)


@router.post("/update-params", response_model=CADExecuteResponse)
async def update_params(request: ParamUpdateRequest):
    result = execute_cadquery(request.code, request.parameters)
    return CADExecuteResponse(**result)
