import type { SupabaseClient } from "@supabase/supabase-js";
import { createDatabaseClient } from "../../../worker/database";
import { requestContext } from "../../../worker/context";
export function hasAdminClient() { return true; }
export function createSupabaseAdminClient(): SupabaseClient { const {env,user}=requestContext();return createDatabaseClient(env.DB,user,true); }
export function adminConfigClient(_sessionClient: SupabaseClient) { return createSupabaseAdminClient(); }
