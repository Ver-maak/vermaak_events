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
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          organizer_id: string
          prefix: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          organizer_id: string
          prefix: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          organizer_id?: string
          prefix?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_rounding: {
        Row: {
          currency: Database["public"]["Enums"]["currency_code"]
          decimals: number
          id: string
          min_unit: number
          rounding_mode: string
          updated_at: string
        }
        Insert: {
          currency: Database["public"]["Enums"]["currency_code"]
          decimals?: number
          id?: string
          min_unit?: number
          rounding_mode?: string
          updated_at?: string
        }
        Update: {
          currency?: Database["public"]["Enums"]["currency_code"]
          decimals?: number
          id?: string
          min_unit?: number
          rounding_mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_admins: {
        Row: {
          created_at: string
          event_id: string
          granted_by: string | null
          id: string
          invited_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          granted_by?: string | null
          id?: string
          invited_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          granted_by?: string | null
          id?: string
          invited_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_admins_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          category: string | null
          city: string | null
          cover_image_url: string | null
          created_at: string
          currency: string
          description: string | null
          ends_at: string | null
          feature_flags: Json
          id: string
          organization_id: string | null
          organizer_id: string
          slug: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          capacity?: number | null
          category?: string | null
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          feature_flags?: Json
          id?: string
          organization_id?: string | null
          organizer_id: string
          slug: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          capacity?: number | null
          category?: string | null
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          feature_flags?: Json
          id?: string
          organization_id?: string | null
          organizer_id?: string
          slug?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          rate_to_ugx: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          id?: string
          rate_to_ugx: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          rate_to_ugx?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      fee_audit_logs: {
        Row: {
          context: string | null
          created_at: string
          created_by: string | null
          exchange_rate: number | null
          fee_original_currency: number
          fee_ugx: number
          id: string
          net_amount: number
          organization_id: string | null
          original_amount: number
          original_currency: Database["public"]["Enums"]["currency_code"]
          tier_label: string
          transaction_id: string | null
          ugx_equivalent: number
          version_id: string | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          created_by?: string | null
          exchange_rate?: number | null
          fee_original_currency: number
          fee_ugx: number
          id?: string
          net_amount: number
          organization_id?: string | null
          original_amount: number
          original_currency: Database["public"]["Enums"]["currency_code"]
          tier_label: string
          transaction_id?: string | null
          ugx_equivalent: number
          version_id?: string | null
        }
        Update: {
          context?: string | null
          created_at?: string
          created_by?: string | null
          exchange_rate?: number | null
          fee_original_currency?: number
          fee_ugx?: number
          id?: string
          net_amount?: number
          organization_id?: string | null
          original_amount?: number
          original_currency?: Database["public"]["Enums"]["currency_code"]
          tier_label?: string
          transaction_id?: string | null
          ugx_equivalent?: number
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_audit_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_audit_logs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "fee_tier_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_tier_versions: {
        Row: {
          created_by: string | null
          id: string
          is_active: boolean
          label: string
          notes: string | null
          organization_id: string | null
          published_at: string
          version_no: number
        }
        Insert: {
          created_by?: string | null
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          organization_id?: string | null
          published_at?: string
          version_no: number
        }
        Update: {
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          organization_id?: string | null
          published_at?: string
          version_no?: number
        }
        Relationships: []
      }
      fee_tiers: {
        Row: {
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          fee_type: string
          fee_value: number
          id: string
          is_active: boolean
          max_amount: number | null
          max_fee: number | null
          min_amount: number
          min_fee: number | null
          organization_id: string | null
          sort_order: number
          tier_label: string
          updated_at: string
          version: number
          version_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          fee_type: string
          fee_value: number
          id?: string
          is_active?: boolean
          max_amount?: number | null
          max_fee?: number | null
          min_amount?: number
          min_fee?: number | null
          organization_id?: string | null
          sort_order?: number
          tier_label: string
          updated_at?: string
          version?: number
          version_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          fee_type?: string
          fee_value?: number
          id?: string
          is_active?: boolean
          max_amount?: number | null
          max_fee?: number | null
          min_amount?: number
          min_fee?: number | null
          organization_id?: string | null
          sort_order?: number
          tier_label?: string
          updated_at?: string
          version?: number
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_tiers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_tiers_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "fee_tier_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      order_ticket_holds: {
        Row: {
          created_at: string
          event_id: string
          holder_email: string | null
          holder_name: string
          id: string
          metadata: Json
          order_id: string
          source_ticket_id: string | null
          tier_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          holder_email?: string | null
          holder_name: string
          id?: string
          metadata?: Json
          order_id: string
          source_ticket_id?: string | null
          tier_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          holder_email?: string | null
          holder_name?: string
          id?: string
          metadata?: Json
          order_id?: string
          source_ticket_id?: string | null
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_ticket_holds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_ticket_holds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_ticket_holds_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_email: string
          buyer_id: string | null
          buyer_name: string
          buyer_phone: string | null
          created_at: string
          currency: string
          event_id: string
          id: string
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          reference: string
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          buyer_email: string
          buyer_id?: string | null
          buyer_name: string
          buyer_phone?: string | null
          created_at?: string
          currency?: string
          event_id: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          buyer_email?: string
          buyer_id?: string | null
          buyer_name?: string
          buyer_phone?: string | null
          created_at?: string
          currency?: string
          event_id?: string
          id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          feature_flags: Json | null
          id: string
          logo_url: string | null
          name: string
          settings: Json | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_flags?: Json | null
          id?: string
          logo_url?: string | null
          name: string
          settings?: Json | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_flags?: Json | null
          id?: string
          logo_url?: string | null
          name?: string
          settings?: Json | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          order_id: string
          phone: string | null
          provider: string
          provider_ref: string
          raw: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          phone?: string | null
          provider: string
          provider_ref: string
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          phone?: string | null
          provider?: string
          provider_ref?: string
          raw?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_logs: {
        Row: {
          created_at: string
          direction: string
          endpoint: string | null
          id: string
          intent_id: string | null
          order_id: string | null
          provider_code: string
          request: Json | null
          response: Json | null
          status_code: number | null
        }
        Insert: {
          created_at?: string
          direction: string
          endpoint?: string | null
          id?: string
          intent_id?: string | null
          order_id?: string | null
          provider_code: string
          request?: Json | null
          response?: Json | null
          status_code?: number | null
        }
        Update: {
          created_at?: string
          direction?: string
          endpoint?: string | null
          id?: string
          intent_id?: string | null
          order_id?: string | null
          provider_code?: string
          request?: Json | null
          response?: Json | null
          status_code?: number | null
        }
        Relationships: []
      }
      payment_providers: {
        Row: {
          base_url: string | null
          callback_url: string | null
          code: string
          created_at: string
          credentials_encrypted: string | null
          credentials_preview: Json
          enabled: boolean
          id: string
          mode: string
          name: string
          redirect_cancel_url: string | null
          redirect_success_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_url?: string | null
          callback_url?: string | null
          code: string
          created_at?: string
          credentials_encrypted?: string | null
          credentials_preview?: Json
          enabled?: boolean
          id?: string
          mode?: string
          name: string
          redirect_cancel_url?: string | null
          redirect_success_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_url?: string | null
          callback_url?: string | null
          code?: string
          created_at?: string
          credentials_encrypted?: string | null
          credentials_preview?: Json
          enabled?: boolean
          id?: string
          mode?: string
          name?: string
          redirect_cancel_url?: string | null
          redirect_success_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      processed_webhook_events: {
        Row: {
          created_at: string
          event_key: string
          id: string
          payload: Json
          provider: string
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          payload?: Json
          provider: string
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          payload?: Json
          provider?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          kyc_status: string | null
          must_change_password: boolean
          organization_id: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          kyc_status?: string | null
          must_change_password?: boolean
          organization_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          kyc_status?: string | null
          must_change_password?: boolean
          organization_id?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rotaract_members: {
        Row: {
          club_name: string | null
          club_type: string | null
          created_at: string
          district_id: string
          email: string | null
          full_name: string
          member_id: string
          member_status: string | null
          phone: string | null
        }
        Insert: {
          club_name?: string | null
          club_type?: string | null
          created_at?: string
          district_id?: string
          email?: string | null
          full_name: string
          member_id: string
          member_status?: string | null
          phone?: string | null
        }
        Update: {
          club_name?: string | null
          club_type?: string | null
          created_at?: string
          district_id?: string
          email?: string | null
          full_name?: string
          member_id?: string
          member_status?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      short_links: {
        Row: {
          click_count: number
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          slug: string
          target_url: string
        }
        Insert: {
          click_count?: number
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          slug: string
          target_url: string
        }
        Update: {
          click_count?: number
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          slug?: string
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "short_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tiers: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          name: string
          price: number
          quantity: number | null
          sales_end: string | null
          sales_start: string | null
          sold: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          quantity?: number | null
          sales_end?: string | null
          sales_start?: string | null
          sold?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          quantity?: number | null
          sales_end?: string | null
          sales_start?: string | null
          sold?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tiers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          code: string
          created_at: string
          event_id: string
          holder_email: string | null
          holder_name: string
          id: string
          metadata: Json
          order_id: string
          tier_id: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          created_at?: string
          event_id: string
          holder_email?: string | null
          holder_name: string
          id?: string
          metadata?: Json
          order_id: string
          tier_id?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          created_at?: string
          event_id?: string
          holder_email?: string | null
          holder_name?: string
          id?: string
          metadata?: Json
          order_id?: string
          tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "ticket_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          description: string | null
          from_wallet_id: string | null
          id: string
          metadata: Json | null
          organization_id: string
          reference: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          to_wallet_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          from_wallet_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          to_wallet_id?: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          description?: string | null
          from_wallet_id?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          to_wallet_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_from_wallet_id_fkey"
            columns: ["from_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_to_wallet_id_fkey"
            columns: ["to_wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          id: string
          is_active: boolean
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_active?: boolean
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          id?: string
          is_active?: boolean
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          response_status: number | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          event_type: string
          id?: string
          last_error?: string | null
          payload: Json
          response_status?: number | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          response_status?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          description: string | null
          events: string[]
          id: string
          is_active: boolean
          organizer_id: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          organizer_id: string
          secret: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          events?: string[]
          id?: string
          is_active?: boolean
          organizer_id?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_transaction_fee: {
        Args: {
          _amount: number
          _currency: Database["public"]["Enums"]["currency_code"]
          _organization_id?: string
        }
        Returns: Json
      }
      checkin_ticket: { Args: { _code: string }; Returns: Json }
      create_ticket_order: {
        Args: {
          _buyer_email: string
          _buyer_name: string
          _buyer_phone: string
          _event_id: string
          _items: Json
        }
        Returns: string
      }
      create_ticket_order_v2: {
        Args: {
          _buyer_email: string
          _buyer_name: string
          _buyer_phone: string
          _event_id: string
          _items: Json
        }
        Returns: string
      }
      estimate_and_log: {
        Args: {
          _amount: number
          _context?: string
          _currency: Database["public"]["Enums"]["currency_code"]
          _organization_id?: string
        }
        Returns: Json
      }
      generate_tickets_for_paid_order: {
        Args: { _order_id: string }
        Returns: number
      }
      get_payment_provider_decrypted: {
        Args: { _code: string; _enc_key: string }
        Returns: Json
      }
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_password_set: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_short_link_click: {
        Args: { _slug: string }
        Returns: undefined
      }
      invite_event_admin: {
        Args: { _email: string; _event_id: string }
        Returns: Json
      }
      is_event_admin: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_active: { Args: { _user_id: string }; Returns: boolean }
      lookup_rotaract_member: {
        Args: { _query: string }
        Returns: {
          club_name: string
          club_type: string
          email: string
          full_name: string
          member_id: string
        }[]
      }
      mark_order_paid: {
        Args: { _method: string; _order_id: string; _reference: string }
        Returns: undefined
      }
      mark_order_paid_by_reference: {
        Args: { _provider_ref: string; _raw: Json; _status: string }
        Returns: Json
      }
      quote_event_fee: {
        Args: { _amount: number; _event_id: string }
        Returns: Json
      }
      quote_order_fee: { Args: { _order_id: string }; Returns: Json }
      revoke_event_admin: {
        Args: { _event_id: string; _user_id: string }
        Returns: undefined
      }
      revoke_event_admin_row: { Args: { _id: string }; Returns: undefined }
      round_currency: {
        Args: {
          _amount: number
          _currency: Database["public"]["Enums"]["currency_code"]
        }
        Returns: number
      }
      save_payment_provider: {
        Args: {
          _base_url: string
          _callback_url: string
          _code: string
          _credentials: Json
          _enabled: boolean
          _enc_key: string
          _mode: string
          _name: string
          _preview: Json
          _redirect_cancel_url: string
          _redirect_success_url: string
        }
        Returns: string
      }
      sync_event_paid_ticket_counts: {
        Args: { _event_id: string }
        Returns: undefined
      }
      transfer_funds: {
        Args: {
          _amount: number
          _description?: string
          _from_wallet_id: string
          _to_wallet_id: string
        }
        Returns: string
      }
      verify_api_key_hash: { Args: { _hash: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "tenant_admin"
        | "staff"
        | "end_user"
        | "organizer"
        | "attendee"
      currency_code: "UGX" | "USD" | "EUR" | "GBP" | "KES" | "TZS" | "RWF"
      event_status: "draft" | "published" | "cancelled" | "completed"
      order_status: "pending" | "paid" | "cancelled" | "refunded"
      tenant_status: "active" | "suspended" | "pending"
      transaction_status: "pending" | "completed" | "failed" | "cancelled"
      transaction_type:
        | "deposit"
        | "withdrawal"
        | "transfer"
        | "payment"
        | "refund"
        | "fee"
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
      app_role: [
        "super_admin",
        "tenant_admin",
        "staff",
        "end_user",
        "organizer",
        "attendee",
      ],
      currency_code: ["UGX", "USD", "EUR", "GBP", "KES", "TZS", "RWF"],
      event_status: ["draft", "published", "cancelled", "completed"],
      order_status: ["pending", "paid", "cancelled", "refunded"],
      tenant_status: ["active", "suspended", "pending"],
      transaction_status: ["pending", "completed", "failed", "cancelled"],
      transaction_type: [
        "deposit",
        "withdrawal",
        "transfer",
        "payment",
        "refund",
        "fee",
      ],
    },
  },
} as const
