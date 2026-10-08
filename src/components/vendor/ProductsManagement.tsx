import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Package, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff,
  Search
} from 'lucide-react';
import { useVendorProducts, type VendorProduct } from '@/hooks/useVendorProducts';
import { Switch } from '@/components/ui/switch';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '@/contexts/ConfirmContext';
import PagedList from '@/components/ui/paged-list';

const ProductsManagement = () => {
  const confirm = useConfirm();
  const { products, loading, toggleProductStatus, deleteProduct } = useVendorProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300', icon: Eye, label: 'Available' },
      inactive: { color: 'bg-muted text-foreground', icon: EyeOff, label: 'Unavailable' },
      out_of_stock: { color: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300', icon: Package, label: 'Out of stock' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active;
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} text-xs whitespace-nowrap border-transparent`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const handleStatusToggle = async (productId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    await toggleProductStatus(productId, newStatus as 'active' | 'inactive' | 'out_of_stock');
  };

  const handleDelete = async (productId: string) => {
    const ok = await confirm({
      title: 'Are you sure you want to delete this product?',
      description: 'Customers will no longer see it. This can’t be undone.',
      confirmLabel: 'Yes, delete',
      destructive: true,
    });
    if (ok) await deleteProduct(productId);
  };

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-3">
          <div className="animate-pulse space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const ProductActions = ({ product }: { product: VendorProduct }) => (
    <div className="flex items-center gap-2">
      {/* Products without stock tracking are switched available / unavailable here;
          stock-tracked ones follow their stock (edit to restock) */}
      {!product.track_stock && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch
            checked={product.status === 'active'}
            onCheckedChange={() => handleStatusToggle(product.id, product.status)}
            aria-label={`${product.name} available`}
          />
          <span className="hidden sm:inline">Available</span>
        </label>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate(`/vendor/edit-product/${product.id}`)}
        className="text-xs h-8"
        aria-label={`Edit ${product.name}`}
      >
        <Edit className="h-3 w-3" />
        <span className="ml-1 hidden sm:inline">{product.track_stock ? 'Edit / restock' : 'Edit'}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleDelete(product.id)}
        className="text-xs h-8 text-red-600 hover:text-red-700"
        aria-label={`Delete ${product.name}`}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 p-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <CardTitle className="flex items-center text-base">
            <Package className="h-4 w-4 mr-2" />
            Products Management
          </CardTitle>
          <Button 
            onClick={() => navigate('/vendor/add-product')}
            size="sm"
            className="w-full sm:w-auto text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Product
          </Button>
        </div>
        <div className="relative w-full">
          <Search className="h-3 w-3 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-6 px-3 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">No products found</p>
            <p className="text-xs">
              {searchTerm ? 'Try adjusting your search' : 'Add your first product to get started'}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            <PagedList items={filteredProducts} getKey={(product) => product.id} resetKey={searchTerm} paginationClassName="px-3 pb-3" render={(product) => (
              <div
                className="flex items-start justify-between p-3 hover:bg-muted/60"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm">{product.name}</h3>
                    {getStatusBadge(product.status)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p className="line-clamp-1">{product.description}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="whitespace-nowrap">Category: {product.category || 'N/A'}</span>
                      <span className="whitespace-nowrap">
                        {product.track_stock ? `Stock: ${product.stock_quantity ?? 0}` : 'Stock not tracked'}
                      </span>
                      <span className="whitespace-nowrap">Price: {formatCurrency(product.price)}</span>
                    </div>
                  </div>
                </div>
                <ProductActions product={product} />
              </div>
            )} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProductsManagement;


