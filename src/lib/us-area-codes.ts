// City → primary area code lookup for default Vapi number provisioning when
// the prospect doesn't have a phone on file. Curated for med spa markets
// (major metros + a handful of high-density spa cities like Scottsdale,
// Naples, Newport Beach). Where a metro has multiple area codes, we pick
// the most prestigious / centrally located one (e.g. NYC → 212, not 718).

const CITY_TO_AREA_CODE: Record<string, string> = {
  // California
  "los angeles": "213",
  "la": "213",
  "beverly hills": "310",
  "santa monica": "310",
  "west hollywood": "310",
  "malibu": "310",
  "pasadena": "626",
  "long beach": "562",
  "burbank": "818",
  "newport beach": "949",
  "irvine": "949",
  "anaheim": "714",
  "san diego": "619",
  "la jolla": "858",
  "san francisco": "415",
  "sf": "415",
  "oakland": "510",
  "berkeley": "510",
  "san jose": "408",
  "palo alto": "650",
  "sacramento": "916",

  // New York
  "new york": "212",
  "new york city": "212",
  "nyc": "212",
  "manhattan": "212",
  "brooklyn": "718",
  "queens": "718",

  // Florida
  "miami": "305",
  "miami beach": "305",
  "fort lauderdale": "954",
  "boca raton": "561",
  "palm beach": "561",
  "west palm beach": "561",
  "naples": "239",
  "tampa": "813",
  "orlando": "407",
  "jacksonville": "904",

  // Texas
  "houston": "713",
  "dallas": "214",
  "fort worth": "817",
  "austin": "512",
  "san antonio": "210",
  "plano": "972",

  // Arizona
  "phoenix": "602",
  "scottsdale": "480",
  "tempe": "480",
  "mesa": "480",
  "tucson": "520",

  // Illinois / Midwest
  "chicago": "312",

  // Georgia
  "atlanta": "404",

  // Massachusetts
  "boston": "617",
  "cambridge": "617",

  // Washington / Oregon
  "seattle": "206",
  "bellevue": "425",
  "portland": "503",

  // Colorado
  "denver": "303",
  "boulder": "303",

  // DC + mid-atlantic
  "washington": "202",
  "washington dc": "202",
  "philadelphia": "215",

  // Nevada
  "las vegas": "702",
  "henderson": "702",

  // Tennessee / Carolinas
  "nashville": "615",
  "charlotte": "704",
  "raleigh": "919",

  // Other major metros
  "minneapolis": "612",
  "saint paul": "651",
  "st paul": "651",
  "kansas city": "816",
  "saint louis": "314",
  "st louis": "314",
  "detroit": "313",
  "cleveland": "216",
  "pittsburgh": "412",
  "salt lake city": "801",
  "honolulu": "808",
};

/**
 * Look up the primary US area code for a city name. Case-insensitive,
 * tolerates "St." vs "Saint" and trailing ", ST" state suffixes. Returns
 * null if not in the curated map.
 */
export function areaCodeForCity(city: string | null | undefined): string | null {
  if (!city) return null;
  const cleaned = city
    .toLowerCase()
    .trim()
    // Drop trailing ", CA" / ", California" suffixes if the field is denormalized.
    .replace(/,\s*[a-z\s]+$/i, "")
    // Normalize "St." → "saint" so both forms hit the same key.
    .replace(/^st\.?\s+/, "saint ")
    .replace(/[.]/g, "")
    .trim();
  return CITY_TO_AREA_CODE[cleaned] ?? null;
}
