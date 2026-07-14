import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Edit, Save, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Farm {
  id: string;
  name: string;
  location?: string;
  size_hectares?: number;
  user_id: string;
}

interface FarmDetailsEditorProps {
  farm: Farm;
  onUpdate: (updatedFarm: Farm) => void;
}

const FarmDetailsEditor: React.FC<FarmDetailsEditorProps> = ({ farm, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: farm.name || '',
    location: farm.location || '',
    size_hectares: farm.size_hectares || 0
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('farms')
        .update({
          name: formData.name,
          location: formData.location,
          size_hectares: formData.size_hectares
        })
        .eq('id', farm.id)
        .select()
        .single();

      if (error) throw error;

      onUpdate(data);
      setIsOpen(false);
      toast({
        title: "Success",
        description: "Farm details updated successfully"
      });
    } catch (error) {
      console.error('Error updating farm:', error);
      toast({
        title: "Error",
        description: "Failed to update farm details",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      name: farm.name || '',
      location: farm.location || '',
      size_hectares: farm.size_hectares || 0
    });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Edit className="h-4 w-4" />
          Edit Farm Details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Farm Details</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Farm Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter farm name"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="e.g., Mashonaland West"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="size">Farm Size (hectares)</Label>
            <Input
              id="size"
              type="number"
              min="0"
              step="0.1"
              value={formData.size_hectares}
              onChange={(e) => setFormData({ ...formData, size_hectares: parseFloat(e.target.value) || 0 })}
              placeholder="Enter farm size"
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FarmDetailsEditor;