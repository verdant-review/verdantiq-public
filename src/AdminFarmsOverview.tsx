import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Wheat, Calendar, TrendingUp, Users } from "lucide-react";
import { format } from "date-fns";

interface Farm {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  profiles: {
    full_name: string;
    email: string;
    region: string;
  } | null;
}

interface CropCycle {
  id: string;
  crop_type: string;
  area_hectares: number;
  status: string;
  planting_date: string;
  estimated_harvest_date: string;
  predicted_yield_tonnes: number;
  actual_yield_tonnes: number;
  farms: {
    name: string;
    profiles: {
      full_name: string;
      email: string;
    } | null;
  } | null;
}

const AdminFarmsOverview = () => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch farms data by joining with profiles
        const { data: farmsWithProfiles, error: farmsError } = await supabase
          .from('farms')
          .select('*')
          .order('created_at', { ascending: false });

        if (farmsError) throw farmsError;

        // Fetch profiles for the farms
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*');

        if (profilesError) throw profilesError;

        // Combine farms with their corresponding profiles
        const farmsData = farmsWithProfiles?.map(farm => ({
          ...farm,
          profiles: profilesData?.find(profile => profile.id === farm.user_id) || null
        })) || [];

        // Fetch crop cycles with farms
        const { data: cyclesWithFarms, error: cyclesError } = await supabase
          .from('crop_cycles')
          .select('*')
          .order('planting_date', { ascending: false });

        if (cyclesError) throw cyclesError;

        // Combine crop cycles with farm and profile data
        const cyclesData = cyclesWithFarms?.map(cycle => {
          const farm = farmsWithProfiles?.find(f => f.id === cycle.farm_id);
          const profile = profilesData?.find(p => p.id === farm?.user_id);
          return {
            ...cycle,
            farms: farm ? {
              name: farm.name,
              profiles: profile || null
            } : null
          };
        }) || [];

        setFarms(farmsData as Farm[]);
        setCropCycles(cyclesData as CropCycle[]);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Planning': return 'bg-blue-100 text-blue-800';
      case 'Planted': return 'bg-green-100 text-green-800';
      case 'Growing': return 'bg-yellow-100 text-yellow-800';
      case 'Harvested': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const totalFarms = farms.length;
  const activeCycles = cropCycles.filter(cycle => cycle.status !== 'Harvested').length;
  const totalArea = cropCycles.reduce((sum, cycle) => sum + (cycle.area_hectares || 0), 0);
  const totalPredictedYield = cropCycles.reduce((sum, cycle) => sum + (cycle.predicted_yield_tonnes || 0), 0);

  if (isLoading) {
    return <div className="p-6 text-center">Loading farms data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Farms</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFarms}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Cycles</CardTitle>
            <Wheat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCycles}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Area</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalArea.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">hectares</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Predicted Yield</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPredictedYield.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">tonnes</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed views */}
      <Tabs defaultValue="farms" className="space-y-4">
        <TabsList>
          <TabsTrigger value="farms">Registered Farms</TabsTrigger>
          <TabsTrigger value="cycles">Crop Cycles</TabsTrigger>
        </TabsList>

        <TabsContent value="farms">
          <Card>
            <CardHeader>
              <CardTitle>Registered Farms</CardTitle>
              <CardDescription>
                All farms registered on the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farm Name</TableHead>
                    <TableHead>Farmer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Registered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {farms.map((farm) => (
                    <TableRow key={farm.id}>
                      <TableCell className="font-medium">{farm.name}</TableCell>
                      <TableCell>{farm.profiles?.full_name || 'N/A'}</TableCell>
                      <TableCell>{farm.profiles?.email || 'N/A'}</TableCell>
                      <TableCell>{farm.profiles?.region || 'N/A'}</TableCell>
                      <TableCell>{format(new Date(farm.created_at), 'MMM d, yyyy')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cycles">
          <Card>
            <CardHeader>
              <CardTitle>Crop Cycles</CardTitle>
              <CardDescription>
                All crop cycles across registered farms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Farm</TableHead>
                    <TableHead>Farmer</TableHead>
                    <TableHead>Crop</TableHead>
                    <TableHead>Area (ha)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Planting Date</TableHead>
                    <TableHead>Est. Harvest</TableHead>
                    <TableHead>Predicted Yield</TableHead>
                    <TableHead>Actual Yield</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cropCycles.map((cycle) => (
                    <TableRow key={cycle.id}>
                      <TableCell className="font-medium">{cycle.farms?.name}</TableCell>
                      <TableCell>{cycle.farms?.profiles?.full_name}</TableCell>
                      <TableCell>{cycle.crop_type}</TableCell>
                      <TableCell>{cycle.area_hectares}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(cycle.status)}>
                          {cycle.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cycle.planting_date ? format(new Date(cycle.planting_date), 'MMM d, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {cycle.estimated_harvest_date ? format(new Date(cycle.estimated_harvest_date), 'MMM d, yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell>{cycle.predicted_yield_tonnes?.toFixed(1) || 'N/A'} tonnes</TableCell>
                      <TableCell>{cycle.actual_yield_tonnes?.toFixed(1) || 'N/A'} tonnes</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminFarmsOverview;