export function buildRunErrorSummary(args: {
  message: string;
  nodeId?: string;
  nodeType?: string;
}): string {
  if (!args.nodeId) return args.message;
  const label = args.nodeType && args.nodeType.length > 0 ? args.nodeType : args.nodeId;
  if (args.message.startsWith(`Failed at ${label} (`)) return args.message;
  return `Failed at ${label} (${args.nodeId}): ${args.message}`;
}
