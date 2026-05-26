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
  public: {
    Tables: {
      accounts_payable: {
        Row: {
          created_at: string | null
          due_date: string
          id: string
          organization_id: string
          pending_balance: number
          purchase_order_id: string
          status: string
          supplier_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string | null
          due_date: string
          id?: string
          organization_id: string
          pending_balance: number
          purchase_order_id: string
          status?: string
          supplier_id: string
          total_amount: number
        }
        Update: {
          created_at?: string | null
          due_date?: string
          id?: string
          organization_id?: string
          pending_balance?: number
          purchase_order_id?: string
          status?: string
          supplier_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_po_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: true
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_supplier_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
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
      arca_operator_profiles: {
        Row: {
          cert_alias: string
          cert_encrypted: string | null
          cert_expires_at: string | null
          created_at: string
          environment: string
          id: string
          key_encrypted: string | null
          last_error: string | null
          last_tested_at: string | null
          login_encrypted: string | null
          operator_cuit: string
          password_encrypted: string | null
          status: string
          updated_at: string
          wsfe_authorized_at: string | null
          wsfe_last_checked_at: string | null
          wsfe_last_error: string | null
        }
        Insert: {
          cert_alias: string
          cert_encrypted?: string | null
          cert_expires_at?: string | null
          created_at?: string
          environment: string
          id?: string
          key_encrypted?: string | null
          last_error?: string | null
          last_tested_at?: string | null
          login_encrypted?: string | null
          operator_cuit: string
          password_encrypted?: string | null
          status?: string
          updated_at?: string
          wsfe_authorized_at?: string | null
          wsfe_last_checked_at?: string | null
          wsfe_last_error?: string | null
        }
        Update: {
          cert_alias?: string
          cert_encrypted?: string | null
          cert_expires_at?: string | null
          created_at?: string
          environment?: string
          id?: string
          key_encrypted?: string | null
          last_error?: string | null
          last_tested_at?: string | null
          login_encrypted?: string | null
          operator_cuit?: string
          password_encrypted?: string | null
          status?: string
          updated_at?: string
          wsfe_authorized_at?: string | null
          wsfe_last_checked_at?: string | null
          wsfe_last_error?: string | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          bank_name: string
          created_at: string
          currency: string
          current_balance: number
          id: string
          is_active: boolean
          name: string
          organization_id: string
        }
        Insert: {
          account_number?: string | null
          bank_name: string
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_movements: {
        Row: {
          accounting_account_code: string | null
          accounting_account_name: string | null
          amount: number
          bank_account_id: string
          concept: string
          created_at: string
          created_by: string | null
          id: string
          movement_date: string
          movement_type: string
          notes: string | null
          organization_id: string
        }
        Insert: {
          accounting_account_code?: string | null
          accounting_account_name?: string | null
          amount: number
          bank_account_id: string
          concept: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date: string
          movement_type: string
          notes?: string | null
          organization_id: string
        }
        Update: {
          accounting_account_code?: string | null
          accounting_account_name?: string | null
          amount?: number
          bank_account_id?: string
          concept?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_date?: string
          movement_type?: string
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_movements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carriers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      credit_notes: {
        Row: {
          amount: number
          arca_authorized_at: string | null
          arca_cae: string | null
          arca_cae_expires_at: string | null
          arca_last_error: string | null
          arca_point_of_sale: number | null
          arca_request_json: Json | null
          arca_response_json: Json | null
          arca_status: string
          arca_voucher_number: number | null
          arca_voucher_type_code: number | null
          assoc_invoice_number: number | null
          assoc_invoice_point_of_sale: number | null
          assoc_invoice_type_code: number | null
          created_at: string
          created_by: string | null
          credit_note_number: string | null
          customer_id: string
          id: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          is_historical: boolean
          issue_date: string
          observations: string | null
          organization_id: string
          sales_order_id: string | null
          sales_return_id: string | null
          status: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          arca_authorized_at?: string | null
          arca_cae?: string | null
          arca_cae_expires_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          assoc_invoice_number?: number | null
          assoc_invoice_point_of_sale?: number | null
          assoc_invoice_type_code?: number | null
          created_at?: string
          created_by?: string | null
          credit_note_number?: string | null
          customer_id: string
          id?: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          is_historical?: boolean
          issue_date?: string
          observations?: string | null
          organization_id: string
          sales_order_id?: string | null
          sales_return_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          arca_authorized_at?: string | null
          arca_cae?: string | null
          arca_cae_expires_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          assoc_invoice_number?: number | null
          assoc_invoice_point_of_sale?: number | null
          assoc_invoice_type_code?: number | null
          created_at?: string
          created_by?: string | null
          credit_note_number?: string | null
          customer_id?: string
          id?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          is_historical?: boolean
          issue_date?: string
          observations?: string | null
          organization_id?: string
          sales_order_id?: string | null
          sales_return_id?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_sales_return_id_fkey"
            columns: ["sales_return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_notes: {
        Row: {
          amount: number
          arca_authorized_at: string | null
          arca_cae: string | null
          arca_cae_expires_at: string | null
          arca_last_error: string | null
          arca_point_of_sale: number | null
          arca_request_json: Json | null
          arca_response_json: Json | null
          arca_status: string
          arca_voucher_number: number | null
          arca_voucher_type_code: number | null
          assoc_invoice_number: number | null
          assoc_invoice_point_of_sale: number | null
          assoc_invoice_type_code: number | null
          created_at: string
          customer_id: string
          debit_note_number: string | null
          id: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          issue_date: string
          observations: string | null
          organization_id: string
          sales_order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          arca_authorized_at?: string | null
          arca_cae?: string | null
          arca_cae_expires_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          assoc_invoice_number?: number | null
          assoc_invoice_point_of_sale?: number | null
          assoc_invoice_type_code?: number | null
          created_at?: string
          customer_id: string
          debit_note_number?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          issue_date?: string
          observations?: string | null
          organization_id: string
          sales_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          arca_authorized_at?: string | null
          arca_cae?: string | null
          arca_cae_expires_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          assoc_invoice_number?: number | null
          assoc_invoice_point_of_sale?: number | null
          assoc_invoice_type_code?: number | null
          created_at?: string
          customer_id?: string
          debit_note_number?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          issue_date?: string
          observations?: string | null
          organization_id?: string
          sales_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_applications: {
        Row: {
          account_receivable_id: string | null
          amount: number
          created_at: string
          customer_credit_id: string | null
          customer_id: string
          id: string
          notes: string | null
          organization_id: string
          payment_date: string
          reference_number: string | null
        }
        Insert: {
          account_receivable_id?: string | null
          amount: number
          created_at?: string
          customer_credit_id?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          organization_id: string
          payment_date: string
          reference_number?: string | null
        }
        Update: {
          account_receivable_id?: string | null
          amount?: number
          created_at?: string
          customer_credit_id?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payment_date?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_applications_account_receivable_id_fkey"
            columns: ["account_receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_applications_customer_credit_id_fkey"
            columns: ["customer_credit_id"]
            isOneToOne: false
            referencedRelation: "customer_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credits: {
        Row: {
          amount: number
          created_at: string | null
          credit_note_id: string | null
          customer_id: string
          id: string
          notes: string | null
          organization_id: string
          remaining_amount: number
          sales_return_id: string | null
          source_payment_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          credit_note_id?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          organization_id: string
          remaining_amount: number
          sales_return_id?: string | null
          source_payment_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          credit_note_id?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          remaining_amount?: number
          sales_return_id?: string | null
          source_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credits_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_sales_return_id_fkey"
            columns: ["sales_return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_supplier_assignments: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          organization_id: string
          price_list_id: string | null
          sales_price_list_id: string | null
          supplier_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          organization_id: string
          price_list_id?: string | null
          sales_price_list_id?: string | null
          supplier_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          organization_id?: string
          price_list_id?: string | null
          sales_price_list_id?: string | null
          supplier_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_supplier_assignments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_supplier_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_supplier_assignments_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_supplier_assignments_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_supplier_assignments_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["active_price_list_id"]
          },
          {
            foreignKeyName: "customer_supplier_assignments_sales_price_list_id_fkey"
            columns: ["sales_price_list_id"]
            isOneToOne: false
            referencedRelation: "sales_price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_supplier_assignments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          assigned_seller_id: string | null
          business_name: string
          city: string | null
          client_number: string | null
          created_at: string | null
          credit_limit: number | null
          cuit: string | null
          customer_channel: string
          delivery_address: string | null
          delivery_city: string | null
          due_days: number | null
          email: string | null
          fantasy_name: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          phone: string | null
          preferred_carrier_id: string | null
          province: string | null
          sales_price_list_id: string | null
          tax_condition: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          assigned_seller_id?: string | null
          business_name: string
          city?: string | null
          client_number?: string | null
          created_at?: string | null
          credit_limit?: number | null
          cuit?: string | null
          customer_channel?: string
          delivery_address?: string | null
          delivery_city?: string | null
          due_days?: number | null
          email?: string | null
          fantasy_name?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          phone?: string | null
          preferred_carrier_id?: string | null
          province?: string | null
          sales_price_list_id?: string | null
          tax_condition?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          assigned_seller_id?: string | null
          business_name?: string
          city?: string | null
          client_number?: string | null
          created_at?: string | null
          credit_limit?: number | null
          cuit?: string | null
          customer_channel?: string
          delivery_address?: string | null
          delivery_city?: string | null
          due_days?: number | null
          email?: string | null
          fantasy_name?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          phone?: string | null
          preferred_carrier_id?: string | null
          province?: string | null
          sales_price_list_id?: string | null
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
          {
            foreignKeyName: "customers_preferred_carrier_id_fkey"
            columns: ["preferred_carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_sales_price_list_id_fkey"
            columns: ["sales_price_list_id"]
            isOneToOne: false
            referencedRelation: "sales_price_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_notes: {
        Row: {
          amount: number
          arca_authorized_at: string | null
          arca_cae: string | null
          arca_cae_expires_at: string | null
          arca_last_error: string | null
          arca_point_of_sale: number | null
          arca_request_json: Json | null
          arca_response_json: Json | null
          arca_status: string
          arca_voucher_number: number | null
          arca_voucher_type_code: number | null
          assoc_invoice_number: number | null
          assoc_invoice_point_of_sale: number | null
          assoc_invoice_type_code: number | null
          created_at: string
          customer_id: string
          debit_note_number: string | null
          id: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          issue_date: string
          observations: string | null
          organization_id: string
          sales_order_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          arca_authorized_at?: string | null
          arca_cae?: string | null
          arca_cae_expires_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          assoc_invoice_number?: number | null
          assoc_invoice_point_of_sale?: number | null
          assoc_invoice_type_code?: number | null
          created_at?: string
          customer_id: string
          debit_note_number?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          issue_date?: string
          observations?: string | null
          organization_id: string
          sales_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          arca_authorized_at?: string | null
          arca_cae?: string | null
          arca_cae_expires_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          assoc_invoice_number?: number | null
          assoc_invoice_point_of_sale?: number | null
          assoc_invoice_type_code?: number | null
          created_at?: string
          customer_id?: string
          debit_note_number?: string | null
          id?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          issue_date?: string
          observations?: string | null
          organization_id?: string
          sales_order_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_sale_prices: {
        Row: {
          id: string
          organization_id: string
          price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          price: number
          product_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_sale_prices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_sale_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_sale_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_sale_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          is_fixed: boolean
          name: string
          organization_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id: string
          is_fixed?: boolean
          name: string
          organization_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_fixed?: boolean
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_purchase_metrics: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          period: string
          total_amount: number
          total_orders: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          period: string
          total_amount?: number
          total_orders?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          period?: string
          total_amount?: number
          total_orders?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_purchase_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_sales_metrics: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          period: string
          total_amount: number
          total_orders: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          period: string
          total_amount?: number
          total_orders?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          period?: string
          total_amount?: number
          total_orders?: number
        }
        Relationships: [
          {
            foreignKeyName: "historical_sales_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      issued_checks: {
        Row: {
          amount: number
          bank_account_id: string
          check_number: string
          created_at: string
          id: string
          issue_date: string
          notes: string | null
          organization_id: string
          payee: string
          payment_date: string
          status: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          check_number: string
          created_at?: string
          id?: string
          issue_date: string
          notes?: string | null
          organization_id: string
          payee: string
          payment_date: string
          status?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          check_number?: string
          created_at?: string
          id?: string
          issue_date?: string
          notes?: string | null
          organization_id?: string
          payee?: string
          payment_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "issued_checks_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issued_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_designs: {
        Row: {
          client_approved_at: string | null
          created_at: string | null
          created_by: string | null
          general_notes: string | null
          id: string
          order_id: string
          products: Json
          updated_at: string | null
        }
        Insert: {
          client_approved_at?: string | null
          created_at?: string | null
          created_by?: string | null
          general_notes?: string | null
          id?: string
          order_id: string
          products?: Json
          updated_at?: string | null
        }
        Update: {
          client_approved_at?: string | null
          created_at?: string | null
          created_by?: string | null
          general_notes?: string | null
          id?: string
          order_id?: string
          products?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_designs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          from_status: Database["public"]["Enums"]["order_flow_status"] | null
          id: string
          notes: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_flow_status"]
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_flow_status"] | null
          id?: string
          notes?: string | null
          order_id: string
          to_status: Database["public"]["Enums"]["order_flow_status"]
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          from_status?: Database["public"]["Enums"]["order_flow_status"] | null
          id?: string
          notes?: string | null
          order_id?: string
          to_status?: Database["public"]["Enums"]["order_flow_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivered_at: string | null
          design_approved_at: string | null
          dispatch_notes: string | null
          dispatched_at: string | null
          finance_notes: string | null
          finance_reviewed_at: string | null
          finance_reviewed_by: string | null
          id: string
          order_number: string
          organization_id: string
          production_notes: string | null
          production_started_at: string | null
          purchase_order_id: string | null
          quote_id: string
          status: Database["public"]["Enums"]["order_flow_status"]
          stock_checked_at: string | null
          stock_checked_by: string | null
          stock_notes: string | null
          tracking_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          design_approved_at?: string | null
          dispatch_notes?: string | null
          dispatched_at?: string | null
          finance_notes?: string | null
          finance_reviewed_at?: string | null
          finance_reviewed_by?: string | null
          id?: string
          order_number: string
          organization_id: string
          production_notes?: string | null
          production_started_at?: string | null
          purchase_order_id?: string | null
          quote_id: string
          status?: Database["public"]["Enums"]["order_flow_status"]
          stock_checked_at?: string | null
          stock_checked_by?: string | null
          stock_notes?: string | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          design_approved_at?: string | null
          dispatch_notes?: string | null
          dispatched_at?: string | null
          finance_notes?: string | null
          finance_reviewed_at?: string | null
          finance_reviewed_by?: string | null
          id?: string
          order_number?: string
          organization_id?: string
          production_notes?: string | null
          production_started_at?: string | null
          purchase_order_id?: string | null
          quote_id?: string
          status?: Database["public"]["Enums"]["order_flow_status"]
          stock_checked_at?: string | null
          stock_checked_by?: string | null
          stock_notes?: string | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_arca_delegations: {
        Row: {
          automation_trace: Json | null
          connected_at: string | null
          created_at: string
          delegation_accepted_at: string | null
          delegation_requested_at: string | null
          environment: string
          id: string
          last_error: string | null
          last_tested_at: string | null
          operator_cuit_snapshot: string
          operator_profile_id: string
          organization_id: string
          point_of_sale: number
          represented_cuit: string
          sales_point_profile: string
          service: string
          status: string
          updated_at: string
        }
        Insert: {
          automation_trace?: Json | null
          connected_at?: string | null
          created_at?: string
          delegation_accepted_at?: string | null
          delegation_requested_at?: string | null
          environment: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          operator_cuit_snapshot: string
          operator_profile_id: string
          organization_id: string
          point_of_sale: number
          represented_cuit: string
          sales_point_profile: string
          service?: string
          status?: string
          updated_at?: string
        }
        Update: {
          automation_trace?: Json | null
          connected_at?: string | null
          created_at?: string
          delegation_accepted_at?: string | null
          delegation_requested_at?: string | null
          environment?: string
          id?: string
          last_error?: string | null
          last_tested_at?: string | null
          operator_cuit_snapshot?: string
          operator_profile_id?: string
          organization_id?: string
          point_of_sale?: number
          represented_cuit?: string
          sales_point_profile?: string
          service?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_arca_delegations_operator_profile_id_fkey"
            columns: ["operator_profile_id"]
            isOneToOne: false
            referencedRelation: "arca_operator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_arca_delegations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_arca_settings: {
        Row: {
          cert_encrypted: string | null
          cert_expires_at: string | null
          created_at: string
          delegated_to_cuit: string | null
          delegation_accepted_at: string | null
          delegation_requested_at: string | null
          environment: string
          invoice_a_authorization_type: string
          issuer_legal_address: string | null
          issuer_logo_data_url: string | null
          key_encrypted: string | null
          last_error: string | null
          last_tested_at: string | null
          mode: string
          operator_profile_id: string | null
          organization_id: string
          point_of_sale: number
          status: string
          updated_at: string
        }
        Insert: {
          cert_encrypted?: string | null
          cert_expires_at?: string | null
          created_at?: string
          delegated_to_cuit?: string | null
          delegation_accepted_at?: string | null
          delegation_requested_at?: string | null
          environment: string
          invoice_a_authorization_type?: string
          issuer_legal_address?: string | null
          issuer_logo_data_url?: string | null
          key_encrypted?: string | null
          last_error?: string | null
          last_tested_at?: string | null
          mode?: string
          operator_profile_id?: string | null
          organization_id: string
          point_of_sale: number
          status?: string
          updated_at?: string
        }
        Update: {
          cert_encrypted?: string | null
          cert_expires_at?: string | null
          created_at?: string
          delegated_to_cuit?: string | null
          delegation_accepted_at?: string | null
          delegation_requested_at?: string | null
          environment?: string
          invoice_a_authorization_type?: string
          issuer_legal_address?: string | null
          issuer_logo_data_url?: string | null
          key_encrypted?: string | null
          last_error?: string | null
          last_tested_at?: string | null
          mode?: string
          operator_profile_id?: string | null
          organization_id?: string
          point_of_sale?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_arca_settings_operator_profile_id_fkey"
            columns: ["operator_profile_id"]
            isOneToOne: false
            referencedRelation: "arca_operator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_arca_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          description: string
          expense_date: string
          id: string
          notes: string | null
          organization_id: string
          payment_method: string | null
          reference_number: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          description: string
          expense_date: string
          id: string
          notes?: string | null
          organization_id: string
          payment_method?: string | null
          reference_number?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          organization_id?: string
          payment_method?: string | null
          reference_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_expenses_organization_id_fkey"
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
          disabled_at: string | null
          disabled_by: string | null
          is_active: boolean
          is_owner: boolean
          organization_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          is_active?: boolean
          is_owner?: boolean
          organization_id: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          is_active?: boolean
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
      organization_settings: {
        Row: {
          organization_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          organization_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          organization_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          credit_note_last_number: number
          credit_note_prefix: string
          cuit: string | null
          disabled_at: string | null
          disabled_by: string | null
          id: string
          is_active: boolean
          monthly_report_day_of_week: number | null
          monthly_report_enabled: boolean
          name: string
          pos_enabled: boolean
          production_enabled: boolean
          remittance_auto_enabled: boolean
          remittance_last_number: number
          remittance_prefix: string
          slug: string | null
          weekly_report_day_of_week: number | null
          weekly_report_enabled: boolean
          wholesale_enabled: boolean
        }
        Insert: {
          created_at?: string | null
          credit_note_last_number?: number
          credit_note_prefix?: string
          cuit?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          id?: string
          is_active?: boolean
          monthly_report_day_of_week?: number | null
          monthly_report_enabled?: boolean
          name: string
          pos_enabled?: boolean
          production_enabled?: boolean
          remittance_auto_enabled?: boolean
          remittance_last_number?: number
          remittance_prefix?: string
          slug?: string | null
          weekly_report_day_of_week?: number | null
          weekly_report_enabled?: boolean
          wholesale_enabled?: boolean
        }
        Update: {
          created_at?: string | null
          credit_note_last_number?: number
          credit_note_prefix?: string
          cuit?: string | null
          disabled_at?: string | null
          disabled_by?: string | null
          id?: string
          is_active?: boolean
          monthly_report_day_of_week?: number | null
          monthly_report_enabled?: boolean
          name?: string
          pos_enabled?: boolean
          production_enabled?: boolean
          remittance_auto_enabled?: boolean
          remittance_last_number?: number
          remittance_prefix?: string
          slug?: string | null
          weekly_report_day_of_week?: number | null
          weekly_report_enabled?: boolean
          wholesale_enabled?: boolean
        }
        Relationships: []
      }
      payable_payments: {
        Row: {
          account_payable_id: string
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_date: string
          payment_group_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          reference_number: string | null
        }
        Insert: {
          account_payable_id: string
          amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_date?: string
          payment_group_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          reference_number?: string | null
        }
        Update: {
          account_payable_id?: string
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_date?: string
          payment_group_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payable_payments_ap_fkey"
            columns: ["account_payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
        ]
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
      pos_payments: {
        Row: {
          amount: number
          card_brand: string | null
          created_at: string | null
          generated_receivable_id: string | null
          id: string
          payment_method: Database["public"]["Enums"]["pos_payment_method"]
          pos_sale_id: string
          reference_number: string | null
        }
        Insert: {
          amount: number
          card_brand?: string | null
          created_at?: string | null
          generated_receivable_id?: string | null
          id?: string
          payment_method: Database["public"]["Enums"]["pos_payment_method"]
          pos_sale_id: string
          reference_number?: string | null
        }
        Update: {
          amount?: number
          card_brand?: string | null
          created_at?: string | null
          generated_receivable_id?: string | null
          id?: string
          payment_method?: Database["public"]["Enums"]["pos_payment_method"]
          pos_sale_id?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_receivable_fkey"
            columns: ["generated_receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_payments_sale_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_items: {
        Row: {
          discount_amount: number | null
          id: string
          lot_id: string | null
          pos_sale_id: string
          product_id: string
          product_variant_id: string | null
          quantity: number
          subtotal: number
          tax_rate: number | null
          unit_price: number
        }
        Insert: {
          discount_amount?: number | null
          id?: string
          lot_id?: string | null
          pos_sale_id: string
          product_id: string
          product_variant_id?: string | null
          quantity: number
          subtotal: number
          tax_rate?: number | null
          unit_price: number
        }
        Update: {
          discount_amount?: number | null
          id?: string
          lot_id?: string | null
          pos_sale_id?: string
          product_id?: string
          product_variant_id?: string | null
          quantity?: number
          subtotal?: number
          tax_rate?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_lot_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pos_sale_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_items_sale_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_taxes: {
        Row: {
          base_amount: number
          created_at: string
          id: string
          name: string
          organization_id: string
          pos_sale_id: string
          rate: number
          tax_amount: number
          tax_code_snapshot: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          base_amount?: number
          created_at?: string
          id?: string
          name: string
          organization_id: string
          pos_sale_id: string
          rate?: number
          tax_amount?: number
          tax_code_snapshot?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          base_amount?: number
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          pos_sale_id?: string
          rate?: number
          tax_amount?: number
          tax_code_snapshot?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_taxes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_taxes_pos_sale_id_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sale_taxes_tax_id_fkey"
            columns: ["tax_id"]
            isOneToOne: false
            referencedRelation: "taxes"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          arca_authorized_at: string | null
          arca_last_error: string | null
          arca_point_of_sale: number | null
          arca_request_json: Json | null
          arca_requested_at: string | null
          arca_response_json: Json | null
          arca_status: string
          arca_voucher_number: number | null
          arca_voucher_type_code: number | null
          cae: string | null
          cae_expiration_date: string | null
          customer_id: string | null
          discount_amount: number | null
          id: string
          invoice_number: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type_enum"]
          organization_id: string
          receipt_number: string | null
          sale_date: string | null
          session_id: string
          status: string | null
          subtotal_amount: number
          tax_amount: number | null
          total_amount: number
          user_id: string | null
        }
        Insert: {
          arca_authorized_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_requested_at?: string | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          cae?: string | null
          cae_expiration_date?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          id?: string
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type_enum"]
          organization_id: string
          receipt_number?: string | null
          sale_date?: string | null
          session_id: string
          status?: string | null
          subtotal_amount?: number
          tax_amount?: number | null
          total_amount?: number
          user_id?: string | null
        }
        Update: {
          arca_authorized_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_requested_at?: string | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          cae?: string | null
          cae_expiration_date?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          id?: string
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type_enum"]
          organization_id?: string
          receipt_number?: string | null
          sale_date?: string | null
          session_id?: string
          status?: string | null
          subtotal_amount?: number
          tax_amount?: number | null
          total_amount?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_customer_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_session_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales_return_items: {
        Row: {
          created_at: string
          discount_amount: number | null
          id: string
          lot_id: string | null
          organization_id: string
          pos_sale_id: string
          pos_sale_item_id: string
          pos_sale_return_id: string
          product_id: string
          quantity: number
          reason: string | null
          subtotal: number
          tax_rate: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_amount?: number | null
          id?: string
          lot_id?: string | null
          organization_id: string
          pos_sale_id: string
          pos_sale_item_id: string
          pos_sale_return_id: string
          product_id: string
          quantity: number
          reason?: string | null
          subtotal?: number
          tax_rate?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          discount_amount?: number | null
          id?: string
          lot_id?: string | null
          organization_id?: string
          pos_sale_id?: string
          pos_sale_item_id?: string
          pos_sale_return_id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          subtotal?: number
          tax_rate?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_return_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_return_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_return_items_pos_sale_id_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_return_items_pos_sale_item_id_fkey"
            columns: ["pos_sale_item_id"]
            isOneToOne: false
            referencedRelation: "pos_sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_return_items_pos_sale_return_id_fkey"
            columns: ["pos_sale_return_id"]
            isOneToOne: false
            referencedRelation: "pos_sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      pos_sales_returns: {
        Row: {
          created_at: string
          created_by: string | null
          credit_note_amount: number | null
          id: string
          organization_id: string
          pos_sale_id: string
          reason: string | null
          refund_amount: number | null
          refund_method: string | null
          resolution: string
          restock: boolean
          return_date: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_note_amount?: number | null
          id?: string
          organization_id: string
          pos_sale_id: string
          reason?: string | null
          refund_amount?: number | null
          refund_method?: string | null
          resolution: string
          restock?: boolean
          return_date?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_note_amount?: number | null
          id?: string
          organization_id?: string
          pos_sale_id?: string
          reason?: string | null
          refund_amount?: number | null
          refund_method?: string | null
          resolution?: string
          restock?: boolean
          return_date?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_returns_pos_sale_id_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          cash_sales_amount: number | null
          closed_at: string | null
          difference_amount: number | null
          expected_cash_end: number | null
          id: string
          notes: string | null
          opened_at: string | null
          organization_id: string
          real_cash_end: number | null
          starting_cash: number
          status: Database["public"]["Enums"]["pos_session_status"]
          terminal_id: string
          user_id: string
        }
        Insert: {
          cash_sales_amount?: number | null
          closed_at?: string | null
          difference_amount?: number | null
          expected_cash_end?: number | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          organization_id: string
          real_cash_end?: number | null
          starting_cash?: number
          status?: Database["public"]["Enums"]["pos_session_status"]
          terminal_id: string
          user_id: string
        }
        Update: {
          cash_sales_amount?: number | null
          closed_at?: string | null
          difference_amount?: number | null
          expected_cash_end?: number | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          organization_id?: string
          real_cash_end?: number | null
          starting_cash?: number
          status?: Database["public"]["Enums"]["pos_session_status"]
          terminal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_terminal_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "pos_terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_terminals: {
        Row: {
          cash_register_number: number | null
          code: string | null
          created_at: string | null
          default_price_list_id: string | null
          id: string
          is_active: boolean | null
          mac_address: string | null
          name: string
          organization_id: string
        }
        Insert: {
          cash_register_number?: number | null
          code?: string | null
          created_at?: string | null
          default_price_list_id?: string | null
          id?: string
          is_active?: boolean | null
          mac_address?: string | null
          name: string
          organization_id: string
        }
        Update: {
          cash_register_number?: number | null
          code?: string | null
          created_at?: string | null
          default_price_list_id?: string | null
          id?: string
          is_active?: boolean | null
          mac_address?: string | null
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_terminals_org_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_terminals_price_list_fkey"
            columns: ["default_price_list_id"]
            isOneToOne: false
            referencedRelation: "sales_price_lists"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "price_list_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      price_lists: {
        Row: {
          created_at: string | null
          currency: string
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organization_id: string
          replaced_by_list_id: string | null
          supplier_id: string
          updated_at: string | null
          valid_from: string
        }
        Insert: {
          created_at?: string | null
          currency?: string
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          replaced_by_list_id?: string | null
          supplier_id: string
          updated_at?: string | null
          valid_from: string
        }
        Update: {
          created_at?: string | null
          currency?: string
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          replaced_by_list_id?: string | null
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
            foreignKeyName: "price_lists_replaced_by_list_id_fkey"
            columns: ["replaced_by_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_replaced_by_list_id_fkey"
            columns: ["replaced_by_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_replaced_by_list_id_fkey"
            columns: ["replaced_by_list_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["active_price_list_id"]
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
      product_extras: {
        Row: {
          cost: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          price: number
          type: string
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          price?: number
          type: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          price?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_extras_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lots: {
        Row: {
          created_at: string | null
          expiration_date: string | null
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
          expiration_date?: string | null
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
          expiration_date?: string | null
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
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          lot_id: string | null
          organization_id: string
          product_id: string
          stock: number
          talle: string
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          is_active?: boolean
          lot_id?: string | null
          organization_id: string
          product_id: string
          stock?: number
          talle: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lot_id?: string | null
          organization_id?: string
          product_id?: string
          stock?: number
          talle?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          boxes_per_pallet: number | null
          brand: string | null
          category_id: string | null
          created_at: string | null
          description: string | null
          has_variants: boolean
          id: string
          image_url: string | null
          is_active: boolean | null
          min_stock: number | null
          name: string
          organization_id: string
          parent_id: string | null
          profit_margin: number | null
          sale_price: number | null
          sanitary_registration: string | null
          sku: string
          supplier_id: string | null
          tracks_stock_units: boolean | null
          unit_of_measure: Database["public"]["Enums"]["unit_of_measure_type"]
          units_per_box: number | null
          updated_at: string | null
          variant_attributes: Json | null
          weight_per_unit: number | null
        }
        Insert: {
          barcode?: string | null
          boxes_per_pallet?: number | null
          brand?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          min_stock?: number | null
          name: string
          organization_id: string
          parent_id?: string | null
          profit_margin?: number | null
          sale_price?: number | null
          sanitary_registration?: string | null
          sku: string
          supplier_id?: string | null
          tracks_stock_units?: boolean | null
          unit_of_measure?: Database["public"]["Enums"]["unit_of_measure_type"]
          units_per_box?: number | null
          updated_at?: string | null
          variant_attributes?: Json | null
          weight_per_unit?: number | null
        }
        Update: {
          barcode?: string | null
          boxes_per_pallet?: number | null
          brand?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          min_stock?: number | null
          name?: string
          organization_id?: string
          parent_id?: string | null
          profit_margin?: number | null
          sale_price?: number | null
          sanitary_registration?: string | null
          sku?: string
          supplier_id?: string | null
          tracks_stock_units?: boolean | null
          unit_of_measure?: Database["public"]["Enums"]["unit_of_measure_type"]
          units_per_box?: number | null
          updated_at?: string | null
          variant_attributes?: Json | null
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
            foreignKeyName: "products_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
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
          discount_amount: number | null
          discount_precentage: number | null
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
          discount_amount?: number | null
          discount_precentage?: number | null
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
          discount_amount?: number | null
          discount_precentage?: number | null
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
          {
            foreignKeyName: "purchase_order_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
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
          cancelled_at: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          delivery_date: string | null
          expiration_date: string | null
          global_discount_amount: number | null
          global_discount_percentage: number | null
          id: string
          in_transit_at: string | null
          logistics: string | null
          organization_id: string
          purchase_date: string
          purchase_number: number | null
          received_at: string | null
          remittance_number: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_amount: number | null
          supplier_id: string
          tax_amount: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          delivery_date?: string | null
          expiration_date?: string | null
          global_discount_amount?: number | null
          global_discount_percentage?: number | null
          id?: string
          in_transit_at?: string | null
          logistics?: string | null
          organization_id: string
          purchase_date?: string
          purchase_number?: number | null
          received_at?: string | null
          remittance_number?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_amount?: number | null
          supplier_id: string
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          delivery_date?: string | null
          expiration_date?: string | null
          global_discount_amount?: number | null
          global_discount_percentage?: number | null
          id?: string
          in_transit_at?: string | null
          logistics?: string | null
          organization_id?: string
          purchase_date?: string
          purchase_number?: number | null
          received_at?: string | null
          remittance_number?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal_amount?: number | null
          supplier_id?: string
          tax_amount?: number | null
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
      push_subscriptions: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          keys: Json
          organization_slug: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          keys: Json
          organization_slug: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          keys?: Json
          organization_slug?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quote_item_extras: {
        Row: {
          created_at: string | null
          description: string
          id: string
          price: number
          quote_item_id: string
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          price?: number
          quote_item_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          price?: number
          quote_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_item_extras_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string | null
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          id: string
          product_id: string | null
          quantity: number
          quote_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          product_id?: string | null
          quantity?: number
          quote_id: string
          subtotal?: number
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          product_id?: string | null
          quantity?: number
          quote_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string
          customer_id: string
          id: string
          observations: string | null
          organization_id: string
          payment_condition: string | null
          status: Database["public"]["Enums"]["quote_status"]
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          customer_id: string
          id?: string
          observations?: string | null
          organization_id: string
          payment_condition?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string
          customer_id?: string
          id?: string
          observations?: string | null
          organization_id?: string
          payment_condition?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          payment_group_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method_type"]
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
          payment_group_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method_type"]
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
          payment_group_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
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
      sales_order_item_extras: {
        Row: {
          cost_snapshot: number
          created_at: string
          id: string
          name_snapshot: string
          price_snapshot: number
          product_extra_id: string | null
          sales_order_item_id: string
          type_snapshot: string
        }
        Insert: {
          cost_snapshot: number
          created_at?: string
          id?: string
          name_snapshot: string
          price_snapshot: number
          product_extra_id?: string | null
          sales_order_item_id: string
          type_snapshot: string
        }
        Update: {
          cost_snapshot?: number
          created_at?: string
          id?: string
          name_snapshot?: string
          price_snapshot?: number
          product_extra_id?: string | null
          sales_order_item_id?: string
          type_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_item_extras_product_extra_id_fkey"
            columns: ["product_extra_id"]
            isOneToOne: false
            referencedRelation: "product_extras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_item_extras_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          base_price: number
          created_at: string | null
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          id: string
          is_adjustment: boolean | null
          organization_id: string
          product_id: string | null
          product_variant_id: string | null
          quantity: number
          sales_order_id: string
          subtotal: number
          unit_price: number
          unit_quantity: number | null
        }
        Insert: {
          base_price?: number
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          is_adjustment?: boolean | null
          organization_id: string
          product_id?: string | null
          product_variant_id?: string | null
          quantity: number
          sales_order_id: string
          subtotal?: number
          unit_price?: number
          unit_quantity?: number | null
        }
        Update: {
          base_price?: number
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          is_adjustment?: boolean | null
          organization_id?: string
          product_id?: string | null
          product_variant_id?: string | null
          quantity?: number
          sales_order_id?: string
          subtotal?: number
          unit_price?: number
          unit_quantity?: number | null
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
          {
            foreignKeyName: "sales_order_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_order_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
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
          tax_code_snapshot: string | null
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
          tax_code_snapshot?: string | null
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
          tax_code_snapshot?: string | null
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
          arca_authorized_at: string | null
          arca_cae: string | null
          arca_cae_expires_at: string | null
          arca_last_error: string | null
          arca_point_of_sale: number | null
          arca_request_json: Json | null
          arca_response_json: Json | null
          arca_status: string
          arca_voucher_number: number | null
          arca_voucher_type_code: number | null
          cancelled_at: string | null
          carrier_id: string | null
          confirmed_at: string | null
          created_at: string | null
          created_by: string | null
          credit_days: number | null
          currency: string
          customer_id: string
          delivered_at: string | null
          dispatched_at: string | null
          expiration_date: string | null
          global_discount_amount: number | null
          global_discount_percentage: number | null
          id: string
          invoice_email_delivered_at: string | null
          invoice_email_last_attempt_at: string | null
          invoice_email_last_error: string | null
          invoice_email_last_event: string | null
          invoice_email_last_event_at: string | null
          invoice_email_recipient: string | null
          invoice_email_resend_id: string | null
          invoice_email_sent_at: string | null
          invoice_email_status: string
          invoice_number: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          is_historical: boolean
          observations: string | null
          organization_id: string
          remittance_number: string | null
          sale_date: string
          sale_number: number | null
          status: Database["public"]["Enums"]["order_status"]
          sub_total: number | null
          supplier_id: string | null
          total_amount: number
          total_tax_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          arca_authorized_at?: string | null
          arca_cae?: string | null
          arca_cae_expires_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          cancelled_at?: string | null
          carrier_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_days?: number | null
          currency?: string
          customer_id: string
          delivered_at?: string | null
          dispatched_at?: string | null
          expiration_date?: string | null
          global_discount_amount?: number | null
          global_discount_percentage?: number | null
          id?: string
          invoice_email_delivered_at?: string | null
          invoice_email_last_attempt_at?: string | null
          invoice_email_last_error?: string | null
          invoice_email_last_event?: string | null
          invoice_email_last_event_at?: string | null
          invoice_email_recipient?: string | null
          invoice_email_resend_id?: string | null
          invoice_email_sent_at?: string | null
          invoice_email_status?: string
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          is_historical?: boolean
          observations?: string | null
          organization_id: string
          remittance_number?: string | null
          sale_date?: string
          sale_number?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          sub_total?: number | null
          supplier_id?: string | null
          total_amount?: number
          total_tax_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          arca_authorized_at?: string | null
          arca_cae?: string | null
          arca_cae_expires_at?: string | null
          arca_last_error?: string | null
          arca_point_of_sale?: number | null
          arca_request_json?: Json | null
          arca_response_json?: Json | null
          arca_status?: string
          arca_voucher_number?: number | null
          arca_voucher_type_code?: number | null
          cancelled_at?: string | null
          carrier_id?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          credit_days?: number | null
          currency?: string
          customer_id?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          expiration_date?: string | null
          global_discount_amount?: number | null
          global_discount_percentage?: number | null
          id?: string
          invoice_email_delivered_at?: string | null
          invoice_email_last_attempt_at?: string | null
          invoice_email_last_error?: string | null
          invoice_email_last_event?: string | null
          invoice_email_last_event_at?: string | null
          invoice_email_recipient?: string | null
          invoice_email_resend_id?: string | null
          invoice_email_sent_at?: string | null
          invoice_email_status?: string
          invoice_number?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          is_historical?: boolean
          observations?: string | null
          organization_id?: string
          remittance_number?: string | null
          sale_date?: string
          sale_number?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          sub_total?: number | null
          supplier_id?: string | null
          total_amount?: number
          total_tax_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "sales_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_price_lists: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organization_id: string
          percentage: number
          type: Database["public"]["Enums"]["sales_price_list_type"]
          updated_at: string | null
          valid_from: string
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          percentage: number
          type?: Database["public"]["Enums"]["sales_price_list_type"]
          updated_at?: string | null
          valid_from: string
          value?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          percentage?: number
          type?: Database["public"]["Enums"]["sales_price_list_type"]
          updated_at?: string | null
          valid_from?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_price_lists_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          created_at: string
          credit_amount: number
          id: string
          item_condition: Database["public"]["Enums"]["returned_item_condition"]
          lot_id: string | null
          notes: string | null
          organization_id: string
          product_id: string
          quantity: number
          restock: boolean
          sales_order_item_id: string | null
          sales_return_id: string
          unit_price: number
          unit_quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_amount?: number
          id?: string
          item_condition?: Database["public"]["Enums"]["returned_item_condition"]
          lot_id?: string | null
          notes?: string | null
          organization_id: string
          product_id: string
          quantity: number
          restock?: boolean
          sales_order_item_id?: string | null
          sales_return_id: string
          unit_price?: number
          unit_quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_amount?: number
          id?: string
          item_condition?: Database["public"]["Enums"]["returned_item_condition"]
          lot_id?: string | null
          notes?: string | null
          organization_id?: string
          product_id?: string
          quantity?: number
          restock?: boolean
          sales_order_item_id?: string | null
          sales_return_id?: string
          unit_price?: number
          unit_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_price"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "view_stock_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sales_return_items_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_sales_return_id_fkey"
            columns: ["sales_return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          approved_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          notes: string | null
          organization_id: string
          reason: string
          received_at: string | null
          resolution:
            | Database["public"]["Enums"]["sales_return_resolution"]
            | null
          return_date: string
          return_number: number | null
          sales_order_id: string
          status: Database["public"]["Enums"]["sales_return_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          notes?: string | null
          organization_id: string
          reason: string
          received_at?: string | null
          resolution?:
            | Database["public"]["Enums"]["sales_return_resolution"]
            | null
          return_date?: string
          return_number?: number | null
          sales_order_id: string
          status?: Database["public"]["Enums"]["sales_return_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          reason?: string
          received_at?: string | null
          resolution?:
            | Database["public"]["Enums"]["sales_return_resolution"]
            | null
          return_date?: string
          return_number?: number | null
          sales_order_id?: string
          status?: Database["public"]["Enums"]["sales_return_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
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
          sales_return_item_id: string | null
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
          sales_return_item_id?: string | null
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
          sales_return_item_id?: string | null
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
          {
            foreignKeyName: "stock_movements_sales_return_item_id_fkey"
            columns: ["sales_return_item_id"]
            isOneToOne: false
            referencedRelation: "sales_return_items"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_credits: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          organization_id: string
          remaining_amount: number
          source_payment_id: string | null
          supplier_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          remaining_amount: number
          source_payment_id?: string | null
          supplier_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          remaining_amount?: number
          source_payment_id?: string | null
          supplier_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_credits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_credits_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      system_announcements: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          message: string
          organization_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          message: string
          organization_id?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          organization_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_announcements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      taxes: {
        Row: {
          catalog_category: string | null
          catalog_key: string | null
          catalog_province: string | null
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_favorite: boolean
          is_favorite_credit_notes: boolean
          is_favorite_debit_notes: boolean
          is_favorite_direct_sales: boolean
          is_favorite_sales: boolean
          name: string
          organization_id: string | null
          rate: number
          updated_at: string | null
        }
        Insert: {
          catalog_category?: string | null
          catalog_key?: string | null
          catalog_province?: string | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_favorite?: boolean
          is_favorite_credit_notes?: boolean
          is_favorite_debit_notes?: boolean
          is_favorite_direct_sales?: boolean
          is_favorite_sales?: boolean
          name: string
          organization_id?: string | null
          rate?: number
          updated_at?: string | null
        }
        Update: {
          catalog_category?: string | null
          catalog_key?: string | null
          catalog_province?: string | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_favorite?: boolean
          is_favorite_credit_notes?: boolean
          is_favorite_debit_notes?: boolean
          is_favorite_direct_sales?: boolean
          is_favorite_sales?: boolean
          name?: string
          organization_id?: string | null
          rate?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taxes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      view_stock_detail: {
        Row: {
          brand: string | null
          category_name: string | null
          description: string | null
          image_url: string | null
          is_active: boolean | null
          min_stock: number | null
          organization_id: string | null
          product_id: string | null
          product_name: string | null
          profit_margin: number | null
          sale_price: number | null
          sku: string | null
          supplier_name: string | null
          total_stock: number | null
          unit_of_measure:
            | Database["public"]["Enums"]["unit_of_measure_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      generate_credit_note_number: { Args: { org_id: string }; Returns: string }
      generate_remittance_number: { Args: { org_id: string }; Returns: string }
      generate_token: { Args: { length: number }; Returns: string }
      get_cash_flow_projection: {
        Args: {
          p_customer_id?: string
          p_org_id: string
          p_supplier_id?: string
          p_weeks_lookahead?: number
        }
        Returns: Json
      }
      get_control_tower_kpis: {
        Args: {
          p_customer_id?: string
          p_end_date: string
          p_org_id: string
          p_start_date: string
          p_supplier_id?: string
        }
        Returns: Json
      }
      get_financial_balance: {
        Args: {
          p_customer_id?: string
          p_end_date: string
          p_org_id: string
          p_start_date: string
          p_supplier_id?: string
        }
        Returns: Json
      }
      get_order_status_board: {
        Args: {
          p_customer_id?: string
          p_end_date: string
          p_org_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_organization_members_with_users: {
        Args: { org_slug_param: string }
        Returns: {
          email: string
          full_name: string
          is_active: boolean
          is_owner: boolean
          member_created_at: string
          organization_id: string
          role_id: string
          role_key: string
          role_name: string
          user_id: string
        }[]
      }
      get_profitability_metrics: {
        Args: {
          p_date_from: string
          p_date_to: string
          p_group_by: string
          p_org_id: string
        }
        Returns: {
          label: string
          margin_percent: number
          order_count: number
          profit: number
          revenue: number
        }[]
      }
      get_stock_health_alerts: {
        Args: {
          p_org_id: string
          p_slow_moving_days?: number
          p_supplier_id?: string
        }
        Returns: Json
      }
      get_top_performers: {
        Args: { p_end_date: string; p_org_id: string; p_start_date: string }
        Returns: Json
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
      is_org_active: { Args: { p_org: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      lookup_organization_invitation: {
        Args: { p_token: string }
        Returns: Json
      }
      replace_price_list: {
        Args: {
          p_new_list_id: string
          p_old_list_id: string
          p_organization_id: string
        }
        Returns: undefined
      }
      update_product_prices_from_price_list: {
        Args: { p_organization_id: string; p_price_list_id: string }
        Returns: undefined
      }
      update_sale_order_atomic: {
        Args: {
          p_credit_days?: number
          p_customer_id?: string
          p_expiration_date?: string
          p_global_discount_percentage?: number
          p_invoice_number?: string
          p_invoice_type?: Database["public"]["Enums"]["invoice_type"]
          p_items?: Json
          p_observations?: string
          p_org_id: string
          p_sale_date?: string
          p_sale_id: string
          p_taxes?: Json
          p_user_id?: string
        }
        Returns: {
          arca_authorized_at: string | null
          arca_cae: string | null
          arca_cae_expires_at: string | null
          arca_last_error: string | null
          arca_point_of_sale: number | null
          arca_request_json: Json | null
          arca_response_json: Json | null
          arca_status: string
          arca_voucher_number: number | null
          arca_voucher_type_code: number | null
          cancelled_at: string | null
          carrier_id: string | null
          confirmed_at: string | null
          created_at: string | null
          created_by: string | null
          credit_days: number | null
          currency: string
          customer_id: string
          delivered_at: string | null
          dispatched_at: string | null
          expiration_date: string | null
          global_discount_amount: number | null
          global_discount_percentage: number | null
          id: string
          invoice_email_delivered_at: string | null
          invoice_email_last_attempt_at: string | null
          invoice_email_last_error: string | null
          invoice_email_last_event: string | null
          invoice_email_last_event_at: string | null
          invoice_email_recipient: string | null
          invoice_email_resend_id: string | null
          invoice_email_sent_at: string | null
          invoice_email_status: string
          invoice_number: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          is_historical: boolean
          observations: string | null
          organization_id: string
          remittance_number: string | null
          sale_date: string
          sale_number: number | null
          status: Database["public"]["Enums"]["order_status"]
          sub_total: number | null
          supplier_id: string | null
          total_amount: number
          total_tax_amount: number | null
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "sales_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_can_admin_organization: {
        Args: { target_org_id: string }
        Returns: boolean
      }
      user_has_org_permission: {
        Args: { permission_key: string; target_org_id: string }
        Returns: boolean
      }
    }
    Enums: {
      invitation_type: "one_time" | "multi_use"
      invoice_type:
        | "FACTURA_A"
        | "FACTURA_B"
        | "FACTURA_C"
        | "NOTA_DE_VENTA"
        | "FACTURA_E"
        | "FACTURA_A_RETENCION"
        | "NOTA_DE_CREDITO_A"
        | "NOTA_DE_CREDITO_B"
        | "NOTA_DE_CREDITO_C"
        | "NOTA_DE_DEBITO_A"
        | "NOTA_DE_DEBITO_B"
        | "NOTA_DE_DEBITO_C"
      invoice_type_enum:
        | "FACTURA_A"
        | "FACTURA_B"
        | "FACTURA_C"
        | "TICKET_X"
        | "PRESUPUESTO"
      order_flow_status:
        | "PENDING_FINANCE"
        | "FINANCE_REJECTED"
        | "PENDING_STOCK"
        | "STOCK_OK"
        | "PURCHASE_REQUIRED"
        | "PURCHASING"
        | "GOODS_RECEIVED"
        | "IN_PRODUCTION"
        | "DESIGN_REVIEW"
        | "PREPARING"
        | "DISPATCHED"
        | "DELIVERED"
        | "CANCELLED"
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
      payment_method_type:
        | "efectivo"
        | "tarjeta de credito"
        | "tarjeta de debito"
        | "transferencia"
        | "cheque"
      pos_payment_method:
        | "CASH"
        | "DEBIT_CARD"
        | "CREDIT_CARD"
        | "QR"
        | "TRANSFER"
        | "OTHER"
        | "CURRENT_ACCOUNT"
      pos_session_status: "OPEN" | "CLOSED" | "SUSPENDED"
      purchase_order_status: "ORDERED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED"
      quote_status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "CONVERTED"
      receivable_status: "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE"
      returned_item_condition:
        | "GOOD"
        | "DAMAGED"
        | "EXPIRED"
        | "WRONG_PRODUCT"
        | "OTHER"
      sales_price_list_type: "PERCENTAGE" | "PRICE"
      sales_return_resolution:
        | "RESTOCK"
        | "REPLACEMENT"
        | "CREDIT"
        | "REFUND"
        | "DISCARD"
      sales_return_status:
        | "REQUESTED"
        | "RECEIVED"
        | "APPROVED"
        | "REJECTED"
        | "CLOSED"
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
      invoice_type: [
        "FACTURA_A",
        "FACTURA_B",
        "FACTURA_C",
        "NOTA_DE_VENTA",
        "FACTURA_E",
        "FACTURA_A_RETENCION",
        "NOTA_DE_CREDITO_A",
        "NOTA_DE_CREDITO_B",
        "NOTA_DE_CREDITO_C",
        "NOTA_DE_DEBITO_A",
        "NOTA_DE_DEBITO_B",
        "NOTA_DE_DEBITO_C",
      ],
      invoice_type_enum: [
        "FACTURA_A",
        "FACTURA_B",
        "FACTURA_C",
        "TICKET_X",
        "PRESUPUESTO",
      ],
      order_flow_status: [
        "PENDING_FINANCE",
        "FINANCE_REJECTED",
        "PENDING_STOCK",
        "STOCK_OK",
        "PURCHASE_REQUIRED",
        "PURCHASING",
        "GOODS_RECEIVED",
        "IN_PRODUCTION",
        "DESIGN_REVIEW",
        "PREPARING",
        "DISPATCHED",
        "DELIVERED",
        "CANCELLED",
      ],
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
      payment_method_type: [
        "efectivo",
        "tarjeta de credito",
        "tarjeta de debito",
        "transferencia",
        "cheque",
      ],
      pos_payment_method: [
        "CASH",
        "DEBIT_CARD",
        "CREDIT_CARD",
        "QR",
        "TRANSFER",
        "OTHER",
        "CURRENT_ACCOUNT",
      ],
      pos_session_status: ["OPEN", "CLOSED", "SUSPENDED"],
      purchase_order_status: ["ORDERED", "IN_TRANSIT", "RECEIVED", "CANCELLED"],
      quote_status: ["DRAFT", "SENT", "APPROVED", "REJECTED", "CONVERTED"],
      receivable_status: ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"],
      returned_item_condition: [
        "GOOD",
        "DAMAGED",
        "EXPIRED",
        "WRONG_PRODUCT",
        "OTHER",
      ],
      sales_price_list_type: ["PERCENTAGE", "PRICE"],
      sales_return_resolution: [
        "RESTOCK",
        "REPLACEMENT",
        "CREDIT",
        "REFUND",
        "DISCARD",
      ],
      sales_return_status: [
        "REQUESTED",
        "RECEIVED",
        "APPROVED",
        "REJECTED",
        "CLOSED",
      ],
      stock_movement_type: ["INBOUND", "OUTBOUND", "ADJUSTMENT", "TRANSFER"],
      unit_of_measure_type: ["UN", "KG", "LT", "MT"],
    },
  },
} as const
