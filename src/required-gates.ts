// requiredGates — who must decide, and what evidence must exist, before a Run
// counts.
//
// Three dimensions, never collapsed into one scalar: runApproval and
// resultReview are DecisionGates (a person or a policy decides), verification is
// an EvidenceGate (something was observed). The design refuses scalar labels
// like NONE or HUMAN_REVIEW precisely because they blur which of the three is
// being talked about.
//
// A Project Profile default may defer with REQUIRE_EXPLICIT. A Task Revision may
// not: by the time a revision exists, deferral means nobody ever chose, and a
// Run planned from it would enforce a gate nobody set.
//
// Merging is per dimension and only ever narrows. `required` and `explicit` OR
// together, waiver.allowed ANDs, and allowedActors intersect. A source cannot
// hand back a permission another source withheld.

export const REQUIRE_EXPLICIT = "REQUIRE_EXPLICIT";

export const GATE_KEYS = ["runApproval", "resultReview", "verification"] as const;

export const GATE_ACTORS = ["HUMAN", "SYSTEM_POLICY"] as const;

/** Scalar shorthands the design names and refuses as final schema values. */
const REFUSED_SCALAR_LABELS = ["NONE", "HUMAN_REVIEW", "EXPLICIT_APPROVAL", "REQUIRED", "BLOCKED_UNTIL_POLICY"];

export type GateActor = (typeof GATE_ACTORS)[number];
export type Deferrable = boolean | typeof REQUIRE_EXPLICIT;

export interface DecisionGate {
  required: Deferrable;
  allowedActors: GateActor[];
  explicit: Deferrable;
}

export interface EvidenceGate {
  required: Deferrable;
  waiver: {
    allowed: boolean;
    allowedActors: GateActor[];
    explicit: Deferrable;
  };
}

export interface RequiredGates {
  runApproval: DecisionGate;
  resultReview: DecisionGate;
  verification: EvidenceGate;
}

export interface GateFinding {
  jsonPointer: string;
  detail: string;
}

/**
 * Core defaults. resultReview names HUMAN because a DecisionGate that is
 * required with no allowed actor is a gate nobody can ever satisfy.
 */
export const CORE_REQUIRED_GATES: RequiredGates = {
  runApproval: { required: false, allowedActors: [], explicit: false },
  resultReview: { required: true, allowedActors: ["HUMAN"], explicit: false },
  verification: { required: true, waiver: { allowed: false, allowedActors: [], explicit: true } }
};

export interface ValidateOptions {
  /** True for a Project Profile default, false for a Task Revision. */
  allowRequireExplicit: boolean;
  pointer: string;
}

export function validateRequiredGates(value: unknown, options: ValidateOptions): GateFinding[] {
  const findings: GateFinding[] = [];
  const { pointer, allowRequireExplicit } = options;

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ jsonPointer: pointer, detail: "requiredGates must be an object" }];
  }

  const block = value as Record<string, unknown>;
  const actual = Object.keys(block);
  const missing = GATE_KEYS.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !(GATE_KEYS as readonly string[]).includes(key));
  if (missing.length > 0 || unexpected.length > 0) {
    findings.push({
      jsonPointer: pointer,
      detail:
        `requiredGates must have exactly ${GATE_KEYS.join(", ")}` +
        (missing.length > 0 ? `; missing ${missing.join(", ")}` : "") +
        (unexpected.length > 0 ? `; unexpected ${unexpected.sort().join(", ")}` : "")
    });
  }

  findings.push(...decisionGate(block.runApproval, `${pointer}/runApproval`, allowRequireExplicit));
  findings.push(...decisionGate(block.resultReview, `${pointer}/resultReview`, allowRequireExplicit));
  findings.push(...evidenceGate(block.verification, `${pointer}/verification`, allowRequireExplicit));

  return findings;
}

function deferrable(
  value: unknown,
  pointer: string,
  allowRequireExplicit: boolean,
  findings: GateFinding[]
): void {
  if (typeof value === "boolean") {
    return;
  }
  if (value === REQUIRE_EXPLICIT) {
    if (!allowRequireExplicit) {
      findings.push({
        jsonPointer: pointer,
        detail: `${REQUIRE_EXPLICIT} is a deferral, and a Task Revision must be concrete`
      });
    }
    return;
  }
  if (typeof value === "string" && REFUSED_SCALAR_LABELS.includes(value)) {
    findings.push({
      jsonPointer: pointer,
      detail: `${value} is a scalar gate label, not a gate value; say required/allowedActors/explicit instead`
    });
    return;
  }
  findings.push({
    jsonPointer: pointer,
    detail: `must be true or false${allowRequireExplicit ? ` or ${REQUIRE_EXPLICIT}` : ""}, got ${JSON.stringify(value)}`
  });
}

function actors(value: unknown, pointer: string, findings: GateFinding[]): GateActor[] {
  if (!Array.isArray(value)) {
    findings.push({ jsonPointer: pointer, detail: "must be an array of HUMAN or SYSTEM_POLICY" });
    return [];
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !(GATE_ACTORS as readonly string[]).includes(entry)) {
      findings.push({ jsonPointer: pointer, detail: `${JSON.stringify(entry)} is not HUMAN or SYSTEM_POLICY` });
      continue;
    }
    if (seen.has(entry)) {
      findings.push({ jsonPointer: pointer, detail: `${entry} is listed more than once` });
      continue;
    }
    seen.add(entry);
  }
  return [...seen] as GateActor[];
}

function decisionGate(value: unknown, pointer: string, allowRequireExplicit: boolean): GateFinding[] {
  const findings: GateFinding[] = [];
  if (value === undefined) {
    return findings;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ jsonPointer: pointer, detail: "must be a DecisionGate object" }];
  }

  const gate = value as Record<string, unknown>;
  deferrable(gate.required, `${pointer}/required`, allowRequireExplicit, findings);
  deferrable(gate.explicit, `${pointer}/explicit`, allowRequireExplicit, findings);
  const list = actors(gate.allowedActors, `${pointer}/allowedActors`, findings);

  // A gate nobody may satisfy and a gate that carries actors it never uses are
  // both states where the object says more than the policy does.
  if (gate.required === true && list.length === 0) {
    findings.push({ jsonPointer: pointer, detail: "required=true needs at least one allowedActor" });
  }
  if (gate.required === false && (list.length > 0 || gate.explicit === true)) {
    findings.push({
      jsonPointer: pointer,
      detail: "required=false must carry allowedActors=[] and explicit=false"
    });
  }

  return findings;
}

function evidenceGate(value: unknown, pointer: string, allowRequireExplicit: boolean): GateFinding[] {
  const findings: GateFinding[] = [];
  if (value === undefined) {
    return findings;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ jsonPointer: pointer, detail: "must be an EvidenceGate object" }];
  }

  const gate = value as Record<string, unknown>;
  deferrable(gate.required, `${pointer}/required`, allowRequireExplicit, findings);

  const waiver = gate.waiver;
  if (waiver === null || typeof waiver !== "object" || Array.isArray(waiver)) {
    findings.push({ jsonPointer: `${pointer}/waiver`, detail: "must be an object" });
    return findings;
  }

  const block = waiver as Record<string, unknown>;
  if (typeof block.allowed !== "boolean") {
    // waiver.allowed has no deferral: whether a gap may be waived at all is not
    // a thing a Profile gets to leave open.
    findings.push({ jsonPointer: `${pointer}/waiver/allowed`, detail: "must be true or false" });
  }
  deferrable(block.explicit, `${pointer}/waiver/explicit`, allowRequireExplicit, findings);
  const list = actors(block.allowedActors, `${pointer}/waiver/allowedActors`, findings);

  if (block.allowed === true && list.length === 0) {
    findings.push({
      jsonPointer: `${pointer}/waiver`,
      detail: "waiver.allowed=true needs at least one waiver.allowedActor"
    });
  }

  return findings;
}

export interface MergeInput {
  label: string;
  gates: Partial<RequiredGates>;
}

export interface MergeResult {
  gates: RequiredGates;
  blockedReasons: string[];
  scanScope: { sourcesMerged: number; dimensionsMerged: number };
}

/**
 * Merges per dimension. Nothing here can widen: `required` and `explicit` OR,
 * `waiver.allowed` ANDs, and actor lists intersect across the sources that
 * require the gate.
 */
export function mergeRequiredGates(
  sources: MergeInput[],
  computedRisk: string
): MergeResult {
  const blockedReasons: string[] = [];

  const candidates = sources.map((s) => s.gates);
  const decisionFor = (key: "runApproval" | "resultReview"): DecisionGate => {
    const gates = candidates.map((c) => c[key]).filter((g): g is DecisionGate => g !== undefined);

    for (const gate of gates) {
      for (const [field, value] of [["required", gate.required], ["explicit", gate.explicit]] as const) {
        if (value === REQUIRE_EXPLICIT) {
          blockedReasons.push(`requiredGates.${key}.${field} is still ${REQUIRE_EXPLICIT}`);
        }
      }
    }

    const required = gates.some((g) => g.required === true);
    const explicit = gates.some((g) => g.explicit === true);

    // Only sources that require the gate get a say in who may satisfy it. A
    // source that does not require it carries an empty list by schema, and
    // intersecting with that would empty every gate.
    const requiring = gates.filter((g) => g.required === true);
    const allowedActors = required ? intersect(requiring.map((g) => g.allowedActors)) : [];

    if (required && allowedActors.length === 0) {
      blockedReasons.push(
        `requiredGates.${key} is required but the allowedActors intersection across sources is empty`
      );
    }

    return { required, allowedActors, explicit: required ? explicit : false };
  };

  const runApproval = decisionFor("runApproval");
  const resultReview = decisionFor("resultReview");

  // Risk that is not demonstrably low forces a human-visible review gate. UNKNOWN
  // counts as not-low: it is an unresolved state, not a low one.
  if (computedRisk !== "LOW" && !resultReview.required) {
    resultReview.required = true;
    if (resultReview.allowedActors.length === 0) {
      resultReview.allowedActors = ["HUMAN"];
    }
  }

  const evidenceGates = candidates.map((c) => c.verification).filter((g): g is EvidenceGate => g !== undefined);
  for (const gate of evidenceGates) {
    if (gate.required === REQUIRE_EXPLICIT) {
      blockedReasons.push(`requiredGates.verification.required is still ${REQUIRE_EXPLICIT}`);
    }
    if (gate.waiver?.explicit === REQUIRE_EXPLICIT) {
      blockedReasons.push(`requiredGates.verification.waiver.explicit is still ${REQUIRE_EXPLICIT}`);
    }
  }

  const verificationRequired = evidenceGates.some((g) => g.required === true);
  const waiverAllowed = evidenceGates.length > 0 && evidenceGates.every((g) => g.waiver.allowed === true);
  const waiverExplicit = evidenceGates.some((g) => g.waiver.explicit === true);
  const waiverActors = waiverAllowed
    ? intersect(evidenceGates.filter((g) => g.waiver.allowed === true).map((g) => g.waiver.allowedActors))
    : [];

  if (waiverAllowed && waiverActors.length === 0) {
    blockedReasons.push(
      "requiredGates.verification.waiver is allowed but the waiver.allowedActors intersection is empty"
    );
  }

  return {
    gates: {
      runApproval,
      resultReview,
      verification: {
        required: verificationRequired,
        waiver: { allowed: waiverAllowed, allowedActors: waiverActors, explicit: waiverExplicit }
      }
    },
    blockedReasons,
    scanScope: { sourcesMerged: sources.length, dimensionsMerged: GATE_KEYS.length }
  };
}

function intersect(lists: GateActor[][]): GateActor[] {
  if (lists.length === 0) {
    return [];
  }
  return lists.reduce((acc, list) => acc.filter((entry) => list.includes(entry)));
}
