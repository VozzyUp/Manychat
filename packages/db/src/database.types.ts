export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
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
