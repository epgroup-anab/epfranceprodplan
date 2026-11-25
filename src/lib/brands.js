/**
 * Customer → website, so the planning grid can show each brand's small icon.
 * Most specific names first: "Carrefour Spain" must match before "Carrefour".
 * Customers with no public site (internal, MTO, small bakeries) show no icon.
 */
const DOMAINS = [
  [/carrefour spain/i, 'carrefour.es'],
  [/carrefour belgium/i, 'carrefour.be'],
  [/carrefour italy/i, 'carrefour.it'],
  [/carrefour/i, 'carrefour.fr'],
  [/mcdonald'?s germany/i, 'mcdonalds.de'],
  [/mcdonald/i, 'mcdonalds.fr'],
  [/burger king/i, 'burgerking.fr'],
  [/monoprix/i, 'monoprix.fr'],
  [/sushi shop/i, 'sushishop.fr'],
  [/intermarch/i, 'intermarche.com'],
  [/vival/i, 'vival.fr'],
  [/system-?u/i, 'magasins-u.com'],
  [/lidl/i, 'lidl.fr'],
  [/aldi/i, 'aldi.fr'],
  [/kiabi/i, 'kiabi.com'],
  [/intersport/i, 'intersport.fr'],
  [/franprix/i, 'franprix.fr'],
  [/sherpa/i, 'sherpa.net'],
  [/spar/i, 'spar.fr'],
  [/promod/i, 'promod.fr'],
  [/auchan/i, 'auchan.fr'],
  [/casino/i, 'casino.fr'],
  [/naturalia/i, 'naturalia.fr'],
  [/netto/i, 'netto.fr'],
  [/morrisons/i, 'morrisons.com'],
  [/maison/i, 'maisonsdumonde.com'],
  [/leclerc/i, 'e.leclerc'],
  [/tarte trop/i, 'latartetropezienne.fr'],
  [/la fourche/i, 'lafourche.fr'],
  [/krispy kreme/i, 'krispykreme.com'],
  [/c[ée]lio/i, 'celio.com'],
  [/^(boulangerie )?paul$/i, 'paul.fr'],
];

export function customerDomain(customer) {
  if (!customer) return null;
  const hit = DOMAINS.find(([pattern]) => pattern.test(customer));
  return hit ? hit[1] : null;
}

export function customerLogo(customer) {
  const domain = customerDomain(customer);
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;
}
