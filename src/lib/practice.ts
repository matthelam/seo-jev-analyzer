// Practice texts for the question check. Each has an obvious answer: its target term must rank first
// and its intent fit must reach 0.75. They test the question wording, which is fixed in the app.

const TERMS = [
  "kids' climbing", "public car park", "monthly membership", "opening hours", "gift vouchers",
  "café menu", "yoga classes", "equipment hire", "birthday parties", "private lessons",
];

export const PRACTICE = [
  {
    name: "kids' classes", target: "kids' climbing", terms: TERMS,
    intent: "Are there kids' climbing classes, and what do they cost?",
    meta: { title: "Kids' climbing classes | Example Gym", description: "Weekly kids' climbing classes for ages 5 to 14. $25 a session.", ogTitle: "", ogDescription: "", jsonLd: [] },
    body: "Kids' climbing classes\nOur kids' climbing classes run every Tuesday at 4pm and Saturday at 9am for children aged 5 to 14.\nEach kids' climbing session lasts 60 minutes, is led by an accredited coach, and costs $25, or $200 for a 10-week term.\nShoe hire is included in every kids' climbing class.",
  },
  {
    name: "parking", target: "public car park", terms: TERMS,
    intent: "Where can I park when I visit the gym?",
    meta: { title: "Parking near the gym | Example Gym", description: "Park in the public car park 200 metres away; street parking is free after 6pm.", ogTitle: "", ogDescription: "", jsonLd: [] },
    body: "Parking\nThere is no on-site parking. The nearest public car park is 200 metres away on the next street and is open 24 hours.\nThe public car park charges $3 an hour. On-street parking is free after 6pm and on Sundays. Visit the gym from the public car park in two minutes on foot.",
  },
  {
    name: "membership", target: "monthly membership", terms: TERMS,
    intent: "How much is a monthly climbing membership?",
    meta: { title: "Monthly membership $89 | Example Gym", description: "Unlimited climbing for $89 a month. Cancel with 30 days' notice.", ogTitle: "", ogDescription: "", jsonLd: [] },
    body: "Monthly membership\nA monthly membership costs $89 a month and gives you unlimited climbing whenever we are open.\nThe monthly membership includes two guest passes a month and 10% off classes.\nCancel your monthly membership at any time with 30 days' notice.",
  },
];
