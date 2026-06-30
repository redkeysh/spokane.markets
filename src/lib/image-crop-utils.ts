import type { Area } from "react-easy-crop";

/** GIFs are uploaded without client-side crop to preserve animation. */
export function shouldSkipImageCrop(file: File): boolean {
  const t = file.type.toLowerCase();
  return t === "image/gif" || t === "image/svg+xml";
}

export type ImageCropPreset = {
  aspect: number;
  cropShape: "rect" | "round";
};

/**
 * Crop UI presets for uploads: square logos vs 16:9 hero images; round mask for avatars only.
 */
export function getCropPresetForProfileAvatar(): ImageCropPreset {
  return { aspect: 1, cropShape: "round" };
}

export function getCropPresetForSquareLogo(): ImageCropPreset {
  return { aspect: 1, cropShape: "rect" };
}

export function getCropPresetForBanner(): ImageCropPreset {
  return { aspect: 16 / 9, cropShape: "rect" };
}

/** Shared uploader: `ImageUploadWithUrl` square vs banner hero. */
export function getCropPresetForUploaderAspect(
  aspectRatio: "square" | "banner"
): ImageCropPreset {
  return aspectRatio === "banner"
    ? getCropPresetForBanner()
    : getCropPresetForSquareLogo();
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () =>
      reject(new Error("Failed to load image for cropping"))
    );
    img.src = src;
  });
}

/**
 * Renders the crop rectangle from react-easy-crop into a bitmap blob (JPEG by default).
 */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  options: {
    mimeType?: string;
    quality?: number;
    fileBaseName?: string;
  } = {}
): Promise<{ blob: Blob; fileName: string }> {
  const {
    mimeType = "image/jpeg",
    quality = 0.92,
    fileBaseName = "cropped",
  } = options;

  const image = await loadImageElement(imageSrc);
  // Clamp the source rectangle: a degenerate crop (zero/negative width or
  // height, negative offsets) would make ctx.drawImage throw or render blank.
  const sx = Math.max(0, Math.round(pixelCrop.x));
  const sy = Math.max(0, Math.round(pixelCrop.y));
  const w = Math.max(1, Math.round(pixelCrop.width));
  const h = Math.max(1, Math.round(pixelCrop.height));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  ctx.drawImage(image, sx, sy, w, h, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode cropped image"));
          return;
        }
        const ext =
          mimeType === "image/png"
            ? "png"
            : mimeType === "image/webp"
              ? "webp"
              : "jpg";
        resolve({
          blob,
          fileName: `${fileBaseName}.${ext}`,
        });
      },
      mimeType,
      quality
    );
  });
}
