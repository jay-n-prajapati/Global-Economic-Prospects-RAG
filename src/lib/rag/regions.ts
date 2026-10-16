// The six World Bank regions exactly as the report names them, plus the country lists from its regional tables
// (Tables 2.2, 2.4, 2.6, 2.8, 2.10, 2.12). Used by structure.ts (labels) and route.ts (question -> region).

export type Region = { key: string; name: string };

export const REGIONS: Region[] = [
  { key: "EAP", name: "East Asia and Pacific" },
  { key: "ECA", name: "Europe and Central Asia" },
  { key: "LAC", name: "Latin America and the Caribbean" },
  { key: "MNA", name: "Middle East, North Africa, Afghanistan, and Pakistan" },
  { key: "SAR", name: "South Asia" },
  { key: "SSA", name: "Sub-Saharan Africa" },
];

export const regionByKey = (key: string) => REGIONS.find((r) => r.key === key)?.name ?? null;

// Phrases that name a region (matched case-insensitively, word-bounded). Bare "Europe", "Africa", "Asia" and
// "Middle East" are deliberately absent: they are ambiguous in this report (euro area, South Africa, the conflict).
export const REGION_PHRASES: [string, string][] = [
  ["East Asia and Pacific", "EAP"], ["East Asia", "EAP"], ["Asia and the Pacific", "EAP"],
  ["Europe and Central Asia", "ECA"], ["Central Asia", "ECA"], ["Emerging Europe", "ECA"],
  ["Latin America and the Caribbean", "LAC"], ["Latin America", "LAC"], ["the Caribbean", "LAC"],
  ["Middle East, North Africa, Afghanistan, and Pakistan", "MNA"], ["Middle East and North Africa", "MNA"],
  ["North Africa", "MNA"], ["MENA", "MNA"],
  ["South Asia", "SAR"], ["South Asian", "SAR"],
  ["Sub-Saharan Africa", "SSA"], ["Sub-Saharan", "SSA"], ["Subsaharan", "SSA"],
];
// Region abbreviations, matched case-sensitively as whole words (SAR also appears in "Hong Kong SAR").
export const REGION_ABBREVIATIONS: Record<string, string> = {
  EAP: "EAP", ECA: "ECA", LAC: "LAC", MNA: "MNA", SAR: "SAR", SSA: "SSA",
};

// Country -> region key, as grouped in this report. NOTE: Afghanistan and Pakistan are in MNA, not South Asia.
const COUNTRIES: Record<string, string[]> = {
  EAP: [
    "Cambodia", "China", "Fiji", "Indonesia", "Kiribati", "Lao PDR", "Laos", "Malaysia", "Marshall Islands",
    "Micronesia", "Mongolia", "Myanmar", "Nauru", "Palau", "Papua New Guinea", "Philippines", "Samoa",
    "Solomon Islands", "Thailand", "Timor-Leste", "Tonga", "Tuvalu", "Vanuatu", "Viet Nam", "Vietnam",
  ],
  ECA: [
    "Albania", "Armenia", "Azerbaijan", "Belarus", "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Georgia",
    "Kazakhstan", "Kosovo", "Kyrgyz Republic", "Kyrgyzstan", "Moldova", "Montenegro", "North Macedonia", "Poland",
    "Romania", "Russian Federation", "Russia", "Serbia", "Tajikistan", "Türkiye", "Turkiye", "Turkey",
    "Turkmenistan", "Ukraine", "Uzbekistan",
  ],
  LAC: [
    "Argentina", "The Bahamas", "Bahamas", "Barbados", "Belize", "Bolivia", "Brazil", "Chile", "Colombia",
    "Costa Rica", "Dominica", "Dominican Republic", "Ecuador", "El Salvador", "Grenada", "Guatemala", "Guyana",
    "Haiti", "Honduras", "Jamaica", "Mexico", "Nicaragua", "Panama", "Paraguay", "Peru", "St. Lucia", "Saint Lucia",
    "St. Vincent and the Grenadines", "Suriname", "Trinidad and Tobago", "Uruguay",
  ],
  MNA: [
    "Algeria", "Bahrain", "Djibouti", "Iraq", "Jordan", "Kuwait", "Lebanon", "Libya", "Morocco", "Oman", "Qatar",
    "Saudi Arabia", "Syrian Arab Republic", "Syria", "Tunisia", "United Arab Emirates", "UAE", "West Bank and Gaza",
    "Yemen", "Afghanistan", "Iran", "Egypt", "Pakistan",
  ],
  SAR: ["Bangladesh", "Bhutan", "India", "Maldives", "Nepal", "Sri Lanka"],
  SSA: [
    "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", "Central African Republic", "Cabo Verde", "Cape Verde",
    "Cameroon", "Chad", "Comoros", "Democratic Republic of Congo", "Democratic Republic of the Congo",
    "Republic of Congo", "Congo", "Côte d'Ivoire", "Cote d'Ivoire", "Ivory Coast", "Equatorial Guinea", "Eritrea",
    "Eswatini", "Ethiopia", "Gabon", "The Gambia", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", "Kenya", "Lesotho",
    "Liberia", "Madagascar", "Malawi", "Mali", "Mauritania", "Mauritius", "Mozambique", "Namibia", "Niger",
    "Nigeria", "Rwanda", "São Tomé and Príncipe", "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
    "Somalia", "South Africa", "South Sudan", "Sudan", "Tanzania", "Togo", "Uganda", "Zambia", "Zimbabwe",
  ],
};

// Names that are also ordinary English words or fragments of other names: only matched when capitalized.
export const CASE_SENSITIVE_COUNTRIES = new Set(["Georgia", "Jordan", "Chad", "Turkey", "Niger", "Mali", "Congo", "Guinea", "Oman", "Peru"]);

// Longest names first, so "Papua New Guinea" or "South Sudan" are consumed before "Guinea" or "Sudan".
export const COUNTRY_REGION: [string, string][] = Object.entries(COUNTRIES)
  .flatMap(([key, names]) => names.map((n): [string, string] => [n, key]))
  .sort((a, b) => b[0].length - a[0].length);
