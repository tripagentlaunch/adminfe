/* =============================================================================
 * TripAgent — src/lib/airports.ts
 * Built-in airport directory for the FlightDesk From/To typeahead (2026-10-09).
 *
 * Suggestions used to come only from GET /flights/autosuggest (TripSure),
 * so whenever TripSure was unreachable (its flight host allowlists IPs and
 * blocks Render) typing "new york" showed nothing at all. This list covers
 * every TripAgent destination's airports (the sourcing engine's city
 * registry), India's main departure airports and the major world hubs, so
 * suggestions always appear; live TripSure results replace them whenever
 * TripSure answers. Entries use the /flights/autosuggest shape so the
 * dropdown renders either source the same way.
 * ===========================================================================*/

export type Airport = {
  airport_code: string;
  airport_name: string;
  city: string;
  country: string;
  country_code: string;
  aliases?: string[];
};

// [code, airport name, city, country, country code, aliases]
type Row = [string, string, string, string, string, string[]?];

const ROWS: Row[] = [
  // India
  ["DEL", "Indira Gandhi International Airport", "New Delhi", "India", "IN", ["delhi", "agra"]],
  ["BOM", "Chhatrapati Shivaji Maharaj International Airport", "Mumbai", "India", "IN", ["bombay"]],
  ["BLR", "Kempegowda International Airport", "Bengaluru", "India", "IN", ["bangalore"]],
  ["MAA", "Chennai International Airport", "Chennai", "India", "IN", ["madras"]],
  ["HYD", "Rajiv Gandhi International Airport", "Hyderabad", "India", "IN"],
  ["CCU", "Netaji Subhas Chandra Bose International Airport", "Kolkata", "India", "IN", ["calcutta"]],
  ["COK", "Cochin International Airport", "Kochi", "India", "IN", ["cochin", "alleppey", "alappuzha", "munnar", "kerala"]],
  ["GOI", "Dabolim Airport", "Goa", "India", "IN", ["dabolim", "vasco"]],
  ["GOX", "Manohar International Airport (Mopa)", "Goa", "India", "IN", ["mopa", "north goa"]],
  ["PNQ", "Pune Airport", "Pune", "India", "IN", ["poona"]],
  ["AMD", "Sardar Vallabhbhai Patel International Airport", "Ahmedabad", "India", "IN"],
  ["JAI", "Jaipur International Airport", "Jaipur", "India", "IN", ["ranthambore", "rajasthan"]],
  ["UDR", "Maharana Pratap Airport", "Udaipur", "India", "IN"],
  ["JDH", "Jodhpur Airport", "Jodhpur", "India", "IN", ["jaisalmer"]],
  ["JSA", "Jaisalmer Airport", "Jaisalmer", "India", "IN"],
  ["SWM", "Sawai Madhopur Airport", "Ranthambore", "India", "IN", ["sawai madhopur"]],
  ["AGR", "Agra Airport (Kheria)", "Agra", "India", "IN", ["taj mahal"]],
  ["ATQ", "Sri Guru Ram Dass Jee International Airport", "Amritsar", "India", "IN"],
  ["IXZ", "Veer Savarkar International Airport", "Port Blair", "India", "IN", ["andaman", "andaman islands", "havelock"]],
  ["IXB", "Bagdogra Airport", "Bagdogra", "India", "IN", ["darjeeling", "siliguri", "sikkim"]],
  ["IXL", "Kushok Bakula Rimpochee Airport", "Leh", "India", "IN", ["ladakh", "leh-ladakh"]],
  ["KUU", "Kullu–Manali Airport (Bhuntar)", "Kullu", "India", "IN", ["manali", "bhuntar"]],
  ["DED", "Jolly Grant Airport", "Dehradun", "India", "IN", ["rishikesh", "mussoorie", "haridwar"]],
  ["SLV", "Shimla Airport", "Shimla", "India", "IN"],
  ["IXC", "Chandigarh International Airport", "Chandigarh", "India", "IN", ["shimla"]],
  ["SXR", "Sheikh ul-Alam International Airport", "Srinagar", "India", "IN", ["kashmir"]],
  ["VNS", "Lal Bahadur Shastri International Airport", "Varanasi", "India", "IN", ["benaras", "banaras", "kashi"]],
  ["LKO", "Chaudhary Charan Singh International Airport", "Lucknow", "India", "IN"],
  ["TRV", "Thiruvananthapuram International Airport", "Thiruvananthapuram", "India", "IN", ["trivandrum", "kovalam"]],
  ["CJB", "Coimbatore International Airport", "Coimbatore", "India", "IN", ["ooty"]],
  ["IXE", "Mangaluru International Airport", "Mangaluru", "India", "IN", ["mangalore"]],
  ["GAU", "Lokpriya Gopinath Bordoloi International Airport", "Guwahati", "India", "IN"],
  ["BBI", "Biju Patnaik International Airport", "Bhubaneswar", "India", "IN"],
  ["IDR", "Devi Ahilyabai Holkar Airport", "Indore", "India", "IN"],
  ["NAG", "Dr. Babasaheb Ambedkar International Airport", "Nagpur", "India", "IN"],
  ["PAT", "Jay Prakash Narayan International Airport", "Patna", "India", "IN"],
  ["VTZ", "Visakhapatnam Airport", "Visakhapatnam", "India", "IN", ["vizag"]],
  // Middle East
  ["DXB", "Dubai International Airport", "Dubai", "United Arab Emirates", "AE", ["uae"]],
  ["DWC", "Al Maktoum International Airport", "Dubai", "United Arab Emirates", "AE", ["dubai world central"]],
  ["AUH", "Zayed International Airport", "Abu Dhabi", "United Arab Emirates", "AE", ["uae"]],
  ["DOH", "Hamad International Airport", "Doha", "Qatar", "QA"],
  ["MCT", "Muscat International Airport", "Muscat", "Oman", "OM"],
  ["AMM", "Queen Alia International Airport", "Amman", "Jordan", "JO", ["petra"]],
  ["AQJ", "King Hussein International Airport", "Aqaba", "Jordan", "JO", ["petra", "wadi rum"]],
  ["BAH", "Bahrain International Airport", "Manama", "Bahrain", "BH", ["bahrain"]],
  ["KWI", "Kuwait International Airport", "Kuwait City", "Kuwait", "KW", ["kuwait"]],
  ["RUH", "King Khalid International Airport", "Riyadh", "Saudi Arabia", "SA"],
  ["JED", "King Abdulaziz International Airport", "Jeddah", "Saudi Arabia", "SA"],
  ["IST", "Istanbul Airport", "Istanbul", "Turkey", "TR", ["turkiye"]],
  ["SAW", "Sabiha Gökçen International Airport", "Istanbul", "Turkey", "TR", ["sabiha gokcen"]],
  ["NAV", "Nevşehir Kapadokya Airport", "Nevşehir", "Turkey", "TR", ["cappadocia", "nevsehir"]],
  ["ASR", "Erkilet International Airport", "Kayseri", "Turkey", "TR", ["cappadocia"]],
  // Europe
  ["LHR", "Heathrow Airport", "London", "United Kingdom", "GB", ["uk", "england"]],
  ["LGW", "Gatwick Airport", "London", "United Kingdom", "GB", ["uk"]],
  ["LCY", "London City Airport", "London", "United Kingdom", "GB", ["uk"]],
  ["STN", "Stansted Airport", "London", "United Kingdom", "GB", ["uk"]],
  ["MAN", "Manchester Airport", "Manchester", "United Kingdom", "GB", ["uk"]],
  ["EDI", "Edinburgh Airport", "Edinburgh", "United Kingdom", "GB", ["scotland"]],
  ["DUB", "Dublin Airport", "Dublin", "Ireland", "IE"],
  ["CDG", "Charles de Gaulle Airport", "Paris", "France", "FR"],
  ["ORY", "Paris Orly Airport", "Paris", "France", "FR"],
  ["NCE", "Nice Côte d'Azur Airport", "Nice", "France", "FR", ["french riviera", "riviera", "cannes", "monaco", "monte carlo"]],
  ["AMS", "Amsterdam Airport Schiphol", "Amsterdam", "Netherlands", "NL", ["schiphol"]],
  ["FRA", "Frankfurt Airport", "Frankfurt", "Germany", "DE"],
  ["MUC", "Munich Airport", "Munich", "Germany", "DE", ["munchen"]],
  ["BER", "Berlin Brandenburg Airport", "Berlin", "Germany", "DE"],
  ["ZRH", "Zurich Airport", "Zurich", "Switzerland", "CH", ["st. moritz", "st moritz", "zermatt", "swiss"]],
  ["GVA", "Geneva Airport", "Geneva", "Switzerland", "CH", ["zermatt", "swiss"]],
  ["SMV", "Samedan Airport", "St. Moritz", "Switzerland", "CH", ["engadin"]],
  ["VIE", "Vienna International Airport", "Vienna", "Austria", "AT", ["wien"]],
  ["SZG", "Salzburg Airport", "Salzburg", "Austria", "AT"],
  ["PRG", "Václav Havel Airport Prague", "Prague", "Czech Republic", "CZ", ["praha", "czechia"]],
  ["BUD", "Budapest Ferenc Liszt International Airport", "Budapest", "Hungary", "HU"],
  ["CPH", "Copenhagen Airport", "Copenhagen", "Denmark", "DK"],
  ["ARN", "Stockholm Arlanda Airport", "Stockholm", "Sweden", "SE"],
  ["OSL", "Oslo Airport", "Oslo", "Norway", "NO"],
  ["HEL", "Helsinki Airport", "Helsinki", "Finland", "FI"],
  ["KEF", "Keflavík International Airport", "Reykjavik", "Iceland", "IS", ["keflavik"]],
  ["MAD", "Adolfo Suárez Madrid–Barajas Airport", "Madrid", "Spain", "ES", ["barajas"]],
  ["BCN", "Josep Tarradellas Barcelona–El Prat Airport", "Barcelona", "Spain", "ES", ["el prat"]],
  ["LIS", "Humberto Delgado Airport", "Lisbon", "Portugal", "PT", ["lisboa"]],
  ["OPO", "Francisco Sá Carneiro Airport", "Porto", "Portugal", "PT", ["oporto"]],
  ["FCO", "Leonardo da Vinci–Fiumicino Airport", "Rome", "Italy", "IT", ["roma", "fiumicino"]],
  ["MXP", "Milan Malpensa Airport", "Milan", "Italy", "IT", ["milano", "lake como", "como"]],
  ["LIN", "Milan Linate Airport", "Milan", "Italy", "IT", ["milano", "lake como", "como"]],
  ["BGY", "Milan Bergamo Airport", "Bergamo", "Italy", "IT", ["lake como", "orio al serio"]],
  ["VCE", "Venice Marco Polo Airport", "Venice", "Italy", "IT", ["venezia"]],
  ["FLR", "Florence Airport, Peretola", "Florence", "Italy", "IT", ["firenze", "tuscany"]],
  ["PSA", "Pisa International Airport", "Pisa", "Italy", "IT", ["florence", "tuscany"]],
  ["NAP", "Naples International Airport", "Naples", "Italy", "IT", ["napoli", "amalfi", "amalfi coast", "positano", "capri", "sorrento"]],
  ["ATH", "Athens International Airport", "Athens", "Greece", "GR"],
  ["JMK", "Mykonos Airport", "Mykonos", "Greece", "GR"],
  ["JTR", "Santorini (Thira) International Airport", "Santorini", "Greece", "GR", ["thira", "fira", "oia"]],
  ["DBV", "Dubrovnik Airport", "Dubrovnik", "Croatia", "HR"],
  // Africa
  ["CAI", "Cairo International Airport", "Cairo", "Egypt", "EG"],
  ["SPX", "Sphinx International Airport", "Giza", "Egypt", "EG", ["cairo", "pyramids"]],
  ["RAK", "Marrakesh Menara Airport", "Marrakech", "Morocco", "MA", ["marrakesh"]],
  ["CPT", "Cape Town International Airport", "Cape Town", "South Africa", "ZA"],
  ["JNB", "O. R. Tambo International Airport", "Johannesburg", "South Africa", "ZA"],
  ["NBO", "Jomo Kenyatta International Airport", "Nairobi", "Kenya", "KE", ["masai mara", "mara", "safari"]],
  ["ZNZ", "Abeid Amani Karume International Airport", "Zanzibar", "Tanzania", "TZ"],
  ["MRU", "Sir Seewoosagur Ramgoolam International Airport", "Mauritius", "Mauritius", "MU", ["port louis"]],
  ["SEZ", "Seychelles International Airport", "Mahé", "Seychelles", "SC", ["mahe", "seychelles", "victoria"]],
  // Asia
  ["SIN", "Singapore Changi Airport", "Singapore", "Singapore", "SG", ["changi"]],
  ["BKK", "Suvarnabhumi Airport", "Bangkok", "Thailand", "TH"],
  ["DMK", "Don Mueang International Airport", "Bangkok", "Thailand", "TH"],
  ["HKT", "Phuket International Airport", "Phuket", "Thailand", "TH"],
  ["KBV", "Krabi International Airport", "Krabi", "Thailand", "TH"],
  ["USM", "Samui International Airport", "Koh Samui", "Thailand", "TH", ["samui"]],
  ["KUL", "Kuala Lumpur International Airport", "Kuala Lumpur", "Malaysia", "MY", ["kl"]],
  ["LGK", "Langkawi International Airport", "Langkawi", "Malaysia", "MY"],
  ["DPS", "Ngurah Rai International Airport", "Bali", "Indonesia", "ID", ["denpasar", "ubud", "seminyak"]],
  ["CGK", "Soekarno–Hatta International Airport", "Jakarta", "Indonesia", "ID"],
  ["HAN", "Noi Bai International Airport", "Hanoi", "Vietnam", "VN", ["ha long", "halong"]],
  ["SGN", "Tan Son Nhat International Airport", "Ho Chi Minh City", "Vietnam", "VN", ["saigon"]],
  ["DAD", "Da Nang International Airport", "Da Nang", "Vietnam", "VN", ["hoi an"]],
  ["SAI", "Siem Reap–Angkor International Airport", "Siem Reap", "Cambodia", "KH", ["angkor wat", "angkor"]],
  ["HKG", "Hong Kong International Airport", "Hong Kong", "Hong Kong", "HK"],
  ["PVG", "Shanghai Pudong International Airport", "Shanghai", "China", "CN"],
  ["SHA", "Shanghai Hongqiao International Airport", "Shanghai", "China", "CN"],
  ["PEK", "Beijing Capital International Airport", "Beijing", "China", "CN", ["peking"]],
  ["TPE", "Taiwan Taoyuan International Airport", "Taipei", "Taiwan", "TW"],
  ["TSA", "Taipei Songshan Airport", "Taipei", "Taiwan", "TW"],
  ["ICN", "Incheon International Airport", "Seoul", "South Korea", "KR", ["korea"]],
  ["GMP", "Gimpo International Airport", "Seoul", "South Korea", "KR", ["korea"]],
  ["HND", "Tokyo Haneda Airport", "Tokyo", "Japan", "JP"],
  ["NRT", "Narita International Airport", "Tokyo", "Japan", "JP"],
  ["KIX", "Kansai International Airport", "Osaka", "Japan", "JP", ["kyoto"]],
  ["ITM", "Osaka Itami Airport", "Osaka", "Japan", "JP", ["kyoto"]],
  ["CMB", "Bandaranaike International Airport", "Colombo", "Sri Lanka", "LK", ["galle", "sri lanka"]],
  ["MLE", "Velana International Airport", "Malé", "Maldives", "MV", ["male", "maldives"]],
  ["KTM", "Tribhuvan International Airport", "Kathmandu", "Nepal", "NP", ["nepal"]],
  ["PBH", "Paro International Airport", "Paro", "Bhutan", "BT", ["thimphu", "bhutan"]],
  ["DAC", "Hazrat Shahjalal International Airport", "Dhaka", "Bangladesh", "BD"],
  // Americas
  ["JFK", "John F. Kennedy International Airport", "New York", "United States", "US", ["nyc", "manhattan"]],
  ["EWR", "Newark Liberty International Airport", "New York", "United States", "US", ["newark", "nyc"]],
  ["LGA", "LaGuardia Airport", "New York", "United States", "US", ["nyc"]],
  ["LAX", "Los Angeles International Airport", "Los Angeles", "United States", "US", ["la"]],
  ["SFO", "San Francisco International Airport", "San Francisco", "United States", "US"],
  ["LAS", "Harry Reid International Airport", "Las Vegas", "United States", "US", ["vegas"]],
  ["MIA", "Miami International Airport", "Miami", "United States", "US"],
  ["ORD", "O'Hare International Airport", "Chicago", "United States", "US"],
  ["IAD", "Washington Dulles International Airport", "Washington", "United States", "US", ["washington dc", "dc"]],
  ["BOS", "Logan International Airport", "Boston", "United States", "US"],
  ["SEA", "Seattle–Tacoma International Airport", "Seattle", "United States", "US"],
  ["ATL", "Hartsfield–Jackson Atlanta International Airport", "Atlanta", "United States", "US"],
  ["DFW", "Dallas Fort Worth International Airport", "Dallas", "United States", "US"],
  ["IAH", "George Bush Intercontinental Airport", "Houston", "United States", "US"],
  ["HNL", "Daniel K. Inouye International Airport", "Honolulu", "United States", "US", ["hawaii"]],
  ["YYZ", "Toronto Pearson International Airport", "Toronto", "Canada", "CA"],
  ["YVR", "Vancouver International Airport", "Vancouver", "Canada", "CA"],
  ["YUL", "Montréal–Trudeau International Airport", "Montreal", "Canada", "CA"],
  ["CUN", "Cancún International Airport", "Cancún", "Mexico", "MX", ["cancun", "tulum", "riviera maya"]],
  ["MEX", "Mexico City International Airport", "Mexico City", "Mexico", "MX"],
  ["NLU", "Felipe Ángeles International Airport", "Mexico City", "Mexico", "MX"],
  ["EZE", "Ministro Pistarini International Airport", "Buenos Aires", "Argentina", "AR", ["ezeiza"]],
  ["AEP", "Jorge Newbery Airfield", "Buenos Aires", "Argentina", "AR", ["aeroparque"]],
  ["LIM", "Jorge Chávez International Airport", "Lima", "Peru", "PE"],
  ["CUZ", "Alejandro Velasco Astete International Airport", "Cusco", "Peru", "PE", ["cuzco", "machu picchu"]],
  ["GIG", "Rio de Janeiro–Galeão International Airport", "Rio de Janeiro", "Brazil", "BR", ["rio"]],
  ["GRU", "São Paulo/Guarulhos International Airport", "São Paulo", "Brazil", "BR", ["sao paulo"]],
  // Oceania
  ["SYD", "Sydney Kingsford Smith Airport", "Sydney", "Australia", "AU"],
  ["MEL", "Melbourne Airport", "Melbourne", "Australia", "AU"],
  ["BNE", "Brisbane Airport", "Brisbane", "Australia", "AU"],
  ["PER", "Perth Airport", "Perth", "Australia", "AU"],
  ["AKL", "Auckland Airport", "Auckland", "New Zealand", "NZ"],
  ["ZQN", "Queenstown Airport", "Queenstown", "New Zealand", "NZ"],
];

export const AIRPORTS: Airport[] = ROWS.map(([airport_code, airport_name, city, country, country_code, aliases]) => ({
  airport_code,
  airport_name,
  city,
  country,
  country_code,
  aliases: aliases || [],
}));

// Accents and punctuation folded so "cancun", "sao paulo" and "st moritz"
// match "Cancún", "São Paulo" and "St. Moritz".
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX = AIRPORTS.map((a, order) => ({
  a,
  order,
  code: a.airport_code.toLowerCase(),
  city: fold(a.city),
  name: fold(a.airport_name),
  country: fold(a.country),
  aliases: (a.aliases || []).map(fold),
}));

// Best matches first: exact code, then city/alias starting with the query,
// then a word in the city/alias/airport name starting with it, then the
// country, then anything containing it. Ties keep the list's order, which
// puts each city's main airport first (DXB before DWC, LHR before LCY).
export function searchAirports(query: string, limit = 8): Airport[] {
  const q = fold(query);
  if (!q) return [];
  const scored: { a: Airport; score: number; order: number }[] = [];
  for (const e of INDEX) {
    const words = [e.city, e.name, ...e.aliases].join(" ").split(" ");
    let score = 0;
    if (e.code === q) score = 100;
    else if (e.city === q || e.aliases.includes(q)) score = 90;
    else if (e.city.startsWith(q) || e.aliases.some((x) => x.startsWith(q))) score = 80;
    else if (q.length >= 2 && e.code.startsWith(q)) score = 70;
    else if (words.some((w) => w.startsWith(q))) score = 60;
    else if (e.country.startsWith(q)) score = 50;
    else if (q.length >= 3 && (e.city.includes(q) || e.name.includes(q) || e.aliases.some((x) => x.includes(q)))) score = 40;
    if (score) scored.push({ a: e.a, score, order: e.order });
  }
  return scored
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .slice(0, limit)
    .map((x) => x.a);
}
