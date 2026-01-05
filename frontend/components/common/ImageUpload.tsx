'use client';

import { useState, useRef, useEffect } from 'react';
import { getImageUrl } from '@/lib/imageHelper';

interface ImageUploadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
  label?: string;
  required?: boolean;
}

export default function ImageUpload({ value, onChange, label = 'Product Image', required = false }: ImageUploadProps) {
  // Convert value to display URL if it's a file path
  const getDisplayUrl = (val: string | undefined): string => {
    if (!val) return '';
    // If it's already a base64 data URL, return as-is
    if (val.startsWith('data:image')) return val;
    // If it's a file path, convert to full URL
    return getImageUrl(val) || '';
  };

  const [preview, setPreview] = useState<string>(getDisplayUrl(value));
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileSize, setFileSize] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update preview when value prop changes (e.g., when editing a product)
  useEffect(() => {
    const displayUrl = getDisplayUrl(value);
    setPreview(displayUrl);
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

        setFileSize(Math.round(sizeInKB));
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
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setIsProcessing(true);
    try {
      const processedDataUrl = await processImage(file);
      setPreview(processedDataUrl);
      onChange(processedDataUrl);
    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process image. Please try another file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemove = () => {
    setPreview('');
    setFileSize(0);
    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && '*'}
      </label>
      
      <div className="flex flex-col items-center space-y-3">
        {/* Preview Area */}
        {preview ? (
          <div className="relative">
            <img 
              src={preview} 
              alt="Preview" 
              className="w-48 h-48 object-contain border-2 border-gray-300 rounded-lg bg-white"
            />
            <button
              type="button"
              onClick={handleRemove}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors shadow-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {fileSize > 0 && (
              <div className="mt-1 text-xs text-center text-gray-500">
                Size: {fileSize} KB {fileSize <= 500 ? '✓' : '⚠️'}
              </div>
            )}
          </div>
        ) : (
          <div className="w-48 h-48 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
            <div className="text-center p-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="mt-2 text-xs text-gray-500">No image selected</p>
            </div>
          </div>
        )}

        {/* Upload Button */}
        <div className="w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            id="image-upload"
            required={required && !preview}
          />
          <label
            htmlFor="image-upload"
            className={`
              w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 
              rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white 
              hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 
              focus:ring-blue-500 cursor-pointer transition-colors
              ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isProcessing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                {preview ? 'Change Image' : 'Upload Image'}
              </>
            )}
          </label>
        </div>

        {/* Info Text */}
        <div className="text-xs text-gray-500 text-center space-y-1">
          <p>• Image will be resized to 1080x1080 (JPEG)</p>
          <p>• Aspect ratio maintained with padding</p>
          <p>• Automatically compressed to max 500 KB</p>
        </div>
      </div>
    </div>
  );
}

