from pydantic import BaseModel
from typing import Literal, Optional
from enum import Enum


class ParameterType(str, Enum):
    NUMBER = "number"
    INTEGER = "integer"
    STRING = "string"
    BOOLEAN = "boolean"
    ENUM = "enum"


class ParameterDef(BaseModel):
    name: str
    label: str
    type: ParameterType
    default: float | int | str | bool
    current_value: float | int | str | bool
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    options: Optional[list[str]] = None
    group: Optional[str] = None


class CADExecuteRequest(BaseModel):
    code: str
    parameters: Optional[dict[str, float | int | str | bool]] = None


class CADExecuteResponse(BaseModel):
    success: bool
    model_url: Optional[str] = None
    format: Optional[str] = None
    parameters: list[ParameterDef] = []
    error: Optional[str] = None
    execution_time_ms: int = 0


class ParamUpdateRequest(BaseModel):
    code: str
    parameters: dict[str, float | int | str | bool]


class ExportRequest(BaseModel):
    code: str
    parameters: dict[str, float | int | str | bool]
    format: Literal["step", "stl", "gltf"]
