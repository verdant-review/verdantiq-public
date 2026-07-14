import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface CropCycle {
  id: string;
  crop_type: string;
  status: string;
}

interface LogActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycles: CropCycle[];
  onActivityLogged: () => void;
}

const activityTypes = [
  { value: "planting", label: "Planting" },
  { value: "fertilizing", label: "Fertilizing" },
  { value: "irrigation", label: "Irrigation" },
  { value: "weeding", label: "Weeding" },
  { value: "pest_control", label: "Pest Control" },
  { value: "harvesting", label: "Harvesting" },
  { value: "soil_preparation", label: "Soil Preparation" },
  { value: "scouting", label: "Field Scouting" },
  { value: "pruning", label: "Pruning" },
  { value: "other", label: "Other" }
];

const LogActivityModal: React.FC<LogActivityModalProps> = ({
  open,
  onOpenChange,
  cycles,
  onActivityLogged
}) => {
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [activityType, setActivityType] = useState<string>("");
  const [activityName, setActivityName] = useState("");
  const [activityDate, setActivityDate] = useState<Date | undefined>(new Date());
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedCycleId || !activityName) {
      toast({
        title: "Validation Error",
        description: "Please select a crop and enter an activity name",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        crop_cycle_id: selectedCycleId,
        task_name: activityType ? `[${activityTypes.find(t => t.value === activityType)?.label}] ${activityName}` : activityName,
        due_date: activityDate ? format(activityDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
        notes: notes,
        is_completed: true // Activities are logged as completed since they already happened
      };

      const { error } = await (supabase as any)
        .from("cycle_tasks")
        .insert(payload);

      if (error) throw error;

      toast({
        title: "Activity Logged",
        description: "Your farm activity has been recorded successfully"
      });

      // Reset form
      setSelectedCycleId("");
      setActivityType("");
      setActivityName("");
      setActivityDate(new Date());
      setNotes("");
      
      onActivityLogged();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error logging activity:", error);
      toast({
        title: "Error",
        description: "Failed to log activity",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2 text-blue-600" />
            Log Farm Activity
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Crop Selection */}
          <div className="space-y-2">
            <Label>Select Crop *</Label>
            <Select value={selectedCycleId} onValueChange={setSelectedCycleId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a crop" />
              </SelectTrigger>
              <SelectContent>
                {cycles.map((cycle) => (
                  <SelectItem key={cycle.id} value={cycle.id}>
                    {cycle.crop_type} ({cycle.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cycles.length === 0 && (
              <p className="text-xs text-muted-foreground">No crops registered. Add a planting first.</p>
            )}
          </div>

          {/* Activity Type */}
          <div className="space-y-2">
            <Label>Activity Type</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger>
                <SelectValue placeholder="Select activity type" />
              </SelectTrigger>
              <SelectContent>
                {activityTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Activity Name */}
          <div className="space-y-2">
            <Label>Activity Description *</Label>
            <Input
              value={activityName}
              onChange={(e) => setActivityName(e.target.value)}
              placeholder="e.g., Applied 50kg NPK fertilizer"
            />
          </div>

          {/* Activity Date */}
          <div className="space-y-2">
            <Label>Activity Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {activityDate ? format(activityDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={activityDate}
                  onSelect={setActivityDate}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details about this activity..."
              rows={3}
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedCycleId || !activityName}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? "Logging..." : "Log Activity"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LogActivityModal;
