'use client';

import { useState, useRef, useEffect } from 'react';
import { getImageUrl } from '@/lib/imageHelper';

interface MultipleImageUploadProps {
  value?: string | string[]; // Can be single string (backward compat) or array
  onChange: (images: string[]) => void;
  label?: string;
  required?: boolean;
  maxImages?: number;
}

/** Internal representation of a single image slot. */
interface ImageWithId {
  id: string;
  /** Canonical value sent to backend: base64 data URL for new uploads, /uploads/... path for existing. */
  data: string;
  /** Display URL used only for <img src>: same as data for base64, full http://... for server paths. */
  displayUrl: string;
  fileName?: string;
  /** Size in KB (only populated for freshly-uploaded images). */
  sizeKB?: number;
}

export default function MultipleImageUpload({
  value,
  onChange,
  label = 'Product Images',
  required = false,
  maxImages = 10,
}: MultipleImageUploadProps) {
  // ─── helpers ────────────────────────────────────────────────────────────────

  const getImageArray = (val: string | string[] | undefined): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim() !== '') return [val];
    return [];
  };

  /** Build an ImageWithId from a raw string value (path or base64). */
  const buildPreview = (img: string, idx: number): ImageWithId => {
    if (img.startsWith('data:image')) {
      return {
        id: `img-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        data: img,
        displayUrl: img,
      };
    }
    // Existing server image — keep relative path in `data`, full URL in `displayUrl`
    const displayUrl = getImageUrl(img) || img;
    return {
      id: `img-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
      data: img,
      displayUrl,
    };
  };

  // ─── state ──────────────────────────────────────────────────────────────────

  const [previews, setPreviews] = useState<ImageWithId[]>(() =>
    getImageArray(value).map(buildPreview)
  );
  const [isProcessing, setIsProcessing] = useState(false);
  /** Tracks how many images are done when processing a batch. */
  const [processingProgress, setProcessingProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── drag-to-reorder state ─────────────────────────────────────────────────
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync previews when the value prop changes (e.g. switching to edit a different product)
  useEffect(() => {
    const imgs = getImageArray(value);
    setPreviews(imgs.map(buildPreview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ─── image processing ────────────────────────────────────────────────────────

  /** Resize & compress a single File to a 1080×1080 JPEG ≤500 KB. Returns a base64 data URL. */
  const processImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => { img.src = e.target?.result as string; };
      reader.onerror = () => reject(new Error('Failed to read file'));

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Could not get canvas context')); return; }

        const targetSize = 1080;
        canvas.width = targetSize;
        canvas.height = targetSize;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetSize, targetSize);

        const scale = Math.min(targetSize / img.width, targetSize / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const x = (targetSize - scaledWidth) / 2;
        const y = (targetSize - scaledHeight) / 2;
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

        let quality = 0.92;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let sizeKB = (dataUrl.length * 3) / 4 / 1024;
        while (sizeKB > 500 && quality > 0.5) {
          quality -= 0.05;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          sizeKB = (dataUrl.length * 3) / 4 / 1024;
        }
        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      reader.readAsDataURL(file);
    });

  // ─── handlers ────────────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    if (previews.length + rawFiles.length > maxImages) {
      alert(`You can only upload up to ${maxImages} images. Please remove some first.`);
      return;
    }

    const invalidFiles = rawFiles.filter((f) => !f.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      alert('Please select only image files.');
      return;
    }

    // ── Sort files by name so multi-selection order is deterministic ──────────
    // Browsers return FileList in an undefined order depending on OS / file picker.
    // Sorting by name gives a consistent, predictable numbered sequence.
    const sortedFiles = [...rawFiles].sort((a, b) => a.name.localeCompare(b.name));

    // ── Deduplicate by name + size + lastModified ─────────────────────────────
    const seen = new Set<string>();
    const uniqueFiles: File[] = [];
    for (const file of sortedFiles) {
      const sig = `${file.name}_${file.size}_${file.lastModified}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        uniqueFiles.push(file);
      } else {
        console.warn(`⚠️ Skipping duplicate: ${file.name}`);
      }
    }
    if (uniqueFiles.length < rawFiles.length) {
      alert(`${rawFiles.length - uniqueFiles.length} duplicate file(s) were skipped.`);
    }

    // ── Process sequentially in order so numbering matches selection ──────────
    setIsProcessing(true);
    setProcessingProgress({ done: 0, total: uniqueFiles.length });
    try {
      const processed: ImageWithId[] = [];
      for (let i = 0; i < uniqueFiles.length; i++) {
        const file = uniqueFiles[i];
        const dataUrl = await processImage(file);
        const sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
        processed.push({
          id: `img-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
          data: dataUrl,
          displayUrl: dataUrl,
          fileName: file.name,
          sizeKB,
        });
        setProcessingProgress({ done: i + 1, total: uniqueFiles.length });
      }

      const newPreviews = [...previews, ...processed];
      setPreviews(newPreviews);
      onChange(newPreviews.map((img) => img.data));
    } catch (err) {
      console.error('Error processing images:', err);
      alert('Failed to process some images. Please try again.');
    } finally {
      setIsProcessing(false);
      setProcessingProgress({ done: 0, total: 0 });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** Remove one image by id; remaining images auto-renumber via array index. */
  const handleRemove = (imageId: string) => {
    const newPreviews = previews.filter((img) => img.id !== imageId);
    setPreviews(newPreviews);
    onChange(newPreviews.map((img) => img.data));
  };

  const handleRemoveAll = () => {
    setPreviews([]);
    onChange([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Swap image at `index` with the one before it. */
  const handleMoveLeft = (index: number) => {
    if (index <= 0) return;
    const next = [...previews];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setPreviews(next);
    onChange(next.map((img) => img.data));
  };

  /** Swap image at `index` with the one after it. */
  const handleMoveRight = (index: number) => {
    if (index >= previews.length - 1) return;
    const next = [...previews];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setPreviews(next);
    onChange(next.map((img) => img.data));
  };

  /** Move image at `index` to position 0 (make it the main product photo). */
  const handleSetAsMain = (index: number) => {
    if (index <= 0) return;
    const next = [...previews];
    const [moved] = next.splice(index, 1);
    next.unshift(moved);
    setPreviews(next);
    onChange(next.map((img) => img.data));
  };

  // ─── drag-to-reorder handlers ──────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    // Use a transparent image so the browser's default ghost doesn't look awkward
    // — the card itself already provides visual context
    e.dataTransfer.setData('text/plain', String(index));
    // Add slight delay so the dragged item gets opacity via CSS
    requestAnimationFrame(() => {
      const target = e.target as HTMLElement;
      target.style.opacity = '0.4';
    });
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault(); // required to allow drop
    e.dataTransfer.dropEffect = 'move';
    if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) return;

    // Move the dragged item to the drop position
    const next = [...previews];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, moved);
    setPreviews(next);
    onChange(next.map((img) => img.data));
    dragIndexRef.current = null;
  };

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="flex items-center gap-3">
          {previews.length > 0 && (
            <span className="text-xs text-gray-400">
              {previews.length}/{maxImages} image{previews.length !== 1 ? 's' : ''}
            </span>
          )}
          {previews.length > 1 && (
            <button
              type="button"
              onClick={handleRemoveAll}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              Remove All
            </button>
          )}
        </div>
      </div>

      {/* Main photo notice */}
      {previews.length > 0 && (
        <p className="text-xs text-indigo-600 font-medium flex items-center gap-1">
          <span>👑</span>
          <span>Image #1 is the main product photo shown in listings</span>
        </p>
      )}

      <div className="space-y-4">
        {/* Images Grid */}
        {previews.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {previews.map((preview, index) => {
              const isMain = index === 0;
              const isDragTarget = dragOverIndex === index;
              return (
                <div
                  key={preview.id}
                  className={`relative group transition-transform duration-150 ${isDragTarget ? 'scale-105' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  style={{ cursor: 'grab' }}
                >
                  <div className={`relative aspect-square rounded-xl overflow-hidden shadow-sm border-2 transition-all duration-200 ${isDragTarget ? 'border-indigo-400 border-dashed shadow-lg shadow-indigo-100 bg-indigo-50' : isMain ? 'border-indigo-500 shadow-indigo-200 shadow-md' : 'border-gray-200 group-hover:border-gray-400'}`}>
                    {/* Image */}
                    <img
                      src={preview.displayUrl}
                      alt={`Product image ${index + 1}${preview.fileName ? ` - ${preview.fileName}` : ''}`}
                      className="w-full h-full object-contain bg-white"
                    />

                    {/* Number badge — top-left */}
                    <div className={`absolute top-1.5 left-1.5 min-w-[22px] h-[22px] rounded-full flex items-center justify-center text-xs font-bold shadow-md px-1.5 ${isMain ? 'bg-indigo-600 text-white' : 'bg-gray-800 bg-opacity-75 text-white'}`}>
                      {index + 1}
                    </div>

                    {/* Drag handle hint — top center, shows on hover */}
                    {previews.length > 1 && (
                      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-80 transition-opacity pointer-events-none">
                        <div className="bg-black bg-opacity-50 text-white rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                          </svg>
                          Drag
                        </div>
                      </div>
                    )}

                    {/* "Main" crown badge — only for first image */}
                    {isMain && (
                      <div className="absolute top-1.5 right-7 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-md leading-none">
                        MAIN
                      </div>
                    )}

                    {/* Remove button — top-right, visible on hover */}
                    <button
                      type="button"
                      onClick={() => handleRemove(preview.id)}
                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-all duration-150 shadow-lg opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                      title={`Remove image ${index + 1}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {/* Size badge — bottom bar (only for newly uploaded images) */}
                    {preview.sizeKB !== undefined && (
                      <div className={`absolute bottom-0 inset-x-0 text-white text-[10px] text-center py-0.5 font-medium ${preview.sizeKB <= 500 ? 'bg-green-600 bg-opacity-80' : 'bg-orange-500 bg-opacity-80'}`}>
                        {preview.sizeKB} KB {preview.sizeKB <= 500 ? '✓' : '⚠ large'}
                      </div>
                    )}
                  </div>

                  {/* Reorder & label row below card */}
                  <div className="mt-1.5">
                    {/* Label */}
                    <div className="text-center">
                      <span className={`text-xs font-semibold ${isMain ? 'text-indigo-600' : 'text-gray-500'}`}>
                        {isMain ? '👑 Main Photo' : `Photo ${index + 1}`}
                      </span>
                      {preview.fileName && (
                        <p className="text-[10px] text-gray-400 truncate leading-tight mt-0.5" title={preview.fileName}>
                          {preview.fileName}
                        </p>
                      )}
                    </div>

                    {/* Reorder controls — show when there are 2+ images */}
                    {previews.length > 1 && (
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {/* Move left */}
                        <button
                          type="button"
                          onClick={() => handleMoveLeft(index)}
                          disabled={index === 0}
                          className={`p-0.5 rounded transition-colors ${index === 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
                          title="Move left"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>

                        {/* Set as main (only for non-first images) */}
                        {!isMain && (
                          <button
                            type="button"
                            onClick={() => handleSetAsMain(index)}
                            className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors leading-none"
                            title="Make this the main product photo"
                          >
                            ★ Main
                          </button>
                        )}

                        {/* Move right */}
                        <button
                          type="button"
                          onClick={() => handleMoveRight(index)}
                          disabled={index === previews.length - 1}
                          className={`p-0.5 rounded transition-colors ${index === previews.length - 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
                          title="Move right"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Processing progress bar */}
        {isProcessing && processingProgress.total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Processing images in order…</span>
              <span>{processingProgress.done}/{processingProgress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(processingProgress.done / processingProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Upload button */}
        {previews.length < maxImages && (
          <div className="w-full">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
              id="multiple-image-upload"
              disabled={isProcessing || previews.length >= maxImages}
            />
            <label
              htmlFor="multiple-image-upload"
              className={`w-full inline-flex justify-center items-center gap-2 px-4 py-3 border-2 border-dashed rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer
                ${isProcessing || previews.length >= maxImages
                  ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                  : 'border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-500'
                }`}
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing {processingProgress.done}/{processingProgress.total}…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {previews.length === 0
                    ? 'Select Images from Gallery'
                    : `Add More Images (${previews.length}/${maxImages})`}
                </>
              )}
            </label>
          </div>
        )}

        {/* Info footer */}
        <div className="text-xs text-gray-400 space-y-0.5">
          <p>• Drag images to reorder, or use ◀ ▶ arrows / ★ Main button</p>
          <p>• Image #1 is the main product photo shown in listings</p>
          <p>• Max {maxImages} images · Resized to 1080×1080 JPEG · Max 500 KB each</p>
        </div>
      </div>
    </div>
  );
}
