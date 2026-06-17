# Migration to Azure Cosmos DB (Mongo API) — TODO

- [ ] Create Cosmos DB account (MongoDB API) and databases/containers for wards, beds, patients.
- [ ] Decide partition keys for each container (recommended approach).
- [ ] Update `.env.local` with Cosmos MongoDB connection string.
- [ ] (If needed) Adjust `scripts/seedDatabase.mjs` to use Cosmos connection string.
- [ ] Run seed/migration to copy existing data into Cosmos.
- [ ] Run the Next.js app and verify API endpoints.
- [ ] Tune indexing/partition settings if queries are slow or wrong.
