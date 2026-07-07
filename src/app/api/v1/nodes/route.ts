import { listNodeDefinitions } from "@/nodes/registry";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    const nodes = listNodeDefinitions().map((def) => ({
      type: def.type,
      ui: def.ui,
    }));
    return jsonOk({ nodes });
  } catch (err) {
    return handleApiError(err);
  }
}
