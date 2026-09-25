// Deterministic fixture for Mixture of Agents orchestration tests.
// Behavior is driven purely by the requested --model, not stdin content,
// so a single test can wire up multiple distinct reference/aggregator/
// fallback outcomes within one runPreset() call by naming models
// "<something>-fail" vs anything else.
let payload = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (payload += chunk));
process.stdin.on("end", () => {
  JSON.parse(payload); // validate the protocol still sends well-formed JSON
  const modelIndex = process.argv.indexOf("--model");
  const model = modelIndex !== -1 ? process.argv[modelIndex + 1] : "";
  if (model.endsWith("-fail")) {
    process.stdout.write(
      JSON.stringify({ type: "error", message: `${model} simulated failure` }) +
        "\n",
    );
    process.exitCode = 2;
    return;
  }
  process.stdout.write(
    JSON.stringify({ type: "completed", message: `answer from ${model}` }) +
      "\n",
  );
});
