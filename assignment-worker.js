importScripts("engine.js");

self.onmessage = ({ data: input }) => {
  try {
    const result = buildPlan(input, { onProgress: (progress) => self.postMessage({ type: "progress", progress }) });
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "result", result: { status: "error", error: error.message || "배정 계산 오류", audit: [{ type: "error", title: "계산 오류", detail: "입력과 탐색 제한을 확인하세요." }] } });
  }
};
