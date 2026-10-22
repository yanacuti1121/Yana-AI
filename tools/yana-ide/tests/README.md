# yana-ide tests

These run without launching the app. Each script takes the path to `extensions/yana-agent`:

    node tests/settings-bridge.test.cjs   extensions/yana-agent
    node tests/governance-bridge.test.cjs extensions/yana-agent   # needs yana-rt on this machine

`e2e-local-model.cjs` talks to a real local model, so run it by hand and never in CI.
Start `ollama serve`, then:

    WITH_MARKER=1 node tests/e2e-local-model.cjs extensions/yana-agent llama3.2:latest

Stop Ollama afterwards, it heats the machine.
