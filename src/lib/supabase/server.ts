import { createDatabaseClient } from "../../../worker/database";
import { requestContext } from "../../../worker/context";
export async function createSupabaseServerClient() { const {env,user}=requestContext(); return createDatabaseClient(env.DB,user); }
