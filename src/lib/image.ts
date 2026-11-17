/**
 * Crops an image file to a centred square and shrinks it to `size` pixels, returning a JPEG
 * data: URL small enough (around 10 KB) to store with the profile.
 */
export async function squarePhoto(file: File, size = 160): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPEG, PNG or WebP)");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image couldn't be read. Try a JPEG or PNG."));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    // A white backing, so transparent PNGs don't turn black as JPEGs.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
