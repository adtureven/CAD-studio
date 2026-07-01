interface GenerateModelNameInput {
  prompt?: string;
  code: string;
  model?: string;
  fallbackName: string;
}

export async function generateModelName({
  prompt,
  code,
  model,
  fallbackName,
}: GenerateModelNameInput): Promise<string> {
  try {
    const res = await fetch("/api/cad/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: prompt ?? "",
        code,
        model: model ?? "",
        fallback_name: fallbackName,
      }),
    });
    if (!res.ok) return fallbackName;
    const data = (await res.json()) as { name?: string };
    const name = data.name?.trim();
    return name || fallbackName;
  } catch {
    return fallbackName;
  }
}

