import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/hooks/useTelemetry";

interface FarmRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const FarmRegistrationModal = ({ isOpen, onClose, userId }: FarmRegistrationModalProps) => {
  const [farmName, setFarmName] = useState("");
  const [loading, setLoading] = useState(false);
  const [farmLocation, setFarmLocation] = useState("");
  const [farmSize, setFarmSize] = useState("");
  const { toast } = useToast();

  const handleSave = async () => {
    if (!farmName.trim()) {
      toast({
        title: "Farm Name Required",
        description: "Please enter a name for your farm.",
        variant: "destructive",
      });
      return;
    }

    if (!farmLocation.trim()) {
      toast({
        title: "Farm Location Required",
        description: "Please enter the location of your farm.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from("farms")
        .insert({
          user_id: userId,
          name: farmName.trim(),
          location: farmLocation.trim(),
          size_hectares: farmSize ? parseFloat(farmSize) : null,
        });

      if (error) throw error;

      trackEvent("feature_used", { feature: "farm_registered" }, userId);
      toast({
        title: "Farm Registered Successfully!",
        description: "Your farm has been registered and you can now access farm management features.",
      });

      onClose();
    } catch (error: any) {
      console.error("Error registering farm:", error);
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to register farm. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-green-700">
            Register Your Farm
          </DialogTitle>
          <DialogDescription>
            Please provide your farm details to register your farm in the system.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4">
          <div>
            <Label htmlFor="farmName">Farm Name</Label>
            <Input
              id="farmName"
              value={farmName}
              onChange={(e) => setFarmName(e.target.value)}
              placeholder="Enter your farm name"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="farmLocation">Farm Location</Label>
            <Input
              id="farmLocation"
              value={farmLocation}
              onChange={(e) => setFarmLocation(e.target.value)}
              placeholder="e.g., Harare, Mashonaland East"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="farmSize">Farm Size (hectares) - Optional</Label>
            <Input
              id="farmSize"
              value={farmSize}
              onChange={(e) => setFarmSize(e.target.value)}
              placeholder="e.g., 10.5"
              type="number"
              step="0.1"
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? "Registering..." : "Register Farm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FarmRegistrationModal;