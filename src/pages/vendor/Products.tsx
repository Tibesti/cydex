import DashboardLayout from '@/components/layout/DashboardLayout';
import ProductsManagement from '@/components/vendor/ProductsManagement';

const Products = () => (
  <DashboardLayout userRole="VENDOR">
    <div className="p-3 sm:p-4 md:p-6 max-w-5xl mx-auto">
      <ProductsManagement />
    </div>
  </DashboardLayout>
);

export default Products;
