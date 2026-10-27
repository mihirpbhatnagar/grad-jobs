// Seed list of big UK graduate employers to watch directly (checked daily). The watch list
// also grows on its own from the apply links of roles found on Reed and Google Jobs.
// Sports-industry employers are included because they matter to our users.
export const GRAD_EMPLOYERS: string[] = [
  // Professional services, consulting, law
  "Deloitte", "PwC", "EY", "KPMG", "BDO", "Grant Thornton", "Forvis Mazars", "RSM", "Crowe", "Moore Kingston Smith",
  "Accenture", "Capgemini", "IBM", "Kearney", "Oliver Wyman", "McKinsey", "Boston Consulting Group", "Bain & Company", "Alvarez & Marsal", "FTI Consulting",
  "Baringa", "Simon-Kucher", "L.E.K. Consulting", "Newton Europe", "Cognizant", "Infosys", "Tata Consultancy Services", "Wipro", "CGI", "Sopra Steria",
  "Clifford Chance", "Linklaters", "A&O Shearman", "Freshfields", "Slaughter and May", "Herbert Smith Freehills", "DLA Piper", "Baker McKenzie", "Hogan Lovells", "Norton Rose Fulbright",
  "Pinsent Masons", "Eversheds Sutherland", "CMS", "Addleshaw Goddard", "Irwin Mitchell", "Shoosmiths", "TLT", "Osborne Clarke", "Browne Jacobson", "Gowling WLG",
  // Banking, insurance, finance
  "Barclays", "HSBC", "Lloyds Banking Group", "NatWest Group", "Santander", "Nationwide", "Standard Chartered", "Goldman Sachs", "J.P. Morgan", "Morgan Stanley",
  "Citi", "Bank of America", "Deutsche Bank", "UBS", "BNP Paribas", "Société Générale", "Nomura", "Jefferies", "Lazard", "Rothschild & Co",
  "Bank of England", "Financial Conduct Authority", "BlackRock", "Schroders", "abrdn", "M&G", "Legal & General", "Aviva", "Phoenix Group", "Prudential",
  "Aon", "Marsh McLennan", "WTW", "Gallagher", "Zurich", "AXA", "Allianz", "Lloyd's of London", "Hiscox", "Beazley",
  "Experian", "Equifax", "London Stock Exchange Group", "Moody's", "S&P Global", "Fitch Ratings", "Revolut", "Monzo", "Starling Bank", "Wise",
  "Checkout.com", "Klarna", "American Express", "Mastercard", "Visa", "PayPal", "Worldpay", "Coutts", "Investec", "Close Brothers",
  // Tech and telecoms
  "Google", "Microsoft", "Amazon", "Apple", "Meta", "Bloomberg", "Arm", "Sage", "Ocado", "Sky",
  "BT", "Vodafone", "Virgin Media O2", "Three UK", "Cisco", "Oracle", "Salesforce", "SAP", "Dell Technologies", "Hewlett Packard Enterprise",
  "TPP", "Softcat", "Kainos", "BAE Systems Digital Intelligence", "Thought Machine", "Palantir", "Snowflake", "Atlassian", "Spotify", "Deliveroo",
  "Just Eat Takeaway", "Rightmove", "Auto Trader", "Trainline", "Skyscanner", "Booking.com", "Expedia", "Uber", "Bumble", "Wayve",
  // Engineering, defence, energy, infrastructure
  "BAE Systems", "Rolls-Royce", "Airbus", "Leonardo", "MBDA", "Thales", "QinetiQ", "Babcock International", "Raytheon UK", "Lockheed Martin",
  "BP", "Shell", "Centrica", "National Grid", "SSE", "EDF", "Octopus Energy", "ScottishPower", "E.ON", "Ofgem",
  "Arup", "Atkins", "AtkinsRéalis", "Jacobs", "AECOM", "WSP", "Mott MacDonald", "Arcadis", "Stantec", "Ramboll",
  "Balfour Beatty", "Kier", "Laing O'Rourke", "Mace", "Skanska", "Costain", "Morgan Sindall", "Wates", "BAM", "Willmott Dixon",
  "Network Rail", "Transport for London", "HS2", "Siemens", "GE Vernova", "Jaguar Land Rover", "Nissan", "Toyota", "JCB", "Dyson",
  "Severn Trent", "Anglian Water", "Thames Water", "United Utilities", "Yorkshire Water", "Cadent", "UK Power Networks", "Sellafield", "EDF Energy", "Urenco",
  // Consumer, retail, FMCG
  "Unilever", "Procter & Gamble", "Nestlé", "Mars", "Mondelez International", "PepsiCo", "Coca-Cola Europacific Partners", "Diageo", "Heineken", "AB InBev",
  "Reckitt", "Haleon", "L'Oréal", "Kraft Heinz", "Britvic", "Associated British Foods", "Kellanova", "Danone", "Premier Foods", "Bacardi",
  "Tesco", "Sainsbury's", "Asda", "Morrisons", "Aldi", "Lidl", "Waitrose", "John Lewis Partnership", "Marks & Spencer", "Boots",
  "Next", "Primark", "Kingfisher", "B&Q", "Currys", "Superdrug", "Holland & Barrett", "Ocado Retail", "Co-op", "Whitbread",
  "Burberry", "LVMH", "Kering", "Arcadia", "ASOS", "Boohoo", "THG", "Pets at Home", "Greggs", "Mitchells & Butlers",
  // Pharma and healthcare
  "AstraZeneca", "GSK", "Pfizer", "Novartis", "Roche", "Sanofi", "Johnson & Johnson", "Bupa", "NHS England", "Medtronic",
  // Media, marketing, advertising
  "BBC", "ITV", "Channel 4", "WPP", "Publicis Groupe", "Omnicom", "Dentsu", "Havas", "Ogilvy", "Saatchi & Saatchi",
  "Reach plc", "The Financial Times", "The Economist Group", "Pearson", "RELX", "Informa", "Netflix", "Warner Bros. Discovery", "Paramount", "Universal Music Group",
  // Public sector and other schemes
  "Civil Service Fast Stream", "Teach First", "Frontline", "Police Now", "Think Ahead", "Ministry of Defence", "HMRC", "Office for National Statistics", "Local Government Association", "National Audit Office",
  // Sport, fitness, leisure and gaming
  "Nike", "adidas", "PUMA", "Under Armour", "New Balance", "JD Sports", "Frasers Group", "Gymshark", "Decathlon", "Sports Direct",
  "Premier League", "The Football Association", "English Football League", "England and Wales Cricket Board", "Rugby Football Union", "Lawn Tennis Association", "UK Sport", "Sport England", "City Football Group", "Manchester United",
  "Arsenal", "Chelsea FC", "Liverpool FC", "Tottenham Hotspur", "Wembley Stadium", "IMG", "Wasserman", "Octagon", "Two Circles", "Sportradar",
  "Genius Sports", "DAZN", "TNT Sports", "Flutter", "Entain", "bet365", "Sky Betting & Gaming", "William Hill", "Hawk-Eye", "Formula 1",
  "Mercedes-AMG Petronas F1", "McLaren", "Williams Racing", "Red Bull", "Nuffield Health", "David Lloyd Leisure", "PureGym", "The Gym Group", "Everyone Active", "Merlin Entertainments",
  // Travel, hospitality, logistics
  "British Airways", "easyJet", "Jet2", "Virgin Atlantic", "TUI", "Heathrow", "Manchester Airports Group", "IHG", "Hilton", "Marriott",
  "Compass Group", "Sodexo", "DHL", "Royal Mail", "DPD", "Maersk", "Kuehne+Nagel", "Wincanton", "GXO", "Unipart",
];
