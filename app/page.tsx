import { HealthStatus } from "./health-status";

export default function Home() {
  return (
    <main>
      <h1>Ducks on the Pond (test harness)</h1>
      <HealthStatus />
      <p>Pick a test user above. Alice and Bob are collectors; Carol is an admin.</p>
      <h2>Things to try</h2>
      <ol>
        <li><a href="/catalog">Catalog</a>: add a set, parallels, cards and variants.</li>
        <li><a href="/collection">My collection</a>: add a copy, turn Tradeable on, list it, mark it sold.</li>
        <li>Add a serial-numbered copy whose serial someone else already holds; it goes to the admin queue.</li>
        <li><a href="/wants">Wishlist</a>: want a card, then see matching tradeable copies.</li>
        <li><a href="/trades">Trades</a>: propose as Alice, switch to Bob to accept or counter, then complete.</li>
        <li><a href="/reports">Reports</a>: inventory, for sale, sold, and totals.</li>
        <li><a href="/admin">Admin</a> (as Carol): resolve serial-number conflicts.</li>
      </ol>
    </main>
  );
}
