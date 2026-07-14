import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, Loader2 } from "lucide-react";

interface ImageUploadButtonProps {
  onImageSelected: (base64DataUrl: string) => void;
  disabled?: boolean;
}

const ImageUploadButton: React.FC<ImageUploadButtonProps> = ({ onImageSelected, disabled }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      return; // Max 5MB
    }

    setProcessing(true);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      onImageSelected(result);
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
        disabled={disabled}
      />
      {preview ? (
        <div className="relative">
          <img src={preview} alt="Crop" className="h-10 w-10 rounded-md object-cover border border-border" />
          <button
            onClick={clearImage}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="flex-shrink-0"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || processing}
          title="Upload crop image for disease detection"
        >
          {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
};

export default ImageUploadButton;
