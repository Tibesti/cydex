export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          directions: string | null
          formatted_address: string
          id: string
          is_default: boolean
          label: string
          latitude: number
          longitude: number
          place_id: string | null
          place_name: string | null
          profile_id: string
          state: string | null
          street: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          directions?: string | null
          formatted_address: string
          id?: string
          is_default?: boolean
          label?: string
          latitude: number
          longitude: number
          place_id?: string | null
          place_name?: string | null
          profile_id: string
          state?: string | null
          street?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          directions?: string | null
          formatted_address?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number
          longitude?: number
          place_id?: string | null
          place_name?: string | null
          profile_id?: string
          state?: string | null
          street?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          priority: string
          published_at: string | null
          status: string
          target_audience: string[]
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          priority?: string
          published_at?: string | null
          status?: string
          target_audience: string[]
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          priority?: string
          published_at?: string | null
          status?: string
          target_audience?: string[]
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          target_id: string | null
          target_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          target_id?: string | null
          target_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          target_id?: string | null
          target_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_activity: {
        Row: {
          activity_description: string
          activity_type: string
          created_at: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          activity_description: string
          activity_type: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          activity_description?: string
          activity_type?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string | null
          bank_name: string
          created_at: string | null
          customer_id: string
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code?: string | null
          bank_name: string
          created_at?: string | null
          customer_id: string
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string | null
          bank_name?: string
          created_at?: string | null
          customer_id?: string
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_bank_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_preferences: {
        Row: {
          created_at: string | null
          delivery_preferences: Json | null
          id: string
          notification_preferences: Json | null
          privacy_settings: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delivery_preferences?: Json | null
          id?: string
          notification_preferences?: Json | null
          privacy_settings?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          delivery_preferences?: Json | null
          id?: string
          notification_preferences?: Json | null
          privacy_settings?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_transactions: {
        Row: {
          amount: number
          created_at: string | null
          customer_id: string
          description: string | null
          id: string
          metadata: Json | null
          payment_method: string | null
          processed_at: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          transaction_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          customer_id: string
          description?: string | null
          id?: string
          metadata?: Json | null
          payment_method?: string | null
          processed_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          transaction_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          payment_method?: string | null
          processed_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          transaction_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_transactions_reference_id_fkey"
            columns: ["reference_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_wallet: {
        Row: {
          available_balance: number
          bonus_balance: number
          carbon_credits: number | null
          created_at: string | null
          customer_id: string
          id: string
          total_spent: number
          updated_at: string | null
          virtual_account_id: string | null
        }
        Insert: {
          available_balance?: number
          bonus_balance?: number
          carbon_credits?: number | null
          created_at?: string | null
          customer_id: string
          id?: string
          total_spent?: number
          updated_at?: string | null
          virtual_account_id?: string | null
        }
        Update: {
          available_balance?: number
          bonus_balance?: number
          carbon_credits?: number | null
          created_at?: string | null
          customer_id?: string
          id?: string
          total_spent?: number
          updated_at?: string | null
          virtual_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_wallet_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_wallet_virtual_account_id_fkey"
            columns: ["virtual_account_id"]
            isOneToOne: false
            referencedRelation: "virtual_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_withdrawal_requests: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string | null
          customer_id: string
          failure_reason: string | null
          fee: number | null
          id: string
          net_amount: number
          processed_at: string | null
          requested_at: string | null
          status: string
          transfer_metadata: Json | null
          transfer_reference: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string | null
          customer_id: string
          failure_reason?: string | null
          fee?: number | null
          id?: string
          net_amount: number
          processed_at?: string | null
          requested_at?: string | null
          status?: string
          transfer_metadata?: Json | null
          transfer_reference?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string | null
          customer_id?: string
          failure_reason?: string | null
          fee?: number | null
          id?: string
          net_amount?: number
          processed_at?: string | null
          requested_at?: string | null
          status?: string
          transfer_metadata?: Json | null
          transfer_reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_withdrawal_requests_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "customer_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_withdrawal_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          accepted_at: string | null
          actual_distance: number | null
          cancelled_at: string | null
          carbon_saved: number | null
          created_at: string | null
          delivered_at: string | null
          delivering_at: string | null
          delivery_address_id: string | null
          delivery_fee: number | null
          delivery_location: Json | null
          eco_bonus: number | null
          estimated_delivery_time: string | null
          estimated_pickup_time: string | null
          id: string
          order_id: string | null
          picked_up_at: string | null
          picking_up_at: string | null
          pickup_address_id: string | null
          pickup_location: Json | null
          rider_earning: number | null
          rider_id: string | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["delivery_status"] | null
          tip_amount: number | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          actual_distance?: number | null
          cancelled_at?: string | null
          carbon_saved?: number | null
          created_at?: string | null
          delivered_at?: string | null
          delivering_at?: string | null
          delivery_address_id?: string | null
          delivery_fee?: number | null
          delivery_location?: Json | null
          eco_bonus?: number | null
          estimated_delivery_time?: string | null
          estimated_pickup_time?: string | null
          id?: string
          order_id?: string | null
          picked_up_at?: string | null
          picking_up_at?: string | null
          pickup_address_id?: string | null
          pickup_location?: Json | null
          rider_earning?: number | null
          rider_id?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["delivery_status"] | null
          tip_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          actual_distance?: number | null
          cancelled_at?: string | null
          carbon_saved?: number | null
          created_at?: string | null
          delivered_at?: string | null
          delivering_at?: string | null
          delivery_address_id?: string | null
          delivery_fee?: number | null
          delivery_location?: Json | null
          eco_bonus?: number | null
          estimated_delivery_time?: string | null
          estimated_pickup_time?: string | null
          id?: string
          order_id?: string | null
          picked_up_at?: string | null
          picking_up_at?: string | null
          pickup_address_id?: string | null
          pickup_location?: Json | null
          rider_earning?: number | null
          rider_id?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["delivery_status"] | null
          tip_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_pickup_address_id_fkey"
            columns: ["pickup_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          data: Json
          id: string
          last_error: string | null
          profile_id: string | null
          sent_at: string | null
          status: string
          subject: string
          template: string
          to_email: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          data?: Json
          id?: string
          last_error?: string | null
          profile_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template: string
          to_email: string
        }
        Update: {
          attempts?: number
          created_at?: string
          data?: Json
          id?: string
          last_error?: string | null
          profile_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_ratings: {
        Row: { id: string; order_id: string; customer_id: string; rider_id: string; rating: number; feedback: string | null; created_at: string }
        Insert: { id?: string; order_id: string; customer_id: string; rider_id: string; rating: number; feedback?: string | null; created_at?: string }
        Update: { id?: string; order_id?: string; customer_id?: string; rider_id?: string; rating?: number; feedback?: string | null; created_at?: string }
        Relationships: []
      }
      rider_rating_prompt_dismissals: {
        Row: { order_id: string; customer_id: string; dismissed_at: string }
        Insert: { order_id: string; customer_id: string; dismissed_at?: string }
        Update: { order_id?: string; customer_id?: string; dismissed_at?: string }
        Relationships: []
      }
      vendor_customers: {
        Row: {
          hidden_at: string | null
          hidden_reason: string | null
          hidden_by: string | null
          id: string; vendor_id: string; name: string; phone: string; place_name: string | null
          formatted_address: string; street: string | null; city: string | null; state: string | null
          country: string | null; place_id: string | null; latitude: number; longitude: number
          directions: string | null; created_at: string; updated_at: string
        }
        Insert: {
          hidden_at?: string | null
          hidden_reason?: string | null
          hidden_by?: string | null
          id?: string; vendor_id: string; name: string; phone: string; place_name?: string | null
          formatted_address: string; street?: string | null; city?: string | null; state?: string | null
          country?: string | null; place_id?: string | null; latitude: number; longitude: number
          directions?: string | null; created_at?: string; updated_at?: string
        }
        Update: {
          hidden_at?: string | null
          hidden_reason?: string | null
          hidden_by?: string | null
          id?: string; vendor_id?: string; name?: string; phone?: string; place_name?: string | null
          formatted_address?: string; street?: string | null; city?: string | null; state?: string | null
          country?: string | null; place_id?: string | null; latitude?: number; longitude?: number
          directions?: string | null; created_at?: string; updated_at?: string
        }
        Relationships: []
      }
      verifications: {
        Row: {
          profile_id: string
          role: string
          status: string
          access_while_pending: boolean
          status_before_suspension: string | null
          business_category_id: string | null
          is_registered_business: boolean | null
          business_license_path: string | null
          vehicle_type: string | null
          vehicle_model: string | null
          vehicle_year: number | null
          vehicle_color: string | null
          vehicle_registration: string | null
          id_document_type: string | null
          id_document_path: string | null
          rejection_reason: string | null
          suspension_reason: string | null
          submitted_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          profile_id: string
          role: string
          status: string
          access_while_pending?: boolean
          status_before_suspension?: string | null
          business_category_id?: string | null
          is_registered_business?: boolean | null
          business_license_path?: string | null
          vehicle_type?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          vehicle_color?: string | null
          vehicle_registration?: string | null
          id_document_type?: string | null
          id_document_path?: string | null
          rejection_reason?: string | null
          suspension_reason?: string | null
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          profile_id?: string
          role?: string
          status?: string
          access_while_pending?: boolean
          status_before_suspension?: string | null
          business_category_id?: string | null
          is_registered_business?: boolean | null
          business_license_path?: string | null
          vehicle_type?: string | null
          vehicle_model?: string | null
          vehicle_year?: number | null
          vehicle_color?: string | null
          vehicle_registration?: string | null
          id_document_type?: string | null
          id_document_path?: string | null
          rejection_reason?: string | null
          suspension_reason?: string | null
          submitted_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      business_categories: {
        Row: {
          id: string
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          profile_id: string
          email_enabled: boolean
          push_enabled: boolean
          updated_at: string
        }
        Insert: {
          profile_id: string
          email_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
        }
        Update: {
          profile_id?: string
          email_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          push_sent_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          priority: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          push_sent_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          priority?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          push_sent_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          priority?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_handover_codes: {
        Row: {
          code: string
          created_at: string
          failed_attempts: number
          kind: string
          order_id: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          failed_attempts?: number
          kind: string
          order_id: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          failed_attempts?: number
          kind?: string
          order_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_handover_codes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          carbon_impact: number | null
          created_at: string
          id: string
          is_eco_friendly: boolean | null
          order_id: string
          product_category: string | null
          product_description: string | null
          product_id: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          carbon_impact?: number | null
          created_at?: string
          id?: string
          is_eco_friendly?: boolean | null
          order_id: string
          product_category?: string | null
          product_description?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          carbon_impact?: number | null
          created_at?: string
          id?: string
          is_eco_friendly?: boolean | null
          order_id?: string
          product_category?: string | null
          product_description?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          notification_type: string
          order_id: string
          read_at: string | null
          recipient_id: string
          recipient_type: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          notification_type: string
          order_id: string
          read_at?: string | null
          recipient_id: string
          recipient_type: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          notification_type?: string
          order_id?: string
          read_at?: string | null
          recipient_id?: string
          recipient_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_by: string | null
          dispatch_priority: number
          base_rate: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          carbon_credits_earned: number | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          delivery_address: Json
          delivery_address_id: string | null
          delivery_fee: number | null
          delivery_type: string
          distance_fee: number | null
          distance_km: number | null
          estimated_delivery_time: string | null
          green_fee: number | null
          id: string
          is_late_night: boolean | null
          is_peak_hour: boolean | null
          is_student_order: boolean | null
          late_night_fee: number | null
          order_number: string
          order_type: string
          wallet_amount: number
          wallet_refunded: number
          payment_details: Json | null
          payment_gateway: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          picked_up_at: string | null
          pickup_started_at: string | null
          ready_for_pickup_at: string | null
          rider_assigned_at: string | null
          rider_id: string | null
          service_charge: number | null
          special_instructions: string | null
          status: string
          student_discount: number | null
          subscription_applied: boolean | null
          subtotal: number
          surge_fee: number | null
          time_slot: string | null
          total_amount: number
          updated_at: string
          vendor_accepted_at: string | null
          vendor_id: string | null
          verification_code: string | null
          weight_fee: number | null
          weight_kg: number | null
        }
        Insert: {
          cancelled_by?: string | null
          dispatch_priority?: number
          base_rate?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          carbon_credits_earned?: number | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          delivery_address: Json
          delivery_address_id?: string | null
          delivery_fee?: number | null
          delivery_type?: string
          distance_fee?: number | null
          distance_km?: number | null
          estimated_delivery_time?: string | null
          green_fee?: number | null
          id?: string
          is_late_night?: boolean | null
          is_peak_hour?: boolean | null
          is_student_order?: boolean | null
          late_night_fee?: number | null
          order_number?: string
          order_type?: string
          wallet_amount?: number
          wallet_refunded?: number
          payment_details?: Json | null
          payment_gateway?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          picked_up_at?: string | null
          pickup_started_at?: string | null
          ready_for_pickup_at?: string | null
          rider_assigned_at?: string | null
          rider_id?: string | null
          service_charge?: number | null
          special_instructions?: string | null
          status?: string
          student_discount?: number | null
          subscription_applied?: boolean | null
          subtotal: number
          surge_fee?: number | null
          time_slot?: string | null
          total_amount: number
          updated_at?: string
          vendor_accepted_at?: string | null
          vendor_id?: string | null
          verification_code?: string | null
          weight_fee?: number | null
          weight_kg?: number | null
        }
        Update: {
          cancelled_by?: string | null
          dispatch_priority?: number
          base_rate?: number | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          carbon_credits_earned?: number | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          delivery_address?: Json
          delivery_address_id?: string | null
          delivery_fee?: number | null
          delivery_type?: string
          distance_fee?: number | null
          distance_km?: number | null
          estimated_delivery_time?: string | null
          green_fee?: number | null
          id?: string
          is_late_night?: boolean | null
          is_peak_hour?: boolean | null
          is_student_order?: boolean | null
          late_night_fee?: number | null
          order_number?: string
          order_type?: string
          wallet_amount?: number
          wallet_refunded?: number
          payment_details?: Json | null
          payment_gateway?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          picked_up_at?: string | null
          pickup_started_at?: string | null
          ready_for_pickup_at?: string | null
          rider_assigned_at?: string | null
          rider_id?: string | null
          service_charge?: number | null
          special_instructions?: string | null
          status?: string
          student_discount?: number | null
          subscription_applied?: boolean | null
          subtotal?: number
          surge_fee?: number | null
          time_slot?: string | null
          total_amount?: number
          updated_at?: string
          vendor_accepted_at?: string | null
          vendor_id?: string | null
          verification_code?: string | null
          weight_fee?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_holds: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          order_id: string
          payment_reference: string
          platform_fee: number
          rider_amount: number
          rider_released_at: string | null
          status: string
          total_amount: number
          updated_at: string | null
          vendor_amount: number
          vendor_released_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          order_id: string
          payment_reference: string
          platform_fee?: number
          rider_amount: number
          rider_released_at?: string | null
          status?: string
          total_amount: number
          updated_at?: string | null
          vendor_amount: number
          vendor_released_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string
          payment_reference?: string
          platform_fee?: number
          rider_amount?: number
          rider_released_at?: string | null
          status?: string
          total_amount?: number
          updated_at?: string | null
          vendor_amount?: number
          vendor_released_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_holds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_logs: {
        Row: {
          amount: number | null
          created_at: string | null
          customer_id: string | null
          email: string | null
          error_message: string | null
          gateway: string | null
          id: string
          order_number: string | null
          reference: string | null
          status: string
          transaction_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          email?: string | null
          error_message?: string | null
          gateway?: string | null
          id?: string
          order_number?: string | null
          reference?: string | null
          status: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          email?: string | null
          error_message?: string | null
          gateway?: string | null
          id?: string
          order_number?: string | null
          reference?: string | null
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_config: {
        Row: {
          created_by: string | null
          note: string | null
          base_rate: number | null
          created_at: string | null
          distance_rate_per_km: number | null
          green_fee: number | null
          id: string
          late_night_fee: number | null
          rider_share_rate: number | null
          service_charge_rate: number | null
          student_discount_percent: number | null
          subscription_monthly_rate: number | null
          surge_multiplier: number | null
          vendor_commission_rate: number | null
          weight_rates: Json | null
        }
        Insert: {
          created_by?: string | null
          note?: string | null
          base_rate?: number | null
          created_at?: string | null
          distance_rate_per_km?: number | null
          green_fee?: number | null
          id?: string
          late_night_fee?: number | null
          rider_share_rate?: number | null
          service_charge_rate?: number | null
          student_discount_percent?: number | null
          subscription_monthly_rate?: number | null
          surge_multiplier?: number | null
          vendor_commission_rate?: number | null
          weight_rates?: Json | null
        }
        Update: {
          created_by?: string | null
          note?: string | null
          base_rate?: number | null
          created_at?: string | null
          distance_rate_per_km?: number | null
          green_fee?: number | null
          id?: string
          late_night_fee?: number | null
          rider_share_rate?: number | null
          service_charge_rate?: number | null
          student_discount_percent?: number | null
          subscription_monthly_rate?: number | null
          surge_multiplier?: number | null
          vendor_commission_rate?: number | null
          weight_rates?: Json | null
        }
        Relationships: []
      }
      products: {
        Row: {
          carbon_impact: number | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_eco_friendly: boolean | null
          name: string
          price: number
          status: string | null
          stock_quantity: number | null
          track_stock: boolean
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          carbon_impact?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_eco_friendly?: boolean | null
          name: string
          price: number
          status?: string | null
          stock_quantity?: number | null
          track_stock?: boolean
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          carbon_impact?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_eco_friendly?: boolean | null
          name?: string
          price?: number
          status?: string | null
          stock_quantity?: number | null
          track_stock?: boolean
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          suspension_reason: string | null
          avatar: string | null
          carbon_credits: number | null
          created_at: string | null
          date_of_birth: string | null
          email: string
          email_verified_at: string | null
          gender: string | null
          id: string
          last_active: string | null
          last_login_at: string | null
          login_count: number | null
          mfa_enabled: boolean | null
          name: string
          phone: string | null
          role: string
          status: string | null
          store_banner_url: string | null
          verified: boolean | null
        }
        Insert: {
          suspension_reason?: string | null
          avatar?: string | null
          carbon_credits?: number | null
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          email_verified_at?: string | null
          gender?: string | null
          id: string
          last_active?: string | null
          last_login_at?: string | null
          login_count?: number | null
          mfa_enabled?: boolean | null
          name: string
          phone?: string | null
          role?: string
          status?: string | null
          store_banner_url?: string | null
          verified?: boolean | null
        }
        Update: {
          suspension_reason?: string | null
          avatar?: string | null
          carbon_credits?: number | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          email_verified_at?: string | null
          gender?: string | null
          id?: string
          last_active?: string | null
          last_login_at?: string | null
          login_count?: number | null
          mfa_enabled?: boolean | null
          name?: string
          phone?: string | null
          role?: string
          status?: string | null
          store_banner_url?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      recycling_partners: {
        Row: {
          contact_info: Json | null
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          materials: string[]
          name: string
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          contact_info?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          materials: string[]
          name: string
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          contact_info?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          materials?: string[]
          name?: string
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rider_achievements: {
        Row: {
          achievement_type: string
          created_at: string | null
          description: string | null
          earned_date: string | null
          icon: string | null
          id: string
          progress: number | null
          rider_id: string | null
          target: number | null
          title: string
        }
        Insert: {
          achievement_type: string
          created_at?: string | null
          description?: string | null
          earned_date?: string | null
          icon?: string | null
          id?: string
          progress?: number | null
          rider_id?: string | null
          target?: number | null
          title: string
        }
        Update: {
          achievement_type?: string
          created_at?: string | null
          description?: string | null
          earned_date?: string | null
          icon?: string | null
          id?: string
          progress?: number | null
          rider_id?: string | null
          target?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "rider_achievements_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string | null
          bank_name: string
          bvn: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          rider_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code?: string | null
          bank_name: string
          bvn?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          rider_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string | null
          bank_name?: string
          bvn?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          rider_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_bank_details_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_earnings: {
        Row: {
          carbon_credits_earned: number | null
          created_at: string | null
          delivery_fee: number
          delivery_id: string | null
          earnings_date: string
          eco_bonus: number
          id: string
          order_id: string | null
          released_at: string | null
          rider_id: string
          status: string
          tip_amount: number
          total_earnings: number
          updated_at: string | null
        }
        Insert: {
          carbon_credits_earned?: number | null
          created_at?: string | null
          delivery_fee?: number
          delivery_id?: string | null
          earnings_date?: string
          eco_bonus?: number
          id?: string
          order_id?: string | null
          released_at?: string | null
          rider_id: string
          status?: string
          tip_amount?: number
          total_earnings?: number
          updated_at?: string | null
        }
        Update: {
          carbon_credits_earned?: number | null
          created_at?: string | null
          delivery_fee?: number
          delivery_id?: string | null
          earnings_date?: string
          eco_bonus?: number
          id?: string
          order_id?: string | null
          released_at?: string | null
          rider_id?: string
          status?: string
          tip_amount?: number
          total_earnings?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_earnings_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_earnings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_earnings_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_payout_requests: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string | null
          failure_reason: string | null
          fee: number | null
          id: string
          net_amount: number
          paystack_reference: string | null
          processed_at: string | null
          requested_at: string | null
          rider_id: string
          status: string
          transfer_metadata: Json | null
          transfer_reference: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string | null
          failure_reason?: string | null
          fee?: number | null
          id?: string
          net_amount: number
          paystack_reference?: string | null
          processed_at?: string | null
          requested_at?: string | null
          rider_id: string
          status?: string
          transfer_metadata?: Json | null
          transfer_reference?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string | null
          failure_reason?: string | null
          fee?: number | null
          id?: string
          net_amount?: number
          paystack_reference?: string | null
          processed_at?: string | null
          requested_at?: string | null
          rider_id?: string
          status?: string
          transfer_metadata?: Json | null
          transfer_reference?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_payout_requests_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "rider_bank_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_payout_requests_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_profiles: {
        Row: {
          bank_details: Json | null
          created_at: string | null
          current_location: Json | null
          delivery_preferences: Json | null
          id: string
          is_verified: boolean | null
          license_number: string | null
          notification_preferences: Json | null
          rating: number | null
          rider_status: Database["public"]["Enums"]["rider_status"] | null
          total_deliveries: number | null
          updated_at: string | null
          vehicle_registration: string | null
          vehicle_type: string | null
          verification_documents: Json | null
          verification_status: string | null
        }
        Insert: {
          bank_details?: Json | null
          created_at?: string | null
          current_location?: Json | null
          delivery_preferences?: Json | null
          id: string
          is_verified?: boolean | null
          license_number?: string | null
          notification_preferences?: Json | null
          rating?: number | null
          rider_status?: Database["public"]["Enums"]["rider_status"] | null
          total_deliveries?: number | null
          updated_at?: string | null
          vehicle_registration?: string | null
          vehicle_type?: string | null
          verification_documents?: Json | null
          verification_status?: string | null
        }
        Update: {
          bank_details?: Json | null
          created_at?: string | null
          current_location?: Json | null
          delivery_preferences?: Json | null
          id?: string
          is_verified?: boolean | null
          license_number?: string | null
          notification_preferences?: Json | null
          rating?: number | null
          rider_status?: Database["public"]["Enums"]["rider_status"] | null
          total_deliveries?: number | null
          updated_at?: string | null
          vehicle_registration?: string | null
          vehicle_type?: string | null
          verification_documents?: Json | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_reviews: {
        Row: {
          comment: string | null
          communication_rating: number | null
          created_at: string | null
          customer_id: string | null
          delivery_rating: number | null
          id: string
          order_id: string | null
          rating: number
          rider_id: string | null
          updated_at: string | null
        }
        Insert: {
          comment?: string | null
          communication_rating?: number | null
          created_at?: string | null
          customer_id?: string | null
          delivery_rating?: number | null
          id?: string
          order_id?: string | null
          rating: number
          rider_id?: string | null
          updated_at?: string | null
        }
        Update: {
          comment?: string | null
          communication_rating?: number | null
          created_at?: string | null
          customer_id?: string | null
          delivery_rating?: number | null
          id?: string
          order_id?: string | null
          rating?: number
          rider_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_reviews_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_schedules: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          is_available: boolean | null
          rider_id: string | null
          schedule_date: string
          start_time: string
          total_deliveries: number | null
          total_earnings: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          is_available?: boolean | null
          rider_id?: string | null
          schedule_date: string
          start_time: string
          total_deliveries?: number | null
          total_earnings?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          is_available?: boolean | null
          rider_id?: string | null
          schedule_date?: string
          start_time?: string
          total_deliveries?: number | null
          total_earnings?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_schedules_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string | null
          description: string | null
          fee: number | null
          id: string
          metadata: Json | null
          net_amount: number
          processed_at: string | null
          reference_id: string | null
          reference_type: string | null
          rider_id: string
          status: string
          transaction_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          created_at?: string | null
          description?: string | null
          fee?: number | null
          id?: string
          metadata?: Json | null
          net_amount: number
          processed_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          rider_id: string
          status?: string
          transaction_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string | null
          description?: string | null
          fee?: number | null
          id?: string
          metadata?: Json | null
          net_amount?: number
          processed_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          rider_id?: string
          status?: string
          transaction_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "rider_bank_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_transactions_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rider_wallet: {
        Row: {
          available_balance: number
          carbon_credits: number | null
          created_at: string | null
          id: string
          pending_balance: number
          rider_id: string
          total_earned: number
          total_withdrawn: number
          updated_at: string | null
          virtual_account_id: string | null
        }
        Insert: {
          available_balance?: number
          carbon_credits?: number | null
          created_at?: string | null
          id?: string
          pending_balance?: number
          rider_id: string
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string | null
          virtual_account_id?: string | null
        }
        Update: {
          available_balance?: number
          carbon_credits?: number | null
          created_at?: string | null
          id?: string
          pending_balance?: number
          rider_id?: string
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string | null
          virtual_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rider_wallet_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rider_wallet_virtual_account_id_fkey"
            columns: ["virtual_account_id"]
            isOneToOne: false
            referencedRelation: "virtual_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount: number
          created_at: string | null
          fee: number | null
          id: string
          metadata: Json | null
          net_amount: number
          order_id: string
          payment_reference: string | null
          paystack_transfer_code: string | null
          recipient_id: string
          recipient_type: string
          settled_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          fee?: number | null
          id?: string
          metadata?: Json | null
          net_amount: number
          order_id: string
          payment_reference?: string | null
          paystack_transfer_code?: string | null
          recipient_id: string
          recipient_type: string
          settled_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          fee?: number | null
          id?: string
          metadata?: Json | null
          net_amount?: number
          order_id?: string
          payment_reference?: string | null
          paystack_transfer_code?: string | null
          recipient_id?: string
          recipient_type?: string
          settled_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settlements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_subscriptions: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          payment_reference: string | null
          start_date: string | null
          status: string | null
          student_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          payment_reference?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          payment_reference?: string | null
          start_date?: string | null
          status?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bank_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string | null
          bank_name: string
          created_at: string | null
          id: string
          is_default: boolean | null
          is_verified: boolean | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code?: string | null
          bank_name: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string | null
          bank_name?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          is_verified?: boolean | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bank_accounts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payout_requests: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string | null
          failure_reason: string | null
          fee: number | null
          id: string
          net_amount: number
          processed_at: string | null
          requested_at: string | null
          status: string
          transfer_metadata: Json | null
          transfer_reference: string | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          created_at?: string | null
          failure_reason?: string | null
          fee?: number | null
          id?: string
          net_amount: number
          processed_at?: string | null
          requested_at?: string | null
          status?: string
          transfer_metadata?: Json | null
          transfer_reference?: string | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string | null
          failure_reason?: string | null
          fee?: number | null
          id?: string
          net_amount?: number
          processed_at?: string | null
          requested_at?: string | null
          status?: string
          transfer_metadata?: Json | null
          transfer_reference?: string | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payout_requests_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "vendor_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payout_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_ratings: {
        Row: {
          hidden_at: string | null
          hidden_reason: string | null
          hidden_by: string | null
          created_at: string | null
          customer_id: string
          delivery_rating: number | null
          feedback: string | null
          id: string
          order_id: string
          product_quality_rating: number | null
          rating: number
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          hidden_at?: string | null
          hidden_reason?: string | null
          hidden_by?: string | null
          created_at?: string | null
          customer_id: string
          delivery_rating?: number | null
          feedback?: string | null
          id?: string
          order_id: string
          product_quality_rating?: number | null
          rating: number
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          hidden_at?: string | null
          hidden_reason?: string | null
          hidden_by?: string | null
          created_at?: string | null
          customer_id?: string
          delivery_rating?: number | null
          feedback?: string | null
          id?: string
          order_id?: string
          product_quality_rating?: number | null
          rating?: number
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_ratings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_ratings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_recycling_activities: {
        Row: {
          activity_date: string
          created_at: string | null
          id: string
          material_type: string
          partner_name: string
          points_earned: number | null
          vendor_id: string
          weight_kg: number
        }
        Insert: {
          activity_date: string
          created_at?: string | null
          id?: string
          material_type: string
          partner_name: string
          points_earned?: number | null
          vendor_id: string
          weight_kg: number
        }
        Update: {
          activity_date?: string
          created_at?: string | null
          id?: string
          material_type?: string
          partner_name?: string
          points_earned?: number | null
          vendor_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_recycling_activities_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_recycling_stats: {
        Row: {
          carbon_saved_kg: number | null
          customer_participation_rate: number | null
          id: string
          total_recycled_kg: number | null
          updated_at: string | null
          vendor_id: string
          vendor_recycling_rate: number | null
        }
        Insert: {
          carbon_saved_kg?: number | null
          customer_participation_rate?: number | null
          id?: string
          total_recycled_kg?: number | null
          updated_at?: string | null
          vendor_id: string
          vendor_recycling_rate?: number | null
        }
        Update: {
          carbon_saved_kg?: number | null
          customer_participation_rate?: number | null
          id?: string
          total_recycled_kg?: number | null
          updated_at?: string | null
          vendor_id?: string
          vendor_recycling_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_recycling_stats_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_settings: {
        Row: {
          business_license: string | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          notification_preferences: Json | null
          security_settings: Json | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          business_license?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          notification_preferences?: Json | null
          security_settings?: Json | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          business_license?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          notification_preferences?: Json | null
          security_settings?: Json | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_settings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_stats: {
        Row: {
          id: string
          rating: number | null
          recycling_rate: number | null
          total_carbon_saved: number | null
          total_orders: number | null
          total_revenue: number | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          id?: string
          rating?: number | null
          recycling_rate?: number | null
          total_carbon_saved?: number | null
          total_orders?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          id?: string
          rating?: number | null
          recycling_rate?: number | null
          total_carbon_saved?: number | null
          total_orders?: number | null
          total_revenue?: number | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_stats_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string | null
          description: string | null
          fee: number | null
          id: string
          metadata: Json | null
          net_amount: number
          processed_at: string | null
          reference_id: string | null
          reference_type: string | null
          status: string
          transaction_id: string
          type: string
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          created_at?: string | null
          description?: string | null
          fee?: number | null
          id?: string
          metadata?: Json | null
          net_amount: number
          processed_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          transaction_id: string
          type: string
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string | null
          description?: string | null
          fee?: number | null
          id?: string
          metadata?: Json | null
          net_amount?: number
          processed_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          transaction_id?: string
          type?: string
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "vendor_bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_wallet: {
        Row: {
          available_balance: number
          created_at: string | null
          id: string
          pending_balance: number
          total_earned: number
          total_withdrawn: number
          updated_at: string | null
          vendor_id: string
          virtual_account_id: string | null
        }
        Insert: {
          available_balance?: number
          created_at?: string | null
          id?: string
          pending_balance?: number
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string | null
          vendor_id: string
          virtual_account_id?: string | null
        }
        Update: {
          available_balance?: number
          created_at?: string | null
          id?: string
          pending_balance?: number
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string | null
          vendor_id?: string
          virtual_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_wallet_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_wallet_virtual_account_id_fkey"
            columns: ["virtual_account_id"]
            isOneToOne: false
            referencedRelation: "virtual_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          profile_id: string
          role: string
          squad_customer_identifier: string
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          profile_id: string
          role: string
          squad_customer_identifier: string
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          profile_id?: string
          role?: string
          squad_customer_identifier?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_dashboard_stats: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      admin_earnings: {
        Args: { p_from?: string; p_to?: string; p_order_type?: string; p_limit?: number; p_offset?: number }
        Returns: {
          order_id: string; order_number: string; order_type: string; delivered_at: string; paid_by: string
          payer_name: string | null; vendor_name: string | null; rider_name: string | null
          amount_paid: number; vendor_got: number; rider_got: number
          cydex_from_customer: number; cydex_from_vendor: number; cydex_from_rider: number; cydex_total: number
          total_count: number
          sum_amount_paid: number; sum_vendor_got: number; sum_rider_got: number
          sum_cydex_from_customer: number; sum_cydex_from_vendor: number; sum_cydex_from_rider: number; sum_cydex_total: number
        }[]
      }
      admin_orders_needing_attention: {
        Args: Record<PropertyKey, never>
        Returns: {
          order_id: string; order_number: string; order_type: string; status: string; reason: string; since: string
          vendor_name: string | null; rider_name: string | null
        }[]
      }
      admin_orders: {
        Args: { p_search?: string; p_status?: string; p_order_type?: string; p_limit?: number; p_offset?: number }
        Returns: {
          id: string; order_number: string; order_type: string; status: string; payment_status: string; total_amount: number
          created_at: string; delivered_at: string | null; customer_name: string | null; recipient_name: string | null
          vendor_name: string | null; rider_id: string | null; rider_name: string | null; item_count: number; total_count: number
        }[]
      }
      admin_order_detail: {
        Args: { p_order_id: string }
        Returns: Json
      }
      admin_cancel_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      admin_unlock_handover_code: {
        Args: { p_order_id: string; p_kind: string }
        Returns: undefined
      }
      admin_reject_payout: {
        Args: { p_role: string; p_id: string; p_reason: string }
        Returns: undefined
      }
      admin_payouts: {
        Args: { p_status?: string; p_limit?: number; p_offset?: number }
        Returns: {
          role: string; id: string; owner_id: string; owner_name: string | null; owner_email: string | null
          bank_name: string | null; account_number: string | null; account_name: string | null
          amount: number; fee: number | null; net_amount: number | null; status: string; failure_reason: string | null
          transfer_reference: string | null; created_at: string; processed_at: string | null; total_count: number
        }[]
      }
      admin_wallets: {
        Args: { p_role?: string; p_search?: string; p_limit?: number; p_offset?: number }
        Returns: {
          role: string; profile_id: string; name: string | null; email: string | null; available_balance: number | null
          total_earned: number | null; total_withdrawn: number | null; updated_at: string | null; total_count: number
        }[]
      }
      admin_update_pricing: {
        Args: {
          p_base_rate: number; p_distance_rate_per_km: number; p_service_charge_rate: number
          p_vendor_commission_rate: number; p_rider_share_rate: number; p_rider_request_commission_rate: number
          p_note?: string
        }
        Returns: undefined
      }
      admin_users: {
        Args: { p_search?: string; p_role?: string; p_limit?: number; p_offset?: number }
        Returns: {
          id: string; name: string | null; email: string | null; phone: string | null; role: string; status: string
          suspension_reason: string | null; verification_status: string | null; created_at: string
          last_login_at: string | null; joined: boolean; total_count: number
        }[]
      }
      admin_set_customer_suspended: {
        Args: { p_profile_id: string; p_suspended: boolean; p_reason?: string }
        Returns: undefined
      }
      admin_set_review_hidden: {
        Args: { p_kind: string; p_id: string; p_hidden: boolean; p_reason?: string }
        Returns: undefined
      }
      admin_retry_email: {
        Args: { p_id: string }
        Returns: undefined
      }
      submit_vendor_onboarding: {
        Args: { p_store_name: string; p_phone: string; p_category_id: string; p_is_registered: boolean; p_license_path?: string }
        Returns: string
      }
      submit_rider_onboarding: {
        Args: {
          p_phone: string; p_vehicle_type: string; p_vehicle_model: string | null; p_vehicle_year: number | null
          p_vehicle_color: string | null; p_vehicle_registration: string | null; p_id_document_type: string; p_id_document_path: string
        }
        Returns: string
      }
      admin_review_verification: {
        Args: { p_profile_id: string; p_action: string; p_reason?: string }
        Returns: string
      }
      admin_relieve_rider: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      admin_reassign_order: {
        Args: { p_order_id: string; p_rider_id: string; p_reason: string }
        Returns: undefined
      }
      admin_rider_candidates: {
        Args: { p_order_id: string }
        Returns: { rider_id: string; name: string | null; phone: string | null; online: boolean; distance_km: number | null; busy: boolean }[]
      }
      register_push_subscription: {
        Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string }
        Returns: undefined
      }
      rider_request_quote: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: {
          status: string; distance_km: number | null; base_rate: number | null; distance_fee: number | null
          delivery_fee: number | null; commission: number | null; total_amount: number | null
          wallet_balance: number; wallet_amount: number | null; card_amount: number | null
        }[]
      }
      create_rider_request: {
        Args: {
          p_recipient_name: string; p_recipient_phone: string; p_location: Json
          p_package_details?: string; p_save_customer?: boolean
        }
        Returns: Database["public"]["Tables"]["orders"]["Row"]
      }
      cancel_rider_request: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      vendor_cards_near_address: {
        Args: { p_address_id: string }
        Returns: {
          vendor_id: string; name: string; logo_url: string | null; banner_url: string | null; verified: boolean
          distance_km: number; product_count: number; categories: string[]; average_rating: number | null
          rating_count: number; recent_orders: number
        }[]
      }
      vendor_storefront: {
        Args: { p_vendor_id: string; p_address_id?: string }
        Returns: {
          vendor_id: string; name: string; logo_url: string | null; banner_url: string | null; verified: boolean
          store_address: string | null; average_rating: number | null; rating_count: number; distance_km: number | null
        }[]
      }
      rider_rating_prompt: {
        Args: Record<PropertyKey, never>
        Returns: {
          order_id: string; order_number: string; rider_id: string; rider_name: string | null
          rider_avatar: string | null; delivered_at: string | null
        }[]
      }
      address_snapshot: {
        Args: { a: Database["public"]["Tables"]["addresses"]["Row"] }
        Returns: Json
      }
      calculate_order_price: {
        Args: { p_address_id: string; p_subtotal: number; p_vendor_id: string }
        Returns: Record<string, unknown>
      }
      calculate_rider_rating: {
        Args: { rider_uuid: string }
        Returns: {
          average_rating: number
          total_reviews: number
        }[]
      }
      calculate_settlement_amounts: {
        Args: { p_order_id: string }
        Returns: Record<string, unknown>
      }
      cart_subtotal: {
        Args: { p_items: Json; p_vendor_id: string }
        Returns: number
      }
      check_handover_code: {
        Args: { p_code: string; p_kind: string; p_order_id: string }
        Returns: boolean
      }
      confirm_order_payment: {
        Args: {
          p_amount: number
          p_details?: Json
          p_order_number: string
          p_reference: string
        }
        Returns: string
      }
      create_order_notification: {
        Args: {
          p_message: string
          p_notification_type: string
          p_order_id: string
          p_recipient_id: string
          p_recipient_type: string
          p_title: string
        }
        Returns: string
      }
      create_wallet_for: {
        Args: { p_profile_id: string; p_role: string }
        Returns: undefined
      }
      current_user_role: { Args: never; Returns: string }
      customer_cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      customer_vendor_radius_m: { Args: never; Returns: number }
      distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      ensure_my_wallet: {
        Args: never
        Returns: {
          id: string
          virtual_account_id: string
        }[]
      }
      generate_order_number: { Args: never; Returns: string }
      generate_verification_code: { Args: never; Returns: string }
      get_vendor_average_rating: {
        Args: { vendor_uuid: string }
        Returns: {
          average_delivery_rating: number
          average_product_quality_rating: number
          average_rating: number
          total_ratings: number
        }[]
      }
      get_wallet_balance: {
        Args: { p_user_id: string; p_user_role: string }
        Returns: {
          available_balance: number
          pending_balance: number
          total_earned: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_vendor_of_paid_order_for: {
        Args: { p_customer_id: string }
        Returns: boolean
      }
      mark_stale_riders_offline: { Args: never; Returns: number }
      new_handover_code: { Args: never; Returns: string }
      notify_user: {
        Args: {
          p_message: string
          p_order?: Database["public"]["Tables"]["orders"]["Row"]
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      order_for_action: {
        Args: { p_as: string; p_order_id: string }
        Returns: {
          base_rate: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          carbon_credits_earned: number | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          delivery_address: Json
          delivery_address_id: string | null
          delivery_fee: number | null
          delivery_type: string
          distance_fee: number | null
          distance_km: number | null
          estimated_delivery_time: string | null
          green_fee: number | null
          id: string
          is_late_night: boolean | null
          is_peak_hour: boolean | null
          is_student_order: boolean | null
          late_night_fee: number | null
          order_number: string
          payment_details: Json | null
          payment_gateway: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          picked_up_at: string | null
          pickup_started_at: string | null
          ready_for_pickup_at: string | null
          rider_assigned_at: string | null
          rider_id: string | null
          service_charge: number | null
          special_instructions: string | null
          status: string
          student_discount: number | null
          subscription_applied: boolean | null
          subtotal: number
          surge_fee: number | null
          time_slot: string | null
          total_amount: number
          updated_at: string
          vendor_accepted_at: string | null
          vendor_id: string | null
          verification_code: string | null
          weight_fee: number | null
          weight_kg: number | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      order_pickup_within_rider_radius: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      payout_fee_rate: { Args: never; Returns: number }
      place_order: {
        Args: {
          p_address_id: string
          p_items: Json
          p_special_instructions?: string
          p_vendor_id: string
        }
        Returns: {
          base_rate: number | null
          cancel_reason: string | null
          cancelled_at: string | null
          carbon_credits_earned: number | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          delivery_address: Json
          delivery_address_id: string | null
          delivery_fee: number | null
          delivery_type: string
          distance_fee: number | null
          distance_km: number | null
          estimated_delivery_time: string | null
          green_fee: number | null
          id: string
          is_late_night: boolean | null
          is_peak_hour: boolean | null
          is_student_order: boolean | null
          late_night_fee: number | null
          order_number: string
          payment_details: Json | null
          payment_gateway: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          picked_up_at: string | null
          pickup_started_at: string | null
          ready_for_pickup_at: string | null
          rider_assigned_at: string | null
          rider_id: string | null
          service_charge: number | null
          special_instructions: string | null
          status: string
          student_discount: number | null
          subscription_applied: boolean | null
          subtotal: number
          surge_fee: number | null
          time_slot: string | null
          total_amount: number
          updated_at: string
          vendor_accepted_at: string | null
          vendor_id: string | null
          verification_code: string | null
          weight_fee: number | null
          weight_kg: number | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      queue_email: {
        Args: {
          p_data: Json
          p_subject: string
          p_template: string
          p_user_id: string
        }
        Returns: undefined
      }
      quote_order: {
        Args: { p_address_id: string; p_items: Json; p_vendor_id: string }
        Returns: {
          base_rate: number
          delivery_fee: number
          distance_fee: number
          distance_km: number
          service_charge: number
          status: string
          subtotal: number
          total_amount: number
        }[]
      }
      refund_order: { Args: { p_order_id: string }; Returns: undefined }
      request_payout: {
        Args: { p_amount: number; p_bank_account_id: string }
        Returns: string
      }
      rider_accept_order: { Args: { p_order_id: string }; Returns: undefined }
      rider_confirm_delivery: {
        Args: { p_code: string; p_order_id: string }
        Returns: boolean
      }
      rider_order_radius_m: { Args: never; Returns: number }
      rider_start_pickup: { Args: { p_order_id: string }; Returns: undefined }
      settle_payout: {
        Args: {
          p_id: string
          p_metadata?: Json
          p_reason?: string
          p_reference?: string
          p_role: string
          p_status: string
        }
        Returns: string
      }
      shares_order_with: { Args: { p_profile_id: string }; Returns: boolean }
      update_customer_wallet_on_payment: {
        Args: { p_amount: number; p_customer_id: string }
        Returns: undefined
      }
      vendor_accept_order: { Args: { p_order_id: string }; Returns: undefined }
      vendor_confirm_pickup: {
        Args: { p_code: string; p_order_id: string }
        Returns: boolean
      }
      vendor_mark_ready: { Args: { p_order_id: string }; Returns: undefined }
      vendor_reject_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: undefined
      }
      vendors_near_address: {
        Args: { p_address_id: string }
        Returns: {
          distance_km: number
          vendor_id: string
        }[]
      }
      within_rider_radius: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: boolean
      }
    }
    Enums: {
      delivery_status:
        | "available"
        | "accepted"
        | "picking_up"
        | "picked_up"
        | "delivering"
        | "delivered"
        | "cancelled"
      rider_status: "offline" | "available" | "busy" | "break"
      vehicle_type_enum: "walking" | "bicycle" | "motorcycle" | "car" | "van"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      delivery_status: [
        "available",
        "accepted",
        "picking_up",
        "picked_up",
        "delivering",
        "delivered",
        "cancelled",
      ],
      rider_status: ["offline", "available", "busy", "break"],
      vehicle_type_enum: ["walking", "bicycle", "motorcycle", "car", "van"],
    },
  },
} as const
