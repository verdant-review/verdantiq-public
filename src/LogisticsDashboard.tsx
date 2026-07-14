import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Truck } from "lucide-react";
import { format } from "date-fns";

interface RequestRow {
  id: string;
  status: string;
  request_date: string;
  scheduled_pickup_date?: string | null;
  assigned_vehicle_id?: string | null;
  provider_id?: string | null;
  crop_cycles?: {
    id: string;
    crop_type: string;
    farms?: {
      id: string;
      name: string;
    };
  };
}

const LogisticsDashboard: React.FC = () => {
  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState<RequestRow[]>([]);
  const [scheduled, setScheduled] = useState<RequestRow[]>([]);

  const [openSchedule, setOpenSchedule] = useState(false);
  const [selectedReq, setSelectedReq] = useState<RequestRow | null>(null);
  const [pickupDate, setPickupDate] = useState<Date | undefined>();
  const [vehicleId, setVehicleId] = useState("");
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");

  const fetchData = async () => {
    // Pending
    const { data: p } = await (supabase as any)
      .from("collection_requests")
      .select("*, crop_cycles(*, farms(*))")
      .eq("status", "Pending")
      .order("request_date", { ascending: true });
    setPending((p || []) as RequestRow[]);

    // Scheduled/In Transit
    const { data: s } = await (supabase as any)
      .from("collection_requests")
      .select("*, crop_cycles(*, farms(*))")
      .in("status", ["Scheduled", "In Transit"])
      .order("scheduled_pickup_date", { ascending: true });
    setScheduled((s || []) as RequestRow[]);
  };

  const fetchProviders = async () => {
    const { data } = await (supabase as any)
      .from("logistics_providers")
      .select("id,name")
      .eq("is_active", true)
      .order("name", { ascending: true });
    setProviders((data || []) as { id: string; name: string }[]);
  };

  useEffect(() => {
    document.title = "Logistics & Offtake | VerdantIQ";
    fetchData();
    fetchProviders();
  }, []);

  const openScheduleDialog = (row: RequestRow) => {
    setSelectedReq(row);
    setPickupDate(undefined);
    setVehicleId("");
    setSelectedProviderId(row.provider_id || "");
    setOpenSchedule(true);
  };
  const schedulePickup = async () => {
    if (!selectedReq || !pickupDate) return;
    await (supabase as any)
      .from("collection_requests")
      .update({
        scheduled_pickup_date: format(pickupDate, "yyyy-MM-dd"),
        assigned_vehicle_id: vehicleId || null,
        provider_id: selectedProviderId || null,
        status: "Scheduled",
      })
      .eq("id", selectedReq.id);

    // Log status event
    const providerName = providers.find((p) => p.id === selectedProviderId)?.name;
    await (supabase as any)
      .from("collection_status_events")
      .insert({
        collection_request_id: selectedReq.id,
        status: "Scheduled",
        note: providerName ? `Assigned to ${providerName}${vehicleId ? ` (vehicle ${vehicleId})` : ""}` : vehicleId ? `Vehicle ${vehicleId}` : null,
      });

    setOpenSchedule(false);
    await fetchData();
  };
  const [openGRN, setOpenGRN] = useState(false);
  const [bags, setBags] = useState<number | undefined>();
  const [weight, setWeight] = useState<number | undefined>();
  const [grade, setGrade] = useState<string>("");

  const openGRNDialog = (row: RequestRow) => {
    setSelectedReq(row);
    setBags(undefined);
    setWeight(undefined);
    setGrade("");
    setOpenGRN(true);
  };

  const submitGRN = async () => {
    if (!selectedReq || !weight) return;
    const { error } = await (supabase as any)
      .from("goods_received_notes")
      .insert({
        collection_request_id: selectedReq.id,
        quantity_bags: bags || null,
        weight_tonnes: weight,
        quality_grade: grade || null,
      });
    if (!error) {
      await (supabase as any)
        .from("collection_requests")
        .update({ status: "Completed" })
        .eq("id", selectedReq.id);

      await (supabase as any)
        .from("collection_status_events")
        .insert({
          collection_request_id: selectedReq.id,
          status: "Completed",
          note: grade ? `Grade: ${grade}, Weight: ${weight}t${bags ? ", Bags: " + bags : ""}` : `Weight: ${weight}t${bags ? ", Bags: " + bags : ""}`,
        });

      setOpenGRN(false);
      await fetchData();
    }
  };
  const updateStatus = async (row: RequestRow, newStatus: string, note?: string) => {
    await (supabase as any)
      .from("collection_requests")
      .update({ status: newStatus })
      .eq("id", row.id);
    await (supabase as any)
      .from("collection_status_events")
      .insert({ collection_request_id: row.id, status: newStatus, note: note || null });
    await fetchData();
  };

  const renderRow = (row: RequestRow, actions: React.ReactNode) => (
    <TableRow key={row.id}>
      <TableCell>{row.crop_cycles?.farms?.name || "-"}</TableCell>
      <TableCell>{row.crop_cycles?.crop_type || "-"}</TableCell>
      <TableCell>{row.request_date}</TableCell>
      <TableCell>{actions}</TableCell>
    </TableRow>
  );

  return (
    <main className="container mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Logistics & Offtake Management</h1>
        <p className="text-muted-foreground">Plan collections and log received goods.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Collections Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="pending">Pending Collections</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled Pickups</TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farm Name</TableHead>
                    <TableHead>Crop Type</TableHead>
                    <TableHead>Request Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) =>
                    renderRow(
                      row,
                      <Button size="sm" onClick={() => openScheduleDialog(row)}>
                        <Truck className="h-4 w-4 mr-2" /> Schedule Pickup
                      </Button>
                    )
                  )}
                  {pending.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No pending requests.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="scheduled">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farm Name</TableHead>
                    <TableHead>Crop Type</TableHead>
                    <TableHead>Pickup Date</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduled.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.crop_cycles?.farms?.name || "-"}</TableCell>
                      <TableCell>{row.crop_cycles?.crop_type || "-"}</TableCell>
                      <TableCell>{row.scheduled_pickup_date || "-"}</TableCell>
                      <TableCell>{providers.find((p) => p.id === row.provider_id)?.name || "-"}</TableCell>
                      <TableCell className="space-x-2">
                        <Button size="sm" variant="outline" onClick={() => updateStatus(row, "In Transit")}>In Transit</Button>
                        <Button size="sm" variant="secondary" onClick={() => openGRNDialog(row)}>
                          Log Received Goods
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {scheduled.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No scheduled pickups.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Schedule Dialog */}
      <Dialog open={openSchedule} onOpenChange={setOpenSchedule}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Pickup</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Pickup Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {pickupDate ? format(pickupDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={pickupDate} onSelect={setPickupDate} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Assigned Vehicle ID</label>
              <Input value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">3PL Provider</label>
              <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpenSchedule(false)}>Cancel</Button>
              <Button onClick={schedulePickup} disabled={!pickupDate}>Schedule</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* GRN Dialog */}
      <Dialog open={openGRN} onOpenChange={setOpenGRN}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Log Received Goods</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Quantity (bags)</label>
              <Input type="number" value={bags ?? ""} onChange={(e) => setBags(Number(e.target.value))} />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Weight (tonnes)</label>
              <Input type="number" value={weight ?? ""} onChange={(e) => setWeight(Number(e.target.value))} />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <label className="text-sm font-medium">Quality Grade</label>
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpenGRN(false)}>Cancel</Button>
              <Button onClick={submitGRN} disabled={!weight}>Submit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default LogisticsDashboard;
