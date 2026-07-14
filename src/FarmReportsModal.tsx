import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart3, 
  Download, 
  FileText, 
  Sprout, 
  Activity,
  TrendingUp,
  Calendar
} from "lucide-react";
import { format } from "date-fns";

interface FarmReportsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  farmId: string;
  farmName: string;
}

interface CropSummary {
  crop_type: string;
  total_area: number;
  completed_count: number;
  active_count: number;
  total_predicted_yield: number;
  total_actual_yield: number;
}

interface ActivitySummary {
  task_name: string;
  due_date: string;
  is_completed: boolean;
  crop_type: string;
}

const FarmReportsModal: React.FC<FarmReportsModalProps> = ({
  open,
  onOpenChange,
  farmId,
  farmName
}) => {
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [cropSummaries, setCropSummaries] = useState<CropSummary[]>([]);

  useEffect(() => {
    if (open && farmId) {
      fetchReportData();
    }
  }, [open, farmId]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      // Fetch crop cycles
      const { data: cyclesData } = await (supabase as any)
        .from("crop_cycles")
        .select("*")
        .eq("farm_id", farmId)
        .order("created_at", { ascending: false });

      setCycles(cyclesData || []);

      // Generate crop summaries
      const summaries: { [key: string]: CropSummary } = {};
      (cyclesData || []).forEach((cycle: any) => {
        const key = cycle.crop_type;
        if (!summaries[key]) {
          summaries[key] = {
            crop_type: key,
            total_area: 0,
            completed_count: 0,
            active_count: 0,
            total_predicted_yield: 0,
            total_actual_yield: 0
          };
        }
        summaries[key].total_area += cycle.area_hectares || 0;
        summaries[key].total_predicted_yield += cycle.predicted_yield_tonnes || 0;
        summaries[key].total_actual_yield += cycle.actual_yield_tonnes || 0;
        if (cycle.status === "Completed") {
          summaries[key].completed_count++;
        } else {
          summaries[key].active_count++;
        }
      });
      setCropSummaries(Object.values(summaries));

      // Fetch all tasks for farm cycles
      if (cyclesData && cyclesData.length > 0) {
        const cycleIds = cyclesData.map((c: any) => c.id);
        const { data: tasksData } = await (supabase as any)
          .from("cycle_tasks")
          .select("*")
          .in("crop_cycle_id", cycleIds)
          .order("due_date", { ascending: false })
          .limit(50);

        // Add crop type to tasks
        const tasksWithCrop = (tasksData || []).map((task: any) => {
          const cycle = cyclesData.find((c: any) => c.id === task.crop_cycle_id);
          return { ...task, crop_type: cycle?.crop_type || "Unknown" };
        });
        setTasks(tasksWithCrop);
      }
    } catch (error) {
      console.error("Error fetching report data:", error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const totalArea = cycles.reduce((sum, c) => sum + (c.area_hectares || 0), 0);
  const totalYield = cycles.reduce((sum, c) => sum + (c.actual_yield_tonnes || 0), 0);
  const completedTasks = tasks.filter(t => t.is_completed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-purple-600" />
            Farm Reports - {farmName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="crops">Crop Summary</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Sprout className="h-8 w-8 mx-auto text-green-600 mb-2" />
                    <div className="text-2xl font-bold text-green-600">{cycles.length}</div>
                    <div className="text-xs text-muted-foreground">Total Plantings</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <TrendingUp className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                    <div className="text-2xl font-bold text-blue-600">{totalArea.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">Total Hectares</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Activity className="h-8 w-8 mx-auto text-amber-600 mb-2" />
                    <div className="text-2xl font-bold text-amber-600">{tasks.length}</div>
                    <div className="text-xs text-muted-foreground">Total Activities</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <FileText className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                    <div className="text-2xl font-bold text-purple-600">{totalYield.toFixed(1)}t</div>
                    <div className="text-xs text-muted-foreground">Total Yield</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Recent Plantings</CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => exportToCSV(cycles, "plantings")}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {cycles.slice(0, 5).map((cycle) => (
                      <div key={cycle.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-3">
                          <Sprout className="h-4 w-4 text-green-600" />
                          <div>
                            <div className="font-medium text-sm">{cycle.crop_type}</div>
                            <div className="text-xs text-muted-foreground">{cycle.area_hectares} ha</div>
                          </div>
                        </div>
                        <Badge variant={cycle.status === "Completed" ? "default" : "secondary"}>
                          {cycle.status}
                        </Badge>
                      </div>
                    ))}
                    {cycles.length === 0 && (
                      <div className="text-center py-4 text-muted-foreground">
                        No plantings recorded yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Crop Summary Tab */}
            <TabsContent value="crops" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Crop Performance Summary</CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => exportToCSV(cropSummaries, "crop_summary")}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Crop</th>
                          <th className="text-center py-2">Total Area</th>
                          <th className="text-center py-2">Active</th>
                          <th className="text-center py-2">Completed</th>
                          <th className="text-center py-2">Predicted Yield</th>
                          <th className="text-center py-2">Actual Yield</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cropSummaries.map((summary, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="py-2 font-medium">{summary.crop_type}</td>
                            <td className="text-center py-2">{summary.total_area.toFixed(1)} ha</td>
                            <td className="text-center py-2">
                              <Badge variant="secondary">{summary.active_count}</Badge>
                            </td>
                            <td className="text-center py-2">
                              <Badge variant="default">{summary.completed_count}</Badge>
                            </td>
                            <td className="text-center py-2">{summary.total_predicted_yield.toFixed(1)}t</td>
                            <td className="text-center py-2">{summary.total_actual_yield.toFixed(1)}t</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {cropSummaries.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No crop data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activities Tab */}
            <TabsContent value="activities" className="mt-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">
                    Activity Log ({completedTasks}/{tasks.length} completed)
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => exportToCSV(tasks, "activities")}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 text-blue-600" />
                          <div>
                            <div className="font-medium text-sm">{task.task_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {task.crop_type} • {format(new Date(task.due_date), "MMM dd, yyyy")}
                            </div>
                          </div>
                        </div>
                        <Badge variant={task.is_completed ? "default" : "secondary"}>
                          {task.is_completed ? "Done" : "Pending"}
                        </Badge>
                      </div>
                    ))}
                    {tasks.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No activities recorded yet
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FarmReportsModal;
