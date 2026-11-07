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
          id: string
          owner_id: string
          tab_names: Json
          title: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          tab_names?: Json
          title?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          tab_names?: Json
          title?: string
          updated_at?: string
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
          phone: string | null
          representative_id: string | null
          representative_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          owner_id?: string
          phone?: string | null
          representative_id?: string | null
          representative_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          owner_id?: string
          phone?: string | null
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
      products: {
        Row: {
          category: string | null
          id: string
          is_active: boolean
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
          category?: string | null
          id?: string
          is_active?: boolean
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
          category?: string | null
          id?: string
          is_active?: boolean
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
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          kind: string | null
          owner_id: string | null
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
          supplier_id: string | null
          tx_date: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cashflow_series: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          income: number
          outcome: number
          tx_date: string
        }[]
      }
      customer_statement: {
        Args: { p_customer_id: string; p_from?: string; p_to?: string }
        Returns: {
          balance: number
          credit: number
          debit: number
          description: string
          ref: string
          row_no: number
          tx_date: string
          tx_type: string
        }[]
      }
      current_owner_id: { Args: never; Returns: string }
      current_role_name: { Args: never; Returns: string }
      get_current_rep_id: { Args: never; Returns: string }
      get_current_rep_owner_id: { Args: never; Returns: string }
      get_manager_id: { Args: never; Returns: string }
      is_manager: { Args: never; Returns: boolean }
      is_rep_user: { Args: never; Returns: boolean }
      kpi_summary: { Args: { p_from?: string; p_to?: string }; Returns: Json }
      receivables_aging: {
        Args: { p_as_of?: string }
        Returns: {
          amount: number
          bucket: string
        }[]
      }
      rep_directory: {
        Args: never
        Returns: {
          cash_count: number
          cash_total: number
          collected_total: number
          created_at: string
          credit_count: number
          credit_total: number
          customers_count: number
          email: string | null
          is_active: boolean
          is_linked: boolean
          last_activity: string | null
          month_collected: number
          month_sales: number
          monthly_target: number
          name: string
          notes: string | null
          outstanding_total: number
          overdue_count: number
          phone: string | null
          rep_id: string
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
          row_no: number
          tx_date: string
          tx_type: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
