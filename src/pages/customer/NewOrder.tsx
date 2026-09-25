
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ShoppingCartSidebar } from '@/components/customer/ShoppingCartSidebar';
import { DeliveryScheduler } from '@/components/customer/DeliveryScheduler';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/lib/supabase';
import { ConfirmDeliveryAddressDialog } from '@/components/customer/address/ConfirmDeliveryAddressDialog';
import type { Address } from '@/hooks/useAddresses';
import { errorMessage } from '@/lib/address';
import { toCartLines } from '@/hooks/useOrderQuote';
import { supabase as typedSupabase } from '@/integrations/supabase/client';
import { PaymentModal } from '@/components/customer/PaymentModal';
import { useCartContext } from '@/contexts/CartContext';
import { VendorRatingModal } from '@/components/customer/VendorRatingModal';
import { VendorSelectionPage } from '@/components/customer/VendorSelectionPage';
import { FiltersSection } from '@/components/customer/order/FiltersSection';
import { MobileCategoriesSection } from '@/components/customer/order/MobileCategoriesSection';
import { DesktopCategoriesSidebar } from '@/components/customer/order/DesktopCategoriesSidebar';
import { ProductsGrid } from '@/components/customer/order/ProductsGrid';
import { PaginationSection } from '@/components/customer/order/PaginationSection';
import { OrderHeader } from '@/components/customer/order/OrderHeader';

const NewOrder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { products, loading } = useProducts();
  const { 
    cartItems, 
    isCartOpen, 
    setIsCartOpen, 
    addToCart, 
    removeFromCart, 
    updateQuantity, 
    calculateTotal,
    clearCart 
  } = useCartContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [selectedVendorName, setSelectedVendorName] = useState<string | null>(null);
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [sortBy, setSortBy] = useState('recommended');
  const [currentPage, setCurrentPage] = useState(1);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<{ 
    id: string; 
    order_number: string; 
    total_amount: number;
    payment_reference?: string;
  } | null>(null);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [ratingOrderData, setRatingOrderData] = useState<{
    orderId: string;
    orderNumber: string;
    vendorId: string;
    vendorName: string;
  } | null>(null);
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [isAddressConfirmOpen, setIsAddressConfirmOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Auto-select vendor from URL params or cart items
  useEffect(() => {
    // First check URL params (from product details checkout)
    const vendorIdFromUrl = searchParams.get('vendor');
    const vendorNameFromUrl = searchParams.get('vendorName');
    const fromCheckout = searchParams.get('checkout') === 'true';
    
    if (vendorIdFromUrl && vendorNameFromUrl && !selectedVendor) {
      setSelectedVendor(vendorIdFromUrl);
      setSelectedVendorName(decodeURIComponent(vendorNameFromUrl));
      // Auto-open cart if coming from checkout and cart has items
      if (fromCheckout && cartItems.length > 0 && !isCartOpen) {
        setIsCartOpen(true);
      }
      // Don't clear cart when auto-selecting from URL params
      return;
    }
    
    // If no vendor selected and cart has items, auto-select vendor from cart
    if (!selectedVendor && cartItems.length > 0) {
      const vendorIds = Array.from(new Set(cartItems.map(item => item.vendor_id).filter(Boolean)));
      if (vendorIds.length === 1) {
        // All items are from the same vendor
        const vendorItem = cartItems.find(item => item.vendor_id);
        if (vendorItem) {
          setSelectedVendor(vendorItem.vendor_id);
          setSelectedVendorName(vendorItem.vendor_name);
          // Auto-open cart if it has items
          if (cartItems.length > 0 && !isCartOpen) {
            setIsCartOpen(true);
          }
          // Don't clear cart when auto-selecting from cart items
        }
      }
    }
  }, [searchParams, cartItems, selectedVendor, isCartOpen, setIsCartOpen]);
  
  const itemsPerPage = 12;

  // Filter products to only show those from selected vendor with valid vendor info
  const filteredProducts = products.filter(product => {
    // Only show products with valid vendor
    if (!product.vendor || !product.vendor_id) return false;
    
    // Only show products from selected vendor
    if (selectedVendor && product.vendor_id !== selectedVendor) return false;
    
    // Apply search filter
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          product.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          product.vendor?.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Apply category filter
    const matchesCategory = !selectedCategory || product.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Get unique categories from filtered products
  const categories = Array.from(new Set(filteredProducts.map(p => p.category).filter(Boolean)));

  // Get unique vendors from products (for backup)
  const vendors = Array.from(new Set(products.map(p => ({ 
    id: p.vendor_id, 
    name: p.vendor?.name || 'Unknown Vendor' 
  })).filter(v => v.name !== 'Unknown Vendor')));

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-low') return a.price - b.price;
    if (sortBy === 'price-high') return b.price - a.price;
    if (sortBy === 'recommended') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return 0;
  });

  // Paginate products
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentProducts = sortedProducts.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedProducts.length / itemsPerPage);

  const handleVendorSelect = (vendorId: string, vendorName: string) => {
    setSelectedVendor(vendorId);
    setSelectedVendorName(vendorName);
    clearCart(); // Clear cart when switching vendors
  };

  const handleBackToVendors = () => {
    setSelectedVendor(null);
    setSelectedVendorName(null);
    setSelectedCategory(null);
    setSearchQuery('');
    clearCart(); // Clear cart when going back to vendor selection
  };

  const handleCheckout = async () => {
    try {
      if (!user?.id) {
        toast.error('Please log in to place an order');
        return;
      }

      if (cartItems.length === 0) {
        toast.error('Your cart is empty');
        return;
      }

      if (!selectedVendor) {
        toast.error('Please select a vendor first');
        return;
      }

      // Check if user has phone number
      const { data: profile } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .single();

      if (!profile?.phone) {
        toast.error('Please add your phone number in your profile before placing an order');
        return;
      }

      // Verify all items are from the same vendor
      const vendorIds = Array.from(new Set(cartItems.map(item => item.vendor_id)));
      if (vendorIds.length > 1) {
        toast.error('All items must be from the same vendor');
        return;
      }

      // Confirm the delivery address; the order is created once it's chosen
      setIsAddressConfirmOpen(true);
    } catch (error) {
      console.error('Error in checkout process:', error);
      toast.error('Failed to proceed with checkout. Please try again.');
    }
  };

  const createOrderWithAddress = async (address: Address) => {
    if (!user?.id || !selectedVendor) return;

    setIsCreatingOrder(true);
    try {
      // The database creates and prices the order: items at current product
      // prices (place_order), then the delivery fee and Service Charge
      // (price_new_order). It rejects vendors more than 5 km away.
      const { data: order, error: orderError } = await typedSupabase.rpc('place_order', {
        p_vendor_id: selectedVendor,
        p_address_id: address.id,
        p_items: toCartLines(cartItems),
      });

      if (orderError) throw orderError;

      setCurrentOrder(order);
      setIsAddressConfirmOpen(false);
      setIsPaymentModalOpen(true);
      setIsCartOpen(false);
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error(errorMessage(error, 'Failed to create order. Please try again.'));
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handlePaymentSuccess = async (reference: string) => {
    if (!currentOrder) return;

    try {
      // Update order with payment reference and status - keep as pending until vendor accepts
      const { error } = await supabase
        .from('orders')
        .update({ 
          payment_status: 'paid', 
          status: 'pending', // Keep as pending until vendor accepts
          payment_reference: reference,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentOrder.id);

      if (error) throw error;

      // Get vendor info for rating modal
      const vendorItem = cartItems.find(item => item.vendor_id);
      if (vendorItem) {
        setRatingOrderData({
          orderId: currentOrder.id,
          orderNumber: currentOrder.order_number,
          vendorId: vendorItem.vendor_id,
          vendorName: vendorItem.vendor_name
        });
        setIsRatingModalOpen(true);
      } else {
        // If no vendor item found, just show success and close
        toast.success('Order placed successfully!');
        clearCart();
        setIsPaymentModalOpen(false);
        navigate('/customer/orders');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Payment successful but failed to update order status. Please contact support.');
      setIsPaymentModalOpen(false);
    }
  };

  const handlePaymentError = () => {
    toast.error('Payment failed. Please try again.');
  };

  const handleRatingModalClose = () => {
    setIsRatingModalOpen(false);
    setRatingOrderData(null);
    clearCart();
    navigate('/customer/orders');
  };

  if (loading) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="p-2 sm:p-4 md:p-6 max-w-7xl mx-auto">
          <div className="animate-pulse space-y-3">
            <div className="h-6 sm:h-8 bg-muted rounded w-1/4"></div>
            <div className="h-10 sm:h-12 bg-muted rounded"></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-40 sm:h-48 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Show vendor selection if no vendor is selected
  if (!selectedVendor) {
    return (
      <DashboardLayout userRole="CUSTOMER">
        <div className="px-2 py-1 sm:p-3 md:p-6 max-w-7xl mx-auto">
          <VendorSelectionPage onVendorSelect={handleVendorSelect} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout userRole="CUSTOMER">
      <div className="px-2 py-1 sm:p-3 md:p-6 max-w-7xl mx-auto space-y-2 sm:space-y-4">
        
        {/* Vendor Header with Back Button */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToVendors}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Vendors
            </Button>
            <div className="border-l h-6 border-border"></div>
            <div>
              <h1 className="text-xl font-bold">{selectedVendorName}</h1>
              <p className="text-sm text-muted-foreground">Browse menu and add items to cart</p>
            </div>
          </div>
          
          {/* Cart Button for Desktop and Mobile */}
          <div className="block">
            <Button
              variant="default"
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-2"
            >
              Cart ({cartItems.length})
            </Button>
          </div>
        </div>
        
        {/* Compact Search Bar */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 h-3 w-3 sm:h-4 sm:w-4" />
          <Input
            type="text"
            placeholder="Search products..."
            className="pl-7 sm:pl-10 w-full text-xs sm:text-sm h-8 sm:h-9 border-gray-200"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <MobileCategoriesSection 
          isCategoriesExpanded={isCategoriesExpanded}
          setIsCategoriesExpanded={setIsCategoriesExpanded}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          categories={categories}
        />
        
        {/* Main Content Layout */}
        <div className="flex flex-col lg:flex-row gap-3 sm:gap-4">
          <DesktopCategoriesSidebar 
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            categories={categories}
          />
          
          <ProductsGrid 
            selectedCategory={selectedCategory}
            filteredProducts={filteredProducts}
            currentProducts={currentProducts}
            selectedVendor={selectedVendor}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setSelectedCategory={setSelectedCategory}
            setSelectedVendor={setSelectedVendor}
            addToCart={addToCart}
          />
        </div>

        <PaginationSection 
          totalPages={totalPages}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
        />
      </div>
      
      {/* Shopping Cart Sidebar */}
      <ShoppingCartSidebar 
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        updateQuantity={updateQuantity}
        removeFromCart={removeFromCart}
        cartTotal={calculateTotal()}
        proceedToCheckout={handleCheckout}
      />
      
      {/* Payment Modal */}
      {currentOrder && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            // Only clear cart if payment was not successful
            if (!currentOrder?.payment_reference) {
              clearCart();
            }
          }}
          amount={currentOrder?.total_amount || 0}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
          orderNumber={currentOrder?.order_number || ''}
          customerEmail={user?.email || ''}
          customerId={user?.id}
          metadata={{
            order_id: currentOrder?.id,
            user_id: user?.id,
            items: cartItems.map(item => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              price: item.price
            }))
          }}
        />
      )}
      
      {/* Vendor Rating Modal */}
      {ratingOrderData && (
        <VendorRatingModal 
          isOpen={isRatingModalOpen}
          onClose={handleRatingModalClose}
          vendorId={ratingOrderData.vendorId}
          vendorName={ratingOrderData.vendorName}
          orderId={ratingOrderData.orderId}
          orderNumber={ratingOrderData.orderNumber}
        />
      )}
      
      {/* Delivery address confirmation (default preselected) */}
      <ConfirmDeliveryAddressDialog
        open={isAddressConfirmOpen}
        onOpenChange={setIsAddressConfirmOpen}
        onConfirm={createOrderWithAddress}
        confirming={isCreatingOrder}
        vendorId={selectedVendor}
        items={toCartLines(cartItems)}
        cartSubtotal={calculateTotal()}
      />
      
      {/* Delivery Scheduler Dialog */}
      <DeliveryScheduler 
        isOpen={isSchedulerOpen}
        onClose={() => setIsSchedulerOpen(false)}
        cartTotal={calculateTotal()}
        onScheduleDelivery={handleCheckout}
      />
    </DashboardLayout>
  );
};

export default NewOrder;
