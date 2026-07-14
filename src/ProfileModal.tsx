import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { User, Save } from "lucide-react";
import WhatsAppConnect from "./WhatsAppConnect";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ProfileModal = ({ open, onOpenChange }: ProfileModalProps) => {
  const { profile, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || "",
    email: profile?.email || user?.email || "",
    value_chain_stage: profile?.value_chain_stage || "",
    region: profile?.region || "",
    crops_of_interest: profile?.crops_of_interest || [],
    farming_type: profile?.farming_type || "crop",
    livestock_of_interest: profile?.livestock_of_interest || [],
    preferred_language: profile?.preferred_language || "en",
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCropsChange = (value: string) => {
    const cropsArray = value.split(',').map(crop => crop.trim()).filter(crop => crop);
    setFormData(prev => ({ ...prev, crops_of_interest: cropsArray }));
  };

  const handleLivestockChange = (value: string) => {
    const arr = value.split(',').map(s => s.trim()).filter(s => s);
    setFormData(prev => ({ ...prev, livestock_of_interest: arr }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          value_chain_stage: 'farmer',
          region: formData.region,
          crops_of_interest: formData.crops_of_interest,
          farming_type: formData.farming_type as any,
          livestock_of_interest: formData.livestock_of_interest,
          preferred_language: formData.preferred_language,
        })
        .eq('id', user.id);

      if (error) throw error;

      // Cascade farming_type to all of the user's farms so the dashboard reflects the change
      const { error: farmsError } = await supabase
        .from('farms')
        .update({ farming_type: formData.farming_type as any })
        .eq('user_id', user.id);
      if (farmsError) console.error('Failed to sync farms farming_type:', farmsError);

      toast.success("Profile updated successfully!");
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Edit Profile
          </DialogTitle>
          <DialogDescription>
            Update your profile information and preferences.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => handleInputChange('full_name', e.target.value)}
              placeholder="Enter your full name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              value={formData.email}
              disabled
              className="opacity-60"
            />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="value_chain_stage">Value Chain Stage</Label>
            <Input
              id="value_chain_stage"
              value="Farmer"
              disabled
              className="opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              We're currently onboarding farmers only. Other roles will be available soon.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="region">Region</Label>
            <Select 
              value={formData.region} 
              onValueChange={(value) => handleInputChange('region', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Harare">Harare</SelectItem>
                <SelectItem value="Bulawayo">Bulawayo</SelectItem>
                <SelectItem value="Manicaland">Manicaland</SelectItem>
                <SelectItem value="Mashonaland Central">Mashonaland Central</SelectItem>
                <SelectItem value="Mashonaland East">Mashonaland East</SelectItem>
                <SelectItem value="Mashonaland West">Mashonaland West</SelectItem>
                <SelectItem value="Masvingo">Masvingo</SelectItem>
                <SelectItem value="Matabeleland North">Matabeleland North</SelectItem>
                <SelectItem value="Matabeleland South">Matabeleland South</SelectItem>
                <SelectItem value="Midlands">Midlands</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="farming_type">Farming Type</Label>
            <Select
              value={formData.farming_type}
              onValueChange={(value) => handleInputChange('farming_type', value)}
            >
              <SelectTrigger><SelectValue placeholder="Select farming type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="crop">Crop only</SelectItem>
                <SelectItem value="livestock">Livestock only</SelectItem>
                <SelectItem value="mixed">Mixed (crop + livestock)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(formData.farming_type === "crop" || formData.farming_type === "mixed") && (
            <div className="grid gap-2">
              <Label htmlFor="crops">Crops of Interest</Label>
              <Input
                id="crops"
                value={formData.crops_of_interest.join(', ')}
                onChange={(e) => handleCropsChange(e.target.value)}
                placeholder="e.g., Maize, Tobacco, Cotton (comma separated)"
              />
              <p className="text-xs text-muted-foreground">Separate multiple crops with commas</p>
            </div>
          )}

          {(formData.farming_type === "livestock" || formData.farming_type === "mixed") && (
            <div className="grid gap-2">
              <Label htmlFor="livestock">Livestock of Interest</Label>
              <Input
                id="livestock"
                value={formData.livestock_of_interest.join(', ')}
                onChange={(e) => handleLivestockChange(e.target.value)}
                placeholder="e.g., Cattle, Goats, Poultry (comma separated)"
              />
              <p className="text-xs text-muted-foreground">Separate multiple species with commas</p>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="preferred_language">Preferred Language</Label>
            <Select
              value={formData.preferred_language}
              onValueChange={(value) => handleInputChange('preferred_language', value)}
            >
              <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="sn">Shona (chiShona)</SelectItem>
                <SelectItem value="nd">Ndebele (isiNdebele)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <WhatsAppConnect />

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileModal;