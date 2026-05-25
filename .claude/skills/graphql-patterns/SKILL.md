---
name: graphql-patterns
description: >
  Design and optimize GraphQL APIs — schema design, N+1 elimination with
  DataLoader, pagination (cursor/connection spec), authorization in resolvers,
  subscriptions, and error handling. Use when asked about "GraphQL schema",
  "resolver N+1", "DataLoader", "GraphQL pagination", "GraphQL subscriptions",
  "GraphQL authorization", or "how to structure a GraphQL API".
  Do NOT use for: REST API design — use `api-design`. General query optimization
  on the database layer — use `database-patterns`.
origin: yamtam-original
license: MIT © 2025 Vũ Văn Tâm
version: 1.0.0
compatibility: "Any GraphQL server. Examples in GraphQL SDL + JavaScript."
---

## When to Use

- Use when: designing a GraphQL schema for a new product or feature
- Use when: GraphQL resolvers are causing N+1 database queries
- Use when: implementing pagination on a GraphQL list field
- Use when: adding authorization checks to resolvers
- Do NOT use for: REST endpoint design — different trade-offs

---

## Schema Design

### Naming conventions
```graphql
type Order {          # PascalCase for types
  id: ID!
  placedAt: DateTime! # camelCase for fields
  status: OrderStatus # enum type for finite values
  items: [OrderItem!]!
  customer: User!
}

enum OrderStatus {    # SCREAMING_SNAKE for enum values
  PENDING
  PAID
  SHIPPED
  CANCELLED
}

type Query {
  order(id: ID!): Order              # singular for single item
  orders(filter: OrderFilter): [Order!]!  # plural for list
}

type Mutation {
  placeOrder(input: PlaceOrderInput!): PlaceOrderPayload!  # input/payload wrappers
}
```

### Input/Payload wrappers (mandatory for mutations)
```graphql
input PlaceOrderInput {
  items: [OrderItemInput!]!
  shippingAddressId: ID!
}

type PlaceOrderPayload {
  order: Order         # null on error
  errors: [UserError!] # field-level errors
}

type UserError {
  field: String
  message: String!
}
```
Return `errors` array in payload — never throw exceptions as the only error signal.

### Non-nullable rules
- `!` for fields that are always present when the object exists
- Lists of non-null: `[Item!]!` = list is never null, items are never null
- Nullable fields: only when genuinely optional or may be null for some objects

---

## N+1 Problem — DataLoader

Every list resolver is a N+1 risk. Solve with DataLoader before shipping.

```
Without DataLoader:
  Query orders (1 DB call) → for each order, load customer (N DB calls)
  10 orders = 11 DB queries

With DataLoader:
  Collect all customer IDs across all orders → 1 batch DB call → distribute results
  10 orders = 2 DB queries (orders + 1 batched customer fetch)
```

```javascript
// DataLoader setup
const userLoader = new DataLoader(async (userIds) => {
  const users = await db.users.findMany({ where: { id: { in: userIds } } });
  // Return in same order as input IDs
  return userIds.map(id => users.find(u => u.id === id));
});

// Resolver
const resolvers = {
  Order: {
    customer: (order) => userLoader.load(order.customerId)  // batched automatically
  }
};
```

Rule: every resolver that loads a related object by ID must use DataLoader.

---

## Pagination — Relay Connection Spec

Use the Relay connection spec for all paginated lists. It is the GraphQL standard.

```graphql
type OrderConnection {
  edges: [OrderEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type OrderEdge {
  node: Order!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

type Query {
  orders(first: Int, after: String, last: Int, before: String): OrderConnection!
}
```

Cursor is typically `base64(created_at + id)` — opaque to clients.

---

## Authorization in Resolvers

Authorization must be checked at the resolver level, not just at the HTTP layer.

```javascript
const resolvers = {
  Query: {
    order: async (_, { id }, context) => {
      const order = await db.orders.findById(id);
      if (!order) return null;

      // Field-level authorization — not just top-level auth middleware
      if (order.customerId !== context.user.id && !context.user.isAdmin) {
        throw new ForbiddenError("Not authorized to view this order");
      }
      return order;
    }
  }
};
```

Rules:
- Every resolver that returns user-specific data must check ownership
- Never return null silently for authorization failures — throw `ForbiddenError`
- Sensitive fields (payment details, PII): field-level auth via resolver or directive

---

## Error Handling

```graphql
# Two types of errors in GraphQL:

# 1. Developer errors (unexpected) — returned in top-level errors array
{
  "errors": [{ "message": "Internal server error", "locations": [...] }],
  "data": { "order": null }
}

# 2. User errors (expected) — returned in payload errors field
{
  "data": {
    "placeOrder": {
      "order": null,
      "errors": [{ "field": "items", "message": "Cart is empty" }]
    }
  }
}
```

- Unexpected errors: log full stack trace server-side; return generic message to client
- Never expose stack traces or internal error messages in production responses
- User errors: always actionable, never expose internal details

---

## Anti-Fake-Pass Rules

Before claiming a GraphQL API is production-ready, you MUST show:
- [ ] All list resolvers audited for N+1 — DataLoader used for every related-object load
- [ ] Paginated lists: Relay connection spec (edges/node/pageInfo) not raw arrays
- [ ] Every resolver returning user-specific data has an ownership/permission check
- [ ] Mutations: input + payload wrappers present; user errors returned in payload
- [ ] Error handling: user errors vs developer errors separated in responses

Reference: `gates/anti-fake-pass-gate.md`
