// Observation only: consumes official Host events, never launches or approves
// work. An unfinished trace remains RECONCILE; it is not permission to replay.
export class CodexProposalEvents {
  constructor(rootId, { maxChildren = 2, childTimeoutMs = 300000 } = {}) {
    if (!rootId || !Number.isInteger(maxChildren) || maxChildren < 0 ||
        !Number.isFinite(childTimeoutMs) || childTimeoutMs <= 0) throw Error('Invalid observation bounds');
    this.rootId = rootId; this.maxChildren = maxChildren; this.childTimeoutMs = childTimeoutMs;
    this.calls = new Map(); this.children = new Map(); this.turns = new Map();
    this.items = new Map(); this.usage = new Map(); this.violations = new Set(); this.lastMs = 0;
  }
  reject(reason) { this.violations.add(reason); }
  call(id, sender, name, atMs) {
    if (name === 'wait_agent') name = 'wait';
    if (!id || !sender) return this.reject('Unbound tool call');
    if (sender !== this.rootId) return this.reject('Child tool/delegation forbidden');
    if (!['spawn_agent', 'wait_agent', 'wait'].includes(name)) return this.reject('Forbidden Manager tool: ' + name);
    const prior = this.calls.get(id);
    if (prior && (prior.name !== name || prior.sender !== sender)) return this.reject('Conflicting tool identity');
    if (!prior) this.calls.set(id, { id, sender, name, requestedMs: atMs });
    if ([...this.calls.values()].filter(c => c.name === 'spawn_agent').length > this.maxChildren)
      this.reject('Excess spawn requests');
  }
  child(id, sender, callId, atMs, metadata = {}) {
    this.call(callId, sender, 'spawn_agent', atMs);
    if (!id || id === this.rootId) return this.reject('Invalid child identity');
    const call = this.calls.get(callId), prior = this.children.get(id);
    if (!call) return;
    if (call.childId && call.childId !== id || prior && prior.callId !== callId)
      return this.reject('Conflicting child/call identity');
    call.childId = id;
    if (!prior) this.children.set(id, { id, callId, observedMs: atMs, ...metadata });
    if (this.children.size > this.maxChildren) this.reject('Excess child creation');
  }
  observe(message, atMs) {
    if (!Number.isFinite(atMs) || atMs < this.lastMs) { this.reject('Observation clock regressed'); return this.snapshot(); }
    this.lastMs = atMs;
    const p = message.params ?? {}, item = p.item, sender = p.threadId;
    if (message.method === 'rawResponseItem/completed' &&
        ['function_call', 'custom_tool_call'].includes(item?.type))
      this.call(item.call_id, sender, item.name, atMs);
    if (['item/started', 'item/completed'].includes(message.method) && item) {
      const terminal = message.method === 'item/completed';
      // The Host may expose the same call as both activity and legacy collab
      // items. Deduplicate each representation; bind them through callId.
      const base = sender + ':' + item.id + ':' + item.type, key = base + ':' + terminal;
      const prior = this.items.get(key);
      if (prior && JSON.stringify(prior.item) !== JSON.stringify(item))
        this.reject('Conflicting item event');
      if (!prior) this.items.set(key, { sender, item, terminal });
      if (item.type === 'subAgentActivity') {
        if (sender !== this.rootId) this.reject('Nested agent activity');
        if (item.kind === 'started') this.child(item.agentThreadId, sender, item.id, atMs,
          { agentPath: item.agentPath, model: item.model, reasoningEffort: item.reasoningEffort });
        else if (item.kind === 'completed') {
          if (!this.children.has(item.agentThreadId)) this.reject('Completion without observed dispatch');
          // Activity completion is not a successful turn/result. Require the
          // independently observed turn/completed event for the same child.
        } else this.reject('Unknown subagent activity: ' + item.kind);
      } else if (item.type === 'collabAgentToolCall') {
        const name = item.tool === 'spawnAgent' ? 'spawn_agent' : item.tool;
        this.call(item.id, item.senderThreadId, name, atMs);
        if (name === 'spawn_agent') for (const id of item.receiverThreadIds ?? [])
          this.child(id, item.senderThreadId, item.id, atMs, { model: item.model });
      } else if (!['userMessage', 'agentMessage', 'reasoning'].includes(item.type))
        this.reject('Unexpected proposal-only item: ' + item.type);
    }
    if (['turn/started', 'turn/completed'].includes(message.method)) {
      const t = p.turn, prior = this.turns.get(sender);
      if (!t?.id || sender !== this.rootId && !this.children.has(sender)) this.reject('Unbound turn');
      if (prior && prior.id !== t.id) this.reject('Additional turn or Resume');
      else if (message.method === 'turn/started') {
        if (!prior) this.turns.set(sender, { id: t.id, startMs: atMs, status: 'inProgress' });
      } else if (!prior) this.reject('Completion without turn start');
      else if (prior.endMs !== undefined) {
        if (JSON.stringify(prior.result) !== JSON.stringify(t)) this.reject('Conflicting turn completion');
      } else {
        Object.assign(prior, { endMs: atMs, status: t.status, result: t });
        if (t.status !== 'completed' || t.error) this.reject('Host turn did not complete successfully');
      }
    }
    if (message.method === 'thread/tokenUsage/updated') this.usage.set(sender, p.tokenUsage);
    return this.snapshot();
  }
  checkDeadline(nowMs) {
    if (!Number.isFinite(nowMs) || nowMs < this.lastMs) this.reject('Observation clock regressed');
    for (const child of this.children.values()) {
      const turn = this.turns.get(child.id);
      const end = turn?.endMs ?? nowMs;
      if (end - child.observedMs > this.childTimeoutMs) this.reject('Child timeout: ' + child.id);
    }
    // A spawn request with no returned identity is also an uncertain effect.
    for (const call of this.calls.values()) if (call.name === 'spawn_agent' && !call.childId &&
        nowMs - call.requestedMs > this.childTimeoutMs) this.reject('Unresolved spawn timeout: ' + call.id);
    return this.snapshot();
  }
  snapshot() {
    const children = [...this.children.values()].map(c => ({ ...c, turn: this.turns.get(c.id) ?? null }));
    const unresolved = [...this.calls.values()].filter(c => c.name === 'spawn_agent' && !c.childId);
    const complete = !this.violations.size && !unresolved.length && children.length === this.maxChildren &&
      children.every(c => c.turn?.status === 'completed') && this.turns.get(this.rootId)?.status === 'completed';
    let overlapMs = 0;
    for (let i = 0; i < children.length; i++) for (let j = i + 1; j < children.length; j++) {
      const a = children[i].turn, b = children[j].turn;
      if (a?.endMs !== undefined && b?.endMs !== undefined)
        overlapMs += Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
    }
    return { status: this.violations.size || !complete ? 'RECONCILE' : 'PROPOSALS_RETURNED',
      shouldStop: !!this.violations.size, reasons: [...this.violations], children, unresolved,
      spawnRequests: [...this.calls.values()].filter(c => c.name === 'spawn_agent').length,
      overlapMs, complete, executionGranted: false, authority: 'HOST_OBSERVATION_NOT_VERIFICATION',
      lifetimeCallCap: 'OBSERVER_STOP_NOT_HOST_ENFORCED', depthEnforcement: 'NOT_PROVEN_BY_TRACE' };
  }
}

// Host app-server has no per-turn token ceiling in this path. Bound the bytes
// supplied by CodeFleet before dispatch; evaluate Host token usage only after
// observation. Neither check grants Fileset approval or verification authority.
export function assessCodexProposalBudget({ promptBytes, elapsedMs, tokenUsage, rootTurns, limits, promptPreflightApplied = true }) {
  const { maxPromptBytes, maxDurationMs, maxInputTokens, maxOutputTokens, maxRootTurns } = limits;
  if (![promptBytes, rootTurns, maxPromptBytes, maxDurationMs,
    maxInputTokens, maxOutputTokens, maxRootTurns].every(n => Number.isSafeInteger(n) && n >= 0) ||
      !Number.isFinite(elapsedMs) || elapsedMs < 0)
    throw Error('Invalid Host proposal budget observation');
  const total = tokenUsage?.total;
  const observed = Number.isSafeInteger(total?.inputTokens) && Number.isSafeInteger(total?.outputTokens);
  const violations = [];
  if (promptPreflightApplied && promptBytes > maxPromptBytes) violations.push('PROMPT_BYTES_EXCEEDED');
  if (elapsedMs > maxDurationMs) violations.push('DURATION_EXCEEDED');
  if (rootTurns !== maxRootTurns) violations.push('ROOT_TURN_COUNT_MISMATCH');
  if (observed && total.inputTokens > maxInputTokens) violations.push('OBSERVED_INPUT_TOKENS_EXCEEDED');
  if (observed && total.outputTokens > maxOutputTokens) violations.push('OBSERVED_OUTPUT_TOKENS_EXCEEDED');
  return { status: violations.length ? 'POLICY_VIOLATION' : observed ? 'WITHIN_OBSERVED_LIMITS' : 'NOT_VERIFIED',
    violations, promptBytes, promptPreflightApplied,
    wouldExceedCurrentPromptByteCeiling: promptBytes > maxPromptBytes, elapsedMs, rootTurns,
    observedInputTokens: observed ? total.inputTokens : null,
    observedOutputTokens: observed ? total.outputTokens : null,
    enforcement: { rootTurns: 'RUNNER_ENFORCED', durationMs: 'RUNNER_TIMER_ENFORCED',
      promptBytes: promptPreflightApplied ? 'RUNNER_PREFLIGHT_ENFORCEABLE' : 'NOT_APPLIED_AT_THIS_TURN',
      inputTokens: 'HOST_POSTTURN_OBSERVATION_ONLY',
      outputTokens: 'HOST_POSTTURN_OBSERVATION_ONLY', cost: 'UNKNOWN' },
    automaticAcceptanceAllowed: false, modelInvocationGranted: false };
}

// Children inherit the already-bound Batch; the Manager need not regenerate
// source/test text inside each spawn call. This reduces dispatch generation,
// but is not a tool-access policy or proof of concurrent Host execution.
export function proposalDispatchMessages(batch) {
  if (!batch?.batchHash || batch.mode !== 'PARALLEL_PROPOSALS_ONLY' || batch.requests?.length !== 2)
    throw Error('Two independent prepared proposals required');
  const owned = batch.requests.flatMap(r => r.item.files.map(f => f.toLowerCase()));
  if (batch.requests.some(r => r.item.dependencies.length) || new Set(owned).size !== owned.length)
    throw Error('Dependent or conflicting proposal assignments');
  return batch.requests.map(r => ({ task_name: r.item.id.replaceAll('-', '_'), fork_turns: 'all',
    message: `Use the inherited HostProposalBatch ${batch.batchHash}, request item ${r.item.id}. ` +
      `Own only ${r.item.files.join(', ')}. The request contains source, tests and base hashes. ` +
      'One proposal turn: no tools, commands, writes, tests, delegation or follow-up. ' +
      'Return only JSON {itemId,agentId:"self",files:[{path,content,baseSha256}],feedback}; content is the complete replacement. ' +
      'Do not treat proposal output as approval or verification.' }));
}
