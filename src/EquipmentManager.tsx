import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tractor, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Equipment {
  id: string;
  name: string;
  type: string;
  model?: string;
  purchase_date?: string;
  status: string;
  farm_id: string;
  category?: string;
  power_source?: string;
  horsepower?: number;
  ownership?: string;
  condition?: string;
  is_operational?: boolean;
  acquisition_cost_usd?: number;
}

interface EquipmentManagerProps {
  farmId: string;
}

const CATEGORIES = ["tractor","plough","planter","harvester","irrigation_pump","sprayer","thresher","mill","vehicle","hand_tool","other"];
const POWER_SOURCES = ["manual","animal","fuel","electric","solar"];
const OWNERSHIPS = ["owned","leased","shared","hired"];
const CONDITIONS = ["new","good","fair","poor","broken"];

const EquipmentManager: React.FC<EquipmentManagerProps> = ({ farmId }) => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    model: '',
    purchase_date: '',
    status: 'active',
    category: '',
    power_source: 'manual',
    horsepower: '',
    inferHp: true,
    ownership: 'owned',
    condition: 'good',
    is_operational: true,
    acquisition_cost_usd: '',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (farmId) fetchEquipment();
  }, [farmId]);

  const fetchEquipment = async () => {
    const { data, error } = await (supabase as any)
      .from('equipment')
      .select('*')
      .eq('farm_id', farmId)
      .order('created_at', { ascending: false });
    if (!error) setEquipment(data || []);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.type) {
      toast({ title: "Error", description: "Name and type are required", variant: "destructive" });
      return;
    }
    setLoading(true);

    let hp: number | null = null;
    if (!formData.inferHp && formData.horsepower) {
      hp = Number(formData.horsepower);
    } else {
      // Use DB inference
      const { data } = await (supabase as any).rpc('infer_default_horsepower', {
        _category: formData.category || 'other',
        _power: formData.power_source,
      });
      hp = data ?? null;
    }

    const payload: any = {
      name: formData.name,
      type: formData.type,
      model: formData.model || null,
      purchase_date: formData.purchase_date || null,
      status: formData.status,
      category: formData.category || null,
      power_source: formData.power_source,
      horsepower: hp,
      ownership: formData.ownership,
      condition: formData.condition,
      is_operational: formData.is_operational,
      acquisition_cost_usd: formData.acquisition_cost_usd ? Number(formData.acquisition_cost_usd) : null,
      farm_id: farmId,
    };

    const { error } = editingEquipment
      ? await (supabase as any).from('equipment').update(payload).eq('id', editingEquipment.id)
      : await (supabase as any).from('equipment').insert([payload]);

    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: `Equipment ${editingEquipment ? 'updated' : 'added'}` });
    resetForm();
    fetchEquipment();
  };

  const handleEdit = (item: Equipment) => {
    setEditingEquipment(item);
    setFormData({
      name: item.name,
      type: item.type,
      model: item.model || '',
      purchase_date: item.purchase_date || '',
      status: item.status,
      category: item.category || '',
      power_source: item.power_source || 'manual',
      horsepower: item.horsepower ? String(item.horsepower) : '',
      inferHp: !item.horsepower,
      ownership: item.ownership || 'owned',
      condition: item.condition || 'good',
      is_operational: item.is_operational ?? true,
      acquisition_cost_usd: item.acquisition_cost_usd ? String(item.acquisition_cost_usd) : '',
    });
    setIsOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this equipment?')) return;
    await (supabase as any).from('equipment').delete().eq('id', id);
    fetchEquipment();
  };

  const resetForm = () => {
    setFormData({
      name: '', type: '', model: '', purchase_date: '', status: 'active',
      category: '', power_source: 'manual', horsepower: '', inferHp: true,
      ownership: 'owned', condition: 'good', is_operational: true, acquisition_cost_usd: '',
    });
    setEditingEquipment(null);
    setIsOpen(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'retired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Tractor className="h-5 w-5" />
            Equipment ({equipment.length})
          </CardTitle>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditingEquipment(null)}>
                <Plus className="h-4 w-4 mr-2" /> Add Equipment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingEquipment ? 'Edit Equipment' : 'Add New Equipment'}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Equipment Name *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., John Deere Tractor" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type *</Label>
                    <Input value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} placeholder="e.g., Tractor" />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c.replace('_',' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Power source</Label>
                    <Select value={formData.power_source} onValueChange={(v) => setFormData({ ...formData, power_source: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{POWER_SOURCES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ownership</Label>
                    <Select value={formData.ownership} onValueChange={(v) => setFormData({ ...formData, ownership: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{OWNERSHIPS.map(o => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label>Horsepower</Label>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">I don't know</span>
                      <Switch checked={formData.inferHp} onCheckedChange={(v) => setFormData({ ...formData, inferHp: v })} />
                    </div>
                  </div>
                  {!formData.inferHp ? (
                    <Input type="number" value={formData.horsepower} onChange={(e) => setFormData({ ...formData, horsepower: e.target.value })} placeholder="e.g., 60" />
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">We'll estimate it from the category and power source.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Condition</Label>
                    <Select value={formData.condition} onValueChange={(v) => setFormData({ ...formData, condition: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Switch checked={formData.is_operational} onCheckedChange={(v) => setFormData({ ...formData, is_operational: v })} />
                    <Label>Operational</Label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Model</Label>
                    <Input value={formData.model} onChange={(e) => setFormData({ ...formData, model: e.target.value })} />
                  </div>
                  <div>
                    <Label>Purchase Date</Label>
                    <Input type="date" value={formData.purchase_date} onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })} />
                  </div>
                </div>

                <div>
                  <Label>Acquisition cost (USD, optional)</Label>
                  <Input type="number" value={formData.acquisition_cost_usd} onChange={(e) => setFormData({ ...formData, acquisition_cost_usd: e.target.value })} />
                </div>

                <div>
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="maintenance">Under Maintenance</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
                <Button onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {equipment.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No equipment registered yet</p>
        ) : (
          <div className="space-y-3">
            {equipment.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h4 className="font-medium">{item.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {item.category || item.type}{item.model && ` • ${item.model}`}
                    {item.power_source && ` • ${item.power_source}`}
                    {item.horsepower ? ` • ${item.horsepower} HP` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!item.is_operational && <Badge variant="destructive">Down</Badge>}
                  <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => handleDelete(item.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EquipmentManager;
