// Yana AI — Chat: OCR attachment (Surya OCR via /api/ocr) → dropped into draft.
import React from 'react';

export function useOcr(setDraft, setMsgs) {
  const [ocrBusy, setOcrBusy] = React.useState(false);

  async function handleOcr(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setOcrBusy(true);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const resp = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileBase64: b64, filename: file.name }),
      });
      const data = await resp.json();
      if (data.ok && data.text) {
        setDraft((prev) => (prev ? prev + "\n\n" : "") + data.text);
      } else {
        setMsgs((m) => [...m, { who: "yana", text: "OCR failed: " + (data.error || "Unknown error") }]);
      }
    } catch (err) {
      setMsgs((m) => [...m, { who: "yana", text: "OCR error: " + String(err) }]);
    } finally {
      setOcrBusy(false);
    }
  }

  return { ocrBusy, handleOcr };
}
