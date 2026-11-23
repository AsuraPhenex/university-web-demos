/** Keep demo screenings available in Ulaanbaatar time, even after the original seed week. */
export const DEMO_TITLES = ['Хотын нууц', 'Оддын мөр', 'Инээмсэглэл'];
export function upcomingDemoScreenings(demoMovies, now = new Date(), days = 7) {
  const localToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const base = new Date(`${localToday}T00:00:00+08:00`);
  const results = [];
  for (const movie of demoMovies) {
    const index = DEMO_TITLES.indexOf(movie.title);
    if (index < 0) continue;
    for (let day = 0; day < days; day++) {
      for (const hour of [14, 18, 20]) {
        const startsAt = new Date(base.getTime() + day * 86400000 + hour * 3600000);
        if (startsAt <= now) continue;
        results.push({ movieId: movie._id, hall: `Танхим ${index + 1}`, startsAt, price: index === 2 ? 12000 : 15000 });
      }
    }
  }
  return results;
}
