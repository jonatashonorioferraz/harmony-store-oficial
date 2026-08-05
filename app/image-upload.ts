export const PRODUCT_IMAGE_MAX_BYTES = 220_000;
export const VISUAL_REFERENCE_MAX_BYTES = 780_000;

type OptimizeOptions = { maxBytes: number; maxDimension?: number };

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível otimizar a imagem")), type, quality));
}

/** Reduces uploads before the request reaches the hosting platform request-size limit. */
export async function optimizeImageUpload(file: File, options: OptimizeOptions): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP");
  const source = await createImageBitmap(file);
  const maxDimension = options.maxDimension ?? 1400;
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Seu navegador não conseguiu preparar a imagem");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();
  let quality = 0.88;
  let blob = await canvasBlob(canvas, "image/webp", quality);
  while (blob.size > options.maxBytes && quality > 0.42) {
    quality -= 0.08;
    blob = await canvasBlob(canvas, "image/webp", quality);
  }
  if (blob.size > options.maxBytes) throw new Error("Esta foto é complexa demais para o limite do site. Recorte-a e tente novamente.");
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp", lastModified: file.lastModified });
}

/** Adds exact declared measurements without asking an image model to spell or calculate them. */
export async function addMeasurementOverlay(imageUrl: string, size: string, weight?: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error("Não foi possível diagramar as medidas");
  const source = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível diagramar as medidas");
  context.drawImage(source, 0, 0);
  source.close();
  const margin = Math.round(canvas.width * 0.055);
  const boxHeight = Math.round(canvas.height * 0.18);
  context.fillStyle = "rgba(255,255,255,.94)";
  context.strokeStyle = "#174b43";
  context.lineWidth = Math.max(3, Math.round(canvas.width * 0.004));
  context.beginPath();
  context.roundRect(margin, canvas.height - boxHeight - margin, canvas.width - margin * 2, boxHeight, 24);
  context.fill();
  context.stroke();
  context.fillStyle = "#174b43";
  context.font = `600 ${Math.round(canvas.width * 0.045)}px Arial, sans-serif`;
  context.fillText("Tamanho aproximado", margin * 1.55, canvas.height - boxHeight * 0.77);
  context.font = `700 ${Math.round(canvas.width * 0.065)}px Arial, sans-serif`;
  context.fillText(size, margin * 1.55, canvas.height - boxHeight * 0.32);
  if (weight?.trim()) {
    context.textAlign = "right";
    context.font = `500 ${Math.round(canvas.width * 0.034)}px Arial, sans-serif`;
    context.fillText(weight, canvas.width - margin * 1.55, canvas.height - boxHeight * 0.32);
  }
  return canvas.toDataURL("image/png");
}
