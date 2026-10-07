import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Package, ArrowLeft, Upload, Leaf, Store } from 'lucide-react';
import { useVendorProducts } from '@/hooks/useVendorProducts';
import { supabase } from '@/integrations/supabase/client';
import { checkUploadSize, MAX_UPLOAD_LABEL } from '@/lib/uploads';

// Stock is optional: tick "Track stock" to enter a number (it then goes down
// with each paid order and the product shows as out of stock at 0). Without it,
// the vendor switches the product available / unavailable themselves.
const productSchema = z
  .object({
    name: z.string().min(2, { message: 'Product name must be at least 2 characters.' }),
    description: z.string().min(10, { message: 'Description must be at least 10 characters.' }),
    price: z.coerce.number().positive({ message: 'Price must be a positive number.' }),
    category: z.string().min(1, { message: 'Please select a category.' }),
    track_stock: z.boolean().default(false),
    stock_quantity: z.union([z.literal(''), z.coerce.number().int().min(0)]).optional(),
    available: z.boolean().default(true),
    image_url: z.string().optional(),
    is_eco_friendly: z.boolean().optional().default(true),
    carbon_impact: z.coerce.number().min(0).optional().default(0),
  })
  .superRefine((data, ctx) => {
    if (data.track_stock && (data.stock_quantity === '' || data.stock_quantity === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['stock_quantity'], message: 'Enter how many you have in stock.' });
    }
  });

type ProductFormValues = z.infer<typeof productSchema>;

const categoryOptions = [
  'Groceries',
  'Organic Food',
  'Health & Wellness',
  'Home Goods',
  'Eco-friendly Products',
  'Clothes & Apparel',
  'Beauty & Personal Care',
  'Electronics',
  'Others',
];

// Add a product, or edit one at /vendor/edit-product/:productId
const AddProduct = () => {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const isEditing = !!productId;
  const { addProduct, updateProduct } = useVendorProducts();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(isEditing);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      description: '',
      price: 0,
      category: '',
      track_stock: false,
      stock_quantity: '',
      available: true,
      image_url: '',
      is_eco_friendly: true,
      carbon_impact: 0,
    },
  });
  const trackStock = form.watch('track_stock');

  useEffect(() => {
    if (!productId) return;
    supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()
      .then(({ data, error }) => {
        setLoadingProduct(false);
        if (error || !data) {
          toast.error('Product not found');
          navigate('/vendor/products');
          return;
        }
        form.reset({
          name: data.name,
          description: data.description ?? '',
          price: Number(data.price),
          category: data.category ?? '',
          track_stock: data.track_stock,
          stock_quantity: data.stock_quantity ?? '',
          available: data.status === 'active',
          image_url: data.image_url ?? '',
          is_eco_friendly: data.is_eco_friendly ?? true,
          carbon_impact: Number(data.carbon_impact ?? 0),
        });
        setSelectedImage(data.image_url || null);
      });
  }, [productId, form, navigate]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!checkUploadSize(file)) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSelectedImage(reader.result);
        form.setValue('image_url', reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (data: ProductFormValues) => {
    setIsSubmitting(true);
    try {
      const productData = {
        name: data.name,
        description: data.description || '',
        price: Number(data.price),
        category: data.category,
        track_stock: data.track_stock,
        stock_quantity: data.track_stock ? Number(data.stock_quantity) : null,
        // For stock-tracked products the database sets this from the stock
        status: (data.track_stock || data.available ? 'active' : 'inactive') as 'active' | 'inactive',
        image_url: data.image_url || '',
        is_eco_friendly: Boolean(data.is_eco_friendly),
        carbon_impact: Number(data.carbon_impact),
      };

      const success = isEditing
        ? await updateProduct(productId!, productData)
        : await addProduct(productData);

      if (success) navigate('/vendor/products');
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Failed to save product. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout userRole="VENDOR">
      <div className="p-3 sm:p-4 md:p-6 max-w-3xl mx-auto">
        <div className="mb-4 sm:mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="mb-3 sm:mb-4 w-full sm:w-auto text-xs sm:text-sm"
          >
            <ArrowLeft className="mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            Back
          </Button>
          <h1 className="text-xl sm:text-2xl font-bold">{isEditing ? 'Edit Product' : 'Add New Product'}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isEditing ? 'Update the product details, stock or availability.' : 'Add a product your customers can order.'}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="flex items-center text-base sm:text-lg">
              <Package className="mr-2 h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Product Details
            </CardTitle>
            <CardDescription className="text-sm">Fields marked * are required.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingProduct ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm sm:text-base">Product Name*</FormLabel>
                          <FormControl>
                            <Input placeholder="Eco-friendly Water Bottle" className="text-sm sm:text-base" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm sm:text-base">Price (₦)*</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="0.00" className="text-sm sm:text-base" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm sm:text-base">Description*</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter product description..."
                            className="min-h-24 sm:min-h-32 text-sm sm:text-base"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription className="text-xs sm:text-sm">
                          Describe your product, including materials, usage and benefits.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm sm:text-base">Category*</FormLabel>
                          <FormControl>
                            <select
                              className="flex h-9 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              {...field}
                            >
                              <option value="" disabled>Select a category</option>
                              {categoryOptions.map((category) => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="carbon_impact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center text-sm sm:text-base">
                            <Leaf className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            Carbon Impact (kg CO2)
                          </FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" className="text-sm sm:text-base" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Stock (optional) or manual availability */}
                  <div className="space-y-4 rounded-lg border p-3 sm:p-4">
                    <FormField
                      control={form.control}
                      name="track_stock"
                      render={({ field }) => (
                        <FormItem className="flex items-start gap-3 space-y-0">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                          </FormControl>
                          <div className="space-y-1">
                            <FormLabel className="flex items-center text-sm sm:text-base">
                              <Store className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                              Track stock
                            </FormLabel>
                            <FormDescription className="text-xs sm:text-sm">
                              Stock goes down with each paid order, and the product shows as out of stock at 0.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />

                    {trackStock ? (
                      <FormField
                        control={form.control}
                        name="stock_quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm sm:text-base">Stock Quantity*</FormLabel>
                            <FormControl>
                              <Input type="number" min={0} placeholder="e.g. 20" className="text-sm sm:text-base sm:max-w-xs" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <FormField
                        control={form.control}
                        name="available"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between gap-3 space-y-0">
                            <div className="space-y-1">
                              <FormLabel className="text-sm sm:text-base">Available to order</FormLabel>
                              <FormDescription className="text-xs sm:text-sm">
                                Switch off when you can't take orders for this product.
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <FormItem>
                    <FormLabel className="text-sm sm:text-base">Product Image</FormLabel>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="border-2 border-dashed border-border rounded-md p-4 sm:p-6 flex flex-col items-center justify-center bg-muted/40 hover:bg-muted transition-colors">
                        <Upload className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground mb-2" />
                        <Label
                          htmlFor="image-upload"
                          className="cursor-pointer text-primary hover:underline font-medium text-sm sm:text-base"
                        >
                          {selectedImage ? 'Change image' : 'Click to upload'}
                        </Label>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 text-center">
                          SVG, PNG, JPG or GIF (max. {MAX_UPLOAD_LABEL})
                        </p>
                        <Input id="image-upload" type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      </div>

                      {selectedImage && (
                        <div className="border rounded-md overflow-hidden flex items-center justify-center bg-background p-4">
                          <img src={selectedImage} alt="Product preview" className="max-h-32 sm:max-h-40 object-contain" />
                        </div>
                      )}
                    </div>
                  </FormItem>

                  <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-2 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate(-1)}
                      className="w-full sm:w-auto text-xs sm:text-sm"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-primary hover:bg-primary-hover text-black w-full sm:w-auto text-xs sm:text-sm"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Product'}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AddProduct;
