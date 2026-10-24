// opens the system image picker, crops the image to a centered square and shrinks it;
// returns a data URL, or null if the user cancelled
export async function pickCover(): Promise<string | null> {
  // must be clicked synchronously, inside the tap that triggered it
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  const file = await new Promise<File | null>((resolve) => {
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
  if (!file) return null;

  const SIZE = 256;
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext('2d')!.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,   // center square of the source
    0, 0, SIZE, SIZE,
  );
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}