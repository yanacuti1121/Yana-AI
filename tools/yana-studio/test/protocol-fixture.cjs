let payload = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (payload += chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(payload);
  if (input.task === "invalid") process.stdout.write("not-json\n");
  else if (input.task === "large")
    process.stdout.write("x".repeat(1024 * 1024 + 1));
  else if (input.task === "unfinished")
    process.stdout.write('{"type":"text_delta","text":"partial"}\n');
  else if (input.task === "secret")
    process.stdout.write(
      JSON.stringify({ type: "error", message: `bad ${input.api_key}` }) + "\n",
    );
  else if (input.task === "sleep") setTimeout(() => {}, 30000);
  else {
    const body = Buffer.from(
      JSON.stringify({ type: "text_delta", text: "Xin chào 🐰" }) +
        "\n" +
        JSON.stringify({ type: "completed", message: "Xin chào 🐰" }),
    );
    const boundary = body.indexOf(Buffer.from("🐰")) + 2;
    process.stdout.write(body.subarray(0, boundary));
    setTimeout(() => process.stdout.write(body.subarray(boundary)), 10);
  }
});
