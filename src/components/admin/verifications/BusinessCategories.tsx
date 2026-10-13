import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/contexts/ConfirmContext';
import { supabase } from '@/integrations/supabase/client';
import { errorMessage } from '@/lib/address';
import { cn } from '@/lib/utils';

// The business categories vendors choose from at onboarding, and the product
// categories each one offers when a vendor adds a product. A business category
// always has at least one product category.
const BusinessCategories = () => {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [products, setProducts] = useState<string[]>([]);
  const [productDraft, setProductDraft] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-business-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_categories')
        .select('*, product_categories(id, name, is_active, sort_order)')
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string; name: string; is_active: boolean;
        product_categories: { id: string; name: string; is_active: boolean; sort_order: number }[];
      }[];
    },
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-business-categories'] });
    queryClient.invalidateQueries({ queryKey: ['business-categories'] });
    queryClient.invalidateQueries({ queryKey: ['product-categories'] });
  };

  const addDraftProduct = () => {
    const v = productDraft.trim();
    if (v && !products.some((p) => p.toLowerCase() === v.toLowerCase())) setProducts([...products, v]);
    setProductDraft('');
  };

  const add = async () => {
    if (!(await confirm({
      title: `Are you sure you want to add “${name.trim()}”?`,
      description: `Vendors can pick it when they set up their store. Its product categories: ${products.join(', ')}.`,
      confirmLabel: 'Yes, add it',
    }))) return;
    const { error } = await supabase.rpc('admin_create_business_category', { p_name: name.trim(), p_product_categories: products });
    if (error) return toast.error(errorMessage(error, 'Could not add the category'));
    setName('');
    setProducts([]);
    refresh();
  };

  const toggle = async (id: string, label: string, isActive: boolean) => {
    if (!(await confirm({
      title: `Are you sure you want to ${isActive ? 'show' : 'hide'} “${label}”?`,
      description: isActive ? 'Vendors can pick it again.' : 'New vendors can’t pick it. Stores already in it keep it.',
      confirmLabel: isActive ? 'Yes, show it' : 'Yes, hide it',
      destructive: !isActive,
    }))) return;
    const { error } = await supabase.from('business_categories').update({ is_active: isActive }).eq('id', id);
    if (error) return toast.error(errorMessage(error, 'Could not update the category'));
    refresh();
  };

  const addProduct = async (businessId: string, businessName: string) => {
    const v = newProduct.trim();
    if (!v) return;
    if (!(await confirm({ title: `Are you sure you want to add “${v}” to ${businessName}?`, confirmLabel: 'Yes, add it' }))) return;
    const { error } = await supabase.from('product_categories').insert({ business_category_id: businessId, name: v, sort_order: 999 });
    if (error) return toast.error(errorMessage(error, error.code === '23505' ? 'That product category already exists' : 'Could not add it'));
    setNewProduct('');
    refresh();
  };

  const removeProduct = async (id: string, label: string) => {
    if (!(await confirm({
      title: `Are you sure you want to remove “${label}”?`,
      description: 'Vendors can no longer choose it for new products. Products already using it keep it.',
      confirmLabel: 'Yes, remove it',
      destructive: true,
    }))) return;
    const { error } = await supabase.from('product_categories').delete().eq('id', id);
    if (error) return toast.error(errorMessage(error, 'Could not remove it'));
    refresh();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Add a business category</p>
        <div className="space-y-1.5">
          <Label htmlFor="bc-name">Name</Label>
          <Input id="bc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pharmacy" maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bc-product">Product categories (at least one)</Label>
          <div className="flex gap-2">
            <Input
              id="bc-product"
              value={productDraft}
              onChange={(e) => setProductDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraftProduct(); } }}
              placeholder="e.g. Medicines, then press Enter"
              maxLength={60}
            />
            <Button type="button" variant="outline" onClick={addDraftProduct} disabled={!productDraft.trim()}>Add</Button>
          </div>
          {products.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {products.map((p) => (
                <Badge key={p} variant="secondary" className="gap-1 pr-1">
                  {p}
                  <button type="button" aria-label={`Remove ${p}`} onClick={() => setProducts(products.filter((x) => x !== p))} className="rounded-full p-0.5 hover:bg-background">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Button onClick={add} disabled={!name.trim() || products.length === 0}>
          <Plus className="mr-1 h-4 w-4" /> Add business category
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {categories.map((c) => {
          const items = [...c.product_categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
          const expanded = open === c.id;
          return (
            <li key={c.id}>
              <div className="flex items-center justify-between gap-3 p-3">
                <button type="button" onClick={() => { setOpen(expanded ? null : c.id); setNewProduct(''); }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                  <span className={cn('truncate font-medium', !c.is_active && 'text-muted-foreground line-through')}>{c.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{items.length} product {items.length === 1 ? 'category' : 'categories'}</span>
                </button>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  Offered
                  <Switch checked={c.is_active} onCheckedChange={(v) => toggle(c.id, c.name, v)} />
                </label>
              </div>
              {expanded && (
                <div className="space-y-3 border-t bg-muted/30 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((p) => (
                      <Badge key={p.id} variant="outline" className="gap-1 bg-background pr-1">
                        {p.name}
                        <button
                          type="button"
                          aria-label={`Remove ${p.name}`}
                          disabled={items.length <= 1}
                          title={items.length <= 1 ? 'A business category needs at least one product category' : undefined}
                          onClick={() => removeProduct(p.id, p.name)}
                          className="rounded-full p-0.5 hover:bg-muted disabled:opacity-30"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newProduct}
                      onChange={(e) => setNewProduct(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addProduct(c.id, c.name); } }}
                      placeholder={`New product category for ${c.name}`}
                      maxLength={60}
                    />
                    <Button variant="outline" onClick={() => addProduct(c.id, c.name)} disabled={!newProduct.trim()}>Add</Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Turning a business category off hides it from new sign-ups; vendors already in it keep it. Vendors choose a
        product category from their business category's list when they add a product.
      </p>
    </div>
  );
};

export default BusinessCategories;
