---
name: ktlint-auto-format
description: ktlint anti-bikeshedding Kotlin linter. Zero-config formatting, custom rule sets, auto-fix, Git pre-commit integration, and Gradle plugin setup. Sources: pinterest/ktlint (MIT).
origin: yana-ai — synthesized from pinterest/ktlint (MIT)
license: Apache-2.0
version: 1.0.0
compatibility: yana-ai >= 1.3.49
---

# /ktlint-auto-format

## When to Use

- Enforce Kotlin style without config debates (opinionated, zero-config baseline)
- Auto-fix formatting violations in CI before code review
- Custom rule sets: add project-specific Kotlin patterns on top of standard rules
- Pre-commit hook: block commits with formatting violations

## Do NOT use for

- JavaScript/TypeScript linting (use [[eslint-rule-engine]])
- Deep semantic analysis of Kotlin types (use detekt for complexity/smell checks)

---

## Gradle setup (build.gradle.kts)

```kotlin
plugins {
    id("org.jlleitschuh.gradle.ktlint") version "12.1.0"
}

ktlint {
    version.set("1.2.1")
    android.set(false)
    outputToConsole.set(true)
    ignoreFailures.set(false)   // fail CI on violations
    reporters {
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.CHECKSTYLE)
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.SARIF)
    }
    filter {
        exclude("**/generated/**")
        include("**/kotlin/**")
    }
}
```

---

## CLI usage

```bash
# Install (standalone)
curl -sSLO https://github.com/pinterest/ktlint/releases/latest/download/ktlint
chmod a+x ktlint

# Check (no modification)
./ktlint 'src/**/*.kt'

# Auto-fix
./ktlint --format 'src/**/*.kt'

# Check with specific rules only
./ktlint --ruleset my-custom-rules.jar 'src/**/*.kt'
```

---

## Custom rule (RuleProvider)

```kotlin
import com.pinterest.ktlint.rule.engine.core.api.Rule
import com.pinterest.ktlint.rule.engine.core.api.RuleId
import com.pinterest.ktlint.rule.engine.core.api.RuleProvider
import org.jetbrains.kotlin.com.intellij.lang.ASTNode

// Enforce: no companion object named "Instance"
class NoInstanceCompanionRule : Rule(
    ruleId    = RuleId("custom:no-instance-companion"),
    about     = About(
        maintainer    = "yana-ai",
        repositoryUrl = "https://github.com/your/repo",
    ),
) {
    override fun beforeVisitChildNodes(
        node:       ASTNode,
        autoCorrect: Boolean,
        emit:       (offset: Int, errorMessage: String, canBeAutoCorrected: Boolean) -> Unit,
    ) {
        if (node.elementType.toString() == "OBJECT_DECLARATION") {
            val name = node.findChildByType(
                org.jetbrains.kotlin.lexer.KtTokens.IDENTIFIER
            )?.text
            if (name == "Instance") {
                emit(node.startOffset, "Companion object must not be named 'Instance'", false)
            }
        }
    }
}

// RuleProvider (loaded via ServiceLoader)
class CustomRuleSetProvider : RuleSetProviderV3(
    id = RuleSetId("custom")
) {
    override fun getRuleProviders(): Set<RuleProvider> = setOf(
        RuleProvider { NoInstanceCompanionRule() }
    )
}
```

---

## Pre-commit hook

```bash
#!/bin/sh
# .git/hooks/pre-commit
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep '\.kt$')
if [ -n "$STAGED" ]; then
  echo "[ktlint] Checking staged Kotlin files..."
  echo "$STAGED" | xargs ./ktlint
  if [ $? -ne 0 ]; then
    echo "[ktlint] Formatting violations found. Run: ./ktlint --format"
    exit 1
  fi
fi
```

---

## Anti-Fake-Pass Checklist

```
❌ ignoreFailures: true in CI config → violations logged but build passes, accumulate silently
❌ ktlint --format on generated code → corrupts generated files; always exclude generated/
❌ Custom rule without RuleProvider ServiceLoader registration → rule silently not loaded
❌ Mixing ktlint and detekt configs → conflicting indent settings cause formatting loops
❌ Rule emit() with canBeAutoCorrected: true but no fix logic → auto-correct does nothing
❌ ktlint version mismatch between CLI and Gradle plugin → different rule sets, CI vs local divergence
```
