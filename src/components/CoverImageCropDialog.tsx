import { useCallback, useState } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type Ratio = { label: string; value: number | undefined };

const RATIOS: Ratio[] = [
  { label: "16:9", value: 16 / 9 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "3:2", value: 3 / 2 },
  { label: "Free", value: undefined },
];

interface Props {
  open: boolean;
  imageSrc: string | null;
  onCancel: () => void;
  onConfirm: (blob: Blob, previewUrl: string) => void | Promise<void>;
}

const getCroppedBlob = (imageSrc: string, area: Area): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = area.width;
      canvas.height = area.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unsupported"));
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Crop failed"))), "image/jpeg", 0.92);
    };
    img.onerror = () => reject(new Error("Could not load image (CORS?)"));
    img.src = imageSrc;
  });

export const CoverImageCropDialog = ({ open, imageSrc, onCancel, onConfirm }: Props) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [ratio, setRatio] = useState<number | undefined>(16 / 9);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_a: Area, pixels: Area) => setAreaPx(pixels), []);

  const reset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRatio(16 / 9);
    setAreaPx(null);
    setSaving(false);
  };

  const handleConfirm = async () => {
    if (!imageSrc || !areaPx) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageSrc, areaPx);
      const previewUrl = URL.createObjectURL(blob);
      await onConfirm(blob, previewUrl);
      reset();
    } catch (e) {
      setSaving(false);
      throw e;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adjust cover image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative w-full h-[360px] bg-muted rounded-lg overflow-hidden">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={ratio}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                restrictPosition={false}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Aspect ratio</Label>
            <div className="flex flex-wrap gap-2">
              {RATIOS.map((r) => (
                <Button
                  key={r.label}
                  type="button"
                  size="sm"
                  variant={ratio === r.value ? "default" : "outline"}
                  onClick={() => setRatio(r.value)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Zoom — {zoom.toFixed(2)}×
            </Label>
            <Slider
              value={[zoom]}
              min={1}
              max={4}
              step={0.01}
              onValueChange={(v) => setZoom(v[0])}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onCancel(); }} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving || !areaPx} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving…" : "Apply & upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CoverImageCropDialog;
