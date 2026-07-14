import React, { useEffect, useState, useMemo, Suspense } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  Calendar as CalendarIcon,
  Plus,
  Sprout,
  Tractor,
  FileText,
  BarChart3,
  Bell,
  Activity,
  Leaf,
  CheckCircle,
  Home,
  Map as MapIcon,
  BrainCircuit,
  Beef,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import NotificationCenter from "@/components/NotificationCenter";
import FarmDetailsEditor from "@/components/FarmDetailsEditor";
import EquipmentManager from "@/components/EquipmentManager";
import LogActivityModal from "@/components/LogActivityModal";
import FarmReportsModal from "@/components/FarmReportsModal";
import PlantingInsights from "@/components/PlantingInsights";
import WeatherAlertsPanel from "@/components/WeatherAlertsPanel";
import DailyWeatherDigest from "@/components/DailyWeatherDigest";
import ProactiveRecommendations from "@/components/ProactiveRecommendations";
import MechanizationScoreCard from "@/components/MechanizationScoreCard";
import TodayOnTheFarm from "@/components/TodayOnTheFarm";
import SoilHealthCard from "@/components/soil/SoilHealthCard";
import PracticeTracker from "@/components/agroecology/PracticeTracker";
import FarmFAB from "@/components/farm/FarmFAB";

// Lazy-load heavy modules so the Today tab loads fast
const FarmMap = React.lazy(() => import("@/components/FarmMap"));
const CropHealthMonitor = React.lazy(() => import("@/components/CropHealthMonitor"));
const LivestockManager = React.lazy(() => import("@/components/LivestockManager"));

type Farm = {
  id: string;
  name: string;
  user_id: string;
  location?: string;
  size_hectares?: number;
  boundary?: any;
  latitude?: number | null;
  longitude?: number | null;
  farming_type?: "crop" | "livestock" | "mixed";
};

type CropCycle = {
  id: string;
  farm_id: string;
  crop_type: string;
  area_hectares: number;
  status: string;
  predicted_yield_tonnes?: number | null;
  actual_yield_tonnes?: number | null;
  planting_date?: string | null;
  estimated_harvest_date?: string | null;
};

type CycleTask = {
  id: string;
  crop_cycle_id: string;
  task_name: string;
  due_date: string;
  is_completed: boolean;
};

type CollectionRequestLite = {
  id: string;
  status: string;
  scheduled_pickup_date?: string | null;
  created_at: string;
};

type StatusEvent = {
  id: string;
  status: string;
  note?: string | null;
  created_at: string;
};

type TabKey = "today" | "crops" | "livestock" | "land" | "intelligence" | "reports";

const SectionSkeleton = ({ height = "h-40" }: { height?: string }) => (
  <Card>
    <CardContent className="p-4 space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className={`w-full ${height}`} />
    </CardContent>
  </Card>
);

const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: any;
  title: string;
  description: string;
  action?: React.ReactNode;
}) => (
  <Card className="border-dashed">
    <CardContent className="p-8 text-center">
      <Icon className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
      <h3 className="font-semibold text-base mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {action}
    </CardContent>
  </Card>
);

const MyFarmDashboard: React.FC = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [farmLoading, setFarmLoading] = useState(true);
  const [cycles, setCycles] = useState<CropCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<CropCycle | null>(null);
  const [tasks, setTasks] = useState<CycleTask[]>([]);
  const [latestRequest, setLatestRequest] = useState<CollectionRequestLite | null>(null);
  const [statusEvents, setStatusEvents] = useState<StatusEvent[]>([]);

  const [openAdd, setOpenAdd] = useState(false);
  const [newCycle, setNewCycle] = useState({ crop_type: "", area_hectares: 1, status: "Planning" });
  const [plantingDate, setPlantingDate] = useState<Date | undefined>();
  const [harvestDate, setHarvestDate] = useState<Date | undefined>();

  const [openAddTask, setOpenAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ task_name: "", due_date: "", notes: "" });
  const [taskDueDate, setTaskDueDate] = useState<Date | undefined>();

  const [weather, setWeather] = useState<any>(null);
  const [actualYield, setActualYield] = useState("");
  const [openLogActivity, setOpenLogActivity] = useState(false);
  const [openReports, setOpenReports] = useState(false);
  const [openEquipment, setOpenEquipment] = useState(false);

  // Tabs — initial value from URL hash
  const initialTab = (): TabKey => {
    if (typeof window === "undefined") return "today";
    const h = window.location.hash.replace("#", "");
    const valid: TabKey[] = ["today", "crops", "livestock", "land", "intelligence", "reports"];
    return (valid.includes(h as TabKey) ? h : "today") as TabKey;
  };
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab());

  useEffect(() => {
    document.title = "My Farm Dashboard | VerdantOS";
  }, []);

  // Sync tab → URL hash and scroll to top on change
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== `#${activeTab}`) {
      window.history.replaceState(null, "", `#${activeTab}`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  useEffect(() => {
    if (!farm?.latitude || !farm?.longitude) {
      setWeather(null);
      return;
    }
    const fetchWeatherData = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("weather-data", {
          body: {
            latitude: Number(farm.latitude),
            longitude: Number(farm.longitude),
            region: farm.location || farm.name || "Your Farm",
          },
        });
        if (!error && data?.data?.length > 0) setWeather(data.data[0]);
      } catch (error) {
        console.error("Weather fetch error:", error);
      }
    };
    fetchWeatherData();
  }, [farm?.id, farm?.latitude, farm?.longitude]);

  useEffect(() => {
    if (!user) return;
    const fetchFarm = async () => {
      setFarmLoading(true);
      const { data, error } = await (supabase as any)
        .from("farms")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (error) console.error("Error fetching farm", error);
      if (data) setFarm(data as Farm);
      setFarmLoading(false);
    };
    fetchFarm();
  }, [user]);

  useEffect(() => {
    if (!farm) return;
    const fetchCycles = async () => {
      const { data, error } = await (supabase as any)
        .from("crop_cycles")
        .select("*")
        .eq("farm_id", farm.id)
        .order("created_at", { ascending: false });
      if (!error) setCycles((data || []) as CropCycle[]);
    };
    fetchCycles();
  }, [farm]);

  useEffect(() => {
    if (!selectedCycle) return;
    const fetchTasks = async () => {
      const { data, error } = await (supabase as any)
        .from("cycle_tasks")
        .select("*")
        .eq("crop_cycle_id", selectedCycle.id)
        .order("due_date", { ascending: true });
      if (!error) setTasks((data || []) as CycleTask[]);
    };
    fetchTasks();
  }, [selectedCycle]);

  useEffect(() => {
    if (!selectedCycle) {
      setLatestRequest(null);
      setStatusEvents([]);
      return;
    }
    const fetchLatest = async () => {
      const { data: reqs } = await (supabase as any)
        .from("collection_requests")
        .select("id,status,scheduled_pickup_date,created_at")
        .eq("crop_cycle_id", selectedCycle.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const req = (reqs && (reqs as any[])[0]) || null;
      setLatestRequest(req);
      if (req) {
        const { data: evs } = await (supabase as any)
          .from("collection_status_events")
          .select("id,status,note,created_at")
          .eq("collection_request_id", req.id)
          .order("created_at", { ascending: true });
        setStatusEvents((evs || []) as StatusEvent[]);
      } else {
        setStatusEvents([]);
      }
    };
    fetchLatest();
  }, [selectedCycle]);

  const createCycle = async () => {
    if (!farm) return;
    const payload: any = {
      farm_id: farm.id,
      crop_type: newCycle.crop_type,
      area_hectares: Number(newCycle.area_hectares),
      status: newCycle.status,
    };
    if (plantingDate) payload.planting_date = format(plantingDate, "yyyy-MM-dd");
    if (harvestDate) payload.estimated_harvest_date = format(harvestDate, "yyyy-MM-dd");

    const { data, error } = await (supabase as any).from("crop_cycles").insert(payload).select("*").single();
    if (!error && data) {
      setCycles((prev) => [data as CropCycle, ...prev]);
      setOpenAdd(false);
      setNewCycle({ crop_type: "", area_hectares: 1, status: "Planning" });
      setPlantingDate(undefined);
      setHarvestDate(undefined);
      toast({ title: "Success", description: "New planting record created successfully" });
    } else {
      toast({ title: "Error", description: "Failed to create planting record", variant: "destructive" });
    }
  };

  const toggleTask = async (task: CycleTask) => {
    const { error } = await (supabase as any)
      .from("cycle_tasks")
      .update({ is_completed: !task.is_completed })
      .eq("id", task.id);
    if (!error) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_completed: !t.is_completed } : t)));
    }
  };

  const createTask = async () => {
    if (!selectedCycle) return;
    const payload: any = {
      crop_cycle_id: selectedCycle.id,
      task_name: newTask.task_name,
      due_date: taskDueDate ? format(taskDueDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
      notes: newTask.notes,
    };
    const { data, error } = await (supabase as any).from("cycle_tasks").insert(payload).select("*").single();
    if (!error && data) {
      setTasks((prev) => [...prev, data as CycleTask]);
      setOpenAddTask(false);
      setNewTask({ task_name: "", due_date: "", notes: "" });
      setTaskDueDate(undefined);
      toast({ title: "Success", description: "Task added successfully" });
    }
  };

  const updateCycleStatus = async (cycle: CropCycle, newStatus: string) => {
    const { error } = await (supabase as any).from("crop_cycles").update({ status: newStatus }).eq("id", cycle.id);
    if (!error) {
      setCycles((prev) => prev.map((c) => (c.id === cycle.id ? { ...c, status: newStatus } : c)));
      if (selectedCycle?.id === cycle.id) setSelectedCycle({ ...selectedCycle, status: newStatus });
      toast({ title: "Success", description: `Crop status updated to ${newStatus}` });
    }
  };

  const updateActualYield = async (cycle: CropCycle, yield_tonnes: number) => {
    const { error } = await (supabase as any)
      .from("crop_cycles")
      .update({ actual_yield_tonnes: yield_tonnes, status: "Completed" })
      .eq("id", cycle.id);
    if (!error) {
      setCycles((prev) =>
        prev.map((c) => (c.id === cycle.id ? { ...c, actual_yield_tonnes: yield_tonnes, status: "Completed" } : c))
      );
      if (selectedCycle?.id === cycle.id) {
        setSelectedCycle({ ...selectedCycle, actual_yield_tonnes: yield_tonnes, status: "Completed" });
      }
      setActualYield("");
      toast({ title: "Success", description: "Harvest completed and yield recorded" });
    }
  };

  const requestCollection = async (cycle: CropCycle) => {
    const { data, error } = await (supabase as any)
      .from("collection_requests")
      .insert({ crop_cycle_id: cycle.id })
      .select("*")
      .single();
    if (!error) {
      setLatestRequest({
        id: (data as any).id,
        status: (data as any).status,
        scheduled_pickup_date: (data as any).scheduled_pickup_date,
        created_at: (data as any).created_at,
      });
      setStatusEvents([]);
      toast({ title: "Success", description: "Collection request submitted successfully" });
    } else {
      toast({ title: "Error", description: "Failed to request collection", variant: "destructive" });
    }
  };

  const isLivestockOnly = farm?.farming_type === "livestock";
  const showCrops = !isLivestockOnly;
  const showLivestock = farm?.farming_type === "livestock" || farm?.farming_type === "mixed";

  // Build the visible tab list dynamically
  const visibleTabs = useMemo(() => {
    const list: { key: TabKey; label: string; icon: any }[] = [
      { key: "today", label: "Today", icon: Home },
    ];
    if (showCrops) list.push({ key: "crops", label: "Crops", icon: Sprout });
    if (showLivestock) list.push({ key: "livestock", label: "Livestock", icon: Beef });
    list.push({ key: "land", label: "Land & Soil", icon: MapIcon });
    list.push({ key: "intelligence", label: "Intelligence", icon: BrainCircuit });
    list.push({ key: "reports", label: "Reports", icon: BarChart3 });
    return list;
  }, [showCrops, showLivestock]);

  // FAB action per tab
  const fabAction = useMemo(() => {
    switch (activeTab) {
      case "today":
        return { label: "Log Activity", onClick: () => setOpenLogActivity(true), icon: <FileText className="h-5 w-5" /> };
      case "crops":
        return { label: "Add Planting", onClick: () => setOpenAdd(true), icon: <Plus className="h-5 w-5" /> };
      case "reports":
        return { label: "Open Reports", onClick: () => setOpenReports(true), icon: <BarChart3 className="h-5 w-5" /> };
      default:
        return null;
    }
  }, [activeTab]);

  if (farmLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-10 w-full" />
        <SectionSkeleton height="h-32" />
        <SectionSkeleton height="h-48" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 pb-24 sm:pb-6">
      {/* Slim Header */}
      <header className="sticky top-0 z-40 bg-green-600 text-white shadow-md">
        <div className="container mx-auto px-3 sm:px-4 h-12 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Leaf className="h-5 w-5 shrink-0" />
            <span className="font-bold text-base shrink-0">VerdantOS</span>
            {farm?.name && (
              <span className="text-green-100 text-sm truncate hidden xs:inline">
                · {farm.name}
                {farm.location && ` · ${farm.location}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Link
              to="/"
              className="hidden xs:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-green-700 hover:bg-green-800 transition-colors"
              aria-label="Back to VerdantIQ"
            >
              <Leaf className="h-3.5 w-3.5" />
              VerdantIQ
            </Link>
            <Link
              to="/"
              className="xs:hidden p-2 rounded-full hover:bg-green-700 transition-colors"
              aria-label="Back to VerdantIQ home"
            >
              <Home className="h-5 w-5" />
            </Link>
            <button
              className="p-2 rounded-full hover:bg-green-700 transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Desktop / tablet tab strip */}
        <div className="hidden sm:block border-t border-green-700 bg-green-600/95 backdrop-blur">
          <div className="container mx-auto px-3 sm:px-4 overflow-x-auto">
            <div className="flex gap-1">
              {visibleTabs.map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      active
                        ? "border-white text-white"
                        : "border-transparent text-green-100 hover:text-white"
                    }`}
                    aria-label={t.label}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
        {!farm ? (
          <EmptyState
            icon={Sprout}
            title="No farm registered yet"
            description="Set up your farm to access all dashboard features."
            action={null}
          />
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
            {/* TODAY */}
            <TabsContent value="today" className="space-y-4 mt-0">
              <TodayOnTheFarm farmId={farm.id} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DailyWeatherDigest
                  latitude={farm.latitude ? Number(farm.latitude) : undefined}
                  longitude={farm.longitude ? Number(farm.longitude) : undefined}
                  region={farm.location || farm.name}
                  crops={cycles.map((c) => c.crop_type)}
                />
                <ProactiveRecommendations
                  farmId={farm.id}
                  crops={cycles.map((c) => ({
                    crop_type: c.crop_type,
                    status: c.status,
                    planting_date: c.planting_date,
                    area_hectares: c.area_hectares,
                  }))}
                  weather={weather}
                  region={farm.location || undefined}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NotificationCenter />
                <Card className="bg-white shadow-sm">
                  <CardHeader className="bg-green-50 border-b py-3">
                    <CardTitle className="text-green-800 flex items-center text-base">
                      <Sprout className="h-4 w-4 mr-2" />
                      Farm Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-base truncate">{farm.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {farm.location && `${farm.location} • `}
                          {farm.size_hectares && `${farm.size_hectares} ha`}
                        </div>
                      </div>
                      <FarmDetailsEditor farm={farm} onUpdate={setFarm} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{cycles.length}</div>
                        <div className="text-xs text-muted-foreground">
                          {showCrops ? "Crop Records" : "Records"}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{tasks.length}</div>
                        <div className="text-xs text-muted-foreground">Open Tasks</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* CROPS */}
            {showCrops && (
              <TabsContent value="crops" className="space-y-4 mt-0">
                <Card className="bg-white shadow-sm">
                  <CardHeader className="bg-green-50 border-b py-3">
                    <CardTitle className="text-green-800 flex items-center justify-between text-base">
                      <div className="flex items-center">
                        <Sprout className="h-4 w-4 mr-2" />
                        Planting Records
                      </div>
                      <Badge variant="secondary">{cycles.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {cycles.length > 0 ? (
                      <div className="divide-y max-h-[70vh] overflow-y-auto">
                        {cycles.map((cycle) => (
                          <div
                            key={cycle.id}
                            className="p-3 sm:p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => setSelectedCycle(cycle)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                                  <Sprout className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm sm:text-base truncate">{cycle.crop_type}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {cycle.area_hectares} ha
                                    {cycle.planting_date &&
                                      ` • ${format(new Date(cycle.planting_date), "MMM dd, yyyy")}`}
                                  </div>
                                </div>
                              </div>
                              <Badge
                                variant={
                                  cycle.status === "Planning"
                                    ? "secondary"
                                    : cycle.status === "Growing"
                                    ? "default"
                                    : "outline"
                                }
                                className="shrink-0"
                              >
                                {cycle.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6">
                        <EmptyState
                          icon={Sprout}
                          title="No planting records yet"
                          description="Add your first crop planting to track growth, tasks and yields."
                          action={
                            <Button onClick={() => setOpenAdd(true)} className="bg-green-600 hover:bg-green-700">
                              <Plus className="h-4 w-4 mr-2" />
                              Add First Planting
                            </Button>
                          }
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* LIVESTOCK */}
            {showLivestock && (
              <TabsContent value="livestock" className="space-y-4 mt-0">
                <Suspense fallback={<SectionSkeleton height="h-64" />}>
                  <LivestockManager farmId={farm.id} />
                </Suspense>
              </TabsContent>
            )}

            {/* LAND & SOIL */}
            <TabsContent value="land" className="space-y-4 mt-0">
              <Suspense fallback={<SectionSkeleton height="h-72" />}>
                <FarmMap
                  farm={farm}
                  onBoundaryUpdate={(boundary, lat, lng) => {
                    setFarm({ ...farm, boundary, latitude: lat, longitude: lng });
                  }}
                />
              </Suspense>
              {(farm.farming_type === "crop" || farm.farming_type === "mixed" || !farm.farming_type) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SoilHealthCard farmId={farm.id} farmName={farm.name} />
                  <PracticeTracker farmId={farm.id} />
                </div>
              )}
              <MechanizationScoreCard farmId={farm.id} />
            </TabsContent>

            {/* INTELLIGENCE */}
            <TabsContent value="intelligence" className="space-y-4 mt-0">
              {farm.latitude && farm.longitude ? (
                <div className={`grid grid-cols-1 ${showCrops ? "md:grid-cols-2" : ""} gap-4`}>
                  {showCrops && (
                    <Suspense fallback={<SectionSkeleton height="h-64" />}>
                      <CropHealthMonitor
                        farmId={farm.id}
                        latitude={Number(farm.latitude)}
                        longitude={Number(farm.longitude)}
                        farmName={farm.name}
                      />
                    </Suspense>
                  )}
                  <WeatherAlertsPanel
                    farmId={farm.id}
                    latitude={Number(farm.latitude)}
                    longitude={Number(farm.longitude)}
                    farmName={farm.name}
                  />
                </div>
              ) : (
                <EmptyState
                  icon={BrainCircuit}
                  title="Map your farm to unlock intelligence"
                  description="NDVI, weather alerts and AI insights need a farm boundary or location pin."
                  action={
                    <Button onClick={() => setActiveTab("land")} className="bg-green-600 hover:bg-green-700">
                      <MapIcon className="h-4 w-4 mr-2" />
                      Go to Land & Soil
                    </Button>
                  }
                />
              )}
            </TabsContent>

            {/* REPORTS */}
            <TabsContent value="reports" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  className="h-20 flex flex-col items-center justify-center gap-1 bg-purple-600 hover:bg-purple-700"
                  onClick={() => setOpenReports(true)}
                >
                  <BarChart3 className="h-5 w-5" />
                  <span className="text-sm">Farm Reports</span>
                </Button>
                <Button
                  className="h-20 flex flex-col items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => setOpenLogActivity(true)}
                >
                  <FileText className="h-5 w-5" />
                  <span className="text-sm">Log Activity</span>
                </Button>
                <Button
                  className="h-20 flex flex-col items-center justify-center gap-1 bg-amber-600 hover:bg-amber-700"
                  onClick={() => setOpenEquipment(true)}
                >
                  <Tractor className="h-5 w-5" />
                  <span className="text-sm">Equipment</span>
                </Button>
              </div>
              <EmptyState
                icon={BarChart3}
                title="More exports coming soon"
                description="Season summaries, yield trends and ministry-ready reports will appear here."
              />
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* Mobile bottom nav */}
      {farm && (
        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t shadow-lg">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.min(visibleTabs.length, 5)}, 1fr)` }}>
            {visibleTabs.slice(0, 5).map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex flex-col items-center justify-center py-2 gap-1 text-[10px] font-medium ${
                    active ? "text-green-600" : "text-gray-500"
                  }`}
                  aria-label={t.label}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Floating Action Button */}
      {farm && fabAction && (
        <FarmFAB label={fabAction.label} onClick={fabAction.onClick} icon={fabAction.icon} />
      )}

      {/* === Modals === */}

      {/* Add Planting */}
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Planting Record</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Crop Type</Label>
              <Input
                value={newCycle.crop_type}
                onChange={(e) => setNewCycle({ ...newCycle, crop_type: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Area (hectares)</Label>
              <Input
                type="number"
                value={newCycle.area_hectares}
                onChange={(e) => setNewCycle({ ...newCycle, area_hectares: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Planting Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {plantingDate ? format(plantingDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={plantingDate} onSelect={setPlantingDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label>Est. Harvest Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {harvestDate ? format(harvestDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={harvestDate} onSelect={setHarvestDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex justify-end">
              <Button onClick={createCycle} className="bg-green-600 hover:bg-green-700">
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Equipment */}
      <Dialog open={openEquipment} onOpenChange={setOpenEquipment}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Equipment Management</DialogTitle>
          </DialogHeader>
          {farm && <EquipmentManager farmId={farm.id} />}
        </DialogContent>
      </Dialog>

      <LogActivityModal
        open={openLogActivity}
        onOpenChange={setOpenLogActivity}
        cycles={cycles}
        onActivityLogged={() => {
          if (selectedCycle) {
            const fetchTasks = async () => {
              const { data } = await (supabase as any)
                .from("cycle_tasks")
                .select("*")
                .eq("crop_cycle_id", selectedCycle.id)
                .order("due_date", { ascending: true });
              setTasks((data || []) as CycleTask[]);
            };
            fetchTasks();
          }
        }}
      />

      {farm && (
        <FarmReportsModal
          open={openReports}
          onOpenChange={setOpenReports}
          farmId={farm.id}
          farmName={farm.name}
        />
      )}

      {/* Selected cycle detail — Sheet on mobile, Dialog on desktop */}
      {selectedCycle && (
        <Sheet open={!!selectedCycle} onOpenChange={(o) => !o && setSelectedCycle(null)}>
          <SheetContent
            side={isMobile ? "bottom" : "right"}
            className={isMobile ? "h-[90vh] overflow-y-auto" : "w-full sm:max-w-2xl overflow-y-auto"}
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Sprout className="h-5 w-5 text-green-600" />
                {selectedCycle.crop_type} Record
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-5 text-xs">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="insights">AI</TabsTrigger>
                  <TabsTrigger value="activities">Tasks</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="harvest">Harvest</TabsTrigger>
                </TabsList>

                <TabsContent value="insights" className="mt-4">
                  <PlantingInsights
                    cropType={selectedCycle.crop_type}
                    status={selectedCycle.status}
                    plantingDate={selectedCycle.planting_date}
                    harvestDate={selectedCycle.estimated_harvest_date}
                    areaHectares={selectedCycle.area_hectares}
                    weather={weather}
                    region={farm?.location || "Zimbabwe"}
                  />
                </TabsContent>

                <TabsContent value="overview" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-gray-600">Crop Type</Label>
                      <div className="font-semibold">{selectedCycle.crop_type}</div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Area</Label>
                      <div className="font-semibold">{selectedCycle.area_hectares} ha</div>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Status</Label>
                      <Select
                        value={selectedCycle.status}
                        onValueChange={(value) => updateCycleStatus(selectedCycle, value)}
                      >
                        <SelectTrigger className="mt-1 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Planning">Planning</SelectItem>
                          <SelectItem value="Growing">Growing</SelectItem>
                          <SelectItem value="Harvesting">Harvesting</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Predicted Yield</Label>
                      <div className="font-semibold">
                        {selectedCycle.predicted_yield_tonnes ? `${selectedCycle.predicted_yield_tonnes}t` : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-gray-600">Planting Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="justify-start w-full mt-1">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedCycle.planting_date
                              ? format(new Date(selectedCycle.planting_date), "PPP")
                              : "Set date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={selectedCycle.planting_date ? new Date(selectedCycle.planting_date) : undefined}
                            onSelect={async (d) => {
                              const val = d ? format(d, "yyyy-MM-dd") : null;
                              await (supabase as any)
                                .from("crop_cycles")
                                .update({ planting_date: val })
                                .eq("id", selectedCycle.id);
                              setSelectedCycle({ ...selectedCycle, planting_date: val as any });
                            }}
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600">Est. Harvest Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="justify-start w-full mt-1">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {selectedCycle.estimated_harvest_date
                              ? format(new Date(selectedCycle.estimated_harvest_date), "PPP")
                              : "Set date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={
                              selectedCycle.estimated_harvest_date
                                ? new Date(selectedCycle.estimated_harvest_date)
                                : undefined
                            }
                            onSelect={async (d) => {
                              const val = d ? format(d, "yyyy-MM-dd") : null;
                              await (supabase as any)
                                .from("crop_cycles")
                                .update({ estimated_harvest_date: val })
                                .eq("id", selectedCycle.id);
                              setSelectedCycle({ ...selectedCycle, estimated_harvest_date: val as any });
                            }}
                            className="p-3 pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="activities" className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Tasks</h3>
                    <Dialog open={openAddTask} onOpenChange={setOpenAddTask}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700">
                          <Plus className="h-4 w-4 mr-1" /> Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add New Activity</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label>Activity Name</Label>
                            <Input
                              value={newTask.task_name}
                              onChange={(e) => setNewTask({ ...newTask, task_name: e.target.value })}
                              placeholder="e.g., Apply fertilizer"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Due Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="justify-start">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {taskDueDate ? format(taskDueDate, "PPP") : "Pick a date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={taskDueDate} onSelect={setTaskDueDate} className="p-3 pointer-events-auto" />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="grid gap-2">
                            <Label>Notes</Label>
                            <Textarea
                              value={newTask.notes}
                              onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                            />
                          </div>
                          <div className="flex justify-end">
                            <Button onClick={createTask} className="bg-green-600 hover:bg-green-700">
                              Create
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 p-3 border rounded-lg">
                        <Checkbox checked={task.is_completed} onCheckedChange={() => toggleTask(task)} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{task.task_name}</div>
                          <div className="text-xs text-muted-foreground">
                            Due: {format(new Date(task.due_date), "MMM dd, yyyy")}
                          </div>
                        </div>
                        <Badge variant={task.is_completed ? "default" : "secondary"}>
                          {task.is_completed ? "Done" : "Pending"}
                        </Badge>
                      </div>
                    ))}
                    {tasks.length === 0 && (
                      <div className="text-center py-6 text-sm text-muted-foreground">No tasks yet</div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="mt-4 space-y-4">
                  <div className="relative pl-8">
                    <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                    {selectedCycle.planting_date && (
                      <div className="relative mb-4">
                        <div className="absolute -left-8 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                          <Sprout className="h-3 w-3 text-white" />
                        </div>
                        <div className="font-medium text-sm">Planted</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(selectedCycle.planting_date), "MMMM dd, yyyy")}
                        </div>
                      </div>
                    )}
                    {selectedCycle.estimated_harvest_date && (
                      <div className="relative">
                        <div className="absolute -left-8 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center">
                          <Activity className="h-3 w-3 text-white" />
                        </div>
                        <div className="font-medium text-sm">Estimated Harvest</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(selectedCycle.estimated_harvest_date), "MMMM dd, yyyy")}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="harvest" className="mt-4 space-y-3">
                  <div className="p-3 border rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Predicted:</span>
                      <span className="font-medium">{selectedCycle.predicted_yield_tonnes ?? "—"} t</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Actual:</span>
                      <span className="font-medium">{selectedCycle.actual_yield_tonnes ?? "—"} t</span>
                    </div>
                  </div>

                  {selectedCycle.status === "Harvesting" && !selectedCycle.actual_yield_tonnes && (
                    <div className="space-y-2">
                      <Label>Record Actual Yield (tonnes)</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.1"
                          value={actualYield}
                          onChange={(e) => setActualYield(e.target.value)}
                          placeholder="e.g. 2.5"
                        />
                        <Button
                          onClick={() => updateActualYield(selectedCycle, parseFloat(actualYield))}
                          disabled={!actualYield}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Complete
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedCycle.status === "Harvesting" && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-green-800 text-sm">Ready for Collection</div>
                          <div className="text-xs text-green-600">Request 3PL pickup</div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => requestCollection(selectedCycle)}
                          className="bg-green-600 hover:bg-green-700"
                          disabled={!!latestRequest}
                        >
                          {latestRequest ? "Requested" : "Request"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {latestRequest && (
                    <div className="p-3 border rounded-lg text-sm space-y-2">
                      <div className="flex justify-between">
                        <span>Status:</span>
                        <Badge variant={latestRequest.status === "Pending" ? "secondary" : "default"}>
                          {latestRequest.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Requested:</span>
                        <span>{format(new Date(latestRequest.created_at), "PPP")}</span>
                      </div>
                      {latestRequest.scheduled_pickup_date && (
                        <div className="flex justify-between">
                          <span>Pickup:</span>
                          <span>{format(new Date(latestRequest.scheduled_pickup_date), "PPP")}</span>
                        </div>
                      )}
                      {statusEvents.length > 0 && (
                        <div className="pt-2 border-t space-y-1">
                          {statusEvents.map((e) => (
                            <div key={e.id} className="flex justify-between text-xs">
                              <Badge variant="outline">{e.status}</Badge>
                              <span className="text-muted-foreground">
                                {format(new Date(e.created_at), "MMM dd, HH:mm")}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedCycle.status === "Completed" && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center">
                      <CheckCircle className="h-5 w-5 text-blue-600 mr-2" />
                      <div className="text-sm">
                        <div className="font-medium text-blue-800">Harvest Completed</div>
                        <div className="text-xs text-blue-600">
                          Final yield: {selectedCycle.actual_yield_tonnes ?? "—"} t
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedCycle.status === "Planning" || selectedCycle.status === "Growing") && (
                    <div className="text-center py-6">
                      <Tractor className="h-10 w-10 mx-auto mb-2 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground mb-3">
                        Mark as "Harvesting" to enable collection
                      </p>
                      <Button
                        size="sm"
                        onClick={() => updateCycleStatus(selectedCycle, "Harvesting")}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Mark as Ready for Harvest
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};

export default MyFarmDashboard;
