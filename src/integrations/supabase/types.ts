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
      account_change_records: {
        Row: {
          account_name: string
          account_number: string
          after_text: string
          applied_at: string | null
          before_text: string
          change_type: string
          checklist: Json
          created_at: string
          id: string
          notes: string
          requester: string
          risk: string
          rollback_note: string
          status: string
          tested_by: string
          ticket_number: string
          title: string
          updated_at: string
          user_id: string
          verified_at: string | null
          work_ref: string
        }
        Insert: {
          account_name?: string
          account_number?: string
          after_text?: string
          applied_at?: string | null
          before_text?: string
          change_type?: string
          checklist?: Json
          created_at?: string
          id?: string
          notes?: string
          requester?: string
          risk?: string
          rollback_note?: string
          status?: string
          tested_by?: string
          ticket_number?: string
          title?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
          work_ref?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          after_text?: string
          applied_at?: string | null
          before_text?: string
          change_type?: string
          checklist?: Json
          created_at?: string
          id?: string
          notes?: string
          requester?: string
          risk?: string
          rollback_note?: string
          status?: string
          tested_by?: string
          ticket_number?: string
          title?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          work_ref?: string
        }
        Relationships: []
      }
      achievements_unlocked: {
        Row: {
          achievement_id: string
          id: string
          progress_snapshot: Json
          tier: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          id?: string
          progress_snapshot?: Json
          tier: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          id?: string
          progress_snapshot?: Json
          tier?: string
          unlocked_at?: string
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
      freshdesk_excluded_tickets: {
        Row: {
          excluded_at: string
          group_id: number | null
          reason: string
          subject: string | null
          ticket_id: number
        }
        Insert: {
          excluded_at?: string
          group_id?: number | null
          reason: string
          subject?: string | null
          ticket_id: number
        }
        Update: {
          excluded_at?: string
          group_id?: number | null
          reason?: string
          subject?: string | null
          ticket_id?: number
        }
        Relationships: []
      }
      freshdesk_search_documents: {
        Row: {
          account_number: string
          agent_id: number | null
          company_name: string
          conversation_text: string
          custom_fields: Json
          description_text: string
          freshdesk_created_at: string | null
          freshdesk_updated_at: string
          group_id: number | null
          indexed_at: string
          priority: number
          requester_name: string
          search_vector: unknown
          searchable_text: string
          status: number
          subject: string
          tags: string[]
          ticket: Json
          ticket_id: number
        }
        Insert: {
          account_number?: string
          agent_id?: number | null
          company_name?: string
          conversation_text?: string
          custom_fields?: Json
          description_text?: string
          freshdesk_created_at?: string | null
          freshdesk_updated_at: string
          group_id?: number | null
          indexed_at?: string
          priority: number
          requester_name?: string
          search_vector?: unknown
          searchable_text?: string
          status: number
          subject?: string
          tags?: string[]
          ticket: Json
          ticket_id: number
        }
        Update: {
          account_number?: string
          agent_id?: number | null
          company_name?: string
          conversation_text?: string
          custom_fields?: Json
          description_text?: string
          freshdesk_created_at?: string | null
          freshdesk_updated_at?: string
          group_id?: number | null
          indexed_at?: string
          priority?: number
          requester_name?: string
          search_vector?: unknown
          searchable_text?: string
          status?: number
          subject?: string
          tags?: string[]
          ticket?: Json
          ticket_id?: number
        }
        Relationships: []
      }
      freshdesk_search_sync_state: {
        Row: {
          completed: boolean
          completed_at: string | null
          conversations_indexed: number
          id: string
          last_error: string | null
          next_offset: number
          next_page: number
          started_at: string | null
          sync_since: string | null
          target_group_ids: Json | null
          tickets_indexed: number
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          conversations_indexed?: number
          id?: string
          last_error?: string | null
          next_offset?: number
          next_page?: number
          started_at?: string | null
          sync_since?: string | null
          target_group_ids?: Json | null
          tickets_indexed?: number
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          conversations_indexed?: number
          id?: string
          last_error?: string | null
          next_offset?: number
          next_page?: number
          started_at?: string | null
          sync_since?: string | null
          target_group_ids?: Json | null
          tickets_indexed?: number
          updated_at?: string
        }
        Relationships: []
      }
      is_manual_pages: {
        Row: {
          created_at: string
          id: string
          manual_id: string
          page_number: number
          search_vector: unknown
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manual_id: string
          page_number: number
          search_vector?: unknown
          text?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manual_id?: string
          page_number?: number
          search_vector?: unknown
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "is_manual_pages_manual_id_fkey"
            columns: ["manual_id"]
            isOneToOne: false
            referencedRelation: "is_manuals"
            referencedColumns: ["id"]
          },
        ]
      }
      is_manuals: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          page_count: number
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          page_count?: number
          size_bytes?: number
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          page_count?: number
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      is_script_entries: {
        Row: {
          attachments: Json
          created_at: string
          example_html: string
          id: string
          is_archived: boolean
          is_favorite: boolean
          is_pinned: boolean
          kind: string
          reason_html: string
          script_body: string
          tags: string[]
          title: string
          updated_at: string
          usage_html: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          example_html?: string
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_pinned?: boolean
          kind?: string
          reason_html?: string
          script_body?: string
          tags?: string[]
          title?: string
          updated_at?: string
          usage_html?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          example_html?: string
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_pinned?: boolean
          kind?: string
          reason_html?: string
          script_body?: string
          tags?: string[]
          title?: string
          updated_at?: string
          usage_html?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_folders: {
        Row: {
          color: string
          created_at: string
          description: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_notes: {
        Row: {
          ai_content_html: string
          ai_generated_at: string | null
          ai_source_fingerprint: string
          attachments: Json
          content_html: string
          created_at: string
          folder_id: string | null
          id: string
          is_archived: boolean
          is_favorite: boolean
          is_pinned: boolean
          note_type: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          versions: Json
        }
        Insert: {
          ai_content_html?: string
          ai_generated_at?: string | null
          ai_source_fingerprint?: string
          attachments?: Json
          content_html?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_pinned?: boolean
          note_type?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id: string
          versions?: Json
        }
        Update: {
          ai_content_html?: string
          ai_generated_at?: string | null
          ai_source_fingerprint?: string
          attachments?: Json
          content_html?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          is_archived?: boolean
          is_favorite?: boolean
          is_pinned?: boolean
          note_type?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          versions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_notes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "knowledge_folders"
            referencedColumns: ["id"]
          },
        ]
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
      shift_handoffs: {
        Row: {
          created_at: string
          escalations: string
          id: string
          notes: string
          open_items: Json
          published_at: string | null
          shift_date: string
          shift_key: string
          status: string
          summary: string
          updated_at: string
          user_id: string
          watch_items: Json
        }
        Insert: {
          created_at?: string
          escalations?: string
          id?: string
          notes?: string
          open_items?: Json
          published_at?: string | null
          shift_date?: string
          shift_key?: string
          status?: string
          summary?: string
          updated_at?: string
          user_id: string
          watch_items?: Json
        }
        Update: {
          created_at?: string
          escalations?: string
          id?: string
          notes?: string
          open_items?: Json
          published_at?: string | null
          shift_date?: string
          shift_key?: string
          status?: string
          summary?: string
          updated_at?: string
          user_id?: string
          watch_items?: Json
        }
        Relationships: []
      }
      ticket_access_log: {
        Row: {
          action: string
          created_at: string
          email: string | null
          id: string
          ip: string | null
          query: string | null
          ticket_number: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          query?: string | null
          ticket_number?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          query?: string | null
          ticket_number?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_store_blobs: {
        Row: {
          data: Json
          store_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          data?: Json
          store_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          data?: Json
          store_key?: string
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
      search_freshdesk_documents: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          account_number: string
          agent_id: number | null
          company_name: string
          conversation_text: string
          custom_fields: Json
          description_text: string
          freshdesk_created_at: string | null
          freshdesk_updated_at: string
          group_id: number | null
          indexed_at: string
          priority: number
          requester_name: string
          search_vector: unknown
          searchable_text: string
          status: number
          subject: string
          tags: string[]
          ticket: Json
          ticket_id: number
        }[]
        SetofOptions: {
          from: "*"
          to: "freshdesk_search_documents"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_is_manual_pages: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          category: string
          manual_id: string
          manual_name: string
          page_number: number
          text: string
        }[]
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
