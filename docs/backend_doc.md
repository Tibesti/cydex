# Cydex API Documentation

Base URL: `https://cydex-backend-production-edd3.up.railway.app`

## Authentication

### Login
```http
POST /auth/login
```

**Request Body:**
```json
{
    "email": "string",
    "password": "string"
}
```

### Register
```http
POST /auth/register
```

**Request Body:**
```json
{
    "first_name": "string",
    "last_name": "string",
    "email": "string",
    "password": "string",
    "role": "CUSTOMER" | "ADMIN" | "RIDER" | "VENDOR",
    "password_confirmation": "string"
}
```

### Email Verification
```http
POST /auth/email-verification
```

**Request Body:**
```json
{
    "email": "string"
}
```

### Password Reset
```http
POST /auth/otp/send
```

**Request Body:**
```json
{
    "email": "string"
}
```

### Change Password
```http
POST /auth/change-password
```

**Request Body:**
```json
{
    "email": "string",
    "code": "string",
    "password": "string"
}
```

## Business Management

### Get Business
```http
GET /business
```

**Headers:**
```
Authorization: Bearer {token}
```

### Create Business
```http
POST /business
```

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
    "name": "string",
    "address": "string",
    "latitude": "string",
    "longitude": "string",
    "available_hours": {
        "monday": {
            "open": "string",
            "close": "string"
        },
        "tuesday": {
            "open": "string",
            "close": "string"
        },
        "wednesday": {
            "open": "string",
            "close": "string"
        },
        "thursday": {
            "open": "string",
            "close": "string"
        },
        "friday": {
            "open": "string",
            "close": "string"
        },
        "saturday": {
            "open": "string",
            "close": "string"
        },
        "sunday": {
            "open": "string",
            "close": "string"
        }
    }
}
```

### Update Business
```http
PUT /business/{id}
```

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:** Same as Create Business

## Product Management

### Get All Products
```http
GET /product?business={business_id}
```

**Query Parameters:**
- `business`: Business ID (required)

### Get Single Product
```http
GET /product/{id}
```

### Create Product
```http
POST /product
```

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
    "name": "string",
    "price": "number",
    "description": "string",
    "image": "string",
    "category": "string",
    "weight": "number",
    "business": "string",
    "quantity": "number",
    "sustainability": "number",
    "tags": ["string"],
    "features": {
        "packaging": "boolean",
        "organic": "boolean",
        "carbon": "boolean"
    }
}
```

### Delete Product
```http
DELETE /product/{id}
```

**Headers:**
```
Authorization: Bearer {token}
```

## File Management

### Upload File
```http
POST /file/upload
```

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```
FormData:
- file: File
```

### Delete File
```http
POST /file/upload
```

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```
FormData:
- file: File
```

## Error Handling

The API uses standard HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer {token}
```

## Rate Limiting

The API implements rate limiting to prevent abuse. Please implement appropriate error handling for 429 (Too Many Requests) responses.

## Best Practices

1. Always include proper error handling in your requests
2. Implement token refresh mechanism
3. Store sensitive data securely
4. Use HTTPS for all requests
5. Implement proper validation for all input data
6. Handle network errors gracefully
7. Implement proper loading states in your UI

## Example Usage

```javascript
// Example of making an authenticated request
const fetchBusiness = async (token) => {
  try {
    const response = await fetch('https://cydex-backend-production-edd3.up.railway.app/business', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching business:', error);
    throw error;
  }
};
```

## Support

For any API-related issues or questions, please contact the development team at [support email/contact].