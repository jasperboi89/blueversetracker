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
      accounts: {
        Row: {
          archived: boolean
          created_at: string
          data: Json
          id: string
          name: string
          notes: string | null
          number: string
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          data?: Json
          id?: string
          name: string
          notes?: string | null
          number: string
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          data?: Json
          id?: string
          name?: string
          notes?: string | null
          number?: string
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      additional_work: {
        Row: {
          created_at: string
          data: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_audit_log: {
        Row: {
          created_at: string
          email: string | null
          event_type: string
          id: string
          ip: string | null
          meta: Json | null
          role: Database["public"]["Enums"]["app_role"] | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          event_type: string
          id?: string
          ip?: string | null
          meta?: Json | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          event_type?: string
          id?: string
          ip?: string | null
          meta?: Json | null
          role?: Database["public"]["Enums"]["app_role"] | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      authorized_users: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          last_login_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      dispatch_sessions: {
        Row: {
          created_at: string
          data: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dispatch_templates: {
        Row: {
          created_at: string
          data: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dropdown_labels: {
        Row: {
          group_key: string
          options: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          group_key: string
          options?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          group_key?: string
          options?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      night_plan_items: {
        Row: {
          created_at: string
          data: Json
          id: string
          shift_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          shift_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          shift_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      qb_discoveries: {
        Row: {
          context: Json
          created_at: string
          id: string
          kind: string
          label: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          kind: string
          label: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          kind?: string
          label?: string
          user_id?: string
        }
        Relationships: []
      }
      qb_tuning_prefs: {
        Row: {
          created_at: string
          event_frequency: string
          particle_density: string
          sleep_mode: boolean
          updated_at: string
          user_id: string
          visual_intensity: number
        }
        Insert: {
          created_at?: string
          event_frequency?: string
          particle_density?: string
          sleep_mode?: boolean
          updated_at?: string
          user_id: string
          visual_intensity?: number
        }
        Update: {
          created_at?: string
          event_frequency?: string
          particle_density?: string
          sleep_mode?: boolean
          updated_at?: string
          user_id?: string
          visual_intensity?: number
        }
        Relationships: []
      }
      recent_tickets: {
        Row: {
          shift_key: string
          ticket_ids: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          shift_key: string
          ticket_ids?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          shift_key?: string
          ticket_ids?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ticket_work_sessions: {
        Row: {
          data: Json
          ticket_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          data?: Json
          ticket_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          ticket_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          created_at: string
          data: Json
          id: string
          number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_theme_prefs: {
        Row: {
          created_at: string
          qb_first_entry_completed: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          qb_first_entry_completed?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          qb_first_entry_completed?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "programmer" | "viewer"
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
      app_role: ["admin", "programmer", "viewer"],
    },
  },
} as const
