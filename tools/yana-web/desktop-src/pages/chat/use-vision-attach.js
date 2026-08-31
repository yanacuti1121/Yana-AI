// Yana AI — Chat: vision-model image attachment (compress + base64 encode).
import React from 'react';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function prepareVisionImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('selected file is not an image');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('image is larger than the 15 MB attachment limit');
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 1920;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = MAX / Math.max(width, height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('could not prepare image for attachment')); return; }
        const reader = new FileReader();
        reader.onload = ev => {
          const [header, data] = ev.target.result.split(",");
          resolve({ data, mimeType: header.replace("data:", "").replace(";base64", ""), name: file.name });
        };
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('could not decode selected image')); };
    img.src = objectUrl;
  });
}

export function useVisionAttach() {
  const [visionImage, setVisionImage] = React.useState(null); // {data, mimeType, name}

  async function handleVisionAttach(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setVisionImage(await prepareVisionImage(file));
  }

  // Second entry point into the same compress+encode path, for clipboard
  // paste (composer-bar.jsx's onPaste) instead of the file-picker input.
  async function handleVisionPaste(file) {
    if (!file) return;
    setVisionImage(await prepareVisionImage(file));
  }

  async function attachVisionFile(file, shouldApply = () => true) {
    const prepared = await prepareVisionImage(file);
    if (!shouldApply()) return false;
    setVisionImage(prepared);
    return true;
  }

  return { visionImage, setVisionImage, handleVisionAttach, handleVisionPaste, attachVisionFile };
}
