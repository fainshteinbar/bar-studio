// For drafts: builds the same `snapshot` shape that issue_document() freezes at issue, from live data,
// so a draft previews and prints exactly as it will look once issued.
// Issued documents always use their own frozen snapshot, never this.

export function liveSnapshot({ kind, settings: s, client: c, project: p, parent, parentBalance, source, amount }) {
  const identifier = s?.show_identifier && String(s.identifier_value || '').trim()
    ? { label: s.identifier_label, value: s.identifier_value } : null;
  const snap = {
    supplier: s ? { name: s.supplier_name, trading_as: s.trading_as, address: s.supplier_address,
      email: s.supplier_email, phone: s.supplier_phone, identifier } : {},
    client: c ? { display_name: c.display_name, legal_name: c.legal_name, identifier: c.identifier,
      contact: c.contact, email: c.email, address: c.address } : {},
    project: p ? { description: p.description, payment_terms: p.payment_terms, total: p.total } : null,
    footer_text: s?.footer_text || null,
    terms_text: kind === 'invoice' ? s?.payment_terms_text || null : kind === 'quote' ? s?.quote_terms_text || null : null,
    parent: parent ? { number: parent.number, issue_date: parent.issue_date, amount: parent.amount } : null,
    source: source && source.status === 'issued' ? { number: source.number, kind: source.kind } : null,
    balance: null,
  };
  if (kind === 'receipt' && parent) {
    const paid = Number(parentBalance?.paid || 0);
    const credited = Number(parentBalance?.credited || 0);
    const now = Number(amount || 0);
    snap.balance = { invoice_total: Number(parent.amount), credited, paid_before: paid, paid_now: now,
      open_after: Number(parent.amount) - credited - paid - now };
  }
  return snap;
}
