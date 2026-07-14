import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Users, MapPin, Sprout, TrendingUp, Satellite, FileText,
  CloudRain, AlertTriangle, CheckCircle2, Truck, Leaf,
  HeartHandshake, GraduationCap, Activity, Globe2, Wallet, ShieldCheck,
  Factory, Building2, Landmark,
} from "lucide-react";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip,
  BarChart, Bar, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Link } from "react-router-dom";
import OrgGISMap, { generateDemoPoints } from "./OrgGISMap";

interface Props {
  orgName: string;
  orgType: string;
  slug: string;
  primary: string;
  accent: string;
  isAuthed: boolean;
}

// Deterministic pseudo-random from slug so each demo org looks unique but stable.
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

type Profile = {
  label: string;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  bannerCopy: string;
  ctaCopy: string;
  kpiSet: "ngo" | "exporter" | "processor" | "government" | "cooperative";
  showSchemes: boolean;
  reportTitles: { t: string; d: string }[];
};

const getProfile = (orgType: string, orgName: string, farmerCount: number, hectares: number, compliance: number, seasonYield: string): Profile => {
  switch (orgType) {
    case "ngo":
      return {
        label: "NGO / Development partner",
        Icon: HeartHandshake,
        bannerCopy:
          "This is a live demo of how an NGO programme looks on VerdantOS — beneficiary tracking, training, climate-smart adoption, and funder-ready M&E.",
        ctaCopy: "Run your next donor-funded resilience programme on VerdantOS with full M&E, geolocation, and impact reporting built in.",
        kpiSet: "ngo",
        showSchemes: false,
        reportTitles: [
          { t: `${orgName} – Donor M&E report`, d: `${farmerCount} beneficiaries · gender & youth disaggregated · GPS-verified` },
          { t: "Climate-smart adoption log", d: "Conservation agriculture, drought-tolerant seed, agroforestry uptake" },
          { t: "Safeguarding & training register", d: "Attendance, signed consent, training topics, household reach" },
        ],
      };
    case "processor":
      return {
        label: "Processor / Off-taker",
        Icon: Factory,
        bannerCopy:
          "This is a live demo of how a processor uses VerdantOS to secure supply — contracted hectares, predicted volumes, quality forecasts, and grower compliance.",
        ctaCopy: "Lock in your raw-material supply with contracted-grower visibility, yield forecasts, and intake planning.",
        kpiSet: "processor",
        showSchemes: true,
        reportTitles: [
          { t: `${orgName} – Supply forecast`, d: `${hectares} ha contracted · ${seasonYield} t/ha forecast · weekly intake plan` },
          { t: "Grower compliance & quality log", d: "Input use, agrochem MRLs, harvest GRNs, quality grades" },
          { t: "Procurement & payments reconciliation", d: "Tonnes received vs paid · per-grower statements" },
        ],
      };
    case "government":
      return {
        label: "Government / Ministry",
        Icon: Landmark,
        bannerCopy:
          "This is a live demo of how a ministry monitors a national programme — district roll-out, input distribution, productivity, and policy KPIs.",
        ctaCopy: "Monitor your national programme in real time — district dashboards, input tracking, and parliamentary-ready reports.",
        kpiSet: "government",
        showSchemes: false,
        reportTitles: [
          { t: `${orgName} – National programme brief`, d: "Province × district roll-out, productivity, input ROI" },
          { t: "Input distribution & beneficiary register", d: "Vouchers issued, redeemed, GPS-verified deliveries" },
          { t: "Policy impact dashboard", d: "Yield, food security index, climate resilience scores" },
        ],
      };
    case "cooperative":
      return {
        label: "Cooperative / Union",
        Icon: Building2,
        bannerCopy:
          "This is a live demo of how a cooperative manages its members — shareholding, bulk inputs, aggregated produce, and member payouts.",
        ctaCopy: "Run your cooperative on VerdantOS — member records, bulk procurement, aggregation, and transparent payouts.",
        kpiSet: "cooperative",
        showSchemes: true,
        reportTitles: [
          { t: `${orgName} – Member statement run`, d: `${farmerCount} members · tonnes delivered · payouts due` },
          { t: "Bulk input procurement log", d: "Fertiliser, seed, chems · per-member allocation" },
          { t: "AGM pack", d: "Performance, financials, productivity by ward" },
        ],
      };
    case "exporter":
    default:
      return {
        label: "Exporter / Outgrower scheme",
        Icon: Globe2,
        bannerCopy:
          "This is a live demo of how an exporter runs an outgrower scheme on VerdantOS — contracted volumes, traceability, GlobalGAP-ready records, and export logistics.",
        ctaCopy: "Pilot your real outgrower scheme on VerdantOS — branded portal, traceability, and export-grade reporting in under a week.",
        kpiSet: "exporter",
        showSchemes: true,
        reportTitles: [
          { t: `${orgName} – Season summary`, d: `${farmerCount} growers · ${hectares} ha · ${compliance}% compliance` },
          { t: "Traceability & GlobalGAP log", d: "Per-farm GPS, planting, inputs, harvest GRNs, MRL tests" },
          { t: "Export volume forecast", d: "Weekly pack-house intake projections by commodity" },
        ],
      };
  }
};

const OrgDemoDashboard: React.FC<Props> = ({ orgName, orgType, slug, primary, accent, isAuthed }) => {
  const h = hash(slug);
  const farmerCount = 380 + (h % 220);
  const hectares = 1200 + (h % 800);
  const activeSchemes = 3 + (h % 3);
  const avgNdvi = (0.58 + ((h % 18) / 100)).toFixed(2);
  const seasonYield = (3.4 + ((h % 14) / 10)).toFixed(1);
  const complianceRate = 82 + (h % 14);

  const profile = getProfile(orgType, orgName, farmerCount, hectares, complianceRate, seasonYield);

  const commodityFocus = useMemo(() => {
    const pool = orgType === "ngo"
      ? ["Maize", "Sorghum", "Groundnuts", "Cowpea", "Sunflower"]
      : orgType === "processor"
      ? ["Soya", "Wheat", "Maize", "Sunflower"]
      : orgType === "government"
      ? ["Maize", "Wheat", "Soya", "Cotton", "Tobacco"]
      : orgType === "cooperative"
      ? ["Maize", "Soya", "Groundnuts", "Sunflower"]
      : ["Macadamia", "Avocado", "Blueberries", "Chillies", "Paprika"];
    return pool.slice(0, 3 + (h % 2));
  }, [orgType, h]);

  const schemes = useMemo(() => {
    const seasons = ["2025/26", "2026", "2026 Winter"];
    return commodityFocus.map((crop, i) => {
      const target = 120 + ((h >> (i + 1)) % 180);
      const enrolled = Math.round(target * (0.55 + (((h >> i) % 40) / 100)));
      return {
        id: `${slug}-${i}`,
        name: orgType === "cooperative" ? `${crop} Member Pool` : `${crop} ${orgType === "processor" ? "Contract" : "Outgrower"} Programme`,
        season: seasons[i % seasons.length],
        commodity: crop,
        target,
        enrolled,
        status: i === 0 ? "active" : i === commodityFocus.length - 1 ? "recruiting" : "active",
      };
    });
  }, [commodityFocus, slug, h, orgType]);

  const farmers = useMemo(() => {
    const names = [
      "Tendai Moyo", "Chipo Sibanda", "Farai Ncube", "Rumbidzai Dube", "Tatenda Mhlanga",
      "Nyasha Ndlovu", "Blessing Chigumba", "Memory Hove", "Tonderai Mpofu", "Privilege Banda",
    ];
    const wards = ["Bindura Ward 7", "Mhondoro Ward 12", "Mutoko Ward 3", "Chipinge Ward 18", "Gokwe Ward 9", "Mberengwa Ward 4"];
    return names.slice(0, 8).map((n, i) => ({
      name: n,
      ward: wards[(h + i) % wards.length],
      crop: commodityFocus[i % commodityFocus.length],
      ha: (0.4 + ((h + i * 7) % 32) / 10).toFixed(1),
      ndvi: (0.45 + ((h + i * 11) % 35) / 100).toFixed(2),
      status: i % 5 === 0 ? "Needs attention" : i % 3 === 0 ? "Top dressing due" : "On track",
    }));
  }, [commodityFocus, h]);

  const ndviSeries = useMemo(() => {
    const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
    return months.map((m, i) => ({
      month: m,
      ndvi: +(0.35 + Math.sin((i + (h % 5)) / 1.6) * 0.18 + i * 0.02).toFixed(2),
      rainfall: 40 + ((h + i * 13) % 90),
    }));
  }, [h]);

  const yieldByCrop = useMemo(() => commodityFocus.map((c, i) => ({
    crop: c,
    predicted: +(2.2 + ((h + i * 9) % 22) / 10).toFixed(1),
    actual: +(1.9 + ((h + i * 5) % 18) / 10).toFixed(1),
  })), [commodityFocus, h]);

  // NGO-specific data
  const beneficiaryBreakdown = useMemo(() => ([
    { name: "Women", value: 38 + (h % 12) },
    { name: "Men", value: 28 + (h % 10) },
    { name: "Youth (18-35)", value: 22 + (h % 10) },
    { name: "PWD", value: 4 + (h % 4) },
  ]), [h]);

  const adoptionSeries = useMemo(() => {
    const months = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    return months.map((m, i) => ({
      month: m,
      "Conservation Ag": 20 + i * 6 + (h % 8),
      "Drought-tolerant seed": 15 + i * 5 + (h % 6),
      "Agroforestry": 8 + i * 3 + (h % 4),
    }));
  }, [h]);

  const trainingSessions = useMemo(() => ([
    { topic: "Conservation Agriculture basics", ward: "Mutoko Ward 3", attendees: 42, date: "12 May" },
    { topic: "Pfumvudza/Intwasa land prep", ward: "Bindura Ward 7", attendees: 58, date: "08 May" },
    { topic: "Climate-smart seed selection", ward: "Gokwe Ward 9", attendees: 36, date: "02 May" },
    { topic: "Post-harvest handling & storage", ward: "Mberengwa Ward 4", attendees: 47, date: "28 Apr" },
    { topic: "Gender & nutrition-sensitive farming", ward: "Chipinge Ward 18", attendees: 51, date: "21 Apr" },
  ]), []);

  const alerts = orgType === "ngo"
    ? [
        { icon: HeartHandshake, label: `${Math.round(farmerCount * 0.18)} beneficiaries need follow-up visits this week`, color: "text-orange-600" },
        { icon: CloudRain, label: "Dry spell forecast – activate drought response protocol in 3 wards", color: "text-blue-600" },
        { icon: GraduationCap, label: "4 training sessions scheduled in the next 7 days", color: "text-purple-600" },
        { icon: CheckCircle2, label: `Conservation Ag adopted by ${Math.round(farmerCount * 0.62)} households`, color: "text-green-600" },
      ]
    : orgType === "government"
    ? [
        { icon: ShieldCheck, label: `${Math.round(farmerCount * 0.74)} input vouchers redeemed (verified)`, color: "text-green-600" },
        { icon: AlertTriangle, label: "3 districts flagged for under-performance vs targets", color: "text-orange-600" },
        { icon: Satellite, label: "NDVI decline in 2 provinces – ground-truth dispatched", color: "text-red-600" },
        { icon: TrendingUp, label: "National forecast revised +6% vs last bulletin", color: "text-blue-600" },
      ]
    : [
        { icon: AlertTriangle, label: "Fall Armyworm risk – 12 fields in Bindura", color: "text-orange-600" },
        { icon: CloudRain, label: "Dry spell forecast – 18 farms, next 10 days", color: "text-blue-600" },
        { icon: Satellite, label: "NDVI drop >15% – 5 fields flagged this week", color: "text-red-600" },
        { icon: CheckCircle2, label: `Top-dressing completed – ${Math.round(farmerCount * 0.42)} farmers`, color: "text-green-600" },
      ];

  const recentActivity = orgType === "ngo"
    ? [
        { who: "M. Chikomba (Field Officer)", what: "Logged Pfumvudza training session – 42 attendees", when: "12 min ago" },
        { who: "T. Moyo", what: "Beneficiary survey submitted – household food security score 7/10", when: "1 hr ago" },
        { who: "Field Officer", what: "Distributed 50kg drought-tolerant seed packs in Mutoko", when: "3 hrs ago" },
        { who: "M&E Lead", what: "Generated mid-term donor report draft", when: "Yesterday" },
      ]
    : [
        { who: "M. Chikomba", what: "Submitted planting record for 1.2 ha maize", when: "12 min ago" },
        { who: "T. Moyo", what: "Uploaded leaf photo – diagnosed as nitrogen deficiency", when: "1 hr ago" },
        { who: "Field Officer", what: "Approved 8 new enrollments in Chipinge ward", when: "3 hrs ago" },
        { who: "Logistics", what: "Collection request raised: 14 tonnes maize, Bindura depot", when: "Yesterday" },
      ];

  const accentBg = { backgroundColor: `${primary}10`, borderColor: `${primary}30` };
  const primaryStyle = { color: primary } as React.CSSProperties;

  const pieColors = [primary, accent, `${primary}88`, `${accent}88`];

  // NGO-specific KPI tiles
  const ngoKpis = [
    { icon: HeartHandshake, label: "Beneficiaries reached", value: farmerCount.toLocaleString() },
    { icon: Users, label: "% women & youth", value: `${beneficiaryBreakdown[0].value + beneficiaryBreakdown[2].value}%` },
    { icon: GraduationCap, label: "Training sessions (YTD)", value: 24 + (h % 18) },
    { icon: Activity, label: "Climate-smart adoption", value: `${52 + (h % 18)}%` },
    { icon: Wallet, label: "Donor funds deployed", value: `$${(120 + (h % 80))}k` },
  ];

  const governmentKpis = [
    { icon: Users, label: "Registered farmers", value: (farmerCount * 12).toLocaleString() },
    { icon: MapPin, label: "Districts covered", value: 18 + (h % 12) },
    { icon: ShieldCheck, label: "Vouchers redeemed", value: `${Math.round(complianceRate * 0.9)}%` },
    { icon: TrendingUp, label: "Avg yield (t/ha)", value: seasonYield },
    { icon: Wallet, label: "Programme spend", value: `$${(2 + (h % 6))}.${(h % 9)}M` },
  ];

  const cooperativeKpis = [
    { icon: Users, label: "Active members", value: farmerCount.toLocaleString() },
    { icon: MapPin, label: "Hectares pooled", value: hectares.toLocaleString() },
    { icon: Truck, label: "Tonnes aggregated", value: `${Math.round(hectares * +seasonYield).toLocaleString()}t` },
    { icon: Wallet, label: "Member payouts (YTD)", value: `$${(180 + (h % 220))}k` },
    { icon: TrendingUp, label: "Avg yield (t/ha)", value: seasonYield },
  ];

  const defaultKpis = [
    { icon: Users, label: orgType === "processor" ? "Contracted growers" : "Enrolled farmers", value: farmerCount.toLocaleString() },
    { icon: MapPin, label: "Hectares monitored", value: hectares.toLocaleString() },
    { icon: Sprout, label: "Active schemes", value: activeSchemes },
    { icon: Satellite, label: "Avg field NDVI", value: avgNdvi },
    { icon: TrendingUp, label: "Forecast yield (t/ha)", value: seasonYield },
  ];

  const kpis = profile.kpiSet === "ngo" ? ngoKpis
    : profile.kpiSet === "government" ? governmentKpis
    : profile.kpiSet === "cooperative" ? cooperativeKpis
    : defaultKpis;

  return (
    <div className="space-y-6">
      {/* Demo banner */}
      <div className="rounded-lg border px-4 py-3 flex items-start gap-3" style={accentBg}>
        <profile.Icon className="h-5 w-5 mt-0.5" style={primaryStyle} />
        <div className="flex-1 text-sm">
          <div className="font-semibold" style={primaryStyle}>
            {orgName} · {profile.label} demo
          </div>
          <p className="text-muted-foreground">{profile.bannerCopy}</p>
        </div>
        {!isAuthed && (
          <Button asChild size="sm" style={{ background: primary }}>
            <Link to="/auth">Start your pilot</Link>
          </Button>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {kpis.map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <Icon className="h-5 w-5 mb-2" style={primaryStyle} />
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* NGO-specific: beneficiaries + adoption */}
      {orgType === "ngo" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Beneficiary breakdown</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={beneficiaryBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} label>
                    {beneficiaryBreakdown.map((_, i) => (
                      <Cell key={i} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Climate-smart practice adoption (%)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={adoptionSeries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Conservation Ag" stroke={primary} strokeWidth={2} />
                  <Line type="monotone" dataKey="Drought-tolerant seed" stroke={accent} strokeWidth={2} />
                  <Line type="monotone" dataKey="Agroforestry" stroke={`${primary}88`} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts row — shared NDVI; yield only for non-NGO */}
      <div className={`grid gap-4 ${orgType === "ngo" ? "lg:grid-cols-1" : "lg:grid-cols-2"}`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Satellite className="h-4 w-4" /> {orgType === "ngo" ? "Programme area NDVI & rainfall (resilience signal)" : "Programme-wide NDVI & rainfall"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={ndviSeries}>
                <defs>
                  <linearGradient id={`ndvi-${slug}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={primary} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={primary} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis yAxisId="left" domain={[0, 1]} fontSize={12} />
                <YAxis yAxisId="right" orientation="right" fontSize={12} />
                <Tooltip />
                <Area yAxisId="left" type="monotone" dataKey="ndvi" stroke={primary} fill={`url(#ndvi-${slug})`} />
                <Line yAxisId="right" type="monotone" dataKey="rainfall" stroke={accent} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {orgType !== "ngo" && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Yield: predicted vs actual (t/ha)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={yieldByCrop}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="crop" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="predicted" fill={primary} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" fill={accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Demo GIS map */}
      <OrgGISMap
        title={`${orgType === "ngo" ? "Beneficiary" : orgType === "cooperative" ? "Member" : "Farmer"} field GIS (demo)`}
        primary={primary}
        demo
        points={generateDemoPoints(slug, Math.min(40, Math.max(18, Math.round(farmerCount / 12))), commodityFocus)}
      />


      {/* Schemes (skip for NGO & government) */}
      {profile.showSchemes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> {orgType === "cooperative" ? "Member pools" : orgType === "processor" ? "Active contracts" : "Active schemes"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {schemes.map((s) => {
              const pct = Math.min(100, Math.round((s.enrolled / s.target) * 100));
              return (
                <div key={s.id} className="border rounded p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">Season {s.season} · {s.commodity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{s.status}</Badge>
                      <span className="text-sm font-medium">{s.enrolled}/{s.target} {orgType === "cooperative" ? "members" : orgType === "processor" ? "growers" : "farmers"}</span>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* NGO training register */}
      {orgType === "ngo" && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4" /> Recent training sessions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead className="text-right">Attendees</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trainingSessions.map((t) => (
                  <TableRow key={t.topic}>
                    <TableCell className="font-medium">{t.topic}</TableCell>
                    <TableCell className="text-muted-foreground">{t.ward}</TableCell>
                    <TableCell className="text-right">{t.attendees}</TableCell>
                    <TableCell>{t.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Farmer roster + alerts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Leaf className="h-4 w-4" /> {orgType === "ngo" ? "Beneficiary households (sample)" : orgType === "cooperative" ? "Member roster (sample)" : "Farmer roster (sample)"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{orgType === "ngo" ? "Household head" : "Farmer"}</TableHead>
                  <TableHead>Ward</TableHead>
                  <TableHead>Crop</TableHead>
                  <TableHead className="text-right">Ha</TableHead>
                  <TableHead className="text-right">NDVI</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {farmers.map((f) => (
                  <TableRow key={f.name}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-muted-foreground">{f.ward}</TableCell>
                    <TableCell>{f.crop}</TableCell>
                    <TableCell className="text-right">{f.ha}</TableCell>
                    <TableCell className="text-right">{f.ndvi}</TableCell>
                    <TableCell>
                      <Badge variant={f.status === "On track" ? "secondary" : "outline"} className="text-xs">
                        {f.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {orgType === "ngo" ? "Programme alerts" : "Field alerts"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm border-l-2 pl-3 py-1" style={{ borderColor: primary }}>
                <a.icon className={`h-4 w-4 mt-0.5 ${a.color}`} />
                <span>{a.label}</span>
              </div>
            ))}
            <div className="pt-2 text-xs text-muted-foreground">
              Powered by Mudhumeni Hungwe (AI Agronomist) and satellite intelligence
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity + reports */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Recent activity</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {recentActivity.map((a, i) => (
                <li key={i} className="flex justify-between gap-4 border-b last:border-0 pb-2 last:pb-0">
                  <div>
                    <div className="font-medium">{a.who}</div>
                    <div className="text-muted-foreground text-xs">{a.what}</div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{a.when}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Sample reports</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {profile.reportTitles.map((r) => (
              <div key={r.t} className="border rounded p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{r.t}</div>
                  <div className="text-xs text-muted-foreground">{r.d}</div>
                </div>
                <Badge variant="outline">PDF · CSV</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <Card className="text-center" style={accentBg}>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-2" style={primaryStyle}>Ready to run your real programme on VerdantOS?</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl mx-auto">{profile.ctaCopy}</p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button asChild style={{ background: primary }}>
              <Link to={isAuthed ? "/dashboard" : "/auth"}>{isAuthed ? "Go to my dashboard" : "Sign up to start"}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/discovery">Talk to our team</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrgDemoDashboard;
