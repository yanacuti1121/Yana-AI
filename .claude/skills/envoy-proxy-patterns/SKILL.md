---
name: envoy-proxy-patterns
description: Envoy L7 proxy filter chains, xDS dynamic configuration, rate limiting, request mirroring, and Lua/WASM filter patterns for sidecar-level traffic control in agent networks. Sources: envoyproxy/envoy (Apache-2.0).
origin: yamtam-engine — synthesized from envoyproxy/envoy (Apache-2.0)
license: Apache-2.0
version: 1.0.0
compatibility: yamtam-engine >= 1.3.52
---

# /envoy-proxy-patterns

## When to Use

- Intercept all HTTP traffic at sidecar level (log, modify, rate-limit) without changing app code
- xDS dynamic config: push route changes to 1000 Envoy instances without restart
- Request shadowing: mirror live traffic to a canary for testing without affecting prod users
- Custom Lua/WASM filter: add JWT validation or request signing at the proxy layer

## Do NOT use for

- Simple reverse proxy (use Traefik [[traefik-ingress-routing]] for ingress)
- Application-level request routing (put routing logic in app, not proxy)

---

## Static configuration (envoy.yaml)

```yaml
static_resources:
  listeners:
    - name: agent_listener
      address: { socket_address: { address: 0.0.0.0, port_value: 8080 } }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                stat_prefix: ingress_http
                access_log:
                  - name: envoy.access_loggers.stdout
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
                http_filters:
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: backend
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route: { cluster: agent_cluster }

  clusters:
    - name: agent_cluster
      connect_timeout: 5s
      type: STRICT_DNS
      load_assignment:
        cluster_name: agent_cluster
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address: { socket_address: { address: agent-service, port_value: 3000 } }
```

---

## Rate limiting filter

```yaml
http_filters:
  - name: envoy.filters.http.local_ratelimit
    typed_config:
      "@type": type.googleapis.com/udpa.type.v1.TypedStruct
      type_url: type.googleapis.com/envoy.extensions.filters.http.local_ratelimit.v3.LocalRateLimit
      value:
        stat_prefix: http_local_rate_limiter
        token_bucket:
          max_tokens:     100
          tokens_per_fill: 100
          fill_interval:  1s
        filter_enabled:
          default_value: { numerator: 100, denominator: HUNDRED }
        filter_enforced:
          default_value: { numerator: 100, denominator: HUNDRED }
        response_headers_to_add:
          - header: { key: x-rate-limit-remaining, value: "%DYNAMIC_METADATA(...)%" }
```

---

## Traffic mirroring (shadow canary)

```yaml
routes:
  - match: { prefix: "/api/task" }
    route:
      cluster: agent_v1
      request_mirror_policies:   # mirror to v2 without affecting v1 response
        - cluster: agent_v2
          runtime_fraction:
            default_value: { numerator: 10, denominator: HUNDRED }  # 10% shadow
```

---

## Lua filter (add request signing)

```yaml
http_filters:
  - name: envoy.filters.http.lua
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.lua.v3.LuaPerRoute
      inline_code: |
        function envoy_on_request(request_handle)
          local ts = tostring(os.time())
          request_handle:headers():add("x-yamtam-ts", ts)
          -- Add HMAC signature (simplified — use real crypto in production)
          request_handle:headers():add("x-yamtam-sig", "sha256:" .. ts)
        end
```

---

## Anti-Fake-Pass Checklist

```
❌ STRICT_DNS cluster without correct DNS hostname → Envoy resolves to 0 endpoints, 503 on all requests
❌ Rate limit filter before router filter → filter order matters; rate limit must come before router
❌ Traffic mirror latency → shadow requests add latency to proxy if mirrored cluster is slow; use async mirror
❌ xDS management server not reachable → Envoy keeps last known config (static fallback), not empty
❌ access_log not configured → no visibility into what Envoy is actually routing
❌ Lua filter blocking I/O → Lua runs synchronously; never do blocking calls in Lua filters
```
