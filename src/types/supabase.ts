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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounts_receivable: {
        Row: {
          created_at: string | null
          customer_id: string
          due_date: string
          id: string
          organization_id: string
          pending_balance: number
          sales_order_id: string
          status: Database["public"]["Enums"]["receivable_status"]
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          due_date: string
          id?: string
          organization_id: string
          pending_balance: number
          sales_order_id: string
          status?: Database["public"]["Enums"]["receivable_status"]
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          due_date?: string
          id?: string
          organization_id?: string
          pending_balance?: number
          sales_order_id?: string
          status?: Database["public"]["Enums"]["receivable_status"]
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: true
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          business_name: string
          city: string | null
          client_number: string | null
          created_at: string | null
          credit_limit: number | null
          cuit: string | null
          email: string | null
          fantasy_name: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          phone: string | null
          tax_condition: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          city?: string | null
          client_number?: string | null
          created_at?: string | null
          credit_limit?: number | null
          cuit?: string | null
          email?: string | null
          fantasy_name?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          phone?: string | null
          tax_condition?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          city?: string | null
          client_number?: string | null
          created_at?: string | null
          credit_limit?: number | null
          cuit?: string | null
          email?: string | null
          fantasy_name?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          phone?: string | null
          tax_condition?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invitation_type: Database["public"]["Enums"]["invitation_type"]
          invited_by_user_id: string
          invited_email: string
          is_owner: boolean
          organization_id: string
          role_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          invitation_type?: Database["public"]["Enums"]["invitation_type"]
          invited_by_user_id: string
          invited_email: string
          is_owner?: boolean
          organization_id: string
          role_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invitation_type?: Database["public"]["Enums"]["invitation_type"]
          invited_by_user_id?: string
          invited_email?: string
          is_owner?: boolean
          organization_id?: string
          role_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          is_owner: boolean
          organization_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          is_owner?: boolean
          organization_id: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          is_owner?: boolean
          organization_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          cuit: string | null
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          created_at?: string | null
          cuit?: string | null
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          created_at?: string | null
          cuit?: string | null
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      permissions: {
        Row: {
          description: string | null
          id: string
          key: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: []
      }
      price_list_items: {
        Row: {
          cost_price: number
          id: string
          price_list_id: string
          product_id: string
        }
        Insert: {
          cost_price: number
          id?: string
          price_list_id: string
          product_id: string
        }
        Update: {
          cost_price?: number
          id?: string
          price_list_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_list_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_list_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_list_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["active_price_list_id"]
          },
          {
            foreignKeyName: "price_list_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organization_id: string
          supplier_id: string
          updated_at: string | null
          valid_from: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          supplier_id: string
          updated_at?: string | null
          valid_from: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          supplier_id?: string
          updated_at?: string | null
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lots: {
        Row: {
          created_at: string | null
          expiration_date: string
          id: string
          lot_number: string
          organization_id: string
          product_id: string
          quantity_available: number
          unit_quantity_available: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expiration_date: string
          id?: string
          lot_number: string
          organization_id: string
          product_id: string
          quantity_available?: number
          unit_quantity_available?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expiration_date?: string
          id?: string
          lot_number?: string
          organization_id?: string
          product_id?: string
          quantity_available?: number
          unit_quantity_available?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          boxes_per_pallet: number | null
          brand: string | null
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          organization_id: string
          profit_margin: number | null
          sale_price: number | null
          sanitary_registration: string | null
          sku: string
          supplier_id: string | null
          tracks_stock_units: boolean | null
          unit_of_measure: Database["public"]["Enums"]["unit_of_measure_type"]
          units_per_box: number | null
          updated_at: string | null
          weight_per_unit: number | null
        }
        Insert: {
          boxes_per_pallet?: number | null
          brand?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          organization_id: string
          profit_margin?: number | null
          sale_price?: number | null
          sanitary_registration?: string | null
          sku: string
          supplier_id?: string | null
          tracks_stock_units?: boolean | null
          unit_of_measure?: Database["public"]["Enums"]["unit_of_measure_type"]
          units_per_box?: number | null
          updated_at?: string | null
          weight_per_unit?: number | null
        }
        Update: {
          boxes_per_pallet?: number | null
          brand?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          organization_id?: string
          profit_margin?: number | null
          sale_price?: number | null
          sanitary_registration?: string | null
          sku?: string
          supplier_id?: string | null
          tracks_stock_units?: boolean | null
          unit_of_measure?: Database["public"]["Enums"]["unit_of_measure_type"]
          units_per_box?: number | null
          updated_at?: string | null
          weight_per_unit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          subtotal: number
          unit_cost: number
          unit_quantity: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          subtotal?: number
          unit_cost?: number
          unit_quantity?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          subtotal?: number
          unit_cost?: number
          unit_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_order_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_taxes: {
        Row: {
          base_amount: number
          created_at: string | null
          id: string
          name: string
          organization_id: string
          purchase_order_id: string
          rate: number
          tax_amount: number
          tax_id: string
        }
        Insert: {
          base_amount: number
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
          purchase_order_id: string
          rate: number
          tax_amount: number
          tax_id: string
        }
        Update: {
          base_amount?: number
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          purchase_order_id?: string
          rate?: number
          tax_amount?: number
          tax_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_taxes_order_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_taxes_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_taxes_tax_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivery_date: string | null
          id: string
          logistics: string | null
          organization_id: string
          payment_due_date: string | null
          purchase_date: string
          purchase_number: number | null
          remittance_number: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_amount: number | null
          supplier_id: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string | null
          id?: string
          logistics?: string | null
          organization_id: string
          payment_due_date?: string | null
          purchase_date?: string
          purchase_number?: number | null
          remittance_number?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_amount?: number | null
          supplier_id: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivery_date?: string | null
          id?: string
          logistics?: string | null
          organization_id?: string
          payment_due_date?: string | null
          purchase_date?: string
          purchase_number?: number | null
          remittance_number?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_amount?: number | null
          supplier_id?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      receivable_payments: {
        Row: {
          account_receivable_id: string
          amount: number
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference_number: string | null
        }
        Insert: {
          account_receivable_id: string
          amount: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_date?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference_number?: string | null
        }
        Update: {
          account_receivable_id?: string
          amount?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receivable_payments_ar_fkey"
            columns: ["account_receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          id: string
          key: string
          name: string
          organization_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          name: string
          organization_id: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          base_price: number
          created_at: string | null
          discount_amount: number | null
          discount_percentage: number | null
          id: string
          organization_id: string
          product_id: string
          quantity: number
          sales_order_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          base_price?: number
          created_at?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          organization_id: string
          product_id: string
          quantity: number
          sales_order_id: string
          subtotal?: number
          unit_price?: number
        }
        Update: {
          base_price?: number
          created_at?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          organization_id?: string
          product_id?: string
          quantity?: number
          sales_order_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_order_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_taxes: {
        Row: {
          base_amount: number
          created_at: string | null
          id: string
          name: string
          organization_id: string
          rate: number
          sales_order_id: string
          tax_amount: number
          tax_id: string
        }
        Insert: {
          base_amount: number
          created_at?: string | null
          id?: string
          name: string
          organization_id: string
          rate: number
          sales_order_id: string
          tax_amount: number
          tax_id: string
        }
        Update: {
          base_amount?: number
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string
          rate?: number
          sales_order_id?: string
          tax_amount?: number
          tax_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_taxes_order_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_taxes_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_taxes_tax_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          credit_days: number | null
          customer_id: string
          expiration_date: string | null
          global_discount_amount: number | null
          global_discount_percentage: number | null
          id: string
          invoice_number: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          observations: string | null
          organization_id: string
          sale_date: string
          seller_id: string
          status: Database["public"]["Enums"]["order_status"]
          sub_total: number | null
          total_amount: number
          total_tax_amount: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          credit_days?: number | null
          customer_id: string
          expiration_date?: string | null
          global_discount_amount?: number | null
          global_discount_percentage?: number | null
          id?: string
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          observations?: string | null
          organization_id: string
          sale_date?: string
          seller_id: string
          status?: Database["public"]["Enums"]["order_status"]
          sub_total?: number | null
          total_amount?: number
          total_tax_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          credit_days?: number | null
          customer_id?: string
          expiration_date?: string | null
          global_discount_amount?: number | null
          global_discount_percentage?: number | null
          id?: string
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          observations?: string | null
          organization_id?: string
          sale_date?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          sub_total?: number | null
          total_amount?: number
          total_tax_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          code: string | null
          commission_rate: number | null
          created_at: string | null
          email: string | null
          first_name: string
          id: string
          is_active: boolean | null
          last_name: string
          organization_id: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          commission_rate?: number | null
          created_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean | null
          last_name: string
          organization_id: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          commission_rate?: number | null
          created_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean | null
          last_name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sellers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          lot_id: string
          new_stock: number
          organization_id: string
          previous_stock: number
          quantity: number
          reason: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_quantity: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lot_id: string
          new_stock: number
          organization_id: string
          previous_stock: number
          quantity: number
          reason?: string | null
          type: Database["public"]["Enums"]["stock_movement_type"]
          unit_quantity?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lot_id?: string
          new_stock?: number
          organization_id?: string
          previous_stock?: number
          quantity?: number
          reason?: string | null
          type?: Database["public"]["Enums"]["stock_movement_type"]
          unit_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string | null
          cuit: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organization_id: string
          payment_terms: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string | null
          cuit?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string | null
          cuit?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      taxes: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          rate: number
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          rate?: number
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          rate?: number
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      price_lists_with_status: {
        Row: {
          id: string | null
          name: string | null
          status: string | null
          supplier_id: string | null
          valid_from: string | null
        }
        Insert: {
          id?: string | null
          name?: string | null
          status?: never
          supplier_id?: string | null
          valid_from?: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
          status?: never
          supplier_id?: string | null
          valid_from?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      products_with_price: {
        Row: {
          active_price_list_id: string | null
          active_price_list_name: string | null
          active_price_list_valid_from: string | null
          boxes_per_pallet: number | null
          brand: string | null
          calculated_sale_price: number | null
          category_id: string | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          name: string | null
          organization_id: string | null
          profit_margin: number | null
          sanitary_registration: string | null
          sku: string | null
          supplier_id: string | null
          unit_of_measure:
            | Database["public"]["Enums"]["unit_of_measure_type"]
            | null
          units_per_box: number | null
          updated_at: string | null
          weight_per_unit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_organization_invitation: {
        Args: { lookup_invitation_token: string; p_user_id: string }
        Returns: Json
      }
      create_organization_invitation: {
        Args: {
          p_invitation_type?: Database["public"]["Enums"]["invitation_type"]
          p_invited_email: string
          p_is_owner?: boolean
          p_organization_id: string
          p_role_id: string
        }
        Returns: Json
      }
      generate_token: { Args: { length: number }; Returns: string }
      get_organization_members_with_users: {
        Args: { org_slug_param: string }
        Returns: {
          email: string
          full_name: string
          is_owner: boolean
          member_created_at: string
          organization_id: string
          role_id: string
          role_key: string
          role_name: string
          user_id: string
        }[]
      }
      get_user_org_permissions: {
        Args: { target_org_id: string }
        Returns: string[]
      }
      get_user_org_permissions_by_slug: {
        Args: { target_org_slug: string }
        Returns: string[]
      }
      import_price_list: {
        Args: {
          p_items: Json
          p_name: string
          p_notes?: string
          p_organization_id: string
          p_supplier_id: string
          p_valid_from: string
        }
        Returns: Json
      }
      is_platform_admin: { Args: never; Returns: boolean }
      lookup_organization_invitation: {
        Args: { p_token: string }
        Returns: Json
      }
      update_product_prices_from_price_list: {
        Args: { p_organization_id: string; p_price_list_id: string }
        Returns: undefined
      }
      user_has_org_permission: {
        Args: { permission_key: string; target_org_id: string }
        Returns: boolean
      }
    }
    Enums: {
      invitation_type: "one_time" | "multi_use"
      invoice_type: "FACTURA_A" | "FACTURA_B" | "FACTURA_C" | "NOTA_DE_VENTA"
      order_status:
        | "DRAFT"
        | "CONFIRMED"
        | "CANCELLED"
        | "DISPATCH"
        | "DELIVERED"
      payment_method:
        | "EFECTIVO"
        | "TRANSFERENCIA"
        | "CHEQUE"
        | "TARJETA_CREDITO"
        | "TARJETA_DEBITO"
        | "OTRO"
      purchase_order_status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED"
      receivable_status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE"
      stock_movement_type: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "TRANSFER"
      unit_of_measure_type: "UN" | "KG" | "LT" | "MT"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      invitation_type: ["one_time", "multi_use"],
      invoice_type: ["FACTURA_A", "FACTURA_B", "FACTURA_C", "NOTA_DE_VENTA"],
      order_status: [
        "DRAFT",
        "CONFIRMED",
        "CANCELLED",
        "DISPATCH",
        "DELIVERED",
      ],
      payment_method: [
        "EFECTIVO",
        "TRANSFERENCIA",
        "CHEQUE",
        "TARJETA_CREDITO",
        "TARJETA_DEBITO",
        "OTRO",
      ],
      purchase_order_status: ["ORDERED", "IN_TRANSIT", "RECEIVED", "CANCELLED"],
      receivable_status: ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"],
      stock_movement_type: ["INBOUND", "OUTBOUND", "ADJUSTMENT", "TRANSFER"],
      unit_of_measure_type: ["UN", "KG", "LT", "MT"],
    },
  },
} as const
