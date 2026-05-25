**Rule:** network-egress-law
**Status:** REVIEWED
**Gate:** L3 — any outbound HTTP/DNS call from agent tools
**Source:** OWASP SSRF Prevention Cheat Sheet, OWASP LLM05 (Supply Chain), PortSwigger SSRF research, assetnote/ssrf-sheriff, URLparse confusion attacks (Orange Tsai), DNS rebinding research (Tavis Ormandy), AWS IMDSv1 metadata endpoint research

---

# Network Egress Law

## Threat

Agents with WebFetch / HTTP tool access can be weaponized to:
1. **SSRF**: fetch `http://169.254.169.254/` → AWS metadata (IAM credentials)
2. **DNS rebinding**: attacker controls DNS → resolves to internal IP after allowlist check
3. **Redirect chain**: trusted URL redirects to internal IP (open redirect + SSRF)
4. **Cloud metadata**: `http://metadata.google.internal/`, `http://100.100.100.200/` (Alibaba)
5. **URL parser confusion**: `http://attacker.com@internal.corp/path` — some parsers treat as internal

## Blocked destination patterns (Tier A — exit 3)

```bash
BLOCKED_NETWORKS=(
  "169.254."         # AWS/Azure/GCP link-local metadata
  "100.100.100.200"  # Alibaba Cloud metadata
  "metadata.google.internal"
  "metadata.internal"
  "169.254.169.254"
  "fd00:"            # IPv6 ULA (internal)
  "fc00:"            # IPv6 ULA
  "::1"              # IPv6 loopback
  "127."             # IPv4 loopback
  "10."              # RFC1918 private
  "172.16." "172.17." "172.18." "172.19." "172.20."
  "172.21." "172.22." "172.23." "172.24." "172.25."
  "172.26." "172.27." "172.28." "172.29." "172.30." "172.31."
  "192.168."         # RFC1918 private
  "0.0.0.0"          # invalid destination
)

check_egress_target() {
  local url="$1"
  local host
  host=$(python3 -c "from urllib.parse import urlparse; print(urlparse('$url').hostname or '')" 2>/dev/null)

  # Block URL parser confusion (@ in netloc = credential injection)
  if echo "$url" | grep -qP '://[^/]*@'; then
    echo "[egress] BLOCKED url_confusion url=$url"; exit 3
  fi

  # Resolve to IP and check (prevents DNS rebinding)
  local resolved
  resolved=$(getent hosts "$host" 2>/dev/null | awk '{print $1}' | head -1)

  for pattern in "${BLOCKED_NETWORKS[@]}"; do
    if [[ "$resolved" == "$pattern"* ]] || [[ "$host" == "$pattern"* ]]; then
      echo "[egress] BLOCKED ssrf_target host=$host resolved=$resolved"
      exit 3
    fi
  done
}
```

## Redirect following policy

```bash
# Never follow redirects blindly — re-check destination after each hop
# curl: use --max-redirs 3 and validate each Location header
safe_fetch() {
  local url="$1"
  check_egress_target "$url"

  local response
  response=$(curl -s -D - --max-redirs 0 "$url" 2>/dev/null)

  local location
  location=$(echo "$response" | grep -i '^Location:' | awk '{print $2}' | tr -d '\r')

  if [[ -n "$location" ]]; then
    check_egress_target "$location"          # validate redirect target
    safe_fetch "$location"                   # follow with same guard
  else
    echo "$response"
  fi
}
```

## Allowlist mode (recommended for agent production)

```json
// core/config/egress-allowlist.json
{
  "policy": "allowlist",
  "allowed_hosts": [
    "api.github.com",
    "registry.npmjs.org",
    "pypi.org",
    "api.anthropic.com"
  ],
  "allow_patterns": [
    "*.githubusercontent.com",
    "*.pkg.dev"
  ],
  "blocked_schemes": ["file", "gopher", "ftp", "dict"],
  "note": "deny-by-default — add hosts explicitly"
}
```

## URL scheme allowlist

```
Allowed:   https://   (TLS required in prod)
Dev-only:  http://    (only if YAMTAM_DEV_MODE=1)
Blocked:   file://    → local filesystem read
Blocked:   gopher://  → legacy SSRF vector
Blocked:   ftp://     → credential exposure
Blocked:   dict://    → port scanning
Blocked:   jar://     → JVM SSRF (Java envs)
```

## DNS rebinding defense

```bash
# Resolve BEFORE making request, compare AFTER connection
# Prevents: attacker DNS TTL=0 → check passes → TTL expires → re-resolves to 127.0.0.1

pre_resolve=$(dig +short "$host" | tail -1)
check_egress_target_ip "$pre_resolve"
# Make request with --resolve flag to pin the IP
curl --resolve "$host:443:$pre_resolve" "https://$host/path"
# Do NOT re-resolve during the request
```

## Integration with safe-run.sh

```bash
# Add to safe-run.sh BLOCKED_PATTERNS:
"curl.*169\.254\."
"wget.*169\.254\."
"curl.*metadata\.google"
"fetch.*file://"
"curl.*--resolve.*127\."
```

## Anti-Pattern Checklist

```
❌ WebFetch with no destination validation (SSRF open door)
❌ Following HTTP redirects without re-checking destination
❌ Allowlist checked on hostname only (DNS rebinding bypasses)
❌ http:// allowed in production (metadata endpoints require no TLS)
❌ file:// scheme not blocked (local file read via fetch)
❌ URL with @ in netloc passed to fetch without parser confusion check
❌ egress-allowlist.json set to "policy": "denylist" instead of "allowlist"
```
