/**
 * Downloads a file using a blob URL and specified filename.
 *
 * @param blobUrl - The blob URL to download from
 * @param filename - The filename to save as
 */
export function downloadFile(blobUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up blob URL after download starts
  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
}
