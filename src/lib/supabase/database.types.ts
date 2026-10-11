export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      agreement_templates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_md: string
          created_at: string
          effective_from: string
          id: string
          status: Database['public']['Enums']['template_status']
          type: Database['public']['Enums']['agreement_type']
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_md: string
          created_at?: string
          effective_from?: string
          id?: string
          status?: Database['public']['Enums']['template_status']
          type: Database['public']['Enums']['agreement_type']
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_md?: string
          created_at?: string
          effective_from?: string
          id?: string
          status?: Database['public']['Enums']['template_status']
          type?: Database['public']['Enums']['agreement_type']
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'agreement_templates_approved_by_fkey'
            columns: ['approved_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      agreements: {
        Row: {
          application_id: string | null
          content_sha256: string
          created_at: string
          id: string
          ip: string | null
          otp_verified_at: string
          pdf_path: string
          pdf_sha256: string
          signature_path: string
          signed_at: string
          signer_name: string
          signer_title: string | null
          subject_id: string
          template_id: string
          type: Database['public']['Enums']['agreement_type']
          typed_name: string
          user_agent: string | null
          version: number
        }
        Insert: {
          application_id?: string | null
          content_sha256: string
          created_at?: string
          id?: string
          ip?: string | null
          otp_verified_at: string
          pdf_path: string
          pdf_sha256: string
          signature_path: string
          signed_at?: string
          signer_name: string
          signer_title?: string | null
          subject_id: string
          template_id: string
          type: Database['public']['Enums']['agreement_type']
          typed_name: string
          user_agent?: string | null
          version: number
        }
        Update: {
          application_id?: string | null
          content_sha256?: string
          created_at?: string
          id?: string
          ip?: string | null
          otp_verified_at?: string
          pdf_path?: string
          pdf_sha256?: string
          signature_path?: string
          signed_at?: string
          signer_name?: string
          signer_title?: string | null
          subject_id?: string
          template_id?: string
          type?: Database['public']['Enums']['agreement_type']
          typed_name?: string
          user_agent?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: 'agreements_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'agreements_template_id_fkey'
            columns: ['template_id']
            isOneToOne: false
            referencedRelation: 'agreement_templates'
            referencedColumns: ['id']
          },
        ]
      }
      appliance_library: {
        Row: {
          active: boolean
          category: Database['public']['Enums']['appliance_category']
          default_hours: number
          default_watts: number
          duty_cycle: number
          id: string
          name: string
          sort: number
          surge_factor: number
        }
        Insert: {
          active?: boolean
          category: Database['public']['Enums']['appliance_category']
          default_hours: number
          default_watts: number
          duty_cycle?: number
          id?: string
          name: string
          sort?: number
          surge_factor?: number
        }
        Update: {
          active?: boolean
          category?: Database['public']['Enums']['appliance_category']
          default_hours?: number
          default_watts?: number
          duty_cycle?: number
          id?: string
          name?: string
          sort?: number
          surge_factor?: number
        }
        Relationships: []
      }
      applications: {
        Row: {
          affordability: Json | null
          applicant_type: string
          assigned_funder_id: string | null
          biometric_consent_at: string | null
          business: Json | null
          bvn_hash: string | null
          consumer_id: string
          created_at: string
          credit_flags: Json
          employment: Json | null
          entered_by: string | null
          guarantor: Json | null
          id: string
          income_range: string | null
          install_address: Json | null
          map_pin: unknown
          next_of_kin: Json | null
          nin_hash: string | null
          personal: Json
          quote_id: string | null
          status: Database['public']['Enums']['application_status']
          steps: Json
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          affordability?: Json | null
          applicant_type?: string
          assigned_funder_id?: string | null
          biometric_consent_at?: string | null
          business?: Json | null
          bvn_hash?: string | null
          consumer_id: string
          created_at?: string
          credit_flags?: Json
          employment?: Json | null
          entered_by?: string | null
          guarantor?: Json | null
          id?: string
          income_range?: string | null
          install_address?: Json | null
          map_pin?: unknown
          next_of_kin?: Json | null
          nin_hash?: string | null
          personal?: Json
          quote_id?: string | null
          status?: Database['public']['Enums']['application_status']
          steps?: Json
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          affordability?: Json | null
          applicant_type?: string
          assigned_funder_id?: string | null
          biometric_consent_at?: string | null
          business?: Json | null
          bvn_hash?: string | null
          consumer_id?: string
          created_at?: string
          credit_flags?: Json
          employment?: Json | null
          entered_by?: string | null
          guarantor?: Json | null
          id?: string
          income_range?: string | null
          install_address?: Json | null
          map_pin?: unknown
          next_of_kin?: Json | null
          nin_hash?: string | null
          personal?: Json
          quote_id?: string | null
          status?: Database['public']['Enums']['application_status']
          steps?: Json
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'applications_assigned_funder_id_fkey'
            columns: ['assigned_funder_id']
            isOneToOne: false
            referencedRelation: 'funders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'applications_consumer_id_fkey'
            columns: ['consumer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'applications_entered_by_fkey'
            columns: ['entered_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'applications_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['id']
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'audit_log_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      cash_referrals: {
        Row: {
          created_at: string
          id: string
          quote_id: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          quote_id: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          quote_id?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'cash_referrals_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['id']
          },
        ]
      }
      category_margins: {
        Row: {
          category: Database['public']['Enums']['component_category']
          margin: number
          sample: boolean
          updated_at: string
        }
        Insert: {
          category: Database['public']['Enums']['component_category']
          margin: number
          sample?: boolean
          updated_at?: string
        }
        Update: {
          category?: Database['public']['Enums']['component_category']
          margin?: number
          sample?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      components: {
        Row: {
          active: boolean
          category: Database['public']['Enums']['component_category']
          created_at: string
          id: string
          name: string
          sample: boolean
          sku: string
          source: Database['public']['Enums']['component_source']
          stock_sizes: Json
          unit_cost: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: Database['public']['Enums']['component_category']
          created_at?: string
          id?: string
          name: string
          sample?: boolean
          sku: string
          source?: Database['public']['Enums']['component_source']
          stock_sizes?: Json
          unit_cost: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: Database['public']['Enums']['component_category']
          created_at?: string
          id?: string
          name?: string
          sample?: boolean
          sku?: string
          source?: Database['public']['Enums']['component_source']
          stock_sizes?: Json
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          application_id: string | null
          created_at: string
          id: string
          kind: string
          owner_id: string
          storage_path: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          id?: string
          kind: string
          owner_id: string
          storage_path: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: 'documents_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'documents_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      email_verifications: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      funders: {
        Row: {
          annual_rate: number
          balance_available: number
          created_at: string
          id: string
          kind: Database['public']['Enums']['funder_kind']
          max_amount: number | null
          max_tenure: number
          method: Database['public']['Enums']['funder_method']
          min_amount: number
          name: string
          sample: boolean
          status: Database['public']['Enums']['funder_status']
          updated_at: string
          upfront_fee_share: number
        }
        Insert: {
          annual_rate: number
          balance_available?: number
          created_at?: string
          id?: string
          kind?: Database['public']['Enums']['funder_kind']
          max_amount?: number | null
          max_tenure?: number
          method?: Database['public']['Enums']['funder_method']
          min_amount?: number
          name: string
          sample?: boolean
          status?: Database['public']['Enums']['funder_status']
          updated_at?: string
          upfront_fee_share?: number
        }
        Update: {
          annual_rate?: number
          balance_available?: number
          created_at?: string
          id?: string
          kind?: Database['public']['Enums']['funder_kind']
          max_amount?: number | null
          max_tenure?: number
          method?: Database['public']['Enums']['funder_method']
          min_amount?: number
          name?: string
          sample?: boolean
          status?: Database['public']['Enums']['funder_status']
          updated_at?: string
          upfront_fee_share?: number
        }
        Relationships: []
      }
      guarantees: {
        Row: {
          application_id: string
          biometric_consent_at: string | null
          created_at: string
          decline_reason: string | null
          details: Json
          email: string
          expires_at: string
          guarantor_profile_id: string | null
          id: string
          name: string
          nin_hash: string | null
          nin_last4: string | null
          phone: string
          relationship: string | null
          status: Database['public']['Enums']['guarantee_status']
          steps: Json
          token_hash: string
          updated_at: string
        }
        Insert: {
          application_id: string
          biometric_consent_at?: string | null
          created_at?: string
          decline_reason?: string | null
          details?: Json
          email: string
          expires_at: string
          guarantor_profile_id?: string | null
          id?: string
          name: string
          nin_hash?: string | null
          nin_last4?: string | null
          phone: string
          relationship?: string | null
          status?: Database['public']['Enums']['guarantee_status']
          steps?: Json
          token_hash: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          biometric_consent_at?: string | null
          created_at?: string
          decline_reason?: string | null
          details?: Json
          email?: string
          expires_at?: string
          guarantor_profile_id?: string | null
          id?: string
          name?: string
          nin_hash?: string | null
          nin_last4?: string | null
          phone?: string
          relationship?: string | null
          status?: Database['public']['Enums']['guarantee_status']
          steps?: Json
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'guarantees_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'guarantees_guarantor_profile_id_fkey'
            columns: ['guarantor_profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      installation_costs: {
        Row: {
          amount: number
          id: string
          sample: boolean
          size_band: Database['public']['Enums']['size_band']
          state: string
          updated_at: string
        }
        Insert: {
          amount: number
          id?: string
          sample?: boolean
          size_band: Database['public']['Enums']['size_band']
          state: string
          updated_at?: string
        }
        Update: {
          amount?: number
          id?: string
          sample?: boolean
          size_band?: Database['public']['Enums']['size_band']
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      kyc_checks: {
        Row: {
          attempt: number
          created_at: string
          id: string
          kind: Database['public']['Enums']['kyc_kind']
          provider: string
          provider_ref: string | null
          result_summary: Json
          status: Database['public']['Enums']['kyc_status']
          subject_id: string
          subject_type: Database['public']['Enums']['kyc_subject']
        }
        Insert: {
          attempt?: number
          created_at?: string
          id?: string
          kind: Database['public']['Enums']['kyc_kind']
          provider: string
          provider_ref?: string | null
          result_summary?: Json
          status?: Database['public']['Enums']['kyc_status']
          subject_id: string
          subject_type: Database['public']['Enums']['kyc_subject']
        }
        Update: {
          attempt?: number
          created_at?: string
          id?: string
          kind?: Database['public']['Enums']['kyc_kind']
          provider?: string
          provider_ref?: string | null
          result_summary?: Json
          status?: Database['public']['Enums']['kyc_status']
          subject_id?: string
          subject_type?: Database['public']['Enums']['kyc_subject']
        }
        Relationships: []
      }
      outbox: {
        Row: {
          channel: Database['public']['Enums']['outbox_channel']
          created_at: string
          id: string
          payload: Json
          status: string
          template: string
          to: string
        }
        Insert: {
          channel: Database['public']['Enums']['outbox_channel']
          created_at?: string
          id?: string
          payload?: Json
          status?: string
          template: string
          to: string
        }
        Update: {
          channel?: Database['public']['Enums']['outbox_channel']
          created_at?: string
          id?: string
          payload?: Json
          status?: string
          template?: string
          to?: string
        }
        Relationships: []
      }
      overheads: {
        Row: {
          fixed_amount: number
          month: string
          per_system_amount: number
          sample: boolean
          updated_at: string
        }
        Insert: {
          fixed_amount?: number
          month: string
          per_system_amount?: number
          sample?: boolean
          updated_at?: string
        }
        Update: {
          fixed_amount?: number
          month?: string
          per_system_amount?: number
          sample?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      phone_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone_e164: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone_e164: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone_e164?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_rates: {
        Row: {
          default_buffer: number
          expected_funder_rate: number
          pricing_rate: number | null
          sample: boolean
          spread: number
          tenure_months: number
          updated_at: string
        }
        Insert: {
          default_buffer: number
          expected_funder_rate: number
          pricing_rate?: number | null
          sample?: boolean
          spread: number
          tenure_months: number
          updated_at?: string
        }
        Update: {
          default_buffer?: number
          expected_funder_rate?: number
          pricing_rate?: number | null
          sample?: boolean
          spread?: number
          tenure_months?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          email_verified_at: string | null
          full_name: string | null
          id: string
          phone_e164: string | null
          role: Database['public']['Enums']['app_role']
          state: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_verified_at?: string | null
          full_name?: string | null
          id: string
          phone_e164?: string | null
          role?: Database['public']['Enums']['app_role']
          state?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          email_verified_at?: string | null
          full_name?: string | null
          id?: string
          phone_e164?: string | null
          role?: Database['public']['Enums']['app_role']
          state?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          anon_token_hash: string
          applicant_type: string | null
          created_at: string
          deposit_share: number
          energy: Json | null
          id: string
          load_items: Json
          load_totals: Json
          owner_id: string | null
          plan: string
          result: Json
          state: string
          status: Database['public']['Enums']['quote_status']
          system_size: Json
          tenure: number | null
          updated_at: string
          valid_until: string
          waitlist_id: string | null
        }
        Insert: {
          anon_token_hash: string
          applicant_type?: string | null
          created_at?: string
          deposit_share: number
          energy?: Json | null
          id?: string
          load_items: Json
          load_totals: Json
          owner_id?: string | null
          plan: string
          result: Json
          state: string
          status?: Database['public']['Enums']['quote_status']
          system_size: Json
          tenure?: number | null
          updated_at?: string
          valid_until: string
          waitlist_id?: string | null
        }
        Update: {
          anon_token_hash?: string
          applicant_type?: string | null
          created_at?: string
          deposit_share?: number
          energy?: Json | null
          id?: string
          load_items?: Json
          load_totals?: Json
          owner_id?: string | null
          plan?: string
          result?: Json
          state?: string
          status?: Database['public']['Enums']['quote_status']
          system_size?: Json
          tenure?: number | null
          updated_at?: string
          valid_until?: string
          waitlist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'quotes_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quotes_waitlist_id_fkey'
            columns: ['waitlist_id']
            isOneToOne: false
            referencedRelation: 'waitlist_consumers'
            referencedColumns: ['id']
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          channel: Database['public']['Enums']['outbox_channel']
          created_at: string
          due_at: string
          id: string
          quote_id: string
          sent_at: string | null
          to: string
        }
        Insert: {
          channel: Database['public']['Enums']['outbox_channel']
          created_at?: string
          due_at: string
          id?: string
          quote_id: string
          sent_at?: string | null
          to: string
        }
        Update: {
          channel?: Database['public']['Enums']['outbox_channel']
          created_at?: string
          due_at?: string
          id?: string
          quote_id?: string
          sent_at?: string | null
          to?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reminders_quote_id_fkey'
            columns: ['quote_id']
            isOneToOne: false
            referencedRelation: 'quotes'
            referencedColumns: ['id']
          },
        ]
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'settings_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      signature_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          phone_e164: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          phone_e164: string
          subject_id: string
          subject_type: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          phone_e164?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          permission: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          permission: string
          profile_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          permission?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'staff_permissions_granted_by_fkey'
            columns: ['granted_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'staff_permissions_profile_id_fkey'
            columns: ['profile_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      unit_costs: {
        Row: {
          fee_per_instalment: number
          id: number
          kyc_per_loan: number
          loss_provision_share: number
          min_net_margin_share: number
          sample: boolean
          updated_at: string
        }
        Insert: {
          fee_per_instalment?: number
          id?: number
          kyc_per_loan?: number
          loss_provision_share?: number
          min_net_margin_share?: number
          sample?: boolean
          updated_at?: string
        }
        Update: {
          fee_per_instalment?: number
          id?: number
          kyc_per_loan?: number
          loss_provision_share?: number
          min_net_margin_share?: number
          sample?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      waitlist_consumers: {
        Row: {
          applicant_type: string | null
          business: Json | null
          chosen_plan: string | null
          consent: boolean
          consent_at: string | null
          created_at: string
          deposit_share: number | null
          duplicate_of: string | null
          email: string | null
          energy: Json | null
          entered_by: string | null
          entry_channel: string | null
          estimate: Json | null
          first_name: string | null
          id: string
          lga: string | null
          load_items: Json
          load_totals: Json
          phone_e164: string
          ready_when: Database['public']['Enums']['ready_when'] | null
          state: string | null
          status: Database['public']['Enums']['waitlist_status']
          surname: string | null
          updated_at: string
          visitor_token_hash: string
          whatsapp_e164: string | null
        }
        Insert: {
          applicant_type?: string | null
          business?: Json | null
          chosen_plan?: string | null
          consent?: boolean
          consent_at?: string | null
          created_at?: string
          deposit_share?: number | null
          duplicate_of?: string | null
          email?: string | null
          energy?: Json | null
          entered_by?: string | null
          entry_channel?: string | null
          estimate?: Json | null
          first_name?: string | null
          id?: string
          lga?: string | null
          load_items?: Json
          load_totals?: Json
          phone_e164: string
          ready_when?: Database['public']['Enums']['ready_when'] | null
          state?: string | null
          status?: Database['public']['Enums']['waitlist_status']
          surname?: string | null
          updated_at?: string
          visitor_token_hash: string
          whatsapp_e164?: string | null
        }
        Update: {
          applicant_type?: string | null
          business?: Json | null
          chosen_plan?: string | null
          consent?: boolean
          consent_at?: string | null
          created_at?: string
          deposit_share?: number | null
          duplicate_of?: string | null
          email?: string | null
          energy?: Json | null
          entered_by?: string | null
          entry_channel?: string | null
          estimate?: Json | null
          first_name?: string | null
          id?: string
          lga?: string | null
          load_items?: Json
          load_totals?: Json
          phone_e164?: string
          ready_when?: Database['public']['Enums']['ready_when'] | null
          state?: string | null
          status?: Database['public']['Enums']['waitlist_status']
          surname?: string | null
          updated_at?: string
          visitor_token_hash?: string
          whatsapp_e164?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'waitlist_consumers_duplicate_of_fkey'
            columns: ['duplicate_of']
            isOneToOne: false
            referencedRelation: 'waitlist_consumers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'waitlist_consumers_entered_by_fkey'
            columns: ['entered_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      waitlist_exports: {
        Row: {
          created_at: string
          exported_by: string | null
          id: string
          kind: string
          row_count: number
        }
        Insert: {
          created_at?: string
          exported_by?: string | null
          id?: string
          kind: string
          row_count?: number
        }
        Update: {
          created_at?: string
          exported_by?: string | null
          id?: string
          kind?: string
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: 'waitlist_exports_exported_by_fkey'
            columns: ['exported_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      waitlist_installers: {
        Row: {
          business_name: string | null
          cac_registered: boolean
          consent: boolean
          consent_at: string | null
          created_at: string
          email: string | null
          entered_by: string | null
          id: string
          installations_completed: number | null
          lgas: string | null
          name: string
          phone_e164: string
          states: string[]
          whatsapp_e164: string | null
          years_in_business: number | null
        }
        Insert: {
          business_name?: string | null
          cac_registered?: boolean
          consent?: boolean
          consent_at?: string | null
          created_at?: string
          email?: string | null
          entered_by?: string | null
          id?: string
          installations_completed?: number | null
          lgas?: string | null
          name: string
          phone_e164: string
          states?: string[]
          whatsapp_e164?: string | null
          years_in_business?: number | null
        }
        Update: {
          business_name?: string | null
          cac_registered?: boolean
          consent?: boolean
          consent_at?: string | null
          created_at?: string
          email?: string | null
          entered_by?: string | null
          id?: string
          installations_completed?: number | null
          lgas?: string | null
          name?: string
          phone_e164?: string
          states?: string[]
          whatsapp_e164?: string | null
          years_in_business?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'waitlist_installers_entered_by_fkey'
            columns: ['entered_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_permission: { Args: { target: string }; Returns: boolean }
      has_role: {
        Args: { target: Database['public']['Enums']['app_role'] }
        Returns: boolean
      }
      hit_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window: string }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      my_role: { Args: never; Returns: Database['public']['Enums']['app_role'] }
    }
    Enums: {
      agreement_type: 'consumer' | 'guarantor' | 'installer' | 'vendor'
      app_role:
        | 'consumer'
        | 'guarantor'
        | 'installer'
        | 'vendor'
        | 'super_admin'
        | 'credit_officer'
        | 'operations'
        | 'collections'
        | 'finance'
        | 'content'
      appliance_category:
        | 'lighting'
        | 'tv_electronics'
        | 'kitchen'
        | 'cooling'
        | 'laundry'
        | 'water_outdoor'
        | 'business'
      application_status:
        'draft' | 'submitted' | 'under_review' | 'approved' | 'declined' | 'more_info'
      component_category: 'panels' | 'battery' | 'inverter' | 'accessories'
      component_source: 'oem' | 'vendor'
      funder_kind: 'external' | 'own_fund'
      funder_method: 'flat' | 'reducing'
      funder_status: 'active' | 'paused'
      guarantee_status: 'invited' | 'in_progress' | 'signed' | 'declined' | 'expired'
      kyc_kind: 'nin' | 'bvn' | 'liveness' | 'face_match' | 'address' | 'cac'
      kyc_status: 'pending' | 'passed' | 'failed' | 'manual_review'
      kyc_subject: 'consumer' | 'guarantor' | 'installer' | 'vendor' | 'business'
      outbox_channel: 'sms' | 'whatsapp' | 'email'
      quote_status: 'draft' | 'chosen' | 'expired'
      ready_when: 'now' | '30_days' | 'later'
      size_band: 'small' | 'medium' | 'large'
      template_status: 'draft' | 'approved'
      waitlist_status: 'incomplete' | 'complete'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agreement_type: ['consumer', 'guarantor', 'installer', 'vendor'],
      app_role: [
        'consumer',
        'guarantor',
        'installer',
        'vendor',
        'super_admin',
        'credit_officer',
        'operations',
        'collections',
        'finance',
        'content',
      ],
      appliance_category: [
        'lighting',
        'tv_electronics',
        'kitchen',
        'cooling',
        'laundry',
        'water_outdoor',
        'business',
      ],
      application_status: [
        'draft',
        'submitted',
        'under_review',
        'approved',
        'declined',
        'more_info',
      ],
      component_category: ['panels', 'battery', 'inverter', 'accessories'],
      component_source: ['oem', 'vendor'],
      funder_kind: ['external', 'own_fund'],
      funder_method: ['flat', 'reducing'],
      funder_status: ['active', 'paused'],
      guarantee_status: ['invited', 'in_progress', 'signed', 'declined', 'expired'],
      kyc_kind: ['nin', 'bvn', 'liveness', 'face_match', 'address', 'cac'],
      kyc_status: ['pending', 'passed', 'failed', 'manual_review'],
      kyc_subject: ['consumer', 'guarantor', 'installer', 'vendor', 'business'],
      outbox_channel: ['sms', 'whatsapp', 'email'],
      quote_status: ['draft', 'chosen', 'expired'],
      ready_when: ['now', '30_days', 'later'],
      size_band: ['small', 'medium', 'large'],
      template_status: ['draft', 'approved'],
      waitlist_status: ['incomplete', 'complete'],
    },
  },
} as const
