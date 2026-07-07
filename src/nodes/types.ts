import type { z } from "zod";
import type {
  CatalogNodeType,
  NodeInputFor,
  NodeOutputFor,
} from "../schemas/nodeSchemas";
import type { HandleDataType } from "../schemas/handleTypes";
import type { NodeExecuteContext, NodeExecuteResult } from "./executeShared";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type NodeUiHandle = {
  id: string;
  label: string;
  kind: "input" | "output";
  dataType: HandleDataType;
};

export type NodeUiFieldControl =
  | "text"
  | "textarea"
  | "url"
  | "url_list"
  | "select"
  | "boolean"
  | "number"
  | "slider"
  | "mode_tabs"
  | "kling_elements"
  | "image_upload";

export type NodeUiFieldVisibleWhen = {
  key: string;
  in: string[];
};

export type NodeUiFieldGroupWhen = {
  when: NodeUiFieldVisibleWhen;
  group: "primary" | "advanced";
};

export type NodeUiFieldLabelWhen = {
  when: NodeUiFieldVisibleWhen;
  label: string;
};

export type NodeUiFieldPlaceholderWhen = {
  when: NodeUiFieldVisibleWhen;
  placeholder: string;
};

export type NodeUiFieldLayout =
  | "default"
  | "inline"
  | "select_primary"
  | "image_upload"
  | "slider";

export type NodeUiField = {
  key: string;
  label: string;
  /** Omit for non-connectable controls (e.g. mode tabs). */
  handleId?: string;
  control: NodeUiFieldControl;
  group: "primary" | "advanced";
  dataType: HandleDataType;
  required?: boolean;
  optionsKey?: string;
  placeholder?: string;
  maxLength?: number;
  /** Optional textarea row count (default 3). */
  textareaRows?: number;
  /** Bounds for slider / numeric controls. */
  numberMin?: number;
  numberMax?: number;
  numberStep?: number;
  /** Value restored by the inline reset control (defaults to numberMin). */
  resetValue?: number;
  /** Visual layout for the label + control row. */
  layout?: NodeUiFieldLayout;
  /** Handle anchor offset from field top (px). Defaults to 14 for default/select_primary, 20 for inline. */
  handleTop?: number;
  /** Override handle dot styling (defaults to dataType). */
  handleVariant?: HandleDataType;
  /** Short help label shown below the control (e.g. upload requirements). */
  helpText?: string;
  /** Tooltip body for the help label. */
  helpTooltip?: string;
  /** When set, field is shown only if inputs[key] is one of visibleWhen.in. */
  visibleWhen?: NodeUiFieldVisibleWhen;
  /** First matching entry overrides `group`; falls back to `group`. */
  groupWhen?: NodeUiFieldGroupWhen[];
  /** First matching entry overrides `label`; falls back to `label`. */
  labelWhen?: NodeUiFieldLabelWhen[];
  /** First matching entry overrides `placeholder`; falls back to `placeholder`. */
  placeholderWhen?: NodeUiFieldPlaceholderWhen[];
};

/**
 * How the frontend renders the node body from build-time config.
 * - fields: static controls from fields (default)
 * - dynamic_fields: request-style editable field list
 * - response_bindings: response-style edge-driven outputs
 */
export type NodeUiBody = "fields" | "dynamic_fields" | "response_bindings";

export type NodeUiConfig = {
  title: string;
  description?: string;
  category?: string;
  body?: NodeUiBody;
  handles: NodeUiHandle[];
  fields: NodeUiField[];
  defaults?: Record<string, JsonValue>;
  /** Collapsible advanced section label (default: Advanced). */
  settingsLabel?: string;
  pricing?: {
    /** Static default shown in UI when inputs are unavailable. */
    estimateCredits: number;
    description?: string;
  };
};

/** Live credit estimate from resolved node inputs (owned by the node catalog entry). */
export type NodeCreditEstimator = (inputs: Record<string, unknown>) => number;

export type NodeDefinition<T extends CatalogNodeType = CatalogNodeType> = {
  type: T;
  ui: NodeUiConfig;
  input: z.ZodType<NodeInputFor<T>>;
  output: z.ZodType<NodeOutputFor<T>>;
  /** Dynamic credit estimate; falls back to `ui.pricing.estimateCredits` when omitted. */
  estimateCredits?: NodeCreditEstimator;
  /** Optional raw-input normalization before central `input` schema validation. */
  prepareInputs?: (raw: Record<string, unknown>) => Record<string, unknown>;
  /**
   * Execution wiring for this node type. The orchestrator calls this via the
   * registry — no per-type switch in executeNode.
   * `validatedInputs` is already parsed by `def.input` in executeNode.
   */
  execute: (
    validatedInputs: NodeInputFor<T>,
    ctx: NodeExecuteContext,
  ) => Promise<NodeExecuteResult<NodeOutputFor<T>>>;
};

/**
 * Preserve per-node input/output inference when registering catalog entries.
 * Use instead of `satisfies NodeDefinition` to avoid widening to `unknown`.
 */
export function defineNode<T extends CatalogNodeType>(definition: NodeDefinition<T>): NodeDefinition<T> {
  return definition;
}

export type { NodeExecuteContext, NodeExecuteResult };

export type NodeProviderConfig = {
  providers: string[];
  timeoutMs: number;
  retryPerProvider: number;
  model?: string;
};
