// Refuses to continue unless the loaded env points at the Neon dev branch.
// Used before migrations and seeding so they can't reach production by accident.
if (process.env.NEON_BRANCH !== "dev") {
  console.error(`Refusing to run: NEON_BRANCH is "${process.env.NEON_BRANCH ?? ""}", expected "dev".`);
  process.exit(1);
}
