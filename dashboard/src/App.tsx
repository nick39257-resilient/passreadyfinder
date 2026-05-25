import { ActionCard } from "./components/ActionCard";

/** Demo shell — wire to /api leads + risk scores in next iteration */
export function App() {
  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-400">
          PassReady
        </p>
        <h1 className="text-2xl font-bold">Insights</h1>
      </header>

      <ActionCard
        businessName="Good Hut Chinese Take Away"
        riskScore={82}
        riskBand="critical"
        actionLabel="Draft message"
        onAction={() => console.log("draft")}
      />
    </div>
  );
}
