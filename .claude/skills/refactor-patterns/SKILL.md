---
name: refactor-patterns
description: >
  Apply systematic refactoring patterns — strangler fig for legacy migration,
  seam detection, extract method/class, introduce parameter object, replace
  conditional with polymorphism, and safe refactoring sequencing. Use when asked
  to "refactor this", "clean up legacy code", "this is unmaintainable", "too
  many if statements", "extract this logic", or "how do I migrate without
  breaking everything". Do NOT use for: full rewrites — that is an architecture
  decision, not a refactoring task.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Language-agnostic patterns. Examples in Python/TypeScript."
---

## When to Use

- Use when: a function is > 40 lines or does more than one thing
- Use when: a class has more than one reason to change
- Use when: adding a feature requires touching 10 different files
- Use when: migrating from a legacy system to a new one incrementally
- Do NOT use for: style-only changes with no behavior — that is formatting, not refactoring

---

## Core Rule: Refactoring Is Not Rewriting

Refactoring = changing structure without changing behavior. Every step must be testable.

**Safe sequence:**
1. Write characterization tests first (capture current behavior, even if wrong)
2. Refactor in small, verified steps
3. Run tests after every step — a failing test means you changed behavior
4. Commit each working step — enables bisect if something breaks

---

## Pattern Reference

### Extract Method
When: a code block has a comment explaining what it does, or does one distinct thing.
```python
# Before
def process_order(order):
    # validate
    if not order.items: raise ValueError("empty")
    if order.total < 0:  raise ValueError("negative total")
    # save
    db.save(order)
    # notify
    email.send(order.user, "Your order was placed")

# After
def process_order(order):
    _validate_order(order)
    db.save(order)
    _notify_user(order)

def _validate_order(order): ...
def _notify_user(order): ...
```

### Extract Class
When: a class has two distinct groups of data/methods that don't talk to each other.
```
OrderService has:
  - order_items, calculate_total(), apply_discount()   ← pricing concern
  - user_address, validate_shipping(), shipping_cost() ← shipping concern

Split into:
  PricingCalculator  (total, discount)
  ShippingCalculator (address, cost)
  OrderService       (orchestrates both)
```

### Introduce Parameter Object
When: a function takes ≥ 4 parameters that logically belong together.
```python
# Before
def create_report(start_date, end_date, region, currency, include_tax):

# After
@dataclass
class ReportOptions:
    start_date: date
    end_date: date
    region: str
    currency: str = "USD"
    include_tax: bool = True

def create_report(options: ReportOptions):
```

### Replace Conditional with Polymorphism
When: a switch/if-elif chain dispatches on a type field.
```python
# Before
def render(shape):
    if shape.type == "circle":  return render_circle(shape)
    elif shape.type == "rect":  return render_rect(shape)
    elif shape.type == "line":  return render_line(shape)

# After
class Circle:
    def render(self): ...
class Rect:
    def render(self): ...
# Caller: shape.render()  — no conditional needed
```

---

## Strangler Fig (Legacy Migration)

Incrementally replace a legacy system without a big-bang rewrite.

```
Phase 1 — Intercept
  All requests → Facade → Legacy System (100%)
  Facade logs which features are called how often

Phase 2 — Divert one feature
  Facade checks: is this request for Feature X?
    Yes → New System (Feature X only)
    No  → Legacy System

Phase 3 — Divert more features (repeat)
  Each iteration: extract one feature, verify, shift traffic

Phase 4 — Retire
  When 100% diverted → remove Legacy System → remove Facade
```

Rules:
- Never run both systems writing to the same DB — divergence is catastrophic
- Dual-write period: write to both, read from new, verify consistency before cutting read
- Keep legacy running until 0% traffic — don't delete before verifying

---

## Seam Detection

A seam is a place where you can change behavior without touching the code being changed.
Find seams before refactoring — they are where tests and extractions plug in.

Types of seams:
- **Object seam**: inject a dependency rather than constructing it inside the class
- **Link seam**: replace a module/library at link time (dependency injection framework)
- **Preprocessing seam**: conditionally compile or load different code

```python
# Before: no seam — impossible to test without sending real emails
class OrderService:
    def place(self, order):
        EmailClient().send(...)  # hardcoded, untestable

# After: object seam — inject email client
class OrderService:
    def __init__(self, email_client: EmailClient):
        self._email = email_client

    def place(self, order):
        self._email.send(...)  # testable with a mock
```

---

## Refactoring Sequence for Large Functions

For a function > 100 lines with no tests:
1. Write a characterization test (golden master): capture current output for known inputs
2. Extract all inline comments into method names (Extract Method)
3. Eliminate magic numbers → named constants
4. Eliminate repeated logic → helper methods
5. Group data that moves together → parameter objects or small classes
6. If conditionals on type → introduce polymorphism
7. Verify tests still pass after each step

---

## Anti-Fake-Pass Rules

Before claiming a refactor is done, you MUST show:
- [ ] Tests existed before refactoring, or characterization tests written first
- [ ] All tests pass after refactoring (behavior unchanged)
- [ ] Each pattern applied has a named reason (not "I cleaned it up")
- [ ] No scope creep: only structural changes, no new behavior added
- [ ] Legacy migration (if strangler fig): traffic routing verified before removing old code

Reference: `gates/anti-fake-pass-gate.md`
