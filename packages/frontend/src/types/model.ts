export interface ParameterDef {
  name: string;
  label: string;
  type: "number" | "integer" | "string" | "boolean" | "enum";
  default: number | string | boolean;
  current_value: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  group?: string;
}

export interface CADModel {
  modelUrl: string;
  code: string;
  parameters: ParameterDef[];
}

export interface AIModelInfo {
  id: string;
  name: string;
  provider: string;
}
