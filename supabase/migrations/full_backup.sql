


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."room_status" AS ENUM (
    'waiting',
    'active',
    'paused',
    'completed'
);


ALTER TYPE "public"."room_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_session_token"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$                                                  
  BEGIN
    UPDATE profiles                                                   
    SET current_session_token = NULL,                         
        session_expires_at = NULL,
        last_active_at = NOW()
    WHERE id = p_user_id;
  END;
  $$;


ALTER FUNCTION "public"."clear_session_token"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_join_code"() RETURNS character varying
    LANGUAGE "plpgsql"
    AS $$
  DECLARE
    chars TEXT := '0123456789';
    result VARCHAR(4) := '';
    i INTEGER;
  BEGIN
    FOR i IN 1..4 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
  END;
  $$;


ALTER FUNCTION "public"."generate_join_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_email"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_email TEXT;
  BEGIN
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_user_id;
    RETURN v_email;                                                             
  END;
  $$;


ALTER FUNCTION "public"."get_user_email"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_room_role"("p_room_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM room_members
  WHERE room_id = p_room_id AND user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_room_role"("p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_room_teacher"("p_room_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM rooms
    WHERE id = p_room_id AND teacher_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_room_teacher"("p_room_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."login_with_username"("p_username" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_profile RECORD;
  v_email TEXT;
BEGIN
  SELECT p.id, p.username, p.display_name, p.role, p.current_session_token, u.email
  INTO v_profile
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.username = p_username;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_profile.id,
    'email', v_profile.email,
    'username', v_profile.username,
    'display_name', COALESCE(v_profile.display_name, v_profile.username),
    'role', v_profile.role,
    'stored_token', v_profile.current_session_token
  );
END;
$$;


ALTER FUNCTION "public"."login_with_username"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."login_with_username"("p_username" "text", "p_password" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE                                                                       
    v_profile RECORD;
    v_email TEXT;                                                               
  BEGIN                                                       
    -- Find profile by username
    SELECT p.id, p.role, p.current_session_token, u.email
    INTO v_profile
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.username = p_username;                                              
   
    IF NOT FOUND THEN                                                           
      RETURN jsonb_build_object('success', false, 'error', 'User not found');
    END IF;

    v_email := v_profile.email;

    RETURN jsonb_build_object(                                                  
      'success', true,
      'user_id', v_profile.id,                                                  
      'email', v_email,                                       
      'role', v_profile.role,
      'stored_token', v_profile.current_session_token
    );
  END;
  $$;


ALTER FUNCTION "public"."login_with_username"("p_username" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_room_join_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.join_code IS NULL OR NEW.join_code = '' THEN
    -- Keep trying until we get a unique code (max 100 attempts)
    FOR i IN 1..100 LOOP
      NEW.join_code := generate_join_code();
      IF NOT EXISTS (SELECT 1 FROM rooms WHERE join_code = NEW.join_code AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_room_join_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_session_token"("p_user_id" "uuid", "p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  BEGIN                                                               
    UPDATE profiles                                           
    SET current_session_token = p_token,
        last_active_at = NOW(),
        session_expires_at = NOW() + INTERVAL '24 hours'
    WHERE id = p_user_id;                                             
  END;
  $$;


ALTER FUNCTION "public"."set_session_token"("p_user_id" "uuid", "p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_session"("p_user_id" "uuid", "p_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE                                                             
    v_stored_token TEXT;                                      
    v_expires_at TIMESTAMPTZ;
  BEGIN
    SELECT current_session_token, session_expires_at
    INTO v_stored_token, v_expires_at
    FROM profiles                                                     
    WHERE id = p_user_id;
                                                                      
    IF v_expires_at IS NOT NULL AND v_expires_at < NOW() THEN 
      UPDATE profiles SET current_session_token = NULL WHERE id =
  p_user_id;
      RETURN FALSE;
    END IF;

    IF v_stored_token IS NULL OR v_stored_token = p_token THEN        
      RETURN TRUE;
    END IF;                                                           
                                                              
    RETURN FALSE;
  END;
  $$;


ALTER FUNCTION "public"."validate_session"("p_user_id" "uuid", "p_token" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."assets" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "texture_url" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."brush_categories" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#666666'::"text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."brush_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "role" "text" NOT NULL,
    "current_session_token" "text",
    "last_active_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_name" "text",
    "session_expires_at" timestamp with time zone,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['teacher'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."room_members" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "nickname" "text",
    CONSTRAINT "room_members_role_check" CHECK (("role" = ANY (ARRAY['teacher'::"text", 'student'::"text"])))
);


ALTER TABLE "public"."room_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rooms" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "join_code" character varying(4) NOT NULL,
    "status" "public"."room_status" DEFAULT 'waiting'::"public"."room_status" NOT NULL,
    "config" "jsonb" DEFAULT '{"gridWidth": 150, "gridHeight": 100, "sourceType": "webcam"}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text"
);


ALTER TABLE "public"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."single_brushes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT '默认'::"text",
    "image_data" "text" NOT NULL,
    "thumbnail_data" "text",
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."single_brushes" OWNER TO "postgres";


ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."brush_categories"
    ADD CONSTRAINT "brush_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."brush_categories"
    ADD CONSTRAINT "brush_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_room_id_user_id_key" UNIQUE ("room_id", "user_id");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_join_code_key" UNIQUE ("join_code");



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."single_brushes"
    ADD CONSTRAINT "single_brushes_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_assets_room_id" ON "public"."assets" USING "btree" ("room_id");



CREATE INDEX "idx_assets_student_id" ON "public"."assets" USING "btree" ("student_id");



CREATE INDEX "idx_room_members_room_id" ON "public"."room_members" USING "btree" ("room_id");



CREATE INDEX "idx_room_members_user_id" ON "public"."room_members" USING "btree" ("user_id");



CREATE INDEX "idx_rooms_join_code" ON "public"."rooms" USING "btree" ("join_code");



CREATE INDEX "idx_rooms_teacher_id" ON "public"."rooms" USING "btree" ("teacher_id");



CREATE OR REPLACE TRIGGER "trigger_assets_updated_at" BEFORE UPDATE ON "public"."assets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_rooms_updated_at" BEFORE UPDATE ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_set_room_join_code" BEFORE INSERT ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."set_room_join_code"();



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assets"
    ADD CONSTRAINT "assets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."brush_categories"
    ADD CONSTRAINT "brush_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."room_members"
    ADD CONSTRAINT "room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."single_brushes"
    ADD CONSTRAINT "single_brushes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can view profiles" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Anyone can view rooms" ON "public"."rooms" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can view rooms" ON "public"."rooms" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Teachers can create rooms" ON "public"."rooms" FOR INSERT WITH CHECK (("auth"."uid"() = "teacher_id"));



CREATE POLICY "Teachers can delete own rooms" ON "public"."rooms" FOR DELETE USING (("auth"."uid"() = "teacher_id"));



CREATE POLICY "Teachers can update own rooms" ON "public"."rooms" FOR UPDATE USING (("auth"."uid"() = "teacher_id"));



CREATE POLICY "Teachers have full access to room assets" ON "public"."assets" USING ((EXISTS ( SELECT 1
   FROM "public"."rooms"
  WHERE (("rooms"."id" = "assets"."room_id") AND ("rooms"."teacher_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete own assets" ON "public"."assets" FOR DELETE USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Users can insert assets" ON "public"."assets" FOR INSERT WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can join rooms" ON "public"."room_members" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can leave rooms" ON "public"."room_members" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own brushes" ON "public"."single_brushes" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own assets" ON "public"."assets" FOR UPDATE USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own assets" ON "public"."assets" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Users can view room_members" ON "public"."room_members" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."assets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."brush_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."room_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."single_brushes" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."assets";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."rooms";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."clear_session_token"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clear_session_token"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_session_token"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_join_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_join_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_join_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_email"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_email"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_email"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_room_role"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_room_role"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_room_role"("p_room_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_room_teacher"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_room_teacher"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_room_teacher"("p_room_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."login_with_username"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."login_with_username"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."login_with_username"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."login_with_username"("p_username" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."login_with_username"("p_username" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."login_with_username"("p_username" "text", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_room_join_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_room_join_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_room_join_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_session_token"("p_user_id" "uuid", "p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_session_token"("p_user_id" "uuid", "p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_session_token"("p_user_id" "uuid", "p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_session"("p_user_id" "uuid", "p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_session"("p_user_id" "uuid", "p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_session"("p_user_id" "uuid", "p_token" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."assets" TO "anon";
GRANT ALL ON TABLE "public"."assets" TO "authenticated";
GRANT ALL ON TABLE "public"."assets" TO "service_role";



GRANT ALL ON TABLE "public"."brush_categories" TO "anon";
GRANT ALL ON TABLE "public"."brush_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."brush_categories" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."room_members" TO "anon";
GRANT ALL ON TABLE "public"."room_members" TO "authenticated";
GRANT ALL ON TABLE "public"."room_members" TO "service_role";



GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";



GRANT ALL ON TABLE "public"."single_brushes" TO "anon";
GRANT ALL ON TABLE "public"."single_brushes" TO "authenticated";
GRANT ALL ON TABLE "public"."single_brushes" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































