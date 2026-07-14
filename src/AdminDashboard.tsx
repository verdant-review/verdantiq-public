import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Users, DollarSign, Save, X, RefreshCw, Download, MapPin, Zap } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminFarmsOverview from "./AdminFarmsOverview";
import AdminLivestockOverview from "./AdminLivestockOverview";
import AdminMechanizationReport from "./AdminMechanizationReport";
import FeedbackAdmin from "./admin/FeedbackAdmin";
import StatusAdmin from "./admin/StatusAdmin";
import DiscoveryAdmin from "./admin/DiscoveryAdmin";
import UsersChannelsAdmin from "./admin/UsersChannelsAdmin";
import OrgsAdmin from "./admin/OrgsAdmin";
import KnowledgeBaseAdmin from "./admin/KnowledgeBaseAdmin";

const GRAIN_PRESETS = [
  { crop: "Maize", price: "420", region: "Harare" },
  { crop: "Wheat", price: "550", region: "Harare" },
  { crop: "Soybeans", price: "680", region: "Harare" },
  { crop: "Sugar Beans", price: "900", region: "Harare" },
  { crop: "Sorghum", price: "350", region: "Harare" },
  { crop: "Groundnuts", price: "1200", region: "Harare" },
  { crop: "Sunflower", price: "480", region: "Harare" },
  { crop: "Cotton", price: "600", region: "Harare" },
  { crop: "Tobacco", price: "4500", region: "Harare" },
  { crop: "Rice", price: "750", region: "Harare" },
];

const REGIONS = ["Harare", "Bulawayo", "Mutare", "Gweru", "Masvingo", "Chinhoyi", "Kwekwe", "Rusape", "Karoi", "Chegutu"];

const AdminDashboard = () => {
  const [marketPrices, setMarketPrices] = useState([]);
  const [mbarePrices, setMbarePrices] = useState([]);
  const [users, setUsers] = useState([]);
  const [editingPrice, setEditingPrice] = useState(null);
  const [editingMbare, setEditingMbare] = useState(null);
  const [editForm, setEditForm] = useState({
    crop: "",
    price: "",
    region: "",
    market_location: "",
    price_change: ""
  });
  const [editMbareForm, setEditMbareForm] = useState({
    item: "",
    quantity: "",
    usd_price: "",
    zig_price: ""
  });
  const [newPrice, setNewPrice] = useState({
    crop: "",
    price: "",
    region: "",
    market_location: "",
    price_change: ""
  });
  const [newMbarePrice, setNewMbarePrice] = useState({
    item: "",
    quantity: "",
    usd_price: "",
    zig_price: ""
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchMarketPrices();
    fetchMbarePrices();
    fetchUsers();
  }, []);

  const fetchMarketPrices = async () => {
    console.log('Fetching market prices from database...');
    const { data, error } = await supabase
      .from("market_prices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error('Error fetching market prices:', error);
      toast({
        title: "Error fetching market prices",
        description: error.message,
        variant: "destructive",
      });
    } else {
      console.log('Market prices fetched:', data);
      setMarketPrices(data || []);
    }
  };

  const fetchMbarePrices = async () => {
    console.log('Fetching Mbare prices from database...');
    const { data, error } = await supabase
      .from("mbare_market_prices")
      .select("*")
      .order("captured_at", { ascending: false });

    if (error) {
      console.error('Error fetching Mbare prices:', error);
      toast({
        title: "Error fetching Mbare prices",
        description: error.message,
        variant: "destructive",
      });
    } else {
      console.log('Mbare prices fetched:', data);
      setMbarePrices(data || []);
    }
  };

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error fetching users",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setUsers(data || []);
    }
  };

  const addPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("market_prices").insert([
      {
        ...newPrice,
        price: parseFloat(newPrice.price),
        price_change: newPrice.price_change ? parseFloat(newPrice.price_change) : null,
        source: "Verdant Network"
      },
    ]);

    if (error) {
      toast({
        title: "Error adding price",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Price added successfully",
        description: `${newPrice.crop} price updated for ${newPrice.region}`,
      });
      setNewPrice({ crop: "", price: "", region: "", market_location: "", price_change: "" });
      fetchMarketPrices();
    }

    setLoading(false);
  };

  const addMbarePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("mbare_market_prices").insert([
      {
        ...newMbarePrice,
        usd_price: parseFloat(newMbarePrice.usd_price),
        zig_price: parseFloat(newMbarePrice.zig_price),
        source: "Zyterra Network"
      },
    ]);

    if (error) {
      toast({
        title: "Error adding Mbare price",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Mbare price added successfully",
        description: `${newMbarePrice.item} price added`,
      });
      setNewMbarePrice({ item: "", quantity: "", usd_price: "", zig_price: "" });
      fetchMbarePrices();
    }

    setLoading(false);
  };

  const startEdit = (price: any) => {
    setEditingPrice(price.id);
    setEditForm({
      crop: price.crop,
      price: price.price.toString(),
      region: price.region,
      market_location: price.market_location || "",
      price_change: price.price_change ? price.price_change.toString() : ""
    });
  };

  const cancelEdit = () => {
    setEditingPrice(null);
    setEditForm({ crop: "", price: "", region: "", market_location: "", price_change: "" });
  };

  const saveEdit = async (id: string) => {
    setLoading(true);

    const { error } = await supabase
      .from("market_prices")
      .update({
        ...editForm,
        price: parseFloat(editForm.price),
        price_change: editForm.price_change ? parseFloat(editForm.price_change) : null,
        last_updated: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error updating price",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Price updated successfully",
      });
      setEditingPrice(null);
      setEditForm({ crop: "", price: "", region: "", market_location: "", price_change: "" });
      fetchMarketPrices();
    }

    setLoading(false);
  };

  const deletePrice = async (id: string) => {
    console.log('Deleting price with ID:', id);
    const { error } = await supabase.from("market_prices").delete().eq("id", id);

    if (error) {
      console.error('Error deleting price:', error);
      toast({
        title: "Error deleting price",
        description: error.message,
        variant: "destructive",
      });
    } else {
      console.log('Price deleted successfully');
      toast({
        title: "Price deleted successfully",
      });
      // Immediately refresh the market prices to reflect the deletion
      fetchMarketPrices();
    }
  };

  const toggleAdminStatus = async (userId: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_admin: !currentStatus })
      .eq("id", userId);

    if (error) {
      toast({
        title: "Error updating admin status",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Admin status updated",
      });
      fetchUsers();
    }
  };

  const startEditMbare = (price: any) => {
    setEditingMbare(price.id);
    setEditMbareForm({
      item: price.item,
      quantity: price.quantity,
      usd_price: price.usd_price.toString(),
      zig_price: price.zig_price.toString()
    });
  };

  const cancelEditMbare = () => {
    setEditingMbare(null);
    setEditMbareForm({ item: "", quantity: "", usd_price: "", zig_price: "" });
  };

  const saveEditMbare = async (id: string) => {
    setLoading(true);

    const { error } = await supabase
      .from("mbare_market_prices")
      .update({
        ...editMbareForm,
        usd_price: parseFloat(editMbareForm.usd_price),
        zig_price: parseFloat(editMbareForm.zig_price),
        captured_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error updating Mbare price",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Mbare price updated successfully",
      });
      setEditingMbare(null);
      setEditMbareForm({ item: "", quantity: "", usd_price: "", zig_price: "" });
      fetchMbarePrices();
    }

    setLoading(false);
  };

  const deleteMbarePrice = async (id: string) => {
    console.log('Deleting Mbare price with ID:', id);
    const { error } = await supabase.from("mbare_market_prices").delete().eq("id", id);

    if (error) {
      console.error('Error deleting Mbare price:', error);
      toast({
        title: "Error deleting Mbare price",
        description: error.message,
        variant: "destructive",
      });
    } else {
      console.log('Mbare price deleted successfully');
      toast({
        title: "Mbare price deleted successfully",
      });
      fetchMbarePrices();
    }
  };

  // ZimPriceCheck scraper removed — Mbare prices are now captured through
  // verified manual entry (every 2 days) with a full audit trail. Approved
  // data-partner feeds can plug in later by inserting rows with
  // source_type = 'partner' — the audit trigger records them automatically.

  const [auditLog, setAuditLog] = useState<any[]>([]);
  const fetchAuditLog = async () => {
    const { data, error } = await supabase
      .from("mbare_price_audit" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("audit fetch error", error);
      toast({ title: "Error loading audit log", description: error.message, variant: "destructive" });
    } else {
      setAuditLog((data as any[]) || []);
    }
  };



  const [view, setView] = useState<string>("orgs");

  const NAV_GROUPS: { label: string; items: { value: string; label: string; icon: any }[] }[] = [
    {
      label: "Customers",
      items: [
        { value: "orgs", label: "Organisations", icon: Users },
        { value: "discovery", label: "Discovery leads", icon: Download },
        { value: "feedback", label: "Feedback", icon: Edit },
      ],
    },
    {
      label: "Programmes",
      items: [
        { value: "farms", label: "Farms", icon: MapPin },
        { value: "livestock", label: "Livestock", icon: Users },
        { value: "mechanization", label: "Mechanization", icon: Zap },
      ],
    },
    {
      label: "Markets",
      items: [
        { value: "market-prices", label: "Market prices", icon: DollarSign },
        { value: "mbare-prices", label: "Mbare Musika", icon: MapPin },
      ],
    },
    {
      label: "People",
      items: [
        { value: "users", label: "Platform users", icon: Users },
        { value: "channels", label: "Channels", icon: RefreshCw },
      ],
    },
    {
      label: "Platform",
      items: [
        { value: "status", label: "System status", icon: Zap },
        { value: "knowledge-base", label: "Knowledge base", icon: Edit },
      ],
    },
  ];

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const currentItem = allItems.find((i) => i.value === view) || allItems[0];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 lg:py-8">
        <div className="mb-6">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage customers, programmes, markets, and the platform</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl lg:text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium">Market Prices</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl lg:text-2xl font-bold">{marketPrices.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium">Mbare Items</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl lg:text-2xl font-bold">{mbarePrices.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs lg:text-sm font-medium">Admin Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl lg:text-2xl font-bold">
                {users.filter((user: any) => user.is_admin).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Mbare price audit log — verified manual entry with full audit trail */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="h-4 w-4" />
                  Mbare Price Audit Log
                </CardTitle>
                <CardDescription>
                  Every insert, update, and delete on Mbare Musika prices is recorded here. Approved partner feeds will plug in via <code>source_type = 'partner'</code>.
                </CardDescription>
              </div>
              <Button onClick={fetchAuditLog} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Load audit log
              </Button>
            </div>
          </CardHeader>
          {auditLog.length > 0 && (
            <CardContent>
              <div className="max-h-72 overflow-auto border rounded-md">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr className="text-left">
                      <th className="p-2">When</th>
                      <th className="p-2">Action</th>
                      <th className="p-2">Item</th>
                      <th className="p-2">USD</th>
                      <th className="p-2">Source</th>
                      <th className="p-2">Actor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((row: any) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                        <td className="p-2 uppercase">{row.action}</td>
                        <td className="p-2">{row.item ?? row.new_item ?? row.old_item ?? '—'}</td>
                        <td className="p-2">${row.usd_price ?? row.new_usd_price ?? row.old_usd_price ?? '—'}</td>
                        <td className="p-2">{row.source_type ?? '—'}</td>
                        <td className="p-2 font-mono text-[10px]">{row.actor_id?.slice(0, 8) ?? 'system'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>



        {/* Mobile section selector */}
        <div className="lg:hidden mb-4">
          <Label className="text-xs text-muted-foreground mb-1 block">Section</Label>
          <Select value={view} onValueChange={setView}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NAV_GROUPS.map((g) => (
                <div key={g.label}>
                  <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{g.label}</div>
                  {g.items.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sectioned layout: sidebar nav + content */}
        <div className="grid lg:grid-cols-[240px_1fr] gap-6">
          {/* Sidebar (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-6 space-y-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.label}>
                  <div className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {group.label}
                  </div>
                  <nav className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = view === item.value;
                      return (
                        <button
                          key={item.value}
                          onClick={() => setView(item.value)}
                          className={`w-full text-left flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground font-medium"
                              : "text-foreground hover:bg-muted"
                          }`}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0 space-y-6">
            <div className="mb-2">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <currentItem.icon className="h-5 w-5 text-primary" />
                {currentItem.label}
              </h2>
            </div>

            {view === "orgs" && <OrgsAdmin />}
            {view === "discovery" && <DiscoveryAdmin />}
            {view === "feedback" && <FeedbackAdmin />}
            {view === "farms" && <AdminFarmsOverview />}
            {view === "livestock" && <AdminLivestockOverview />}
            {view === "mechanization" && <AdminMechanizationReport />}
            {view === "channels" && <UsersChannelsAdmin />}
            {view === "status" && <StatusAdmin />}
            {view === "knowledge-base" && <KnowledgeBaseAdmin />}

            {view === "market-prices" && (
              <>

            {/* Add New Market Price */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Add Market Price
                </CardTitle>
                <CardDescription>Add or update commodity prices via Verdant Network</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Quick-Add Presets */}
                <div className="mb-4">
                  <Label className="text-xs text-muted-foreground mb-2 block">Quick Add Commodity</Label>
                  <div className="flex flex-wrap gap-2">
                    {GRAIN_PRESETS.map((preset) => (
                      <Button
                        key={preset.crop}
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => setNewPrice({ ...newPrice, crop: preset.crop, price: preset.price, region: preset.region })}
                      >
                        <Zap className="h-3 w-3 mr-1" />
                        {preset.crop}
                      </Button>
                    ))}
                  </div>
                </div>

                <form onSubmit={addPrice} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <Label htmlFor="crop">Crop</Label>
                    <Input
                      id="crop"
                      value={newPrice.crop}
                      onChange={(e) => setNewPrice({ ...newPrice, crop: e.target.value })}
                      placeholder="e.g., Maize"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="price">Price (USD/MT)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={newPrice.price}
                      onChange={(e) => setNewPrice({ ...newPrice, price: e.target.value })}
                      placeholder="420.00"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="region">Region</Label>
                    <Select
                      value={newPrice.region}
                      onValueChange={(val) => setNewPrice({ ...newPrice, region: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        {REGIONS.map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="price_change">% Change</Label>
                    <Input
                      id="price_change"
                      type="number"
                      step="0.1"
                      value={newPrice.price_change}
                      onChange={(e) => setNewPrice({ ...newPrice, price_change: e.target.value })}
                      placeholder="0.0"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={loading} className="w-full bg-green-900 hover:bg-green-800">
                      {loading ? "Adding..." : "Add Price"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Market Prices Table */}
            <Card>
              <CardHeader>
                <CardTitle>Market Prices</CardTitle>
                <CardDescription>Current commodity prices in the system ({marketPrices.length} records)</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crop</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Market</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Last Updated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marketPrices.map((price: any) => (
                      <TableRow key={price.id}>
                        <TableCell className="font-medium">
                          {editingPrice === price.id ? (
                            <Input
                              value={editForm.crop}
                              onChange={(e) => setEditForm({ ...editForm, crop: e.target.value })}
                              className="w-20"
                            />
                          ) : (
                            price.crop
                          )}
                        </TableCell>
                        <TableCell>
                          {editingPrice === price.id ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={editForm.price}
                              onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                              className="w-24"
                            />
                          ) : (
                            `$${price.price}/${price.unit}`
                          )}
                        </TableCell>
                        <TableCell>
                          {editingPrice === price.id ? (
                            <Input
                              value={editForm.region}
                              onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                              className="w-24"
                            />
                          ) : (
                            price.region
                          )}
                        </TableCell>
                        <TableCell>
                          {editingPrice === price.id ? (
                            <Input
                              value={editForm.market_location}
                              onChange={(e) => setEditForm({ ...editForm, market_location: e.target.value })}
                              className="w-28"
                            />
                          ) : (
                            price.market_location || '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={price.source === 'Verdant Network' ? 'default' : 'secondary'}>
                            {price.source || 'Manual'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(price.last_updated).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {editingPrice === price.id ? (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => saveEdit(price.id)}
                                disabled={loading}
                                className="text-green-600 hover:text-green-700"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={cancelEdit}
                                className="text-gray-600 hover:text-gray-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEdit(price)}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deletePrice(price.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
              </>
            )}

            {view === "mbare-prices" && (
              <>
            {/* Add New Mbare Price */}
            <Card className="bg-yellow-50 border-yellow-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-900">
                  <MapPin className="h-5 w-5" />
                  Add Mbare Musika Price
                </CardTitle>
                <CardDescription>Add fresh produce prices for Mbare Musika market</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={addMbarePrice} className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <Label htmlFor="item">Item</Label>
                    <Input
                      id="item"
                      value={newMbarePrice.item}
                      onChange={(e) => setNewMbarePrice({ ...newMbarePrice, item: e.target.value })}
                      placeholder="e.g., Tomatoes"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      value={newMbarePrice.quantity}
                      onChange={(e) => setNewMbarePrice({ ...newMbarePrice, quantity: e.target.value })}
                      placeholder="e.g., kg"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="usd_price">USD Price</Label>
                    <Input
                      id="usd_price"
                      type="number"
                      step="0.01"
                      value={newMbarePrice.usd_price}
                      onChange={(e) => setNewMbarePrice({ ...newMbarePrice, usd_price: e.target.value })}
                      placeholder="2.50"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="zig_price">ZWL Price</Label>
                    <Input
                      id="zig_price"
                      type="number"
                      step="0.01"
                      value={newMbarePrice.zig_price}
                      onChange={(e) => setNewMbarePrice({ ...newMbarePrice, zig_price: e.target.value })}
                      placeholder="8000"
                      required
                    />
                  </div>
                  <div className="flex items-end">
                    <Button type="submit" disabled={loading} className="w-full bg-yellow-600 hover:bg-yellow-700">
                      {loading ? "Adding..." : "Add Item"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Mbare Prices Table */}
            <Card className="bg-yellow-50 border-yellow-200">
              <CardHeader>
                <CardTitle className="text-green-900">Mbare Musika Prices</CardTitle>
                <CardDescription>Fresh produce prices from Harare's largest market</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>USD Price</TableHead>
                      <TableHead>ZWL Price</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Captured At</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mbarePrices.map((price: any) => (
                      <TableRow key={price.id}>
                        <TableCell className="font-medium">
                          {editingMbare === price.id ? (
                            <Input
                              value={editMbareForm.item}
                              onChange={(e) => setEditMbareForm({ ...editMbareForm, item: e.target.value })}
                              className="w-24"
                            />
                          ) : (
                            price.item
                          )}
                        </TableCell>
                        <TableCell>
                          {editingMbare === price.id ? (
                            <Input
                              value={editMbareForm.quantity}
                              onChange={(e) => setEditMbareForm({ ...editMbareForm, quantity: e.target.value })}
                              className="w-20"
                            />
                          ) : (
                            price.quantity
                          )}
                        </TableCell>
                        <TableCell>
                          {editingMbare === price.id ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={editMbareForm.usd_price}
                              onChange={(e) => setEditMbareForm({ ...editMbareForm, usd_price: e.target.value })}
                              className="w-24"
                            />
                          ) : (
                            price.usd_price ? `$${price.usd_price.toFixed(2)}` : "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {editingMbare === price.id ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={editMbareForm.zig_price}
                              onChange={(e) => setEditMbareForm({ ...editMbareForm, zig_price: e.target.value })}
                              className="w-28"
                            />
                          ) : (
                            price.zig_price ? `ZWL ${price.zig_price.toLocaleString()}` : "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-yellow-200 text-yellow-800">
                            {price.source || 'Zyterra Network'}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(price.captured_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {editingMbare === price.id ? (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => saveEditMbare(price.id)}
                                disabled={loading}
                                className="text-green-600 hover:text-green-700"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={cancelEditMbare}
                                className="text-gray-600 hover:text-gray-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startEditMbare(price)}
                                className="text-blue-600 hover:text-blue-700"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteMbarePrice(price.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
              </>
            )}

            {view === "users" && (
              <>
            {/* Users Table */}
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage user accounts and admin privileges</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead>Admin</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{user.value_chain_stage}</TableCell>
                        <TableCell>{user.region || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={user.is_admin ? "default" : "secondary"}>
                            {user.is_admin ? "Admin" : "User"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleAdminStatus(user.id, user.is_admin)}
                          >
                            {user.is_admin ? "Remove Admin" : "Make Admin"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
