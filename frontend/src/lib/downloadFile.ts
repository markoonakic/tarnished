export function downloadFile(blobUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up blob URL after download starts (10s to allow large files)
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}
