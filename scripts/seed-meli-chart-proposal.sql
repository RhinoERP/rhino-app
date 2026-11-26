-- Manual seed for a TEST organization, after accounting migration 032.
-- Replace NULL with the organization UUID. Set false to true only when USD
-- should be enabled on existing accounts for all channels in that test org.
-- An error aborts the whole operation; inspect every returned account.
SELECT *
FROM accounting.seed_meli_test_chart(
  NULL::uuid,
  false
);
