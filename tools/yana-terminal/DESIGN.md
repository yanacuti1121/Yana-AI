# Yana Terminal UI Contract

## Non-negotiable principles

1. Transcript first. The conversation remains the primary surface.
2. No permanent sidebar on narrow terminals.
3. Scope is proposed before deep repository reads.
4. Scope expansion is explicit and reviewable.
5. Code claims must be traceable to file and line evidence.
6. Diff review happens before changes are applied.
7. UI depends on capability contracts, not a specific model or runtime.
8. Color supports meaning but is never the only signal.
9. Provider, runtime, storage, and safety logic are not duplicated in this UI incubator.
10. The interface must remain usable at 80, 100, 120, and 160 columns.

## Responsive behavior

```text
< 100 columns   transcript + composer only
100–119         transcript + overlays
>= 120          transcript + optional activity/plan sidebar
```

## MVP surfaces

- Header
- Transcript
- Composer
- Status bar
- Activity sidebar
- Plan sidebar
- Smart Scope overlay
- Plan overlay

## Future surfaces

- Diff review overlay
- Evidence viewer
- Context receipt
- Runtime/model selector
- Command palette
- Scope expansion approval

## Integration boundary

```text
Yana runtime/model systems
          ↓
      bridge trait
          ↓
     AppState events
          ↓
     terminal renderer
```

The terminal renderer must never call Ollama, LM Studio, TurboFieldfare, llama.cpp, or a cloud provider directly.
