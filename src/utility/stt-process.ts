// STT utility process (skeleton). Real streaming recognition with sherpa-onnx
// and Silero VAD lands in task group 5. For now it only confirms the process
// boots and relays a ready signal to the parent.

process.parentPort?.on("message", (e) => {
  const msg = e.data as { type?: string };
  if (msg?.type === "ping") process.parentPort?.postMessage({ type: "pong" });
});

process.parentPort?.postMessage({ type: "ready" });
