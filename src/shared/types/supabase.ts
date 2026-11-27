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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          allow_negative_stock: boolean
          high_custody_threshold: number
          id: string
          low_stock_threshold: number
          owner_id: string
          tab_names: Json
          title: string
          updated_at: string
        }
        Insert: {
          allow_negative_stock?: boolean
          high_custody_threshold?: number
          id?: string
          low_stock_threshold?: number
          owner_id?: string
          tab_names?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          allow_negative_stock?: boolean
          high_custody_threshold?: number
          id?: string
          low_stock_threshold?: number
          owner_id?: string
          tab_names?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_logs: {
        Row: {
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          employee_id: string
          id: string
          late_minutes: number
          notes: string | null
          overtime_hours: number
          owner_id: string
          status: string
          work_date: string
        }
        Insert: {
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          employee_id: string
          id?: string
          late_minutes?: number
          notes?: string | null
          overtime_hours?: number
          owner_id?: string
          status?: string
          work_date?: string
        }
        Update: {
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          late_minutes?: number
          notes?: string | null
          overtime_hours?: number
          owner_id?: string
          status?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          changed_fields: string[] | null
          created_at: string
          description: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          owner_id: string
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          changed_fields?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          owner_id: string
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          changed_fields?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          owner_id?: string
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      cash_invoices: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          date: string
          id: string
          invoice_no: string
          item: string
          notes: string | null
          owner_id: string
          rep_id: string | null
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          date?: string
          id?: string
          invoice_no?: string
          item?: string
          notes?: string | null
          owner_id?: string
          rep_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          date?: string
          id?: string
          invoice_no?: string
          item?: string
          notes?: string | null
          owner_id?: string
          rep_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_statement"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "cash_invoices_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "reps"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_invoices: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          date: string
          due_date: string
          id: string
          invoice_no: string
          item: string
          owner_id: string
          paid: number
          rep_id: string | null
          status: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          date?: string
          due_date?: string
          id?: string
          invoice_no: string
          item?: string
          owner_id?: string
          paid?: number
          rep_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          date?: string
          due_date?: string
          id?: string
          invoice_no?: string
          item?: string
          owner_id?: string
          paid?: number
          rep_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_statement"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "credit_invoices_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "reps"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          id: string
          name: string
          opening_balance: number
          owner_id: string
          phone: string
          representative_id: string | null
          representative_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          owner_id?: string
          phone: string
          representative_id?: string | null
          representative_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          owner_id?: string
          phone?: string
          representative_id?: string | null
          representative_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_representative_id_fkey"
            columns: ["representative_id"]
            isOneToOne: false
            referencedRelation: "reps"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number | null
          id: string
          kind: string
          loan_id: string | null
          owner_id: string
          reason: string | null
          tx_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          hours?: number | null
          id?: string
          kind: string
          loan_id?: string | null
          owner_id?: string
          reason?: string | null
          tx_date?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          hours?: number | null
          id?: string
          kind?: string
          loan_id?: string | null
          owner_id?: string
          reason?: string | null
          tx_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_adjustments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_adjustments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loans: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          loan_date: string
          monthly_installment: number
          notes: string | null
          owner_id: string
          remaining_amount: number
          status: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          loan_date?: string
          monthly_installment: number
          notes?: string | null
          owner_id?: string
          remaining_amount: number
          status?: string
          total_amount: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          loan_date?: string
          monthly_installment?: number
          notes?: string | null
          owner_id?: string
          remaining_amount?: number
          status?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_loans_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          base_salary: number
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          job_title: string
          overtime_hourly_rate: number
          owner_id: string
          phone: string | null
          rep_id: string | null
          shift_end: string
          shift_start: string
        }
        Insert: {
          base_salary?: number
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          job_title?: string
          overtime_hourly_rate?: number
          owner_id?: string
          phone?: string | null
          rep_id?: string | null
          shift_end?: string
          shift_start?: string
        }
        Update: {
          base_salary?: number
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string
          overtime_hourly_rate?: number
          owner_id?: string
          phone?: string | null
          rep_id?: string | null
          shift_end?: string
          shift_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: true
            referencedRelation: "reps"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          description: string | null
          id: string
          owner_id: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          owner_id?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          invoice_type: string
          line_total: number | null
          owner_id: string
          product_id: string
          qty: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          invoice_type: string
          line_total?: number | null
          owner_id: string
          product_id: string
          qty: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          invoice_type?: string
          line_total?: number | null
          owner_id?: string
          product_id?: string
          qty?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          owner_id: string
          recipient_user_id: string | null
          severity: string
          target_id: string | null
          target_tab: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          owner_id: string
          recipient_user_id?: string | null
          severity: string
          target_id?: string | null
          target_tab?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          owner_id?: string
          recipient_user_id?: string | null
          severity?: string
          target_id?: string | null
          target_tab?: string | null
          title?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          credit_invoice_id: string | null
          customer_id: string | null
          date: string
          id: string
          method: string
          owner_id: string
          rep_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          credit_invoice_id?: string | null
          customer_id?: string | null
          date?: string
          id?: string
          method?: string
          owner_id?: string
          rep_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          credit_invoice_id?: string | null
          customer_id?: string | null
          date?: string
          id?: string
          method?: string
          owner_id?: string
          rep_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_credit_invoice_id_fkey"
            columns: ["credit_invoice_id"]
            isOneToOne: false
            referencedRelation: "credit_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_credit_invoice_id_fkey"
            columns: ["credit_invoice_id"]
            isOneToOne: false
            referencedRelation: "v_credit_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_statement"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "reps"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          sort_order?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          batch_number: string | null
          category: string | null
          expiry_date: string | null
          id: string
          is_active: boolean
          min_stock_alert: number
          name_ar: string
          name_en: string | null
          owner_id: string
          price: number
          sku: string | null
          sort_order: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          batch_number?: string | null
          category?: string | null
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          min_stock_alert?: number
          name_ar: string
          name_en?: string | null
          owner_id?: string
          price: number
          sku?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          batch_number?: string | null
          category?: string | null
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          min_stock_alert?: number
          name_ar?: string
          name_en?: string | null
          owner_id?: string
          price?: number
          sku?: string | null
          sort_order?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reps: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          monthly_target: number
          name: string
          notes: string | null
          owner_id: string
          permissions: Json
          phone: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          monthly_target?: number
          name: string
          notes?: string | null
          owner_id?: string
          permissions?: Json
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          monthly_target?: number
          name?: string
          notes?: string | null
          owner_id?: string
          permissions?: Json
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sales_return_lines: {
        Row: {
          avg_cost_snapshot: number
          condition: string
          created_at: string
          id: string
          line_total: number | null
          product_id: string
          qty: number
          return_id: string
          unit_price: number
        }
        Insert: {
          avg_cost_snapshot?: number
          condition: string
          created_at?: string
          id?: string
          line_total?: number | null
          product_id: string
          qty: number
          return_id: string
          unit_price: number
        }
        Update: {
          avg_cost_snapshot?: number
          condition?: string
          created_at?: string
          id?: string
          line_total?: number | null
          product_id?: string
          qty?: number
          return_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          invoice_id: string | null
          invoice_type: string | null
          notes: string | null
          owner_id: string
          refund_method: string
          rep_id: string | null
          return_date: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          invoice_id?: string | null
          invoice_type?: string | null
          notes?: string | null
          owner_id: string
          refund_method: string
          rep_id?: string | null
          return_date?: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          invoice_id?: string | null
          invoice_type?: string | null
          notes?: string | null
          owner_id?: string
          refund_method?: string
          rep_id?: string | null
          return_date?: string
          total_amount?: number
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
            foreignKeyName: "sales_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_statement"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sales_returns_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "reps"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          avg_cost_snapshot: number | null
          batch_number: string | null
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          movement_type: string
          notes: string | null
          owner_id: string
          product_id: string
          qty: number
          reference_id: string | null
          reference_type: string | null
          unit_cost: number
        }
        Insert: {
          avg_cost_snapshot?: number | null
          batch_number?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          owner_id: string
          product_id: string
          qty: number
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number
        }
        Update: {
          avg_cost_snapshot?: number | null
          batch_number?: string | null
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          owner_id?: string
          product_id?: string
          qty?: number
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          method: string | null
          notes: string | null
          owner_id: string
          payment_date: string
          reference: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          owner_id?: string
          payment_date?: string
          reference?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string | null
          notes?: string | null
          owner_id?: string
          payment_date?: string
          reference?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchase_lines: {
        Row: {
          batch_number: string | null
          created_at: string
          expiry_date: string | null
          id: string
          line_total: number | null
          owner_id: string
          product_id: string
          purchase_id: string
          qty: number
          unit_cost: number
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          line_total?: number | null
          owner_id?: string
          product_id: string
          purchase_id: string
          qty: number
          unit_cost: number
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          line_total?: number | null
          owner_id?: string
          product_id?: string
          purchase_id?: string
          qty?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchase_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_purchase_lines_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "supplier_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_purchases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invoice_no: string | null
          notes: string | null
          owner_id: string
          payment_type: string
          purchase_date: string
          supplier_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string | null
          notes?: string | null
          owner_id?: string
          payment_type?: string
          purchase_date?: string
          supplier_id: string
          total_amount: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_no?: string | null
          notes?: string | null
          owner_id?: string
          payment_type?: string
          purchase_date?: string
          supplier_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          owner_id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          owner_id?: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          owner_id?: string
          phone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          owner_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_credit_invoices: {
        Row: {
          amount: number | null
          created_at: string | null
          customer_id: string | null
          date: string | null
          due_date: string | null
          id: string | null
          invoice_no: string | null
          item: string | null
          linked_payments: number | null
          owner_id: string | null
          paid: number | null
          remaining: number | null
          rep_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_statement"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "credit_invoices_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "reps"
            referencedColumns: ["id"]
          },
        ]
      }
      v_customer_statement: {
        Row: {
          cash_tot: number | null
          credit_tot: number | null
          customer: string | null
          customer_id: string | null
          owner_id: string | null
          pay_tot: number | null
          phone: string | null
          remaining: number | null
          reps_list: string | null
        }
        Relationships: []
      }
      v_customer_transactions: {
        Row: {
          amount: number | null
          created_at: string | null
          customer_id: string | null
          description: string | null
          id: string | null
          invoice_id: string | null
          invoice_type: string | null
          kind: string | null
          owner_id: string | null
          payment_id: string | null
          ref: string | null
          tx_date: string | null
        }
        Relationships: []
      }
      v_supplier_transactions: {
        Row: {
          amount: number | null
          created_at: string | null
          description: string | null
          id: string | null
          kind: string | null
          owner_id: string | null
          payment_type: string | null
          ref: string | null
          reference_id: string | null
          reference_type: string | null
          supplier_id: string | null
          tx_date: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_stock: {
        Args: { p_notes?: string; p_product_id: string; p_qty_delta: number }
        Returns: string
      }
      cashflow_series: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          income: number
          outcome: number
          tx_date: string
        }[]
      }
      current_owner_id: { Args: Record<PropertyKey, never>; Returns: string }
      current_role_name: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["app_role"]
      }
      customer_statement: {
        Args: { p_customer_id: string; p_from?: string; p_to?: string }
        Returns: {
          balance: number
          credit: number
          debit: number
          description: string
          invoice_id: string
          invoice_type: string
          payment_id: string
          ref: string
          row_no: number
          tx_date: string
          tx_type: string
        }[]
      }
      delete_cash_invoice: { Args: { p_id: string }; Returns: undefined }
      delete_credit_invoice: { Args: { p_id: string }; Returns: undefined }
      delete_sales_return: { Args: { p_id: string }; Returns: undefined }
      delete_supplier_purchase: { Args: { p_id: string }; Returns: undefined }
      get_current_rep_id: { Args: Record<PropertyKey, never>; Returns: string }
      get_current_rep_owner_id: { Args: Record<PropertyKey, never>; Returns: string }
      get_email_by_phone: { Args: { p_phone: string }; Returns: Json }
      get_manager_id: { Args: Record<PropertyKey, never>; Returns: string }
      get_operational_alerts: {
        Args: Record<PropertyKey, never>
        Returns: {
          alert_key: string
          category: string
          count: number
          message: string
          severity: string
          target_id: string
          target_tab: string
          title: string
        }[]
      }
      is_manager: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_rep_user: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_sales_rep: { Args: Record<PropertyKey, never>; Returns: boolean }
      kpi_summary: { Args: { p_from?: string; p_to?: string }; Returns: Json }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      monthly_payroll_summary: {
        Args: { p_month: number; p_year: number }
        Returns: {
          absent_days: number
          active_loan_balance: number
          base_salary: number
          bonuses_total: number
          deductions_total: number
          employee_id: string
          full_name: string
          job_title: string
          late_days: number
          net_salary: number
          overtime_total: number
          phone: string
          present_days: number
          suggested_loan_deduction: number
          total_late_minutes: number
          total_overtime_hours: number
        }[]
      }
      process_sales_return: {
        Args: { p_lines: Json; p_return: Json }
        Returns: string
      }
      product_atp: {
        Args: { p_owner_id: string; p_product_id: string }
        Returns: number
      }
      product_avg_cost: {
        Args: { p_owner_id: string; p_product_id: string }
        Returns: number
      }
      product_consumption_summary: {
        Args: { p_from: string; p_product_id: string; p_to: string }
        Returns: {
          avg_unit_price: number
          invoice_count: number
          total_qty: number
          total_revenue: number
          unique_customers: number
        }[]
      }
      product_customer_breakdown: {
        Args: { p_from: string; p_product_id: string; p_to: string }
        Returns: {
          customer_id: string
          customer_name: string
          customer_phone: string
          last_purchase_date: string
          order_count: number
          rep_name: string
          share_pct: number
          total_qty: number
          total_revenue: number
        }[]
      }
      product_on_hand: {
        Args: { p_owner_id: string; p_product_id: string }
        Returns: number
      }
      product_reserved_qty: {
        Args: { p_owner_id: string; p_product_id: string }
        Returns: number
      }
      product_sales_history: {
        Args: { p_from: string; p_product_id: string; p_to: string }
        Returns: {
          customer_id: string
          customer_name: string
          invoice_id: string
          invoice_no: string
          invoice_type: string
          line_total: number
          qty: number
          rep_name: string
          tx_date: string
          unit_price: number
        }[]
      }
      product_stock_summary: {
        Args: Record<PropertyKey, never>
        Returns: {
          avg_cost: number
          category: string
          is_active: boolean
          name_ar: string
          name_en: string
          on_hand: number
          price: number
          product_id: string
          sku: string
          stock_value: number
          unit: string
        }[]
      }
      product_stock_summary_v2: {
        Args: Record<PropertyKey, never>
        Returns: {
          alert_status: string
          avg_cost: number
          batch_number: string
          category: string
          days_to_expiry: number
          expiry_date: string
          is_active: boolean
          min_stock_alert: number
          name_ar: string
          name_en: string
          on_hand: number
          price: number
          product_id: string
          sku: string
          stock_value: number
          unit: string
        }[]
      }
      product_stock_summary_v3: {
        Args: Record<PropertyKey, never>
        Returns: {
          alert_status: string
          available_qty: number
          avg_cost: number
          batch_number: string
          category: string
          days_to_expiry: number
          expiry_date: string
          is_active: boolean
          min_stock_alert: number
          name_ar: string
          name_en: string
          on_hand: number
          price: number
          product_id: string
          reserved_qty: number
          sku: string
          stock_value: number
          unit: string
        }[]
      }
      provision_user_role: { Args: { p_user_id: string }; Returns: undefined }
      receivables_aging: {
        Args: { p_as_of?: string }
        Returns: {
          amount: number
          bucket: string
        }[]
      }
      receive_stock:
        | {
            Args: {
              p_notes?: string
              p_product_id: string
              p_qty: number
              p_reference?: string
              p_unit_cost: number
            }
            Returns: string
          }
        | {
            Args: {
              p_batch_number?: string
              p_expiry_date?: string
              p_notes?: string
              p_product_id: string
              p_qty: number
              p_reference?: string
              p_unit_cost: number
            }
            Returns: string
          }
      rep_can_read_invoice: {
        Args: { p_invoice_id: string; p_invoice_type: string }
        Returns: boolean
      }
      rep_can_reference_credit_invoice: {
        Args: { p_invoice_id: string }
        Returns: boolean
      }
      rep_can_reference_customer: {
        Args: { p_customer_id: string }
        Returns: boolean
      }
      rep_can_write_for: {
        Args: { p_customer_id: string; p_rep_id: string }
        Returns: boolean
      }
      rep_directory: {
        Args: Record<PropertyKey, never>
        Returns: {
          cash_count: number
          cash_total: number
          collected_total: number
          created_at: string
          credit_count: number
          credit_total: number
          customers_count: number
          email: string
          is_active: boolean
          is_linked: boolean
          last_activity: string
          month_collected: number
          month_sales: number
          monthly_target: number
          name: string
          notes: string
          outstanding_total: number
          overdue_count: number
          phone: string
          rep_id: string
        }[]
      }
      rep_has_permission: { Args: { p_key: string }; Returns: boolean }
      save_cash_invoice: {
        Args: { p_invoice: Json; p_lines: Json }
        Returns: string
      }
      save_cash_invoice_v2: {
        Args: { p_invoice: Json; p_lines: Json }
        Returns: string
      }
      save_credit_invoice: {
        Args: { p_invoice: Json; p_lines: Json; p_manager_override?: boolean }
        Returns: string
      }
      save_sales_return: {
        Args: { p_lines: Json; p_return: Json }
        Returns: string
      }
      save_supplier_purchase: {
        Args: { p_lines: Json; p_purchase: Json }
        Returns: string
      }
      stock_alerts_summary: { Args: Record<PropertyKey, never>; Returns: Json }
      stock_movement_history: {
        Args: { p_from?: string; p_product_id?: string; p_to?: string }
        Returns: {
          avg_cost_snapshot: number
          created_at: string
          id: string
          movement_type: string
          notes: string
          product_id: string
          product_name: string
          qty: number
          reference_id: string
          reference_type: string
          unit_cost: number
        }[]
      }
      stock_valuation: {
        Args: Record<PropertyKey, never>
        Returns: {
          avg_cost: number
          category: string
          name_ar: string
          on_hand: number
          product_id: string
          stock_value: number
          unit: string
        }[]
      }
      supplier_statement: {
        Args: { p_from?: string; p_supplier_id: string; p_to?: string }
        Returns: {
          balance: number
          credit: number
          debit: number
          description: string
          ref: string
          reference_id: string
          reference_type: string
          row_no: number
          tx_date: string
          tx_type: string
        }[]
      }
      unpaid_credit_invoices_list: {
        Args: Record<PropertyKey, never>
        Returns: {
          customer_id: string
          customer_name: string
          customer_phone: string
          days_diff: number
          due_date: string
          invoice_date: string
          invoice_id: string
          invoice_no: string
          is_overdue: boolean
          paid_amount: number
          remaining_amount: number
          rep_id: string
          rep_name: string
          status: string
          total_amount: number
        }[]
      }
    }
    Enums: {
      app_role: "manager" | "sales_rep"
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
  public: {
    Enums: {
      app_role: ["manager", "sales_rep"],
    },
  },
} as const
