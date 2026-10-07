import React, { useState, useEffect, useMemo } from 'react';
import { isAvailable, maxOrderable, stockLabel, stockLimit } from '@/lib/products';
import { useParams, useNavigate } from 'react-router-dom';
import { useSupabase } from '@/contexts/SupabaseContext';
import { useCartContext } from '@/contexts/CartContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ShoppingCart, Star, Store, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Product } from '@/hooks/useProducts';
import { Skeleton } from '@/components/ui/skeleton';
import { useVendorRatings } from '@/hooks/useVendorRatings';
import { ShoppingCartSidebar } from '@/components/customer/ShoppingCartSidebar';

const ProductDetails = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { supabase } = useSupabase();
  const { 
    addToCart, 
    cartItems, 
    isCartOpen, 
    setIsCartOpen, 
    removeFromCart, 
    updateQuantity
  } = useCartContext();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const { getRatingForVendor } = useVendorRatings();

  // Filter cart items to show only items from the current product's vendor
  const vendorCartItems = useMemo(() => {
    if (!product) return [];
    return cartItems.filter(item => item.vendor_id === product.vendor_id);
  }, [cartItems, product]);

  // Calculate total for vendor-specific cart
  const vendorCartTotal = useMemo(() => {
    return vendorCartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [vendorCartItems]);

  const handleProceedToCheckout = () => {
    if (!product || vendorCartItems.length === 0) {
      toast.error('No items in cart');
      return;
    }
    
    setIsCartOpen(false);
    // Navigate with vendor ID in URL params so NewOrder can auto-select the vendor
    // Add checkout=true to indicate we're coming from checkout flow
    navigate(`/customer/new-order?vendor=${product.vendor_id}&vendorName=${encodeURIComponent(product.vendor?.name || 'Unknown Vendor')}&checkout=true`);
  };

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('products')
          .select(`
            *,
            vendor:profiles!products_vendor_id_fkey (
              name,
              email
            )
          `)
          .eq('id', productId)
          .single();

        if (error) throw error;
        setProduct(data as Product);
      } catch (error) {
        console.error('Error fetching product:', error);
        toast.error('Failed to load product details');
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [productId]);

  const handleAddToCart = () => {
    if (!product || !isAvailable(product)) return;

    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      vendor_id: product.vendor_id,
      vendor_name: product.vendor?.name || 'Unknown Vendor',
      max_quantity: stockLimit(product)
    }, quantity);
  };

  // Get vendor rating
  const vendorRating = product ? getRatingForVendor(product.vendor_id) : null;
  const displayRating = vendorRating?.average_rating > 0 ? vendorRating.average_rating : 4.5;

  if (loading) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto">
          <div className="animate-pulse space-y-3 sm:space-y-4">
            <div className="h-6 sm:h-8 bg-muted rounded w-20 sm:w-24"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="aspect-square bg-muted rounded"></div>
              <div className="space-y-3 sm:space-y-4">
                <div className="h-6 sm:h-8 bg-muted rounded w-3/4"></div>
                <div className="h-4 sm:h-5 bg-muted rounded w-1/2"></div>
                <div className="h-8 sm:h-10 bg-muted rounded w-1/4"></div>
                <div className="h-4 bg-muted rounded w-full"></div>
                <div className="h-4 bg-muted rounded w-5/6"></div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="h-12 sm:h-16 bg-muted rounded"></div>
                  <div className="h-12 sm:h-16 bg-muted rounded"></div>
                </div>
                <div className="h-12 sm:h-14 bg-muted rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!product) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto text-center">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-2 sm:mb-3">Product Not Found</h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 px-4">The product you're looking for doesn't exist or has been removed.</p>
          <Button onClick={() => navigate('/customer/new-order')} className="text-sm sm:text-base">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Products
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto">
        {/* Header with Back Button and Cart */}
        <div className="flex items-center justify-between mb-3 sm:mb-4">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
            className="text-xs sm:text-sm"
        >
            <ArrowLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
          Back
        </Button>

          {/* Cart Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-1 sm:gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3"
          >
            <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Cart</span>
            {vendorCartItems.length > 0 && (
              <Badge className="absolute -top-1.5 -right-1.5 px-1 py-0 bg-primary text-black text-[10px] sm:text-xs rounded-full min-w-[16px] h-4 sm:h-5 flex items-center justify-center font-semibold">
                {vendorCartItems.reduce((sum, item) => sum + item.quantity, 0)}
              </Badge>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Product Image */}
          <Card className="overflow-hidden">
            <div className="relative aspect-square">
              <img 
                src={product.image_url || '/placeholder.svg'} 
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          </Card>

          {/* Product Details */}
          <div className="space-y-4 sm:space-y-6">
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <div className="space-y-2 sm:space-y-3">
                  <CardTitle className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight">{product.name}</CardTitle>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Store className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="truncate">{product.vendor?.name || 'Unknown Vendor'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                      <span className="whitespace-nowrap">
                        {displayRating.toFixed(1)}
                        {vendorRating && vendorRating.total_ratings > 0 && (
                          <span className="text-muted-foreground ml-1">({vendorRating.total_ratings})</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6 pt-0">
                <div className="flex flex-col gap-3 sm:gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                    <span className="text-2xl sm:text-3xl md:text-4xl font-bold">₦{product.price.toLocaleString()}</span>
                    <Badge variant="outline" className="flex items-center gap-1 w-fit text-xs sm:text-sm">
                      <Package className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>{stockLabel(product) ?? 'Available'}</span>
                    </Badge>
                  </div>

                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{product.description}</p>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <Star className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                    <div>
                      <p className="text-xs sm:text-sm font-medium">Vendor Rating</p>
                      <p className="text-xs text-gray-500">
                        {displayRating.toFixed(1)} stars
                        {vendorRating && vendorRating.total_ratings > 0 && (
                          <span> • {vendorRating.total_ratings} reviews</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Show detailed ratings if available */}
                {vendorRating && vendorRating.total_ratings > 0 && (
                  <div className="border-t pt-3 sm:pt-4">
                    <h4 className="text-xs sm:text-sm font-medium mb-2">Detailed Ratings</h4>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs">
                      {vendorRating.average_delivery_rating > 0 && (
                        <div className="flex items-center gap-2">
                          <span>Delivery:</span>
                          <div className="flex items-center">
                            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400 mr-1" />
                            <span>{vendorRating.average_delivery_rating.toFixed(1)}</span>
                          </div>
                        </div>
                      )}
                      {vendorRating.average_product_quality_rating > 0 && (
                        <div className="flex items-center gap-2">
                          <span>Quality:</span>
                          <div className="flex items-center">
                            <Star className="h-3 w-3 text-yellow-400 fill-yellow-400 mr-1" />
                            <span>{vendorRating.average_product_quality_rating.toFixed(1)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 pt-2 border-t">
                  <div className="flex items-center border rounded-md w-full sm:w-auto justify-between sm:justify-start">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setQuantity((prev) => Math.max(1, prev - 1));
                      }}
                      className="px-3 sm:px-4 h-10 sm:h-11 min-w-[44px] touch-manipulation"
                      disabled={quantity <= 1}
                    >
                      <span className="text-lg sm:text-xl font-semibold">−</span>
                    </Button>
                    <span className="w-12 sm:w-16 text-center text-base sm:text-lg font-semibold select-none">{quantity}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setQuantity((prev) => Math.min(maxOrderable(product), prev + 1));
                      }}
                      className="px-3 sm:px-4 h-10 sm:h-11 min-w-[44px] touch-manipulation"
                      disabled={!isAvailable(product) || quantity >= maxOrderable(product)}
                    >
                      <span className="text-lg sm:text-xl font-semibold">+</span>
                    </Button>
                  </div>
                  <Button
                    className="flex-1 sm:flex-initial bg-primary hover:bg-primary/80 text-black h-10 sm:h-11 text-sm sm:text-base touch-manipulation"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAddToCart();
                    }}
                    disabled={!isAvailable(product)}
                  >
                    <ShoppingCart className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    {isAvailable(product) ? (
                      <>
                        <span className="hidden xs:inline">Add to Cart</span>
                        <span className="xs:hidden">Add</span>
                      </>
                    ) : (
                      <span>{stockLabel(product)}</span>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Shopping Cart Sidebar - Vendor Specific */}
      <ShoppingCartSidebar
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={vendorCartItems}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        cartTotal={vendorCartTotal}
        proceedToCheckout={handleProceedToCheckout}
      />
    </DashboardLayout>
  );
};

export default ProductDetails; 