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

export default function MultipleImageUpload({ 
  value, 
  onChange, 
  label = 'Product Images', 
  required = false,
  maxImages = 10 
}: MultipleImageUploadProps) {
  // Convert value to array format
  const getImageArray = (val: string | string[] | undefined): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    // If it's a single string, convert to array
    if (typeof val === 'string' && val.trim() !== '') {
      return [val];
    }
    return [];
  };

  // Store images with unique IDs to track them properly
  interface ImageWithId {
    id: string;
    data: string;
    fileName?: string;
    fileSize?: number;
  }

  const [previews, setPreviews] = useState<ImageWithId[]>(() => {
    const images = getImageArray(value);
    return images.map((img, idx) => {
      // If it's already a base64 data URL, return as-is
      const imageData = img.startsWith('data:image') ? img : (getImageUrl(img) || img);
      return {
        id: `img-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        data: imageData,
      };
    });
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileSizes, setFileSizes] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update previews when value prop changes (e.g., when editing a product)
  useEffect(() => {
    const images = getImageArray(value);
    const newPreviews: ImageWithId[] = images.map((img, idx) => {
      const imageData = img.startsWith('data:image') ? img : (getImageUrl(img) || img);
      return {
        id: `img-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        data: imageData,
      };
    });
    setPreviews(newPreviews);
  }, [value]);

  const processImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };

      img.onload = () => {
        // Create canvas with target dimensions
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        const targetSize = 1080;
        canvas.width = targetSize;
        canvas.height = targetSize;

        // Fill with white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetSize, targetSize);

        // Calculate scaling to fit within 1080x1080 maintaining aspect ratio
        const scale = Math.min(targetSize / img.width, targetSize / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // Center the image
        const x = (targetSize - scaledWidth) / 2;
        const y = (targetSize - scaledHeight) / 2;

        // Draw image centered with padding
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

        // Start with quality 0.92 and compress if needed
        let quality = 0.92;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let sizeInKB = (dataUrl.length * 3) / 4 / 1024;

        // Iteratively reduce quality if file is too large
        while (sizeInKB > 500 && quality > 0.5) {
          quality -= 0.05;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          sizeInKB = (dataUrl.length * 3) / 4 / 1024;
        }

        resolve(dataUrl);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Check if adding these files would exceed maxImages
    if (previews.length + files.length > maxImages) {
      alert(`You can only upload up to ${maxImages} images. Please remove some images first.`);
      return;
    }

    // Validate file types
    const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      alert('Please select only image files');
      return;
    }

    // Check for duplicate files by name and size
    const fileSignatures = new Set<string>();
    const uniqueFiles: File[] = [];
    files.forEach(file => {
      const signature = `${file.name}_${file.size}_${file.lastModified}`;
      if (!fileSignatures.has(signature)) {
        fileSignatures.add(signature);
        uniqueFiles.push(file);
      } else {
        console.warn(`⚠️ Skipping duplicate file: ${file.name} (same name, size, and modification time)`);
      }
    });

    if (uniqueFiles.length < files.length) {
      alert(`Warning: ${files.length - uniqueFiles.length} duplicate file(s) were skipped. Only unique files will be uploaded.`);
    }

    setIsProcessing(true);
    try {
      const processedImages: ImageWithId[] = [];
      const newFileSizes: Record<string, number> = { ...fileSizes };

      for (let i = 0; i < uniqueFiles.length; i++) {
        const file = uniqueFiles[i];
        // Create unique ID for this image
        const imageId = `img-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}-${file.name}`;
        
        const processedDataUrl = await processImage(file);
        
        processedImages.push({
          id: imageId,
          data: processedDataUrl,
          fileName: file.name,
        });
        
        // Calculate file size
        const sizeInKB = Math.round((processedDataUrl.length * 3) / 4 / 1024);
        newFileSizes[imageId] = sizeInKB;
      }
      
      const newPreviews = [...previews, ...processedImages];
      setPreviews(newPreviews);
      setFileSizes(newFileSizes);
      // Extract just the data URLs for onChange callback
      onChange(newPreviews.map(img => img.data));
    } catch (error) {
      console.error('Error processing images:', error);
      alert('Failed to process some images. Please try again.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = (imageId: string) => {
    const newPreviews = previews.filter(img => img.id !== imageId);
    const newFileSizes = { ...fileSizes };
    delete newFileSizes[imageId];
    
    setPreviews(newPreviews);
    setFileSizes(newFileSizes);
    // Extract just the data URLs for onChange callback
    onChange(newPreviews.map(img => img.data));
  };

  const handleRemoveAll = () => {
    setPreviews([]);
    setFileSizes({});
    onChange([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}{required && '*'}
        </label>
        {previews.length > 0 && (
          <button
            type="button"
            onClick={handleRemoveAll}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Remove All
          </button>
        )}
      </div>
      
      <div className="space-y-4">
        {/* Images Grid */}
        {previews.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {previews.map((preview, index) => (
              <div key={preview.id} className="relative group">
                <div className="relative aspect-square">
                  <img 
                    src={preview.data} 
                    alt={`Preview ${index + 1}${preview.fileName ? ` - ${preview.fileName}` : ''}`} 
                    className="w-full h-full object-contain border-2 border-gray-300 rounded-lg bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemove(preview.id)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-lg opacity-0 group-hover:opacity-100"
                    title="Remove image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {fileSizes[preview.id] && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs text-center py-1 rounded-b-lg">
                      {fileSizes[preview.id]} KB {fileSizes[preview.id] <= 500 ? '✓' : '⚠️'}
                    </div>
                  )}
                </div>
                <div className="mt-1 text-xs text-center text-gray-500">
                  Image {index + 1}
                  {preview.fileName && (
                    <div className="text-xs text-gray-400 truncate" title={preview.fileName}>
                      {preview.fileName}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Area */}
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
              className={`
                w-full inline-flex justify-center items-center px-4 py-3 border-2 border-dashed border-gray-300 
                rounded-lg text-sm font-medium text-gray-700 bg-gray-50 
                hover:bg-gray-100 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 
                focus:ring-blue-500 cursor-pointer transition-colors
                ${isProcessing || previews.length >= maxImages ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {previews.length === 0 ? 'Upload Images' : `Add More Images (${previews.length}/${maxImages})`}
                </>
              )}
            </label>
          </div>
        )}

        {/* Info Text */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>• You can upload up to {maxImages} images per product</p>
          <p>• Images will be resized to 1080x1080 (JPEG)</p>
          <p>• Aspect ratio maintained with padding</p>
          <p>• Automatically compressed to max 500 KB per image</p>
        </div>
      </div>
    </div>
  );
}

