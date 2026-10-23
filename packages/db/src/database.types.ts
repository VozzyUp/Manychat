export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_citations: {
        Row: {
          ai_run_id: string;
          chunk_id: string;
          created_at: string;
          document_version_id: string | null;
          id: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          ai_run_id: string;
          chunk_id: string;
          created_at?: string;
          document_version_id?: string | null;
          id?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          ai_run_id?: string;
          chunk_id?: string;
          created_at?: string;
          document_version_id?: string | null;
          id?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_citations_tenant_id_ai_run_id_fkey';
            columns: ['tenant_id', 'ai_run_id'];
            isOneToOne: false;
            referencedRelation: 'ai_runs';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'ai_citations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_citations_version_fk';
            columns: ['tenant_id', 'document_version_id'];
            isOneToOne: false;
            referencedRelation: 'document_versions';
            referencedColumns: ['tenant_id', 'id'];
          },
        ];
      };
      ai_runs: {
        Row: {
          agent_key: string;
          cache_read_tokens: number;
          cache_write_tokens: number;
          conversation_id: string | null;
          cost_usd: number;
          created_at: string;
          error: string | null;
          handoff_reason: string | null;
          id: string;
          input_tokens: number;
          latency_ms: number;
          message_id: string | null;
          model: string;
          outcome: string;
          output_tokens: number;
          tenant_id: string;
          turns: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agent_key: string;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          conversation_id?: string | null;
          cost_usd?: number;
          created_at?: string;
          error?: string | null;
          handoff_reason?: string | null;
          id?: string;
          input_tokens?: number;
          latency_ms?: number;
          message_id?: string | null;
          model: string;
          outcome: string;
          output_tokens?: number;
          tenant_id: string;
          turns?: number;
          updated_at?: string;
        };
        Update: {
          agent_key?: string;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          conversation_id?: string | null;
          cost_usd?: number;
          created_at?: string;
          error?: string | null;
          handoff_reason?: string | null;
          id?: string;
          input_tokens?: number;
          latency_ms?: number;
          message_id?: string | null;
          model?: string;
          outcome?: string;
          output_tokens?: number;
          tenant_id?: string;
          turns?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_runs_tenant_id_conversation_id_fkey';
            columns: ['tenant_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'ai_runs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_tool_calls: {
        Row: {
          ai_run_id: string;
          args: NonNullable<Json>;
          created_at: string;
          duration_ms: number;
          id: string;
          is_error: boolean;
          result_summary: string | null;
          tenant_id: string;
          tool: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          ai_run_id: string;
          args?: NonNullable<Json>;
          created_at?: string;
          duration_ms?: number;
          id?: string;
          is_error?: boolean;
          result_summary?: string | null;
          tenant_id: string;
          tool: string;
          updated_at?: string;
        };
        Update: {
          ai_run_id?: string;
          args?: NonNullable<Json>;
          created_at?: string;
          duration_ms?: number;
          id?: string;
          is_error?: boolean;
          result_summary?: string | null;
          tenant_id?: string;
          tool?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_tool_calls_tenant_id_ai_run_id_fkey';
            columns: ['tenant_id', 'ai_run_id'];
            isOneToOne: false;
            referencedRelation: 'ai_runs';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'ai_tool_calls_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity: string;
          entity_id: string | null;
          id: string;
          tenant_id: string;
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity: string;
          entity_id?: string | null;
          id?: string;
          tenant_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity?: string;
          entity_id?: string | null;
          id?: string;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      consents: {
        Row: {
          accepted_at: string;
          channel: string;
          contact_id: string;
          created_at: string;
          evidence_message_id: string | null;
          id: string;
          revoked_at: string | null;
          tenant_id: string;
          type: string;
          updated_at: string;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string;
          channel?: string;
          contact_id: string;
          created_at?: string;
          evidence_message_id?: string | null;
          id?: string;
          revoked_at?: string | null;
          tenant_id: string;
          type: string;
          updated_at?: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          channel?: string;
          contact_id?: string;
          created_at?: string;
          evidence_message_id?: string | null;
          id?: string;
          revoked_at?: string | null;
          tenant_id?: string;
          type?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'consents_tenant_id_contact_id_fkey';
            columns: ['tenant_id', 'contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'consents_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      contacts: {
        Row: {
          anonymized_at: string | null;
          created_at: string;
          id: string;
          kind: string;
          metadata: NonNullable<Json>;
          name: string | null;
          profile_name: string | null;
          tenant_id: string;
          updated_at: string;
          user_id: string | null;
          wa_id: string;
        };
        ComputedFields: never;
        Insert: {
          anonymized_at?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          metadata?: NonNullable<Json>;
          name?: string | null;
          profile_name?: string | null;
          tenant_id: string;
          updated_at?: string;
          user_id?: string | null;
          wa_id: string;
        };
        Update: {
          anonymized_at?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          metadata?: NonNullable<Json>;
          name?: string | null;
          profile_name?: string | null;
          tenant_id?: string;
          updated_at?: string;
          user_id?: string | null;
          wa_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'contacts_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          agent_key: string | null;
          contact_id: string;
          created_at: string;
          id: string;
          last_inbound_at: string | null;
          last_message_at: string | null;
          module: string | null;
          state: NonNullable<Json>;
          state_expires_at: string | null;
          tenant_id: string;
          updated_at: string;
          whatsapp_number_id: string;
        };
        ComputedFields: never;
        Insert: {
          agent_key?: string | null;
          contact_id: string;
          created_at?: string;
          id?: string;
          last_inbound_at?: string | null;
          last_message_at?: string | null;
          module?: string | null;
          state?: NonNullable<Json>;
          state_expires_at?: string | null;
          tenant_id: string;
          updated_at?: string;
          whatsapp_number_id: string;
        };
        Update: {
          agent_key?: string | null;
          contact_id?: string;
          created_at?: string;
          id?: string;
          last_inbound_at?: string | null;
          last_message_at?: string | null;
          module?: string | null;
          state?: NonNullable<Json>;
          state_expires_at?: string | null;
          tenant_id?: string;
          updated_at?: string;
          whatsapp_number_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_tenant_id_contact_id_fkey';
            columns: ['tenant_id', 'contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'conversations_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_tenant_id_whatsapp_number_id_fkey';
            columns: ['tenant_id', 'whatsapp_number_id'];
            isOneToOne: false;
            referencedRelation: 'whatsapp_numbers';
            referencedColumns: ['tenant_id', 'id'];
          },
        ];
      };
      departments: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'departments_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      document_chunks: {
        Row: {
          chunk_index: number;
          content: string;
          created_at: string;
          document_id: string;
          document_version_id: string;
          embedding: string;
          embedding_model: string;
          id: string;
          page: number | null;
          section_path: string | null;
          tenant_id: string;
          token_count: number;
          tsv: unknown;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          chunk_index: number;
          content: string;
          created_at?: string;
          document_id: string;
          document_version_id: string;
          embedding: string;
          embedding_model: string;
          id?: string;
          page?: number | null;
          section_path?: string | null;
          tenant_id: string;
          token_count: number;
          tsv?: never;
          updated_at?: string;
        };
        Update: {
          chunk_index?: number;
          content?: string;
          created_at?: string;
          document_id?: string;
          document_version_id?: string;
          embedding?: string;
          embedding_model?: string;
          id?: string;
          page?: number | null;
          section_path?: string | null;
          tenant_id?: string;
          token_count?: number;
          tsv?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_chunks_tenant_id_document_id_fkey';
            columns: ['tenant_id', 'document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'document_chunks_tenant_id_document_version_id_fkey';
            columns: ['tenant_id', 'document_version_id'];
            isOneToOne: false;
            referencedRelation: 'document_versions';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'document_chunks_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      document_versions: {
        Row: {
          activated_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          chunk_count: number;
          created_at: string;
          created_by: string | null;
          document_id: string;
          effective_date: string | null;
          filename: string;
          id: string;
          ingest_error: string | null;
          ingest_status: string;
          ingested_at: string | null;
          mime: string;
          review_date: string | null;
          sha256: string;
          size: number;
          status: string;
          storage_path: string;
          summary: string | null;
          tenant_id: string;
          updated_at: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          activated_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          chunk_count?: number;
          created_at?: string;
          created_by?: string | null;
          document_id: string;
          effective_date?: string | null;
          filename: string;
          id?: string;
          ingest_error?: string | null;
          ingest_status?: string;
          ingested_at?: string | null;
          mime: string;
          review_date?: string | null;
          sha256: string;
          size: number;
          status?: string;
          storage_path: string;
          summary?: string | null;
          tenant_id: string;
          updated_at?: string;
          version: number;
        };
        Update: {
          activated_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          chunk_count?: number;
          created_at?: string;
          created_by?: string | null;
          document_id?: string;
          effective_date?: string | null;
          filename?: string;
          id?: string;
          ingest_error?: string | null;
          ingest_status?: string;
          ingested_at?: string | null;
          mime?: string;
          review_date?: string | null;
          sha256?: string;
          size?: number;
          status?: string;
          storage_path?: string;
          summary?: string | null;
          tenant_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'document_versions_tenant_id_document_id_fkey';
            columns: ['tenant_id', 'document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'document_versions_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      documents: {
        Row: {
          code: string | null;
          collection: string;
          created_at: string;
          created_by: string | null;
          current_version_id: string | null;
          id: string;
          owner_user_id: string | null;
          tags: string[];
          tenant_id: string;
          title: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          code?: string | null;
          collection: string;
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          id?: string;
          owner_user_id?: string | null;
          tags?: string[];
          tenant_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          collection?: string;
          created_at?: string;
          created_by?: string | null;
          current_version_id?: string | null;
          id?: string;
          owner_user_id?: string | null;
          tags?: string[];
          tenant_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_current_version_fk';
            columns: ['tenant_id', 'current_version_id'];
            isOneToOne: false;
            referencedRelation: 'document_versions';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'documents_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      handoffs: {
        Row: {
          chatwoot_conversation_id: string | null;
          closed_at: string | null;
          closed_by_user_id: string | null;
          conversation_id: string;
          created_at: string;
          id: string;
          opened_at: string;
          opened_by: string;
          reason: string;
          status: string;
          summary: string | null;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          chatwoot_conversation_id?: string | null;
          closed_at?: string | null;
          closed_by_user_id?: string | null;
          conversation_id: string;
          created_at?: string;
          id?: string;
          opened_at?: string;
          opened_by?: string;
          reason: string;
          status?: string;
          summary?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          chatwoot_conversation_id?: string | null;
          closed_at?: string | null;
          closed_by_user_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          opened_at?: string;
          opened_by?: string;
          reason?: string;
          status?: string;
          summary?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'handoffs_tenant_id_conversation_id_fkey';
            columns: ['tenant_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'handoffs_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      knowledge_gaps: {
        Row: {
          agent_key: string | null;
          conversation_id: string | null;
          created_at: string;
          id: string;
          question: string;
          reason: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          agent_key?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          question: string;
          reason: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          agent_key?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          id?: string;
          question?: string;
          reason?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'knowledge_gaps_tenant_id_conversation_id_fkey';
            columns: ['tenant_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'knowledge_gaps_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      message_media: {
        Row: {
          created_at: string;
          error: string | null;
          filename: string | null;
          id: string;
          media_id: string | null;
          message_id: string;
          mime: string | null;
          sha256: string | null;
          size: number | null;
          status: string;
          storage_path: string | null;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          error?: string | null;
          filename?: string | null;
          id?: string;
          media_id?: string | null;
          message_id: string;
          mime?: string | null;
          sha256?: string | null;
          size?: number | null;
          status?: string;
          storage_path?: string | null;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          filename?: string | null;
          id?: string;
          media_id?: string | null;
          message_id?: string;
          mime?: string | null;
          sha256?: string | null;
          size?: number | null;
          status?: string;
          storage_path?: string | null;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_media_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_media_tenant_id_message_id_fkey';
            columns: ['tenant_id', 'message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['tenant_id', 'id'];
          },
        ];
      };
      messages: {
        Row: {
          author: string;
          conversation_id: string;
          created_at: string;
          direction: string;
          error: Json | null;
          id: string;
          payload: NonNullable<Json>;
          processed_at: string | null;
          raw: Json | null;
          sent_at: string | null;
          status: string;
          tenant_id: string;
          text: string | null;
          transcription: string | null;
          type: string;
          updated_at: string;
          wamid: string | null;
        };
        ComputedFields: never;
        Insert: {
          author?: string;
          conversation_id: string;
          created_at?: string;
          direction: string;
          error?: Json | null;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          raw?: Json | null;
          sent_at?: string | null;
          status?: string;
          tenant_id: string;
          text?: string | null;
          transcription?: string | null;
          type: string;
          updated_at?: string;
          wamid?: string | null;
        };
        Update: {
          author?: string;
          conversation_id?: string;
          created_at?: string;
          direction?: string;
          error?: Json | null;
          id?: string;
          payload?: NonNullable<Json>;
          processed_at?: string | null;
          raw?: Json | null;
          sent_at?: string | null;
          status?: string;
          tenant_id?: string;
          text?: string | null;
          transcription?: string | null;
          type?: string;
          updated_at?: string;
          wamid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_tenant_id_conversation_id_fkey';
            columns: ['tenant_id', 'conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['tenant_id', 'id'];
          },
          {
            foreignKeyName: 'messages_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      partner_members: {
        Row: {
          created_at: string;
          id: string;
          partner_id: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          partner_id: string;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          partner_id?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'partner_members_partner_id_fkey';
            columns: ['partner_id'];
            isOneToOne: false;
            referencedRelation: 'partners';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'partner_members_profile_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      partners: {
        Row: {
          branding: NonNullable<Json>;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          branding?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          branding?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenant_members: {
        Row: {
          created_at: string;
          id: string;
          role: Database['public']['Enums']['app_role'];
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database['public']['Enums']['app_role'];
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database['public']['Enums']['app_role'];
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenant_members_profile_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tenant_members_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tenant_modules: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          module: string;
          settings: NonNullable<Json>;
          tenant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          module: string;
          settings?: NonNullable<Json>;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          module?: string;
          settings?: NonNullable<Json>;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenant_modules_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      tenants: {
        Row: {
          branding: NonNullable<Json>;
          created_at: string;
          id: string;
          name: string;
          partner_id: string;
          settings: NonNullable<Json>;
          slug: string;
          status: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          branding?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name: string;
          partner_id: string;
          settings?: NonNullable<Json>;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          branding?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name?: string;
          partner_id?: string;
          settings?: NonNullable<Json>;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tenants_partner_id_fkey';
            columns: ['partner_id'];
            isOneToOne: false;
            referencedRelation: 'partners';
            referencedColumns: ['id'];
          },
        ];
      };
      whatsapp_numbers: {
        Row: {
          access_token_enc: string;
          created_at: string;
          default_module: string | null;
          display_number: string;
          id: string;
          phone_number_id: string;
          status: string;
          tenant_id: string;
          token_last4: string;
          updated_at: string;
          verified_at: string | null;
          verified_name: string | null;
          waba_id: string;
        };
        ComputedFields: never;
        Insert: {
          access_token_enc: string;
          created_at?: string;
          default_module?: string | null;
          display_number: string;
          id?: string;
          phone_number_id: string;
          status?: string;
          tenant_id: string;
          token_last4?: string;
          updated_at?: string;
          verified_at?: string | null;
          verified_name?: string | null;
          waba_id: string;
        };
        Update: {
          access_token_enc?: string;
          created_at?: string;
          default_module?: string | null;
          display_number?: string;
          id?: string;
          phone_number_id?: string;
          status?: string;
          tenant_id?: string;
          token_last4?: string;
          updated_at?: string;
          verified_at?: string | null;
          verified_name?: string | null;
          waba_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'whatsapp_numbers_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
      whatsapp_templates: {
        Row: {
          body: string;
          category: string;
          components: NonNullable<Json>;
          created_at: string;
          id: string;
          language: string;
          last_synced_at: string | null;
          meta_template_id: string | null;
          name: string;
          rejected_reason: string | null;
          status: string;
          tenant_id: string;
          updated_at: string;
          variables_count: number;
          waba_id: string;
        };
        ComputedFields: never;
        Insert: {
          body?: string;
          category: string;
          components?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          language?: string;
          last_synced_at?: string | null;
          meta_template_id?: string | null;
          name: string;
          rejected_reason?: string | null;
          status?: string;
          tenant_id: string;
          updated_at?: string;
          variables_count?: number;
          waba_id: string;
        };
        Update: {
          body?: string;
          category?: string;
          components?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          language?: string;
          last_synced_at?: string | null;
          meta_template_id?: string | null;
          name?: string;
          rejected_reason?: string | null;
          status?: string;
          tenant_id?: string;
          updated_at?: string;
          variables_count?: number;
          waba_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'whatsapp_templates_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenants';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      activate_document_version: {
        Args: { p_tenant_id: string; p_version_id: string };
        Returns: undefined;
      };
      anonymize_contact: {
        Args: { p_actor?: string; p_contact_id: string; p_tenant_id: string };
        Returns: string[];
      };
      apply_message_status: {
        Args: {
          p_at: string;
          p_errors?: Json;
          p_pricing?: Json;
          p_status: string;
          p_tenant_id: string;
          p_wamid: string;
        };
        Returns: boolean;
      };
      cleanup_expired_conversation_state: { Args: Record<PropertyKey, never>; Returns: number };
      record_inbound_message: {
        Args: {
          p_media?: Json;
          p_payload: Json;
          p_profile_name?: string;
          p_raw: Json;
          p_sent_at: string;
          p_tenant_id: string;
          p_text?: string;
          p_type: string;
          p_wa_id: string;
          p_wa_id_seen?: string;
          p_wamid: string;
          p_whatsapp_number_id: string;
        };
        Returns: {
          contact_id: string;
          conversation_id: string;
          inserted: boolean;
          media_row_id: string;
          message_id: string;
        }[];
      };
      search_knowledge: {
        Args: {
          p_collections: string[];
          p_embedding: string;
          p_embedding_model: string;
          p_limit?: number;
          p_min_score?: number;
          p_min_similarity?: number;
          p_query: string;
          p_tenant_id: string;
        };
        Returns: {
          chunk_id: string;
          code: string;
          collection: string;
          content: string;
          document_id: string;
          document_version_id: string;
          page: number;
          score: number;
          section_path: string;
          similarity: number;
          title: string;
          version: number;
        }[];
      };
    };
    Enums: {
      app_role: 'viewer' | 'operator' | 'quality' | 'manager' | 'admin' | 'owner';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ['viewer', 'operator', 'quality', 'manager', 'admin', 'owner'],
    },
  },
} as const;
