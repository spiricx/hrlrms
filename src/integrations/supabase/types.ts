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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      batch_repayments: {
        Row: {
          actual_amount: number
          batch_id: string
          created_at: string
          expected_amount: number
          id: string
          month_for: number
          notes: string | null
          payment_date: string
          receipt_url: string | null
          recorded_by: string | null
          rrr_number: string
        }
        Insert: {
          actual_amount: number
          batch_id: string
          created_at?: string
          expected_amount: number
          id?: string
          month_for: number
          notes?: string | null
          payment_date: string
          receipt_url?: string | null
          recorded_by?: string | null
          rrr_number: string
        }
        Update: {
          actual_amount?: number
          batch_id?: string
          created_at?: string
          expected_amount?: number
          id?: string
          month_for?: number
          notes?: string | null
          payment_date?: string
          receipt_url?: string | null
          recorded_by?: string | null
          rrr_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_repayments_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "loan_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiaries: {
        Row: {
          address: string | null
          bank_branch: string
          batch_id: string | null
          bvn_number: string | null
          commencement_date: string
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          date_of_employment: string | null
          default_count: number
          department: string
          disbursement_date: string
          email: string | null
          employee_id: string
          employer_number: string | null
          first_name: string | null
          gender: string | null
          id: string
          interest_rate: number
          loan_amount: number
          loan_reference_number: string | null
          marital_status: string | null
          monthly_emi: number
          moratorium_months: number
          name: string
          nhf_number: string | null
          nin_number: string | null
          other_name: string | null
          outstanding_balance: number
          phone_number: string | null
          state: string
          status: string
          surname: string | null
          tenor_months: number
          termination_date: string
          title: string | null
          total_paid: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_branch?: string
          batch_id?: string | null
          bvn_number?: string | null
          commencement_date: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          date_of_employment?: string | null
          default_count?: number
          department: string
          disbursement_date: string
          email?: string | null
          employee_id: string
          employer_number?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          interest_rate?: number
          loan_amount: number
          loan_reference_number?: string | null
          marital_status?: string | null
          monthly_emi: number
          moratorium_months?: number
          name: string
          nhf_number?: string | null
          nin_number?: string | null
          other_name?: string | null
          outstanding_balance: number
          phone_number?: string | null
          state?: string
          status?: string
          surname?: string | null
          tenor_months: number
          termination_date: string
          title?: string | null
          total_paid?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_branch?: string
          batch_id?: string | null
          bvn_number?: string | null
          commencement_date?: string
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          date_of_employment?: string | null
          default_count?: number
          department?: string
          disbursement_date?: string
          email?: string | null
          employee_id?: string
          employer_number?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          interest_rate?: number
          loan_amount?: number
          loan_reference_number?: string | null
          marital_status?: string | null
          monthly_emi?: number
          moratorium_months?: number
          name?: string
          nhf_number?: string | null
          nin_number?: string | null
          other_name?: string | null
          outstanding_balance?: number
          phone_number?: string | null
          state?: string
          status?: string
          surname?: string | null
          tenor_months?: number
          termination_date?: string
          title?: string | null
          total_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficiaries_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "loan_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      default_logs: {
        Row: {
          applied_at: string
          beneficiary_id: string
          charge_amount: number
          id: string
          month_year: string
        }
        Insert: {
          applied_at?: string
          beneficiary_id: string
          charge_amount: number
          id?: string
          month_year: string
        }
        Update: {
          applied_at?: string
          beneficiary_id?: string
          charge_amount?: number
          id?: string
          month_year?: string
        }
        Relationships: [
          {
            foreignKeyName: "default_logs_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_submissions: {
        Row: {
          admin_response: string | null
          category: string
          created_at: string
          id: string
          message: string
          priority: string
          responded_at: string | null
          responded_by: string | null
          status: string
          subject: string
          submitter_branch: string
          submitter_name: string
          submitter_state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          category: string
          created_at?: string
          id?: string
          message?: string
          priority?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject?: string
          submitter_branch?: string
          submitter_name?: string
          submitter_state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          priority?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          subject?: string
          submitter_branch?: string
          submitter_name?: string
          submitter_state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loan_batches: {
        Row: {
          bank_branch: string
          batch_code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          state: string
          status: string
          updated_at: string
        }
        Insert: {
          bank_branch?: string
          batch_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          state?: string
          status?: string
          updated_at?: string
        }
        Update: {
          bank_branch?: string
          batch_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          state?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bank_branch: string
          created_at: string
          email: string
          first_name: string
          full_name: string
          id: string
          nhf_account_number: string
          other_names: string
          staff_id_no: string
          state: string
          surname: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_branch?: string
          created_at?: string
          email?: string
          first_name?: string
          full_name?: string
          id?: string
          nhf_account_number?: string
          other_names?: string
          staff_id_no?: string
          state?: string
          surname?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_branch?: string
          created_at?: string
          email?: string
          first_name?: string
          full_name?: string
          id?: string
          nhf_account_number?: string
          other_names?: string
          staff_id_no?: string
          state?: string
          surname?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_change_logs: {
        Row: {
          action: string
          changed_by: string | null
          changed_by_name: string
          created_at: string
          id: string
          new_role: string
          previous_role: string | null
          user_email: string
          user_full_name: string
          user_id: string
        }
        Insert: {
          action?: string
          changed_by?: string | null
          changed_by_name?: string
          created_at?: string
          id?: string
          new_role: string
          previous_role?: string | null
          user_email?: string
          user_full_name?: string
          user_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_by_name?: string
          created_at?: string
          id?: string
          new_role?: string
          previous_role?: string | null
          user_email?: string
          user_full_name?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_activity_logs: {
        Row: {
          action: string
          bank_branch: string
          created_at: string
          email: string
          full_name: string
          id: string
          ip_address: string | null
          state: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action?: string
          bank_branch?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          ip_address?: string | null
          state?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          bank_branch?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          ip_address?: string | null
          state?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_audit_logs: {
        Row: {
          action: string
          field_changed: string
          id: string
          modified_at: string
          modified_by: string | null
          new_value: string | null
          old_value: string | null
          staff_id: string
        }
        Insert: {
          action?: string
          field_changed?: string
          id?: string
          modified_at?: string
          modified_by?: string | null
          new_value?: string | null
          old_value?: string | null
          staff_id: string
        }
        Update: {
          action?: string
          field_changed?: string
          id?: string
          modified_at?: string
          modified_by?: string | null
          new_value?: string | null
          old_value?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_audit_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leaves: {
        Row: {
          created_at: string
          created_by: string | null
          days_entitled: number
          days_used: number
          end_date: string
          id: string
          leave_year: number
          notes: string | null
          staff_id: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days_entitled?: number
          days_used?: number
          end_date: string
          id?: string
          leave_year?: number
          notes?: string | null
          staff_id: string
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days_entitled?: number
          days_used?: number
          end_date?: string
          id?: string
          leave_year?: number
          notes?: string | null
          staff_id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_leaves_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          branch: string
          bvn_number: string | null
          cadre: string | null
          created_at: string
          created_by: string | null
          date_employed: string | null
          date_of_birth: string | null
          department: string | null
          designation: string | null
          email: string | null
          first_name: string
          gender: string | null
          group_name: string | null
          id: string
          marital_status: string | null
          nhf_number: string | null
          nin_number: string | null
          other_names: string | null
          phone: string | null
          staff_id: string
          state: string
          status: string
          status_date: string | null
          status_reason: string | null
          surname: string
          title: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          branch?: string
          bvn_number?: string | null
          cadre?: string | null
          created_at?: string
          created_by?: string | null
          date_employed?: string | null
          date_of_birth?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          group_name?: string | null
          id?: string
          marital_status?: string | null
          nhf_number?: string | null
          nin_number?: string | null
          other_names?: string | null
          phone?: string | null
          staff_id: string
          state?: string
          status?: string
          status_date?: string | null
          status_reason?: string | null
          surname?: string
          title?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string
          bvn_number?: string | null
          cadre?: string | null
          created_at?: string
          created_by?: string | null
          date_employed?: string | null
          date_of_birth?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          group_name?: string | null
          id?: string
          marital_status?: string | null
          nhf_number?: string | null
          nin_number?: string | null
          other_names?: string | null
          phone?: string | null
          staff_id?: string
          state?: string
          status?: string
          status_date?: string | null
          status_reason?: string | null
          surname?: string
          title?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      staff_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          from_branch: string
          from_department: string
          from_state: string
          from_unit: string
          id: string
          reason: string
          staff_id: string
          status: string
          to_branch: string
          to_department: string
          to_state: string
          to_unit: string
          transfer_date: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          from_branch?: string
          from_department?: string
          from_state?: string
          from_unit?: string
          id?: string
          reason?: string
          staff_id: string
          status?: string
          to_branch?: string
          to_department?: string
          to_state?: string
          to_unit?: string
          transfer_date?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          from_branch?: string
          from_department?: string
          from_state?: string
          from_unit?: string
          id?: string
          reason?: string
          staff_id?: string
          status?: string
          to_branch?: string
          to_department?: string
          to_state?: string
          to_unit?: string
          transfer_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_transfers_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          beneficiary_id: string
          created_at: string
          date_paid: string
          id: string
          month_for: number
          notes: string | null
          receipt_url: string | null
          recorded_by: string | null
          rrr_number: string
        }
        Insert: {
          amount: number
          beneficiary_id: string
          created_at?: string
          date_paid: string
          id?: string
          month_for: number
          notes?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          rrr_number: string
        }
        Update: {
          amount?: number
          beneficiary_id?: string
          created_at?: string
          date_paid?: string
          id?: string
          month_for?: number
          notes?: string | null
          receipt_url?: string | null
          recorded_by?: string | null
          rrr_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_beneficiary_id_fkey"
            columns: ["beneficiary_id"]
            isOneToOne: false
            referencedRelation: "beneficiaries"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          module_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          module_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          module_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_default_count: {
        Args: {
          p_commencement_date: string
          p_monthly_emi: number
          p_outstanding_balance: number
          p_status: string
          p_tenor_months: number
          p_total_paid: number
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "loan_officer" | "staff" | "manager"
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
      app_role: ["admin", "loan_officer", "staff", "manager"],
    },
  },
} as const
