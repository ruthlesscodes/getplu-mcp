import type { Card, Transaction } from "../services/types.js";

/**
 * HTML fragments returned as `ui://` resources so MCP clients that render
 * embedded resources can show a card table instead of raw JSON. Clients that
 * don't render HTML still get the text content the tools return alongside.
 */

export function renderCardsHtml(cards: Card[]): string {
  if (cards.length === 0) return page("Cards", `<p class="empty">No cards match this filter.</p>`);

  const rows = cards
    .map(
      (card) => `
      <tr>
        <td><code>${escapeHtml(card.id)}</code></td>
        <td>${escapeHtml(card.brand)} ····${escapeHtml(card.last4)}</td>
        <td>${escapeHtml(card.kind)}</td>
        <td><span class="pill pill--${escapeHtml(card.status)}">${escapeHtml(card.status)}</span></td>
        <td>${escapeHtml(card.holder.name)} <span class="muted">(${escapeHtml(card.holder.type)})</span></td>
        <td class="num">${card.spendLimit === undefined ? "—" : escapeHtml(formatAmount(card.spendLimit, card.currency))}</td>
      </tr>`,
    )
    .join("");

  return page(
    "Cards",
    `<table>
      <thead>
        <tr><th>ID</th><th>Card</th><th>Kind</th><th>Status</th><th>Holder</th><th class="num">Limit</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`,
  );
}

export function renderTransactionsHtml(transactions: Transaction[]): string {
  if (transactions.length === 0) {
    return page("Transactions", `<p class="empty">No transactions in this window.</p>`);
  }

  const rows = transactions
    .map(
      (tx) => `
      <tr>
        <td>${escapeHtml(new Date(tx.createdAt).toISOString().slice(0, 16).replace("T", " "))}</td>
        <td>${escapeHtml(tx.merchant)}</td>
        <td><code>${escapeHtml(tx.cardId)}</code></td>
        <td><span class="pill pill--${escapeHtml(tx.status)}">${escapeHtml(tx.status)}</span></td>
        <td class="num">${escapeHtml(formatAmount(tx.amount, tx.currency))}</td>
      </tr>`,
    )
    .join("");

  return page(
    "Transactions",
    `<table>
      <thead>
        <tr><th>When</th><th>Merchant</th><th>Card</th><th>Status</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`,
  );
}

/** Minor units (cents) to a display string. */
export function formatAmount(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minorUnits / 100);
  } catch {
    return `${(minorUnits / 100).toFixed(2)} ${currency}`;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, body: string): string {
  return `<section class="plu">
  <style>
    .plu { font: 14px/1.5 system-ui, sans-serif; color: #16151a; }
    .plu h2 { font-size: 15px; margin: 0 0 12px; }
    .plu table { border-collapse: collapse; width: 100%; }
    .plu th, .plu td { padding: 6px 10px; border-bottom: 1px solid #e6e4ec; text-align: left; }
    .plu th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #6b6878; }
    .plu .num { text-align: right; font-variant-numeric: tabular-nums; }
    .plu code { font-size: 12px; color: #6b6878; }
    .plu .muted { color: #6b6878; }
    .plu .empty { color: #6b6878; margin: 0; }
    .plu .pill { border-radius: 999px; padding: 2px 8px; font-size: 12px; background: #eeecf5; }
    .plu .pill--active, .plu .pill--settled { background: #dcf3e4; }
    .plu .pill--frozen, .plu .pill--pending { background: #fdf0d5; }
    .plu .pill--cancelled, .plu .pill--declined, .plu .pill--reversed { background: #fbdedb; }
  </style>
  <h2>${escapeHtml(title)}</h2>
  ${body}
</section>`;
}
