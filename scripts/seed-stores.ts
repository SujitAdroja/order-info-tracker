/**
 * Idempotent store seed: `npm run db:seed`.
 * Upserts by slug. Policy fields are only overwritten with non-null seed
 * values, so a verified value already in the DB is never wiped by null.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { storeCategoryPolicies, stores } from "../lib/db/schema";
import { STORE_SEEDS } from "../lib/db/seed/stores";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    for (const seed of STORE_SEEDS) {
      const [row] = await db
        .insert(stores)
        .values({
          slug: seed.slug,
          name: seed.name,
          country: seed.country,
          senderDomains: seed.senderDomains,
          defaultReturnDays: seed.defaultReturnDays,
          returnFrom: seed.returnFrom,
          policyUrl: seed.policyUrl,
          policyVerifiedAt: seed.policyVerifiedAt,
        })
        .onConflictDoUpdate({
          target: stores.slug,
          set: {
            name: seed.name,
            country: seed.country,
            senderDomains: seed.senderDomains,
            returnFrom: seed.returnFrom,
            defaultReturnDays: sql`coalesce(${seed.defaultReturnDays}::int, ${stores.defaultReturnDays})`,
            policyUrl: sql`coalesce(${seed.policyUrl}::text, ${stores.policyUrl})`,
            policyVerifiedAt: sql`coalesce(${seed.policyVerifiedAt}::date, ${stores.policyVerifiedAt})`,
          },
        })
        .returning({ id: stores.id });

      for (const policy of seed.categoryPolicies) {
        await db
          .insert(storeCategoryPolicies)
          .values({ storeId: row.id, ...policy })
          .onConflictDoUpdate({
            target: [
              storeCategoryPolicies.storeId,
              storeCategoryPolicies.category,
            ],
            set: {
              returnDays: policy.returnDays,
              nonReturnable: policy.nonReturnable,
            },
          });
      }
    }
    console.log(`Seeded ${STORE_SEEDS.length} stores.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
