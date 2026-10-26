// Loughborough University Careers Network: public information from lboro.ac.uk, last checked
// 26 October 2026. Bookings happen on the university's own system (Target Connect).

export const LBORO_CHECKED = "26 October 2026";

const TC = "https://lboro.targetconnect.net";

export type LboroEvent = { title: string; series: string; start: string; end: string; where: string; url: string };

export const EVENTS: LboroEvent[] = [
  { title: "Finding a graduate job", series: "Finalist Futures", start: "2026-10-27T12:00", end: "13:00", where: "Online", url: `${TC}/leap/event.html?id=14751&service=Careers+Network` },
  { title: "How to impress at interviews", series: "Get Hired", start: "2026-10-29T13:00", end: "15:00", where: "B 0.07", url: `${TC}/leap/event.html?id=14763&service=Careers+Network` },
  { title: "How to tackle online tests", series: "Get Hired", start: "2026-11-11T13:00", end: "15:00", where: "SMB 1.09", url: `${TC}/leap/event.html?id=14771&service=Careers+Network` },
  { title: "How to become an entrepreneur", series: "Get Hired", start: "2026-11-12T13:00", end: "14:00", where: "Online", url: `${TC}/leap/event.html?id=14769&service=Careers+Network` },
  { title: "How to build professional connections", series: "Get Hired", start: "2026-11-18T13:00", end: "14:00", where: "WAV 0.37", url: `${TC}/leap/event.html?id=14773&service=Careers+Network` },
];

// Events that haven't started yet, soonest first.
export function upcomingEvents(): LboroEvent[] {
  const now = Date.now();
  return EVENTS.filter((e) => new Date(e.start).getTime() > now).sort((a, b) => a.start.localeCompare(b.start));
}

export const SUPPORT = [
  { title: "Careers Hub drop-in", detail: "Any careers question, no booking. Weekdays 11am–3pm in term time, EHB 2.03.", url: "https://www.lboro.ac.uk/services/student-services/topics/finalist-futures/", cta: "Details" },
  { title: "CV and application check", detail: "20-minute Careers and Enterprise Advice appointment: CV, cover letter, application form or interview prep. Teams, phone or in person.", url: `${TC}/unauth`, cta: "Book" },
  { title: "Careers coaching", detail: "30-minute in-depth session with a Careers Coach. You don't need a career in mind.", url: "https://www.lboro.ac.uk/services/careers/students-and-graduates/book-appointment/", cta: "Book" },
  { title: "Interview coaching", detail: "30-minute practice interview with a Careers Coach. Phone 01509 222765.", url: "https://www.lboro.ac.uk/services/careers/students-and-graduates/book-appointment/", cta: "Book" },
];

export const FAIRS = [
  { title: "Autumn Futures Fair", detail: "Hundreds of employers, Sir David Wallace Sports Hall. Held 12–13 October 2026; the next fair is advertised on Target Connect.", url: "https://www.lboro.ac.uk/students/careers-fest/the-headline-event/" },
  { title: "Futures Festival", detail: "Graduate, internship and placement events in the first weeks of each semester.", url: "https://www.lboro.ac.uk/students/careers-fest/event-lineup/" },
  { title: "Employer events on campus", detail: "Presentations, pop-ups, insight events and skills training, listed on Target Connect.", url: `${TC}/student/events.html` },
];

export const TOOLS = [
  { title: "Target Connect", detail: "Loughborough's vacancy board, event bookings and appointments.", url: `${TC}/unauth` },
  { title: "Finalist Futures", detail: "Everything for final-year students in one place, plus newsletters from your careers coach.", url: "https://www.lboro.ac.uk/services/student-services/topics/finalist-futures/" },
  { title: "Make applications", detail: "Guides to applications, online tests and assessment centres, including a mock assessment centre.", url: "https://www.lboro.ac.uk/services/student-services/topics/make-applications/" },
];
