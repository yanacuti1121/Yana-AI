// Yana AI — Chat: vision-model image attachment (compress + base64 encode).
import React from 'react';

function compressImageForVision(file) {
  return new Promise(resolve => {
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
        const reader = new FileReader();
        reader.onload = ev => {
          const [header, data] = ev.target.result.split(",");
          resolve({ data, mimeType: header.replace("data:", "").replace(";base64", ""), name: file.name });
        };
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.85);
    };
    img.src = objectUrl;
  });
}

export function useVisionAttach() {
  const [visionImage, setVisionImage] = React.useState(null); // {data, mimeType, name}

  async function handleVisionAttach(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setVisionImage(await compressImageForVision(file));
  }

  return { visionImage, setVisionImage, handleVisionAttach };
}
