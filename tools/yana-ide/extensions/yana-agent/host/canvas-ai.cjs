const CANVAS_PART_KINDS = [
  "button",
  "text",
  "input",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "card",
  "tabs",
  "nav",
  "sidebar",
  "hero",
  "chip",
  "badge",
  "avatar",
  "search",
  "list",
  "table",
  "modal",
  "image",
  "divider",
  "switch",
];

const finite = (value, low, high) =>
  Number.isFinite(value) && value >= low && value <= high;
const hex = (value) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const text = (value, limit) =>
  typeof value === "string" && value.trim() && value.length <= limit;

function validateCanvasDocument(document) {
  if (
    !document ||
    document.version !== 1 ||
    !Array.isArray(document.screens) ||
    !document.screens.length ||
    document.screens.length > 20
  )
    throw new Error("Invalid Canvas document");
  if (
    !document.theme ||
    !text(document.name, 200) ||
    !hex(document.theme.accent) ||
    !hex(document.theme.surface) ||
    !hex(document.theme.foreground) ||
    !["compact", "rounded", "pill"].includes(document.theme.shape) ||
    !["system", "serif", "mono"].includes(document.theme.font) ||
    !["standard", "expressive", "reduced"].includes(document.theme.motion)
  )
    throw new Error("Invalid Canvas document");
  for (const screen of document.screens) {
    if (
      !text(screen.id, 200) ||
      !text(screen.name, 200) ||
      !["phone", "desktop"].includes(screen.device) ||
      !hex(screen.background) ||
      !Array.isArray(screen.parts) ||
      screen.parts.length > 300
    )
      throw new Error("Invalid Canvas screen");
    for (const part of screen.parts) {
      if (!text(part.id, 200)) throw new Error("Invalid Canvas part");
      try {
        const { id, ...definition } = part;
        validatePartPatch(definition, true);
      } catch {
        throw new Error("Invalid Canvas part");
      }
    }
  }
  return document;
}

function jsonFromModel(output) {
  if (typeof output !== "string" || !output.trim())
    throw new Error("AI returned an empty Canvas proposal");
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source =
    fenced || output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1);
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("AI returned invalid Canvas JSON");
  }
}

function validatePartPatch(patch, adding = false) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error("Invalid Canvas part patch");
  const allowed = [
    "kind",
    "label",
    "x",
    "y",
    "width",
    "height",
    "hidden",
    "locked",
    "opacity",
    "fill",
    "radius",
  ];
  if (Object.keys(patch).some((key) => !allowed.includes(key)))
    throw new Error("Canvas proposal contains an unsupported part property");
  if (adding && !CANVAS_PART_KINDS.includes(patch.kind))
    throw new Error("Canvas proposal contains an unsupported component");
  if (
    adding &&
    ["label", "x", "y", "width", "height"].some(
      (key) => patch[key] === undefined,
    )
  )
    throw new Error("Canvas proposal contains an incomplete component");
  if (patch.label !== undefined && !text(patch.label, 2000))
    throw new Error("Invalid Canvas label");
  for (const key of ["x", "y"])
    if (patch[key] !== undefined && !finite(patch[key], 0, 4000))
      throw new Error(`Invalid Canvas ${key}`);
  if (patch.width !== undefined && !finite(patch.width, 20, 2000))
    throw new Error("Invalid Canvas width");
  if (patch.height !== undefined && !finite(patch.height, 8, 2000))
    throw new Error("Invalid Canvas height");
  for (const key of ["hidden", "locked"])
    if (patch[key] !== undefined && typeof patch[key] !== "boolean")
      throw new Error(`Invalid Canvas ${key}`);
  if (patch.opacity !== undefined && !finite(patch.opacity, 0, 1))
    throw new Error("Invalid Canvas opacity");
  if (patch.fill !== undefined && !hex(patch.fill))
    throw new Error("Invalid Canvas fill");
  if (patch.radius !== undefined && !finite(patch.radius, 0, 999))
    throw new Error("Invalid Canvas radius");
}

function parseCanvasProposal(output, document) {
  validateCanvasDocument(document);
  const proposal = jsonFromModel(output);
  if (
    !proposal ||
    !text(proposal.summary, 500) ||
    !Array.isArray(proposal.operations)
  )
    throw new Error("AI returned an invalid Canvas proposal");
  if (!proposal.operations.length || proposal.operations.length > 50)
    throw new Error("Canvas proposal must contain 1 to 50 operations");
  const screenIds = new Set(document.screens.map((screen) => screen.id));
  const parts = new Map(
    document.screens.map((screen) => [
      screen.id,
      new Set(screen.parts.map((part) => part.id)),
    ]),
  );
  for (const operation of proposal.operations) {
    if (!operation || typeof operation !== "object")
      throw new Error("Invalid Canvas operation");
    if (operation.type === "update_theme") {
      const patch = operation.patch;
      if (
        !patch ||
        Object.keys(patch).some(
          (key) =>
            ![
              "accent",
              "surface",
              "foreground",
              "shape",
              "font",
              "motion",
            ].includes(key),
        )
      )
        throw new Error("Invalid Canvas theme patch");
      for (const key of ["accent", "surface", "foreground"])
        if (patch[key] !== undefined && !hex(patch[key]))
          throw new Error(`Invalid Canvas theme ${key}`);
      if (
        patch.shape !== undefined &&
        !["compact", "rounded", "pill"].includes(patch.shape)
      )
        throw new Error("Invalid Canvas shape");
      if (
        patch.font !== undefined &&
        !["system", "serif", "mono"].includes(patch.font)
      )
        throw new Error("Invalid Canvas font");
      if (
        patch.motion !== undefined &&
        !["standard", "expressive", "reduced"].includes(patch.motion)
      )
        throw new Error("Invalid Canvas motion");
      continue;
    }
    if (!screenIds.has(operation.screenId))
      throw new Error("Canvas proposal targets an unknown screen");
    if (operation.type === "add_part") {
      validatePartPatch(operation.part, true);
      const screen = document.screens.find(
        (entry) => entry.id === operation.screenId,
      );
      const maxWidth = screen.device === "phone" ? 360 : 900;
      const maxHeight = screen.device === "phone" ? 720 : 560;
      if (
        operation.part.x + operation.part.width > maxWidth ||
        operation.part.y + operation.part.height > maxHeight
      )
        throw new Error(
          "Canvas proposal places a component outside the screen",
        );
      continue;
    }
    if (operation.type === "update_screen") {
      const patch = operation.patch;
      if (
        !patch ||
        Object.keys(patch).some(
          (key) => !["name", "device", "background"].includes(key),
        )
      )
        throw new Error("Invalid Canvas screen patch");
      if (patch.name !== undefined && !text(patch.name, 200))
        throw new Error("Invalid Canvas screen name");
      if (
        patch.device !== undefined &&
        !["phone", "desktop"].includes(patch.device)
      )
        throw new Error("Invalid Canvas device");
      if (patch.background !== undefined && !hex(patch.background))
        throw new Error("Invalid Canvas background");
      continue;
    }
    if (!["update_part", "delete_part"].includes(operation.type))
      throw new Error("Canvas proposal contains an unsupported operation");
    if (!parts.get(operation.screenId)?.has(operation.partId))
      throw new Error("Canvas proposal targets an unknown component");
    const screen = document.screens.find(
      (entry) => entry.id === operation.screenId,
    );
    const part = screen.parts.find((entry) => entry.id === operation.partId);
    if (part.locked)
      throw new Error("Canvas proposal cannot modify a locked component");
    if (operation.type === "update_part") {
      validatePartPatch(operation.patch);
      const merged = { ...part, ...operation.patch };
      const maxWidth = screen.device === "phone" ? 360 : 900;
      const maxHeight = screen.device === "phone" ? 720 : 560;
      if (
        merged.x + merged.width > maxWidth ||
        merged.y + merged.height > maxHeight
      )
        throw new Error(
          "Canvas proposal places a component outside the screen",
        );
    }
  }
  return {
    summary: proposal.summary.trim(),
    operations: proposal.operations,
  };
}

function buildCanvasPrompt(document, instruction, selection = {}) {
  validateCanvasDocument(document);
  if (!text(instruction, 2000))
    throw new Error("Describe the Canvas change in up to 2,000 characters");
  const serialized = JSON.stringify(document);
  if (serialized.length > 30000)
    throw new Error(
      "Canvas is too large for one AI edit; simplify the screen first",
    );
  return [
    "You are the structured design engine inside Yana Studio.",
    "Return JSON only. Do not use tools, Markdown, prose, or code fences.",
    'Schema: {"summary":"short Vietnamese summary","operations":[...]}.',
    "Allowed operations:",
    '- {"type":"add_part","screenId":"...","part":{"kind":"...","label":"...","x":0,"y":0,"width":100,"height":40,"fill":"#rrggbb","opacity":1,"radius":12}}',
    '- {"type":"update_part","screenId":"...","partId":"...","patch":{"label":"...","x":0,"y":0,"width":100,"height":40,"fill":"#rrggbb","opacity":1,"radius":12}}',
    '- {"type":"delete_part","screenId":"...","partId":"..."}',
    '- {"type":"update_screen","screenId":"...","patch":{"name":"...","device":"phone|desktop","background":"#rrggbb"}}',
    '- {"type":"update_theme","patch":{"accent":"#rrggbb","surface":"#rrggbb","foreground":"#rrggbb","shape":"compact|rounded|pill","font":"system|serif|mono","motion":"standard|expressive|reduced"}}',
    `Component kinds: ${CANVAS_PART_KINDS.join(", ")}.`,
    `Selected screen: ${selection.screenId || "none"}. Selected component: ${selection.partId || "none"}.`,
    `User request: ${instruction.trim()}`,
    `Current Canvas JSON: ${serialized}`,
    "Make the smallest coherent set of operations. Keep every object inside its screen bounds.",
  ].join("\n");
}

module.exports = {
  CANVAS_PART_KINDS,
  buildCanvasPrompt,
  parseCanvasProposal,
  validateCanvasDocument,
};
