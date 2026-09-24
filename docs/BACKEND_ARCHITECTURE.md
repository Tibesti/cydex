# Cydex Backend Architecture Documentation

## 1. System Overview

This document outlines the backend architecture required for the Cydex eco-friendly delivery platform. As a sustainability-focused delivery service, our platform connects customers, riders, and vendors with an emphasis on environmental responsibility.

The backend system needs to support:
- Multi-role user authentication (customer, rider, vendor, admin)
- Order and delivery management
- Payment processing
- Carbon credit tracking and calculations
- Real-time location tracking
- In-app messaging
- Analytics and reporting

## 2. Entity Relationship Diagram (ERD)

### Core Entities and Relationships:

```
                                  ┌─────────────┐
                                  │    Users    │
                                  ├─────────────┤
                                  │ id          │
                                  │ name        │
                                  │ email       │
                                  │ password    │◄─┐
                                  │ role        │  │
                                  │ avatar      │  │
                                  │ verified    │  │
                                  │ mfa_enabled │  │
                                  │ created_at  │  │
                                  │ last_active │  │
                                  └─────────────┘  │
                                       ▲  ▲  ▲     │
                                       │  │  │     │
                ┌────────────┬─────────┘  │  └─────┴──────────┐
                │            │            │                   │
        ┌───────────────┐ ┌──────────────┴──┐ ┌──────────────┴──┐
        │ Customer      │ │ Rider           │ │ Vendor          │
        ├───────────────┤ ├─────────────────┤ ├─────────────────┤
        │ id            │ │ id              │ │ id              │
        │ user_id       │ │ user_id         │ │ user_id         │
        │ address       │ │ vehicle_details │ │ business_name   │
        │ carbon_credits│ │ license_details │ │ business_address│
        │ preferences   │ │ availability    │ │ business_type   │
        └───────────────┘ │ rating          │ │ opening_hours   │
                │         │ active_status   │ │ eco_rating      │
                │         └─────────────────┘ │ description     │
                │                  │          └────────────────┬┘
                │                  │                           │
                ▼                  ▼                           ▼
        ┌───────────────┐  ┌────────────────┐       ┌──────────────────┐
        │    Orders     │◄─┤  Deliveries    │       │    Products      │
        ├───────────────┤  ├────────────────┤       ├──────────────────┤
        │ id            │  │ id             │       │ id               │
        │ customer_id   │  │ order_id       │       │ vendor_id        │
        │ status        │  │ rider_id       │       │ name             │
        │ created_at    │  │ status         │       │ description      │
        │ vendor_id     │  │ start_time     │       │ price            │
        │ total_amount  │  │ end_time       │       │ category         │
        │ delivery_info │  │ route          │       │ image            │
        │ carbon_saved  │  │ distance       │       │ eco_friendly     │
        │ payment_status│  │ carbon_saved   │       │ weight           │
        └───────┬───────┘  │ rating         │       │ availability     │
                │          └────────────────┘       └──────────────────┘
                │                                            ▲
                └──────────────┐                             │
                               ▼                             │
                      ┌─────────────────┐                    │
                      │  Order_Items    │                    │
                      ├─────────────────┤                    │
                      │ id              │                    │
                      │ order_id        │                    │
                      │ product_id      ├────────────────────┘
                      │ quantity        │
                      │ price           │
                      └─────────────────┘
```

### Additional Entities:

```
┌─────────────────┐     ┌───────────────────┐
│   Recycling     │     │   Payments        │
├─────────────────┤     ├───────────────────┤
│ id              │     │ id                │
│ user_id         │     │ order_id          │
│ type            │     │ amount            │
│ weight          │     │ status            │
│ credits_earned  │     │ provider          │
│ status          │     │ transaction_id    │
│ created_at      │     │ created_at        │
└─────────────────┘     └───────────────────┘
```

## 3. Detailed Entity Descriptions

### Users
- **Primary Entity**: Stores core user information
- **Fields**:
  - `id`: UUID primary key
  - `name`: String, user's full name
  - `email`: String, unique identifier for login
  - `password`: String, hashed password
  - `role`: Enum ('customer', 'rider', 'vendor', 'admin')
  - `avatar`: String, URL to profile image
  - `verified`: Boolean, email verification status
  - `mfa_enabled`: Boolean, multi-factor authentication status
  - `created_at`: DateTime, account creation timestamp
  - `last_active`: DateTime, last user activity timestamp
  - `carbon_credits`: Numeric, eco-points earned

### Customer
- **Extends**: Users with role='customer'
- **Fields**:
  - `id`: UUID primary key
  - `user_id`: Foreign key to Users
  - `address`: JSON, shipping address information
  - `carbon_credits`: Numeric, earned eco-points
  - `preferences`: JSON, delivery and notification preferences

### Rider
- **Extends**: Users with role='rider'
- **Fields**:
  - `id`: UUID primary key
  - `user_id`: Foreign key to Users
  - `vehicle_details`: JSON, information about delivery vehicle
  - `license_details`: JSON, driver's license information
  - `availability`: JSON, working hours and areas
  - `rating`: Numeric, average rating (1-5)
  - `active_status`: String ('active', 'inactive', 'suspended')

### Vendor
- **Extends**: Users with role='vendor'
- **Fields**:
  - `id`: UUID primary key
  - `user_id`: Foreign key to Users
  - `business_name`: String
  - `business_address`: JSON, location information
  - `business_type`: String, category of business
  - `opening_hours`: JSON, operating hours
  - `eco_rating`: Numeric, sustainability score (1-5)
  - `description`: Text, business description

### Products
- **Description**: Items offered by vendors
- **Fields**:
  - `id`: UUID primary key
  - `vendor_id`: Foreign key to Vendor
  - `name`: String
  - `description`: Text
  - `price`: Numeric
  - `category`: String
  - `image`: String, URL to product image
  - `eco_friendly`: Boolean
  - `weight`: String/Numeric
  - `availability`: Boolean

### Orders
- **Description**: Customer purchases
- **Fields**:
  - `id`: UUID primary key
  - `customer_id`: Foreign key to Customer
  - `vendor_id`: Foreign key to Vendor
  - `status`: Enum ('pending', 'processing', 'in-transit', 'delivered', 'cancelled')
  - `created_at`: DateTime
  - `total_amount`: Numeric
  - `delivery_info`: JSON, delivery address and preferences
  - `carbon_saved`: Numeric, environmental impact
  - `payment_status`: Enum ('pending', 'paid', 'refunded')

### Order_Items
- **Description**: Line items in an order
- **Fields**:
  - `id`: UUID primary key
  - `order_id`: Foreign key to Orders
  - `product_id`: Foreign key to Products
  - `quantity`: Integer
  - `price`: Numeric, price at time of purchase

### Deliveries
- **Description**: Delivery assignments and tracking
- **Fields**:
  - `id`: UUID primary key
  - `order_id`: Foreign key to Orders
  - `rider_id`: Foreign key to Rider
  - `status`: Enum ('assigned', 'in-progress', 'completed', 'cancelled')
  - `start_time`: DateTime
  - `end_time`: DateTime
  - `route`: GeoJSON, delivery path
  - `distance`: Numeric, in kilometers
  - `carbon_saved`: Numeric, environmental impact
  - `rating`: Numeric, delivery rating (1-5)

### Recycling
- **Description**: Sustainability tracking
- **Fields**:
  - `id`: UUID primary key
  - `user_id`: Foreign key to Users
  - `type`: String, recyclable material type
  - `weight`: Numeric
  - `credits_earned`: Numeric
  - `status`: String ('pending', 'verified', 'rejected')
  - `created_at`: DateTime

### Payments
- **Description**: Financial transactions
- **Fields**:
  - `id`: UUID primary key
  - `order_id`: Foreign key to Orders
  - `amount`: Numeric
  - `status`: String ('pending', 'completed', 'failed', 'refunded')
  - `provider`: String, payment processor
  - `transaction_id`: String, external reference
  - `created_at`: DateTime

## 4. Technical Requirements Document (TRD)

### 4.1 Authentication & Authorization

**Requirements:**
- JWT-based authentication system
- Role-based authorization (customer, rider, vendor, admin)
- Email verification
- Password reset functionality
- Multi-factor authentication option
- Session management with timeout (30 minutes)
- Secure password storage with bcrypt or similar

**API Endpoints:**
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/verify-email/:token
POST /api/auth/reset-password
POST /api/auth/update-password
POST /api/auth/enable-mfa
POST /api/auth/verify-mfa
```

### 4.2 User Management

**Requirements:**
- CRUD operations for all user types
- Profile updates and avatar uploads
- User activity tracking
- Verification document uploads for riders

**API Endpoints:**
```
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id
POST   /api/users/upload-avatar
GET    /api/users/:id/activity
POST   /api/riders/:id/documents
```

### 4.3 Order Management

**Requirements:**
- Order creation and management
- Product inventory management
- Order status updates
- Carbon footprint calculation
- Order history and filtering

**API Endpoints:**
```
POST   /api/orders
GET    /api/orders
GET    /api/orders/:id
PUT    /api/orders/:id/status
GET    /api/orders/customer/:customerId
GET    /api/orders/vendor/:vendorId
POST   /api/orders/:id/items
```

### 4.4 Delivery System

**Requirements:**
- Rider assignment algorithm
- Real-time location tracking
- Route optimization
- Delivery status updates
- Rating system for deliveries

**API Endpoints:**
```
POST   /api/deliveries
GET    /api/deliveries/:id
PUT    /api/deliveries/:id/status
PUT    /api/deliveries/:id/location
GET    /api/deliveries/rider/:riderId
POST   /api/deliveries/:id/rate
```

### 4.5 Product Management

**Requirements:**
- CRUD for vendor products
- Category management
- Product search and filtering
- Eco-friendly product tagging

**API Endpoints:**
```
POST   /api/products
GET    /api/products
GET    /api/products/:id
PUT    /api/products/:id
DELETE /api/products/:id
GET    /api/products/vendor/:vendorId
GET    /api/products/search
```

### 4.6 Carbon Credits System

**Requirements:**
- Credit calculation based on delivery method
- Credit assignment to users
- Credit redemption options
- Sustainability statistics

**API Endpoints:**
```
GET    /api/carbon-credits/user/:userId
POST   /api/carbon-credits/calculate
POST   /api/carbon-credits/redeem
GET    /api/carbon-credits/stats
```

### 4.7 Payment Processing

**Requirements:**
- Integration with payment gateways
- Transaction history
- Refund processing
- Automatic receipts

**API Endpoints:**
```
POST   /api/payments/process
GET    /api/payments/order/:orderId
POST   /api/payments/refund
GET    /api/payments/user/:userId
```

## 5. API Security Considerations

### 5.1 Authentication & Authorization
- Implement JWT with appropriate expiration
- Refresh token rotation
- Role-based access control (RBAC)

### 5.2 Data Protection
- HTTPS for all connections
- Input validation
- Output sanitization
- Parameterized queries to prevent SQL injection

### 5.3 Rate Limiting
- Implement rate limiting to prevent abuse
- Configure request limits per endpoint

### 5.4 Logging & Monitoring
- Implement comprehensive logging
- Set up monitoring and alerting

## 6. Data Migration Plan

For our initial data setup:

1. Create database schema according to the ERD
2. Set up initial seed data for testing
3. Implement data validation scripts
4. Create backup strategy before deployment

## 7. Sustainability Features Implementation

### 7.1 Carbon Footprint Calculation

```
// Pseudocode for carbon calculation
function calculateCarbonSaved(delivery) {
  const distanceKm = delivery.distance;
  const vehicleType = rider.vehicle_details.type;
  
  // Carbon emission factors in kg CO2 per km
  const emissionFactors = {
    'bicycle': 0,
    'e-bike': 0.015,
    'electric-vehicle': 0.053,
    'motorcycle': 0.103,
    'car': 0.192,
    'van': 0.298
  };
  
  // Calculate emissions saved compared to standard delivery vehicle (van)
  const standardEmission = distanceKm * emissionFactors['van'];
  const actualEmission = distanceKm * emissionFactors[vehicleType];
  
  return standardEmission - actualEmission;
}
```

### 7.2 Eco-Rating System

Vendor eco-ratings should be calculated based on:
- Sustainable packaging options
- Carbon-neutral operations
- Distance from delivery areas
- Overall sustainability practices

## 8. Integration Points

### 8.1 External Services
- Maps/Geocoding API for location services
- SMS gateway for notifications
- Email service for transactional emails
- Payment gateways
- Analytics services

### 8.2 Mobile Applications
- API endpoints for mobile app integration
- Push notification services

## 9. Scaling Considerations

### 9.1 Database Scaling
- Implement read replicas for high-read operations
- Consider sharding for large datasets
- Use connection pooling

### 9.2 API Scaling
- Implement caching strategies
- Consider microservices for specific features
- Use load balancing

### 9.3 Background Processing
- Implement job queues for async operations
- Use workers for heavy processing tasks

## 10. Key Performance Indicators
- API response times
- Order fulfillment rates
- Carbon savings metrics
- User acquisition and retention

## Conclusion

This architecture is designed to create a sustainable, scalable backend for the Cydex platform. Prioritize carbon tracking functionality as it's core to our eco-friendly mission. The implementation should be built with scalability in mind from the beginning, as we anticipate rapid growth.

Please refer to the frontend team for UI integration details and reach out if you need clarification on any aspects of this architecture.
