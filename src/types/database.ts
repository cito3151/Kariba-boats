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
      admin_approval_logs: {
        Row: {
          action: string
          admin_id: string
          boat_id: string | null
          created_at: string
          id: string
          reason: string | null
          snapshot: Json | null
        }
        Insert: {
          action: string
          admin_id: string
          boat_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          snapshot?: Json | null
        }
        Update: {
          action?: string
          admin_id?: string
          boat_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_approval_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_approval_logs_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_approval_logs_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "public_boats"
            referencedColumns: ["id"]
          },
        ]
      }
      boat_images: {
        Row: {
          boat_id: string
          created_at: string
          id: string
          is_primary: boolean
          moderation_status: string
          sort_order: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          boat_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          moderation_status?: string
          sort_order?: number
          storage_path: string
          uploaded_by: string
        }
        Update: {
          boat_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          moderation_status?: string
          sort_order?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "boat_images_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_images_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "public_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boat_maintenance_records: {
        Row: {
          boat_id: string
          cost: number | null
          created_at: string
          description: string
          hours_at_service: number
          id: string
          interval_at_service: number
          performed_at: string
          performed_by: string
          service_provider: string | null
        }
        Insert: {
          boat_id: string
          cost?: number | null
          created_at?: string
          description: string
          hours_at_service: number
          id?: string
          interval_at_service: number
          performed_at?: string
          performed_by: string
          service_provider?: string | null
        }
        Update: {
          boat_id?: string
          cost?: number | null
          created_at?: string
          description?: string
          hours_at_service?: number
          id?: string
          interval_at_service?: number
          performed_at?: string
          performed_by?: string
          service_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boat_maintenance_records_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_maintenance_records_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "public_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_maintenance_records_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boat_operating_hours: {
        Row: {
          boat_id: string
          booking_id: string | null
          hours: number
          id: string
          logged_at: string
          logged_by: string
          note: string | null
          reading_after: number
        }
        Insert: {
          boat_id: string
          booking_id?: string | null
          hours: number
          id?: string
          logged_at?: string
          logged_by: string
          note?: string | null
          reading_after: number
        }
        Update: {
          boat_id?: string
          booking_id?: string | null
          hours?: number
          id?: string
          logged_at?: string
          logged_by?: string
          note?: string | null
          reading_after?: number
        }
        Relationships: [
          {
            foreignKeyName: "boat_operating_hours_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_operating_hours_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "public_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boat_operating_hours_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boats: {
        Row: {
          accumulated_hours: number
          approved_at: string | null
          approved_by: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at: string
          crew_included: boolean
          deleted_at: string | null
          description: string | null
          facilities: string[]
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_maintenance_hours: number
          location: string
          maintenance_interval_hours: number
          maintenance_status: string | null
          maintenance_warn_hours: number
          name: string
          next_maintenance_hours: number | null
          owner_id: string
          pending_changes: Json | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          rejection_reason: string | null
          safety_equipment: string[]
          status: Database["public"]["Enums"]["boat_status"]
          updated_at: string
        }
        Insert: {
          accumulated_hours?: number
          approved_at?: string | null
          approved_by?: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at?: string
          crew_included?: boolean
          deleted_at?: string | null
          description?: string | null
          facilities?: string[]
          fuel_policy?: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining?: number | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_maintenance_hours?: number
          location: string
          maintenance_interval_hours?: number
          maintenance_status?: string | null
          maintenance_warn_hours?: number
          name: string
          next_maintenance_hours?: number | null
          owner_id: string
          pending_changes?: Json | null
          price_per_day?: number | null
          price_per_hour?: number | null
          registration_number?: string | null
          rejection_reason?: string | null
          safety_equipment?: string[]
          status?: Database["public"]["Enums"]["boat_status"]
          updated_at?: string
        }
        Update: {
          accumulated_hours?: number
          approved_at?: string | null
          approved_by?: string | null
          boat_type?: Database["public"]["Enums"]["boat_kind"]
          capacity?: number
          created_at?: string
          crew_included?: boolean
          deleted_at?: string | null
          description?: string | null
          facilities?: string[]
          fuel_policy?: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining?: number | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_maintenance_hours?: number
          location?: string
          maintenance_interval_hours?: number
          maintenance_status?: string | null
          maintenance_warn_hours?: number
          name?: string
          next_maintenance_hours?: number | null
          owner_id?: string
          pending_changes?: Json | null
          price_per_day?: number | null
          price_per_hour?: number | null
          registration_number?: string | null
          rejection_reason?: string | null
          safety_equipment?: string[]
          status?: Database["public"]["Enums"]["boat_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boats_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boats_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          boat_id: string
          created_at: string
          days: number
          deposit_amount: number
          duration_hours: number | null
          experience_type: string
          group_size: number
          guest_name: string
          guest_phone: string
          hotel_id: string | null
          id: string
          notes: string | null
          period: unknown
          price_total: number
          start_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["booking_status"]
          tourist_id: string | null
        }
        Insert: {
          boat_id: string
          created_at?: string
          days?: number
          deposit_amount: number
          duration_hours?: number | null
          experience_type: string
          group_size: number
          guest_name: string
          guest_phone: string
          hotel_id?: string | null
          id?: string
          notes?: string | null
          period?: unknown
          price_total: number
          start_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          tourist_id?: string | null
        }
        Update: {
          boat_id?: string
          created_at?: string
          days?: number
          deposit_amount?: number
          duration_hours?: number | null
          experience_type?: string
          group_size?: number
          guest_name?: string
          guest_phone?: string
          hotel_id?: string | null
          id?: string
          notes?: string | null
          period?: unknown
          price_total?: number
          start_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          tourist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "public_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tourist_id_fkey"
            columns: ["tourist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hotels: {
        Row: {
          commission_rate: number
          created_at: string
          id: string
          is_verified: boolean
          location: string
          name: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          id?: string
          is_verified?: boolean
          location: string
          name: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          id?: string
          is_verified?: boolean
          location?: string
          name?: string
        }
        Relationships: []
      }
      maintenance_notifications: {
        Row: {
          boat_id: string
          created_at: string
          hours_at_trigger: number
          id: string
          is_read: boolean
          level: string
          message: string
          recipient_id: string
        }
        Insert: {
          boat_id: string
          created_at?: string
          hours_at_trigger: number
          id?: string
          is_read?: boolean
          level: string
          message: string
          recipient_id: string
        }
        Update: {
          boat_id?: string
          created_at?: string
          hours_at_trigger?: number
          id?: string
          is_read?: boolean
          level?: string
          message?: string
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_notifications_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_notifications_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "public_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          full_name: string
          hotel_id: string | null
          id: string
          is_verified: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          trust_score: number
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          full_name?: string
          hotel_id?: string | null
          id: string
          is_verified?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          trust_score?: number
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          full_name?: string
          hotel_id?: string | null
          id?: string
          is_verified?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          trust_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_hotel_id_fkey"
            columns: ["hotel_id"]
            isOneToOne: false
            referencedRelation: "hotels"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          boat_id: string
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          operator_response: string | null
          rating: number
          tourist_id: string
        }
        Insert: {
          boat_id: string
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          operator_response?: string | null
          rating: number
          tourist_id: string
        }
        Update: {
          boat_id?: string
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          operator_response?: string | null
          rating?: number
          tourist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_boat_id_fkey"
            columns: ["boat_id"]
            isOneToOne: false
            referencedRelation: "public_boats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tourist_id_fkey"
            columns: ["tourist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_boats: {
        Row: {
          boat_type: Database["public"]["Enums"]["boat_kind"] | null
          capacity: number | null
          created_at: string | null
          crew_included: boolean | null
          description: string | null
          facilities: string[] | null
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"] | null
          id: string | null
          location: string | null
          maintenance_status: string | null
          max_guests: number | null
          name: string | null
          operator_name: string | null
          operator_phone: string | null
          operator_trust_score: number | null
          operator_verified: boolean | null
          owner_id: string | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          safety_equipment: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "boats_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_review_boat: {
        Args: { p_action: string; p_boat_id: string; p_reason?: string }
        Returns: {
          accumulated_hours: number
          approved_at: string | null
          approved_by: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at: string
          crew_included: boolean
          deleted_at: string | null
          description: string | null
          facilities: string[]
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_maintenance_hours: number
          location: string
          maintenance_interval_hours: number
          maintenance_status: string | null
          maintenance_warn_hours: number
          name: string
          next_maintenance_hours: number | null
          owner_id: string
          pending_changes: Json | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          rejection_reason: string | null
          safety_equipment: string[]
          status: Database["public"]["Enums"]["boat_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "boats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_review_changes: {
        Args: { p_approve: boolean; p_boat_id: string; p_reason?: string }
        Returns: {
          accumulated_hours: number
          approved_at: string | null
          approved_by: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at: string
          crew_included: boolean
          deleted_at: string | null
          description: string | null
          facilities: string[]
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_maintenance_hours: number
          location: string
          maintenance_interval_hours: number
          maintenance_status: string | null
          maintenance_warn_hours: number
          name: string
          next_maintenance_hours: number | null
          owner_id: string
          pending_changes: Json | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          rejection_reason: string | null
          safety_equipment: string[]
          status: Database["public"]["Enums"]["boat_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "boats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_maintenance: {
        Args: {
          p_boat_id: string
          p_cost?: number
          p_description: string
          p_performed_at?: string
          p_service_provider?: string
        }
        Returns: {
          accumulated_hours: number
          approved_at: string | null
          approved_by: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at: string
          crew_included: boolean
          deleted_at: string | null
          description: string | null
          facilities: string[]
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_maintenance_hours: number
          location: string
          maintenance_interval_hours: number
          maintenance_status: string | null
          maintenance_warn_hours: number
          name: string
          next_maintenance_hours: number | null
          owner_id: string
          pending_changes: Json | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          rejection_reason: string | null
          safety_equipment: string[]
          status: Database["public"]["Enums"]["boat_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "boats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
      is_sensitive_change: { Args: { p_changes: Json }; Returns: boolean }
      log_operating_hours: {
        Args: {
          p_boat_id: string
          p_booking_id?: string
          p_hours: number
          p_note?: string
        }
        Returns: {
          accumulated_hours: number
          approved_at: string | null
          approved_by: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at: string
          crew_included: boolean
          deleted_at: string | null
          description: string | null
          facilities: string[]
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_maintenance_hours: number
          location: string
          maintenance_interval_hours: number
          maintenance_status: string | null
          maintenance_warn_hours: number
          name: string
          next_maintenance_hours: number | null
          owner_id: string
          pending_changes: Json | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          rejection_reason: string | null
          safety_equipment: string[]
          status: Database["public"]["Enums"]["boat_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "boats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      propose_boat_changes: {
        Args: { p_boat_id: string; p_changes: Json }
        Returns: {
          accumulated_hours: number
          approved_at: string | null
          approved_by: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at: string
          crew_included: boolean
          deleted_at: string | null
          description: string | null
          facilities: string[]
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_maintenance_hours: number
          location: string
          maintenance_interval_hours: number
          maintenance_status: string | null
          maintenance_warn_hours: number
          name: string
          next_maintenance_hours: number | null
          owner_id: string
          pending_changes: Json | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          rejection_reason: string | null
          safety_equipment: string[]
          status: Database["public"]["Enums"]["boat_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "boats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      soft_delete_boat: {
        Args: { p_boat_id: string }
        Returns: {
          accumulated_hours: number
          approved_at: string | null
          approved_by: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at: string
          crew_included: boolean
          deleted_at: string | null
          description: string | null
          facilities: string[]
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_maintenance_hours: number
          location: string
          maintenance_interval_hours: number
          maintenance_status: string | null
          maintenance_warn_hours: number
          name: string
          next_maintenance_hours: number | null
          owner_id: string
          pending_changes: Json | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          rejection_reason: string | null
          safety_equipment: string[]
          status: Database["public"]["Enums"]["boat_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "boats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_boat_for_review: {
        Args: { p_boat_id: string }
        Returns: {
          accumulated_hours: number
          approved_at: string | null
          approved_by: string | null
          boat_type: Database["public"]["Enums"]["boat_kind"]
          capacity: number
          created_at: string
          crew_included: boolean
          deleted_at: string | null
          description: string | null
          facilities: string[]
          fuel_policy: Database["public"]["Enums"]["fuel_policy_kind"]
          hours_remaining: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_maintenance_hours: number
          location: string
          maintenance_interval_hours: number
          maintenance_status: string | null
          maintenance_warn_hours: number
          name: string
          next_maintenance_hours: number | null
          owner_id: string
          pending_changes: Json | null
          price_per_day: number | null
          price_per_hour: number | null
          registration_number: string | null
          rejection_reason: string | null
          safety_equipment: string[]
          status: Database["public"]["Enums"]["boat_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "boats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      boat_kind: "houseboat" | "speedboat" | "fishing" | "cruiser" | "pontoon"
      boat_status: "draft" | "pending" | "approved" | "rejected" | "suspended"
      booking_status:
        | "requested"
        | "confirmed"
        | "deposit_paid"
        | "completed"
        | "declined"
        | "cancelled"
      fuel_policy_kind: "included" | "excluded" | "prepaid" | "full_to_full"
      user_role: "tourist" | "owner" | "hotel" | "admin"
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
      boat_kind: ["houseboat", "speedboat", "fishing", "cruiser", "pontoon"],
      boat_status: ["draft", "pending", "approved", "rejected", "suspended"],
      booking_status: [
        "requested",
        "confirmed",
        "deposit_paid",
        "completed",
        "declined",
        "cancelled",
      ],
      fuel_policy_kind: ["included", "excluded", "prepaid", "full_to_full"],
      user_role: ["tourist", "owner", "hotel", "admin"],
    },
  },
} as const
